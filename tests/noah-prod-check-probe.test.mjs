// 本番の確かめの道具（scripts/noah-prod-check.mjs）の API の probe の判定。通信しない。
// 2026-11-28 の本番: /api/sky/commerce/[action] が 503「決済の接続設定が完了していません。」（本番の決済は、本人がまだ設定していない）。
// これは壊れているのではないので、落ちにせず「設定していない」として別に出す。ほかの 500 番台・応答なしは、今までどおり落ち。
import test from 'node:test';
import assert from 'node:assert/strict';
import { noahProbeVerdict } from '../scripts/noah-prod-check.mjs';

void test('設定していないだけの 503 は落ちにしない。ほかの 500 番台と応答なしは落ち', () => {
  const unconfigured = { route: '/api/sky/commerce/[action]', who: 'anon', status: 503, error: '決済の接続設定が完了していません。' };
  assert.deepEqual(noahProbeVerdict([{ route: '/api/noah/intake', who: 'anon', status: 200, error: null }, unconfigured]),
    { ok: true, counts: { 200: 1, 503: 1 }, broken: [], unconfigured: ['anon 503 /api/sky/commerce/[action]'] });
  for (const bad of [
    { route: '/api/x', who: 'anon', status: 503, error: '決済用データを読み込めませんでした。' },
    { route: '/api/x', who: 'anon', status: 503, error: null },
    { route: '/api/x', who: 'browser', status: 500, error: '決済の接続設定が完了していません。' },
    { route: '/api/x', who: 'anon', status: -1, error: null },
  ]) {
    const verdict = noahProbeVerdict([bad]);
    assert.equal(verdict.ok, false, JSON.stringify(bad));
    assert.deepEqual(verdict.broken, [`${bad.who} ${bad.status} /api/x`]);
    assert.deepEqual(verdict.unconfigured, []);
  }
});
