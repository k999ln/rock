import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  readSkyEveSelection,
  skyEveDevicePath,
  skyEveDeviceState,
  skyEveSelectionMatches,
  skyEveConsentKey,
} from '../lib/sky-eve-connections.ts';
import { describeAdapter } from '../lib/rockstar-adapters.ts';
const fixture = () => {
  const agent = {
    id: randomUUID(),
    name: '文章担当',
    modelId: 'local',
    sha256: 'ab'.repeat(32),
  };
  const model = {
    id: 'local',
    name: '基盤モデルの例',
    sha256: 'cd'.repeat(32),
  };
  const device = {
    deviceId: randomUUID(),
    name: '本人のPixel',
    phase: 'ready',
    agents: [agent],
    models: [model],
    preparedModels: [model.id],
    updatedAt: 100000,
  };
  const reference = {
    deviceId: device.deviceId,
    agentId: agent.id,
    agentSha256: agent.sha256,
    modelSha256: model.sha256,
  };
  return { agent, model, device, reference };
};
const runtimeFixture = () => {
  const f = fixture();
  f.model.scheme = 'ollama-manifest-sha256';
  Object.assign(f.device, {
    schema: 'rockstaros.runtime-presence/1',
    host: describeAdapter(
      'host',
      'host',
      'macos',
      { 'identity.owner-local': true, 'store.cas': true },
      100000,
    ),
    executor: describeAdapter(
      'executor',
      'executor',
      'macos',
      { 'text.generate': true, 'model.pin': true },
      100000,
    ),
    output: describeAdapter(
      'output',
      'output',
      'macos',
      { 'output.text': true },
      100000,
    ),
  });
  f.reference.modelScheme = f.model.scheme;
  return f;
};
void test('runtime references pin digest scheme into the same Eve URL and reject protocol substitution', () => {
  const f = runtimeFixture();
  const url = new URL(skyEveDevicePath(f.reference), 'https://fixture.invalid');
  const selection = readSkyEveSelection(Object.fromEntries(url.searchParams));
  assert.deepEqual(selection, { kind: 'runtime', ...f.reference });
  assert.equal(skyEveSelectionMatches(selection, f.device, f.agent.id), true);
  assert.equal(
    skyEveSelectionMatches(
      { ...selection, modelScheme: 'gguf-sha256' },
      f.device,
      f.agent.id,
    ),
    false,
  );
  const legacy = { ...f.device };
  delete legacy.schema;
  assert.equal(skyEveSelectionMatches(selection, legacy, f.agent.id), false);
  assert.equal(
    skyEveSelectionMatches(
      { kind: 'device', ...f.reference },
      f.device,
      f.agent.id,
    ),
    false,
  );
  for (const p of [
    { runtime: '1' },
    { ...Object.fromEntries(url.searchParams), runtime: '2' },
    { ...Object.fromEntries(url.searchParams), modelScheme: 'arbitrary' },
  ])
    assert.equal(readSkyEveSelection(p).kind, 'invalid');
});
void test('runtime availability rejects stale negotiation, unknown capability and incompatible protocol', () => {
  const f = runtimeFixture();
  assert.equal(skyEveDeviceState(f.device, f.agent.id, 100001).available, true);
  for (const patch of [
    { expiresAt: 100001 },
    { protocols: [2] },
    { capabilities: { 'text.generate': null, 'model.pin': true } },
    { version: 'invalid' },
  ])
    assert.equal(
      skyEveDeviceState(
        { ...f.device, executor: { ...f.device.executor, ...patch } },
        f.agent.id,
        100001,
      ).available,
      false,
    );
});
void test('runtime consent changes for owner, model scheme, adapter identity, version or capability', () => {
  const f = runtimeFixture(),
    key = skyEveConsentKey('alice', f.device, f.agent.id);
  assert.notEqual(key, skyEveConsentKey('bob', f.device, f.agent.id));
  for (const patch of [
    { id: 'replacement' },
    { version: '1.1.0' },
    { platform: 'linux' },
    { capabilities: { 'text.generate': true, 'model.pin': false } },
  ])
    assert.notEqual(
      key,
      skyEveConsentKey(
        'alice',
        { ...f.device, executor: { ...f.device.executor, ...patch } },
        f.agent.id,
      ),
    );
  assert.notEqual(
    key,
    skyEveConsentKey(
      'alice',
      { ...f.device, models: [{ ...f.model, scheme: 'gguf-sha256' }] },
      f.agent.id,
    ),
  );
  assert.equal(
    key,
    skyEveConsentKey(
      'alice',
      {
        ...f.device,
        updatedAt: 100001,
        executor: {
          ...f.device.executor,
          observedAt: 100001,
          expiresAt: 130001,
        },
      },
      f.agent.id,
    ),
  );
});
void test('Sky passes only an exact device/agent/model reference into the existing Eve, with the same thread', () => {
  const f = fixture(),
    thread = randomUUID(),
    url = new URL(
      skyEveDevicePath(f.reference, thread),
      'https://fixture.invalid',
    );
  assert.equal(url.pathname, '/os/eve');
  assert.equal(url.searchParams.get('thread'), thread);
  const selection = readSkyEveSelection(Object.fromEntries(url.searchParams));
  assert.deepEqual(selection, { kind: 'device', ...f.reference });
  assert.equal(skyEveSelectionMatches(selection, f.device, f.agent.id), true);
  assert.deepEqual([...url.searchParams.keys()].sort(), [
    'agentHash',
    'device',
    'deviceAgent',
    'modelHash',
    'thread',
  ]);
});
void test('missing, malformed and changed selections never silently become another agent', () => {
  const f = fixture(),
    selection = { kind: 'device', ...f.reference };
  assert.deepEqual(readSkyEveSelection({}), { kind: 'none' });
  for (const values of [
    { device: f.device.deviceId },
    { device: '' },
    { device: 'https://elsewhere.invalid' },
    { device: [f.device.deviceId] },
  ])
    assert.deepEqual(readSkyEveSelection(values), { kind: 'invalid' });
  assert.equal(
    skyEveSelectionMatches({ kind: 'invalid' }, f.device, f.agent.id),
    false,
  );
  assert.equal(skyEveSelectionMatches(selection, undefined, f.agent.id), false);
  assert.equal(
    skyEveSelectionMatches(selection, f.device, randomUUID()),
    false,
  );
  assert.equal(
    skyEveSelectionMatches(
      selection,
      { ...f.device, deviceId: randomUUID() },
      f.agent.id,
    ),
    false,
  );
  assert.equal(
    skyEveSelectionMatches(
      selection,
      { ...f.device, agents: [{ ...f.agent, sha256: 'ef'.repeat(32) }] },
      f.agent.id,
    ),
    false,
  );
  assert.equal(
    skyEveSelectionMatches(
      selection,
      { ...f.device, models: [{ ...f.model, sha256: 'ef'.repeat(32) }] },
      f.agent.id,
    ),
    false,
  );
});
void test('availability is a recent device report, kept separate from authorization and execution', () => {
  const f = fixture();
  assert.equal(skyEveDeviceState(f.device, f.agent.id, 100001).available, true);
  for (const patch of [
    { updatedAt: 0 },
    { updatedAt: 140000 },
    { updatedAt: NaN },
    { phase: 'stopped' },
    { phase: 'failed' },
    { phase: 'preparing' },
    { preparedModels: [] },
    { models: [] },
    { agents: [] },
  ])
    assert.equal(
      skyEveDeviceState({ ...f.device, ...patch }, f.agent.id, 100001)
        .available,
      false,
    );
  assert.equal(
    skyEveDeviceState(f.device, f.agent.id, 130000).available,
    false,
  );
});

void test('consent belongs to one owner, target and exact role/model version', () => {
  const f = fixture(),
    key = skyEveConsentKey('alice', f.device, f.agent.id);
  assert.ok(key);
  assert.equal(
    key,
    skyEveConsentKey('alice', { ...f.device, updatedAt: 100004 }, f.agent.id),
  );
  for (const [owner, device] of [
    ['bob', f.device],
    ['alice', { ...f.device, deviceId: randomUUID() }],
    [
      'alice',
      { ...f.device, agents: [{ ...f.agent, sha256: 'ef'.repeat(32) }] },
    ],
    [
      'alice',
      { ...f.device, models: [{ ...f.model, sha256: 'ef'.repeat(32) }] },
    ],
  ])
    assert.notEqual(skyEveConsentKey(owner, device, f.agent.id), key);
  assert.equal(skyEveConsentKey('', f.device, f.agent.id), '');
  assert.equal(skyEveConsentKey('alice', undefined, f.agent.id), '');
});
