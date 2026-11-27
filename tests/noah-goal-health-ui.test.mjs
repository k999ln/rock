// 「体調ノート」の画面（components/noah-goal-health.tsx）。ブラウザなしで動かす台（tests/fixtures/noah/screen.mjs）で、
// 記録 → 振り返り → 書き直し → 全部消す、と、端末に保存できない時に黙って捨てない事を確かめる。通信はしない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
import * as health from '../lib/noah-goal-health.ts';

function setup({ saved = null, blocked = false } = {}) {
  let text = saved;
  const writes = [];
  const store = {
    noahGoalHealthSaved: () => text,
    noahGoalHealthSubscribe: () => () => undefined,
    noahGoalHealthWrite: (next) => { writes.push(next); text = next; return !blocked; },
  };
  const ui = screen({
    modules: { '@/lib/noah-goal-health': { ...health, noahGoalHealthToday: () => '2026-11-27' }, '@/lib/noah-goal-health-store': store },
    fetch: () => { throw new Error('通信しない'); },
  });
  return { ui, writes, page: ui.mount('components/noah-goal-health.tsx', {}) };
}
const pick = (page, question, step) => page.find('button').find((node) => String(node.props['aria-label'] ?? '').startsWith(`${question}: ${step}`));

void test('記録すると、この端末に保存し、週の振り返りと目的までの日数に出る', async () => {
  const { ui, writes, page } = setup();
  await page.flush();
  assert.match(page.text(), /病気の判断や薬の指示はしません/);
  assert.equal(page.find('button', 'この端末に保存する')[0].props.disabled, true, '3 つ選ぶまで保存できない');
  await page.press(pick(page, 'よく眠れましたか', 4)); await page.press(pick(page, '体の調子はどうですか', 3)); await page.press(pick(page, '気分はどうですか', 2));
  await page.change(page.find('textarea')[0], '少し肩がこっている');
  assert.equal(page.find('button', 'この端末に保存する')[0].props.disabled, false);
  await page.press(page.find('button', 'この端末に保存する')[0]); await page.flush();
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0]).entries['2026-11-27'], { sleep: 4, body: 3, mood: 2, note: '少し肩がこっている' });
  assert.match(page.text(), /11月27日の記録を、この端末に保存しました/);
  assert.match(page.text(), /1 \/ 28 日分/);
  assert.match(page.text(), /今週は1日分の記録があります/);
  assert.match(page.text(), /睡眠 4・体 3・気分 2/);
  assert.equal(ui.calls.length, 0, '通信しない');
});

void test('保存してある今日の記録は、選んだ状態で開き、書き直せる。全部消すは 2 回押す', async () => {
  const saved = JSON.stringify({ schema: 'noah-goal-health/1', started: '2026-11-20', entries: { '2026-11-27': { sleep: 2, body: 2, mood: 2, note: '' }, '2026-11-20': { sleep: 3, body: 3, mood: 3, note: '' } } });
  const { writes, page } = setup({ saved });
  await page.flush();
  assert.equal(pick(page, 'よく眠れましたか', 2).props['aria-pressed'], true);
  await page.press(pick(page, 'よく眠れましたか', 5));
  await page.press(page.find('button', 'この端末に保存する')[0]); await page.flush();
  assert.equal(JSON.parse(writes.at(-1)).entries['2026-11-27'].sleep, 5);
  assert.match(page.text(), /2 \/ 28 日分/);
  await page.press(page.find('button', 'この端末の記録を全部消す')[0]); await page.flush();
  assert.equal(writes.length, 1, '1 回目は消さない');
  await page.press(page.find('button', 'もう一度押すと、全部消します')[0]); await page.flush();
  assert.equal(writes.at(-1), null);
  assert.match(page.text(), /この端末の記録を、全部消しました/);
});

void test('端末に保存できない時は、そう伝える（黙って捨てない）', async () => {
  const { page } = setup({ blocked: true });
  await page.flush();
  await page.press(pick(page, 'よく眠れましたか', 3)); await page.press(pick(page, '体の調子はどうですか', 3)); await page.press(pick(page, '気分はどうですか', 3));
  await page.press(page.find('button', 'この端末に保存する')[0]); await page.flush();
  assert.match(page.text(), /端末には保存できませんでした/);
});
