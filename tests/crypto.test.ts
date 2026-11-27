import assert from 'node:assert/strict';
import test from 'node:test';
import { createDescriptor, decryptSnapshot, encryptSnapshot, makeBackup, makeRecoverySecret, unlockDescriptor, validateBackup } from '../src/lib/crypto';
import type { VaultSnapshot } from '../src/lib/vault';

const vaultId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const snapshot: VaultSnapshot = { version: 1, entries: [] };

test('encrypts snapshots and rejects tampering', async () => {
  const rootKey = crypto.getRandomValues(new Uint8Array(32));
  const envelope = await encryptSnapshot(snapshot, vaultId, rootKey);
  assert.deepEqual(await decryptSnapshot(envelope, rootKey), snapshot);
  await assert.rejects(decryptSnapshot({ ...envelope, snapshotId: '550e8400-e29b-41d4-a716-446655440000' }, rootKey));
});

test('master password and recovery code unlock the same vault key', async () => {
  const recovery = makeRecoverySecret();
  const { descriptor, rootKey } = await createDescriptor(vaultId, 'correct horse battery staple', recovery);
  try {
    assert.deepEqual(await unlockDescriptor(descriptor, 'correct horse battery staple', 'master'), rootKey);
    assert.deepEqual(await unlockDescriptor(descriptor, recovery, 'recovery'), rootKey);
    await assert.rejects(unlockDescriptor(descriptor, 'incorrect', 'master'));
  } finally {
    rootKey.fill(0);
  }
});

test('backup validation requires a matching descriptor and snapshot vault', async () => {
  const { descriptor, rootKey } = await createDescriptor(vaultId, 'correct horse battery staple', makeRecoverySecret());
  try {
    const envelope = await encryptSnapshot(snapshot, vaultId, rootKey);
    const backup = makeBackup(descriptor, envelope);
    assert.equal(validateBackup(backup).snapshot.snapshotId, envelope.snapshotId);
    assert.throws(() => validateBackup({ ...backup, snapshot: { ...envelope, vaultId: '550e8400-e29b-41d4-a716-446655440000' } }));
  } finally {
    rootKey.fill(0);
  }
});
