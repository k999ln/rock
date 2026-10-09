import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { request as httpRequest } from 'node:http';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  validatePlannerRequest,
  plannerProposalSchema,
  validatePlannerProposal,
  compilePlannerProposal,
  plannerCodexArgs,
  executePlannerCodex,
  createPlannerServer,
} from '../scripts/amc-planner.mjs';
import { summarizeGoal, validateGoal } from '../scripts/amc-goal-engine.mjs';

const hash = 'a'.repeat(64);
const context = {
  mainSha: 'b'.repeat(40),
  localHead: 'c'.repeat(40),
  collectedAt: '2026-10-09T12:00:00Z',
};
const bots = [
  { id: 'sky', paths: ['lib'], guides: ['docs/sky.md'], squads: ['O4'] },
];
const request = {
  request: 'Skyの検索を速くする',
  intent: '利用者がToolを見つけやすくする',
  feedback: '',
  botId: 'sky',
  previousGoal: null,
  allowCodexUpload: true,
};
function sources() {
  return {
    provenance: [{ path: 'data/mission-control.json', sha256: hash }],
    mission: {
      updatedAt: 'fixture',
      globalRules: ['元の依頼を守る'],
      squads: ['O4', 'H1'].map((id) => ({
        id,
        name: id,
        goal: id,
        rules: ['fixture'],
        acceptanceGate: 'independent review',
        nextTaskIds: ['SOURCE'],
      })),
      taskPlans: [{ taskId: 'SOURCE', parentTaskId: 'PARENT' }],
      executionHolds: [
        {
          id: 'HOLD1',
          taskIds: ['PARENT'],
          scope: 'provider',
          reason: 'provider未接続',
          releaseCondition: '本人の承認とprovider証拠',
          decisionOwner: 'owner',
        },
        {
          id: 'HOLD2',
          taskIds: ['DEP'],
          scope: 'device',
          reason: '機種未確定',
          releaseCondition: '機種適合',
          decisionOwner: 'owner',
        },
      ],
    },
    project: {
      updatedAt: 'fixture',
      tasks: [
        {
          id: 'SOURCE',
          title: 'search',
          status: 'planned',
          dependsOn: ['DEP'],
        },
        { id: 'PARENT', title: 'parent', status: 'planned', dependsOn: [] },
        { id: 'DEP', title: 'dependency', status: 'blocked', dependsOn: [] },
      ],
    },
  };
}
function proposal(count = 2) {
  return {
    schema: 'amc-adaptive-proposal/1',
    status: 'proposed',
    summary: '検索の測定と改善を分ける',
    intent: request.intent,
    questions: [],
    assumptions: ['fixture plan'],
    tasks: Array.from({ length: count }, (_, i) => ({
      id: `PLAN-${i + 1}`,
      squadId: i % 2 ? 'H1' : 'O4',
      title: `検索改善${i + 1}`,
      scope: '検索APIを調査して最小修正',
      workloadClass: 'code_test',
      steps: ['検索APIと試験を読む', '実物と速度を独立検収する'],
      deliverables: [
        { path: `lib/search-${i + 1}.ts`, description: '検索処理の差分' },
      ],
      acceptanceCriteria: [
        {
          criterion: '既存応答を保持して遅延が減る',
          verification: '検索fixtureとベンチを比較する',
        },
      ],
      dependsOn: i ? [`PLAN-${i}`] : [],
      sourceTaskIds: i ? [] : ['SOURCE'],
    })),
  };
}
function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), 'amc-planner-'));
  const servers = [];
  t.after(async () => {
    for (const server of servers) await server.close();
    rmSync(repo, { recursive: true, force: true });
  });
  return { repo, servers };
}
async function live(t, overrides = {}) {
  const state = fixture(t),
    source = sources();
  const app = createPlannerServer({
    repo: state.repo,
    bots,
    loadSources: () => source,
    collectContext: async () => ({
      git: {
        main: context.mainSha,
        local: { head: context.localHead },
        liveMetadataVerified: true,
      },
      collectedAt: context.collectedAt,
      sourceFiles: source.provenance,
    }),
    execute: async () => proposal(),
    render: (_sources, { plannerSession }) =>
      `<!doctype html><p>${plannerSession.endpoint}</p><input value="${plannerSession.token}">`,
    ...overrides,
  });
  state.servers.push(app);
  const url = await app.listen();
  return { ...state, app, url, source };
}
function call(
  app,
  url,
  {
    method = 'POST',
    path = '/api/plan',
    headers = {},
    body = request,
    signal,
  } = {},
) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path,
        method,
        signal,
        headers: {
          host: target.host,
          origin: target.origin,
          'content-type': 'application/json',
          'x-amc-session': app.token,
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text,
            value: res.headers['content-type']?.includes('application/json')
              ? JSON.parse(text)
              : null,
          });
        });
      },
    );
    req.on('error', reject);
    req.end(
      method === 'GET'
        ? undefined
        : typeof body === 'string'
          ? body
          : JSON.stringify(body),
    );
  });
}

test('variable concrete task counts use existing AMC engine and preserve canonical holds', () => {
  const source = sources(),
    before = JSON.stringify(source);
  for (const count of [1, 3, 9, 24]) {
    const goal = compilePlannerProposal({
      request,
      proposal: proposal(count),
      sources: source,
      context,
      goalId: `adaptive-${count}`,
    });
    assert.equal(validateGoal(goal).ok, true);
    assert.equal(goal.tasks.length, count);
    assert.equal(goal.state, 'draft');
    assert.equal(goal.revision, 0);
    assert.equal(goal.approval, null);
    assert.deepEqual(goal.eventLog, []);
    assert.deepEqual(summarizeGoal(goal).readyTaskIds, []);
    assert.deepEqual(
      goal.tasks[0].holds.map((h) => h.id),
      ['HOLD1', 'HOLD2'],
    );
    assert.deepEqual(goal.holds[0].sourceTaskIds, ['PARENT']);
    assert.equal(goal.tasks[0].executionEligibility, 'local_work');
    assert.equal(goal.adaptiveBrief.request, request.request);
    assert.deepEqual(goal.adaptiveBrief.taskSources[0].sourceTaskIds, [
      'SOURCE',
    ]);
  }
  assert.equal(JSON.stringify(source), before);
});

test('feedback creates a new draft with original Goal reference without changing previous data', () => {
  const previousGoal = {
    id: 'original',
    revision: 4,
    instruction: '初期の依頼',
    tasks: [
      { id: 'PREV1', title: '既存任務', status: 'submitted', dependsOn: [] },
    ],
  };
  const input = { ...request, feedback: '測定を先に', previousGoal };
  const snapshot = JSON.stringify(input);
  const goal = compilePlannerProposal({
    request: input,
    proposal: proposal(),
    sources: sources(),
    context,
  });
  assert.deepEqual(goal.adaptiveBrief.previousGoal, {
    id: 'original',
    revision: 4,
  });
  assert.notEqual(goal.id, previousGoal.id);
  assert.equal(goal.adaptiveBrief.feedback, input.feedback);
  assert.equal(JSON.stringify(input), snapshot);
  assert.ok(goal.tasks.every((t) => t.status === 'pending'));
});

test('important missing input returns questions and no invented Goal', () => {
  const p = {
    ...proposal(),
    status: 'needs_input',
    tasks: [],
    questions: ['対象の画面はどれですか'],
  };
  assert.equal(
    compilePlannerProposal({
      request,
      proposal: p,
      sources: sources(),
      context,
    }),
    null,
  );
  assert.throws(() =>
    validatePlannerProposal({ ...p, questions: [] }, sources()),
  );
});

test('proposal validates strict schema, safe paths, owners, references and cycles', () => {
  const mutations = [
    (p) => {
      p.approval = true;
    },
    (p) => {
      p.tasks[0].status = 'done';
    },
    (p) => {
      p.tasks[0].squadId = 'UNKNOWN';
    },
    (p) => {
      p.tasks[0].sourceTaskIds = ['UNKNOWN'];
    },
    (p) => {
      p.tasks[0].dependsOn = ['UNKNOWN'];
    },
    (p) => {
      p.tasks[0].dependsOn = ['PLAN-2'];
    },
    (p) => {
      p.tasks[0].deliverables[0].path = '../secret';
    },
    (p) => {
      p.tasks[0].deliverables[0].path = '/tmp/a';
    },
    (p) => {
      p.tasks[0].acceptanceCriteria[0].evidence = ['fake'];
    },
    (p) => {
      p.tasks[1].id = p.tasks[0].id;
    },
    (p) => {
      p.tasks = [];
    },
    (p) => {
      p.tasks[0].steps = [];
    },
  ];
  for (const mutate of mutations) {
    const p = proposal();
    mutate(p);
    assert.throws(() => validatePlannerProposal(p, sources()));
  }
  assert.throws(() => validatePlannerProposal(proposal(25), sources()));
  const schema = plannerProposalSchema(sources().mission);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.tasks.items.additionalProperties, false);
});

test('request rejects extra authority data, bad lengths, unknown bot and invalid old task graph', () => {
  assert.deepEqual(validatePlannerRequest(request, bots), request);
  for (const input of [
    { ...request, allowCodexUpload: false },
    { ...request, allowCodexUpload: undefined },
    { ...request, approval: true },
    { ...request, request: 'a'.repeat(8001) },
    { ...request, feedback: 'a'.repeat(8001) },
    { ...request, botId: 'other' },
    {
      ...request,
      previousGoal: {
        id: 'old',
        revision: 1,
        instruction: 'old',
        tasks: [
          { id: 'T1', title: 'one', status: 'done', dependsOn: ['missing'] },
        ],
      },
    },
  ])
    assert.throws(() => validatePlannerRequest(input, bots));
});

test('native Codex receives stdin, read-only sandbox, inherited auth/model and no bypass', async (t) => {
  const { repo } = fixture(t),
    runDir = join(repo, 'run');
  mkdirSync(runDir);
  let observed,
    input = '';
  const spawnImpl = (binary, args, options) => {
    observed = { binary, args, options };
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    child.stdin.on('data', (c) => {
      input += c.toString();
    });
    child.stdin.on('finish', () => {
      writeFileSync(
        join(runDir, 'proposal.raw.json'),
        JSON.stringify(proposal()),
        { mode: 0o600 },
      );
      child.emit('close', 0);
    });
    return child;
  };
  assert.deepEqual(
    await executePlannerCodex({
      repo,
      runDir,
      prompt: 'private request',
      spawnImpl,
      binary: '/fixture/codex',
    }),
    proposal(),
  );
  assert.equal(input, 'private request');
  assert.equal(observed.options.shell, false);
  assert.deepEqual(observed.args, plannerCodexArgs({ repo, runDir }));
  assert.ok(observed.args.includes('read-only'));
  assert.ok(observed.args.includes('never'));
  assert.ok(observed.args.includes('browser_use'));
  assert.ok(!observed.args.includes('private request'));
  assert.ok(!observed.args.some((x) => /bypass|yolo|full-auto|model/.test(x)));
  assert.equal(statSync(join(runDir, 'codex-stderr.txt')).mode & 0o777, 0o600);
});

test('native process stops on cancellation and caps private log output', async (t) => {
  for (const scenario of ['abort', 'output']) {
    const { repo } = fixture(t),
      runDir = join(repo, 'run');
    mkdirSync(runDir);
    const controller = new AbortController();
    let killed = 0;
    const spawnImpl = () => {
      const child = new EventEmitter();
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {
        killed += 1;
        queueMicrotask(() => child.emit('close', null));
      };
      child.stdin.on('finish', () => {
        if (scenario === 'abort') controller.abort();
        else child.stdout.write('a'.repeat(300));
      });
      return child;
    };
    await assert.rejects(
      executePlannerCodex({
        repo,
        runDir,
        prompt: 'test',
        signal: controller.signal,
        spawnImpl,
        binary: '/fixture/codex',
        maxLogBytes: 128,
      }),
      (e) => ['cancelled', 'output_limit'].includes(e.code),
    );
    assert.equal(killed, 1);
    assert.ok(statSync(join(runDir, 'codex-events.jsonl')).size <= 128);
  }
});

test('local UI is fresh and startup never invokes the model', async (t) => {
  let modelCalls = 0,
    loads = 0;
  const { app, url } = await live(t, {
    loadSources: () => {
      loads += 1;
      return sources();
    },
    execute: async () => {
      modelCalls += 1;
      return proposal();
    },
  });
  for (let i = 0; i < 2; i++) {
    const result = await call(app, url, { method: 'GET', path: '/' });
    assert.equal(result.status, 200);
    assert.match(result.text, /\/api\/plan/);
    assert.match(
      result.headers['content-security-policy'],
      /frame-ancestors 'none'/,
    );
  }
  assert.equal(loads, 2);
  assert.equal(modelCalls, 0);
  assert.equal(
    (
      await call(app, url, {
        method: 'GET',
        path: '/data/mission-control.json',
      })
    ).status,
    404,
  );
});

test('localhost Host, exact Origin and session token must all match', async (t) => {
  let modelCalls = 0;
  const { app, url } = await live(t, {
    execute: async () => {
      modelCalls++;
      return proposal();
    },
  });
  for (const headers of [
    { host: 'attacker.example' },
    { host: `localhost:${new URL(url).port}` },
    { origin: 'https://attacker.example' },
    { origin: '' },
    { 'x-amc-session': 'wrong' },
    { 'content-type': 'text/plain' },
  ]) {
    const result = await call(app, url, { headers });
    assert.equal(result.status, 403);
    assert.equal(result.headers['access-control-allow-origin'], undefined);
  }
  assert.equal(modelCalls, 0);
});

test('authorized planning returns draft, Git provenance and private artifacts', async (t) => {
  const { app, url, repo } = await live(t);
  const result = await call(app, url);
  assert.equal(result.status, 200);
  assert.equal(result.value.goal.state, 'draft');
  assert.equal(result.value.proposal.tasks.length, 2);
  assert.equal(result.value.context.mainSha, context.mainSha);
  assert.equal(result.value.context.botId, 'sky');
  const parent = join(repo, 'work/amc-planner'),
    [folder] = readdirSync(parent),
    runDir = join(parent, folder);
  for (const file of readdirSync(runDir))
    assert.equal(statSync(join(runDir, file)).mode & 0o777, 0o600);
  assert.equal(
    JSON.parse(readFileSync(join(runDir, 'result.json'))).executionStarted,
    false,
  );
});

test('HTTP malformed and oversized requests never reach context/model', async (t) => {
  let calls = 0;
  const { app, url } = await live(t, {
    collectContext: async () => {
      calls++;
      throw new Error('no');
    },
  });
  for (const body of [
    '{',
    { ...request, request: '' },
    { ...request, allowCodexUpload: false },
    'a'.repeat(180_001),
  ]) {
    const result = await call(app, url, { body });
    assert.equal(result.status, 400);
  }
  assert.equal(calls, 0);
});

test('Git failure and invalid model output have no template fallback or raw error leak', async (t) => {
  for (const overrides of [
    {
      collectContext: async () => {
        throw new Error('secret-token');
      },
    },
    { execute: async () => ({ status: 'done', approval: 'secret-token' }) },
    {
      execute: async () => {
        throw new Error('secret-token');
      },
    },
  ]) {
    const { app, url, repo } = await live(t, overrides);
    const result = await call(app, url);
    assert.notEqual(result.status, 200);
    assert.ok(!result.text.includes('secret-token'));
    assert.equal(result.value.goal, undefined);
    const parent = join(repo, 'work/amc-planner');
    const runDir = join(parent, readdirSync(parent)[0]);
    assert.equal(
      JSON.parse(readFileSync(join(runDir, 'failure.json'))).executionStarted,
      false,
    );
  }
});

test('single flight blocks concurrent requests; client cancellation aborts model', async (t) => {
  let started;
  const ready = new Promise((r) => {
    started = r;
  });
  let aborted = false;
  const { app, url } = await live(t, {
    execute: ({ signal }) =>
      new Promise((resolve, reject) => {
        started();
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('cancelled'));
          },
          { once: true },
        );
      }),
  });
  const controller = new AbortController();
  const first = call(app, url, { signal: controller.signal });
  first.catch(() => {});
  await ready;
  assert.equal((await call(app, url)).status, 409);
  controller.abort();
  await assert.rejects(first);
  await delay(30);
  assert.equal(aborted, true);
});

test('timeout does not release single-flight lock before actual worker settles', async (t) => {
  let finish, started;
  const ready = new Promise((r) => {
    started = r;
  });
  let observedSignal;
  const { app, url } = await live(t, {
    timeoutMs: 30,
    execute: ({ signal }) => {
      observedSignal = signal;
      started();
      return new Promise((r) => {
        finish = r;
      });
    },
  });
  const first = call(app, url);
  await ready;
  assert.equal((await first).status, 504);
  assert.equal(observedSignal.aborted, true);
  assert.equal((await call(app, url)).status, 409);
  finish(proposal());
  await delay(20);
});

test('native model result rejects oversized files and symlinks', async (t) => {
  for (const scenario of ['oversize', 'symlink']) {
    const { repo } = fixture(t),
      runDir = join(repo, 'run');
    mkdirSync(runDir);
    const spawnImpl = () => {
      const child = new EventEmitter();
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {};
      child.stdin.on('finish', () => {
        if (scenario === 'symlink') {
          const elsewhere = join(repo, 'elsewhere.json');
          writeFileSync(elsewhere, JSON.stringify(proposal()));
          symlinkSync(elsewhere, join(runDir, 'proposal.raw.json'));
        } else
          writeFileSync(join(runDir, 'proposal.raw.json'), 'a'.repeat(512001));
        child.emit('close', 0);
      });
      return child;
    };
    await assert.rejects(
      executePlannerCodex({
        repo,
        runDir,
        prompt: 'test',
        spawnImpl,
        binary: '/fixture/codex',
      }),
      (e) => e.code === 'invalid_proposal',
    );
  }
});

test('whitespace normalization keeps the exact raw request artifact and valid engine brief', async (t) => {
  const { app, url, repo } = await live(t);
  const input = { ...request, request: '  ' + request.request + '\n' };
  const result = await call(app, url, { body: input });
  assert.equal(result.status, 200);
  assert.equal(
    result.value.goal.adaptiveBrief.request,
    result.value.goal.instruction,
  );
  const parent = join(repo, 'work/amc-planner');
  const runDir = join(parent, readdirSync(parent)[0]);
  assert.equal(
    JSON.parse(readFileSync(join(runDir, 'request.json'))).request,
    input.request,
  );
});

test('disconnect during Git collection aborts collection and never starts model', async (t) => {
  let started;
  const ready = new Promise((r) => {
    started = r;
  });
  let modelCalls = 0,
    aborted = false;
  const { app, url } = await live(t, {
    collectContext: ({ signal }) =>
      new Promise((resolve, reject) => {
        started();
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('cancelled'));
          },
          { once: true },
        );
      }),
    execute: async () => {
      modelCalls++;
      return proposal();
    },
  });
  const controller = new AbortController();
  const first = call(app, url, { signal: controller.signal });
  first.catch(() => {});
  await ready;
  controller.abort();
  await assert.rejects(first);
  await delay(20);
  assert.equal(aborted, true);
  assert.equal(modelCalls, 0);
});
