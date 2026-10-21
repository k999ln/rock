import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOME_INTENT_KEY,
  writeHomeIntent,
  takeHomeIntent,
} from '../lib/home-intent.ts';
function storage() {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
}
void test('intent handoff stays in the tab, trims input, and is consumed once', () => {
  const s = storage();
  writeHomeIntent(s, '  出典を整理したい  ', 100);
  assert.equal(takeHomeIntent(s, 101), '出典を整理したい');
  assert.equal(takeHomeIntent(s, 101), '');
});
void test('expired, future, malformed and oversized handoffs are removed without populating the composer', () => {
  for (const raw of [
    '{',
    JSON.stringify({ text: 'secret', at: 0 }),
    JSON.stringify({ text: 'secret', at: 9999999 }),
    JSON.stringify({ text: 'a'.repeat(2001), at: 700000 }),
    JSON.stringify({ text: ' ', at: 700000 }),
    JSON.stringify({ text: [], at: 700000 }),
  ]) {
    const s = storage();
    s.setItem(HOME_INTENT_KEY, raw);
    assert.equal(takeHomeIntent(s, 700001), '');
    assert.equal(s.getItem(HOME_INTENT_KEY), null);
  }
});
void test('invalid input and storage failures do not imply a successful handoff', () => {
  for (const text of ['', '  ', 'a'.repeat(2001)])
    assert.throws(() => writeHomeIntent(storage(), text));
  assert.throws(() =>
    writeHomeIntent(
      {
        setItem: () => {
          throw new Error('blocked');
        },
      },
      '私の依頼',
    ),
  );
});
