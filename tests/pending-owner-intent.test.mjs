import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingOwnerStatus, isDefinitivePendingSaveFailure } from '../lib/pending-owner-intent.ts';
import { OWNER_CHANGED } from '../lib/owner-intent.ts';

void test('pending owner intent separates unknown identity, mismatch and exact match', () => {
  const owner = 'owner-v1:' + 'a'.repeat(64);
  assert.equal(pendingOwnerStatus(owner, null), 'unknown');
  assert.equal(pendingOwnerStatus(owner, 'owner-v1:' + 'b'.repeat(64)), 'changed');
  assert.equal(pendingOwnerStatus(owner, owner), 'matching');
});

void test('only definitive validation failures release business pending saves', () => {
  for (const status of [0, 200, 201, 401, 403, 408, 429, 500, 502, 503, 504])
    assert.equal(isDefinitivePendingSaveFailure(status), false, String(status));
  for (const status of [400, 404, 409, 413, 415]) {
    assert.equal(isDefinitivePendingSaveFailure(status), true, String(status));
    assert.equal(isDefinitivePendingSaveFailure(status, OWNER_CHANGED), false, `owner changed ${status}`);
  }
});
