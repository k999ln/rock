import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import {
  EsimBootstrap,
  FixtureEsimProvider,
  verifyFixtureBootstrap,
  verifyEsimGoV3Callback,
  LEASE_MS,
} from '../toolkits/esim-bootstrap/core.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'esim-test-'));
  const keys = generateKeyPairSync('ed25519');
  const provider = new FixtureEsimProvider(join(dir, 'provider.sqlite'));
  const options = {
    filename: join(dir, 'rock.sqlite'),
    provider,
    ...keys,
    now: () => 1_000_000,
  };
  let service = new EsimBootstrap(options);
  t.after(() => {
    service.close();
    provider.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    get service() {
      return service;
    },
    provider,
    keys,
    options,
    restart() {
      service.close();
      service = new EsimBootstrap(options);
      return service;
    },
  };
}
const caps = {
  esimSupported: true,
  receiverInstalled: true,
  localRuntimePresent: true,
  modelAssetsVerified: true,
};
async function enabled(f, pack = 'lifeline') {
  const row = f.service.createFixtureEnrollment('alice', 'request', pack);
  await f.service.provision('alice', row.id);
  f.provider.setState(row.id, 'enabled');
  await f.service.reconcile('alice', row.id);
  f.service.registerFixtureDevice('alice', 'phone', caps);
  return row.id;
}
function verifyPlan(f, id, envelope, override = {}) {
  return verifyFixtureBootstrap(envelope, f.keys.publicKey, {
    owner: 'alice',
    enrollmentId: id,
    deviceId: 'phone',
    now: 1_000_000,
    ...override,
  });
}

void test('eSIM activation produces an owner/device-bound, offline-verifiable configuration', async (t) => {
  const f = setup(t);
  const id = await enabled(f);
  const envelope = f.service.bootstrap('alice', id, 'phone');
  const plan = verifyPlan(f, id, envelope);
  assert.equal(plan.environment, 'fixture');
  assert.deepEqual(plan.defaultAgentRequests, [
    'fixture.offline-guide',
    'fixture.personal-notes',
  ]);
  assert.equal(plan.grantsExecutionPermission, false);
  assert.equal(plan.grantsOsInstallPermission, false);
  assert.equal(plan.localAi, 'inference_test_required');
  assert.equal(plan.cloudAi, 'provider_connection_required');
  assert.equal(plan.allowAdditionalSkySelections, true);
  assert.deepEqual(
    f.service.validateOnline('alice', id, 'phone', envelope),
    plan,
  );
});
void test('packs change defaults; repeated requests are stable and payload changes conflict', (t) => {
  const f = setup(t);
  const a = f.service.createFixtureEnrollment('alice', 'same', 'lifeline');
  assert.equal(
    f.service.createFixtureEnrollment('alice', 'same', 'lifeline').id,
    a.id,
  );
  assert.throws(
    () => f.service.createFixtureEnrollment('alice', 'same', 'developer'),
    /IDEMPOTENCY_CONFLICT/,
  );
  assert.notEqual(
    f.service.createFixtureEnrollment('bob', 'same', 'developer').id,
    a.id,
  );
  assert.throws(
    () => f.service.createFixtureEnrollment('alice', 'other', 'unknown'),
    /UNKNOWN_PACK/,
  );
});
void test('developer pack uses different initial requests', async (t) => {
  const f = setup(t);
  const id = await enabled(f, 'developer');
  const plan = verifyPlan(f, id, f.service.bootstrap('alice', id, 'phone'));
  assert.deepEqual(plan.defaultAgentRequests, [
    'fixture.code-assistant',
    'fixture.test-runner',
  ]);
});
void test('concurrent provisioning crosses provider issue boundary only once', async (t) => {
  const f = setup(t);
  const row = f.service.createFixtureEnrollment('alice', 'same', 'lifeline');
  let count = 0;
  const original = f.provider.issue.bind(f.provider);
  f.provider.issue = async (id) => {
    count++;
    return original(id);
  };
  await Promise.all(
    Array.from({ length: 8 }, () => f.service.provision('alice', row.id)),
  );
  assert.equal(count, 1);
  assert.equal(f.service.enrollment('alice', row.id).state, 'issued');
});
void test('lost issue response survives restart and reconciles without second purchase', async (t) => {
  const f = setup(t);
  const row = f.service.createFixtureEnrollment('alice', 'same', 'lifeline');
  let count = 0;
  const original = f.provider.issue.bind(f.provider);
  f.provider.issue = async (id) => {
    count++;
    await original(id);
    throw new Error('secret activation code');
  };
  const result = await f.service.provision('alice', row.id);
  assert.equal(result.state, 'reconciliation_required');
  assert.ok(!JSON.stringify(result).includes('secret'));
  f.restart();
  await f.service.provision('alice', row.id);
  assert.equal(count, 1);
  assert.equal((await f.service.reconcile('alice', row.id)).state, 'issued');
});
void test('crash in issuing state is reconciled, never automatically reissued', async (t) => {
  const f = setup(t);
  const row = f.service.createFixtureEnrollment('alice', 'same', 'lifeline');
  f.service.db
    .prepare("UPDATE esim_enrollments SET state = 'issuing' WHERE id = ?")
    .run(row.id);
  await f.provider.issue(row.id);
  f.restart();
  f.provider.issue = () => {
    throw new Error('must not issue');
  };
  assert.equal((await f.service.provision('alice', row.id)).state, 'issuing');
  assert.equal((await f.service.reconcile('alice', row.id)).state, 'issued');
});
void test('empty reconciliation does not authorize retry of an unknown create', async (t) => {
  const f = setup(t);
  const row = f.service.createFixtureEnrollment('alice', 'same', 'lifeline');
  let count = 0;
  f.provider.issue = () => {
    count++;
    throw new Error('timeout');
  };
  await f.service.provision('alice', row.id);
  assert.equal(
    (await f.service.reconcile('alice', row.id)).state,
    'reconciliation_required',
  );
  await f.service.provision('alice', row.id);
  assert.equal(count, 1);
});
void test('cross-owner enrollment and device access are rejected', async (t) => {
  const f = setup(t);
  const id = await enabled(f);
  assert.throws(() => f.service.enrollment('bob', id), /NOT_FOUND/);
  await assert.rejects(f.service.provision('bob', id), /NOT_FOUND/);
  await assert.rejects(f.service.reconcile('bob', id), /NOT_FOUND/);
  assert.throws(() => f.service.revoke('bob', id), /NOT_FOUND/);
  assert.throws(
    () => f.service.registerFixtureDevice('bob', 'phone', caps),
    /OWNERSHIP_CONFLICT/,
  );
  f.service.registerFixtureDevice('bob', 'other-phone', caps);
  assert.throws(
    () => f.service.bootstrap('alice', id, 'other-phone'),
    /DEVICE_NOT_FOUND/,
  );
});
void test('issued is not enabled; eSIM capability is mandatory', async (t) => {
  const f = setup(t);
  const row = f.service.createFixtureEnrollment('alice', 'same', 'lifeline');
  await f.service.provision('alice', row.id);
  f.service.registerFixtureDevice('alice', 'phone', caps);
  assert.throws(
    () => f.service.bootstrap('alice', row.id, 'phone'),
    /ESIM_NOT_ENABLED/,
  );
  f.provider.setState(row.id, 'enabled');
  await f.service.reconcile('alice', row.id);
  f.service.registerFixtureDevice('alice', 'phone', {
    ...caps,
    esimSupported: false,
  });
  assert.throws(
    () => f.service.bootstrap('alice', row.id, 'phone'),
    /ESIM_UNSUPPORTED/,
  );
});
void test('missing receiver/model is reported as setup required, never silently installed', async (t) => {
  const f = setup(t);
  const id = await enabled(f);
  f.service.registerFixtureDevice('alice', 'phone', {
    ...caps,
    receiverInstalled: false,
  });
  let plan = verifyPlan(f, id, f.service.bootstrap('alice', id, 'phone'));
  assert.equal(plan.setup, 'receiver_install_required');
  assert.equal(plan.localAi, 'runtime_required');
  f.service.registerFixtureDevice('alice', 'phone', {
    ...caps,
    modelAssetsVerified: false,
  });
  plan = verifyPlan(f, id, f.service.bootstrap('alice', id, 'phone'));
  assert.equal(plan.localAi, 'assets_required');
});
void test('tampered, wrong-key and cross-device bootstrap envelopes are rejected', async (t) => {
  const f = setup(t);
  const id = await enabled(f);
  const envelope = f.service.bootstrap('alice', id, 'phone');
  const tampered = {
    ...envelope,
    payload: Buffer.from('{}').toString('base64url'),
  };
  assert.throws(() => verifyPlan(f, id, tampered), /INVALID_SIGNATURE/);
  const otherKey = generateKeyPairSync('ed25519').publicKey;
  assert.throws(
    () => verifyFixtureBootstrap(envelope, otherKey, {}),
    /INVALID_SIGNATURE/,
  );
  assert.throws(
    () => verifyPlan(f, id, envelope, { deviceId: 'other' }),
    /BINDING_MISMATCH/,
  );
  assert.throws(
    () => verifyPlan(f, id, envelope, { owner: 'bob' }),
    /BINDING_MISMATCH/,
  );
});
void test('offline lease has a fixed expiry and refuses backward clock relative to issuance', async (t) => {
  const f = setup(t);
  const id = await enabled(f);
  const envelope = f.service.bootstrap('alice', id, 'phone');
  assert.throws(
    () => verifyPlan(f, id, envelope, { now: 1_000_000 + LEASE_MS }),
    /EXPIRED/,
  );
  assert.throws(() => verifyPlan(f, id, envelope, { now: 999_999 }), /EXPIRED/);
  assert.throws(() => verifyPlan(f, id, envelope, { now: NaN }), /EXPIRED/);
});
void test('revocation blocks online renewal; offline cache only expires at its lease boundary', async (t) => {
  const f = setup(t);
  const id = await enabled(f);
  const envelope = f.service.bootstrap('alice', id, 'phone');
  f.service.revoke('alice', id);
  assert.throws(
    () => f.service.bootstrap('alice', id, 'phone'),
    /ACCESS_REVOKED/,
  );
  assert.throws(
    () => f.service.validateOnline('alice', id, 'phone', envelope),
    /BOOTSTRAP_REVOKED/,
  );
  f.provider.setState(id, 'enabled');
  await f.service.reconcile('alice', id);
  assert.equal(f.service.enrollment('alice', id).access, 'revoked');
  assert.equal(verifyPlan(f, id, envelope).pack, 'lifeline');
});
void test('disable/delete and stale or conflicting receipts cannot silently revive access', async (t) => {
  const f = setup(t);
  const id = await enabled(f);
  const old = await f.provider.lookup(id);
  const envelope = f.service.bootstrap('alice', id, 'phone');
  f.provider.setState(id, 'disabled');
  await f.service.reconcile('alice', id);
  assert.throws(
    () => f.service.applyReceipt('alice', id, old),
    /STALE_PROVIDER_RECEIPT/,
  );
  assert.throws(
    () => f.service.validateOnline('alice', id, 'phone', envelope),
    /BOOTSTRAP_REVOKED/,
  );
  const current = await f.provider.lookup(id);
  assert.throws(
    () => f.service.applyReceipt('alice', id, { ...current, state: 'enabled' }),
    /VERSION_CONFLICT/,
  );
  assert.throws(
    () =>
      f.service.applyReceipt('alice', id, { ...current, profileRef: 'other' }),
    /PROFILE_CHANGED/,
  );
  assert.throws(
    () =>
      f.service.applyReceipt('alice', id, {
        ...current,
        enrollmentId: 'other',
      }),
    /BINDING_MISMATCH/,
  );
  f.provider.setState(id, 'deleted');
  await f.service.reconcile('alice', id);
  f.provider.setState(id, 'enabled');
  await assert.rejects(f.service.reconcile('alice', id), /PROFILE_DELETED/);
});
void test('device input and real provider mode fail closed', (t) => {
  const f = setup(t);
  assert.throws(
    () =>
      f.service.registerFixtureDevice('alice', 'phone', {
        ...caps,
        modelAssetsVerified: 'yes',
      }),
    /INVALID_CAPABILITIES/,
  );
  assert.throws(
    () => new EsimBootstrap({ ...f.options, provider: { mode: 'live' } }),
    /REAL_PROVIDER_NOT_IMPLEMENTED/,
  );
});

void test('eSIM Go V3 callbacks verify raw-body HMAC, dedupe, and store no subscriber identifiers', (t) => {
  const f = setup(t);
  const key = 'fixture-api-key-do-not-use-in-production';
  const dedupeSecret = 'fixture-private-dedupe-secret-never-use-in-production';
  const iccid = '89445385320081602222';
  const raw = Buffer.from(JSON.stringify({
    alertType: 'usage',
    iccid,
    bundle: { name: 'fixture-plan', remainingQuantity: 500 },
  }));
  const signature = createHmac('sha256', key).update(raw).digest('base64');
  assert.deepEqual(verifyEsimGoV3Callback(raw, signature, key), {
    eventType: 'usage', rawBody: raw,
  });
  assert.deepEqual(f.service.receiveEsimGoV3Callback(raw, signature, key, dedupeSecret, 1_000_001), {
    status: 'accepted', eventType: 'usage',
  });
  assert.deepEqual(f.service.receiveEsimGoV3Callback(raw, signature, key, dedupeSecret, 1_000_002), {
    status: 'duplicate', eventType: 'usage',
  });
  const rows = f.service.db.prepare('SELECT * FROM esim_provider_event_inbox').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'received');
  assert.equal(JSON.stringify(rows).includes(iccid), false);
  assert.equal(JSON.stringify(rows).includes(raw.toString()), false);
  assert.throws(
    () => f.service.receiveEsimGoV3Callback(raw, `${signature.slice(0, -2)}AA`, key, dedupeSecret),
    /CALLBACK_SIGNATURE_MISMATCH|INVALID_CALLBACK_SIGNATURE/,
  );
  assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM esim_provider_event_inbox').get().n, 1);
});

void test('eSIM Go V3 callback parsing occurs only after signature verification and enforces bounds', (t) => {
  const f = setup(t);
  const key = 'fixture-api-key-do-not-use-in-production';
  const malformed = Buffer.from('{"alertType":');
  const badSignature = createHmac('sha256', key).update('different').digest('base64');
  assert.throws(() => verifyEsimGoV3Callback(malformed, badSignature, key), /CALLBACK_SIGNATURE_MISMATCH/);
  const validSignature = createHmac('sha256', key).update(malformed).digest('base64');
  assert.throws(() => verifyEsimGoV3Callback(malformed, validSignature, key), /INVALID_CALLBACK_BODY/);
  assert.throws(() => verifyEsimGoV3Callback(Buffer.alloc(64 * 1024 + 1), validSignature, key), /INVALID_CALLBACK_SIZE/);
  const badType = Buffer.from('{"alertType":"eSIM usage"}');
  const badTypeSignature = createHmac('sha256', key).update(badType).digest('base64');
  assert.throws(() => verifyEsimGoV3Callback(badType, badTypeSignature, key), /INVALID_CALLBACK_EVENT_TYPE/);
  assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM esim_provider_event_inbox').get().n, 0);
});
