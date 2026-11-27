import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@/lib/server/db';
import { getSessionUser, hashPassword, hashToken, isSameOrigin, json, PASSWORD_MIN, SESSION_COOKIE, SESSION_TTL, newSessionToken, readJsonBody, verifyPassword } from '@/lib/server/http';

export const runtime = 'nodejs';

const descriptorSchema = z.object({
  format: z.literal('ksv-descriptor-v1'),
  vaultId: z.string().uuid(),
  masterWrappedRoot: z.object({ format: z.string().optional(), version: z.literal(1), purpose: z.literal('master'), normalization: z.literal('NFKC').optional(), kdf: z.object({ name: z.string(), iterations: z.number().int(), memorySize: z.number().int(), parallelism: z.number().int(), hashLength: z.number().int(), version: z.number().int() }), salt: z.string().min(16).max(64), iv: z.string().min(16).max(32), ciphertext: z.string().min(20).max(256) }),
  recoveryWrappedRoot: z.object({ version: z.literal(1), purpose: z.literal('recovery'), normalization: z.literal('NFKC').optional(), kdf: z.object({ name: z.string(), iterations: z.number().int(), memorySize: z.number().int(), parallelism: z.number().int(), hashLength: z.number().int(), version: z.number().int() }), salt: z.string().min(16).max(64), iv: z.string().min(16).max(32), ciphertext: z.string().min(20).max(256) }),
}).strict();

const credentialsSchema = z.object({
  action: z.enum(['register', 'login']),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  loginPassword: z.string().min(PASSWORD_MIN).max(128),
  descriptor: descriptorSchema.optional(),
}).strict();

const deleteAccountSchema = z.object({
  action: z.literal('delete'),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  loginPassword: z.string().min(1).max(128),
}).strict();

function setSessionCookie(response: Response, token: string) {
  response.headers.append('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return response;
}

export async function GET() {
  const db = getDb();
  const userId = await getSessionUser();
  if (!userId) return json({ error: { code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' } }, 401);
  const row = db.prepare('SELECT email, descriptor_json AS descriptor FROM users WHERE id = ?').get(userId) as { email: string; descriptor: string } | undefined;
  if (!row) return json({ error: { code: 'UNAUTHENTICATED', message: 'Phiên đăng nhập đã hết hạn.' } }, 401);
  const latest = db.prepare('SELECT revision, operation_id AS operationId, envelope_json AS envelope, created_at AS createdAt FROM vault_snapshots WHERE user_id = ? ORDER BY revision DESC LIMIT 1').get(userId) as { revision: number; operationId: string; envelope: string; createdAt: string } | undefined;
  const history = db.prepare('SELECT revision, envelope_json AS envelope, created_at AS createdAt FROM vault_snapshots WHERE user_id = ? ORDER BY revision DESC LIMIT 20').all(userId) as Array<{ revision: number; envelope: string; createdAt: string }>;
  return json({ email: row.email, descriptor: JSON.parse(row.descriptor), latest: latest ? { ...latest, envelope: JSON.parse(latest.envelope) } : null, history: history.map(x => ({ ...x, envelope: JSON.parse(x.envelope) })) });
}

export async function POST(request: Request) {
  const db = getDb();
  if (!await isSameOrigin()) return json({ error: { code: 'BAD_ORIGIN', message: 'Yêu cầu không hợp lệ.' } }, 403);
  const raw = await readJsonBody(request, 16_384);
  if (!raw.ok && raw.tooLarge) return json({ error: { code: 'TOO_LARGE', message: 'Yêu cầu vượt dung lượng cho phép.' } }, 413);
  const parsed = credentialsSchema.safeParse(raw.ok ? raw.value : null);
  if (!parsed.success) return json({ error: { code: 'INVALID_INPUT', message: `Thông tin chưa hợp lệ. Mật khẩu đăng nhập cần ít nhất ${PASSWORD_MIN} ký tự.` } }, 400);
  const input = parsed.data;
  const bucket = `account:${createHashSafe(input.email)}:${request.headers.get('x-forwarded-for')?.slice(0, 64) ?? 'local'}`;
  const threshold = Date.now() - 15 * 60 * 1000;
  db.prepare('DELETE FROM rate_limits WHERE attempted_at < ?').run(threshold);
  const tries = db.prepare('SELECT count(*) AS count FROM rate_limits WHERE bucket = ?').get(bucket) as { count: number };
  db.prepare('INSERT INTO rate_limits(bucket, attempted_at) VALUES (?, ?)').run(bucket, Date.now());
  if (tries.count >= 10) return json({ error: { code: 'RATE_LIMITED', message: 'Bạn thử đăng nhập quá nhiều lần. Hãy đợi 15 phút rồi thử lại.' } }, 429);

  let userId: string;
  if (input.action === 'register') {
    if (!input.descriptor) return json({ error: { code: 'INVALID_INPUT', message: 'Thiếu thông tin khởi tạo két.' } }, 400);
    const salt = randomBytes(16);
    const passHash = await hashPassword(input.loginPassword, salt);
    userId = randomUUIDSafe();
    try {
      db.prepare('INSERT INTO users(id,email,login_salt,login_hash,descriptor_json,created_at) VALUES(?,?,?,?,?,?)').run(userId, input.email, salt.toString('base64url'), passHash.toString('base64url'), JSON.stringify(input.descriptor), new Date().toISOString());
    } catch {
      return json({ error: { code: 'REGISTRATION_FAILED', message: 'Không thể tạo tài khoản. Hãy thử lại hoặc chọn email khác.' } }, 409);
    }
  } else {
    const row = db.prepare('SELECT id,login_salt AS salt,login_hash AS passHash FROM users WHERE email = ?').get(input.email) as { id: string; salt: string; passHash: string } | undefined;
    const salt = row ? Buffer.from(row.salt, 'base64url') : Buffer.alloc(16, 0x5a);
    const passHash = row ? Buffer.from(row.passHash, 'base64url') : Buffer.alloc(64, 0x5a);
    const valid = await (await import('@/lib/server/http')).verifyPassword(input.loginPassword, salt, passHash);
    if (!row || !valid) return json({ error: { code: 'LOGIN_FAILED', message: 'Email hoặc mật khẩu đăng nhập chưa đúng.' } }, 401);
    userId = row.id;
  }

  const token = newSessionToken();
  const expires = Date.now() + SESSION_TTL;
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,session_id,created_at) VALUES(?,?,?,?,?)').run(hashToken(token), userId, expires, randomUUIDSafe(), new Date().toISOString());
  return setSessionCookie(json({ ok: true }), token);
}

export async function DELETE(request: Request) {
  const db = getDb();
  if (!await isSameOrigin()) return json({ error: { code: 'BAD_ORIGIN', message: 'Yêu cầu không hợp lệ.' } }, 403);
  const raw = !request.body ? null : await readJsonBody(request, 2_048);
  if (raw && !raw.ok && raw.tooLarge) return json({ error: { code: 'TOO_LARGE', message: 'Yêu cầu vượt dung lượng cho phép.' } }, 413);
  const rawValue = raw?.ok ? raw.value : null;
  const deletion = rawValue === null ? null : deleteAccountSchema.safeParse(rawValue);
  if (deletion && !deletion.success) return json({ error: { code: 'INVALID_INPUT', message: 'Thông tin xác nhận xóa tài khoản chưa hợp lệ.' } }, 400);
  const userId = await getSessionUser();
  if (!userId) return deletion ? json({ error: { code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập lại trước khi xóa tài khoản.' } }, 401) : json({ ok: true });
  const { cookies } = await import('next/headers');
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (deletion?.success) {
    const row = db.prepare('SELECT email,login_salt AS salt,login_hash AS passHash FROM users WHERE id = ?').get(userId) as { email: string; salt: string; passHash: string } | undefined;
    if (!row) return json({ error: { code: 'UNAUTHENTICATED', message: 'Phiên đăng nhập đã hết hạn.' } }, 401);
    const validPassword = await verifyPassword(deletion.data.loginPassword, Buffer.from(row.salt, 'base64url'), Buffer.from(row.passHash, 'base64url'));
    if (row.email !== deletion.data.email || !validPassword) return json({ error: { code: 'CONFIRMATION_FAILED', message: 'Email hoặc mật khẩu đăng nhập xác nhận chưa đúng.' } }, 403);
    const emailHash = createHash('sha256').update(row.email).digest('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      db.prepare('DELETE FROM rate_limits WHERE bucket LIKE ?').run(`account:${emailHash}:%`);
      db.exec('COMMIT');
    } catch {
      if (db.isTransaction) db.exec('ROLLBACK');
      return json({ error: { code: 'DELETE_FAILED', message: 'Chưa xóa được tài khoản. Dữ liệu hiện có vẫn được giữ.' } }, 500);
    }
    const response = json({ ok: true, deleted: true });
    response.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    return response;
  }
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  const response = json({ ok: true });
  response.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return response;
}

function createHashSafe(value: string) { return createHash('sha256').update(value).digest('hex'); }
function randomUUIDSafe() { return randomUUID(); }
