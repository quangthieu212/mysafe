import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CipherEnvelopeSchema, encodedEnvelopeSize, MAX_HISTORY_REVISIONS, MAX_SNAPSHOT_BYTES } from '@/lib/vault';
import { getDb, pruneSnapshotHistory } from '@/lib/server/db';
import { getSessionUser, isSameOrigin, json, readJsonBody } from '@/lib/server/http';

export const runtime = 'nodejs';

const restoreSchema = z.object({
  operationId: z.string().uuid(),
  expectedRevision: z.number().int().min(0),
  envelope: CipherEnvelopeSchema,
}).strict();

export async function GET() {
  const db = getDb();
  const userId = await getSessionUser();
  if (!userId) return json({ error: { code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' } }, 401);
  const rows = db.prepare('SELECT revision, envelope_json AS envelope, created_at AS createdAt FROM vault_snapshots WHERE user_id = ? ORDER BY revision DESC LIMIT ?').all(userId, MAX_HISTORY_REVISIONS) as Array<{ revision: number; envelope: string; createdAt: string }>;
  return json({ history: rows.map(row => ({ ...row, envelope: JSON.parse(row.envelope) })) });
}

export async function POST(request: Request) {
  const db = getDb();
  if (!await isSameOrigin()) return json({ error: { code: 'BAD_ORIGIN', message: 'Yêu cầu không hợp lệ.' } }, 403);
  const userId = await getSessionUser();
  if (!userId) return json({ error: { code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập lại.' } }, 401);
  const body = await readJsonBody(request, MAX_SNAPSHOT_BYTES + 16_384);
  if (!body.ok && body.tooLarge) return json({ error: { code: 'TOO_LARGE', message: 'Bản phục hồi vượt dung lượng cho phép.' } }, 413);
  const parsed = restoreSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) return json({ error: { code: 'INVALID_INPUT', message: 'Bản phục hồi không hợp lệ hoặc vượt giới hạn.' } }, 400);
  if (encodedEnvelopeSize(parsed.data.envelope) > MAX_SNAPSHOT_BYTES) return json({ error: { code: 'TOO_LARGE', message: 'Bản phục hồi vượt dung lượng cho phép.' } }, 413);

  const { operationId, expectedRevision, envelope } = parsed.data;
  const account = db.prepare('SELECT descriptor_json AS descriptor FROM users WHERE id = ?').get(userId) as { descriptor: string } | undefined;
  let ownedVaultId: string | undefined;
  try { ownedVaultId = account ? JSON.parse(account.descriptor).vaultId : undefined; } catch { ownedVaultId = undefined; }
  if (!ownedVaultId || envelope.vaultId !== ownedVaultId) return json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy két.' } }, 404);
  const serialized = JSON.stringify(envelope);
  const envelopeHash = createHash('sha256').update(serialized).digest('hex');
  const operation = db.prepare('SELECT revision,envelope_hash AS envelopeHash FROM vault_operations WHERE user_id = ? AND operation_id = ?').get(userId, operationId) as { revision: number; envelopeHash: string } | undefined;
  const legacy = operation ? undefined : db.prepare('SELECT revision,envelope_json AS envelope FROM vault_snapshots WHERE user_id = ? AND operation_id = ?').get(userId, operationId) as { revision: number; envelope: string } | undefined;
  if (operation || legacy) return (operation ? operation.envelopeHash === envelopeHash : legacy!.envelope === serialized)
    ? json({ revision: operation?.revision ?? legacy!.revision, replayed: true })
    : json({ error: { code: 'IDEMPOTENCY_MISMATCH', message: 'Mã thao tác đã được dùng cho nội dung khác.' } }, 409);

  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare('SELECT revision FROM vault_snapshots WHERE user_id = ? ORDER BY revision DESC LIMIT 1').get(userId) as { revision: number } | undefined;
    const revision = current?.revision ?? 0;
    if (revision !== expectedRevision) {
      db.exec('ROLLBACK');
      return json({ error: { code: 'CONFLICT', message: 'Két vừa thay đổi trên thiết bị khác. Hãy tải dữ liệu mới trước khi khôi phục.', currentRevision: revision } }, 409);
    }
    const nextRevision = revision + 1;
    const now = new Date().toISOString();
    db.prepare('INSERT INTO vault_snapshots(user_id,revision,operation_id,envelope_json,created_at) VALUES(?,?,?,?,?)').run(userId, nextRevision, operationId, serialized, now);
    db.prepare('INSERT INTO vault_operations(user_id,operation_id,envelope_hash,revision) VALUES(?,?,?,?)').run(userId, operationId, envelopeHash, nextRevision);
    pruneSnapshotHistory(userId, MAX_HISTORY_REVISIONS);
    db.exec('COMMIT');
    return json({ revision: nextRevision, replayed: false, createdAt: now });
  } catch {
    if (db.isTransaction) db.exec('ROLLBACK');
    return json({ error: { code: 'STORAGE_ERROR', message: 'Chưa thể khôi phục. Bản hiện hành vẫn được giữ.' } }, 500);
  }
}
