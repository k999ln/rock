// つなぐ前・頼む前の上限。docs/design-validation/noah/noah-form.test.mjs の 1 群を移した（L3。切り替えが、この数を読むため）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { NOAH_ASK_LIMITS, NOAH_HOST_BUSY, noahAskGate, noahConnectGate } from '../lib/noah-limits.ts';

void test('頼む前・つなぐ前の上限: 上から順に、最初に越えた物を返す', () => {
  const at = (counts) => { const g = noahAskGate({ open: 0, lastMinute: 0, lastDay: 0, hostLastMinute: 0, ...counts }); return g.ok ? 'ok' : `${g.status}:${g.code}`; };
  assert.equal(at({}), 'ok');
  assert.equal(at({ open: NOAH_ASK_LIMITS.open - 1, lastMinute: NOAH_ASK_LIMITS.perMinute - 1, lastDay: NOAH_ASK_LIMITS.perDay - 1, hostLastMinute: NOAH_ASK_LIMITS.hostPerMinute - 1 }), 'ok');
  assert.equal(at({ open: 8 }), '409:open');
  assert.equal(at({ lastMinute: 10 }), '429:minute');
  assert.equal(at({ lastDay: 200 }), '429:day');
  assert.equal(at({ hostLastMinute: 30 }), '429:host');
  assert.equal(at({ open: 8, lastMinute: 10, lastDay: 200, hostLastMinute: 30 }), '409:open');
  assert.equal(noahAskGate({ open: 0, lastMinute: 0, lastDay: 0, hostLastMinute: 30 }).message, 'この Agent は、今こんでいます。少し待ってから試してください。');
  assert.equal(noahAskGate({ open: 0, lastMinute: 3, lastDay: 0, hostLastMinute: 0 }, { ...NOAH_ASK_LIMITS, perMinute: 3 }).ok, false, '上限は差し替えられる（本人が変える数）');
  assert.equal(noahAskGate({ open: 0, lastMinute: 0, lastDay: 0, hostLastMinute: 30 }).message, NOAH_HOST_BUSY, '接続先の枠が取れない時と、同じ文');

  // つなぐ前: 切っていない接続の数・直近 60 秒に作った数・直近 24 時間に作った数
  const link = (counts) => { const g = noahConnectGate({ live: 0, lastMinute: 0, lastDay: 0, ...counts }); return g.ok ? 'ok' : `${g.status}:${g.code}`; };
  assert.equal(link({}), 'ok');
  assert.equal(link({ live: NOAH_ASK_LIMITS.connectLive - 1, lastMinute: NOAH_ASK_LIMITS.connectPerMinute - 1, lastDay: NOAH_ASK_LIMITS.connectPerDay - 1 }), 'ok');
  assert.deepEqual([link({ live: 50 }), link({ lastMinute: 10 }), link({ lastDay: 100 }), link({ live: 50, lastMinute: 10, lastDay: 100 })], ['409:live', '429:minute', '429:day', '409:live']);
  assert.equal(noahConnectGate({ live: 0, lastMinute: 2, lastDay: 0 }, { ...NOAH_ASK_LIMITS, connectPerMinute: 2 }).ok, false);
  assert.equal(noahConnectGate({ live: 50, lastMinute: 0, lastDay: 0 }).message, 'つながっているものが多すぎます。使っていないものを切ってください。');
  assert.ok(NOAH_ASK_LIMITS.hostHandshakes >= NOAH_ASK_LIMITS.hostPerMinute, '接続先の枠は、依頼の握手も数えるので、依頼の上限より小さくしない');
});
