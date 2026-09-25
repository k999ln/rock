import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GAME_SANDBOX_RULES,
  applySandboxCommand,
  createSandbox,
  loadSandbox,
  saveSandbox,
  sandboxDigest,
  sandboxKineticEnergy,
  sandboxMomentum,
} from '../lib/game-sandbox.ts';

const fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/game-sandbox-session.json', import.meta.url),
    'utf8',
  ),
);
const particle = (id, x, vx, extra = {}) => ({
  id,
  tag: 'c',
  x,
  y: 500,
  vx,
  vy: 0,
  mass: 1,
  radius: 20,
  ...extra,
});
const sandbox = (particles, extra = {}) =>
  createSandbox({
    title: '試験',
    author: 'test',
    seed: 1,
    particles,
    ...extra,
  });
const run = (state, command) =>
  applySandboxCommand(state, { id: randomUUID(), ...command }, state.revision);
const replay = (state, commands) =>
  commands.reduce(
    (current, command) =>
      applySandboxCommand(current, command, current.revision),
    state,
  );
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

void test('same seed and rules reproduce the same stage and session digest', async () => {
  const a = replay(createSandbox(fixture.create), fixture.commands);
  const b = replay(
    createSandbox(structuredClone(fixture.create)),
    fixture.commands,
  );
  assert.equal(await sandboxDigest(a), await sandboxDigest(b));
  const other = createSandbox({
    ...fixture.create,
    seed: fixture.create.seed + 1,
  });
  assert.notDeepEqual(other.particles, createSandbox(fixture.create).particles);
  assert.equal(a.rules, 'rock-particle-sandbox-rules/1');
  assert.equal(GAME_SANDBOX_RULES.dimensions, 2);
});

void test('equal-mass elastic head-on collision swaps velocities and conserves momentum and energy', () => {
  let state = sandbox([particle('p1', 400, 1), particle('p2', 460, -1)]);
  const p0 = sandboxMomentum(state);
  const e0 = sandboxKineticEnergy(state);
  state = run(state, { action: 'step', ticks: 40 });
  const [p1, p2] = state.particles;
  close(p1.vx, -1);
  close(p2.vx, 1);
  assert.deepEqual(state.bonds, []);
  close(sandboxMomentum(state).x, p0.x);
  close(sandboxKineticEnergy(state), e0);
});

void test('bondable tags at low relative speed bond inelastically; separate splits them', () => {
  let state = sandbox([
    particle('p1', 400, 1, { tag: 'a', mass: 1 }),
    particle('p2', 460, -1, { tag: 'b', mass: 3 }),
  ]);
  const p0 = sandboxMomentum(state);
  const e0 = sandboxKineticEnergy(state);
  state = run(state, { action: 'step', ticks: 40 });
  assert.deepEqual(state.bonds, [['p1', 'p2']]);
  const [p1, p2] = state.particles;
  close(p1.vx, (1 * 1 + 3 * -1) / 4);
  assert.equal(p1.vx, p2.vx);
  close(sandboxMomentum(state).x, p0.x);
  // Lost kinetic energy is a game rule outcome, not a chemical reaction heat.
  assert.ok(sandboxKineticEnergy(state) < e0);
  close(e0 - sandboxKineticEnergy(state), 0.5 * ((1 * 3) / 4) * 2 * 2);
  state = run(state, { action: 'separate', a: 'p2', b: 'p1' });
  assert.deepEqual(state.bonds, []);
  assert.throws(
    () => run(state, { action: 'separate', a: 'p1', b: 'p2' }),
    /結合はありません/u,
  );
});

void test('fast particles are sub-stepped instead of tunnelling; overload stops the command', () => {
  let state = sandbox([particle('p1', 300, 30), particle('p2', 420, -30)]);
  state = run(state, { action: 'step', ticks: 3 });
  assert.ok(state.particles[0].vx < 0 && state.particles[1].vx > 0);
  const overload = sandbox([particle('p1', 300, 190)]);
  assert.throws(
    () => run(overload, { action: 'step', ticks: 1 }),
    /計算過負荷/u,
  );
});

void test('select, hold, move only while held, release, cancel, tracking loss and pause', () => {
  let state = sandbox([particle('p1', 100, 2), particle('p2', 800, 0)]);
  assert.throws(() => run(state, { action: 'hold' }), /先に粒子を選択/u);
  state = run(state, { action: 'select', particleId: 'p1' });
  assert.throws(
    () => run(state, { action: 'move', x: 300, y: 300 }),
    /保持中だけ/u,
  );
  state = run(state, { action: 'hold' });
  assert.equal(state.particles[0].vx, 0);
  state = run(state, { action: 'move', x: 300, y: 300 });
  assert.throws(
    () => run(state, { action: 'move', x: 790, y: 500 }),
    /重なります/u,
  );
  state = run(state, { action: 'step', ticks: 10 });
  assert.deepEqual([state.particles[0].x, state.particles[0].y], [300, 300]);
  const cancelled = run(state, { action: 'cancel_hold' });
  assert.deepEqual(
    [cancelled.particles[0].x, cancelled.particles[0].vx, cancelled.hold],
    [100, 2, null],
  );
  state = run(state, { action: 'release' });
  assert.deepEqual([state.particles[0].x, state.particles[0].vx], [300, 0]);
  state = run(state, { action: 'hold' });
  state = run(state, { action: 'tracking_lost' });
  assert.equal(state.hold, null);
  assert.equal(state.paused, true);
  assert.equal(state.particles[0].vx, 0);
  assert.throws(
    () => run(state, { action: 'step', ticks: 1 }),
    /時間が止まって/u,
  );
  state = run(state, { action: 'resume' });
  assert.equal(run(state, { action: 'step', ticks: 1 }).tick, state.tick + 1);
});

void test('undo restores the previous state and command ids are idempotent', async () => {
  const start = sandbox([particle('p1', 100, 2)]);
  const command = { id: randomUUID(), action: 'step', ticks: 5 };
  const stepped = applySandboxCommand(start, command, 0);
  assert.equal(applySandboxCommand(stepped, command, 0), stepped);
  assert.throws(
    () => applySandboxCommand(stepped, { ...command, ticks: 6 }, 1),
    /異なる内容/u,
  );
  assert.throws(
    () =>
      applySandboxCommand(stepped, { id: randomUUID(), action: 'pause' }, 0),
    /別の操作で更新/u,
  );
  const undone = run(stepped, { action: 'undo' });
  assert.deepEqual(undone.particles, start.particles);
  assert.equal(undone.tick, 0);
  assert.equal(undone.revision, 2);
  assert.throws(() => run(undone, { action: 'undo' }), /取り消せる操作/u);
  let long = start;
  for (let i = 0; i < GAME_SANDBOX_RULES.maxHistory + 5; i += 1)
    long = run(long, { action: 'step', ticks: 1 });
  assert.equal(long.history.length, GAME_SANDBOX_RULES.maxHistory);
  assert.equal(
    await sandboxDigest(await loadSandbox(await saveSandbox(long))),
    await sandboxDigest(long),
  );
});

void test('restart E2E: a new process resumes the saved state and ends identical to an uninterrupted run', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rock-game-sandbox-'));
  try {
    const save = join(dir, 'sandbox.save.json');
    const node = (mode) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            '--experimental-strip-types',
            '--no-warnings',
            new URL('./fixtures/game-sandbox-process.mjs', import.meta.url)
              .pathname,
            mode,
            save,
          ],
          { encoding: 'utf8' },
        ),
      );
    const first = node('start');
    const second = node('resume');
    assert.notEqual(first.pid, second.pid);
    assert.notEqual(first.pid, process.pid);
    assert.equal(second.loadedDigest, first.digest);
    const uninterrupted = replay(
      createSandbox(fixture.create),
      fixture.commands,
    );
    const halfway = replay(
      createSandbox(fixture.create),
      fixture.commands.slice(0, fixture.restartAfter),
    );
    assert.equal(first.digest, await sandboxDigest(halfway));
    assert.equal(second.digest, await sandboxDigest(uninterrupted));
    assert.equal(second.tick, uninterrupted.tick);
    // The first command after restart is undo, so history survived the restart.
    assert.equal(fixture.commands[fixture.restartAfter].action, 'undo');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

void test('invalid saves and version mismatches are rejected', async () => {
  const state = run(sandbox([particle('p1', 100, 2), particle('p2', 300, 0)]), {
    action: 'step',
    ticks: 3,
  });
  const saved = await saveSandbox(state);
  const envelope = JSON.parse(saved);
  const variant = (change) => {
    const copy = structuredClone(envelope);
    change(copy);
    return JSON.stringify(copy);
  };
  await assert.rejects(loadSandbox('{'), /壊れています/u);
  await assert.rejects(loadSandbox(123), /読み込めません/u);
  await assert.rejects(
    loadSandbox(
      variant((e) => {
        e.format = 'other';
      }),
    ),
    /保存データではありません/u,
  );
  await assert.rejects(
    loadSandbox(
      variant((e) => {
        e.version = 2;
      }),
    ),
    (error) => error.status === 409 && /版が違います/u.test(error.message),
  );
  await assert.rejects(
    loadSandbox(
      variant((e) => {
        e.rules = 'rock-particle-sandbox-rules/2';
      }),
    ),
    /規則の版/u,
  );
  await assert.rejects(
    loadSandbox(
      variant((e) => {
        e.rulesDigest = '0'.repeat(64);
      }),
    ),
    /規則の版/u,
  );
  await assert.rejects(
    loadSandbox(
      variant((e) => {
        e.state.tick += 1;
      }),
    ),
    /照合値/u,
  );
  await assert.rejects(
    loadSandbox(
      variant((e) => {
        e.extra = true;
      }),
    ),
    /入力項目/u,
  );
  // Tampered payloads with a recomputed digest still fail structural checks.
  const { materialDigest } = await import('../lib/material-invention.ts');
  const resigned = async (change) => {
    const copy = structuredClone(envelope);
    change(copy.state);
    copy.digest = await materialDigest(copy.state);
    return JSON.stringify(copy);
  };
  await assert.rejects(
    loadSandbox(
      await resigned((s) => {
        s.particles[0].x = 5000;
      }),
    ),
    /位置x/u,
  );
  await assert.rejects(
    loadSandbox(
      await resigned((s) => {
        s.particles[0].vx = Number.NaN;
      }),
    ),
    /照合値|速度x/u,
  );
  await assert.rejects(
    loadSandbox(
      await resigned((s) => {
        s.bonds = [['p1', 'p9']];
      }),
    ),
    /結合の対象/u,
  );
  await assert.rejects(
    loadSandbox(
      await resigned((s) => {
        s.bonds = [['p1', 'p2']];
      }),
    ),
    /速度が一致しません/u,
  );
  await assert.rejects(
    loadSandbox(
      await resigned((s) => {
        s.particles[1].id = 'p1';
      }),
    ),
    /重複なし/u,
  );
  await assert.rejects(
    loadSandbox(
      await resigned((s) => {
        s.wallet = { balance: 1 };
      }),
    ),
    /入力項目/u,
  );
  await assert.rejects(
    loadSandbox(
      await resigned((s) => {
        s.commands = [{ id: randomUUID(), command: '{' }];
      }),
    ),
    /操作記録/u,
  );
  const ok = await loadSandbox(saved);
  assert.equal(await sandboxDigest(ok), await sandboxDigest(state));
});

void test('save carries only game state: no price, purchase, wallet or exchange fields', async () => {
  const saved = await saveSandbox(createSandbox(fixture.create));
  const envelope = JSON.parse(saved);
  assert.deepEqual(Object.keys(envelope).sort(), [
    'digest',
    'format',
    'rules',
    'rulesDigest',
    'state',
    'version',
  ]);
  assert.doesNotMatch(
    saved,
    /price|wallet|payment|purchase|exchange|balance|currency|amount/iu,
  );
});
