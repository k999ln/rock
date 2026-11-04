import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  compileBackwardPlan,
  validateBackwardPlan,
  backwardSchedule,
} from '../scripts/amc-backward-plan.mjs';
import {
  createGoalCycle,
  approveGoalCycle,
  readGoalCycle,
  runGoalCycle,
  stopGoalCycle,
  resumeGoalCycle,
  acceptGoalCycle,
  recoverGoalCycleLock,
} from '../scripts/amc-goal-cycle.mjs';
import {
  localDemoPlan,
  localDemoAdapters,
} from '../scripts/amc-goal-cycle-demo.mjs';
import {
  codexCycleAdapters,
  proposeBackwardPlan,
} from '../scripts/amc-goal-cycle-codex.mjs';
import { summarizeGoal } from '../scripts/amc-goal-engine.mjs';

const catalog = JSON.parse(
  readFileSync(new URL('../data/amc/company-roles.json', import.meta.url)),
);
const plan = () => {
  const value = localDemoPlan();
  value.tasks = value.tasks.slice(0, 1);
  value.successCriteria[0].taskIds = ['research'];
  return value;
};
const temporary = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'amc-cycle-test-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  return directory;
};
async function setup(t, { approved = true, definition = plan() } = {}) {
  const root = temporary(t),
    repo = join(root, 'repo'),
    directory = join(root, 'run');
  mkdirSync(repo);
  await createGoalCycle({
    repo,
    directory,
    plan: definition,
    catalog,
    mode: 'local-demo',
  });
  if (approved)
    await approveGoalCycle({
      directory,
      owner: 'test-owner',
      expectedRevision: 0,
    });
  return { repo, directory };
}
const adapters = () => localDemoAdapters();
const never = () => new Promise(() => {});
const until = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Condition not reached');
};

await test('39 business and engineering roles are connected to an actual backward DAG', () => {
  assert.equal(catalog.roles.length, 39);
  assert.equal(
    catalog.roles.filter((role) => role.id.startsWith('REV')).length,
    18,
  );
  assert.equal(
    catalog.roles.filter((role) => role.id.startsWith('DEV')).length,
    21,
  );
  assert.deepEqual(validateBackwardPlan(localDemoPlan(), catalog), [
    'research',
    'offer',
    'acceptance',
    'packet',
  ]);
});

for (const [name, change, pattern] of [
  [
    'unknown worker role',
    (p) => {
      p.tasks[0].roleId = 'CEO';
    },
    /Unknown role/,
  ],
  [
    'self review',
    (p) => {
      p.tasks[0].reviewerRoleId = p.tasks[0].roleId;
    },
    /Independent reviewer/,
  ],
  [
    'missing Goal coverage',
    (p) => {
      p.successCriteria[0].taskIds = [];
    },
    /concrete outcomes/,
  ],
  [
    'unknown prerequisite',
    (p) => {
      p.tasks[0].dependsOn = ['missing'];
    },
    /Unknown.*dependency/,
  ],
  [
    'dependency cycle',
    (p) => {
      p.tasks[0].dependsOn = ['packet'];
    },
    /cycle/,
  ],
  [
    'unrelated busywork',
    (p) => {
      p.tasks.push({
        ...p.tasks[0],
        id: 'orphan',
        deliverables: [{ path: 'extra.md', description: 'Unrelated' }],
      });
    },
    /Unrelated/,
  ],
  [
    'path traversal',
    (p) => {
      p.tasks[0].deliverables[0].path = '../secret';
    },
    /Unsafe/,
  ],
  [
    'protected metadata output',
    (p) => {
      p.tasks[0].deliverables[0].path = '.git/config';
    },
    /Protected/,
  ],
  [
    'ambiguous ownership',
    (p) => {
      p.tasks[2].deliverables[0].path = p.tasks[0].deliverables[0].path;
    },
    /ownership/,
  ],
  [
    'invented zero effort',
    (p) => {
      p.tasks[0].durationMinutes = 0;
    },
    /Duration/,
  ],
  [
    'unbounded policy',
    (p) => {
      p.policy.maxAttemptsPerTask = 999;
    },
    /Bounded/,
  ],
  [
    'deadline without timezone',
    (p) => {
      p.deadline = '2026-12-01T12:00:00';
    },
    /timezone/,
  ],
])
  await test(`reject ${String(name)}`, () => {
    const definition = localDemoPlan();
    change(definition);
    assert.throws(() => validateBackwardPlan(definition, catalog), pattern);
  });

await test('backward schedule separates critical path, one-worker duration and unknown estimates', () => {
  const definition = localDemoPlan();
  assert.equal(backwardSchedule(definition, catalog).criticalMinutes, null);
  definition.tasks.forEach((task) => {
    task.durationMinutes = 10;
  });
  definition.deadline = '2026-11-04T01:00:00Z';
  const schedule = backwardSchedule(
    definition,
    catalog,
    '2026-11-04T00:25:00Z',
  );
  assert.equal(schedule.criticalMinutes, 30);
  assert.equal(schedule.serialMinutes, 40);
  assert.equal(schedule.deadlineFeasibleWithOneWorker, false);
  assert.equal(schedule.latestStartMinutesFromNow.research, -5);
});

await test('external or owner-only work remains held in the existing engine', async (t) => {
  const definition = plan();
  definition.tasks[0].execution = 'owner';
  const compiled = compileBackwardPlan(definition, catalog);
  assert.equal(compiled.tasks[0].executionEligibility, 'authority_required');
  assert.equal(compiled.tasks[0].holds.length, 1);
  const { directory } = await setup(t, { definition });
  assert.deepEqual(
    summarizeGoal(readGoalCycle(directory).goal).readyTaskIds,
    [],
  );
  const result = await runGoalCycle({ directory, ...adapters() });
  assert.equal(result.phase, 'handoff');
  assert.equal(result.invocations, 0);
});

await test('draft cannot execute and stale approval is rejected', async (t) => {
  const { directory } = await setup(t, { approved: false });
  assert.equal(
    (await runGoalCycle({ directory, ...adapters() })).invocations,
    0,
  );
  await assert.rejects(
    approveGoalCycle({ directory, owner: 'ceo', expectedRevision: 1 }),
    /Stale/,
  );
  await approveGoalCycle({ directory, owner: 'ceo', expectedRevision: 0 });
  await assert.rejects(
    approveGoalCycle({ directory, owner: 'ceo', expectedRevision: 0 }),
    /Stale/,
  );
});

await test('actual artifacts traverse roles, rejection, bounded replan and independent acceptance', async (t) => {
  const { directory, repo } = await setup(t, { definition: localDemoPlan() });
  const before = readGoalCycle(directory).goalHash;
  const { worker, reviewer } = adapters();
  const seen = [];
  const run = worker.run.bind(worker);
  worker.run = async (context) => {
    seen.push(`${context.task.id}:${context.attempt}`);
    for (const dep of context.task.dependsOn)
      assert.equal(
        context.goal.tasks.find((task) => task.id === dep).status,
        'done',
      );
    assert.equal(readGoalCycle(directory).operation.status, 'intent');
    return run(context);
  };
  const result = await runGoalCycle({ directory, worker, reviewer });
  assert.equal(result.phase, 'awaiting_owner_acceptance');
  assert.equal(result.goal.state, 'active');
  assert.equal(result.goal.overallAcceptance.accepted, false);
  assert.equal(result.goalHash, before);
  assert.equal(result.invocations, 10);
  assert.deepEqual(seen, [
    'research:1',
    'offer:1',
    'offer:2',
    'acceptance:1',
    'packet:1',
  ]);
  assert.ok(
    result.history.some((item) => item.reason.startsWith('Replan offer')),
  );
  assert.ok(
    readFileSync(join(repo, 'pilot/packet.md'), 'utf8').includes('技術受入'),
  );
  assert.ok(
    result.goal.tasks.every((task) => task.startedBy !== task.review.actor),
  );
  assert.equal(
    (await runGoalCycle({ directory, ...adapters() })).invocations,
    10,
  );
});

await test('retry budget stops repeated defects without weakening criteria', async (t) => {
  const { directory } = await setup(t);
  const { worker, reviewer } = adapters();
  reviewer.review = async ({ spec }) => ({
    accepted: false,
    safeForLocalRework: true,
    summary: 'Known defect',
    criteria: spec.acceptanceCriteria.map((item) => ({
      criterionId: item.id,
      passed: false,
      detail: 'Observed local defect',
    })),
  });
  const result = await runGoalCycle({ directory, worker, reviewer });
  assert.equal(result.phase, 'handoff');
  assert.equal(result.attempts.research, 2);
  assert.equal(result.invocations, 4);
  assert.match(result.reason, /Retry bound/);
  assert.equal(result.goal.tasks[0].status, 'failed');
});

await test('invocation budget reserves worker/reviewer calls before execution', async (t) => {
  const definition = plan();
  definition.policy.maxInvocations = 1;
  const { directory } = await setup(t, { definition });
  const result = await runGoalCycle({ directory, ...adapters() });
  assert.equal(result.phase, 'handoff');
  assert.equal(result.invocations, 1);
  assert.equal(result.goal.tasks[0].status, 'submitted');
});

await test('a reviewer rejection without safe rework hands control back', async (t) => {
  const { directory } = await setup(t);
  const { worker, reviewer } = adapters();
  reviewer.review = async ({ spec }) => ({
    accepted: false,
    safeForLocalRework: false,
    summary: 'Requires owner decision',
    criteria: spec.acceptanceCriteria.map((item) => ({
      criterionId: item.id,
      passed: false,
      detail: 'Cannot verify with current authority',
    })),
  });
  const result = await runGoalCycle({ directory, worker, reviewer });
  assert.equal(result.phase, 'handoff');
  assert.equal(result.attempts.research, 1);
});

await test('missing artifacts cannot be promoted from worker claims', async (t) => {
  const { directory } = await setup(t);
  const { worker, reviewer } = adapters();
  worker.run = async () => ({ status: 'completed', summary: 'Claim only' });
  const result = await runGoalCycle({ directory, worker, reviewer });
  assert.equal(result.phase, 'handoff');
  assert.equal(result.goal.tasks[0].status, 'running');
  assert.equal(result.operation.status, 'intent');
});

await test('a reviewer cannot change artifacts and then accept them', async (t) => {
  const { directory, repo } = await setup(t);
  const { worker, reviewer } = adapters();
  const review = reviewer.review.bind(reviewer);
  reviewer.review = async (context) => {
    const result = await review(context);
    writeFileSync(join(repo, 'pilot/research.md'), 'changed');
    return result;
  };
  const result = await runGoalCycle({ directory, worker, reviewer });
  assert.equal(result.phase, 'handoff');
  assert.equal(result.goal.tasks[0].status, 'submitted');
  assert.match(result.reason, /changed during/);
});

await test('stop at a clean boundary supports explicit revision-checked resume', async (t) => {
  const { directory } = await setup(t);
  stopGoalCycle(directory);
  const stopped = await runGoalCycle({ directory, ...adapters() });
  assert.equal(stopped.phase, 'paused');
  assert.equal(stopped.invocations, 0);
  await assert.rejects(
    resumeGoalCycle({ directory, expectedRevision: 0 }),
    /Only a clean/,
  );
  await resumeGoalCycle({ directory, expectedRevision: stopped.revision });
  assert.equal(
    (await runGoalCycle({ directory, ...adapters() })).phase,
    'awaiting_owner_acceptance',
  );
});

await test('stop during execution retains unknown intent, never replays, and rejects concurrent supervisor', async (t) => {
  const { directory } = await setup(t);
  const { worker, reviewer } = adapters();
  worker.run = never;
  const running = runGoalCycle({ directory, worker, reviewer });
  await until(() => readGoalCycle(directory).operation?.status === 'intent');
  await assert.rejects(runGoalCycle({ directory, ...adapters() }), /locked/);
  stopGoalCycle(directory);
  const result = await running;
  assert.equal(result.phase, 'handoff');
  assert.equal(result.operation.status, 'intent');
  assert.match(result.reason, /unknown/);
  assert.equal(
    (await runGoalCycle({ directory, ...adapters() })).invocations,
    1,
  );
  await assert.rejects(
    resumeGoalCycle({ directory, expectedRevision: result.revision }),
    /unknown effects/,
  );
});

await test('finite timeout preserves unknown effects instead of silently retrying', async (t) => {
  const definition = plan();
  definition.policy.stepTimeoutMs = 50;
  const { directory } = await setup(t, { definition });
  const { worker, reviewer } = adapters();
  worker.run = never;
  const result = await runGoalCycle({ directory, worker, reviewer });
  assert.equal(result.phase, 'handoff');
  assert.match(result.reason, /Timeout/);
  assert.equal(result.invocations, 1);
});

await test('expired deadline stops before starting work', async (t) => {
  const definition = plan();
  definition.deadline = '2020-01-01T00:00:00Z';
  const { directory } = await setup(t, { definition });
  const result = await runGoalCycle({ directory, ...adapters() });
  assert.equal(result.invocations, 0);
  assert.match(result.reason, /Deadline/);
});

await test('state contract drift and symlink substitution fail closed', async (t) => {
  const { directory } = await setup(t);
  const file = join(directory, 'state.json'),
    state = readGoalCycle(directory);
  state.plan.tasks[0].acceptanceCriteria[0].criterion = 'Weakened';
  writeFileSync(file, JSON.stringify(state));
  assert.throws(() => readGoalCycle(directory), /contract drift/);
  const linked = join(directory, 'linked.json');
  writeFileSync(linked, JSON.stringify(state));
  rmSync(file);
  symlinkSync(linked, file);
  assert.throws(() => readGoalCycle(directory), /ELOOP|symbolic/);
});

await test('execution mode and identity boundaries reject incompatible adapters', async (t) => {
  const { directory } = await setup(t);
  const { worker, reviewer } = adapters();
  reviewer.id = worker.id;
  await assert.rejects(
    runGoalCycle({ directory, worker, reviewer }),
    /Independent/,
  );
  reviewer.id = 'other';
  reviewer.kind = 'codex';
  await assert.rejects(
    runGoalCycle({ directory, worker, reviewer }),
    /mode mismatch/,
  );
  assert.throws(() => codexCycleAdapters(), /consent/);
  await assert.rejects(proposeBackwardPlan({}), /consent/);
});

await test('demo CLI executes actual files and leaves final acceptance to the owner', () => {
  const execution = spawnSync(
    process.execPath,
    ['scripts/amc-goal-cycle-cli.mjs', 'demo'],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(execution.stdout);
  try {
    assert.equal(result.phase, 'awaiting_owner_acceptance');
    assert.ok(existsSync(join(result.workspace, 'pilot/packet.md')));
  } finally {
    rmSync(join(result.directory, '..'), { recursive: true, force: true });
  }
});

await test('only explicit current owner checks can accept the whole Goal', async (t) => {
  const { directory } = await setup(t);
  const state = await runGoalCycle({ directory, ...adapters() });
  const criteria = [
    {
      criterionId: 'pilot-packet',
      passed: true,
      detail: 'Owner inspected actual local outcome against Goal criteria.',
    },
  ];
  await assert.rejects(
    acceptGoalCycle({
      directory,
      owner: 'ceo',
      expectedRevision: state.revision - 1,
      criteria,
    }),
    /Current/,
  );
  await assert.rejects(
    acceptGoalCycle({
      directory,
      owner: 'ceo',
      expectedRevision: state.revision,
      criteria: [],
    }),
    /criterion/,
  );
  const accepted = await acceptGoalCycle({
    directory,
    owner: 'ceo',
    expectedRevision: state.revision,
    criteria,
  });
  assert.equal(accepted.phase, 'accepted');
  assert.equal(accepted.goal.state, 'accepted');
});

await test('post-review edits cannot receive stale final acceptance', async (t) => {
  const { directory, repo } = await setup(t);
  const state = await runGoalCycle({ directory, ...adapters() });
  writeFileSync(join(repo, 'pilot/research.md'), 'changed after review');
  await assert.rejects(
    acceptGoalCycle({
      directory,
      owner: 'ceo',
      expectedRevision: state.revision,
      criteria: [
        { criterionId: 'pilot-packet', passed: true, detail: 'Old version' },
      ],
    }),
    /changed after/,
  );
});

await test('lock recovery validates the correct state and never clears a live owner', async (t) => {
  const { directory } = await setup(t);
  const lock = join(directory, '.supervisor-lock');
  mkdirSync(lock);
  const ownerFile = join(lock, 'owner.json');
  const owner = {
    pid: process.pid,
    hostname: hostname(),
    uid: process.getuid?.() ?? null,
    token: 'test-owner',
  };
  writeFileSync(ownerFile, JSON.stringify(owner));
  assert.throws(() => recoverGoalCycleLock(directory), /still alive/);
  assert.ok(existsSync(ownerFile));
  const child = spawnSync(
    process.execPath,
    ['-e', 'process.stdout.write(String(process.pid))'],
    { encoding: 'utf8' },
  );
  assert.equal(child.status, 0);
  writeFileSync(
    ownerFile,
    JSON.stringify({ ...owner, pid: Number(child.stdout) }),
  );
  const before = readGoalCycle(directory);
  assert.equal(recoverGoalCycleLock(directory).revision, before.revision);
  assert.equal(existsSync(lock), false);
});

await test('ordered revisions of the same file retain prior receipts and accept the latest reviewed bytes', async (t) => {
  const definition = plan();
  definition.tasks.push({
    ...structuredClone(definition.tasks[0]),
    id: 'revision',
    roleId: 'REV04',
    reviewerRoleId: 'REV09',
    dependsOn: ['research'],
  });
  definition.successCriteria[0].taskIds = ['revision'];
  const { directory, repo } = await setup(t, { definition });
  const worker = {
    id: 'ordered-writer',
    kind: 'local-demo',
    run: async ({ spec }) => {
      mkdirSync(join(repo, 'pilot'), { recursive: true });
      writeFileSync(join(repo, 'pilot/research.md'), spec.id);
      return { status: 'completed', summary: `Wrote ${spec.id}` };
    },
  };
  const reviewer = {
    id: 'ordered-reader',
    kind: 'local-demo',
    review: async ({ spec }) => {
      const passed =
        readFileSync(join(repo, 'pilot/research.md'), 'utf8') === spec.id;
      return {
        accepted: passed,
        safeForLocalRework: false,
        summary: 'Read exact task version',
        criteria: spec.acceptanceCriteria.map((item) => ({
          criterionId: item.id,
          passed,
          detail: `Observed ${spec.id} bytes`,
        })),
      };
    },
  };
  const state = await runGoalCycle({ directory, worker, reviewer });
  assert.equal(state.phase, 'awaiting_owner_acceptance');
  const accepted = await acceptGoalCycle({
    directory,
    owner: 'ceo',
    expectedRevision: state.revision,
    criteria: [
      {
        criterionId: 'pilot-packet',
        passed: true,
        detail: 'Confirmed latest reviewed revision; prior receipt retained.',
      },
    ],
  });
  assert.equal(accepted.goal.state, 'accepted');
  assert.equal(accepted.goal.tasks[0].review.accepted, true);
});
