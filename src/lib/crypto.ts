'use client';

import { argon2id } from 'hash-wasm';
import type { CipherEnvelope, VaultSnapshot } from './vault';

const KDF = { name: 'argon2id', iterations: 3, memorySize: 65_536, parallelism: 1, hashLength: 32, version: 19 } as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Tệp sao lưu có dữ liệu mã hóa không hợp lệ.');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function deriveWrappingKey(secret: string, salt: Uint8Array, normalization?: 'NFKC'): Promise<CryptoKey> {
  const normalizedSecret = normalization === 'NFKC' ? secret.normalize('NFKC') : secret;
  const raw = await argon2id({ password: encoder.encode(normalizedSecret), salt, ...KDF, outputType: 'binary' }) as Uint8Array;
  try {
    return await crypto.subtle.importKey('raw', asBufferSource(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0);
  }
}

async function wrapKey(rootKey: Uint8Array, secret: string, purpose: 'master' | 'recovery', vaultId: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveWrappingKey(secret, salt, 'NFKC');
  const aad = encoder.encode(`ket-sat-viet|${purpose}|v1|${vaultId}`);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBufferSource(iv), additionalData: asBufferSource(aad), tagLength: 128 }, key, asBufferSource(rootKey));
  return { version: 1 as const, purpose, kdf: KDF, normalization: 'NFKC' as const, salt: b64url(salt), iv: b64url(iv), ciphertext: b64url(new Uint8Array(ciphertext)) };
}

async function unwrapKey(wrapped: WrappedRootKey, secret: string, vaultId: string): Promise<Uint8Array> {
  if (wrapped.version !== 1 || (wrapped.normalization !== undefined && wrapped.normalization !== 'NFKC') || wrapped.kdf?.name !== 'argon2id' || wrapped.kdf.memorySize > 131_072 || wrapped.kdf.iterations > 6 || wrapped.kdf.parallelism > 4 || wrapped.kdf.hashLength !== 32) {
    throw new Error('Thiết lập bảo vệ khóa trong bản sao không được hỗ trợ.');
  }
  const key = await deriveWrappingKey(secret, fromB64url(wrapped.salt), wrapped.normalization);
  const purpose = wrapped.purpose;
  const aad = encoder.encode(`ket-sat-viet|${purpose}|v1|${vaultId}`);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBufferSource(fromB64url(wrapped.iv)), additionalData: asBufferSource(aad), tagLength: 128 }, key, asBufferSource(fromB64url(wrapped.ciphertext)));
    return new Uint8Array(plaintext);
  } catch {
    throw new Error('Không mở được két. Hãy kiểm tra mật khẩu hoặc mã khôi phục.');
  }
}

export interface WrappedRootKey {
  version: 1;
  purpose: 'master' | 'recovery';
  kdf: typeof KDF;
  /** Missing on legacy descriptors, which must retain their original raw-secret derivation. */
  normalization?: 'NFKC';
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface VaultDescriptor {
  format: 'ksv-descriptor-v1';
  vaultId: string;
  masterWrappedRoot: WrappedRootKey;
  recoveryWrappedRoot: WrappedRootKey;
}

export interface VaultBackup {
  format: 'ket-sat-viet-backup-v1';
  createdAt: string;
  descriptor: VaultDescriptor;
  snapshot: CipherEnvelope;
}

export async function createDescriptor(vaultId: string, masterPassword: string, recoverySecret: string): Promise<{ descriptor: VaultDescriptor; rootKey: Uint8Array }> {
  const rootKey = randomBytes(32);
  try {
    const descriptor: VaultDescriptor = {
      format: 'ksv-descriptor-v1',
      vaultId,
      masterWrappedRoot: await wrapKey(rootKey, masterPassword, 'master', vaultId),
      recoveryWrappedRoot: await wrapKey(rootKey, recoverySecret, 'recovery', vaultId),
    };
    return { descriptor, rootKey };
  } catch (error) {
    rootKey.fill(0);
    throw error;
  }
}

export async function unlockDescriptor(descriptor: VaultDescriptor, secret: string, method: 'master' | 'recovery'): Promise<Uint8Array> {
  const wrapped = method === 'master' ? descriptor.masterWrappedRoot : descriptor.recoveryWrappedRoot;
  return unwrapKey(wrapped, secret, descriptor.vaultId);
}

export async function encryptSnapshot(snapshot: VaultSnapshot, vaultId: string, rootKey: Uint8Array): Promise<CipherEnvelope> {
  const snapshotId = crypto.randomUUID();
  const iv = randomBytes(12);
  const key = await crypto.subtle.importKey('raw', asBufferSource(rootKey), 'AES-GCM', false, ['encrypt']);
  const aad = encoder.encode(`ket-sat-viet|snapshot|v1|${vaultId}|${snapshotId}`);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBufferSource(iv), additionalData: asBufferSource(aad), tagLength: 128 }, key, asBufferSource(encoder.encode(JSON.stringify(snapshot))));
  return { format: 'ksv-aesgcm-v1', vaultId, snapshotId, iv: b64url(iv), ciphertext: b64url(new Uint8Array(ciphertext)) };
}

export async function decryptSnapshot(envelope: CipherEnvelope, rootKey: Uint8Array): Promise<VaultSnapshot> {
  const key = await crypto.subtle.importKey('raw', asBufferSource(rootKey), 'AES-GCM', false, ['decrypt']);
  const aad = encoder.encode(`ket-sat-viet|snapshot|v1|${envelope.vaultId}|${envelope.snapshotId}`);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBufferSource(fromB64url(envelope.iv)), additionalData: asBufferSource(aad), tagLength: 128 }, key, asBufferSource(fromB64url(envelope.ciphertext)));
    const value: unknown = JSON.parse(decoder.decode(plaintext));
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('entries' in value) || !Array.isArray(value.entries)) throw new Error();
    return value as VaultSnapshot;
  } catch {
    throw new Error('Bản mã bị hỏng hoặc không thuộc két này.');
  }
}

export function makeRecoverySecret(): string {
  const text = b64url(randomBytes(24)).toUpperCase();
  return text.match(/.{1,4}/g)!.join('-');
}

export function makeBackup(descriptor: VaultDescriptor, snapshot: CipherEnvelope): VaultBackup {
  return { format: 'ket-sat-viet-backup-v1', createdAt: new Date().toISOString(), descriptor, snapshot };
}

export function validateBackup(value: unknown): VaultBackup {
  if (!value || typeof value !== 'object') throw new Error('Tệp sao lưu không hợp lệ.');
  const backup = value as Partial<VaultBackup>;
  if (backup.format !== 'ket-sat-viet-backup-v1' || !backup.descriptor || backup.descriptor.format !== 'ksv-descriptor-v1' || !backup.snapshot || backup.snapshot.format !== 'ksv-aesgcm-v1' || backup.snapshot.vaultId !== backup.descriptor.vaultId || typeof backup.createdAt !== 'string') {
    throw new Error('Tệp không phải bản sao lưu Két Sắt Việt được hỗ trợ.');
  }
  const serialized = JSON.stringify(value);
  if (encoder.encode(serialized).byteLength > 3 * 1024 * 1024) throw new Error('Tệp sao lưu vượt quá giới hạn 3 MiB.');
  return backup as VaultBackup;
}

export function clearRootKey(rootKey: Uint8Array) { rootKey.fill(0); }
