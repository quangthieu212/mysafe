import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSnapshot } from '../src/lib/vault';

const validEntry = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  title: 'Tài khoản email',
  note: '',
  category: 'account',
  fields: [{ id: '550e8400-e29b-41d4-a716-446655440000', label: 'Tên đăng nhập', value: 'demo@example.test', sensitive: false }],
  updatedAt: '2026-10-29T12:00:00.000Z',
};

test('accepts text records with custom fields', () => {
  const snapshot = validateSnapshot({ version: 1, entries: [validEntry] });
  assert.equal(snapshot.entries[0].fields[0].value, 'demo@example.test');
});

test('rejects a field with a blank label or invalid sensitivity flag', () => {
  assert.throws(() => validateSnapshot({ version: 1, entries: [{ ...validEntry, fields: [{ ...validEntry.fields[0], label: '  ' }] }] }));
  assert.throws(() => validateSnapshot({ version: 1, entries: [{ ...validEntry, fields: [{ ...validEntry.fields[0], sensitive: 'yes' }] }] }));
});

test('enforces item and field limits', () => {
  assert.throws(() => validateSnapshot({ version: 1, entries: Array.from({ length: 201 }, (_, i) => ({ ...validEntry, id: `f47ac10b-58cc-4372-a567-${String(i).padStart(12, '0')}` })) }));
  assert.throws(() => validateSnapshot({ version: 1, entries: [{ ...validEntry, fields: Array.from({ length: 31 }, () => validEntry.fields[0]) }] }));
});
