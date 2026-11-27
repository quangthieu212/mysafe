import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { IdempotencyKeyReuseError } from '../src/database/idempotency.js';
import { PgTransactions } from '../src/database/pg-transactions.js';
import { VaultItemsRepository } from '../src/database/vault-items.repository.js';

const connectionString = process.env.TEST_DATABASE_URL;

test(
  'PostgreSQL applies tenant RLS and replays idempotent encrypted item writes',
  { skip: !connectionString && 'TEST_DATABASE_URL is required' },
  async () => {
    const adminPool = new Pool({ connectionString });
    const appPool = new Pool({ connectionString });
    const transactions = new PgTransactions(appPool);
    const items = new VaultItemsRepository(transactions);
    const userA = randomUUID();
    const userB = randomUUID();
    const vaultA = randomUUID();
    const vaultB = randomUUID();

    try {
      await adminPool.query('INSERT INTO ksv.users (id) VALUES ($1), ($2)', [userA, userB]);
      await adminPool.query(
        `INSERT INTO ksv.vaults (id, user_id, wrapped_vault_key)
         VALUES ($1, $2, $3), ($4, $5, $6)`,
        [vaultA, userA, Buffer.alloc(72), vaultB, userB, Buffer.alloc(72)],
      );

      const visibleToA = await transactions.withUser(userA, async (client) => {
        const result = await client.query<{ id: string }>(
          'SELECT id::text AS id FROM ksv.vaults ORDER BY id',
        );
        return result.rows.map((row) => row.id);
      });
      assert.deepEqual(visibleToA, [vaultA]);

      const unscopedClient = await appPool.connect();
      try {
        await unscopedClient.query('BEGIN');
        await unscopedClient.query('SET LOCAL ROLE ksv_app');
        const unscoped = await unscopedClient.query('SELECT id FROM ksv.vaults');
        assert.equal(unscoped.rowCount, 0, 'missing app.user_id must fail closed');
        await unscopedClient.query('COMMIT');
      } finally {
        unscopedClient.release();
      }

      await assert.rejects(
        transactions.withUser(userA, async (client) => {
          await client.query(
            'INSERT INTO ksv.vaults (id, user_id, wrapped_vault_key) VALUES ($1, $2, $3)',
            [randomUUID(), userB, Buffer.alloc(72)],
          );
        }),
        (error: unknown) =>
          typeof error === 'object' && error !== null && 'code' in error && error.code === '42501',
      );

      const input = {
        id: randomUUID(),
        schemaVersion: 1,
        aadVersion: 1,
        keyVersion: 1,
        wrappedItemKey: Buffer.alloc(72, 1).toString('base64url'),
        nonce: Buffer.alloc(24, 2).toString('base64url'),
        ciphertext: Buffer.alloc(17, 3).toString('base64url'),
      };
      const key = 'integration-test-key-0001';
      const [first, concurrentRetry] = await Promise.all([
        items.create(userA, vaultA, input, key),
        items.create(userA, vaultA, input, key),
      ]);
      assert.equal([first, concurrentRetry].filter((result) => !result.replayed).length, 1);
      assert.equal(first.item.id, concurrentRetry.item.id);
      assert.equal(first.item.revision, 1);

      await assert.rejects(
        items.create(userA, vaultA, { ...input, ciphertext: Buffer.alloc(18, 4).toString('base64url') }, key),
        IdempotencyKeyReuseError,
      );

      const itemB = await items.create(
        userB,
        vaultB,
        { ...input, id: randomUUID() },
        key,
      );
      assert.equal(itemB.replayed, false, 'idempotency keys are scoped to each user');

      const itemIdsVisibleToA = await transactions.withUser(userA, async (client) => {
        const result = await client.query<{ id: string }>(
          'SELECT id::text AS id FROM ksv.vault_items ORDER BY id',
        );
        return result.rows.map((row) => row.id);
      });
      assert.deepEqual(itemIdsVisibleToA, [first.item.id]);

      const idempotencyKeysVisibleToA = await transactions.withUser(userA, async (client) => {
        const result = await client.query<{ key: string }>(
          `SELECT key FROM ksv.idempotency_keys
            WHERE operation_id = 'createItem' ORDER BY key`,
        );
        return result.rows.map((row) => row.key);
      });
      assert.deepEqual(idempotencyKeysVisibleToA, [key]);
    } finally {
      await adminPool.query('DELETE FROM ksv.users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
      await Promise.all([adminPool.end(), appPool.end()]);
    }
  },
);
