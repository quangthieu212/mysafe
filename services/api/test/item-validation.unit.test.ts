import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { InvalidItemEnvelopeError, VaultItemsRepository } from '../src/database/vault-items.repository.js';
import type { PgTransactions } from '../src/database/pg-transactions.js';

const repository = new VaultItemsRepository({} as PgTransactions);
const validItem = {
  id: randomUUID(),
  schemaVersion: 1,
  aadVersion: 1,
  keyVersion: 1,
  wrappedItemKey: Buffer.alloc(72, 1).toString('base64url'),
  nonce: Buffer.alloc(24, 2).toString('base64url'),
  ciphertext: Buffer.alloc(17, 3).toString('base64url'),
};

test('item envelope validation rejects malformed key and nonce lengths before database access', async () => {
  await assert.rejects(
    repository.create(randomUUID(), randomUUID(), { ...validItem, wrappedItemKey: 'short' }, 'stable-key-000001'),
    InvalidItemEnvelopeError,
  );
  await assert.rejects(
    repository.create(randomUUID(), randomUUID(), { ...validItem, nonce: 'not+base64' }, 'stable-key-000001'),
    InvalidItemEnvelopeError,
  );
});

test('item writes reject weak version numbers and unsupported fields', async () => {
  await assert.rejects(
    repository.create(randomUUID(), randomUUID(), { ...validItem, keyVersion: 0 }, 'stable-key-000001'),
    InvalidItemEnvelopeError,
  );
  await assert.rejects(
    repository.create(randomUUID(), randomUUID(), { ...validItem, plaintext: 'not allowed' } as never, 'stable-key-000001'),
    InvalidItemEnvelopeError,
  );
});
