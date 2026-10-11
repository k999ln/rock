import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
