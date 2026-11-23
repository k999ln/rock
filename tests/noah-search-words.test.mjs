import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOAH_SEARCH_SYNONYMS, noahSearchMatcher, noahSearchTerms } from '../lib/noah-search-terms.ts';

// task 129 の D11: よく頼まれる仕事の語 70 個を、本番の「すべて」1,957 件（2026-11-22 に読んだ物）に当てると、
// 15 個が 0 件だった（プレゼン・スライド・予約・価格・比較・宿題・SNS・運動・ダイエット・タスク・メモ・日記・
// カスタマーサポート・電話・占い）。英語の語幹を足して、どれも 1 件以上になるようにした。
const cards = [
  'Slide Builder | Turn notes into a PowerPoint deck',
  'Table Booking | Reserve a table and manage appointments',
  'Price Watch | Track product pricing and compare offers',
  'Homework Helper | Step-by-step tutor for school assignments',
  'Social Poster | Schedule posts to Instagram, TikTok and LinkedIn',
  'Workout Coach | Daily exercise and fitness plans',
  'Diet Log | Count calories and track nutrition',
  'Todo Agent | Turn chats into tasks',
  'Notion Notes | Save notes to Notion',
  'Journal Bot | Write a daily diary entry',
  'Helpdesk AI | Answer customer support tickets',
  'Phone Agent | Make phone calls and send SMS',
  'Tarot Reader | Daily tarot and horoscope',
].map((line) => line.toLowerCase());
const hits = (query) => cards.filter(noahSearchMatcher(noahSearchTerms(query)));

await test('0 件だった 15 個の語が、関係のある Agent に当たる', () => {
  const expected = {
    プレゼン: 'slide builder', スライド: 'slide builder', 予約: 'table booking', 価格: 'price watch', 比較: 'price watch',
    宿題: 'homework helper', SNS: 'social poster', 運動: 'workout coach', ダイエット: 'diet log', タスク: 'todo agent',
    メモ: 'notion notes', 日記: 'journal bot', カスタマーサポート: 'helpdesk ai', 電話: 'phone agent', 占い: 'tarot reader',
  };
  for (const [query, name] of Object.entries(expected)) {
    assert.ok(hits(query).some((text) => text.startsWith(name)), `${query} → ${name}`);
  }
});

await test('足した語も、元の決まりのまま（1 語に 6 個まで・小文字・メモは memory に当てない）', () => {
  for (const [key, stems] of Object.entries(NOAH_SEARCH_SYNONYMS)) {
    assert.ok(stems.length <= 6, key);
    for (const stem of stems) assert.equal(stem, stem.toLowerCase(), `${key}: ${stem}`);
  }
  assert.deepEqual(noahSearchTerms('SNS'), [['sns', ...NOAH_SEARCH_SYNONYMS.sns]], '英字の SNS も辞書で広げる');
  assert.equal(noahSearchMatcher(noahSearchTerms('メモ'))('persistent memory server for agents'), false, 'メモは memory に当てない');
  assert.equal(noahSearchMatcher(noahSearchTerms('占い'))('fortune 500 sales leads'), false, '占いは fortune に当てない');
});
