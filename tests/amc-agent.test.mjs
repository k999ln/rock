import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installAgents, launchArgs, parseArgs } from '../scripts/amc-agent.mjs';

await test('project installation is idempotent and leaves existing user settings alone', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-agents-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, '.codex'));
  writeFileSync(
    join(dir, '.codex/config.toml'),
    'sandbox_mode = "read-only"\n',
  );
  const installed = installAgents(dir);
  assert.equal(installed.length, 3);
  assert.deepEqual(installAgents(dir), installed);
  assert.equal(
    readFileSync(join(dir, '.codex/config.toml'), 'utf8'),
    'sandbox_mode = "read-only"\n',
  );
  const reviewer = readFileSync(
    installed.find((p) => p.endsWith('amc-reviewer.toml')),
    'utf8',
  );
  assert.match(reviewer, /sandbox_mode = "read-only"/);
});
await test('a different preexisting agent prevents every install write', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-agents-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, '.codex/agents'), { recursive: true });
  writeFileSync(join(dir, '.codex/agents/amc-worker.toml'), 'user owned');
  assert.throws(() => installAgents(dir), /既存/);
  assert.equal(existsSync(join(dir, '.codex/agents/amc.toml')), false);
  assert.equal(
    readFileSync(join(dir, '.codex/agents/amc-worker.toml'), 'utf8'),
    'user owned',
  );
});
await test('installer rejects symlinked config folders', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-agents-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const outside = join(dir, 'outside');
  mkdirSync(outside);
  symlinkSync(outside, join(dir, '.codex'));
  assert.throws(() => installAgents(dir), /unsafe/);
  assert.equal(existsSync(join(outside, 'agents')), false);
});
await test('Goal is a single literal argument, model and approval are inherited', () => {
  const goal = '日本語のGoal\n$(touch /tmp/do-not-run) `false` "quoted"';
  const args = launchArgs({ goal });
  assert.ok(args.at(-1).endsWith(goal));
  assert.equal(args.filter((v) => v.includes('touch')).length, 1);
  for (const denied of [
    '--dangerously-bypass-approvals-and-sandbox',
    '--model',
    '--ask-for-approval',
    '--enable',
  ])
    assert.equal(args.includes(denied), false);
  assert.throws(() => launchArgs({ goal: '' }), /Goal/);
  assert.throws(
    () => parseArgs(['run', '--goal', 'x', '--goal', 'y']),
    /Duplicate/,
  );
  assert.throws(() => parseArgs(['run', '--model', 'other']), /Unknown/);
  assert.deepEqual(parseArgs(['run', '--goal', 'x', '--preview']), {
    command: 'run',
    goal: 'x',
    preview: true,
  });
});
