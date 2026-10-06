import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createWorkJob, applyWorkCommand } from '../lib/workflow.ts';
import { workStore } from '../lib/work-store.ts';
import { catalog } from '../lib/catalog.ts';
import { routeSkyRequest, skyRoles } from '../lib/sky-routing.ts';
import { SKY_CONNECTION_TOOLS } from '../lib/operations.ts';
import {
  applyGoalEvent,
  compileGoal,
  validateGoal,
} from '../scripts/amc-goal-engine.mjs';
import { buildRequestPlan } from '../scripts/amc-request-plan.mjs';

const now = '2026-09-27T12:00:00.000Z';
const brief = {
  request: 'jevで仮想通貨のbot作成して',
  goal: '依頼すると担当と次の行動がわかる',
  intent: '自分が担当と進捗を把握し、実売買なしで試作を確かめる',
};
const clone = (value) => JSON.parse(JSON.stringify(value));
function create(extra = {}) {
  return createWorkJob(
    { id: randomUUID(), templateId: 'amc', brief, ...extra },
    now,
  );
}
function command(job, type, extra = {}) {
  const id = randomUUID();
  return {
    id,
    action: 'amc_event',
    event: {
      id,
      type,
      expectedRevision: job.amcGoal.revision,
      actor: 'local-worker',
      role: 'worker',
      ...extra,
    },
  };
}
function apply(job, type, extra = {}) {
  return applyWorkCommand(job, command(job, type, extra), job.revision, now);
}
function submit(job, taskId) {
  const task = job.amcGoal.tasks.find((item) => item.id === taskId);
  return apply(job, 'submit_result', {
    taskId,
    outcome: 'succeeded',
    deliverables: task.deliverables.map((item) => item.path),
    evidence: [`evidence/${taskId}-run.md`],
    summary: '本人が記録したローカル試作の結果。外部実行の証明ではない。',
  });
}
function review(job, taskId, actor = 'independent-reviewer') {
  const task = job.amcGoal.tasks.find((item) => item.id === taskId);
  return apply(job, 'verify_task', {
    taskId,
    actor,
    role: 'reviewer',
    accepted: true,
    evidence: [`evidence/${taskId}-review.md`],
    criterionResults: task.acceptanceCriteria.map((item) => ({
      criterionId: item.id,
      passed: true,
      evidence: [`evidence/${taskId}-review.md`],
    })),
  });
}

await test('AMC is a first-party connected Sky Tool and an explicit Zema routing target', () => {
  const tool = catalog.find((item) => item.id === 'rockstar-amc');
  assert.ok(tool);
  assert.equal(tool.status, 'ready');
  assert.equal(tool.origin, 'rockstaros');
  assert.equal(tool.launchPath, '/zema/amc');
  assert.ok(SKY_CONNECTION_TOOLS.includes(tool.id));
  assert.ok(skyRoles.some((role) => role.toolId === tool.id));
  assert.equal(
    routeSkyRequest('AMCで部隊とタスクの進捗を管理したい')?.toolId,
    tool.id,
  );
});

await test('Zema source contract embeds AMC before the generic launch link and uses the canonical board separately', () => {
  const chat = readFileSync(
    new URL('../components/sky-chat-workspace.tsx', import.meta.url),
    'utf8',
  );
  const component = readFileSync(
    new URL('../components/amc-tool-runner.tsx', import.meta.url),
    'utf8',
  );
  const page = readFileSync(
    new URL('../app/amc/page.tsx', import.meta.url),
    'utf8',
  );
  const runnerPosition = chat.indexOf('<AmcToolRunner');
  assert.ok(runnerPosition >= 0);
  assert.ok(runnerPosition < chat.indexOf('activeTool?.launchPath'));
  assert.match(
    chat.slice(runnerPosition, runnerPosition + 800),
    /initialText=\{activeRequest\.text\}/,
  );
  assert.match(
    component,
    /import missionData from '@\/data\/mission-control\.json'/,
  );
  assert.match(
    component,
    /import projectData from '@\/data\/project-status\.json'/,
  );
  assert.match(component, /<MissionBoard\s*\/>/);
  assert.match(component, /fetch\('\/api\/amc'/);
  assert.doesNotMatch(
    component,
    /executeTracked|fetch\(['"]\/api\/(?:llm|jobs)/,
  );
  assert.match(page, /<AmcToolRunner\s*\/>/);
});

await test('AMC work keeps the exact brief and saves an approved pending plan, not a claimed AI run', () => {
  const source = new URL('../data/mission-control.json', import.meta.url);
  const canonicalBefore = readFileSync(source, 'utf8');
  const job = create();
  assert.equal(job.templateId, 'amc');
  assert.equal(job.revision, 0);
  assert.equal(job.status, 'active');
  assert.equal(validateGoal(job.amcGoal).ok, true);
  assert.equal(job.amcGoal.state, 'active');
  assert.equal(job.amcGoal.reviewRequired, false);
  assert.deepEqual(job.amcGoal.requestBrief, {
    schema: 'amc-request-brief/1',
    ...brief,
    templateId: 'software-local-prototype-v1',
  });
  assert.deepEqual(job.amcGoal.squads.map((squad) => squad.id).sort(), [
    'REQ-BUILD',
    'REQ-DESIGN',
    'REQ-LEAD',
    'REQ-TEST',
  ]);
  assert.equal(job.amcGoal.tasks.length, 7);
  assert.equal(job.steps.length, 7);
  assert.ok(job.amcGoal.tasks.every((task) => task.status === 'pending'));
  assert.ok(job.steps.every((step) => !step.passed));
  assert.deepEqual(
    job.amcGoal.eventLog.map((event) => event.type),
    ['approve_plan'],
  );
  assert.equal(job.events.length, 0);
  assert.equal(readFileSync(source, 'utf8'), canonicalBefore);
});

await test('AMC creation rejects missing intent, unsupported physical scope and malformed/import ambiguity', () => {
  for (const bad of [
    { brief: { ...brief, request: 'パンを焼きたい' } },
    { brief: { ...brief, request: 'ロケットを製造したい' } },
    { brief: { ...brief, goal: '' } },
    { brief: { ...brief, intent: ' ' } },
    { brief: { ...brief, intent: 'x'.repeat(2001) } },
    { brief: { ...brief, request: 'x'.repeat(8001) } },
    { brief: null },
    { unknownAuthority: true },
    { importGoal: {} },
  ])
    assert.throws(() => create(bad));
  assert.throws(() =>
    createWorkJob({ id: randomUUID(), templateId: 'amc' }, now),
  );
  assert.throws(() => create({ importGoal: create().amcGoal }));
});

await test('AMC cannot bypass its reducer using generic WorkJob record, complete or cancel', () => {
  const job = create();
  const before = clone(job);
  for (const value of [
    { id: randomUUID(), action: 'complete', note: '完成したつもり' },
    { id: randomUUID(), action: 'cancel' },
    {
      id: randomUUID(),
      action: 'record',
      stepId: job.steps[0].id,
      tool: job.steps[0].tool,
      transport: 'browser',
      outcome: 'passed',
      sample: false,
      durationMs: 1,
    },
  ])
    assert.throws(() => applyWorkCommand(job, value, job.revision, now));
  assert.deepEqual(job, before);
  const article = createWorkJob(
    { id: randomUUID(), title: '従来の記事', templateId: 'article' },
    now,
  );
  assert.equal(article.steps[0].tool, 'mr-citations');
  assert.throws(() =>
    applyWorkCommand(
      article,
      command(job, 'pause', { reason: 'wait' }),
      0,
      now,
    ),
  );
  const cancelled = applyWorkCommand(
    article,
    { id: randomUUID(), action: 'cancel' },
    0,
    now,
  );
  assert.equal(cancelled.status, 'cancelled');
});

await test('AMC preserves dependency locks, paused results and independent review before marking a step done', () => {
  let job = create();
  const [first, second] = job.amcGoal.tasks;
  assert.throws(() => apply(job, 'start_task', { taskId: second.id }));
  job = apply(job, 'start_task', { taskId: first.id });
  assert.equal(job.steps[0].passed, false);
  assert.throws(() => apply(job, 'start_task', { taskId: first.id }));
  job = apply(job, 'pause', { reason: '結果が届くまで新しい処理を止める' });
  assert.equal(job.amcGoal.state, 'paused');
  assert.throws(() => apply(job, 'start_task', { taskId: second.id }));
  assert.throws(() =>
    apply(job, 'submit_result', { taskId: first.id, actor: 'other-worker' }),
  );
  job = submit(job, first.id);
  assert.equal(job.steps[0].passed, false);
  assert.throws(() => review(job, first.id, 'local-worker'));
  assert.throws(() =>
    apply(job, 'verify_task', {
      taskId: first.id,
      actor: 'independent-reviewer',
      role: 'reviewer',
      accepted: true,
      evidence: ['evidence/review.md'],
      criterionResults: [],
    }),
  );
  job = review(job, first.id);
  assert.equal(job.amcGoal.tasks[0].status, 'done');
  assert.equal(job.steps[0].passed, true);
  assert.equal(job.steps[1].passed, false);
  assert.equal(job.status, 'active');
  job = apply(job, 'resume');
  assert.equal(
    apply(job, 'start_task', { taskId: second.id }).amcGoal.tasks[1].status,
    'running',
  );
});

await test('AMC imported output locks still prevent two workers from claiming the same deliverable', () => {
  const definition = buildRequestPlan({
    ...brief,
    planId: randomUUID(),
    createdAt: now,
  });
  definition.project.tasks[1].dependsOn = [];
  definition.mission.taskPlans[1].deliverables = clone(
    definition.mission.taskPlans[0].deliverables,
  );
  const draft = compileGoal({
    instruction: brief.goal,
    mission: definition.mission,
    project: definition.project,
    squadIds: definition.mission.squads.map((squad) => squad.id),
    goalId: randomUUID(),
    maxParallel: 2,
  });
  const source = applyGoalEvent(draft, {
    id: randomUUID(),
    type: 'approve_plan',
    expectedRevision: draft.revision,
    actor: 'owner',
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement: definition.coverage,
    acceptanceCriteria: definition.acceptanceCriteria,
  });
  let job = createWorkJob(
    { id: randomUUID(), templateId: 'amc', importGoal: source },
    now,
  );
  const [first, second] = job.amcGoal.tasks;
  job = apply(job, 'start_task', { taskId: first.id });
  assert.throws(() => apply(job, 'start_task', { taskId: second.id }));
  job = submit(job, first.id);
  assert.throws(() => apply(job, 'start_task', { taskId: second.id }));
  job = review(job, first.id);
  job = apply(job, 'start_task', { taskId: second.id });
  assert.equal(job.amcGoal.tasks[1].status, 'running');
});

await test('AMC final completion requires explicit overall acceptance with every criterion evidenced', () => {
  let job = create();
  assert.throws(() =>
    apply(job, 'accept_goal', {
      actor: 'owner',
      role: 'owner',
      accepted: true,
      evidence: ['evidence/overall.md'],
      criterionResults: [],
    }),
  );
  for (const task of job.amcGoal.tasks) {
    job = apply(job, 'start_task', { taskId: task.id });
    job = submit(job, task.id);
    job = review(job, task.id);
  }
  assert.equal(job.status, 'review');
  assert.equal(job.amcGoal.state, 'active');
  assert.ok(job.steps.every((step) => step.passed));
  assert.throws(() =>
    apply(job, 'accept_goal', {
      actor: 'owner',
      role: 'owner',
      accepted: true,
      evidence: ['evidence/overall.md'],
      criterionResults: [],
    }),
  );
  job = apply(job, 'accept_goal', {
    actor: 'owner',
    role: 'owner',
    accepted: true,
    evidence: ['evidence/overall.md'],
    criterionResults: job.amcGoal.overallAcceptance.criteria.map((item) => ({
      criterionId: item.id,
      passed: true,
      evidence: ['evidence/overall.md'],
    })),
  });
  assert.equal(job.status, 'completed');
  assert.equal(job.amcGoal.state, 'accepted');
  assert.throws(() => apply(job, 'pause', { reason: 'rewrite' }));
});

await test('AMC command replay is idempotent while different payloads and stale WorkJob revisions fail', () => {
  const before = create();
  const value = command(before, 'pause', { reason: '人の判断待ち' });
  const after = applyWorkCommand(before, value, 0, now);
  assert.equal(after.revision, 1);
  assert.equal(after.amcGoal.revision, before.amcGoal.revision + 1);
  assert.equal(after.amcGoal.eventLog.at(-1).id, value.id);
  assert.equal(after.amcGoal.eventLog.at(-1).at, now);
  assert.deepEqual(
    applyWorkCommand(after, value, 0, '2026-09-28T00:00:00.000Z'),
    after,
  );
  assert.throws(
    () =>
      applyWorkCommand(
        after,
        {
          ...value,
          event: { ...value.event, reason: '別の理由' },
        },
        0,
        now,
      ),
    { status: 409 },
  );
  assert.throws(
    () => applyWorkCommand(after, command(after, 'resume'), 0, now),
    { status: 409 },
  );
  assert.equal(before.amcGoal.state, 'active');
});

await test('AMC rejects accumulated WorkJob history above 1.9 MB without mutating the existing plan', () => {
  let job = create();
  const reason = 'x'.repeat(100_000);
  for (let index = 0; index < 5; index += 1) {
    job = apply(job, 'pause', { reason });
    job = apply(job, 'resume');
  }
  const before = JSON.stringify(job);
  assert.ok(new TextEncoder().encode(before).byteLength < 1_900_000);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(job.amcGoal)).byteLength <
      1_500_000,
  );
  assert.throws(() => apply(job, 'pause', { reason }), { status: 413 });
  assert.equal(JSON.stringify(job), before);
  assert.equal(job.amcGoal.state, 'active');
});

await test('AMC event identity and Goal revision cannot bypass the outer command contract', () => {
  const job = create();
  const value = command(job, 'pause', { reason: '確認待ち' });
  assert.throws(() =>
    applyWorkCommand(
      job,
      {
        ...value,
        event: { ...value.event, id: randomUUID() },
      },
      job.revision,
      now,
    ),
  );
  assert.throws(
    () =>
      applyWorkCommand(
        job,
        {
          ...value,
          event: { ...value.event, expectedRevision: job.amcGoal.revision - 1 },
        },
        job.revision,
        now,
      ),
    { status: 409 },
  );
  const noId = clone(value);
  delete noId.event.id;
  noId.event.at = '2099-01-01T00:00:00.000Z';
  const saved = applyWorkCommand(job, noId, job.revision, now);
  assert.equal(saved.amcGoal.eventLog.at(-1).id, value.id);
  assert.equal(saved.amcGoal.eventLog.at(-1).at, now);
});

await test('AMC validated imports preserve prior recorded state without claiming fresh execution', () => {
  const source = apply(create(), 'pause', {
    reason: '端末側からの自己申告記録',
  });
  const imported = createWorkJob(
    { id: randomUUID(), templateId: 'amc', importGoal: clone(source.amcGoal) },
    now,
  );
  assert.deepEqual(imported.amcGoal, source.amcGoal);
  assert.equal(imported.revision, 0);
  assert.equal(imported.events.length, 0);
  assert.ok(imported.steps.every((step) => !step.passed));
  assert.throws(() =>
    createWorkJob(
      {
        id: randomUUID(),
        templateId: 'amc',
        importGoal: { ...source.amcGoal, schema: 'amc-goal/999' },
      },
      now,
    ),
  );
  const corrupted = clone(source.amcGoal);
  corrupted.tasks[0].status = 'done';
  assert.throws(() =>
    createWorkJob(
      { id: randomUUID(), templateId: 'amc', importGoal: corrupted },
      now,
    ),
  );
  assert.throws(() =>
    createWorkJob(
      {
        id: randomUUID(),
        templateId: 'amc',
        importGoal: { ...source.amcGoal, instruction: 'x'.repeat(1_500_001) },
      },
      now,
    ),
  );
});

await test('all 32 existing squads remain a distinct importable canonical plan with approval and holds intact', () => {
  const mission = JSON.parse(
    readFileSync(
      new URL('../data/mission-control.json', import.meta.url),
      'utf8',
    ),
  );
  const project = JSON.parse(
    readFileSync(
      new URL('../data/project-status.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(mission.squads.length, 32);
  const source = compileGoal({
    instruction: '既存の各部隊の承認範囲と根拠を確認する。',
    squadIds: mission.squads.map((squad) => squad.id),
    mission,
    project,
    goalId: 'canonical-read-only',
    maxParallel: 1,
  });
  const job = createWorkJob(
    { id: randomUUID(), templateId: 'amc', importGoal: source },
    now,
  );
  assert.equal(job.amcGoal.squads.length, 32);
  assert.deepEqual(job.amcGoal.selectedSquadIds, source.selectedSquadIds);
  assert.equal(job.amcGoal.requestBrief, undefined);
  assert.equal(job.amcGoal.state, 'draft');
  assert.equal(job.amcGoal.reviewRequired, true);
  assert.deepEqual(job.amcGoal.holds, source.holds);
  assert.ok(job.amcGoal.holds.length > 0);
  assert.ok(job.steps.every((step) => !step.passed));
  assert.throws(() =>
    apply(job, 'start_task', { taskId: job.amcGoal.tasks[0].id }),
  );
});

await test('AMC jobs use the same real SQLite ownership and revision CAS boundary as other work', async (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
    .sort()) {
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'),
    );
  }
  const store = workStore({
    prepare(sql) {
      return {
        bind(...args) {
          const statement = sqlite.prepare(sql);
          return {
            async first() {
              return statement.get(...args) ?? null;
            },
            async all() {
              return { results: statement.all(...args) };
            },
            async run() {
              return {
                meta: { changes: Number(statement.run(...args).changes) },
              };
            },
          };
        },
      };
    },
  });
  const job = create();
  assert.deepEqual(await store.create('alice', job), job);
  assert.deepEqual(await store.create('alice', job), job);
  assert.equal(await store.get('bob', job.id), null);
  assert.deepEqual(await store.list('bob'), []);
  assert.equal(await store.create('bob', job), null);
  const next = apply(job, 'pause', { reason: '本人確認待ち' });
  assert.equal(await store.update('bob', next, 0), false);
  const results = await Promise.all([
    store.update('alice', next, 0),
    store.update('alice', { ...next, title: '競合した別操作' }, 0),
  ]);
  assert.deepEqual(
    results.sort((a, b) => Number(a) - Number(b)),
    [false, true],
  );
  assert.deepEqual(await store.get('alice', job.id), next);
  assert.equal(await store.update('alice', job, 0), false);
  assert.equal((await store.list('alice')).length, 1);
  assert.deepEqual(await store.list('alice', true), []);
  assert.deepEqual(await store.listAmc('bob'), []);
  const summaries = await store.listAmc('alice');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].id, next.id);
  assert.equal(summaries[0].revision, next.revision);
  assert.equal(summaries[0].amcGoal, undefined);
  assert.deepEqual(summaries[0].steps, []);
  assert.deepEqual(summaries[0].events, []);
});
