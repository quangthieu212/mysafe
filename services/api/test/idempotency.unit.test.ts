import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashCanonicalJson } from '../src/database/idempotency.js';

test('canonical request hashes ignore object key order but retain array order', () => {
  const left = hashCanonicalJson({ vaultId: 'v1', item: { nonce: 'n', ciphertext: 'c' } });
  const right = hashCanonicalJson({ item: { ciphertext: 'c', nonce: 'n' }, vaultId: 'v1' });
  const reorderedArray = hashCanonicalJson({ vaultId: 'v1', item: ['n', 'c'] });

  assert.deepEqual(left, right);
  assert.notDeepEqual(left, reorderedArray);
});

test('canonical request hashes omit undefined object properties', () => {
  assert.deepEqual(
    hashCanonicalJson({ id: undefined, ciphertext: 'abc' }),
    hashCanonicalJson({ ciphertext: 'abc' }),
  );
});
