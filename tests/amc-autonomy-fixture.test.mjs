import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFixtureGoal,
  fixtureAdapters,
} from '../scripts/amc-autonomy-fixture.mjs';

const cli = new URL('../scripts/amc-autonomy-fixture.mjs', import.meta.url);
function invoke(command, directory, extra = []) {
  return spawnSync(
    process.execPath,
    [cli.pathname, command, '--state', directory, ...extra],
    {
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
}

await test('bundled CLI persists verified child/parent loop and never auto-accepts the Goal', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'amc-fixture-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.equal(invoke('init', directory).status, 0);
  const initial = readFileSync(join(directory, 'state.json'), 'utf8');
  assert.notEqual(invoke('init', directory).status, 0);
  assert.equal(readFileSync(join(directory, 'state.json'), 'utf8'), initial);
  const result = invoke('run', directory);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.phase, 'awaiting_owner_acceptance');
  assert.equal(report.overallAccepted, false);
  assert.equal(report.totalAttempts, 3);
  assert.equal(report.productionExecution, 'unsupported');
  for (const [id, expected] of [
    ['ADD', 4],
    ['MULTIPLY', 12],
    ['REPORT', 12],
  ])
    assert.deepEqual(
      JSON.parse(readFileSync(join(directory, 'artifacts', `${id}.json`))),
      { task: id, result: expected },
    );
  const final = readFileSync(join(directory, 'state.json'), 'utf8');
  assert.equal(invoke('run', directory).status, 0);
  assert.equal(readFileSync(join(directory, 'state.json'), 'utf8'), final);
  assert.notEqual(invoke('run', directory, ['--allow-codex-upload']).status, 0);
});

await test('CLI stop resumes only before execution and cancellation cannot be resumed', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'amc-fixture-stop-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.equal(invoke('init', directory).status, 0);
  assert.equal(invoke('stop', directory).status, 0);
  const paused = JSON.parse(invoke('run', directory).stdout);
  assert.equal(paused.phase, 'paused');
  assert.equal(paused.totalAttempts, 0);
  assert.equal(
    JSON.parse(invoke('resume', directory).stdout).phase,
    'awaiting_owner_acceptance',
  );
  const cancelled = join(directory, 'cancelled');
  assert.equal(invoke('init', cancelled).status, 0);
  assert.equal(invoke('cancel', cancelled).status, 0);
  assert.equal(JSON.parse(invoke('run', cancelled).stdout).phase, 'cancelled');
  assert.notEqual(invoke('resume', cancelled).status, 0);
});

await test('bundled verifier rejects artifact corruption without trusting worker success', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'amc-fixture-review-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const goal = createFixtureGoal();
  const task = goal.tasks.find((task) => task.id === 'ADD');
  const adapters = fixtureAdapters(directory);
  const input = {
    goal,
    task,
    operationKey: 'test',
    signal: new AbortController().signal,
  };
  await adapters.worker.run(input);
  writeFileSync(
    join(directory, 'artifacts', 'ADD.json'),
    JSON.stringify({ task: 'ADD', result: 999 }),
  );
  const review = await adapters.reviewer.review(input);
  assert.equal(review.accepted, false);
  assert.equal(review.criterionResults[0].passed, false);
});
