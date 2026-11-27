import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  throw new Error('MIGRATION_DATABASE_URL is required; DATABASE_URL is not used for migrations');
}

const migrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
  .sort();

const client = new Client({
  connectionString,
  application_name: 'ksv-api-migrations',
  connectionTimeoutMillis: 5_000,
});

await client.connect();
try {
  await client.query('CREATE SCHEMA IF NOT EXISTS ksv');
  await client.query(`
    CREATE TABLE IF NOT EXISTS ksv.schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const file of migrationFiles) {
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock(1347635011, 1)');
      const alreadyApplied = await client.query(
        'SELECT 1 FROM ksv.schema_migrations WHERE name = $1',
        [file],
      );
      if (alreadyApplied.rowCount === 0) {
        const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO ksv.schema_migrations (name) VALUES ($1)', [file]);
        console.info(`Applied migration ${file}`);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
