import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  cpSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import {
  initialize,
  openRuntime,
  template,
  parseAction,
} from '../toolkits/noah-resale-agent/runtime.mjs';
import { digest } from '../lib/noah-resale-provider.ts';
import { parseWorkCommand } from '../lib/workflow.ts';
const cli = resolve('toolkits/noah-resale-agent/cli.mjs');
function directory(t) {
  const p = mkdtempSync(join(tmpdir(), 'noah-cli-test-'));
  t.after(() => rmSync(p, { recursive: true, force: true }));
  return p;
}
function fixture(t) {
  const root = join(directory(t), 'state'),
    c = {
      ...structuredClone(template),
      mode: 'fixture',
      budget: 50000,
      perItemCap: 10000,
    };
  initialize(root, c);
  return { root, c };
}
function invoke(root, args, entry = cli, cwd = resolve('.')) {
  return spawnSync(
    process.execPath,
    ['--experimental-strip-types', entry, ...args, '--workspace', root],
    {
      encoding: 'utf8',
      cwd,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      timeout: 20000,
    },
  );
}
async function candidateWithQuote(rt) {
  await rt.configure(rt.config);
  await rt.run('scout');
  const i = (await rt.get()).resale.items[0];
  await rt.run('assess', {
    itemId: i.id,
    resalePrice: 3000,
    costs: 600,
    floorProfit: 500,
    evidence: 'synthetic fixture',
  });
  await rt.run('quote', { itemId: i.id, confirm: true });
  return i.id;
}
void test('CLI demo completes offline with fixture labels; restart restores terminal Work and exact profit', (t) => {
  const root = join(directory(t), 'demo'),
    r = invoke(root, ['demo']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.simulated, true);
  assert.equal(out.totals.reportedProfit, 1300);
  assert.equal(out.items.filter((i) => i.status === 'sold').length, 1);
  const reopened = invoke(root, ['status']);
  assert.equal(reopened.status, 0, reopened.stderr);
  assert.deepEqual(JSON.parse(reopened.stdout).totals, out.totals);
  const db = new DatabaseSync(join(root, 'work.sqlite'));
  const job = JSON.parse(
    db.prepare('SELECT payload FROM work_jobs').get().payload,
  );
  db.close();
  assert.ok(job.events.every((e) => e.command.transport === 'terminal'));
  assert.throws(() => parseWorkCommand(job.events[0].command));
  assert.equal(statSync(root).mode & 0o777, 0o700);
  assert.equal(statSync(join(root, 'work.sqlite')).mode & 0o777, 0o600);
});
void test('init and doctor work without Web, while discovery without a token fails clearly', (t) => {
  const root = join(directory(t), 'real');
  assert.equal(invoke(root, ['init']).status, 0);
  const doctor = JSON.parse(invoke(root, ['doctor']).stdout);
  assert.equal(doctor.requiresWebServer, false);
  assert.equal(doctor.ready.search, false);
  assert.equal(doctor.budget, 0);
  assert.equal(invoke(root, ['run', '--once']).status, 1);
  assert.equal(invoke(root, ['init']).status, 1);
});
void test('approval rejects cross-workspace, altered preview, new account, stale revision and replay', async (t) => {
  const { root } = fixture(t),
    rt = openRuntime(root, {});
  t.after(() => rt.close());
  const id = await candidateWithQuote(rt),
    review = await rt.makeReview('purchase', id),
    confirmation = await digest(review);
  await assert.rejects(rt.execute(review, 'wrong'), /SHA-256/);
  const expired = await rt.makeReview(
    'purchase',
    id,
    crypto.randomUUID(),
    Date.now() - 300001,
  );
  await assert.rejects(rt.execute(expired, await digest(expired)), /期限/);
  const altered = structuredClone(review);
  altered.preview.terms.total = 1;
  await assert.rejects(
    rt.execute(altered, await digest(altered)),
    /変わりました/,
  );
  const changed = openRuntime(root, {
    RESALE_EBAY_BUYER_TOKEN: 'different-synthetic-account',
  });
  await assert.rejects(changed.execute(review, confirmation), /変わりました/);
  changed.close();
  const other = fixture(t),
    otherRt = openRuntime(other.root, {});
  await candidateWithQuote(otherRt);
  await assert.rejects(otherRt.execute(review, confirmation));
  otherRt.close();
  await rt.run('pause');
  await assert.rejects(rt.execute(review, confirmation), /変わりました/);
  await rt.run('resume');
  const fresh = await rt.makeReview('purchase', id);
  await rt.execute(fresh, await digest(fresh));
  await assert.rejects(rt.execute(fresh, await digest(fresh)), /変わりました/);
  assert.equal((await rt.view()).totals.spent, 1100);
});
void test('two terminal processes sharing SQLite can reserve a reviewed purchase only once', async (t) => {
  const { root } = fixture(t),
    a = openRuntime(root, {}),
    b = openRuntime(root, {});
  t.after(() => {
    a.close();
    b.close();
  });
  const id = await candidateWithQuote(a),
    review = await a.makeReview('purchase', id),
    confirmation = await digest(review);
  const results = await Promise.allSettled([
    a.execute(review, confirmation),
    b.execute(review, confirmation),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const state = await a.view();
  assert.equal(state.totals.spent, 1100);
  assert.equal(state.operations.length, 1);
});
void test('watch lease rejects duplicates and stale release cannot free a new lease', (t) => {
  const { root } = fixture(t),
    a = openRuntime(root, {}),
    b = openRuntime(root, {});
  t.after(() => {
    a.close();
    b.close();
  });
  assert.equal(a.claim('first', 10000), true);
  assert.equal(b.claim('second', 10000), false);
  a.release('first');
  assert.equal(b.claim('second', 10000), true);
  a.release('first');
  assert.equal(a.claim('third', 10000), false);
});
void test('CLI review file and execute command complete one confirmed fixture purchase', async (t) => {
  const { root } = fixture(t),
    rt = openRuntime(root, {}),
    id = await candidateWithQuote(rt);
  rt.close();
  const result = invoke(root, ['review', 'purchase', id]);
  assert.equal(result.status, 0, result.stderr);
  const approval = JSON.parse(result.stdout);
  assert.equal(statSync(approval.reviewFile).mode & 0o777, 0o600);
  const placed = invoke(root, [
    'execute',
    '--input',
    approval.reviewFile,
    '--confirm',
    approval.sha256,
  ]);
  assert.equal(placed.status, 0, placed.stderr);
  assert.equal(JSON.parse(placed.stdout).totals.spent, 1100);
  assert.equal(
    invoke(root, [
      'execute',
      '--input',
      approval.reviewFile,
      '--confirm',
      approval.sha256,
    ]).status,
    1,
  );
});
void test('CLI stop is persisted and watch ends without external work; action files cannot buy', async (t) => {
  const { root } = fixture(t),
    rt = openRuntime(root, {});
  await rt.configure(rt.config);
  rt.close();
  assert.equal(invoke(root, ['stop']).status, 0);
  const watch = invoke(root, ['watch', '--cycles', '1']);
  assert.equal(watch.status, 0, watch.stderr);
  assert.equal(JSON.parse(watch.stdout).status, 'stopped');
  assert.throws(() =>
    parseAction({ action: 'purchase', itemId: 'x', confirm: true }),
  );
  assert.throws(() => parseAction({ action: 'import', token: 'secret' }));
});
void test('invalid config is rejected and checked-in example stays synchronized with template', (t) => {
  assert.deepEqual(
    JSON.parse(
      readFileSync('toolkits/noah-resale-agent/agent.example.json', 'utf8'),
    ),
    template,
  );
  assert.throws(() =>
    initialize(join(directory(t), 'invalid'), { ...template, budget: -1 }),
  );
  assert.throws(() =>
    initialize(join(directory(t), 'invalid2'), {
      ...template,
      token: 'must-not-save',
    }),
  );
});
void test('portable bundle runs in a different directory without node_modules or any fetch', (t) => {
  const build = spawnSync(
    process.execPath,
    ['scripts/package-noah-resale-agent.mjs', join(directory(t), 'package')],
    { encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(build.status, 0, build.stderr);
  const source = JSON.parse(build.stdout).directory,
    dest = join(directory(t), 'a folder with spaces');
  cpSync(source, dest, { recursive: true });
  const deny = join(dest, 'deny-network.mjs');
  writeFileSync(
    deny,
    "globalThis.fetch=()=>{throw Error('NETWORK FORBIDDEN IN OFFLINE TEST')};\n",
  );
  const r = spawnSync(
    process.execPath,
    [
      '--import',
      deny,
      join(dest, 'agent.mjs'),
      'demo',
      '--workspace',
      join(dest, 'private-state'),
    ],
    {
      cwd: dest,
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
      timeout: 20000,
    },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).simulated, true);
});
