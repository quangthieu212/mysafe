'use client';

import type { VaultDescriptor, VaultBackup } from './crypto';
import type { CipherEnvelope, VaultEntry } from './vault';

const DB_NAME = 'ksv-encrypted-cache-v1';
const STORE = 'vaults';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'email' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Trình duyệt chưa mở được kho bản mã cục bộ.'));
  });
}

export interface CachedVault {
  email: string;
  descriptor: VaultDescriptor;
  envelope: CipherEnvelope;
  revision: number;
  entries: VaultEntry[];
  updatedAt: string;
  pending?: boolean;
}

export async function readCache(email: string): Promise<CachedVault | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(email);
      request.onsuccess = () => resolve((request.result as CachedVault | undefined) ?? null);
      request.onerror = () => reject(new Error('Không đọc được bản mã cục bộ.'));
    });
  } finally { db.close(); }
}

export async function readLatestCache(): Promise<CachedVault | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).getAll();
      request.onsuccess = () => {
        const caches = request.result as CachedVault[];
        caches.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        resolve(caches[0] ?? null);
      };
      request.onerror = () => reject(new Error('Không đọc được bản mã cục bộ.'));
    });
  } finally { db.close(); }
}

export async function writeCache(cache: CachedVault): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(cache);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Không lưu được bản mã trên thiết bị.'));
      tx.onabort = () => reject(new Error('Việc lưu cục bộ đã bị hủy.'));
    });
  } finally { db.close(); }
}

export async function deleteCache(email: string): Promise<void> {
  const db = await openDb();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(email); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}

export function downloadBackup(backup: VaultBackup) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `ket-sat-viet-${backup.createdAt.slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
