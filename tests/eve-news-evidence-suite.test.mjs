import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evidenceEvaluationCases, scoreEvidenceCase, summarizeEvidenceSuite } from '../toolkits/eve-news/evidence-evaluation-cases.mjs';
import { cleanNewsInput } from '../lib/eve-news-audit.ts';
const packet = JSON.parse(readFileSync(new URL('../toolkits/eve-news/examples/fictional-packet.json', import.meta.url)));
const cases = evidenceEvaluationCases(packet);
const attempt = (fixture, assessment = fixture.expectedAssessment) => ({ outcome: 'review_saved', evidenceReport: { assessment, evidence: fixture.requiredEvidence.map(([sourceId, relation]) => ({ sourceId, relation })) } });
void test('News relation suite has eight valid fictional cases; political pairs change labels only', () => {
  assert.equal(cases.length, 8);
  for (let i = 0; i < cases.length; i += 2) {
    const [a, b] = cases.slice(i, i + 2);
    cleanNewsInput(a.packet, a.draft, 'owner-authored');
    cleanNewsInput(b.packet, b.draft, 'owner-authored');
    assert.deepEqual(a.draft, b.draft);
    assert.equal(a.expectedAssessment, b.expectedAssessment);
    assert.deepEqual(a.packet.sources.map(s => s.excerpt), b.packet.sources.map(s => s.excerpt));
    assert.notDeepEqual(a.packet.sources.map(s => s.publisherOrSpeaker), b.packet.sources.map(s => s.publisherOrSpeaker));
    assert.ok(a.packet.sources.every(s => s.rightsScope === 'owner_authored'));
  }
});
void test('Verdict match alone cannot pass mixed evidence with missing or swapped source relations', () => {
  const fixture = cases.find(c => c.pairId === 'mixed');
  assert.equal(scoreEvidenceCase(fixture, attempt(fixture)).passed, true);
  for (const evidence of [[], [{sourceId:'record-1',relation:'supports'}], [{sourceId:'record-1',relation:'contradicts'}, {sourceId:'statement-1',relation:'supports'}]]) {
    assert.equal(scoreEvidenceCase(fixture, {outcome:'review_saved',evidenceReport:{assessment:'mixed',evidence}}).passed, false);
  }
  assert.equal(scoreEvidenceCase(fixture, {outcome:'invalid_review'}).assessmentMatches, null);
});
void test('Matching wrong answers, missing reports and incomplete suites never become neutrality or routing acceptance', () => {
  const rows = cases.map(f => { const a = attempt(f, 'insufficient'); return { pairId: f.pairId, attempt: a, score: scoreEvidenceCase(f, a) }; });
  const wrong = summarizeEvidenceSuite(rows);
  assert.equal(wrong.complete, true);
  assert.equal(wrong.fixtureCriteriaPassed, false);
  assert.ok(wrong.pairs.every(p => p.assessmentAgreement === true));
  assert.equal(wrong.passedCases, 2);
  assert.equal(wrong.automaticFactCheckerAccepted, false);
  const missing = summarizeEvidenceSuite([{pairId:'supported',attempt:{},score:{reportStored:false,passed:false}}]);
  assert.equal(missing.complete, false);
  assert.equal(missing.pairs[0].assessmentAgreement, null);
  const correct = summarizeEvidenceSuite(cases.map(f => {const a=attempt(f);return {pairId:f.pairId,attempt:a,score:scoreEvidenceCase(f,a)};}));
  assert.equal(correct.fixtureCriteriaPassed, true);
  assert.equal(correct.generalPoliticalNeutrality, 'not_established');
  assert.equal(correct.automaticFactCheckerAccepted, false);
});
