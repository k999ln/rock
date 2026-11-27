// 目的型の Agent「体調ノート」（docs/noah/spec-goal-health.md）。記録は端末だけ。病気の判断はしない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NOAH_GOAL_HEALTH_NOTICE, NOAH_GOAL_HEALTH_TARGET_DAYS, noahGoalHealthDate, noahGoalHealthEmpty, noahGoalHealthParse,
  noahGoalHealthProgress, noahGoalHealthRecord, noahGoalHealthReview, noahGoalHealthToday, noahGoalHealthWeek,
} from '../lib/noah-goal-health.ts';

const entry = (sleep, body, mood, note = '') => ({ sleep, body, mood, note });

void test('日付と週: 暦の日だけを受け、週は月曜から', () => {
  assert.equal(noahGoalHealthDate('2026-11-27'), true);
  for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '', null, '2026-11-27T00:00']) assert.equal(noahGoalHealthDate(bad), false, String(bad));
  assert.equal(noahGoalHealthWeek('2026-11-27'), '2026-11-23', '金曜 → その週の月曜');
  assert.equal(noahGoalHealthWeek('2026-11-23'), '2026-11-23', '月曜はそのまま');
  assert.equal(noahGoalHealthWeek('2026-11-29'), '2026-11-23', '日曜は前の月曜');
  assert.equal(noahGoalHealthWeek('2027-01-01'), '2026-12-28', '年をまたぐ');
  assert.equal(noahGoalHealthToday(new Date(2026, 10, 27, 7, 30)), '2026-11-27');
});

void test('記録: 1〜5 の数と 140 字までのメモ。同じ日は書き換える', () => {
  let log = noahGoalHealthEmpty('2026-11-23');
  log = noahGoalHealthRecord(log, '2026-11-23', entry(3, 4, 2, '  寝つきが悪かった  '));
  assert.deepEqual(log.entries['2026-11-23'], entry(3, 4, 2, '寝つきが悪かった'));
  log = noahGoalHealthRecord(log, '2026-11-23', entry(4, 4, 3));
  assert.deepEqual(Object.keys(log.entries), ['2026-11-23']);
  for (const bad of [entry(0, 3, 3), entry(6, 3, 3), entry(3.5, 3, 3), entry(3, 3, 3, 'あ'.repeat(141))]) {
    assert.throws(() => noahGoalHealthRecord(log, '2026-11-24', bad), /記録の形/);
  }
  assert.throws(() => noahGoalHealthRecord(log, '2026-02-30', entry(3, 3, 3)), /記録の形/);
});

void test('読み直し: 壊れた物は空に、読めた日だけ残す', () => {
  assert.deepEqual(noahGoalHealthParse(null, '2026-11-27'), noahGoalHealthEmpty('2026-11-27'));
  assert.deepEqual(noahGoalHealthParse('{', '2026-11-27'), noahGoalHealthEmpty('2026-11-27'));
  assert.deepEqual(noahGoalHealthParse(JSON.stringify({ schema: 'other', started: '2026-11-01', entries: {} }), '2026-11-27'), noahGoalHealthEmpty('2026-11-27'));
  const saved = JSON.stringify({ schema: 'noah-goal-health/1', started: '2026-11-01', entries: { '2026-11-02': entry(5, 5, 5), '2026-11-03': entry(9, 1, 1), bad: entry(1, 1, 1) } });
  assert.deepEqual(noahGoalHealthParse(saved, '2026-11-27').entries, { '2026-11-02': entry(5, 5, 5) });
});

void test('週の振り返り: 平均・先週との違い・いちばん高い日と低い日・メモ（助言は出さない）', () => {
  let log = noahGoalHealthEmpty('2026-11-16');
  for (const [date, e] of [['2026-11-16', entry(2, 2, 2)], ['2026-11-18', entry(3, 3, 3)], ['2026-11-23', entry(4, 3, 3, '散歩した')], ['2026-11-25', entry(2, 2, 1, '頭が重い')], ['2026-11-27', entry(5, 4, 4)]]) {
    log = noahGoalHealthRecord(log, date, e);
  }
  const review = noahGoalHealthReview(log, '2026-11-27');
  assert.equal(review.week, '2026-11-23');
  assert.equal(review.days, 3);
  assert.deepEqual(review.averages, { sleep: 3.7, body: 3, mood: 2.7 });
  assert.deepEqual(review.previous, { sleep: 2.5, body: 2.5, mood: 2.5 });
  assert.deepEqual(review.change, { sleep: 'up', body: 'up', mood: 'up' });
  assert.equal(review.best, '2026-11-27');
  assert.equal(review.hardest, '2026-11-25');
  assert.deepEqual(review.notes, [{ date: '2026-11-23', note: '散歩した' }, { date: '2026-11-25', note: '頭が重い' }]);
  const first = noahGoalHealthReview(noahGoalHealthRecord(noahGoalHealthEmpty('2026-11-27'), '2026-11-27', entry(3, 3, 3)), '2026-11-27');
  assert.deepEqual([first.days, first.previous, first.change, first.best, first.hardest], [1, null, null, null, null], '1 日だけ・先週が無い時は比べない');
});

void test('目的: 28 日分の記録で完成', () => {
  assert.equal(NOAH_GOAL_HEALTH_TARGET_DAYS, 28);
  let log = noahGoalHealthEmpty('2026-11-01');
  for (let day = 1; day <= 27; day++) log = noahGoalHealthRecord(log, `2026-11-${String(day).padStart(2, '0')}`, entry(3, 3, 3));
  assert.deepEqual(noahGoalHealthProgress(log), { days: 27, target: 28, done: false });
  log = noahGoalHealthRecord(log, '2026-11-28', entry(3, 3, 3));
  assert.deepEqual(noahGoalHealthProgress(log), { days: 28, target: 28, done: true });
});

void test('病気の判断・薬の指示をしない事と、記録を外へ送らない事を、画面に出す', () => {
  assert.match(NOAH_GOAL_HEALTH_NOTICE, /病気の判断や薬の指示はしません/);
  assert.match(NOAH_GOAL_HEALTH_NOTICE, /医師や薬剤師に相談/);
  assert.match(NOAH_GOAL_HEALTH_NOTICE, /この端末のブラウザにだけ保存し、Noahには送りません/);
  const lib = readFileSync(new URL('../lib/noah-goal-health.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /fetch\(|XMLHttpRequest|sendBeacon/, 'ロジックは通信しない');
});
