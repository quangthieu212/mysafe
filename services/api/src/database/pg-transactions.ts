import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import { PG_POOL } from './database.tokens.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PgTransactions implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async withUser<T>(userId: string, callback: (client: PoolClient) => Promise<T>): Promise<T> {
    // Callers must pass the user id from verified server-side auth context,
    // never from a request body, query parameter, or unverified header.
    if (!UUID_PATTERN.test(userId)) {
      throw new TypeError('Authenticated user id must be a UUID');
    }

    const client = await this.pool.connect();
    let transactionStarted = false;
    let released = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      await client.query('SET LOCAL ROLE ksv_app');
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);

      const result = await callback(client);
      await client.query('COMMIT');
      transactionStarted = false;
      return result;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Keep the original query error; the pool will discard a broken client.
          client.release(true);
          released = true;
          throw error;
        }
      }
      throw error;
    } finally {
      if (!released) client.release();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
