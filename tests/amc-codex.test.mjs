import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildRequestPlan } from '../scripts/amc-request-plan.mjs';
import {
  applyGoalEvent,
  compileGoal,
  summarizeGoal,
  validateGoal,
} from '../scripts/amc-goal-engine.mjs';
import { runCodexGoal, status } from '../scripts/amc-codex.mjs';

function fixture(directory) {
  const definition = buildRequestPlan({
    request: 'AMCを指示だけで部隊が動くツールにしたい',
    goal: 'AMCを迷わず使えるツールにする',
    intent: '意図しない課題を増やさず初めてでも使えるようにする',
    planId: 'codex-test',
    createdAt: '2026-09-27T00:00:00Z',
  });
  const goal = compileGoal({
    ...definition,
    instruction: definition.brief.goal,
    squadIds: definition.mission.squads.map((squad) => squad.id),
    goalId: 'codex-test',
    createdAt: '2026-09-27T00:00:00Z',
  });
  goal.requestBrief = definition.brief;
  const approved = applyGoalEvent(goal, {
    id: 'approval',
    type: 'approve_plan',
    expectedRevision: 0,
    actor: 'owner',
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement: definition.coverage,
    acceptanceCriteria: definition.acceptanceCriteria,
  });
  const path = join(directory, 'goal.json');
  writeFileSync(path, JSON.stringify(approved));
  return { approved, path };
}

await test('Codex bridge submits one ready task but never verifies or accepts it', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'amc-codex-test-'));
  try {
    const { approved, path } = fixture(directory);
    const task = approved.tasks.find((item) => item.id === 'REQ-01');
    const result = await runCodexGoal({
      goalPath: path,
      allowCodexUpload: true,
      repo: directory,
      out: join(directory, 'runs'),
      execute: async ({ runDir, prompt }) => {
        assert.match(prompt, /REQ-01/);
        assert.match(prompt, /意図しない課題/);
        for (const item of task.deliverables) {
          const file = join(directory, item.path);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, 'actual work artifact');
        }
        writeFileSync(
          join(runDir, 'codex-report.json'),
          JSON.stringify({
            status: 'completed',
            summary: '要件を整理した',
            deliverables: task.deliverables.map((item) => item.path),
            evidence: [task.deliverables[0].path],
            question: '',
          }),
        );
        return { exitCode: 0 };
      },
    });
    assert.equal(result.state, 'submitted');
    const next = JSON.parse(readFileSync(result.finalPath, 'utf8'));
    assert.equal(validateGoal(next).ok, true);
    assert.equal(
      next.tasks.find((item) => item.id === 'REQ-01').status,
      'submitted',
    );
    assert.equal(next.overallAcceptance.accepted, false);
    assert.deepEqual(summarizeGoal(next).readyTaskIds, []);
    assert.equal(status(path).readyTaskIds[0], 'REQ-01');
    assert.equal(approved.revision, 1);
    await assert.rejects(
      runCodexGoal({
        goalPath: path,
        repo: directory,
        out: join(directory, 'runs'),
        allowCodexUpload: true,
        execute: async () => {
          throw new Error('must not rerun');
        },
      }),
      /元JSONをそのまま再実行しない/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('Codex bridge pauses on missing deliverable or uncertain execution', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'amc-codex-test-'));
  try {
    const { path } = fixture(directory);
    const missing = await runCodexGoal({
      goalPath: path,
      repo: directory,
      out: join(directory, 'runs'),
      allowCodexUpload: true,
      execute: async ({ runDir }) => {
        writeFileSync(
          join(runDir, 'codex-report.json'),
          JSON.stringify({
            status: 'completed',
            summary: 'claimed complete',
            deliverables: [],
            evidence: [],
            question: '',
          }),
        );
        return { exitCode: 0 };
      },
    });
    assert.equal(missing.state, 'paused');
    assert.match(missing.reason, /予定成果物/);
    const paused = JSON.parse(readFileSync(missing.finalPath, 'utf8'));
    assert.equal(paused.state, 'paused');
    assert.equal(paused.tasks[0].status, 'running');
    assert.equal(paused.overallAcceptance.accepted, false);
    const failed = await runCodexGoal({
      goalPath: path,
      repo: directory,
      out: join(directory, 'other-runs'),
      allowCodexUpload: true,
      execute: async () => ({ exitCode: 1 }),
    });
    assert.equal(failed.state, 'paused');
    assert.match(failed.reason, /Codex exited/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('Codex bridge refuses drafts and tasks blocked by prerequisites', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'amc-codex-test-'));
  try {
    const { path } = fixture(directory);
    await assert.rejects(
      runCodexGoal({
        goalPath: path,
        repo: directory,
        taskId: 'REQ-02',
        out: join(directory, 'runs'),
        allowCodexUpload: true,
      }),
      /着手できません/,
    );
    await assert.rejects(
      runCodexGoal({
        goalPath: path,
        repo: directory,
        out: join(directory, 'runs'),
      }),
      /明示承認/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('descriptive evidence paths are rejected without rewriting the original report', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'amc-codex-report-path-'));
  try {
    const { approved, path } = fixture(directory);
    const task = approved.tasks.find((item) => item.id === 'REQ-01');
    let original;
    let reportPath;
    const result = await runCodexGoal({
      goalPath: path, repo: directory, out: join(directory, 'runs'), allowCodexUpload: true,
      execute: async ({ runDir, prompt }) => {
        assert.match(prompt, /説明はsummary/);
        for (const item of task.deliverables) {
          const file = join(directory, item.path);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, 'actual artifact');
        }
        original = JSON.stringify({ status: 'completed', summary: 'work done',
          deliverables: task.deliverables.map((item) => item.path),
          evidence: [task.deliverables[0].path + ': observed result'], question: '' });
        reportPath = join(runDir, 'codex-report.json');
        writeFileSync(reportPath, original);
        return { exitCode: 0 };
      },
    });
    assert.equal(result.state, 'paused');
    assert.match(result.reason, /Unsafe path/);
    assert.equal(readFileSync(reportPath, 'utf8'), original);
    const goal = JSON.parse(readFileSync(result.finalPath, 'utf8'));
    assert.equal(goal.tasks[0].status, 'running');
    assert.equal(goal.overallAcceptance.accepted, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
