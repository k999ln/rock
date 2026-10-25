import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, realpathSync, readFileSync, writeFileSync, readdirSync, rmSync,
  chmodSync, symlinkSync, linkSync, mkdirSync, statSync, existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runCreatorFixture, diagnoseCreatorFixture } from '../scripts/game-creator-fixture.mjs';
import { createSandbox, applySandboxCommand, sandboxDigest, loadSandbox, saveSandbox } from '../lib/game-sandbox.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = join(root, 'scripts/game-creator-fixture.mjs');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/game-sandbox-session.json', import.meta.url), 'utf8'));
function directory(t) {
  const path = mkdtempSync(join(realpathSync(tmpdir()), 'rock-game-fixture-'));
  t.after(() => rmSync(path, { recursive: true, force: true })); return path;
}
const options = (directory, more = {}) => ({ operation: 'start', directory, ...more });
function cli(args, expected = 0) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', script, ...args], { cwd: root, encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.error, undefined); assert.equal(result.status, expected, result.stderr);
  return JSON.parse(expected === 1 ? result.stderr.trim() : result.stdout.trim());
}
const file = (dir, rev) => join(dir, `save-${rev}.json`);
function runThrough(count) {
  let state = createSandbox(fixture.create);
  for (const command of fixture.commands.slice(0, count)) state = applySandboxCommand(state, command, state.revision);
  return state;
}
function proof(value) {
  assert.equal(value.outcome, 'host_fixture_saved');
  assert.equal(value.hostProof.exactReadback, true);
  assert.match(value.hostProof.stateDigest, /^[a-f0-9]{64}$/);
  assert.equal(value.productionExchangeEnabled, false);
}

void test('actual child creator start/save/readback and distinct-process resume equal uninterrupted existing runtime', async t => {
  const dir = directory(t), first = cli(['start', '--directory', dir, '--through', String(fixture.restartAfter)]);
  proof(first); const before = readFileSync(file(dir, fixture.restartAfter));
  assert.equal(statSync(file(dir, fixture.restartAfter)).mode & 0o777, 0o600);
  assert.equal(await sandboxDigest(await loadSandbox(before.toString('utf8'))), first.hostProof.stateDigest);
  const resumed = cli(['resume', '--directory', dir, '--revision', String(fixture.restartAfter)]); proof(resumed);
  assert.notEqual(first.hostProof.pid, resumed.hostProof.pid);
  assert.equal(resumed.hostProof.stateDigest, await sandboxDigest(runThrough(fixture.commands.length)));
  assert.deepEqual(readFileSync(file(dir, fixture.restartAfter)), before);
  assert.equal(first.diagnostic.status, 'launch_candidate');
  assert.deepEqual(Object.values(first.diagnostic.checks), Array(4).fill('unverified'));
  assert.deepEqual(Object.values(first.diagnostic.measurements), Array(4).fill(null));
  assert.equal(resumed.authenticatedOwnerStorageAccepted, false);
  assert.equal(existsSync(join(dir, '.creator-fixture.lock')), false);
});
void test('one local creator command, same retry and lost-ack reexecution never duplicate effects', async t => {
  const dir = directory(t), first = await runCreatorFixture(options(dir)); proof(first);
  const bytes = readFileSync(file(dir, 1));
  const retry = await runCreatorFixture(options(dir, { operation: 'command', revision: 1, command: fixture.commands[0] }));
  proof(retry); assert.equal(retry.hostProof.identicalCommandReplay, true); assert.deepEqual(readFileSync(file(dir, 1)), bytes);
  const second = await runCreatorFixture(options(dir, { operation: 'command', revision: 1, command: fixture.commands[1] })); proof(second);
  const saved = readFileSync(file(dir, 2));
  // Recreate the original pre-send request after a hypothetical lost result.
  const recovered = await runCreatorFixture(options(dir, { operation: 'command', revision: 1, command: fixture.commands[1] }));
  assert.equal(recovered.hostProof.recoveredExistingSlot, true); assert.equal(recovered.hostProof.stateDigest, second.hostProof.stateDigest);
  assert.deepEqual(readFileSync(file(dir, 2)), saved); assert.deepEqual(readFileSync(file(dir, 1)), bytes);
});
void test('changed payload same ID, stale revision, unknown ID and out-of-order command reject without save overwrite', async t => {
  const dir = directory(t); await runCreatorFixture(options(dir)); const before = readFileSync(file(dir, 1));
  for (const [command, expectedRevision] of [[{ ...fixture.commands[0], ticks: 41 }, 1], [fixture.commands[1], 0],
    [{ id: randomUUID(), action: 'pause' }, 1], [fixture.commands[3], 1]]) {
    await assert.rejects(runCreatorFixture(options(dir, { operation: 'command', revision: 1, command, expectedRevision })),
      e => e.status === 409 || e.code === 'NOT_FIXED_SESSION_COMMAND');
    assert.deepEqual(readFileSync(file(dir, 1)), before); assert.equal(existsSync(file(dir, 2)), false);
    assert.equal(existsSync(join(dir, '.creator-fixture.lock')), false);
  }
});
void test('rights revoked/expired/foreign owner and package mismatch deny before runtime, lock or saves', async t => {
  for (const scenario of ['revoked', 'expired', 'foreign-owner', 'bad-package']) {
    const dir = directory(t), result = await runCreatorFixture(options(dir, { scenario }));
    assert.equal(result.outcome, 'intake_denied'); assert.equal(result.hostProof, null);
    assert.notEqual(result.diagnostic.status, 'launch_candidate'); assert.deepEqual(readdirSync(dir), []);
  }
});
void test('actual old static-only candidate cannot satisfy saved runtime acceptance (negative control)', async () => {
  const old = await diagnoseCreatorFixture(); assert.equal(old.diagnostic.status, 'launch_candidate');
  assert.equal(old.hostProof, undefined);
  assert.throws(() => proof({ diagnostic: old.diagnostic }), /AssertionError/);
  // Same known conflicting command can be byte-valid intake yet fail at runtime.
  const state = runThrough(1);
  assert.throws(() => applySandboxCommand(state, { ...fixture.commands[0], ticks: 41 }, 1), e => e.status === 409);
  assert.equal(state.revision, 1); assert.deepEqual(Object.values(old.diagnostic.checks), Array(4).fill('unverified'));
});
void test('corrupt, format-version and rule-version saves refuse with no auto-reset or overwrite', async t => {
  for (const variant of ['corrupt', 'format', 'rules', 'digest', 'other-valid-state']) {
    const dir = directory(t); await runCreatorFixture(options(dir));
    const raw = readFileSync(file(dir, 1), 'utf8'), envelope = JSON.parse(raw);
    let bad;
    if (variant === 'corrupt') bad = '{';
    else if (variant === 'other-valid-state') bad = await saveSandbox(createSandbox({ ...fixture.create, seed: 1 }));
    else { if (variant === 'format') envelope.version++; if (variant === 'rules') envelope.rules += '-wrong';
      if (variant === 'digest') envelope.digest = '0'.repeat(64); bad = JSON.stringify(envelope); }
    writeFileSync(file(dir, 1), bad, { mode: 0o600 });
    await assert.rejects(runCreatorFixture(options(dir, { operation: 'resume', revision: 1 })));
    assert.equal(readFileSync(file(dir, 1), 'utf8'), bad); assert.equal(readdirSync(dir).filter(n => n.startsWith('save-')).length, 1);
  }
});
void test('unknown partial next slot preserves original save and refuses replacement; explicit old read still works', async t => {
  const dir = directory(t); await runCreatorFixture(options(dir)); const original = readFileSync(file(dir, 1));
  writeFileSync(file(dir, 2), '{partial', { mode: 0o600 });
  await assert.rejects(runCreatorFixture(options(dir, { operation: 'command', revision: 1, command: fixture.commands[1] })));
  assert.deepEqual(readFileSync(file(dir, 1)), original); assert.equal(readFileSync(file(dir, 2), 'utf8'), '{partial');
  proof(await runCreatorFixture(options(dir, { operation: 'read', revision: 1 })));
  await assert.rejects(runCreatorFixture(options(dir, { operation: 'resume', revision: 2 })));
});
void test('existing save slot symlink/FIFO/directory/hardlink/oversize are bounded refusals in actual CLI', async t => {
  for (const kind of ['symlink', 'fifo', 'directory', 'hardlink', 'oversize', 'public-mode']) {
    const dir = directory(t), target = directory(t), victim = join(target, 'unchanged'); writeFileSync(victim, 'preserve', { mode: 0o600 });
    const path = file(dir, 1);
    if (kind === 'symlink') symlinkSync(victim, path);
    if (kind === 'fifo') execFileSync('python3', ['-B', '-c', 'import os,sys;os.mkfifo(sys.argv[1],0o600)', path]);
    if (kind === 'directory') mkdirSync(path, { mode: 0o700 });
    if (kind === 'hardlink') linkSync(victim, path);
    if (kind === 'oversize') writeFileSync(path, Buffer.alloc(4_000_001), { mode: 0o600 });
    if (kind === 'public-mode') writeFileSync(path, '{}', { mode: 0o644 });
    const result = cli(['read', '--directory', dir, '--revision', '1'], 1);
    assert.equal(result.outcome, 'refused'); assert.equal(readFileSync(victim, 'utf8'), 'preserve');
    assert.equal(existsSync(join(dir, '.creator-fixture.lock')), false);
  }
});
void test('target-slot symlink cannot overwrite victim or prior save during a new command', async t => {
  const dir = directory(t); await runCreatorFixture(options(dir)); const bytes = readFileSync(file(dir, 1));
  const target = directory(t), victim = join(target, 'victim'); writeFileSync(victim, 'preserve', { mode: 0o600 }); symlinkSync(victim, file(dir, 2));
  await assert.rejects(runCreatorFixture(options(dir, { operation: 'command', revision: 1, command: fixture.commands[1] })));
  assert.equal(readFileSync(victim, 'utf8'), 'preserve'); assert.deepEqual(readFileSync(file(dir, 1)), bytes);
});
void test('private owned canonical temporary directory required; symlink and public-mode directory refuse', async t => {
  const dir = directory(t), holder = directory(t), alias = join(holder, 'alias'); symlinkSync(dir, alias);
  await assert.rejects(runCreatorFixture(options(alias)));
  chmodSync(dir, 0o755); await assert.rejects(runCreatorFixture(options(dir))); chmodSync(dir, 0o700);
  assert.deepEqual(readdirSync(dir), []);
});
void test('live lock never removed, unknown lock preserved and dead owned lock needs explicit recovery', async t => {
  const dir = directory(t), path = join(dir, '.creator-fixture.lock');
  writeFileSync(path, JSON.stringify({ pid: process.pid, token: randomUUID() }), { mode: 0o600 }); const live = readFileSync(path);
  await assert.rejects(runCreatorFixture(options(dir)), e => e.code === 'FIXTURE_LOCKED');
  await assert.rejects(runCreatorFixture(options(dir, { recoverLock: true })), e => e.code === 'LOCK_OWNER_LIVE'); assert.deepEqual(readFileSync(path), live);
  writeFileSync(path, '{}'); await assert.rejects(runCreatorFixture(options(dir, { recoverLock: true }))); assert.equal(readFileSync(path, 'utf8'), '{}');
});
void test('real child-process death leaves owned lock; explicit recovery preserves original saved bytes', async t => {
  const dir = directory(t); await runCreatorFixture(options(dir)); const before = readFileSync(file(dir, 1));
  const lock = join(dir, '.creator-fixture.lock');
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    'import{writeFileSync}from"node:fs";import{randomUUID}from"node:crypto";writeFileSync(process.argv[1],JSON.stringify({pid:process.pid,token:randomUUID()}),{flag:"wx",mode:0o600});process.stdout.write("owned-lock-ready\\n");setInterval(()=>{},1000);', lock], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exited; });
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', () => reject(Error('lock helper exited early'))); });
  child.kill('SIGKILL'); await exited;
  await assert.rejects(runCreatorFixture(options(dir, { operation: 'read', revision: 1 })), e => e.code === 'FIXTURE_LOCKED');
  proof(await runCreatorFixture(options(dir, { operation: 'resume', revision: 1, through: 2, recoverLock: true })));
  assert.deepEqual(readFileSync(file(dir, 1)), before); assert.equal(existsSync(lock), false);
});
void test('CLI finite argument parsing and no outside state creation', t => {
  const dir = directory(t);
  assert.equal(cli(['start', '--directory', dir, '--revision', '-1'], 1).code, 'INVALID_REVISION');
  assert.equal(cli(['start', '--directory', dir, '--unknown', 'x'], 1).code, 'INVALID_OPTIONS');
  assert.equal(cli(['start', '--directory', dir, '--scenario', 'revoked'], 2).outcome, 'intake_denied');
  assert.deepEqual(readdirSync(dir), []);
});
void test('product fixture source has no external transport, finance invocation, process executor or arbitrary code loader', () => {
  const source = readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|\beval\s*\(|new Function|child_process|wallet[-_/]|game_exchange|\bexec\s*\(|\bspawn\s*\(/);
  assert.match(source, /O_NOFOLLOW/); assert.match(source, /O_NONBLOCK/);
});
void test('actual killed writer leaves partial next save unknown and preserves original through explicit recovery', async t => {
  const dir = directory(t); await runCreatorFixture(options(dir)); const previous = readFileSync(file(dir, 1));
  const program = `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';
    const write=fs.writeFileSync;fs.writeFileSync=function(fd,data,...rest){
      if(typeof fd==='number'&&String(data).startsWith('{"format":"rock-particle-sandbox-save"')){
        fs.writeSync(fd,Buffer.from(data).subarray(0,25));fs.fsyncSync(fd);process.kill(process.pid,'SIGKILL');
      }return write(fd,data,...rest);
    };syncBuiltinESMExports();
    const {runCreatorFixture}=await import(process.argv[1]);
    await runCreatorFixture({operation:'command',directory:process.argv[2],revision:1,command:JSON.parse(process.argv[3])});`;
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', program,
    new URL('../scripts/game-creator-fixture.mjs', import.meta.url).href, dir, JSON.stringify(fixture.commands[1])],
  { encoding: 'utf8', timeout: 15_000 });
  assert.equal(child.error, undefined); assert.equal(child.signal, 'SIGKILL', child.stderr);
  assert.deepEqual(readFileSync(file(dir, 1)), previous); const partial = readFileSync(file(dir, 2)); assert.equal(partial.length, 25);
  proof(await runCreatorFixture(options(dir, { operation: 'read', revision: 1, recoverLock: true })));
  await assert.rejects(runCreatorFixture(options(dir, { operation: 'command', revision: 1, command: fixture.commands[1] })));
  assert.deepEqual(readFileSync(file(dir, 1)), previous); assert.deepEqual(readFileSync(file(dir, 2)), partial);
  assert.equal(existsSync(join(dir, '.creator-fixture.lock')), false);
});
void test('lock recovery rejects symlink/FIFO/oversize/nonprivate lock without touching target', t => {
  for (const kind of ['symlink', 'fifo', 'oversize', 'public-mode']) {
    const dir = directory(t), holder = directory(t), victim = join(holder, 'preserve'), lock = join(dir, '.creator-fixture.lock');
    writeFileSync(victim, 'preserve', { mode: 0o600 });
    if (kind === 'symlink') symlinkSync(victim, lock);
    if (kind === 'fifo') execFileSync('python3', ['-B', '-c', 'import os,sys;os.mkfifo(sys.argv[1],0o600)', lock]);
    if (kind === 'oversize') writeFileSync(lock, 'x'.repeat(257), { mode: 0o600 });
    if (kind === 'public-mode') writeFileSync(lock, '{}', { mode: 0o644 });
    assert.equal(cli(['start', '--directory', dir, '--recover-lock'], 1).outcome, 'refused');
    assert.equal(readFileSync(victim, 'utf8'), 'preserve'); assert.equal(existsSync(file(dir, 1)), false);
  }
});
void test('two actual creator processes preserve a single exact save with explicit contention or idempotent recovery', async t => {
  const dir = directory(t);
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', script, 'start', '--directory', dir, '--through', String(fixture.restartAfter)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout, stderr }));
  });
  const outcomes = await Promise.all([run(), run()]);
  assert.ok(outcomes.some(x => x.code === 0));
  for (const item of outcomes) {
    if (item.code === 0) proof(JSON.parse(item.stdout));
    else { assert.equal(item.code, 1); assert.equal(JSON.parse(item.stderr).code, 'FIXTURE_LOCKED'); }
  }
  assert.equal(readdirSync(dir).filter(n => n.startsWith('save-')).length, 1);
  assert.equal(await sandboxDigest(await loadSandbox(readFileSync(file(dir, fixture.restartAfter), 'utf8'))), await sandboxDigest(runThrough(fixture.restartAfter)));
  assert.equal(existsSync(join(dir, '.creator-fixture.lock')), false);
});
