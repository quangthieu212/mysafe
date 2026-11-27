import { createHash } from 'node:crypto';

import type { PoolClient } from 'pg';

export interface IdempotentResult<T> {
  status: number;
  responseRef: Record<string, unknown>;
  value: T;
  replayed: boolean;
}

export class IdempotencyKeyReuseError extends Error {
  readonly status = 422;

  constructor() {
    super('Idempotency-Key was already used with a different request');
    this.name = 'IdempotencyKeyReuseError';
  }
}

export class IdempotencyInProgressError extends Error {
  readonly status = 409;

  constructor() {
    super('A request with this Idempotency-Key is still in progress');
    this.name = 'IdempotencyInProgressError';
  }
}

export function hashCanonicalJson(value: unknown): Buffer {
  return createHash('sha256').update(canonicalize(value)).digest();
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new TypeError('Request body must be JSON serializable');
    }
    return encoded;
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`).join(',')}}`;
}

export async function executeIdempotently<T>(input: {
  client: PoolClient;
  userId: string;
  operationId: string;
  key: string;
  requestHash: Buffer;
  effect: () => Promise<{ status: number; responseRef: Record<string, unknown>; value: T }>;
  replay: (status: number, responseRef: Record<string, unknown>) => Promise<T>;
}): Promise<IdempotentResult<T>> {
  const claim = await input.client.query(
    `INSERT INTO ksv.idempotency_keys
       (user_id, operation_id, key, request_hash, state)
     VALUES ($1, $2, $3, $4, 'in_progress')
     ON CONFLICT (user_id, operation_id, key) DO NOTHING
     RETURNING user_id`,
    [input.userId, input.operationId, input.key, input.requestHash],
  );

  if (claim.rowCount === 0) {
    const existing = await input.client.query<{
      request_hash: Buffer;
      state: 'in_progress' | 'completed';
      response_status: number | null;
      response_ref: Record<string, unknown> | null;
    }>(
      `SELECT request_hash, state, response_status, response_ref
         FROM ksv.idempotency_keys
        WHERE user_id = $1 AND operation_id = $2 AND key = $3
        FOR UPDATE`,
      [input.userId, input.operationId, input.key],
    );
    const row = existing.rows[0];
    if (!row) throw new Error('Idempotency record disappeared inside transaction');
    if (!row.request_hash.equals(input.requestHash)) throw new IdempotencyKeyReuseError();
    if (row.state !== 'completed' || row.response_status === null || row.response_ref === null) {
      throw new IdempotencyInProgressError();
    }

    return {
      status: row.response_status,
      responseRef: row.response_ref,
      value: await input.replay(row.response_status, row.response_ref),
      replayed: true,
    };
  }

  const result = await input.effect();
  await input.client.query(
    `UPDATE ksv.idempotency_keys
        SET state = 'completed', response_status = $4, response_ref = $5
      WHERE user_id = $1 AND operation_id = $2 AND key = $3`,
    [input.userId, input.operationId, input.key, result.status, result.responseRef],
  );

  return { ...result, replayed: false };
}
