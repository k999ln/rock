import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { handleDeviceChannel } from '../services/operator-dock/src/device-channel.ts';

const encoded = (value) => Buffer.from(value).toString('base64url');
const field = (name, value) => `${name}:${Buffer.byteLength(value)}:${value}\n`;

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../services/operator-dock/migrations', import.meta.url))
    .filter((entry) => entry.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL('../services/operator-dock/migrations/' + name, import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      const prepared = sqlite.prepare(sql); let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return prepared.get(...args) || null; },
        async all() { return { success: true, results: prepared.all(...args) }; },
        async run() { return { success: true, results: [], meta: prepared.run(...args) }; },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec('COMMIT'); return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const deviceId = crypto.randomUUID();
  const now = Date.parse('2026-09-16T20:00:00Z');
  sqlite.prepare(`INSERT INTO operator_managed_devices(
    id,owner_user_id,display_name,platform,model,os_version,status,trust_state,
    channel_state,key_fingerprint,last_seen_at,created_at,updated_at,device_public_key_spki,
    attestation_record_sha256
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    deviceId, 'owner-1', 'Pixel 10', 'android', 'Pixel 10', 'RockstarOS 1.0',
    'active', 'verified', 'offline', 'sha256:device-key', null, now, now,
    encoded(keys.publicKey.export({ type: 'spki', format: 'der' })), 'sha256:attestation',
  );
  const commandId = crypto.randomUUID();
  sqlite.prepare(`INSERT INTO operator_device_commands(
    id,device_id,operator_user_id,incident_id,action,reason,status,issued_at,
    not_before,expires_at,operator_credential_id,authenticator_data,
    client_data_json,operator_signature,signed_payload_sha256
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    commandId, deviceId, 'operator-1', 'INC-1', 'lock_device', 'lost device',
    'queued', now, now, now + 900_000, 'credential', 'auth', 'client', 'signature', 'digest',
  );
  return { sqlite, db, keys, deviceId, commandId, now };
}

function signedRequest(f, path, body, nonce = encoded(crypto.getRandomValues(new Uint8Array(24)))) {
  const bytes = Buffer.from(JSON.stringify(body));
  const timestamp = String(f.now);
  const bodySha256 = encoded(createHash('sha256').update(bytes).digest());
  const canonical = Buffer.from(
    'avocadoOS-device-request/1\n' + field('method', 'POST') + field('path', path) +
    field('deviceId', f.deviceId) + field('timestamp', timestamp) +
    field('nonce', nonce) + field('bodySha256', bodySha256),
  );
  return { nonce, request: new Request(`https://operator.test${path}`, {
    method: 'POST', body: bytes,
    headers: {
      'Content-Type': 'application/json',
      'X-Avocado-Device-Id': f.deviceId,
      'X-Avocado-Device-Timestamp': timestamp,
      'X-Avocado-Device-Nonce': nonce,
      'X-Avocado-Device-Signature': encoded(sign('sha256', canonical, f.keys.privateKey)),
    },
  }) };
}

void test('signed enrolled device polls, acknowledges and records a bounded result', async () => {
  const f = fixture();
  const poll = signedRequest(f, '/api/device/v1/poll', { operation: 'poll' });
  const response = await handleDeviceChannel(poll.request, f.db, () => f.now);
  assert.equal(response.commands.length, 1);
  assert.equal(response.commands[0].id, f.commandId);
  await assert.rejects(
    () => handleDeviceChannel(signedRequest(f, '/api/device/v1/poll',
      { operation: 'poll' }, poll.nonce).request, f.db, () => f.now),
    /再送/,
  );

  const acknowledged = await handleDeviceChannel(signedRequest(f, '/api/device/v1/ack', {
    operation: 'ack', commandId: f.commandId,
  }).request, f.db, () => f.now);
  assert.equal(acknowledged.replay, false);
  const acknowledgedAgain = await handleDeviceChannel(signedRequest(f, '/api/device/v1/ack', {
    operation: 'ack', commandId: f.commandId,
  }).request, f.db, () => f.now);
  assert.equal(acknowledgedAgain.replay, true);
  const result = await handleDeviceChannel(signedRequest(f, '/api/device/v1/result', {
    operation: 'result', commandId: f.commandId, status: 'completed',
    resultCode: 'DEVICE_LOCKED', details: {
      osVersion: '15', securityPatch: '2026-09-01', batteryStatus: 2,
      batteryTemperatureDeciC: 312, availableBytes: 1000000,
      deviceOwner: true, packageVersions: {}, maintenanceExpiresAt: null,
    },
  }).request, f.db, () => f.now);
  assert.equal(result.status, 'completed');
  const resultAgain = await handleDeviceChannel(signedRequest(f, '/api/device/v1/result', {
    operation: 'result', commandId: f.commandId, status: 'completed',
    resultCode: 'DEVICE_LOCKED', details: {
      osVersion: '15', securityPatch: '2026-09-01', batteryStatus: 2,
      batteryTemperatureDeciC: 312, availableBytes: 1000000,
      deviceOwner: true, packageVersions: {}, maintenanceExpiresAt: null,
    },
  }).request, f.db, () => f.now);
  assert.equal(resultAgain.replay, true);
  assert.equal(f.sqlite.prepare('SELECT status FROM operator_device_commands').get().status, 'completed');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM operator_audit_events').get().n, 2);
});

void test('scheduled reset is delivered for warning but cannot be acknowledged early', async () => {
  const f = fixture();
  f.sqlite.prepare(`UPDATE operator_device_commands SET action='request_factory_reset',
    status='scheduled',not_before=?,expires_at=? WHERE id=?`).run(
    f.now + 1_800_000, f.now + 3_600_000, f.commandId,
  );
  const poll = await handleDeviceChannel(signedRequest(f, '/api/device/v1/poll', {
    operation: 'poll',
  }).request, f.db, () => f.now);
  assert.equal(poll.commands[0].status, 'scheduled');
  await assert.rejects(
    () => handleDeviceChannel(signedRequest(f, '/api/device/v1/ack', {
      operation: 'ack', commandId: f.commandId,
    }).request, f.db, () => f.now),
    /受領状態/,
  );
});

void test('device channel rejects a server-only or altered request', async () => {
  const f = fixture();
  const signed = signedRequest(f, '/api/device/v1/poll', { operation: 'poll' });
  const headers = new Headers(signed.request.headers);
  headers.set('X-Avocado-Device-Signature', encoded(Buffer.alloc(70, 3)));
  const altered = new Request(signed.request.url, {
    method: 'POST', headers, body: JSON.stringify({ operation: 'poll' }),
  });
  await assert.rejects(
    () => handleDeviceChannel(altered, f.db, () => f.now),
    /署名/,
  );
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM operator_device_request_nonces').get().n, 0);
});
