import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createDescriptor, decryptSnapshot, encryptSnapshot, makeRecoverySecret } from '../src/lib/crypto';
import type { CipherEnvelope } from '../src/lib/vault';

let server: ChildProcess;
let directory: string;
let origin: string;
let output = '';

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ksv-api-test-'));
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '0'], {
    env: { ...process.env, NODE_ENV: 'production', KSV_DATA_DIR: directory },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout!.on('data', chunk => { output += chunk.toString(); });
  server.stderr!.on('data', chunk => { output += chunk.toString(); });
  let launchError: Error | undefined;
  server.on('error', error => { launchError = error; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    assert.equal(server.exitCode, null, `Test server exited: ${output}`);
    const address = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    if (address) {
      origin = address;
      try {
        if ((await fetch(`${origin}/api/account`, { signal: AbortSignal.timeout(1000) })).status === 401) return;
      } catch { /* Server has announced its address but may still be starting. */ }
    }
    await delay(100);
  }
  throw new Error(`Test server did not become ready: ${output}`);
});

after(async () => {
  if (server?.pid && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 5 });
});

async function request(path: string, method = 'GET', body?: unknown, cookie = '', requestOrigin: string | null = origin) {
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie);
  if (requestOrigin !== null) headers.set('Origin', requestOrigin);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${origin}/api/${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, headers: response.headers, body: await response.json() };
}

async function requestStream(path: string, method: string, body: string, cookie: string) {
  const response = await fetch(`${origin}/api/${path}`, {
    method,
    headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close(); } }),
    duplex: 'half',
    signal: AbortSignal.timeout(10_000),
  } as RequestInit);
  return { status: response.status, body: await response.json() };
}

async function account() {
  const email = `${crypto.randomUUID()}@example.test`;
  const loginPassword = 'test-login-password-only';
  const { descriptor, rootKey } = await createDescriptor(crypto.randomUUID(), 'test-master-password-only', makeRecoverySecret());
  const result = await request('account', 'POST', { action: 'register', email, loginPassword, descriptor });
  assert.equal(result.status, 200);
  const setCookie = result.headers.get('set-cookie')!;
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/']) assert.ok(setCookie.includes(flag));
  return { email, loginPassword, descriptor, rootKey, cookie: setCookie.split(';')[0] };
}

test('authentication rejects invalid credentials and logout revokes only the current session', async () => {
  const user = await account();
  try {
    const credentials = { action: 'login', email: user.email, loginPassword: user.loginPassword };
    assert.equal((await request('account', 'POST', { ...credentials, loginPassword: 'wrong-password-only' })).status, 401);
    const login = await request('account', 'POST', credentials);
    assert.equal(login.status, 200);
    const otherCookie = login.headers.get('set-cookie')!.split(';')[0];
    assert.notEqual(otherCookie, user.cookie);
    const session = await request('account', 'GET', undefined, user.cookie);
    assert.equal(session.body.email, user.email);
    assert.deepEqual(session.body.descriptor, user.descriptor);
    assert.equal((await request('account', 'DELETE', undefined, user.cookie)).status, 200);
    assert.equal((await request('account', 'GET', undefined, user.cookie)).status, 401);
    assert.equal((await request('account', 'GET', undefined, otherCookie)).status, 200);
  } finally { user.rootKey.fill(0); }
});

test('account deletion requires same-origin confirmation and login password then revokes every session', async () => {
  const user = await account();
  try {
    const login = await request('account', 'POST', { action: 'login', email: user.email, loginPassword: user.loginPassword });
    assert.equal(login.status, 200);
    const secondCookie = login.headers.get('set-cookie')!.split(';')[0];
    const deletion = { action: 'delete', email: user.email, loginPassword: user.loginPassword };

    const wrongPassword = await request('account', 'DELETE', { ...deletion, loginPassword: 'incorrect-login-password' }, user.cookie);
    assert.equal(wrongPassword.status, 403);
    assert.equal((await request('account', 'GET', undefined, user.cookie)).status, 200);
    assert.equal((await request('account', 'DELETE', { ...deletion, email: 'other@example.test' }, user.cookie)).status, 403);
    assert.equal((await request('account', 'DELETE', deletion, user.cookie, 'https://foreign.example')).status, 403);

    const deleted = await request('account', 'DELETE', deletion, user.cookie);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body, { ok: true, deleted: true });
    assert.match(deleted.headers.get('set-cookie')!, /Max-Age=0/);
    assert.equal((await request('account', 'GET', undefined, user.cookie)).status, 401);
    assert.equal((await request('account', 'GET', undefined, secondCookie)).status, 401);
    assert.equal((await request('account', 'POST', { action: 'login', email: user.email, loginPassword: user.loginPassword })).status, 401);
  } finally { user.rootKey.fill(0); }
});

test('protected endpoints reject missing sessions and mutations reject absent or foreign origins', async () => {
  for (const path of ['account', 'vault', 'history']) {
    assert.equal((await request(path)).status, 401);
  }
  for (const [path, method] of [['vault', 'PUT'], ['history', 'POST']]) {
    assert.equal((await request(path, method, {})).status, 401);
  }
  for (const [path, method] of [['account', 'POST'], ['account', 'DELETE'], ['vault', 'PUT'], ['history', 'POST']]) {
    for (const badOrigin of [null, 'https://foreign.example']) {
      const result = await request(path, method, method === 'DELETE' ? undefined : {}, '', badOrigin);
      assert.equal(result.status, 403);
      assert.equal(result.body.error.code, 'BAD_ORIGIN');
    }
  }
});

test('sync isolates accounts, detects concurrent writes, replays safely and restores as a new revision', async () => {
  const alice = await account();
  const bob = await account();
  try {
    const first = await encryptSnapshot({ version: 1, entries: [] }, alice.descriptor.vaultId, alice.rootKey);
    const second = await encryptSnapshot({ version: 1, entries: [] }, alice.descriptor.vaultId, alice.rootKey);
    const write = (envelope: CipherEnvelope, expectedRevision: number) => ({ operationId: crypto.randomUUID(), expectedRevision, envelope });
    const initial = write(first, 0);
    assert.equal((await request('vault', 'PUT', initial, alice.cookie)).body.revision, 1);
    const replay = await request('vault', 'PUT', initial, alice.cookie);
    assert.deepEqual(replay.body, { revision: 1, replayed: true });
    for (const [path, method] of [['vault', 'PUT'], ['history', 'POST']]) {
      const mismatch = await request(path, method, { ...initial, envelope: second }, alice.cookie);
      assert.equal(mismatch.status, 409);
      assert.equal(mismatch.body.error.code, 'IDEMPOTENCY_MISMATCH');
      assert.equal((await request(path, method, write(first, 0), bob.cookie)).status, 404);
    }
    assert.equal((await request('vault', 'GET', undefined, bob.cookie)).body.latest, null);
    assert.deepEqual((await request('history', 'GET', undefined, bob.cookie)).body.history, []);
    const competing = await Promise.all([second, first].map(envelope => request('vault', 'PUT', write(envelope, 1), alice.cookie)));
    assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
    const conflict = competing.find(result => result.status === 409)!;
    assert.equal(conflict.body.error.code, 'CONFLICT');
    assert.equal(conflict.body.error.currentRevision, 2);
    const staleRestore = await request('history', 'POST', write(first, 1), alice.cookie);
    assert.equal(staleRestore.status, 409);
    const restoration = write(first, 2);
    assert.equal((await request('history', 'POST', restoration, alice.cookie)).body.revision, 3);
    assert.deepEqual((await request('history', 'POST', restoration, alice.cookie)).body, { revision: 3, replayed: true });
    const current = await request('vault', 'GET', undefined, alice.cookie);
    assert.equal(current.body.latest.revision, 3);
    assert.deepEqual(current.body.latest.envelope, first);
    assert.deepEqual(await decryptSnapshot(current.body.latest.envelope, alice.rootKey), { version: 1, entries: [] });
    const history = await request('history', 'GET', undefined, alice.cookie);
    assert.deepEqual(history.body.history.map((row: { revision: number }) => row.revision), [3, 2, 1]);
    assert.deepEqual(history.body.history[2].envelope, first);
    assert.equal((await request('vault', 'PUT', { ...write(first, 3), expectedRevision: -1 }, alice.cookie)).status, 400);
    assert.equal((await request('vault', 'GET', undefined, alice.cookie)).body.latest.revision, 3);
  } finally {
    alice.rootKey.fill(0);
    bob.rootKey.fill(0);
  }
});

test('server retains only the latest 20 snapshots after writes and restores', async () => {
  const user = await account();
  try {
    const envelopes = await Promise.all(Array.from({ length: 22 }, () =>
      encryptSnapshot({ version: 1, entries: [] }, user.descriptor.vaultId, user.rootKey)));
    let revision = 0;
    let firstOperation: { operationId: string; expectedRevision: number; envelope: CipherEnvelope } | undefined;
    for (const envelope of envelopes.slice(0, 20)) {
      const operation = { operationId: crypto.randomUUID(), expectedRevision: revision, envelope };
      firstOperation ??= operation;
      const result = await request('vault', 'PUT', operation, user.cookie);
      assert.equal(result.status, 200);
      revision = result.body.revision;
    }
    const restored = await request('history', 'POST', { operationId: crypto.randomUUID(), expectedRevision: revision, envelope: envelopes[20] }, user.cookie);
    assert.equal(restored.status, 200);
    revision = restored.body.revision;
    const newest = await request('vault', 'PUT', { operationId: crypto.randomUUID(), expectedRevision: revision, envelope: envelopes[21] }, user.cookie);
    assert.equal(newest.status, 200);

    const [vault, history] = await Promise.all([
      request('vault', 'GET', undefined, user.cookie),
      request('history', 'GET', undefined, user.cookie),
    ]);
    assert.equal(vault.body.latest.revision, 22);
    assert.deepEqual(history.body.history.map((row: { revision: number }) => row.revision), Array.from({ length: 20 }, (_, i) => 22 - i));
    const replay = await request('vault', 'PUT', firstOperation, user.cookie);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, { revision: 1, replayed: true });
  } finally { user.rootKey.fill(0); }
});

test('vault and history reject oversized streamed JSON bodies without Content-Length', async () => {
  const user = await account();
  try {
    const oversized = `{"padding":"${'x'.repeat(2 * 1024 * 1024 + 20_000)}"}`;
    for (const [path, method] of [['vault', 'PUT'], ['history', 'POST']]) {
      const result = await requestStream(path, method, oversized, user.cookie);
      assert.equal(result.status, 413);
      assert.equal(result.body.error.code, 'TOO_LARGE');
    }
  } finally { user.rootKey.fill(0); }
});
