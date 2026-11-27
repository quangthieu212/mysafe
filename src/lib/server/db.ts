import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const file = resolve(process.env.KSV_DATA_DIR ?? './data', 'ket-sat-viet.sqlite');
const globalDb = globalThis as typeof globalThis & { __ksvDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (globalDb.__ksvDb) return globalDb.__ksvDb;
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      login_salt TEXT NOT NULL,
      login_hash TEXT NOT NULL,
      descriptor_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vault_snapshots (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      operation_id TEXT NOT NULL,
      envelope_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, revision),
      UNIQUE(user_id, operation_id)
    );
    CREATE TABLE IF NOT EXISTS vault_operations (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL,
      envelope_hash TEXT NOT NULL,
      revision INTEGER NOT NULL,
      PRIMARY KEY(user_id, operation_id)
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket TEXT NOT NULL,
      attempted_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_rate_limits_bucket_time ON rate_limits(bucket, attempted_at);
  `);
  const sessionColumns = new Set((db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map(column => column.name));
  if (!sessionColumns.has('session_id')) db.exec('ALTER TABLE sessions ADD COLUMN session_id TEXT');
  if (!sessionColumns.has('created_at')) db.exec('ALTER TABLE sessions ADD COLUMN created_at TEXT');
  const legacySessions = db.prepare('SELECT rowid, expires_at AS expiresAt FROM sessions WHERE session_id IS NULL OR created_at IS NULL').all() as Array<{ rowid: number; expiresAt: number }>;
  const updateLegacySession = db.prepare('UPDATE sessions SET session_id = COALESCE(session_id, ?), created_at = COALESCE(created_at, ?) WHERE rowid = ?');
  for (const session of legacySessions) {
    updateLegacySession.run(randomUUID(), new Date(session.expiresAt - 14 * 24 * 60 * 60 * 1000).toISOString(), session.rowid);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_session_id ON sessions(session_id)');
  const legacySnapshots = db.prepare('SELECT user_id AS userId, operation_id AS operationId, envelope_json AS envelope, revision FROM vault_snapshots').all() as Array<{ userId: string; operationId: string; envelope: string; revision: number }>;
  const recordOperation = db.prepare('INSERT OR IGNORE INTO vault_operations(user_id,operation_id,envelope_hash,revision) VALUES(?,?,?,?)');
  for (const row of legacySnapshots) {
    recordOperation.run(row.userId, row.operationId, createHash('sha256').update(row.envelope).digest('hex'), row.revision);
  }
  globalDb.__ksvDb = db;
  return db;
}

export function pruneSnapshotHistory(userId: string, maxRevisions: number): void {
  getDb().prepare(`DELETE FROM vault_snapshots
    WHERE user_id = ? AND revision NOT IN (
      SELECT revision FROM vault_snapshots WHERE user_id = ? ORDER BY revision DESC LIMIT ?
    )`).run(userId, userId, maxRevisions);
}
