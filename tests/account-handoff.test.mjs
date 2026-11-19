import test from 'node:test';
import assert from 'node:assert/strict';
import { resetAccountHandoffs } from '../lib/account-handoff.ts';
import { HOME_INTENT_KEY } from '../lib/home-intent.ts';
import { SKY_ZEMA_HANDOFF_KEY } from '../lib/sky-zema-handoff.ts';
void test('logout clears only unsent handoffs and preserves unrelated settings and saved state', () => {
  const data = new Map([
    [HOME_INTENT_KEY, 'unsent home request'],
    [SKY_ZEMA_HANDOFF_KEY, 'unsent Tool handoff'],
    ['draft.other', 'keep'],
    ['theme', 'keep'],
  ]);
  resetAccountHandoffs({
    removeItem(key) {
      data.delete(key);
    },
  });
  assert.deepEqual([...data.keys()], ['draft.other', 'theme']);
});
