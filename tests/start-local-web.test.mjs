import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localStartFixture } from './local-start-fixture.mjs';

void test('operator-dock dev uses the same builder runtime without adding migrations', (t) => {
  const f = localStartFixture(t);
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.scripts['operator-dock:dev'], 'node scripts/local-wrangler.mjs --config services/operator-dock/wrangler.jsonc');
  const result = spawnSync(process.execPath, [join(f.root, 'scripts/local-wrangler.mjs'), '--config', 'services/operator-dock/wrangler.jsonc', '--port', '8788'], {
    cwd: f.root, env: f.env, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.calls(), [
    { stage: 'dev', args: ['dev', '--config', 'services/operator-dock/wrangler.jsonc', '--port', '8788'], ci: 'fixture-dev-env' },
  ]);
});

for (const [stage, variable] of [['d1', 'MIGRATION_EXIT'], ['dev', 'DEV_EXIT']]) {
  void test(`${stage} failure preserves exit code and does not proceed`, (t) => {
    const f = localStartFixture(t);
    const result = spawnSync(process.execPath, f.command, {
      cwd: f.root, env: { ...f.env, [variable]: '23' }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 23, result.stderr);
    assert.deepEqual(f.calls().map((call) => call.stage), stage === 'd1' ? ['d1'] : ['d1', 'dev']);
  });
}

void test('migration terminated by a signal cannot start the server', (t) => {
  const f = localStartFixture(t);
  const result = spawnSync(process.execPath, f.command, {
    cwd: f.root, env: { ...f.env, SELF_SIGNAL_STAGE: 'd1' }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.signal, 'SIGTERM');
  assert.deepEqual(f.calls().map((call) => call.stage), ['d1']);
});

for (const stage of ['d1', 'dev']) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    void test(`${signal} during ${stage} reaches child and stops even when its handler exits zero`, { timeout: 5000 }, async (t) => {
      const f = localStartFixture(t);
      const child = spawn(process.execPath, f.command, {
        cwd: f.root, env: { ...f.env, WAIT_STAGE: stage }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
      const exited = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, actualSignal) => resolve({ code, signal: actualSignal }));
      });
      await new Promise((resolve, reject) => {
        let output = '';
        child.stdout.on('data', (data) => {
          output += data;
          if (output.includes(`READY:${stage}`)) resolve();
        });
        child.once('error', reject);
        child.once('exit', () => reject(new Error('Preview exited before fixture was ready')));
      });
      child.kill(signal);
      assert.deepEqual(await exited, { code: null, signal });
      assert.deepEqual(f.calls().filter((call) => call.stage === 'dev').length, stage === 'dev' ? 2 : 0);
      assert.deepEqual(f.calls().at(-1), { received: signal, stage });
    });
  }
}

function start(f, args = []) {
  return spawnSync(process.execPath, [...f.command, ...args], {
    cwd: f.root, env: f.env, encoding: 'utf8', timeout: 5000,
  });
}

for (const { name, args, directory } of [
  { name: 'default', args: ['--port', '8788', '--ip', '127.0.0.1'], directory: '.wrangler/state' },
  { name: 'separated custom', args: ['--port', '8788', '--persist-to', 'saved preview', '--ip', '127.0.0.1'], directory: 'saved preview' },
  { name: 'equals custom', args: ['--persist-to=saved-preview', '--port', '8788', '--ip', '127.0.0.1'], directory: 'saved-preview' },
]) {
  void test(`${name} persistence is identical for migrations and serving`, (t) => {
    const f = localStartFixture(t);
    const result = start(f, args);
    assert.equal(result.status, 0, result.stderr);
    const [migration, dev] = f.calls();
    const persistTo = join(f.root, directory);
    assert.deepEqual(migration.args, ['d1', 'migrations', 'apply', 'site-creator-d1', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', persistTo]);
    assert.deepEqual(dev.args, ['dev', '--config', 'dist/server/wrangler.json', '--port', '8788', '--ip', '127.0.0.1', '--persist-to', persistTo]);
  });
}

for (const args of [
  ['--persist-to'], ['--persist-to='], ['--persist-to', '--port', '8788'],
  ['--persist-to=one', '--persist-to=two'], ['--persist-to=dist/state'],
]) {
  void test(`invalid persistence stops before migration: ${args.join(' ')}`, (t) => {
    const f = localStartFixture(t);
    const result = start(f, args);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(existsSync(join(f.root, 'calls.jsonl')), false);
    assert.match(result.stderr, /persist|build output/);
  });
}

for (const target of ['dist', 'dist/future-parent']) {
  void test(`symlink into ${target} cannot hide a future persistence directory`, (t) => {
    const f = localStartFixture(t);
    mkdirSync(join(f.root, 'dist'));
    symlinkSync(join(f.root, target), join(f.root, 'alias'));
    const result = start(f, ['--persist-to=alias/not-created/state']);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /outside build output/);
    assert.equal(existsSync(join(f.root, 'calls.jsonl')), false);
  });
}

for (const coexisting of [false, true]) {
  void test(`legacy state blocks start and prebuild without changing either store (coexisting=${coexisting})`, (t) => {
    const f = localStartFixture(t);
    const legacy = join(f.root, 'dist/server/.wrangler/state');
    const stable = join(f.root, '.wrangler/state');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'saved.sqlite'), 'old database and R2 marker');
    if (coexisting) {
      mkdirSync(stable, { recursive: true });
      writeFileSync(join(stable, 'saved.sqlite'), 'different newer database');
    }
    for (const command of [f.command, [join(f.root, 'scripts/local-web-state.mjs')]]) {
      const result = spawnSync(process.execPath, command, { cwd: f.root, env: f.env, encoding: 'utf8', timeout: 5000 });
      assert.equal(result.status, 1, result.stderr);
      assert.ok(result.stderr.includes(legacy));
      assert.ok(result.stderr.includes(stable));
      assert.match(result.stderr, /Back up the complete/);
      assert.match(result.stderr, coexisting ? /Never merge or overwrite/ : /destination is absent/);
      assert.equal(readFileSync(join(legacy, 'saved.sqlite'), 'utf8'), 'old database and R2 marker');
      assert.equal(existsSync(join(f.root, 'calls.jsonl')), false);
      if (coexisting) assert.equal(readFileSync(join(stable, 'saved.sqlite'), 'utf8'), 'different newer database');
      else assert.equal(existsSync(stable), false);
    }
  });
}

void test('prebuild checks legacy data before any build preparation or output cleanup', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.scripts.prebuild, 'node scripts/local-web-state.mjs && node scripts/generate-private-modules.mjs');
});

for (const { name, args, config, environment } of [
  { name: 'long environment', args: ['--env', 'review'], environment: 'review' },
  { name: 'short environment', args: ['-e', 'review'], environment: 'review' },
  { name: 'equals environment', args: ['--env=review'], environment: 'review' },
  { name: 'attached short environment', args: ['-ereview'], environment: 'review' },
  { name: 'attached short config', args: ['-ccustom/wrangler.json'], config: 'custom/wrangler.json' },
  { name: 'long config', args: ['--config', 'custom/wrangler.json'], config: 'custom/wrangler.json' },
  { name: 'short config', args: ['-c', 'custom/wrangler.json'], config: 'custom/wrangler.json' },
  { name: 'equals config and environment', args: ['--config=custom/wrangler.json', '-e=review'], config: 'custom/wrangler.json', environment: 'review' },
]) {
  void test(`migration and dev share normalized ${name}`, (t) => {
    const f = localStartFixture(t), result = start(f, args);
    assert.equal(result.status, 0, result.stderr);
    const [migration, dev] = f.calls();
    const expectedConfig = config ? join(f.root, config) : 'dist/server/wrangler.json';
    for (const call of [migration, dev]) {
      assert.equal(call.args[call.args.indexOf('--config') + 1], expectedConfig);
      assert.equal(call.args.filter(value => value === '--config').length, 1);
      if (environment) assert.equal(call.args[call.args.indexOf('--env') + 1], environment);
    }
    assert.ok(!dev.args.includes('-e') && !dev.args.includes('-c'));
  });
}
for (const args of [
  ['--env'], ['-c'], ['--env='], ['--config='], ['-e', '--port', '8788'],
  ['--config=one.json', '-c', 'two.json'], ['--env=one', '-e=two'],
  ['--remote'], ['-r'], ['--remote=true'], ['-r=true'],
]) {
  void test(`unsafe or ambiguous preview selection stops before migration: ${args.join(' ')}`, (t) => {
    const f = localStartFixture(t), result = start(f, args);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(existsSync(join(f.root, 'calls.jsonl')), false);
    assert.match(result.stderr, /requires|Conflicting|remote/);
  });
}
void test('custom configuration legacy state must be selected explicitly before migration', (t) => {
  const f = localStartFixture(t), legacy = join(f.root, 'custom/.wrangler/state');
  mkdirSync(legacy, { recursive: true }); writeFileSync(join(legacy, 'saved.sqlite'), 'custom original data');
  const blocked = start(f, ['--config=custom/wrangler.json']);
  assert.equal(blocked.status, 1); assert.match(blocked.stderr, /custom/);
  assert.equal(existsSync(join(f.root, 'calls.jsonl')), false);
  assert.equal(readFileSync(join(legacy, 'saved.sqlite'), 'utf8'), 'custom original data');
  const selected = start(f, ['--config=custom/wrangler.json', '--persist-to=custom/.wrangler/state']);
  assert.equal(selected.status, 0, selected.stderr);
  assert.ok(f.calls().every(call => call.args.at(-1) === legacy));
});

for (const args of [['--remote=false'], ['--remote', 'false'], ['-r=false'], ['--no-remote']]) {
  void test(`explicit local remote=false remains supported: ${args.join(' ')}`, (t) => {
    const f = localStartFixture(t), result = start(f, args);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(f.calls().every(call => !call.args.some(arg => arg.includes('remote'))));
  });
}

for (const args of [['--cwd', 'other-project'], ['--cwd=other-project']]) {
  void test(`working-directory overrides stop before migration: ${args.join(' ')}`, (t) => {
    const f = localStartFixture(t), result = start(f, args);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(existsSync(join(f.root, 'calls.jsonl')), false);
    assert.match(result.stderr, /cd \/path\/to\/project && npm start/);
  });
}
