import { z } from 'zod';

export const MAX_ITEMS = 200;
export const MAX_FIELDS = 30;
export const MAX_TITLE = 200;
export const MAX_LABEL = 200;
export const MAX_VALUE = 10_000;
export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
export const MAX_HISTORY_REVISIONS = 20;

export const VaultFieldSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(MAX_LABEL),
  value: z.string().max(MAX_VALUE),
  sensitive: z.boolean(),
});

export const VaultEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(MAX_TITLE),
  note: z.string().max(MAX_VALUE),
  category: z.enum(['account', 'identity', 'note', 'custom']),
  fields: z.array(VaultFieldSchema).max(MAX_FIELDS),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});

export const VaultSnapshotSchema = z.object({
  version: z.literal(1),
  entries: z.array(VaultEntrySchema).max(MAX_ITEMS),
});

export type VaultField = z.infer<typeof VaultFieldSchema>;
export type VaultEntry = z.infer<typeof VaultEntrySchema>;
export type VaultSnapshot = z.infer<typeof VaultSnapshotSchema>;

export const CipherEnvelopeSchema = z.object({
  format: z.literal('ksv-aesgcm-v1'),
  vaultId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
  ciphertext: z.string().min(1).max(Math.ceil(MAX_SNAPSHOT_BYTES * 1.5)),
});
export type CipherEnvelope = z.infer<typeof CipherEnvelopeSchema>;

export function validateSnapshot(value: unknown): VaultSnapshot {
  const result = VaultSnapshotSchema.safeParse(value);
  if (!result.success) throw new Error('Dữ liệu két sắt không hợp lệ hoặc vượt giới hạn.');
  return result.data;
}

export function encodedEnvelopeSize(envelope: CipherEnvelope): number {
  return new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
}
