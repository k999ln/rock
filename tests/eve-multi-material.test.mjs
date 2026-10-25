import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareEveTextJob, prepareEveTextEstimate, isEveTextPlan, EVE_TEXT_ACCEPTANCE } from '../lib/eve-text-job.ts';
import { createWorkJob, updateComposedWork } from '../lib/workflow.ts';
import { executeCompositionNode } from '../lib/work-composition-executor.ts';

const material = i => ({ name: `資料${i}.txt`, text: `\ufeff資料${i}\r\n🙂e\u0301 ${i}` });
const hash = value => createHash('sha256').update(value).digest('hex');
async function save(input) {
  const prepared = prepareEveTextJob(input, ' 比較\r\n ');
  const job = createWorkJob({ id: crypto.randomUUID(), title: 'Synthetic multi material', templateId: 'composition', plan: prepared.plan });
  const result = await executeCompositionNode(job.composition, prepared.plan.nodes[0], prepared.source);
  return updateComposedWork(job, { action: 'run', id: crypto.randomUUID(), revision: 0, fingerprint: 'a'.repeat(64), stepId: 's1', source: prepared.source, result });
}
void test('2/3/4 sources retain ordered original bytes through workflow and estimate; legacy v1 is unchanged', async () => {
  for (const count of [2, 3, 4]) {
    const input = Array.from({ length: count }, (_, i) => material(i));
    const prepared = prepareEveTextJob(input, ' 比較\r\n '), version = count === 2 ? 1 : 2;
    assert.equal(prepared.source, JSON.stringify({ schema: `eve.text-preparation/${version}`, materials: input, goal: ' 比較\r\n ' }));
    assert.equal(isEveTextPlan(prepared.plan), true);
    if (count === 2) assert.equal(prepared.plan.acceptance, EVE_TEXT_ACCEPTANCE);
    const job = await save(input), before = structuredClone(job), estimate = await prepareEveTextEstimate(job);
    assert.deepEqual(JSON.parse(estimate.prompt).materials, input);
    assert.equal(estimate.sourceRef.builder, `eve.text-estimate/${version}`);
    assert.deepEqual(estimate.sourceRef.materialSha256, input.map(x => hash(x.text)));
    assert.equal(estimate.sourceRef.sourceSha256, hash(prepared.source));
    assert.equal(estimate.promptDigest, hash(estimate.prompt));
    assert.equal(job.status, 'review'); assert.equal(job.composition.plan.budgetMinor, 0);
    assert.deepEqual(job, before); assert.equal(job.composition.artifacts.s1.text, prepared.source);
    input[0].text = 'changed'; assert.notEqual(JSON.parse(prepared.source).materials[0].text, input[0].text);
  }
});
void test('3/4 material upper bounds reject excess/control data, and schema count downgrade is refused', async () => {
  for (const count of [3, 4]) {
    const exact = Array.from({ length: count }, (_, i) => ({ name: `${i}`, text: 'x'.repeat(i === 0 ? 8000 - count + 1 : 1) }));
    assert.equal(JSON.parse(prepareEveTextJob(exact, 'g'.repeat(500)).source).materials.length, count);
    const excess = structuredClone(exact); excess[0].text += 'x'; assert.throws(() => prepareEveTextJob(excess, 'g'));
    for (const bad of ['\0', '\u007f', '\ud800']) {
      const values = Array.from({ length: count }, (_, i) => material(i)); values[count - 1].text = bad;
      assert.throws(() => prepareEveTextJob(values, 'g'));
    }
    const job = await save(Array.from({ length: count }, (_, i) => material(i)));
    const old = JSON.parse(job.composition.source); old.schema = 'eve.text-preparation/1';
    job.composition.source = JSON.stringify(old); job.composition.artifacts.s1.text = job.composition.source;
    await assert.rejects(prepareEveTextEstimate(job));
  }
  for (const count of [0, 1, 5]) assert.throws(() => prepareEveTextJob(Array.from({ length: count }, (_, i) => material(i)), 'g'));
  const two = await save([material(0), material(1)]), upgraded = JSON.parse(two.composition.source);
  upgraded.schema = 'eve.text-preparation/2'; two.composition.source = JSON.stringify(upgraded); two.composition.artifacts.s1.text = two.composition.source;
  await assert.rejects(prepareEveTextEstimate(two));
});
void test('changed third/fourth source, name and order each change the bound prompt digest', async () => {
  const original = Array.from({ length: 4 }, (_, i) => material(i));
  const originalJob = await save(original);
  const initial = await prepareEveTextEstimate(originalJob);
  for (const change of [x => { x[2].text += '!'; }, x => { x[3].text += '!'; }, x => { x[3].name += '!'; }, x => x.reverse()]) {
    const values = structuredClone(original); change(values);
    const changedJob = await save(values); changedJob.id = originalJob.id;
    const changed = await prepareEveTextEstimate(changedJob);
    assert.notEqual(changed.promptDigest, initial.promptDigest);
    assert.notEqual(changed.sourceRef.sourceSha256, initial.sourceRef.sourceSha256);
  }
});
