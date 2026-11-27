import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';

export const SESSION_COOKIE = 'ksv_session';
export const SESSION_TTL = 1000 * 60 * 60 * 24 * 14;

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; tooLarge: boolean };

export async function readJsonBody(request: Request, maximumBytes: number): Promise<JsonBodyResult> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > maximumBytes) return { ok: false, tooLarge: true };
  if (!request.body) return { ok: false, tooLarge: false };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, tooLarge: false };
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, tooLarge: false };
  }
}

export async function isSameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get('origin');
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function getSessionUser(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { getDb } = await import('./db');
  const db = getDb();
  const row = db.prepare('SELECT user_id AS userId FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, Date.now()) as { userId: string } | undefined;
  return row?.userId ?? null;
}

export function newSessionToken(): string { return randomBytes(32).toString('base64url'); }
export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }

export async function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return await new Promise((resolve, reject) => scryptCallback(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived as Buffer)));
}

export async function verifyPassword(password: string, salt: Buffer, expected: Buffer): Promise<boolean> {
  const actual = await hashPassword(password, salt);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const PASSWORD_MIN = 12;
