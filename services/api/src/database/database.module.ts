import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

import { PG_POOL } from './database.tokens.js';
import { PgTransactions } from './pg-transactions.js';
import { VaultItemsRepository } from './vault-items.repository.js';

export { PG_POOL } from './database.tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error('DATABASE_URL is required');
        }

        return new Pool({
          connectionString,
          max: 10,
          connectionTimeoutMillis: 3_000,
          idleTimeoutMillis: 30_000,
          application_name: 'ksv-api-v2',
        });
      },
    },
    PgTransactions,
    VaultItemsRepository,
  ],
  exports: [PG_POOL, PgTransactions, VaultItemsRepository],
})
export class DatabaseModule {}
