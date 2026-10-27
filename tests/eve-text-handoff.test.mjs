import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareEveTextJob, prepareEveTextEstimate } from '../lib/eve-text-job.ts';
import { prepareEveTextHandoff, validateEveTextHandoff, isEveTextHandoffPlan, eveTextHandoffOrigin } from '../lib/eve-text-handoff.ts';
import { createWorkJob, updateComposedWork } from '../lib/workflow.ts';
import { executeCompositionNode } from '../lib/work-composition-executor.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

async function fixture(count = 3) {
  const materials = Array.from({ length: count }, (_, i) => ({ name: `${i}.txt`, text: `\ufeffSynthetic private source ${i}\r\n` }));
  const prepared = prepareEveTextJob(materials, 'Synthetic private goal');
  const initial = createWorkJob({ id: crypto.randomUUID(), title: 'Synthetic originals', templateId: 'composition', plan: prepared.plan });
  const checked = await executeCompositionNode(initial.composition, prepared.plan.nodes[0], prepared.source);
  const job = updateComposedWork(initial, { action: 'run', id: crypto.randomUUID(), revision: 0, fingerprint: 'a'.repeat(64), stepId: 's1', source: prepared.source, result: checked });
  const bound = await prepareEveTextEstimate(job), owner = await ownerScopeFor('synthetic-A');
  const quote = { estimate: { currency: 'USD', maximumChargeMinor: 5, inputTokenUpperBound: 100, outputTokenLimit: 1200,
    modelId: 'fixture-model', pricingVersion: 'fixture-1', rateCardDigest: 'a'.repeat(64), expiresAt: Date.now() + 60000 },
    unitRates: [{ category: 'ordinary-input', rateMinorMicrosPerMillionTokens: 1000 }, { category: 'output', rateMinorMicrosPerMillionTokens: 2000 }],
    rateSource: 'https://example.test/rates', cardId: 'fixture-card', sourceRef: bound.sourceRef, promptDigest: bound.promptDigest,
    withinUserCap: true, userCapMinor: 10, estimateOnly: true, executionAuthorized: false, providerSubmission: 'not_performed' };
  return { job, owner, quote, approval: { materials: true, conditions: true, capMinor: 10 } };
}
void test('2/3/4 originals produce a bound zero-budget preparation descriptor and work artifact, never a grant', async t => {
  let sends = 0; t.mock.method(globalThis, 'fetch', async () => { sends++; throw Error('No external IO'); });
  for (const count of [2, 3, 4]) {
    const f = await fixture(count), original = structuredClone(f.job);
    const draft = await prepareEveTextHandoff(f.job, f.owner, f.quote, f.approval);
    assert.equal(draft.plan.budgetMinor, 0); assert.equal(draft.plan.nodes[0].tool, 'compose-check');
    assert.ok(isEveTextHandoffPlan(draft.plan)); assert.equal(eveTextHandoffOrigin(draft.source), f.job.id);
    const envelope = JSON.parse(draft.source);
    assert.equal(envelope.payload.executionAuthorized, false); assert.equal(envelope.payload.preparationOnly, true);
    assert.equal(envelope.payload.ownerScope, f.owner); assert.equal(envelope.payload.approval.capMinor, 10);
    assert.equal(envelope.payload.quote.sourceRef.materialSha256.length, count);
    assert.doesNotMatch(draft.source, /Synthetic private source|Synthetic private goal|"prompt"/);
    assert.deepEqual(await validateEveTextHandoff(draft.source, f.job, f.owner), draft);
    const child = createWorkJob({ id: crypto.randomUUID(), title: draft.plan.objective, templateId: 'composition', plan: draft.plan });
    assert.equal(child.composition.source, null);
    const checked = await executeCompositionNode(child.composition, draft.plan.nodes[0], draft.source);
    const saved = updateComposedWork(child, { action: 'run', id: crypto.randomUUID(), revision: 0, fingerprint: 'b'.repeat(64), stepId: 's1', source: draft.source, result: checked });
    assert.equal(saved.status, 'review'); assert.equal(saved.composition.artifacts.s1.text, draft.source);
    assert.equal(saved.composition.plan.budgetMinor, 0); assert.deepEqual(f.job, original);
  }
  assert.equal(sends, 0);
});
void test('explicit material/condition consent and exact finite comparison cap are required', async () => {
  const f = await fixture();
  for (const approval of [{ ...f.approval, materials: false }, { ...f.approval, conditions: false },
    { ...f.approval, capMinor: 9 }, { ...f.approval, capMinor: -1 }, { ...f.approval, capMinor: 1.1 },
    { ...f.approval, capMinor: Infinity }, { ...f.approval, executionAuthorized: true }])
    await assert.rejects(prepareEveTextHandoff(f.job, f.owner, f.quote, approval));
  for (const change of [q => { q.userCapMinor = null; }, q => { q.withinUserCap = false; },
    q => { q.estimate.maximumChargeMinor = 11; }, q => { q.executionAuthorized = true; },
    q => { q.providerSubmission = 'performed'; }, q => { q.estimate.currency = 'EUR'; },
    q => { q.estimate.outputTokenLimit = 600; }, q => { q.sourceRef.materialSha256.reverse(); }]) {
    const quote = structuredClone(f.quote); change(quote);
    await assert.rejects(prepareEveTextHandoff(f.job, f.owner, quote, f.approval));
  }
});
void test('different owner, cancelled/cleared/revised source and tampered descriptor cannot authorize a new preparation write', async () => {
  const f = await fixture(), draft = await prepareEveTextHandoff(f.job, f.owner, f.quote, f.approval);
  await assert.rejects(validateEveTextHandoff(draft.source, f.job, await ownerScopeFor('synthetic-B')));
  await assert.rejects(prepareEveTextHandoff(f.job, 'owner-a', f.quote, f.approval));
  for (const mutate of [j => { j.revision++; }, j => { j.status = 'cancelled'; }, j => { j.composition.materialCleared = true; },
    j => { j.composition.source += ' '; }, j => { j.composition.artifacts.s1.text += ' '; }]) {
    const current = structuredClone(f.job); mutate(current);
    await assert.rejects(validateEveTextHandoff(draft.source, current, f.owner));
  }
  for (const mutate of [v => { v.payload.approval.capMinor = 99; }, v => { v.payload.executionAuthorized = true; },
    v => { v.extra = true; }, v => { v.payload.quote.estimate.pricingVersion = 'changed'; },
    v => { v.payload.quote.estimate.expiresAt++; }, v => { v.bindingDigest = 'f'.repeat(64); }]) {
    const value = JSON.parse(draft.source); mutate(value);
    await assert.rejects(validateEveTextHandoff(JSON.stringify(value), f.job, f.owner));
  }
});
void test('expiry equality and expiry during final digest await fail closed', async t => {
  const f = await fixture(), end = f.quote.estimate.expiresAt;
  let now = end - 1; t.mock.method(Date, 'now', () => now);
  assert.ok(await prepareEveTextHandoff(f.job, f.owner, f.quote, f.approval));
  for (now of [end, end + 1]) await assert.rejects(prepareEveTextHandoff(f.job, f.owner, f.quote, f.approval));
  now = end - 1;
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'digest', async (algorithm, bytes) => {
    const result = await digest(algorithm, bytes);
    if (new TextDecoder().decode(bytes).includes('"preparationOnly":true')) now = end;
    return result;
  });
  await assert.rejects(prepareEveTextHandoff(f.job, f.owner, f.quote, f.approval));
});
