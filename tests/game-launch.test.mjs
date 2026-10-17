import test from 'node:test';
import assert from 'node:assert/strict';
import { gameLaunchUrl, gameTestIntent } from '../lib/game-launch.ts';
import { writeHomeIntent, takeHomeIntent } from '../lib/home-intent.ts';
void test('launch only targets the fixed public origin without user content or remote logging', () => {
  for (const p of ['low','standard']) {
    const u = new URL(gameLaunchUrl(p));
    assert.equal(u.origin,'https://fiveplay.lol');
    assert.equal(u.searchParams.has('log'),false);
  }
  assert.throws(()=>gameLaunchUrl('https://evil.example'));
});
void test('manual results stay one-shot and expire through existing Zema handoff', () => {
  const m = new Map(); const s={setItem:(k,v)=>m.set(k,v),getItem:k=>m.get(k)??null,removeItem:k=>m.delete(k)};
  const value=gameTestIntent('low','起動せず');
  assert.match(value,/手動記録/);
  writeHomeIntent(s,value,1000);
  assert.equal(takeHomeIntent(s,1001),value);
  assert.equal(takeHomeIntent(s,1002),'');
  writeHomeIntent(s,value,1000);
  assert.equal(takeHomeIntent(s,601001),'');
  assert.throws(()=>gameTestIntent('low',''));
  assert.throws(()=>gameTestIntent('low','a'.repeat(1201)));
});
