import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rock-local-start-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  for (const name of ['start-local-web.mjs', 'local-wrangler.mjs', 'spider-web-runtime.mjs']) {
    copyFileSync(new URL(`../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
  }
  const packageAt = (path, manifest, source) => {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'package.json'), JSON.stringify(manifest));
    writeFileSync(join(path, 'index.mjs'), source);
  };
  const plugin = join(root, 'node_modules/@cloudflare/vite-plugin');
  packageAt(plugin, { name: '@cloudflare/vite-plugin', exports: { '.': { import: './index.mjs' } } }, '');
  packageAt(join(root, 'node_modules/wrangler'), {
    name: 'wrangler', version: '4.122.0', bin: { wrangler: 'index.mjs' },
  }, 'throw new Error("Wrong root Wrangler selected");');
  packageAt(join(plugin, 'node_modules/wrangler'), {
    name: 'wrangler', version: '4.147.0', bin: { wrangler: 'index.mjs' },
  }, `
    import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
    const args = process.argv.slice(2), stage = args[0];
    const record = (value) => appendFileSync('calls.jsonl', JSON.stringify(value) + '\\n');
    record({stage, args, ci: process.env.CI});
    if (stage === 'dev' && args.includes('dist/server/wrangler.json') && !existsSync('migrated')) process.exit(98);
    if (process.env.WAIT_STAGE === stage) {
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
        record({received: signal, stage}); process.exit(0);
      });
      console.log('READY:' + stage);
      setInterval(() => {}, 1000);
    } else if (process.env.SELF_SIGNAL_STAGE === stage) {
      process.kill(process.pid, 'SIGTERM');
    } else {
      const code = Number(process.env[stage === 'd1' ? 'MIGRATION_EXIT' : 'DEV_EXIT'] || 0);
      if (stage === 'd1' && code === 0) writeFileSync('migrated', 'done');
      process.exit(code);
    }
  `);
  return {
    root,
    command: [join(root, 'scripts/start-local-web.mjs')],
    calls: () => readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)),
    env: { ...process.env, CI: 'fixture-dev-env' },
  };
}

void test('npm start uses builder Wrangler, waits for local migration and forwards preview options only to dev', (t) => {
  const f = fixture(t);
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.scripts.start, 'node scripts/start-local-web.mjs');
  const result = spawnSync(process.execPath, [...f.command, '--port', '8788', '--ip', '127.0.0.1'], {
    cwd: f.root, env: f.env, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.calls(), [
    { stage: 'd1', args: ['d1', 'migrations', 'apply', 'site-creator-d1', '--local', '--config', 'dist/server/wrangler.json'], ci: '1' },
    { stage: 'dev', args: ['dev', '--config', 'dist/server/wrangler.json', '--port', '8788', '--ip', '127.0.0.1'], ci: 'fixture-dev-env' },
  ]);
});

void test('operator-dock dev uses the same builder runtime without adding migrations', (t) => {
  const f = fixture(t);
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
    const f = fixture(t);
    const result = spawnSync(process.execPath, f.command, {
      cwd: f.root, env: { ...f.env, [variable]: '23' }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 23, result.stderr);
    assert.deepEqual(f.calls().map((call) => call.stage), stage === 'd1' ? ['d1'] : ['d1', 'dev']);
  });
}

void test('migration terminated by a signal cannot start the server', (t) => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, f.command, {
    cwd: f.root, env: { ...f.env, SELF_SIGNAL_STAGE: 'd1' }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.signal, 'SIGTERM');
  assert.deepEqual(f.calls().map((call) => call.stage), ['d1']);
});

for (const stage of ['d1', 'dev']) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    void test(`${signal} during ${stage} reaches child and stops even when its handler exits zero`, { timeout: 5000 }, async (t) => {
      const f = fixture(t);
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
