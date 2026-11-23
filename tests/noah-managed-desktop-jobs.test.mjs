import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { desktopJobs } from '../services/noah-managed-desktop/jobs.mjs';
import { readManagedDesktopPackage } from '../services/noah-managed-desktop/server.mjs';
import bridge from '../services/noah-managed-desktop/bridge.mjs';

const sha = 'a'.repeat(64), id = '1'.repeat(64), other = '2'.repeat(64);
const body = { text: '入力欄を確認する' };

void test('managed desktop reads only approved package bytes within the deployment size limit', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'noah-managed-package-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'approved.zip');
  const bytes = Buffer.from('approved package bytes');
  const expected = createHash('sha256').update(bytes).digest('hex');
  await writeFile(file, bytes);
  assert.deepEqual(await readManagedDesktopPackage(file, expected), bytes);
  await assert.rejects(readManagedDesktopPackage(file, sha), /SHA-256/);
  await assert.rejects(readManagedDesktopPackage(dir, expected), /大きさ/);
  await truncate(file, (16 * 1024 * 1024) + 1);
  await assert.rejects(readManagedDesktopPackage(file, expected), /大きさ/);
});

void test('the managed package executes once, rejects changed input, and reopens the same receipt', async () => {
  const db = new DatabaseSync(':memory:');
  let releases, runs = 0, stops = 0;
  const wait = new Promise(resolve => { releases = resolve; });
  const prepare = async () => ({
    async run(text) { runs++; await wait; return { text, files: [], exitCode: 0 }; },
    async stop() { stops++; },
  });
  const jobs = desktopJobs(db, prepare, sha);
  assert.equal((await jobs.handle('GET', id)).status, 404);
  assert.equal((await jobs.handle('PUT', id, body)).status, 202);
  assert.equal((await jobs.handle('PUT', id, body)).status, 202);
  assert.equal((await jobs.handle('PUT', id, { text: '別の依頼' })).status, 409);
  assert.equal((await jobs.handle('PUT', other, body)).status, 429);
  releases();
  await setImmediate();
  const reopened = desktopJobs(db, prepare, sha);
  assert.equal((await (await reopened.handle('GET', id)).json()).result, body.text);
  assert.equal((await reopened.handle('PUT', id, body)).status, 200);
  const pastStop = await reopened.handle('DELETE', id);
  assert.equal(pastStop.status, 200); assert.equal((await pastStop.json()).result, body.text);
  assert.equal(runs, 1); assert.equal(stops, 1);
  db.close();
});

void test('a cancellation before arrival or during work prevents execution on replay', async () => {
  const db = new DatabaseSync(':memory:');
  let runs = 0;
  const jobs = desktopJobs(db, async signal => ({
    async run() { runs++; await once(signal, 'abort'); signal.throwIfAborted(); },
    async stop() {},
  }), sha);
  assert.equal((await jobs.handle('DELETE', other)).status, 204);
  assert.equal((await jobs.handle('PUT', other, body)).status, 409);
  assert.equal((await jobs.handle('PUT', id, body)).status, 202);
  assert.equal((await jobs.handle('DELETE', id)).status, 204);
  assert.equal((await jobs.handle('GET', id)).status, 409);
  assert.equal((await jobs.handle('PUT', id, body)).status, 409);
  assert.equal(runs, 1);
  db.close();
});

void test('uncertain teardown or interrupted process cannot be reported as a confirmed stop', async () => {
  const db = new DatabaseSync(':memory:');
  const prepare = async () => ({ async run() { throw Error('failed'); }, async stop() { throw Error('unconfirmed'); } });
  const jobs = desktopJobs(db, prepare, sha);
  await jobs.handle('PUT', id, body); await setImmediate();
  assert.equal((await (await jobs.handle('DELETE', id)).json()).state, 'unknown');
  db.prepare('INSERT INTO jobs(id,package,state) VALUES(?,?,?)').run(other, sha, 'running');
  const restarted = desktopJobs(db, prepare, sha);
  assert.equal((await (await restarted.handle('GET', other)).json()).state, 'unknown');
  assert.equal((await restarted.handle('DELETE', other)).status, 409);
  db.close();
});

void test('private binding pins the recipient and version and drops browser and carrier credentials', async t => {
  const env = { DESKTOP_RUNNER_TOKEN: 'k'.repeat(48), DESKTOP_RUNNER_ORIGIN: 'https://operator.example',
    NOAH_DESKTOP_PACKAGE_SHA256: sha };
  let sent = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    sent++; assert.equal(url.href, env.DESKTOP_RUNNER_ORIGIN + '/jobs/' + id);
    const headers = new Headers(init.headers);
    assert.equal(headers.get('x-noah-desktop-package'), sha);
    assert.equal(headers.get('authorization'), 'Bearer ' + env.DESKTOP_RUNNER_TOKEN);
    assert.equal(headers.get('cookie'), null); assert.equal(headers.get('x-noah-carrier-proof'), null);
    assert.equal(init.redirect, 'manual');
    return sent === 1 ? new Response(null, { status: 202 }) : Response.redirect('https://other.example/');
  });
  const req = new Request('https://binding.invalid/jobs/' + id + '?target=other', {
    headers: { cookie: 'private', 'x-noah-carrier-proof': 'line', 'x-noah-desktop-package': sha },
  });
  assert.equal((await bridge.fetch(req, { ...env, DESKTOP_RUNNER_ORIGIN: 'http://operator.example' })).status, 503);
  assert.equal((await bridge.fetch(req, { ...env, NOAH_DESKTOP_PACKAGE_SHA256: id })).status, 409);
  assert.equal((await bridge.fetch(req, env)).status, 202);
  const redirect = await bridge.fetch(req, env);
  assert.equal(redirect.status, 502); assert.equal(redirect.headers.get('location'), null); assert.equal(sent, 2);
});
