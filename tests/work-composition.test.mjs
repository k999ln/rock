import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import {
  parseCompositionPlan,
  suggestComposition,
  runnableCompositionNodes,
  compositionRecipe,
  parseCompositionRecipe,
  compositionCapabilities,
} from '../lib/work-composition.ts';
import { executeCompositionNode } from '../lib/work-composition-executor.ts';
import {
  createWorkJob,
  normalizeWorkJob,
  updateComposedWork,
  applyWorkCommand,
} from '../lib/workflow.ts';
import { readWorkJob } from '../lib/work-job-view.ts';

export const syntheticSource =
  '# Synthetic\n本文です。（出典: [Example](https://example.test/source)）\n第二段落を確認します。';
export function plan() {
  return parseCompositionPlan({
    ...suggestComposition('引用を整理して成果を検査', 'text'),
    acceptance: '出典欄があり本文を保持',
    nodes: [
      { id: 's1', tool: 'mr-citations', inputs: ['source'], config: {} },
      {
        id: 's2',
        tool: 'compose-check',
        inputs: ['s1'],
        config: { minChars: 1, requiredText: ['## 出典'] },
      },
    ],
  });
}
export function job(p = plan()) {
  return createWorkJob({
    id: randomUUID(),
    title: 'Synthetic composition',
    templateId: 'composition',
    plan: p,
  });
}
export function update(j, action) {
  return updateComposedWork(j, {
    id: randomUUID(),
    fingerprint: createHash('sha256')
      .update(JSON.stringify(action))
      .digest('hex'),
    revision: j.revision,
    ...action,
  });
}
async function execute(
  j,
  stepId = runnableCompositionNodes(j.composition)[0]?.id,
) {
  const node = j.composition.plan.nodes.find((n) => n.id === stepId);
  const source = j.composition.source ?? syntheticSource;
  return update(j, {
    action: 'run',
    stepId,
    source,
    result: await executeCompositionNode(j.composition, node, source),
  });
}
void test('two real local Tools preserve source and outputs across serialization; final review is explicit', async () => {
  let j = job();
  assert.deepEqual(
    runnableCompositionNodes(j.composition).map((n) => n.id),
    ['s1'],
  );
  j = await execute(j);
  assert.match(j.composition.artifacts.s1.text, /## 出典/);
  assert.equal(j.composition.source, syntheticSource);
  j = JSON.parse(JSON.stringify(j));
  assert.equal(readWorkJob(j), j);
  j = await execute(j);
  assert.equal(j.status, 'review');
  const completed = applyWorkCommand(
    j,
    { id: randomUUID(), action: 'complete', note: 'Synthetic reviewed' },
    j.revision,
  );
  assert.equal(completed.status, 'completed');
  assert.throws(
    () =>
      update(completed, {
        action: 'run',
        stepId: 's1',
        source: syntheticSource,
        result: j.composition.artifacts.s1,
      }),
    { status: 409 },
  );
});
void test('CSV transform uses existing independent validation before final structural check', async () => {
  let j = job(
    parseCompositionPlan({
      ...suggestComposition('CSVを整える', 'csv'),
      acceptance: '重複行を削除して検査',
      nodes: [
        {
          id: 's1',
          tool: 'rockstar-csv-cleanup',
          inputs: ['source'],
          config: { trim: ['name'], dedupe: { keys: ['name'], mode: 'first' } },
        },
        {
          id: 's2',
          tool: 'compose-check',
          inputs: ['s1'],
          config: { minChars: 1, requiredText: ['Alice'] },
        },
      ],
    }),
  );
  const source = 'name,value\n Alice ,1\nAlice,1\nBob,2\n';
  for (const node of j.composition.plan.nodes)
    j = update(j, {
      action: 'run',
      stepId: node.id,
      source,
      result: await executeCompositionNode(j.composition, node, source),
    });
  assert.equal(j.status, 'review');
  assert.equal(
    j.composition.artifacts.s1.text,
    'name,value\r\nAlice,1\r\nBob,2\r\n',
  );
  assert.ok(j.composition.artifacts.s1.checks.length > 0);
  assert.equal(j.composition.artifacts.s2.checks.at(-1).name, 'CSV構造');
});
void test('failed check keeps upstream output and is retryable; changing only check config preserves upstream', async () => {
  let j = job();
  j.composition.plan.nodes[1].config.requiredText = [
    'Missing synthetic phrase',
  ];
  j = await execute(j);
  const upstream = structuredClone(j.composition.artifacts.s1);
  j = await execute(j);
  assert.equal(j.status, 'active');
  assert.equal(j.composition.artifacts.s2.status, 'needs_review');
  assert.deepEqual(
    runnableCompositionNodes(j.composition).map((n) => n.id),
    ['s2'],
  );
  const revised = structuredClone(j.composition.plan);
  revised.nodes[1].config.requiredText = ['## 出典'];
  j = update(j, { action: 'revise', plan: revised });
  assert.deepEqual(j.composition.artifacts.s1, upstream);
  j = await execute(j);
  assert.equal(j.status, 'review');
});
void test('cycles, forward references, disconnected unchecked leaves, unsupported schema and positive budget fail', () => {
  const mutations = [
    (p) => (p.nodes[0].inputs = ['s2']),
    (p) => (p.nodes[1].id = 's1'),
    (p) => (p.nodes[1].inputs = ['missing']),
    (p) => p.nodes.pop(),
    (p) => (p.version = 2),
    (p) => (p.nodes[0].inputs = ['source', 'source']),
    (p) => (p.budgetMinor = 1),
    (p) => (p.deadline = '2026-02-30'),
    (p) => (p.nodes[0].config = []),
  ];
  for (const mutate of mutations) {
    const p = plan();
    mutate(p);
    assert.throws(() => parseCompositionPlan(p));
  }
});
void test('unconnected Tool and wrong material cannot produce passed results', async () => {
  const p = plan();
  p.nodes[0].tool = 'mr-free-article';
  p.nodes[0].config = {};
  await assert.rejects(
    executeCompositionNode(job(p).composition, p.nodes[0], syntheticSource),
  );
  const unavailable = compositionCapabilities.find(
    (cap) => !cap.available && cap.accepts.includes('text'),
  );
  assert.ok(unavailable);
  const missing = plan();
  missing.nodes[0].tool = unavailable.id;
  assert.throws(() => parseCompositionPlan(missing), { status: 409 });
  const disconnected = job();
  disconnected.composition.plan = missing;
  assert.deepEqual(runnableCompositionNodes(disconnected.composition), []);
  await assert.rejects(
    executeCompositionNode(
      disconnected.composition,
      missing.nodes[0],
      syntheticSource,
    ),
    { status: 409 },
  );
  const csv = plan();
  csv.nodes[0].tool = 'rockstar-csv-cleanup';
  assert.throws(() => parseCompositionPlan(csv));
});
void test('recipes contain graph only; no source, objectives, editor text, approval or evidence', async () => {
  const j = await execute(await execute(job()));
  const before = JSON.stringify(j);
  const saved = update(j, { action: 'save_recipe', name: 'Synthetic recipe' });
  assert.equal(JSON.stringify(j), before);
  assert.deepEqual(saved.composition.artifacts, j.composition.artifacts);
  assert.equal(saved.status, j.status);
  const recipe = saved.composition.recipe.plan;
  assert.deepEqual(recipe, compositionRecipe(j.composition.plan));
  assert.equal(parseCompositionRecipe(recipe).objective, '');
  assert.equal(recipe.acceptance, '');
  assert.equal(recipe.deadline, '');
  assert.equal(recipe.budgetMinor, 0);
  assert.deepEqual(recipe.nodes[1].config.requiredText, []);
  assert.equal(JSON.stringify(recipe).includes(syntheticSource), false);
  assert.throws(() =>
    parseCompositionRecipe({ ...recipe, objective: 'old customer' }),
  );
  const deleted = update(saved, { action: 'delete_recipe' });
  assert.equal(deleted.composition.recipe, undefined);
  assert.deepEqual(deleted.composition.artifacts, saved.composition.artifacts);
  assert.equal(deleted.composition.source, syntheticSource);
});
void test('manual record cannot certify composition; cancel bars execution', async () => {
  const j = job();
  assert.throws(() =>
    applyWorkCommand(
      j,
      {
        id: randomUUID(),
        action: 'record',
        stepId: 's1',
        tool: 'mr-citations',
        transport: 'browser',
        outcome: 'passed',
        sample: false,
        durationMs: 1,
      },
      j.revision,
    ),
  );
  const cancelled = applyWorkCommand(
    j,
    { id: randomUUID(), action: 'cancel' },
    j.revision,
  );
  await assert.rejects(execute(cancelled), { status: 409 });
});
void test('erasure remains possible at operation cap and on completed job', async () => {
  let j = await execute(await execute(job()));
  j = applyWorkCommand(
    j,
    { id: randomUUID(), action: 'complete', note: 'Synthetic reviewed' },
    j.revision,
  );
  j.composition.operations = Array.from({ length: 100 }, () => ({
    id: randomUUID(),
    fingerprint: 'a'.repeat(64),
  }));
  const cleared = update(j, { action: 'clear' });
  assert.equal(cleared.status, 'completed');
  assert.equal(cleared.composition.source, null);
  assert.deepEqual(cleared.composition.artifacts, {});
  assert.equal(cleared.composition.operations.length, 100);
  assert.equal(readWorkJob(cleared), cleared);
});
void test('stored corruption is rejected rather than projected as passed', async () => {
  const j = await execute(await execute(job()));
  const mutations = [
    (v) => (v.composition.artifacts.s2.checks[0].passed = false),
    (v) => (v.steps[0].passed = false),
    (v) => (v.composition.artifacts.s1.kind = 'csv'),
    (v) => (v.composition.operations[0].fingerprint = 'invalid'),
    (v) => (v.composition.source = null),
    (v) => (v.plan.objective = 'different objective'),
    (v) => (v.composition.artifacts.unknown = v.composition.artifacts.s1),
    (v) => (v.composition.artifacts.s2.checks = []),
    (v) =>
      (v.composition.recipe = {
        name: 'bad',
        plan: {
          ...compositionRecipe(v.composition.plan),
          artifacts: v.composition.artifacts,
        },
      }),
  ];
  for (const mutate of mutations) {
    const value = structuredClone(j);
    mutate(value);
    assert.throws(() => normalizeWorkJob(value));
    assert.throws(() => readWorkJob(value));
  }
});

void test('fan-out join is blocked until both real branches pass and preserves their separate artifacts', async () => {
  const p = parseCompositionPlan({
    ...plan(),
    nodes: [
      { id: 's1', tool: 'mr-citations', inputs: ['source'], config: {} },
      {
        id: 's2',
        tool: 'mr-free-article',
        inputs: ['source'],
        config: {
          afterChars: 1,
          price: 500,
          summary: '- First\n- Second\n- Third',
          paidContents: 'Remaining synthetic text',
          noteUrl: 'https://note.com/fixture/n/synthetic',
        },
      },
      { id: 's3', tool: 'compose-join', inputs: ['s1', 's2'], config: {} },
      {
        id: 's4',
        tool: 'compose-check',
        inputs: ['s3'],
        config: { minChars: 1, requiredText: ['## 出典', '## まとめ'] },
      },
    ],
  });
  let j = job(p);
  j = await execute(j, 's1');
  assert.deepEqual(
    runnableCompositionNodes(j.composition).map((n) => n.id),
    ['s2'],
  );
  await assert.rejects(execute(j, 's3'), { status: 409 });
  j = await execute(j, 's2');
  assert.deepEqual(
    runnableCompositionNodes(j.composition).map((n) => n.id),
    ['s3'],
  );
  const first = j.composition.artifacts.s1.text,
    second = j.composition.artifacts.s2.text;
  j = await execute(j, 's3');
  assert.equal(j.composition.artifacts.s3.text, `${first}\n\n---\n\n${second}`);
  j = await execute(j, 's4');
  assert.equal(j.status, 'review');
  assert.equal(Object.keys(j.composition.artifacts).length, 4);
  assert.equal(readWorkJob(JSON.parse(JSON.stringify(j))).status, 'review');
});
