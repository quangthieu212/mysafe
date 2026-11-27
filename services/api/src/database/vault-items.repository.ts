import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { executeIdempotently, hashCanonicalJson } from './idempotency.js';
import { PgTransactions } from './pg-transactions.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;

export interface ItemWrite {
  id?: string;
  schemaVersion: number;
  aadVersion: number;
  keyVersion: number;
  wrappedItemKey: string;
  nonce: string;
  ciphertext: string;
}

export interface VaultItemEnvelope {
  id: string;
  vaultId: string;
  revision: number;
  changeSeq: number;
  schemaVersion: number;
  aadVersion: number;
  keyVersion: number;
  wrappedItemKey: string;
  nonce: string;
  ciphertext: string;
  deletedAt: string | null;
  updatedAt: string;
}

export class InvalidItemEnvelopeError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidItemEnvelopeError';
  }
}

export class VaultNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super('Vault not found');
    this.name = 'VaultNotFoundError';
  }
}

@Injectable()
export class VaultItemsRepository {
  constructor(private readonly transactions: PgTransactions) {}

  async create(
    userId: string,
    vaultId: string,
    input: ItemWrite,
    idempotencyKey: string,
  ): Promise<{ status: number; item: VaultItemEnvelope; replayed: boolean }> {
    if (!UUID_PATTERN.test(vaultId)) throw new InvalidItemEnvelopeError('vaultId must be a UUID');
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new InvalidItemEnvelopeError('Idempotency-Key must contain 16 to 128 URL-safe characters');
    }

    const item = validateItemWrite(input);
    const requestHash = hashCanonicalJson({ vaultId, item });

    return this.transactions.withUser(userId, async (client) => {
      const result = await executeIdempotently({
        client,
        userId,
        operationId: 'createItem',
        key: idempotencyKey,
        requestHash,
        effect: async () => {
          const vault = await client.query(
            `SELECT id FROM ksv.vaults
              WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
            [vaultId, userId],
          );
          if (vault.rowCount !== 1) throw new VaultNotFoundError();

          const itemId = item.id ?? randomUUID();
          const inserted = await client.query<DatabaseItem>(
            `INSERT INTO ksv.vault_items
               (id, vault_id, user_id, schema_version, aad_version, key_version,
                wrapped_item_key, nonce, ciphertext)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING ${ITEM_COLUMNS}`,
            [
              itemId,
              vaultId,
              userId,
              item.schemaVersion,
              item.aadVersion,
              item.keyVersion,
              decodeBase64Url(item.wrappedItemKey),
              decodeBase64Url(item.nonce),
              decodeBase64Url(item.ciphertext),
            ],
          );
          const row = inserted.rows[0];
          if (!row) throw new Error('Inserted item was not returned');

          return {
            status: 201,
            responseRef: { itemId },
            value: toEnvelope(row),
          };
        },
        replay: async (_status, responseRef) => {
          const itemId = responseRef.itemId;
          if (typeof itemId !== 'string' || !UUID_PATTERN.test(itemId)) {
            throw new Error('Stored idempotency reference is invalid');
          }
          const existing = await client.query<DatabaseItem>(
            `SELECT ${ITEM_COLUMNS} FROM ksv.vault_items
              WHERE id = $1 AND vault_id = $2 AND user_id = $3`,
            [itemId, vaultId, userId],
          );
          const row = existing.rows[0];
          if (!row) throw new VaultNotFoundError();
          return toEnvelope(row);
        },
      });

      return { status: result.status, item: result.value, replayed: result.replayed };
    });
  }
}

interface DatabaseItem {
  id: string;
  vault_id: string;
  revision: string;
  change_seq: string;
  schema_version: number;
  aad_version: number;
  key_version: number;
  wrapped_item_key: Buffer;
  nonce: Buffer;
  ciphertext: Buffer;
  deleted_at: Date | null;
  updated_at: Date;
}

const ITEM_COLUMNS = `id::text, vault_id::text, revision::text, change_seq::text,
  schema_version, aad_version, key_version, wrapped_item_key, nonce, ciphertext,
  deleted_at, updated_at`;

function validateItemWrite(input: ItemWrite): ItemWrite {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidItemEnvelopeError('Item body must be an object');
  }

  const allowed = new Set([
    'id',
    'schemaVersion',
    'aadVersion',
    'keyVersion',
    'wrappedItemKey',
    'nonce',
    'ciphertext',
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new InvalidItemEnvelopeError('Item body contains an unsupported field');
  }

  if (input.id !== undefined && !UUID_V4_PATTERN.test(input.id)) {
    throw new InvalidItemEnvelopeError('id must be a UUIDv4');
  }
  for (const [name, value] of Object.entries({
    schemaVersion: input.schemaVersion,
    aadVersion: input.aadVersion,
    keyVersion: input.keyVersion,
  })) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new InvalidItemEnvelopeError(`${name} must be a positive integer`);
    }
  }

  const wrappedKey = decodeBase64Url(input.wrappedItemKey);
  const nonce = decodeBase64Url(input.nonce);
  const ciphertext = decodeBase64Url(input.ciphertext);
  if (wrappedKey.byteLength !== 72) throw new InvalidItemEnvelopeError('wrappedItemKey must decode to 72 bytes');
  if (nonce.byteLength !== 24) throw new InvalidItemEnvelopeError('nonce must decode to 24 bytes');
  if (ciphertext.byteLength < 17 || ciphertext.byteLength > 262_160) {
    throw new InvalidItemEnvelopeError('ciphertext must decode to 17 through 262160 bytes');
  }

  return { ...input };
}

function decodeBase64Url(value: string): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new InvalidItemEnvelopeError('Encrypted fields must be unpadded base64url');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new InvalidItemEnvelopeError('Encrypted fields must use canonical base64url');
  }
  return decoded;
}

function toEnvelope(row: DatabaseItem): VaultItemEnvelope {
  return {
    id: row.id,
    vaultId: row.vault_id,
    revision: Number(row.revision),
    changeSeq: Number(row.change_seq),
    schemaVersion: row.schema_version,
    aadVersion: row.aad_version,
    keyVersion: row.key_version,
    wrappedItemKey: row.wrapped_item_key.toString('base64url'),
    nonce: row.nonce.toString('base64url'),
    ciphertext: row.ciphertext.toString('base64url'),
    deletedAt: row.deleted_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
  };
}
