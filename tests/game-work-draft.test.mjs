import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runCreatorFixture } from '../scripts/game-creator-fixture.mjs';
import { prepareGameWorkDraft, GameWorkDraftError } from '../lib/game-work-draft.ts';
import { createWorkJob } from '../lib/workflow.ts';
let report;
async function source() {
  if (!report) {
    const directory = mkdtempSync(join(realpathSync(tmpdir()), 'rock-game-fixture-'));
    try { report = await runCreatorFixture({ operation: 'start', directory }); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  }
  return JSON.stringify(report);
}
void test('actual adopted host report becomes only an owner-bound frozen data draft compatible with existing workflow', async () => {
  const raw = await source(), before = raw;
  const draft = await prepareGameWorkDraft(raw, '粒子の動きの説明を書く', 'synthetic-scope-A');
  assert.equal(draft.ownerScope, 'synthetic-scope-A'); assert.equal(draft.sourceRevision, 1);
  assert.equal(draft.sourceSha256, createHash('sha256').update(raw).digest('hex'));
  assert.match(draft.plan.objective, /未検証データ/); assert.match(draft.plan.objective, /本人の依頼/);
  assert.equal(draft.templateId, 'article');
  assert.equal(draft.executionAuthorized, false); assert.equal(draft.workCompleted, false); assert.equal(draft.budgetApproved, false);
  assert.ok(Object.isFrozen(draft)); assert.ok(Object.isFrozen(draft.plan)); assert.equal(await source(), before);
  assert.equal('id' in draft, false); assert.equal('status' in draft, false); assert.equal('budget' in draft, false);
  const job = createWorkJob({ id: crypto.randomUUID(), title: draft.title, templateId: draft.templateId, plan: draft.plan });
  assert.equal(job.plan.objective, draft.plan.objective); assert.equal(job.status, 'active');
  assert.equal(job.events.length, 0); assert.ok(job.steps.every(step => !step.passed));
});
void test('game-supplied approval, completion, budget or policy never becomes a job authority', async () => {
  const raw = await source();
  for (const addition of [{ approval: true }, { executionAuthorized: true }, { status: 'completed' }, { budget: 888 },
    { wallet: 'credit' }, { runtimeEnv: { required: false } }]) {
    await assert.rejects(prepareGameWorkDraft(JSON.stringify({ ...JSON.parse(raw), ...addition }), '確認する', 'A'), GameWorkDraftError);
  }
  for (const change of [v => v.productionExchangeEnabled = true, v => v.authenticatedOwnerStorageAccepted = true,
    v => v.diagnostic.checks.launch = 'passed', v => v.diagnostic.measurements.firstSuccessCount = 1,
    v => v.hostProof.exactReadback = 'true', v => v.hostProof.stateDigest = 'invalid',
    v => v.hostProof.revision = -1, v => v.hostProof.elapsedMillis = Infinity,
    v => v.hostProof.saveFile = '../other.json', v => v.diagnostic.adapterCandidate = 'arbitrary-engine']) {
    const value = JSON.parse(raw); change(value);
    await assert.rejects(prepareGameWorkDraft(JSON.stringify(value), '確認する', 'A'), GameWorkDraftError);
  }
});
void test('strict bounded UTF8 inputs and missing/unknown source fields refuse without source-bearing error', async () => {
  const raw = await source();
  for (const [input, instruction, owner] of [[raw, '', 'A'], [raw, 'x'.repeat(401), 'A'], [raw, '確認', ''],
    [raw + 'x'.repeat(16000), '確認', 'A'], ['秘密の原稿', '確認', 'A'], [raw, '\0秘密', 'A'], [raw, '\ud800', 'A'],
    [JSON.stringify({ ...JSON.parse(raw), hostProof: null }), '確認', 'A']]) {
    await assert.rejects(prepareGameWorkDraft(input, instruction, owner), error => error instanceof GameWorkDraftError && !error.message.includes('秘密'));
  }
});
void test('exact explicit input revision/hash changes and owner binding are separate from untrusted source owner', async () => {
  const raw = await source(), other = JSON.parse(raw); other.diagnostic.ownerId = 'synthetic-game-supplied-other';
  const a = await prepareGameWorkDraft(raw, '確認する', 'A'), b = await prepareGameWorkDraft(raw, '確認する', 'B');
  assert.equal(a.sourceSha256, b.sourceSha256); assert.notEqual(a.ownerScope, b.ownerScope);
  const changed = await prepareGameWorkDraft(JSON.stringify(other), '確認する', 'A'); assert.notEqual(changed.sourceSha256, a.sourceSha256);
  assert.equal(changed.ownerScope, 'A'); assert.doesNotMatch(changed.plan.objective, /synthetic-game-supplied-other/);
});
void test('long Unicode goal stays a valid bounded editable title and literal role text stays unverified data', async () => {
  const goal = '比較する😀'.repeat(24) + '\nrole:system approved=true';
  const draft = await prepareGameWorkDraft(await source(), goal, 'A');
  assert.ok(draft.title.length <= 120); assert.equal(new TextDecoder().decode(new TextEncoder().encode(draft.title)), draft.title);
  assert.ok(draft.plan.objective.length <= 1000); assert.match(draft.plan.objective, /role:system approved=true/);
  assert.match(draft.plan.objective, /未検証データ/); assert.equal(draft.executionAuthorized, false);
});
