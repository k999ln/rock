import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, chmod, symlink, link, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openPixelRuntimeStopJournal } from '../scripts/pixel-runtime-stop-journal.mjs';

const entry = () => ({ id: randomUUID(), scopeSha256: 'a'.repeat(64), claimId: randomUUID(), requestSha256: 'b'.repeat(64) });
async function setup(t, options) {
  const directory = await mkdtemp(join(tmpdir(), 'pixel-stop-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, journal: await openPixelRuntimeStopJournal(directory, options), path: join(directory, 'runtime-stop-intents.json') };
}

void test('stop metadata is durable, idempotent, private and bound to the full execution tuple', async t => {
  const s = await setup(t), value = entry();
  await s.journal.fence(value); const bytes = await readFile(s.path);
  await s.journal.fence({ ...value }); assert.deepEqual(await readFile(s.path), bytes);
  assert.equal((await stat(s.path)).mode & 0o777, 0o600);
  for (const patch of [{ id: randomUUID() }, { scopeSha256: 'c'.repeat(64) },
    { claimId: randomUUID() }, { requestSha256: 'd'.repeat(64) }]) assert.equal(s.journal.has({ ...value, ...patch }), false);
  assert.equal(s.journal.has(value), true); await s.journal.close();
  const reopened = await openPixelRuntimeStopJournal(s.directory);
  assert.equal(reopened.has(value), true); await reopened.close();
  assert.deepEqual(JSON.parse(bytes).records, [value]);
});

void test('a stop denies immediately while persistence is pending and commits every concurrent intent', async t => {
  let entered, release;
  const began = new Promise(done => { entered = done; }), gate = new Promise(done => { release = done; });
  const s = await setup(t, { afterRename: async () => { entered(); await gate; } }), a = entry(), b = entry();
  const first = s.journal.fence(a); await began;
  const second = s.journal.fence(b);
  assert.equal(s.journal.has(a), true); assert.equal(s.journal.has(b), true);
  release(); await Promise.all([first, second]); await s.journal.close();
  const reopened = await openPixelRuntimeStopJournal(s.directory);
  assert.equal(reopened.has(a), true); assert.equal(reopened.has(b), true); await reopened.close();
});

void test('failure after rename is unknown and fences all subsequent starts until a verified reopen', async t => {
  const s = await setup(t, { afterRename: () => { throw Error('synthetic commit observation loss'); } }), value = entry();
  await assert.rejects(s.journal.fence(value));
  assert.throws(() => s.journal.has(entry()), { code: 'RUNTIME_STOP_JOURNAL_WRITE_UNKNOWN' });
  assert.throws(() => s.journal.fence(entry()), { code: 'RUNTIME_STOP_JOURNAL_WRITE_UNKNOWN' });
  await s.journal.close(); const reopened = await openPixelRuntimeStopJournal(s.directory);
  assert.equal(reopened.has(value), true); await reopened.close();
});

void test('ownership failure never grants a fence receipt and cannot admit another execution', async t => {
  const s = await setup(t, { assertOwner: () => { throw Error('synthetic socket changed'); } });
  await assert.rejects(s.journal.fence(entry()));
  assert.throws(() => s.journal.has(entry()), { code: 'RUNTIME_STOP_JOURNAL_WRITE_UNKNOWN' });
  await assert.rejects(readFile(s.path), { code: 'ENOENT' }); await s.journal.close();
});

void test('unknown keys, credentials, malformed identifiers and excessive records are rejected', async t => {
  const s = await setup(t);
  for (const value of [{ ...entry(), accessToken: 'not-a-real-token' }, { ...entry(), id: '__proto__' },
    { ...entry(), claimId: 1 }, { ...entry(), scopeSha256: 'A'.repeat(64) }, null])
    assert.throws(() => s.journal.fence(value), { code: 'INVALID_RUNTIME_STOP_BINDING' });
  const values = Array.from({ length: 256 }, entry);
  await Promise.all(values.map(v => s.journal.fence(v)));
  assert.throws(() => s.journal.fence(entry()), { code: 'RUNTIME_STOP_JOURNAL_LIMIT' });
  assert.equal(JSON.parse(await readFile(s.path, 'utf8')).records.length, 256); await s.journal.close();
});

void test('admission reserves stop capacity even when unrelated fences fill the journal', async t => {
  const s = await setup(t), active = entry();
  await s.journal.reserve(active);
  assert.equal(s.journal.has(active), false);
  await Promise.all(Array.from({ length: 255 }, entry).map(value => s.journal.fence(value)));
  assert.throws(() => s.journal.reserve(entry()), { code: 'RUNTIME_STOP_JOURNAL_LIMIT' });
  assert.throws(() => s.journal.fence(entry()), { code: 'RUNTIME_STOP_JOURNAL_LIMIT' });
  await s.journal.fence(active);
  assert.equal(s.journal.has(active), true);
  await s.journal.close();
  const reopened = await openPixelRuntimeStopJournal(s.directory);
  assert.equal(reopened.has(active), true);
  assert.throws(() => reopened.reserve(active), { code: 'RUNTIME_EXECUTION_FENCED' });
  assert.throws(() => reopened.reserve(entry()), { code: 'RUNTIME_STOP_JOURNAL_LIMIT' });
  await reopened.close();
});

void test('old exact fences remain denied when upgraded to the reservation format', async t => {
  const s = await setup(t), old = entry(), active = entry(); await s.journal.close();
  await writeFile(s.path, JSON.stringify({ schema: 'rockstaros.pixel-stop-intents/1', records: [old] }), { mode: 0o600 });
  const migrated = await openPixelRuntimeStopJournal(s.directory);
  assert.equal(migrated.has(old), true);
  assert.throws(() => migrated.reserve(old), { code: 'RUNTIME_EXECUTION_FENCED' });
  await migrated.reserve(active); await migrated.close();
  const saved = JSON.parse(await readFile(s.path, 'utf8'));
  assert.equal(saved.schema, 'rockstaros.pixel-stop-intents/2');
  assert.deepEqual(saved.records, [old]); assert.deepEqual(saved.reservations, [active]);
});

void test('a stop arriving during admission persistence wins before the reservation returns', async t => {
  let entered, release, first = true;
  const began = new Promise(done => { entered = done; }), gate = new Promise(done => { release = done; });
  const s = await setup(t, { afterRename: async () => { if (first) { first = false; entered(); await gate; } } }), value = entry();
  const admission = s.journal.reserve(value); await began;
  const stopping = s.journal.fence(value);
  assert.equal(s.journal.has(value), true);
  assert.throws(() => s.journal.reserve(value), { code: 'RUNTIME_EXECUTION_FENCED' });
  release(); await Promise.all([admission, stopping]); await s.journal.close();
  const reopened = await openPixelRuntimeStopJournal(s.directory);
  assert.equal(reopened.has(value), true); await reopened.close();
});

void test('reservation records retain strict schema, duplicate and combined capacity checks', async t => {
  const s = await setup(t); await s.journal.close(); const value = entry();
  const valid = { schema: 'rockstaros.pixel-stop-intents/2', records: [], reservations: [value] };
  for (const invalid of [
    { ...valid, credentials: 'synthetic' }, { ...valid, reservations: null },
    { ...valid, reservations: [value, value] },
    { ...valid, records: Array.from({ length: 256 }, entry) },
    { ...valid, reservations: [{ ...value, requestSha256: null }] },
  ]) {
    await writeFile(s.path, JSON.stringify(invalid), { mode: 0o600 });
    await assert.rejects(openPixelRuntimeStopJournal(s.directory));
  }
});

void test('symlinks, hard links, broad modes, corrupt schemas and duplicate records never become a journal', async t => {
  const s = await setup(t), value = entry(); await s.journal.fence(value); await s.journal.close();
  const original = await readFile(s.path), target = join(s.directory, 'outside'); await writeFile(target, original, { mode: 0o600 });
  await rm(s.path); await symlink(target, s.path); await assert.rejects(openPixelRuntimeStopJournal(s.directory));
  await rm(s.path); await link(target, s.path); await assert.rejects(openPixelRuntimeStopJournal(s.directory));
  await rm(s.path); await writeFile(s.path, original, { mode: 0o600 }); await chmod(s.path, 0o644);
  await assert.rejects(openPixelRuntimeStopJournal(s.directory)); await chmod(s.path, 0o600);
  for (const text of ['{', JSON.stringify({ schema: 'wrong', records: [] }), JSON.stringify({ schema: 'rockstaros.pixel-stop-intents/1', records: [value, value] })]) {
    await writeFile(s.path, text); await assert.rejects(openPixelRuntimeStopJournal(s.directory));
  }
  assert.deepEqual(await readFile(target), original);
});
