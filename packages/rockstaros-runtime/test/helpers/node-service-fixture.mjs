import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rockstarDeviceLinkStore, negotiatedDeviceBinding, deviceAuthorizationResponse } from '../../../../lib/rockstar-device-link.ts';
import { eveRuntimeSyncStore } from '../../../../lib/eve-runtime-sync.ts';
import { eveHistoryStore } from '../../../../lib/eve-history.ts';
import { describeAdapter } from '../../../../lib/rockstar-adapters.ts';
import { createRockstarRuntime, executionDigest } from '../../src/index.mjs';
import { prepareNodeServiceHost, connectNodeServiceHost, openNodeServiceHost, nodeServiceHostStatus } from '../../src/node-service-host.mjs';

export const unlock = () => Buffer.from('Synthetic owner unlock for testing only.');
const tick = () => new Promise(resolve => setImmediate(resolve));
export async function nodeServiceFixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'rock-node-service-'));
  const databaseFile = options.persisted === true ? join(directory, 'fixture.sqlite') : ':memory:';
  let sql = new DatabaseSync(databaseFile);
  for (const name of ['0045_rockstar_device_sessions.sql', '0070_eve_durable_history.sql', '0075_eve_device_jobs.sql', '0076_eve_device_commands.sql', '0083_eve_runtime_presence.sql'])
    sql.exec(readFileSync(new URL('../../../../drizzle/' + name, import.meta.url), 'utf8'));
  const statement = (query, args = []) => ({
    bind(...values) { return statement(query, values); },
    async first() { return sql.prepare(query).get(...args) ?? null; },
    async all() { return { results: sql.prepare(query).all(...args) }; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
  });
  const db = { prepare: statement, async batch(items) {
    sql.exec('BEGIN');
    try { const results = []; for (const item of items) results.push(await item.run()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  t.after(async () => { sql.close(); await rm(directory, { recursive: true, force: true }); });
  const keys = { current: 'fixture', keys: { fixture: 'ab'.repeat(32) } };
  const link = rockstarDeviceLinkStore(db);
  const store = eveRuntimeSyncStore(db, 'synthetic-owner', keys);
  const history = eveHistoryStore(db, 'synthetic-owner', keys, true);
  const recipe = { name: '合成の担当', instructions: '合成の下書きを作る', modelId: 'test-model' };
  const configuration = { name: '合成のMac', models: [{ id: 'test-model', name: 'test-model', scheme: 'ollama-manifest-sha256', sha256: 'cd'.repeat(32) }], agents: [{ id: crypto.randomUUID(), ...recipe, sha256: await executionDigest(JSON.stringify(recipe)) }] };
  const calls = [], counts = { generated: 0, polls: 0, begin: 0, runtime: 0 };
  const driver = {
    describe: async () => describeAdapter('node-ollama', 'executor', process.platform === 'darwin' ? 'macos' : 'linux', { 'text.generate': true, 'model.pin': true }),
    generate: async request => { counts.generated++; return { text: '合成の保存済み下書き', model: request.model, durationMs: 1 }; },
  };
  const f = { directory, db, link, store, history, configuration, calls, counts, driver, binding: true, identityOwner: 'synthetic-owner', lastAuthorization: null, pollOverride: null, runtimeOverride: null };
  Object.defineProperty(f, 'sql', { get: () => sql });
  f.reopenDatabase = () => { assert.notEqual(databaseFile, ':memory:'); sql.close(); sql = new DatabaseSync(databaseFile); };
  // In-memory HTTP boundary with real device/replica/history SQL stores, not a public auth server.
  f.origin = 'https://synthetic.invalid';
  f.fetchImpl = async (url, init) => {
    const request = new Request(url, init), parsed = new URL(request.url);
    assert.equal(parsed.origin, f.origin);
    assert.equal(init.redirect, 'error');
    if (request.method !== 'GET') assert.equal(request.headers.get('origin'), parsed.origin);
    const value = request.method === 'GET' ? null : await request.json();
    calls.push({ path: parsed.pathname, method: request.method, action: value?.action });
    const json = (data, status = 200) => Response.json(data, { status });
    try {
      if (parsed.pathname === '/api/rockstar/device-authorizations') {
        assert.equal(request.headers.has('authorization'), false);
        const bound = negotiatedDeviceBinding(request.headers.get('X-Rockstar-Device-Binding'));
        if (value.action === 'begin') {
          counts.begin++;
          const auth = await link.begin(value.deviceName);
          f.lastAuthorization = auth;
          if (!f.binding) delete auth.sessionBinding;
          return json(deviceAuthorizationResponse(auth, bound), 201);
        }
        counts.polls++;
        return json(deviceAuthorizationResponse(f.pollOverride ? await f.pollOverride(value.deviceCode) : await link.poll(value.deviceCode), bound));
      }
      assert.equal(parsed.pathname, '/api/eve/runtime');
      counts.runtime++;
      const token = request.headers.get('authorization')?.slice(7);
      const identity = await link.identity(token);
      assert.equal(identity.userId, 'synthetic-owner');
      if (f.runtimeOverride) { const overridden = await f.runtimeOverride({ request, value, identity }); if (overridden) return overridden; }
      if (request.method === 'GET') return parsed.searchParams.has('id')
        ? json({ execution: await store.read(parsed.searchParams.get('id'), identity.id) })
        : json({ ownerUserId: f.identityOwner, deviceId: identity.id, commands: await store.commands(identity.id) });
      if (value.action === 'presence') return json(await store.presence(value.presence, identity.id));
      if (value.action === 'claim') return json(await store.claim(identity.id, value.claim));
      if (value.action === 'authorize') return json(await store.authorize(identity.id, value.id, value.claimId));
      if (value.action === 'report') return json(await store.publish(identity.id, value.value));
      if (value.action === 'stop-receipt') return json(await store.stopReceipt(identity.id, value.receipt));
      if (value.action === 'ack') return json(await store.acknowledge(identity.id, value.id, value.claimId));
      assert.fail('Unknown fixture route');
    } catch (error) {
      return json({ error: error.code ?? error.message }, error.message === 'UNAUTHORIZED' ? 401 : error.status ?? 500);
    }
  };
  f.runtimeFactory = options => createRockstarRuntime({ ...options, fetchImpl: f.fetchImpl });
  f.prepare = () => prepareNodeServiceHost({ directory: join(directory, 'host'), origin: f.origin, configuration, driver });
  f.status = () => nodeServiceHostStatus(join(directory, 'host'));
  f.connect = onAuthorization => connectNodeServiceHost({ directory: join(directory, 'host'), unlockPhrase: unlock(), driver, runtimeFactory: f.runtimeFactory, pollWait: tick, onAuthorization: onAuthorization ?? (async ({ userCode }) => { assert.equal((await link.approve(userCode, 'synthetic-owner')).approved, true); }) });
  f.open = () => openNodeServiceHost({ directory: join(directory, 'host'), unlockPhrase: unlock(), driver, runtimeFactory: f.runtimeFactory });
  f.enqueue = async deviceId => store.enqueue({ id: crypto.randomUUID(), threadId: crypto.randomUUID(), deviceId, agentId: configuration.agents[0].id, agentSha256: configuration.agents[0].sha256, modelSha256: configuration.models[0].sha256, modelScheme: configuration.models[0].scheme, input: '[合成] 共通ホストの下書き', maxOutputTokens: 64, confirm: 'run-owner-local-text' });
  return f;
}

