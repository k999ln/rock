// 「体調ノート」の知らせは、押したボタンのすぐ下に出る（2026-11-28。スマホでは、ページの上に出すと画面の外になって見えなかった）。
// 保存の知らせは「今朝の記録」の中、全部消すの知らせは「記録の持ち出しと削除」の中。保存できない時の文も同じ所。
import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
import * as health from '../lib/noah-goal-health.ts';

function setup({ saved = null, blocked = false } = {}) {
  let text = saved;
  const store = {
    noahGoalHealthSaved: () => text,
    noahGoalHealthSubscribe: () => () => undefined,
    noahGoalHealthWrite: (next) => { text = next; return !blocked; },
  };
  const ui = screen({
    modules: { '@/lib/noah-goal-health': { ...health, noahGoalHealthToday: () => '2026-11-28' }, '@/lib/noah-goal-health-store': store },
    fetch: () => { throw new Error('通信しない'); },
  });
  return ui.mount('components/noah-goal-health.tsx', {});
}
const section = (page, id) => page.find('section').find((node) => node.props['aria-labelledby'] === id);
const pick = (page, question, step) => page.find('button').find((node) => String(node.props['aria-label'] ?? '').startsWith(`${question}: ${step}`));
async function record(page) {
  await page.press(pick(page, 'よく眠れましたか', 4)); await page.press(pick(page, '体の調子はどうですか', 3)); await page.press(pick(page, '気分はどうですか', 4));
  await page.press(page.find('button', 'この端末に保存する')[0]); await page.flush();
}

void test('保存の知らせは「今朝の記録」の中、全部消すの知らせは「記録の持ち出しと削除」の中に出る', async () => {
  const page = setup();
  await page.flush();
  await record(page);
  assert.match(page.text(section(page, 'health-today')), /11月28日の記録を、この端末に保存しました。/);
  assert.doesNotMatch(page.text(section(page, 'health-data')), /保存しました/);
  await page.press(page.find('button', 'この端末の記録を全部消す')[0]); await page.flush();
  await page.press(page.find('button', 'もう一度押すと、全部消します')[0]); await page.flush();
  assert.match(page.text(section(page, 'health-data')), /この端末の記録を、全部消しました。/);
  assert.doesNotMatch(page.text(section(page, 'health-today')), /保存しました|消しました/, '前の知らせは残らない');
});

void test('保存できない時の文も、保存のボタンの下に出る（読み上げにも伝わる alert）', async () => {
  const page = setup({ blocked: true });
  await page.flush();
  await record(page);
  const alerts = page.find('p').filter((node) => node.props.role === 'alert');
  assert.equal(alerts.length, 1);
  assert.ok(page.nodes(section(page, 'health-today')).includes(alerts[0]));
  assert.match(page.text(alerts[0]), /端末には保存できませんでした/);
});
