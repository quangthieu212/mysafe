import { z } from 'zod';
import { getDb } from '@/lib/server/db';
import { getSessionUser, hashToken, isSameOrigin, json, readJsonBody, SESSION_COOKIE } from '@/lib/server/http';

export const runtime = 'nodejs';

const revokeSchema = z.object({ sessionId: z.string().uuid() }).strict();

export async function GET() {
  const userId = await getSessionUser();
  if (!userId) return json({ error: { code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' } }, 401);
  const { cookies } = await import('next/headers');
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const currentHash = token ? hashToken(token) : null;
  const rows = getDb().prepare('SELECT session_id AS sessionId, token_hash AS tokenHash, created_at AS createdAt FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC').all(userId, Date.now()) as Array<{ sessionId: string; tokenHash: string; createdAt: string }>;
  return json({ sessions: rows.map(({ sessionId, tokenHash, createdAt }) => ({ sessionId, createdAt, current: tokenHash === currentHash })) });
}

export async function DELETE(request: Request) {
  if (!await isSameOrigin()) return json({ error: { code: 'BAD_ORIGIN', message: 'Yêu cầu không hợp lệ.' } }, 403);
  const userId = await getSessionUser();
  if (!userId) return json({ error: { code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' } }, 401);
  const raw = await readJsonBody(request, 2_048);
  if (!raw.ok && raw.tooLarge) return json({ error: { code: 'TOO_LARGE', message: 'Yêu cầu vượt dung lượng cho phép.' } }, 413);
  const parsed = revokeSchema.safeParse(raw.ok ? raw.value : null);
  if (!parsed.success) return json({ error: { code: 'INVALID_INPUT', message: 'Phiên đăng nhập chưa hợp lệ.' } }, 400);

  const db = getDb();
  const row = db.prepare('SELECT token_hash AS tokenHash FROM sessions WHERE session_id = ? AND user_id = ?').get(parsed.data.sessionId, userId) as { tokenHash: string } | undefined;
  if (!row) return json({ error: { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên đăng nhập.' } }, 404);
  db.prepare('DELETE FROM sessions WHERE session_id = ? AND user_id = ?').run(parsed.data.sessionId, userId);

  const { cookies } = await import('next/headers');
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const isCurrent = !!token && hashToken(token) === row.tokenHash;
  const response = json({ ok: true, revokedCurrent: isCurrent });
  if (isCurrent) response.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return response;
}
