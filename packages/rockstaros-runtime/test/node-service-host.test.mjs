import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { RuntimeError } from '../src/index.mjs';
import { connectNodeServiceHost, openNodeServiceHost } from '../src/node-service-host.mjs';
import { runNodeHostCli, parseHostArguments } from '../src/host-cli.mjs';
import { nodeServiceFixture as fixture, unlock } from './helpers/node-service-fixture.mjs';

void test('dev.5 setup, owner-approved pairing, encrypted storage and reopened receiver keep the same Eve job/history', async t => {
  const f = await fixture(t);
  const prepared = await f.prepare();
  assert.equal(prepared.status, 'prepared');
  assert.equal((await stat(join(f.directory, 'host'))).mode & 0o777, 0o700);
  assert.equal(f.counts.begin, 0);
  const connected = await f.connect();
  assert.equal(connected.status, 'linked');
  assert.equal((await f.status()).status, 'linked');
  const vaultDir = join(f.directory, 'host', 'credentials');
  const vault = await readFile(join(vaultDir, (await readdir(vaultDir))[0]), 'utf8');
  assert.doesNotMatch(vault, /rock_session_|synthetic-owner/);
  let host = await f.open();
  try {
    assert.deepEqual(await host.cycle(), []);
    await f.enqueue(connected.deviceId);
    const results = await host.cycle();
    assert.equal(results.length, 1);
    assert.equal(results[0].state, 'reported');
    assert.equal(results[0].reportState, 'review');
  } finally { await host.close(); }
  const [saved] = await f.store.list();
  assert.equal(saved.externalToolSuccess, false);
  const before = await f.history.get(saved.threadId);
  assert.equal(before.session.messages.length, 2);
  assert.equal(f.counts.generated, 1);
  host = await f.open();
  try { assert.deepEqual(await host.cycle(), []); } finally { await host.close(); }
  assert.deepEqual(await f.history.get(saved.threadId), before);
  assert.equal((await f.store.list()).length, 1);
  assert.equal(f.counts.generated, 1);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM rockstar_device_sessions').get().n, 1);
});

void test('an explicit owner denial can be retried with a fresh code but creates no grant or inference', async t => {
  const f = await fixture(t);
  await f.prepare();
  await assert.rejects(f.connect(async ({ userCode }) => { assert.equal((await f.link.deny(userCode, 'synthetic-owner')).denied, true); }), { code: 'HOST_AUTHORIZATION_DENIED' });
  assert.equal((await f.status()).status, 'prepared');
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM rockstar_device_sessions').get().n, 0);
  const oldCode = f.lastAuthorization.deviceCode;
  const connected = await f.connect();
  assert.equal(connected.status, 'linked');
  assert.notEqual(f.lastAuthorization.deviceCode, oldCode);
  assert.deepEqual(await f.link.poll(oldCode), { status: 'access_denied', reason: 'owner_denied' });
  assert.equal(f.counts.generated, 0);
});

void test('an already-consumed response is unresolved and cannot reset pairing or create a replacement grant', async t => {
  const f = await fixture(t);
  await f.prepare();
  f.pollOverride = async code => {
    assert.equal((await f.link.poll(code)).status, 'authorized');
    const second = await f.link.poll(code);
    assert.deepEqual(second, { status: 'access_denied' });
    return second;
  };
  await assert.rejects(f.connect(), { code: 'HOST_AUTHORIZATION_OUTCOME_UNRESOLVED' });
  assert.equal((await f.status()).status, 'uncertain');
  await assert.rejects(f.connect(), { code: 'HOST_SETUP_RECONCILIATION_REQUIRED' });
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM rockstar_device_sessions').get().n, 1);
  assert.equal(f.counts.begin, 1);
  assert.equal(f.counts.generated, 0);
});

void test('lost poll response preserves uncertainty after server consumption and never makes another grant', async t => {
  const f = await fixture(t);
  await f.prepare();
  f.pollOverride = async code => { await f.link.poll(code); throw new RuntimeError('RESPONSE_LOST', 0, 'unknown'); };
  await assert.rejects(f.connect(), { outcome: 'unknown' });
  assert.equal((await f.status()).status, 'uncertain');
  await assert.rejects(f.connect(), { code: 'HOST_SETUP_RECONCILIATION_REQUIRED' });
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM rockstar_device_sessions').get().n, 1);
  assert.equal(f.counts.generated, 0);
});

void test('unsupported service binding refuses before owner authorization/poll and preserves the prepared profile', async t => {
  const f = await fixture(t);
  await f.prepare(); f.binding = false;
  let authorizations = 0;
  await assert.rejects(f.connect(async () => { authorizations++; }), { code: 'SERVICE_PAIRING_BINDING_UNSUPPORTED' });
  assert.equal(authorizations, 0);
  assert.equal(f.counts.polls, 0);
  assert.equal((await f.status()).status, 'prepared');
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM rockstar_device_sessions').get().n, 0);
});

void test('verified expiry creates no credential, while abort without a terminal response stays uncertain', async t => {
  const f = await fixture(t);
  await f.prepare();
  f.pollOverride = code => f.link.poll(code, Date.now() + 601000);
  await assert.rejects(f.connect(async () => {}), { code: 'HOST_AUTHORIZATION_EXPIRED' });
  assert.equal((await f.status()).status, 'prepared');
  const controller = new AbortController();
  await assert.rejects(connectNodeServiceHost({ directory: join(f.directory, 'host'), unlockPhrase: unlock(), driver: f.driver, runtimeFactory: f.runtimeFactory, signal: controller.signal, onAuthorization: async () => { controller.abort(); } }), { code: 'HOST_WAIT_CANCELLED' });
  assert.equal((await f.status()).status, 'uncertain');
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM rockstar_device_sessions').get().n, 0);
});

void test('wrong unlock, identity drift and concurrent startup fail before jobs or prompts are touched', async t => {
  const f = await fixture(t);
  await f.prepare(); await f.connect();
  await assert.rejects(openNodeServiceHost({ directory: join(f.directory, 'host'), unlockPhrase: Buffer.from('A wrong synthetic unlock phrase.'), driver: f.driver, runtimeFactory: f.runtimeFactory }), { code: 'CREDENTIAL_UNLOCK_FAILED' });
  assert.equal(f.counts.runtime, 0);
  f.identityOwner = 'different-owner';
  await assert.rejects(f.open(), { code: 'SERVICE_IDENTITY_MISMATCH' });
  assert.equal((await readdir(join(f.directory, 'host'))).includes('jobs'), false);
  f.identityOwner = 'synthetic-owner';
  const host = await f.open();
  try { await assert.rejects(f.open(), { code: 'HOST_STATE_IN_USE_OR_UNCLEAN' }); }
  finally { await host.close(); await host.close(); }
  assert.equal(f.counts.generated, 0);
});

void test('host CLI requires a terminal for new grants and emits no unlock secret or token', async () => {
  assert.throws(() => parseHostArguments(['run', '--state-dir', '/private/fixture', '--max-jobs', '0']), { code: 'INVALID_HOST_JOB_LIMIT' });
  let unlocked = 0;
  await assert.rejects(runNodeHostCli(['connect', '--state-dir', '/private/fixture'], { input: { isTTY: false }, errors: { isTTY: false }, unlock: async () => { unlocked++; return unlock(); } }), { code: 'OWNER_TERMINAL_REQUIRED' });
  assert.equal(unlocked, 0);
  const outputs = [], phrase = unlock(); let closed = 0, cycles = 0, removed = 0;
  await runNodeHostCli(['run', '--state-dir', '/private/fixture', '--max-jobs', '1'], {
    unlock: async () => phrase, emit: value => outputs.push(value), onSignal: () => () => { removed++; },
    service: { openNodeServiceHost: async () => ({ name: 'synthetic host', deviceId: 'synthetic-device', cycle: async () => { cycles++; return [{ id: 'synthetic-job', state: 'reported', reportState: 'review' }]; }, close: async () => { closed++; } }) },
  });
  assert.equal(cycles, 1); assert.equal(closed, 1); assert.equal(removed, 1);
  assert.equal(phrase.every(byte => byte === 0), true);
  assert.doesNotMatch(JSON.stringify(outputs), /Synthetic owner unlock|rock_session_/);
  assert.equal(outputs.at(-1).engineStopConfirmed, false);
});
