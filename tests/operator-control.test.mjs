import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { operatorControl } from '../lib/operator-control.ts';
import { OperationError } from '../lib/operations.ts';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../drizzle', import.meta.url))
    .filter((entry) => entry.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
  let now = Date.parse('2026-09-15T18:00:00Z');
  const db = {
    prepare(sql) {
      const prepared = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return prepared.get(...args) || null; },
        async all() { return { success: true, results: prepared.all(...args) }; },
        async run() { const meta = prepared.run(...args); return { success: true, results: [], meta }; },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const deviceId = crypto.randomUUID();
  sqlite.prepare(`INSERT INTO operator_managed_devices(
    id,owner_user_id,display_name,platform,model,os_version,status,
    trust_state,channel_state,key_fingerprint,last_seen_at,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    deviceId,'owner-1','Pixel 10','android','Pixel 10','avocadoOS 1.0',
    'active','verified','connected','sha256:device-key',now,now,now,
  );
  return {
    sqlite,
    deviceId,
    control: operatorControl(db, 'operator-1', 'operator-1', () => now),
    advance(ms) { now += ms; },
  };
}

const request = (deviceId, changes = {}) => ({
  operation: 'issue',
  id: crypto.randomUUID(),
  deviceId,
  incidentId: 'INC-2026-001',
  action: 'lock_device',
  reason: '紛失の申告を受けたため',
  ...changes,
});

void test('only the configured operator can open the management plane', () => {
  const { control } = fixture();
  assert.ok(control);
  assert.throws(
    () => operatorControl({}, 'attacker', 'operator-1'),
    (error) => error instanceof OperationError && error.status === 403,
  );
  assert.throws(
    () => operatorControl({}, 'operator-1', ''),
    (error) => error instanceof OperationError && error.status === 503,
  );
});

void test('verified devices accept only allowlisted bounded emergency commands', async () => {
  const { control, deviceId, sqlite } = fixture();
  const input = request(deviceId);
  const first = await control.issue(input);
  const replay = await control.issue(input);
  assert.equal(first.command.status, 'queued');
  assert.equal(replay.replay, true);
  assert.equal((await control.overview()).devices[0].online, true);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM operator_audit_events').get().n, 1);
  await assert.rejects(
    () => control.issue(request(deviceId, { action: 'root_shell' })),
    /許可されていない/,
  );
  await assert.rejects(
    () => control.issue({ ...input, action: 'enter_lost_mode' }),
    (error) => error instanceof OperationError && error.status === 409,
  );
});

void test('maintenance expires in fifteen minutes and reset has a cancellation window', async () => {
  const { control, deviceId } = fixture();
  const maintenance = await control.issue(
    request(deviceId, { action: 'open_limited_maintenance_session' }),
  );
  assert.equal(maintenance.command.expiresAt - maintenance.command.issuedAt, 15 * 60_000);
  const reset = await control.issue(
    request(deviceId, { action: 'request_factory_reset' }),
  );
  assert.equal(reset.command.status, 'scheduled');
  assert.equal(reset.command.notBefore - reset.command.issuedAt, 30 * 60_000);
  const cancelled = await control.cancel({
    operation: 'cancel',
    id: reset.command.id,
    incidentId: reset.command.incidentId,
  });
  assert.equal(cancelled.command.status, 'cancelled');
});

void test('unverified devices and mutable audit history fail closed', async () => {
  const { control, deviceId, sqlite } = fixture();
  sqlite.prepare("UPDATE operator_managed_devices SET trust_state='pending'").run();
  await assert.rejects(
    () => control.issue(request(deviceId)),
    (error) => error instanceof OperationError && error.status === 409,
  );
  sqlite.prepare("UPDATE operator_managed_devices SET trust_state='verified'").run();
  await control.issue(request(deviceId));
  assert.throws(
    () => sqlite.prepare('DELETE FROM operator_audit_events').run(),
    /immutable/,
  );
});
