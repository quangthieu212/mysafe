'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearRootKey, createDescriptor, decryptSnapshot, encryptSnapshot, makeBackup, makeRecoverySecret, unlockDescriptor, validateBackup, type VaultBackup, type VaultDescriptor } from '@/lib/crypto';
import { deleteCache, downloadBackup, readCache, readLatestCache, writeCache, type CachedVault } from '@/lib/client-storage';
import { MAX_ITEMS, validateSnapshot, type CipherEnvelope, type VaultEntry, type VaultField, type VaultSnapshot } from '@/lib/vault';

type Status = 'loading' | 'signed-out' | 'locked' | 'unlocked';
type HistoryRow = { revision: number; envelope: CipherEnvelope; createdAt: string };
type SessionRow = { sessionId: string; createdAt: string; current: boolean };

const EMPTY: VaultSnapshot = { version: 1, entries: [] };
const CATEGORIES = [
  { value: 'account', label: 'Tài khoản' }, { value: 'identity', label: 'Giấy tờ' },
  { value: 'note', label: 'Ghi chú' }, { value: 'custom', label: 'Tùy chỉnh' },
] as const;

function newId() { return crypto.randomUUID(); }
function formatDate(value: string) { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

export default function VaultApp() {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState('');
  const [descriptor, setDescriptor] = useState<VaultDescriptor | null>(null);
  const [rootKey, setRootKey] = useState<Uint8Array | null>(null);
  const rootRef = useRef<Uint8Array | null>(null);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [revision, setRevision] = useState(0);
  const [envelope, setEnvelope] = useState<CipherEnvelope | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'recovery'>('login');
  const [loginPassword, setLoginPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [recoverySecret, setRecoverySecret] = useState('');
  const [shownRecovery, setShownRecovery] = useState('');
  const [savedRecovery, setSavedRecovery] = useState(false);
  const [backupFile, setBackupFile] = useState<VaultBackup | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsError, setSessionsError] = useState('');
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteEmailConfirmation, setDeleteEmailConfirmation] = useState('');
  const [deleteLoginPassword, setDeleteLoginPassword] = useState('');
  const [lastBackup, setLastBackup] = useState('');
  const [pending, setPending] = useState(false);
  const [online, setOnline] = useState(true);
  const [conflict, setConflict] = useState<{ remote: VaultSnapshot; remoteEnvelope: CipherEnvelope; remoteRevision: number; local: VaultSnapshot } | null>(null);
  const [draft, setDraft] = useState<VaultEntry | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOnline = useRef(true);

  useEffect(() => {
    const syncOnline = () => setOnline(navigator.onLine);
    syncOnline(); window.addEventListener('online', syncOnline); window.addEventListener('offline', syncOnline);
    return () => { window.removeEventListener('online', syncOnline); window.removeEventListener('offline', syncOnline); };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/account', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!active) return;
      setEmail(data.email); setDescriptor(data.descriptor); setAuthMode('login'); setStatus('locked');
      setStatusText('Nhập mật khẩu chính hoặc mã khôi phục để mở két.');
    }).catch(async () => {
      if (!active) return;
      if (!navigator.onLine) {
        const cached = await readLatestCache().catch(() => null);
        if (!active) return;
        if (cached) {
          setEmail(cached.email); setDescriptor(cached.descriptor); setAuthMode('login'); setStatus('locked');
          setStatusText('Ngoại tuyến. Nhập mật khẩu chính hoặc mã khôi phục để mở bản két đã mã hóa trên thiết bị.');
          return;
        }
        setStatusText('Ngoại tuyến và chưa có bản két đã lưu trên thiết bị.');
      }
      setStatus('signed-out');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const reconnected = online && !wasOnline.current;
    wasOnline.current = online;
    if (reconnected && status === 'unlocked' && pending) void retrySync();
  }, [online, pending, status]);

  useEffect(() => {
    if (!rootKey) return;
    const lock = () => {
      if (rootRef.current) clearRootKey(rootRef.current);
      rootRef.current = null; setRootKey(null); setStatus('locked'); setDraft(null); setQuery(''); setStatusText('Két đã tự khóa sau 5 phút không thao tác.');
    };
    const reset = () => { if (lockTimer.current) clearTimeout(lockTimer.current); lockTimer.current = setTimeout(lock, 5 * 60 * 1000); };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach(event => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => { events.forEach(event => window.removeEventListener(event, reset)); if (lockTimer.current) clearTimeout(lockTimer.current); };
  }, [rootKey]);

  const applyRemote = useCallback(async (data: { latest: null | { revision: number; envelope: CipherEnvelope }; history?: HistoryRow[] }, currentDescriptor: VaultDescriptor, key: Uint8Array, currentEmail: string) => {
    if (!data.latest) {
      const cache: CachedVault = { email: currentEmail, descriptor: currentDescriptor, envelope: await encryptSnapshot(EMPTY, currentDescriptor.vaultId, key), revision: 0, entries: [], updatedAt: new Date().toISOString() };
      await writeCache(cache); setEntries([]); setRevision(0); setEnvelope(cache.envelope); setHistory([]); return;
    }
    const snapshot = validateSnapshot(await decryptSnapshot(data.latest.envelope, key));
    await writeCache({ email: currentEmail, descriptor: currentDescriptor, envelope: data.latest.envelope, revision: data.latest.revision, entries: snapshot.entries, updatedAt: new Date().toISOString() });
    setEntries(snapshot.entries); setRevision(data.latest.revision); setEnvelope(data.latest.envelope);
    if (data.history) setHistory(data.history);
  }, []);

  async function accountAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    let createdKey: Uint8Array | null = null;
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (authMode === 'register') {
        if (loginPassword.length < 12) throw new Error('Mật khẩu đăng nhập cần ít nhất 12 ký tự.');
        if (masterPassword.length < 12) throw new Error('Mật khẩu chính cần ít nhất 12 ký tự.');
        if (!savedRecovery) throw new Error('Hãy xác nhận bạn đã lưu mã khôi phục ở nơi riêng tư.');
        const vaultId = crypto.randomUUID();
        const normalizedRecovery = shownRecovery.replaceAll('-', '').toUpperCase();
        const { descriptor: createdDescriptor, rootKey: key } = await createDescriptor(vaultId, masterPassword, normalizedRecovery);
        createdKey = key;
        const response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', email: normalizedEmail, loginPassword, descriptor: createdDescriptor }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? 'Chưa tạo được tài khoản.');
        setDescriptor(createdDescriptor); setEmail(normalizedEmail); setRootKey(key); rootRef.current = key; setEntries([]); setRevision(0); setEnvelope(null); setStatus('unlocked');
        const initial = await encryptSnapshot(EMPTY, vaultId, key); setEnvelope(initial); await writeCache({ email: normalizedEmail, descriptor: createdDescriptor, envelope: initial, revision: 0, entries: [], updatedAt: new Date().toISOString() });
        setStatusText('Két đã tạo. Bước tiếp theo: lưu mục đầu tiên.'); setMasterPassword(''); setLoginPassword(''); setShownRecovery(''); return;
      }

      if (status === 'locked' && !navigator.onLine) {
        const cached = await readCache(normalizedEmail);
        if (!cached || !descriptor || cached.descriptor.vaultId !== descriptor.vaultId) {
          throw new Error('Không tìm thấy bản két cục bộ phù hợp. Hãy kết nối mạng để tải dữ liệu.');
        }
        const secret = authMode === 'recovery' ? recoverySecret.replaceAll('-', '').toUpperCase() : masterPassword;
        if (!secret) throw new Error(authMode === 'recovery' ? 'Nhập mã khôi phục.' : 'Nhập mật khẩu chính để mở khóa.');
        const key = await unlockDescriptor(cached.descriptor, secret, authMode === 'recovery' ? 'recovery' : 'master');
        createdKey = key;
        if (cached.envelope.vaultId !== cached.descriptor.vaultId) throw new Error('Bản mã cục bộ không thuộc két này.');
        const snapshot = validateSnapshot(await decryptSnapshot(cached.envelope, key));
        rootRef.current = key; setRootKey(key); setDescriptor(cached.descriptor); setEmail(normalizedEmail);
        setEntries(snapshot.entries); setRevision(cached.revision); setEnvelope(cached.envelope); setPending(!!cached.pending);
        setHistory([]); setStatus('unlocked'); setLoginPassword(''); setMasterPassword(''); setRecoverySecret('');
        setStatusText(cached.pending
          ? 'Đã mở bản két cục bộ. Thay đổi đang chờ đồng bộ khi có mạng.'
          : 'Đã mở bản két cục bộ. Dữ liệu sẽ được kiểm tra và đồng bộ khi có mạng.');
        return;
      }

      if (status !== 'locked') {
        const response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', email: normalizedEmail, loginPassword }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? 'Chưa đăng nhập được.');
      }
      const accountResponse = await fetch('/api/account', { cache: 'no-store' });
      if (accountResponse.status === 401) {
        setStatus('signed-out'); setAuthMode('login'); setDescriptor(null); setMasterPassword(''); setRecoverySecret(''); setStatusText('');
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }
      if (!accountResponse.ok) throw new Error('Chưa tải được thông tin tài khoản. Vui lòng thử lại.');
      const account = await accountResponse.json();
      if (!account.descriptor) throw new Error('Tài khoản chưa có thông tin két.');
      setDescriptor(account.descriptor); setEmail(normalizedEmail);
      if (status !== 'locked') {
        setLoginPassword(''); setMasterPassword(''); setRecoverySecret(''); setAuthMode('login'); setStatus('locked');
        setStatusText('Đã đăng nhập. Nhập mật khẩu chính hoặc mã khôi phục để mở két.');
        return;
      }
      let cached = await readCache(normalizedEmail).catch(() => null);
      const currentDescriptor = account.descriptor as VaultDescriptor;
      if (cached && cached.descriptor.vaultId !== currentDescriptor.vaultId) {
        await deleteCache(normalizedEmail).catch(() => undefined);
        cached = null;
      }
      const secret = authMode === 'recovery' ? recoverySecret.replaceAll('-', '').toUpperCase() : masterPassword;
      if (!secret) throw new Error(authMode === 'recovery' ? 'Nhập mã khôi phục.' : 'Nhập mật khẩu chính để mở khóa.');
      const key = await unlockDescriptor(currentDescriptor, secret, authMode === 'recovery' ? 'recovery' : 'master');
      createdKey = key;
      const vaultResponse = await fetch('/api/vault', { cache: 'no-store' });
      if (!vaultResponse.ok) throw new Error('Chưa tải được trạng thái đồng bộ.');
      const remote = await vaultResponse.json();
      const remoteRevision = remote.latest?.revision ?? 0;
      const hasPendingLocal = !!cached?.pending;
      setHistory(remote.history ?? []); setRootKey(key); rootRef.current = key; setStatus('unlocked'); setLoginPassword(''); setMasterPassword(''); setRecoverySecret('');
      if (hasPendingLocal && cached) {
        const localSnapshot = validateSnapshot(cached.entries);
        const remoteSnapshot = remote.latest ? validateSnapshot(await decryptSnapshot(remote.latest.envelope, key)) : EMPTY;
        setEntries(localSnapshot.entries); setEnvelope(cached.envelope); setRevision(cached.revision); setPending(true);
        await writeCache({ ...cached, descriptor: currentDescriptor });
        if (cached.revision === remoteRevision) {
          setStatusText('Tìm thấy thay đổi chưa đồng bộ. Đang thử gửi lại bản mã đã lưu…');
          await syncEnvelope(cached.envelope, localSnapshot.entries, cached.revision, currentDescriptor, normalizedEmail);
        } else {
          const remoteEnvelope = remote.latest?.envelope ?? await encryptSnapshot(EMPTY, currentDescriptor.vaultId, key);
          setConflict({ local: localSnapshot, remote: remoteSnapshot, remoteEnvelope, remoteRevision });
          setStatusText('Có thay đổi trên thiết bị khác. Bản chưa đồng bộ và bản máy chủ đều được giữ lại.');
        }
      } else {
        await applyRemote(remote, currentDescriptor, key, normalizedEmail);
        setStatusText('Két đã mở và dữ liệu đã được kiểm tra.');
      }
    } catch (cause) {
      if (createdKey && createdKey !== rootRef.current) clearRootKey(createdKey);
      setError(cause instanceof Error ? cause.message : 'Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally { setBusy(false); }
  }

  function lockVault(message = 'Két đã khóa.') {
    if (rootRef.current) clearRootKey(rootRef.current);
    rootRef.current = null; setRootKey(null); setStatus('locked'); setDraft(null); setQuery(''); setStatusText(message);
  }

  async function logout() {
    const response = await fetch('/api/account', { method: 'DELETE' }).catch(() => null);
    lockVault('Đã đăng xuất. Bản mã vẫn còn trên thiết bị này.');
    setStatus('signed-out'); setAuthMode('login'); setDescriptor(null); setEmail(''); setHistory([]); setError(''); setLoginPassword(''); setMasterPassword(''); setRecoverySecret('');
    if (!response?.ok) setStatusText('Đã khóa trên thiết bị. Phiên trên máy chủ có thể chưa được thu hồi.');
  }

  async function openSessions() {
    setShowSessions(true); setSessionsError(''); setSessionsBusy(true);
    try {
      const response = await fetch('/api/sessions', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Chưa tải được danh sách phiên.');
      setSessions(result.sessions ?? []);
    } catch (cause) {
      setSessionsError(cause instanceof Error ? cause.message : 'Chưa tải được danh sách phiên.');
    } finally { setSessionsBusy(false); }
  }

  async function revokeSession(sessionId: string) {
    setSessionsError(''); setSessionsBusy(true);
    try {
      const response = await fetch('/api/sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Chưa thu hồi được phiên.');
      if (result.revokedCurrent) {
        if (rootRef.current) clearRootKey(rootRef.current);
        rootRef.current = null; setRootKey(null); setEntries([]); setRevision(0); setEnvelope(null); setPending(false); setConflict(null); setDraft(null); setQuery(''); setStatus('signed-out'); setAuthMode('login'); setDescriptor(null); setEmail(''); setHistory([]); setShowSessions(false);
        setStatusText('Phiên hiện tại đã bị thu hồi. Bản mã trên thiết bị vẫn còn.');
        return;
      }
      setSessions(current => current.filter(session => session.sessionId !== sessionId));
    } catch (cause) {
      setSessionsError(cause instanceof Error ? cause.message : 'Chưa thu hồi được phiên.');
    } finally { setSessionsBusy(false); }
  }

  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', email: deleteEmailConfirmation, loginPassword: deleteLoginPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Chưa xóa được tài khoản.');
      const currentEmail = email;
      if (rootRef.current) clearRootKey(rootRef.current);
      rootRef.current = null; setRootKey(null);
      const cacheRemoved = await deleteCache(currentEmail).then(() => true).catch(() => false);
      setEntries([]); setRevision(0); setEnvelope(null); setHistory([]); setPending(false); setConflict(null);
      setDescriptor(null); setEmail(''); setLoginPassword(''); setMasterPassword(''); setRecoverySecret('');
      setShowDeleteAccount(false); setDeleteEmailConfirmation(''); setDeleteLoginPassword(''); setAuthMode('login'); setStatus('signed-out');
      setStatusText(cacheRemoved
        ? 'Tài khoản và dữ liệu trên máy chủ đã được xóa. Bản sao lưu đã tải xuống hoặc cache trên thiết bị khác vẫn có thể còn.'
        : 'Tài khoản và dữ liệu trên máy chủ đã được xóa, nhưng cache mã hóa trên thiết bị này chưa xóa được. Hãy xóa dữ liệu trang của trình duyệt.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa xóa được tài khoản.');
    } finally { setBusy(false); }
  }

  async function persist(updated: VaultEntry[]) {
    if (!descriptor || !rootRef.current) return;
    const snapshot = validateSnapshot({ version: 1, entries: updated });
    const nextEnvelope = await encryptSnapshot(snapshot, descriptor.vaultId, rootRef.current);
    const now = new Date().toISOString();
    await writeCache({ email, descriptor, envelope: nextEnvelope, revision, entries: updated, updatedAt: now, pending: true });
    setEntries(updated); setEnvelope(nextEnvelope); setPending(true); setStatusText('Đã lưu mã hóa trên thiết bị. Đang đồng bộ…');
    if (!navigator.onLine) { setStatusText('Đã lưu mã hóa trên thiết bị; sẽ đồng bộ khi có mạng.'); return; }
    await syncEnvelope(nextEnvelope, updated, revision, descriptor, email);
  }

  async function syncEnvelope(nextEnvelope: CipherEnvelope, snapshotEntries: VaultEntry[], expected: number, currentDescriptor: VaultDescriptor, currentEmail: string) {
    const operationId = crypto.randomUUID();
    try {
      const response = await fetch('/api/vault', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId, expectedRevision: expected, envelope: nextEnvelope }) });
      const result = await response.json();
      if (response.status === 409 && result.error?.code === 'CONFLICT') {
        const remoteEnvelope = result.error.latest as CipherEnvelope | null;
        if (!remoteEnvelope || !rootRef.current) throw new Error('Mất đồng bộ. Hãy tải lại trạng thái két.');
        const remote = validateSnapshot(await decryptSnapshot(remoteEnvelope, rootRef.current));
        setConflict({ remote, remoteEnvelope, remoteRevision: result.error.currentRevision, local: { version: 1, entries: snapshotEntries } });
        setStatusText('Có sửa đổi trên thiết bị khác. Hai bản đang được giữ an toàn.'); setPending(true); return;
      }
      if (!response.ok) throw new Error(result.error?.message ?? 'Đồng bộ chưa hoàn tất.');
      setRevision(result.revision); setPending(false); setEnvelope(nextEnvelope); setStatusText('Đã đồng bộ.'); setLastBackup('Chưa có bản sao lưu ngoài thiết bị.');
      await writeCache({ email: currentEmail, descriptor: currentDescriptor, envelope: nextEnvelope, revision: result.revision, entries: snapshotEntries, updatedAt: new Date().toISOString(), pending: false });
      await reloadHistory();
    } catch (cause) {
      setPending(true); setStatusText(cause instanceof Error ? `${cause.message} Bản mã đang chờ trên thiết bị.` : 'Đồng bộ lỗi; bản mã đang chờ trên thiết bị.');
    }
  }

  async function reloadHistory() {
    const response = await fetch('/api/history', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json(); setHistory(data.history ?? []);
  }

  async function retrySync() {
    if (!envelope || !descriptor || !rootRef.current) return;
    setBusy(true);
    try {
      const response = await fetch('/api/vault', { cache: 'no-store' }); const remote = await response.json();
      const current = remote.latest?.revision ?? 0;
      if (current !== revision) {
        const remoteEnvelope = remote.latest?.envelope as CipherEnvelope | undefined;
        if (remoteEnvelope) setConflict({ remote: validateSnapshot(await decryptSnapshot(remoteEnvelope, rootRef.current)), remoteEnvelope, remoteRevision: current, local: { version: 1, entries } });
        else setStatusText('Trạng thái máy chủ chưa rõ; giữ nguyên bản trên thiết bị.');
        return;
      }
      await syncEnvelope(envelope, entries, revision, descriptor, email);
    } catch (cause) { setStatusText(cause instanceof Error ? cause.message : 'Đồng bộ chưa thành công.'); }
    finally { setBusy(false); }
  }

  async function keepBothVersions() {
    if (!conflict || !descriptor || !rootRef.current) return;
    const remoteIds = new Set(conflict.remote.entries.map(entry => entry.id));
    const localCopies = conflict.local.entries.filter(entry => remoteIds.has(entry.id)).map(entry => ({ ...entry, id: newId(), title: `${entry.title} · Bản sao từ thiết bị này`, fields: entry.fields.map(field => ({ ...field, id: newId() })), updatedAt: new Date().toISOString() }));
    const localOnly = conflict.local.entries.filter(entry => !remoteIds.has(entry.id));
    const merged = validateSnapshot({ version: 1, entries: [...conflict.remote.entries, ...localOnly, ...localCopies] });
    const next = await encryptSnapshot(merged, descriptor.vaultId, rootRef.current);
    setConflict(null); setEntries(merged.entries); setEnvelope(next); setRevision(conflict.remoteRevision); setPending(true);
    await writeCache({ email, descriptor, envelope: next, revision: conflict.remoteRevision, entries: merged.entries, updatedAt: new Date().toISOString(), pending: true });
    await syncEnvelope(next, merged.entries, conflict.remoteRevision, descriptor, email);
  }

  async function useRemoteVersion() {
    if (!conflict || !descriptor || !rootRef.current) return;
    const data = await fetch('/api/vault', { cache: 'no-store' }).then(r => r.json());
    if (!data.latest) return;
    const latest = validateSnapshot(await decryptSnapshot(data.latest.envelope, rootRef.current));
    setEntries(latest.entries); setEnvelope(data.latest.envelope); setRevision(data.latest.revision); setConflict(null); setPending(false);
    await writeCache({ email, descriptor, envelope: data.latest.envelope, revision: data.latest.revision, entries: latest.entries, updatedAt: new Date().toISOString() });
    setStatusText('Đã dùng bản mới nhất trên máy chủ.');
  }

  async function restoreVersion(row: HistoryRow) {
    if (!descriptor || !rootRef.current) return;
    const snapshot = validateSnapshot(await decryptSnapshot(row.envelope, rootRef.current));
    const restoredEnvelope = await encryptSnapshot(snapshot, descriptor.vaultId, rootRef.current);
    const operationId = crypto.randomUUID();
    const response = await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId, expectedRevision: revision, envelope: restoredEnvelope }) });
    const result = await response.json();
    if (!response.ok) { setStatusText(result.error?.message ?? 'Chưa phục hồi được phiên bản này.'); return; }
    setEntries(snapshot.entries); setEnvelope(restoredEnvelope); setRevision(result.revision); setPending(false);
        await writeCache({ email, descriptor, envelope: restoredEnvelope, revision: result.revision, entries: snapshot.entries, updatedAt: new Date().toISOString(), pending: false });
    await reloadHistory(); setShowHistory(false); setStatusText(`Đã khôi phục phiên bản ${row.revision} thành bản mới.`);
  }

  async function exportBackup() {
    if (!descriptor || !rootRef.current) return;
    setBusy(true);
    try {
      const currentEnvelope = await encryptSnapshot(validateSnapshot({ version: 1, entries }), descriptor.vaultId, rootRef.current);
      const backup = makeBackup(descriptor, currentEnvelope); downloadBackup(backup); setLastBackup(`Đã tải xuống lúc ${formatDate(backup.createdAt)}. Hãy giữ tệp ở nơi an toàn.`); setStatusText('Đã tạo bản sao lưu mã hóa để tải xuống.');
    } catch (cause) { setStatusText(cause instanceof Error ? cause.message : 'Chưa tạo được bản sao lưu.'); }
    finally { setBusy(false); }
  }

  async function inspectBackup(file: File | null) {
    setError(''); setBackupFile(null);
    if (!file) return;
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('Tệp sao lưu vượt quá giới hạn 3 MiB.');
      const backup = validateBackup(JSON.parse(await file.text()));
      if (descriptor && backup.descriptor.vaultId !== descriptor.vaultId) throw new Error('Tệp này thuộc két khác. Hãy đăng nhập đúng tài khoản để phục hồi.');
      setBackupFile(backup);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đọc được tệp sao lưu.'); }
  }

  async function restoreBackup() {
    if (!backupFile || !descriptor || !rootRef.current) return;
    setBusy(true);
    try {
      const snapshot = validateSnapshot(await decryptSnapshot(backupFile.snapshot, rootRef.current));
      const nextEnvelope = await encryptSnapshot(snapshot, descriptor.vaultId, rootRef.current);
      const response = await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: crypto.randomUUID(), expectedRevision: revision, envelope: nextEnvelope }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? 'Chưa phục hồi được bản sao lưu.');
      setEntries(snapshot.entries); setEnvelope(nextEnvelope); setRevision(result.revision); setPending(false);
      await writeCache({ email, descriptor, envelope: nextEnvelope, revision: result.revision, entries: snapshot.entries, updatedAt: new Date().toISOString(), pending: false });
      setBackupFile(null); setShowHistory(false); await reloadHistory(); setStatusText(`Đã phục hồi ${snapshot.entries.length} mục thành phiên bản mới.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Khôi phục thất bại.'); }
    finally { setBusy(false); }
  }

  function saveEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!draft) return;
    const updated = entries.some(entry => entry.id === draft.id) ? entries.map(entry => entry.id === draft.id ? draft : entry) : [draft, ...entries];
    void persist(updated).then(() => setDraft(null)).catch(cause => setError(cause instanceof Error ? cause.message : 'Chưa lưu được mục.'));
  }

  function addEntry() {
    if (entries.length >= MAX_ITEMS) { setError(`Bản thử nghiệm hiện giới hạn ${MAX_ITEMS} mục.`); return; }
    setDraft({ id: newId(), title: '', note: '', category: 'custom', fields: [], updatedAt: new Date().toISOString() }); setError('');
  }

  async function deleteEntry(entry: VaultEntry) {
    if (!confirm(`Chuyển “${entry.title}” vào thùng rác?`)) return;
    try { await persist(entries.map(item => item.id === entry.id ? { ...item, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item)); setDraft(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa xóa được mục.'); }
  }

  const liveEntries = useMemo(() => entries.filter(entry => !entry.deletedAt), [entries]);
  const trashedEntries = useMemo(() => entries.filter(entry => !!entry.deletedAt), [entries]);
  const visible = useMemo(() => liveEntries.filter(entry => `${entry.title} ${entry.note} ${entry.fields.map(field => `${field.label} ${field.value}`).join(' ')}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))), [liveEntries, query]);
  const currentDraftInList = draft && entries.some(entry => entry.id === draft.id);

  if (status === 'loading') return <main className="load-screen"><span className="brand-mark">K</span><p>Đang mở Két Sắt Việt…</p></main>;

  if (status === 'signed-out' || status === 'locked') {
    const locked = status === 'locked';
    return <main className="auth-shell">
      <header className="topbar auth-topbar"><a className="brand" href="/"><span className="brand-mark">K</span><span>Két Sắt Việt<small>Thông tin của bạn, trong tầm tay</small></span></a><button className="icon-button" onClick={() => setShowHelp(true)} aria-label="Tìm hiểu cách bảo vệ dữ liệu">?</button></header>
      <section className="auth-card">
        <div className="auth-art"><div className="sun-disc"/><div className="vault-illustration"><span>✳</span><i/><b/><em/></div><div className="art-caption">Riêng tư từ thiết kế<br/><strong>chỉ bạn mở được két</strong></div></div>
        <div className="auth-content">
          <p className="eyebrow">KÉT CÁ NHÂN CỦA BẠN</p>
          <h1>{locked ? 'Mừng bạn quay lại.' : authMode === 'register' ? 'Tạo chiếc két của riêng bạn.' : 'Cất điều quan trọng.'}</h1>
          <p className="muted">{locked ? `Đã đăng nhập ${email}. Mở khóa két để tiếp tục.` : 'Một nơi bình yên cho những thông tin bạn muốn giữ.'}</p>
          {locked && <div className="unlock-tabs"><button className={authMode === 'login' ? 'selected' : ''} onClick={() => setAuthMode('login')}>Mật khẩu chính</button><button className={authMode === 'recovery' ? 'selected' : ''} onClick={() => setAuthMode('recovery')}>Mã khôi phục</button></div>}
          {!locked && <div className="mode-switch"><button className={authMode === 'login' ? 'selected' : ''} onClick={() => { setAuthMode('login'); setError(''); }}>Đăng nhập</button><button className={authMode === 'register' ? 'selected' : ''} onClick={() => { setAuthMode('register'); setShownRecovery(makeRecoverySecret()); setSavedRecovery(false); setError(''); }}>Tạo két mới</button></div>}
          <form className="auth-form" onSubmit={accountAction}>
            {!locked && <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="ban@email.com"/></label>}
            {!locked && <label>Mật khẩu đăng nhập<input type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} minLength={12} maxLength={128} required value={loginPassword} onChange={event => setLoginPassword(event.target.value)} placeholder="Ít nhất 12 ký tự"/><small>Dùng cho tài khoản. Tách riêng với mật khẩu mở két.</small></label>}
            {(locked && authMode !== 'recovery' || !locked && authMode === 'register') && <label>Mật khẩu chính<input type="password" autoComplete="off" minLength={12} maxLength={128} required value={masterPassword} onChange={event => setMasterPassword(event.target.value)} placeholder="Ít nhất 12 ký tự"/><small>Mật khẩu chính không gửi lên máy chủ.</small></label>}
            {locked && authMode === 'recovery' && <label>Mã khôi phục<input type="password" autoComplete="off" required value={recoverySecret} onChange={event => setRecoverySecret(event.target.value.toUpperCase())} placeholder="Dạng XXXX-XXXX-…"/><small>Mã khôi phục mở khóa dữ liệu, không thay mật khẩu đăng nhập.</small></label>}
            {!locked && authMode === 'register' && <div className="recovery-notice"><strong>Trước khi tạo két: hãy lưu mã khôi phục</strong><p>Mất mật khẩu chính và mã này đồng nghĩa mất quyền mở dữ liệu. Mã chỉ hiện một lần.</p><code>{shownRecovery || 'Mã được tạo khi bạn chọn Tạo két mới'}</code><label className="check-row"><input type="checkbox" checked={savedRecovery} onChange={event => setSavedRecovery(event.target.checked)}/>Mình đã chép và cất mã ở nơi an toàn</label></div>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {statusText && <p className="form-hint" role="status">{statusText}</p>}
            <button className="primary-button full-button" disabled={busy}>{busy ? 'Đang xử lý…' : locked ? 'Mở két' : authMode === 'register' ? 'Tạo két an toàn' : 'Đăng nhập'}</button>
            {locked && <button type="button" className="text-button" disabled={busy} onClick={() => void logout()}>Đăng xuất</button>}
          </form>
          {!locked && <div className="trust-row"><span>⌁ Mã hóa trên thiết bị</span><span>◇ Riêng tư</span><span>↗ Miễn phí dùng thử</span></div>}
        </div>
      </section>
      <footer className="auth-footer">Được làm bằng sự cẩn thận tại Việt Nam <span>·</span> Bản thử nghiệm, vui lòng dùng dữ liệu giả</footer>
      {showHelp && <Modal title="Bảo vệ dữ liệu của bạn" onClose={() => setShowHelp(false)}><p>Nội dung két được mã hóa trên trình duyệt trước khi đồng bộ. Máy chủ local vẫn nhận email, thời điểm và kích thước bản mã.</p><p><strong>Hãy dùng dữ liệu giả trong bản thử nghiệm.</strong> Bản này chưa được đánh giá bảo mật độc lập.</p></Modal>}
    </main>;
  }

  if (status === 'unlocked' && !rootKey) return <main className="load-screen"><p>Đang mở khóa…</p></main>;

  return <main className="app-shell">
    <header className="topbar app-topbar"><a className="brand" href="/"><span className="brand-mark">K</span><span>Két Sắt Việt<small>KÉT CÁ NHÂN</small></span></a><div className="top-actions"><span className={`sync-pill ${online ? 'online' : 'offline'}`}><i/>{!online ? 'Ngoại tuyến' : pending ? 'Chưa đồng bộ' : 'Đã đồng bộ'}</span><button className="icon-button" title="Khóa két" aria-label="Khóa két ngay" onClick={() => lockVault()}>⌑</button><button className="avatar" aria-label={`Tài khoản ${email}`}>{email.slice(0,1).toUpperCase()}</button></div></header>
    <div className="app-layout">
      <aside className="sidebar"><button className={`side-link ${!showTrash ? 'active' : ''}`} onClick={() => setShowTrash(false)}><span>▦</span>Thông tin của tôi</button><button className={`side-link ${showTrash ? 'active' : ''}`} onClick={() => setShowTrash(v => !v)}><span>⌫</span>Thùng rác <small>{trashedEntries.length}</small></button><div className="side-divider"/><p className="side-label">AN TOÀN DỮ LIỆU</p><button className="side-link" onClick={() => setShowHistory(true)}><span>◷</span>Sao lưu & khôi phục</button><button className="side-link" onClick={() => void openSessions()}><span>◉</span>Phiên đăng nhập</button><button className="side-link" onClick={retrySync}><span>↻</span>Đồng bộ ngay</button><div className="sidebar-bottom"><div className="sidebar-note"><span>✳</span><p><b>Dữ liệu được mã hóa</b><small>Chỉ bạn mới mở được nội dung két.</small></p></div><button className="side-link" onClick={() => setShowHelp(true)}><span>?</span>Trợ giúp</button><button className="side-link" onClick={() => void logout()}><span>↪</span>Đăng xuất</button><button className="side-link danger-text" onClick={() => { setError(''); setDeleteEmailConfirmation(''); setDeleteLoginPassword(''); setShowDeleteAccount(true); }}><span>×</span>Xóa tài khoản</button></div></aside>
      <section className="vault-main">
        <div className="welcome-row"><div><p className="eyebrow">KHÔNG GIAN CỦA BẠN</p><h1>Một nơi cho mọi điều quan trọng.</h1><p className="muted">Ghi lại điều cần nhớ. Tìm thấy ngay khi cần.</p></div><div className="welcome-spark">✳</div></div>
        <div className="vault-stats"><div><span>Đang lưu</span><strong>{liveEntries.length}<small> mục</small></strong></div><div><span>Trạng thái đồng bộ</span><strong className="stat-sync"><i/>{pending ? 'Đang chờ' : online ? 'An toàn' : 'Ngoại tuyến'}</strong></div><div><span>Bản sao lưu ngoài máy</span><strong className="stat-backup">{lastBackup ? 'Đã tải về' : 'Chưa tải'} <button title="Tạo bản sao lưu" aria-label="Tạo bản sao lưu" onClick={() => void exportBackup()}>↗</button></strong></div></div>
        {statusText && <div className={`notice-bar ${pending ? 'notice-warn' : ''}`} role="status"><span>{pending ? '◷' : '✓'}</span><p>{statusText}</p>{pending && <button onClick={() => void retrySync()} disabled={busy}>Thử lại</button>}</div>}
        <div className="section-head"><div><h2>{showTrash ? 'Thùng rác' : 'Thông tin đã lưu'}</h2><p>{showTrash ? 'Mục đã xóa được giữ trong bản mã và đồng bộ giữa các thiết bị.' : 'Tìm nhanh trong két của bạn.'}</p></div>{!showTrash && <button className="primary-button add-button" onClick={addEntry}>＋ <span>Thêm thông tin</span></button>}</div>
        {!showTrash && <label className="searchbox"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc nội dung…" aria-label="Tìm trong két"/><kbd>⌘ K</kbd></label>}
        {showTrash ? <div className="entry-grid">{trashedEntries.length ? trashedEntries.map(entry => <article className="entry-card" key={entry.id}><span className="entry-icon">⌫</span><h3>{entry.title}</h3><p className="entry-category">Đã xóa {entry.deletedAt ? formatDate(entry.deletedAt) : ''}</p><button className="text-button" onClick={() => { const restored = entries.map(item => { if (item.id !== entry.id) return item; const { deletedAt: _deletedAt, ...active } = item; return { ...active, updatedAt: new Date().toISOString() }; }); void persist(restored).then(() => setShowTrash(false)); }}>Khôi phục</button></article>) : <EmptyState onAdd={() => setShowTrash(false)} title="Thùng rác đang trống" text="Mục đã xóa được giữ trong bản mã và đồng bộ giữa các thiết bị."/>}</div> : <div className="entry-grid">
          {visible.map(entry => <article className={`entry-card ${selected === entry.id ? 'expanded' : ''}`} key={entry.id}><button className="entry-open" onClick={() => setSelected(selected === entry.id ? null : entry.id)} aria-expanded={selected === entry.id}><span className={`entry-icon icon-${entry.category}`}>{entry.category === 'account' ? '⌘' : entry.category === 'identity' ? '▤' : entry.category === 'note' ? '☷' : '✳'}</span><div><p className="entry-category">{CATEGORIES.find(item => item.value === entry.category)?.label}</p><h3>{entry.title}</h3></div><span className="entry-chevron">{selected === entry.id ? '−' : '↗'}</span></button>{selected === entry.id && <div className="entry-details">{entry.note && <p className="entry-note">{entry.note}</p>}{entry.fields.map(field => <div className="detail-row" key={field.id}><span>{field.label}</span><div><strong>{field.sensitive ? '••••••••' : field.value}</strong>{field.value && <button title="Sao chép" aria-label={`Sao chép ${field.label}`} onClick={() => { void navigator.clipboard.writeText(field.value); setStatusText('Đã sao chép. Xóa clipboard thủ công nếu thiết bị dùng chung.'); }}>⧉</button>}{field.sensitive && <button className="show-secret" onClick={event => { const target = event.currentTarget.previousElementSibling; if (target) target.textContent = target.textContent === '••••••••' ? field.value : '••••••••'; }}>Hiện</button>}</div></div>)}<div className="entry-actions"><button onClick={() => setDraft(entry)}>Chỉnh sửa</button><button className="danger-text" onClick={() => void deleteEntry(entry)}>Chuyển vào thùng rác</button></div></div>}</article>)}
          {draft && !currentDraftInList && <article className="entry-card draft-card"><EntryForm entry={draft} busy={busy} onChange={setDraft} onSubmit={saveEntry} onCancel={() => setDraft(null)}/></article>}
          {visible.length === 0 && !draft && <EmptyState title={query ? 'Không tìm thấy thông tin' : 'Bắt đầu với một điều nhỏ'} text={query ? 'Thử từ khóa khác nhé.' : 'Thêm một mục đầu tiên để có nơi cất điều quan trọng.'} onAdd={addEntry}/ >}
        </div>}
        {draft && currentDraftInList && <div className="modal-backdrop"><div className="editor-modal"><EntryForm entry={draft} busy={busy} onChange={setDraft} onSubmit={saveEntry} onCancel={() => setDraft(null)}/></div></div>}
        <footer className="vault-footer"><span>⌁ Nội dung két được mã hóa trên trình duyệt</span><span>Bản thử nghiệm · Không lưu thông tin thật</span></footer>
      </section>
    </div>
    {conflict && <Modal title="Có thay đổi trên thiết bị khác" onClose={() => setConflict(null)}><p>Máy chủ đang ở phiên bản {conflict.remoteRevision}. Bản trên thiết bị này vẫn được giữ mã hóa cục bộ.</p><div className="compare-box"><div><b>Trên máy chủ</b><span>{conflict.remote.entries.length} mục</span></div><div><b>Trên thiết bị này</b><span>{conflict.local.entries.length} mục</span></div></div><div className="modal-actions"><button className="secondary-button" onClick={() => void useRemoteVersion()}>Dùng bản máy chủ</button><button className="primary-button" onClick={() => void keepBothVersions()}>Giữ cả hai bản</button></div><small>Giữ cả hai sẽ tạo bản sao riêng cho mục trùng tên và đồng bộ như phiên bản mới.</small></Modal>}
    {showSessions && <Modal title="Phiên đăng nhập" onClose={() => setShowSessions(false)}><p>Thu hồi phiên sẽ chặn các yêu cầu tiếp theo từ phiên đó. Các bản két đã tải xuống vẫn còn trên thiết bị.</p>{sessionsBusy && sessions.length === 0 ? <p>Đang tải phiên…</p> : sessions.length === 0 ? <p>Không còn phiên đăng nhập đang hoạt động.</p> : <div className="session-list">{sessions.map(session => <div className="history-row" key={session.sessionId}><div><b>{session.current ? 'Phiên hiện tại' : 'Phiên đăng nhập'}</b><small>Bắt đầu {formatDate(session.createdAt)}</small></div><button className="text-button danger-text" disabled={sessionsBusy} onClick={() => void revokeSession(session.sessionId)}>{session.current ? 'Đăng xuất' : 'Thu hồi'}</button></div>)}</div>}{sessionsError && <p className="form-error" role="alert">{sessionsError}</p>}<small>Prototype hiện chưa gắn phiên với danh tính thiết bị hoặc khóa ký thiết bị.</small></Modal>}
    {showHistory && <Modal title="Sao lưu & khôi phục" onClose={() => { setShowHistory(false); setBackupFile(null); setError(''); }}><p>Tải file sao lưu mã hóa về thiết bị. Bản sao lưu trên cùng máy chủ không bảo vệ khi máy chủ hoặc tài khoản lưu trữ bị mất.</p><div className="backup-actions"><button className="primary-button" onClick={() => void exportBackup()} disabled={busy}>↓ Tải bản sao lưu mã hóa</button><label className="secondary-button file-button">Chọn file để khôi phục<input type="file" accept="application/json,.json" onChange={event => void inspectBackup(event.target.files?.[0] ?? null)}/></label></div>{lastBackup && <p className="form-hint">{lastBackup}</p>}{error && <p className="form-error" role="alert">{error}</p>}{backupFile && <div className="backup-preview"><strong>Bản sao lưu hợp lệ</strong><span>{formatDate(backupFile.createdAt)} · {backupFile.snapshot.ciphertext.length.toLocaleString('vi-VN')} ký tự bản mã</span><button className="primary-button" disabled={busy} onClick={() => void restoreBackup()}>Khôi phục thành phiên bản mới</button></div>}<div className="history-list"><h3>Lịch sử đồng bộ gần đây</h3>{history.length === 0 ? <p>Chưa có phiên bản đồng bộ.</p> : history.map(row => <div className="history-row" key={row.revision}><div><b>Phiên bản {row.revision}</b><small>{formatDate(row.createdAt)}</small></div><button className="text-button" onClick={() => void restoreVersion(row)}>Khôi phục</button></div>)}</div><p className="modal-footnote">Tối đa 20 phiên bản đồng bộ trong bản thử nghiệm. Hãy giữ file sao lưu độc lập.</p></Modal>}
    {showDeleteAccount && <Modal title="Xóa tài khoản và dữ liệu" onClose={() => { setShowDeleteAccount(false); setError(''); setDeleteEmailConfirmation(''); setDeleteLoginPassword(''); }}><p>Thao tác này xóa tài khoản, các phiên đăng nhập và dữ liệu đồng bộ khỏi cơ sở dữ liệu ứng dụng. Không thể khôi phục sau khi xóa; xác nhận bằng email và mật khẩu đăng nhập.</p><p><strong>File backup đã tải xuống hoặc cache mã hóa trên thiết bị khác không thể xóa từ đây.</strong> Hãy lưu bản sao lưu trước nếu muốn giữ dữ liệu.</p><form className="entry-form" onSubmit={deleteAccount}><label>Nhập email tài khoản<input type="email" autoComplete="email" required value={deleteEmailConfirmation} onChange={event => setDeleteEmailConfirmation(event.target.value)} /></label><label>Mật khẩu đăng nhập<input type="password" autoComplete="current-password" required maxLength={128} value={deleteLoginPassword} onChange={event => setDeleteLoginPassword(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setShowDeleteAccount(false); setError(''); setDeleteEmailConfirmation(''); setDeleteLoginPassword(''); }} disabled={busy}>Hủy</button><button className="secondary-button danger-text" disabled={busy}>{busy ? 'Đang xóa…' : 'Xóa tài khoản vĩnh viễn'}</button></div></form></Modal>}
    {showHelp && <Modal title="Về bản thử nghiệm" onClose={() => setShowHelp(false)}><p>Đây là prototype local. Máy chủ SQLite và file sao lưu tự động nằm trên máy đang chạy ứng dụng; chưa có sao lưu ngoài máy chủ.</p><p>Dữ liệu két được mã hóa phía trình duyệt. Tài khoản dùng email và mật khẩu đăng nhập riêng. Mã khôi phục mở khóa dữ liệu, nhưng không thay mật khẩu đăng nhập.</p><p><strong>Chỉ dùng dữ liệu giả cho đến khi hoàn tất đánh giá bảo mật độc lập.</strong></p></Modal>}
  </main>;
}

function EmptyState({ title, text, onAdd }: { title: string; text: string; onAdd: () => void }) {
  return <div className="empty-state"><div className="empty-illustration">✳</div><h3>{title}</h3><p>{text}</p><button className="secondary-button" onClick={onAdd}>＋ Thêm thông tin</button></div>;
}

function EntryForm({ entry, busy, onChange, onSubmit, onCancel }: { entry: VaultEntry; busy: boolean; onChange: (entry: VaultEntry) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const updateField = (id: string, patch: Partial<VaultField>) => onChange({ ...entry, fields: entry.fields.map(field => field.id === id ? { ...field, ...patch } : field), updatedAt: new Date().toISOString() });
  const addField = () => { if (entry.fields.length >= 30) return; onChange({ ...entry, fields: [...entry.fields, { id: newId(), label: '', value: '', sensitive: false }], updatedAt: new Date().toISOString() }); };
  return <form className="entry-form" onSubmit={onSubmit}><div className="editor-head"><div><p className="eyebrow">THÔNG TIN CỦA BẠN</p><h2>{entry.title ? 'Chỉnh sửa thông tin' : 'Thêm thông tin mới'}</h2></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Đóng cửa sổ">×</button></div><label>Tiêu đề<input autoFocus required maxLength={200} value={entry.title} onChange={event => onChange({ ...entry, title: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Ví dụ: Tài khoản ngân hàng"/></label><label>Loại thông tin<select value={entry.category} onChange={event => onChange({ ...entry, category: event.target.value as VaultEntry['category'] })}>{CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label><label>Ghi chú<textarea rows={3} maxLength={10_000} value={entry.note} onChange={event => onChange({ ...entry, note: event.target.value })} placeholder="Thêm ngữ cảnh để bạn dễ nhớ…"/></label><div className="fields-heading"><div><h3>Trường thông tin</h3><p>Tự thêm những gì bạn muốn lưu.</p></div><button type="button" className="text-button" onClick={addField}>＋ Thêm trường</button></div>{entry.fields.map(field => <div className="custom-field" key={field.id}><div className="field-inputs"><label>Tên trường<input required maxLength={200} value={field.label} onChange={event => updateField(field.id, { label: event.target.value })} placeholder="Ví dụ: Số tài khoản"/></label><label>Giá trị<input maxLength={10_000} type={field.sensitive ? 'password' : 'text'} value={field.value} onChange={event => updateField(field.id, { value: event.target.value })} placeholder="Nhập nội dung"/></label></div><label className="check-row field-check"><input type="checkbox" checked={field.sensitive} onChange={event => updateField(field.id, { sensitive: event.target.checked })}/>Ẩn nội dung nhạy cảm</label><button type="button" className="text-button danger-text remove-field" onClick={() => onChange({ ...entry, fields: entry.fields.filter(item => item.id !== field.id) })}>Xóa trường</button></div>)}<div className="editor-actions"><button type="button" className="secondary-button" onClick={onCancel}>Hủy</button><button className="primary-button" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu thông tin'}</button></div></form>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-label={title}><div className="dialog-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Đóng">×</button></div><div className="dialog-body">{children}</div></section></div>;
}
