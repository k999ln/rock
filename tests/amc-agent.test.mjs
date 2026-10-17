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
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { installAgents, launchArgs, parseArgs, diagnose, friendlyError, atomicCreate } from '../scripts/amc-agent.mjs';

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
  assert.match(readFileSync(join(dir, '.agents/skills/amc/SKILL.md'), 'utf8'), /name: amc/);
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

await test('skill conflict and dangling links prevent partial registration', (t) => {
  for (const kind of ['different', 'dangling']) {
    const dir = mkdtempSync(join(tmpdir(), 'amc-skill-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(join(dir, '.agents/skills/amc'), { recursive: true });
    const file = join(dir, '.agents/skills/amc/SKILL.md');
    if (kind === 'different') writeFileSync(file, 'personal skill');
    else symlinkSync(join(dir, 'missing'), file);
    assert.throws(() => installAgents(dir), /既存/);
    assert.equal(existsSync(join(dir, '.codex/agents/amc.toml')), false);
  }
});

await test('partial disk-full writes are not published and can be retried', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-atomic-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const target = join(dir, 'amc.toml');
  assert.throws(() => atomicCreate(target, 'complete configuration', (fd) => {
    writeFileSync(fd, 'partial');
    throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
  }), { code: 'ENOSPC' });
  assert.deepEqual(readdirSync(dir), []);
  atomicCreate(target, 'complete configuration');
  assert.equal(readFileSync(target, 'utf8'), 'complete configuration');
});

await test('a concurrent destination is retained instead of overwritten', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-atomic-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const target = join(dir, 'amc.toml');
  assert.throws(() => atomicCreate(target, 'generated', (fd, text) => {
    writeFileSync(fd, text);
    writeFileSync(target, 'concurrent owner');
  }), { code: 'EEXIST' });
  assert.deepEqual(readdirSync(dir), ['amc.toml']);
  assert.equal(readFileSync(target, 'utf8'), 'concurrent owner');
});

await test('doctor rejects symlinked parents even with identical definitions', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-doctor-link-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const owner = join(dir, 'owner'), linked = join(dir, 'linked');
  mkdirSync(owner); mkdirSync(linked);
  installAgents(owner);
  symlinkSync(join(owner, '.codex'), join(linked, '.codex'));
  symlinkSync(join(owner, '.agents'), join(linked, '.agents'));
  const report = diagnose(linked, { probeCli: () => ({ status: 0 }), freeBytes: () => 1024 ** 3 });
  assert.equal(report.ready, false);
  assert.ok(report.checks.some(c => c.code === 'unsafe_directory' && c.status === 'error'));
  assert.throws(() => installAgents(linked), /unsafe/);
});

await test('doctor reports CLI unavailable and disk pressure without writing or blocking native chat roles', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-doctor-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const probes = { probeCli: () => ({ status: null, error: { code: 'ENOENT' } }), freeBytes: () => 32 * 1048576 };
  assert.equal(diagnose(dir, probes).ready, false);
  assert.equal(existsSync(join(dir, '.codex')), false);
  installAgents(dir);
  const report = diagnose(dir, probes);
  assert.equal(report.ready, true);
  assert.equal(report.checks.find(c => c.code === 'cli').status, 'warning');
  assert.equal(report.checks.filter(c => c.availableMiB === 32).length, 2);
  assert.equal(report.webSync, false);
  writeFileSync(join(dir, '.codex/agents/amc.toml'), 'local changes');
  assert.equal(diagnose(dir, probes).ready, false);
  assert.equal(readFileSync(join(dir, '.codex/agents/amc.toml'), 'utf8'), 'local changes');
});

await test('friendly CLI supports one sentence, help, and no-TTY recovery without starting Codex', () => {
  assert.deepEqual(parseArgs([]), { command: 'help' });
  assert.deepEqual(parseArgs(['日本語の仕事を進める']), { command: 'run', goal: '日本語の仕事を進める' });
  assert.deepEqual(parseArgs(['doctor', '--project', '/tmp']), { command: 'doctor', project: '/tmp' });
  const launched = spawnSync(process.execPath, ['scripts/amc-agent.mjs', 'run', '--goal', '試験'], { encoding: 'utf8' });
  assert.equal(launched.status, 1);
  assert.match(launched.stderr, /対話端末/);
  const preview = spawnSync(process.execPath, ['scripts/amc-agent.mjs', 'run', '--goal', '日本語 $(false)', '--preview'], { encoding: 'utf8' });
  assert.equal(preview.status, 0);
  const result = JSON.parse(preview.stdout);
  assert.equal(result.started, false);
  assert.ok(result.args.at(-1).endsWith('日本語 $(false)'));
  assert.match(friendlyError({ code: 'ENOSPC', message: 'internal' }), /空き容量/);
  assert.match(friendlyError({ code: 'ENOENT', message: 'secret path' }), /doctor/);
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
