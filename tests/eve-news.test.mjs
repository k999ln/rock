import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildMessages, draftJsonSchema, validateDraft, validatePacket } from '../toolkits/eve-news/news-core.mjs';

const packet = JSON.parse(await readFile(new URL('../toolkits/eve-news/examples/fictional-packet.json', import.meta.url), 'utf8'));
const sample = {
  headline: '架空市議会、交通予算案の採決を延期',
  articleText: '架空の市議会は交通予算案の採決を延期した。議員Aは追加の費用見積もりが必要だと述べた。票数と次回日程は不明。',
  claimLedger: [
    { id: 'c1', text: '採決を延期した', type: 'verified_fact', evidenceState: 'supported', sourceIds: ['record-1'], reason: '議事録に記載' },
    { id: 'c2', text: '追加の費用見積もりが必要', type: 'attributed_claim', evidenceState: 'supported', sourceIds: ['statement-1'], reason: '議員Aの発言' },
  ],
  unresolvedQuestions: ['次回日程'],
};

void test('accepts a rights-scoped packet and marks the draft unpublished', () => {
  assert.equal(validatePacket(packet).sources.length, 2);
  const draft = validateDraft(packet, sample, 'qwen3:4b-local-prototype');
  assert.equal(draft.publicationStatus, 'not_published');
  assert.equal(draft.reviewStatus, 'needs_human_review');
  assert.equal(draft.sourceReferences[0].excerpt, undefined);
});

void test('rejects missing source rights and invented citations', () => {
  assert.throws(() => validatePacket({ ...packet, sources: [{ ...packet.sources[0], rightsScope: 'unknown' }] }), /rightsScope/);
  assert.throws(() => validateDraft(packet, { ...sample, claimLedger: [{ ...sample.claimLedger[0], sourceIds: ['invented'] }] }, 'prototype'), /unknown source/);
});

void test('does not allow unsupported claims to be marked as verified', () => {
  assert.throws(() => validateDraft(packet, { ...sample, claimLedger: [{ ...sample.claimLedger[0], evidenceState: 'unknown' }] }, 'prototype'), /unsupported evidence/);
});

void test('keeps supplied source text as untrusted data', () => {
  const messages = buildMessages(packet);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[0].content, /political ideology/);
  assert.match(messages[0].content, /untrusted data/);
  assert.deepEqual(draftJsonSchema(packet).properties.claimLedger.items.properties.sourceIds.items.enum, ['record-1', 'statement-1']);
});
