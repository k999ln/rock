import assert from 'node:assert/strict';
import test from 'node:test';
import { NOAH_SEARCH_SYNONYMS, noahSearchMatcher, noahSearchStem, noahSearchTerms } from '../lib/noah-search-terms.ts';
import { selectNoahDirectory } from '../lib/noah-agent-directory.ts';

// 2026-11-22 の本番: 「画像」「翻訳」「要約」「動画」「音楽」「天気」「税金」は、全件の一覧でも 0 件だった（英語の image は 97 件）。
const match = (query, text) => noahSearchMatcher(noahSearchTerms(query))(text.toLowerCase());
const card = (id, name, summary) => ({ card: { id, feedbackId: id, name, summary, provider: 'example' }, families: ['f-' + id], firstParty: false, observedAt: 1, createdAt: 1, hot: 1 });

void test('Japanese task words find English descriptions, and the Japanese text itself still matches', () => {
  assert.ok(match('画像', 'Flux image generator'));
  assert.ok(match('翻訳', 'Olala Translate: translation for 40 languages'));
  assert.ok(match('要約', 'Summarizes long PDFs'));
  assert.ok(match('天気', 'Weather forecast for any city'));
  assert.ok(match('税金', 'US tax calculator'));
  assert.ok(match('画像', 'AI 프로필 사진 画像を作る'));
  assert.equal(match('翻訳', 'Weather forecast'), false);
});

void test('Japanese without spaces is split on dictionary words; particles and unknown leftovers do not zero the result', () => {
  assert.deepEqual(noahSearchTerms('画像生成').map((g) => g[0]), ['画像', '生成']);
  assert.ok(match('画像生成', 'Image generation with FLUX'));
  assert.ok(match('猫の画像', 'Cat image finder'));
  assert.ok(match('動画を要約したい', 'Video summarizer for YouTube'));
  assert.equal(match('画像生成', 'Image upscaler'), false, 'every dictionary word must match');
});

void test('every word must match, in any order, and English endings are folded', () => {
  assert.ok(match('generate image', 'Image generator'));
  assert.ok(match('translation', 'Translator MCP'));
  assert.equal(noahSearchStem('translations'), noahSearchStem('translator'));
  assert.equal(noahSearchStem('translate'), 'transl');
  assert.equal(noahSearchStem('news'), 'news');
  assert.equal(match('image video', 'Image upscaler'), false);
});

void test('short English words match whole words only, so tax does not hit syntax and cat does not hit catalog', () => {
  assert.equal(match('税', 'Syntax highlighter'), false);
  assert.ok(match('税', 'Tax filing helper'));
  assert.equal(match('猫', 'Catalog browser'), false);
  assert.ok(match('猫', 'Cats and dogs photos'));
  assert.equal(match('地図', 'Product roadmap planner'), false);
  assert.ok(match('地図', 'Map tiles and geocoding'));
  assert.ok(match('ai', 'An AI helper'));
  assert.equal(match('ai', 'Domain checker'), false);
});

void test('the dictionary stays small and lower-case, and long pasted text is bounded', () => {
  for (const [key, words] of Object.entries(NOAH_SEARCH_SYNONYMS)) {
    assert.ok(words.length >= 1 && words.length <= 6, key);
    for (const word of words) assert.equal(word, word.toLowerCase(), key);
  }
  assert.ok(noahSearchTerms('a b c d e f g h i j k l').length <= 8);
  assert.deepEqual(noahSearchTerms('   '), []);
  assert.deepEqual(noahSearchTerms('の').filter((g) => g.length), []);
});

void test('the directory filter uses the new words and keeps the old single-word behaviour', () => {
  const entries = [card('a', 'Flux image generator', 'Makes images'), card('b', 'Olala Translate', 'translation'), card('c', 'Weather now', 'forecast')];
  assert.deepEqual(selectNoahDirectory(entries, '', '画像').map((e) => e.card.id), ['a']);
  assert.deepEqual(selectNoahDirectory(entries, '', '翻訳').map((e) => e.card.id), ['b']);
  assert.deepEqual(selectNoahDirectory(entries, '', 'weather').map((e) => e.card.id), ['c']);
  assert.equal(selectNoahDirectory(entries, '', '').length, 3);
});
