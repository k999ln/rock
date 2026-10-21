import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFixtureGoal } from '../scripts/amc-autonomy-fixture.mjs';
import { createAutonomyState } from '../scripts/amc-autonomy.mjs';
import {
  createAutonomyRun, readAutonomyRun, recoverAutonomyLock, withAutonomyLock,
} from '../scripts/amc-autonomy-store.mjs';

await test('dead-owner recovery excludes a second recovery and new acquisition until the old lock is removed', { timeout: 10_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'amc-autonomy-lock-race-'));
  const lock = join(directory, '.supervisor-lock');
  const checked = join(directory, 'liveness-checked');
  const proceed = join(directory, 'continue-recovery');
  let child;
  let completed;
  let stderr = '';
  try {
    const state = createAutonomyState({ goal: createFixtureGoal() });
    await createAutonomyRun(directory, state);
    const oldOwner = { pid: 99_999_999, hostname: hostname(), uid: process.getuid?.() ?? null, token: 'dead-fixture-owner' };
    mkdirSync(lock);
    writeFileSync(join(lock, 'owner.json'), JSON.stringify(oldOwner));
    // Pause recovery after it reads the old owner, at the liveness check. Before
    // the shared guard, another recovery could remove that owner and a new
    // runner could acquire the path; this paused recovery then deleted its lock.
    const source = `
      import { existsSync, writeFileSync } from 'node:fs';
      import { recoverAutonomyLock } from ${JSON.stringify(new URL('../scripts/amc-autonomy-store.mjs', import.meta.url).href)};
      const originalKill = process.kill;
      process.kill = (pid, signal) => {
        if (pid !== ${oldOwner.pid} || signal !== 0) return originalKill(pid, signal);
        writeFileSync(${JSON.stringify(checked)}, '');
        const deadline = Date.now() + 5000;
        while (!existsSync(${JSON.stringify(proceed)})) {
          if (Date.now() > deadline) throw new Error('Recovery fixture barrier timed out');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
        throw Object.assign(new Error('Synthetic dead owner'), { code: 'ESRCH' });
      };
      recoverAutonomyLock(${JSON.stringify(directory)});
    `;
    child = spawn(process.execPath, ['--input-type=module', '-e', source]);
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    completed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    const deadline = Date.now() + 5000;
    while (!existsSync(checked)) {
      assert.ok(Date.now() < deadline, `Recovery child did not reach its barrier: ${stderr}`);
      assert.equal(child.exitCode, null, `Recovery child exited before its barrier: ${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.throws(() => recoverAutonomyLock(directory), /guard busy/);
    let dispatched = false;
    await assert.rejects(withAutonomyLock(directory, () => { dispatched = true; }), /guard busy/);
    assert.equal(dispatched, false);
    assert.deepEqual(JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')), oldOwner);
    assert.deepEqual(readAutonomyRun(directory), state);

    writeFileSync(proceed, '');
    assert.deepEqual(await completed, { code: 0, signal: null }, stderr);
    assert.equal(existsSync(lock), false);
    assert.equal(existsSync(join(directory, '.lock-guard')), false);
    assert.deepEqual(readAutonomyRun(directory), state);
    await withAutonomyLock(directory, () => {
      const liveOwner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8'));
      assert.notEqual(liveOwner.token, oldOwner.token);
      assert.equal(liveOwner.pid, process.pid);
      assert.throws(() => recoverAutonomyLock(directory), /still alive/);
      assert.deepEqual(JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')), liveOwner);
    });
    assert.equal(existsSync(lock), false);
    assert.equal(existsSync(join(directory, '.lock-guard')), false);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (completed) await completed;
    rmSync(directory, { recursive: true, force: true });
  }
});
