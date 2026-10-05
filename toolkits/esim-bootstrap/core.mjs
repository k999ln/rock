import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomUUID, sign, timingSafeEqual, verify } from 'node:crypto';

// Host-only development contract. These identifiers are NOT published Sky tools.
const PACKS = Object.freeze({
  lifeline: ['fixture.offline-guide', 'fixture.personal-notes'],
  developer: ['fixture.code-assistant', 'fixture.test-runner'],
});
const PROFILE_STATES = ['issued', 'enabled', 'disabled', 'deleted'];
export const LEASE_MS = 60 * 60 * 1000;
export const MAX_CALLBACK_BYTES = 64 * 1024;

/** Verify eSIM Go Callback V3 over the exact raw body before parsing it. */
export function verifyEsimGoV3Callback(rawBody, signatureHeader, apiKey) {
  demand((Buffer.isBuffer(rawBody) || rawBody instanceof Uint8Array)
    && rawBody.byteLength > 0 && rawBody.byteLength <= MAX_CALLBACK_BYTES,
  'INVALID_CALLBACK_SIZE');
  demand(typeof apiKey === 'string' && apiKey.length > 0 && apiKey.length <= 512,
    'CALLBACK_SECRET_REQUIRED');
  demand(typeof signatureHeader === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(signatureHeader),
    'INVALID_CALLBACK_SIGNATURE');
  const received = Buffer.from(signatureHeader, 'base64');
  demand(received.length === 32 && received.toString('base64') === signatureHeader,
    'INVALID_CALLBACK_SIGNATURE');
  const expected = createHmac('sha256', apiKey).update(rawBody).digest();
  demand(timingSafeEqual(expected, received), 'CALLBACK_SIGNATURE_MISMATCH');
  let event;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(rawBody);
    event = JSON.parse(text);
  } catch {
    throw new Error('INVALID_CALLBACK_BODY');
  }
  demand(event && typeof event === 'object' && !Array.isArray(event), 'INVALID_CALLBACK_BODY');
  demand(typeof event.alertType === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(event.alertType),
    'INVALID_CALLBACK_EVENT_TYPE');
  return { eventType: event.alertType, rawBody };
}

function demand(ok, code) {
  if (!ok) throw new Error(code);
}
function identifier(value) {
  demand(
    typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value),
    'INVALID_ID',
  );
  return value;
}
function packExists(pack) {
  demand(Object.hasOwn(PACKS, pack), 'UNKNOWN_PACK');
}

export class EsimBootstrap {
  constructor({ filename, provider, privateKey, publicKey, now = Date.now }) {
    // No network provider, payment, HTTP auth, or production enrollment is enabled.
    demand(provider?.mode === 'fixture', 'REAL_PROVIDER_NOT_IMPLEMENTED');
    this.provider = provider;
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.now = now;
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS esim_enrollments (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL,
        pack TEXT NOT NULL, state TEXT NOT NULL, profile_ref TEXT UNIQUE,
        provider_version INTEGER NOT NULL DEFAULT 0,
        access TEXT NOT NULL DEFAULT 'active', generation INTEGER NOT NULL DEFAULT 1,
        UNIQUE(owner, request_key)
      );
      CREATE TABLE IF NOT EXISTS esim_devices (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, capabilities TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS esim_provider_event_inbox (
        callback_digest TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider = 'esim-go-v3'),
        event_type TEXT NOT NULL, received_at INTEGER NOT NULL CHECK(received_at >= 0),
        state TEXT NOT NULL CHECK(state IN ('received', 'reconciliation_required'))
      );
    `);
  }
  close() {
    this.db.close();
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  enrollment(owner, id) {
    identifier(owner);
    identifier(id);
    const row = this.db
      .prepare('SELECT * FROM esim_enrollments WHERE id = ? AND owner = ?')
      .get(id, owner);
    demand(row, 'ENROLLMENT_NOT_FOUND');
    return { ...row };
  }
  // Caller identity is supplied by the test harness, not by an HTTP request.
  // Production must replace this fixture grant with verified Sky order entitlement.
  createFixtureEnrollment(owner, requestKey, pack) {
    identifier(owner);
    identifier(requestKey);
    packExists(pack);
    return this.transaction(() => {
      const existing = this.db
        .prepare(
          'SELECT * FROM esim_enrollments WHERE owner = ? AND request_key = ?',
        )
        .get(owner, requestKey);
      if (existing) {
        demand(existing.pack === pack, 'IDEMPOTENCY_CONFLICT');
        return { ...existing };
      }
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO esim_enrollments(id, owner, request_key, pack, state) VALUES (?, ?, ?, ?, 'requested')",
        )
        .run(id, owner, requestKey, pack);
      return this.enrollment(owner, id);
    });
  }
  async provision(owner, id) {
    const shouldIssue = this.transaction(() => {
      const row = this.enrollment(owner, id);
      demand(row.access === 'active', 'ACCESS_REVOKED');
      if (row.state !== 'requested') return false;
      // Persist before the external boundary. Crash/lost response must not re-issue.
      this.db
        .prepare("UPDATE esim_enrollments SET state = 'issuing' WHERE id = ?")
        .run(id);
      return true;
    });
    if (!shouldIssue) return this.enrollment(owner, id);
    try {
      const receipt = await this.provider.issue(id);
      this.applyReceipt(owner, id, receipt);
    } catch {
      // Never include a provider error/activation secret in public state or logs.
      this.db
        .prepare(
          "UPDATE esim_enrollments SET state = 'reconciliation_required' WHERE id = ? AND state = 'issuing'",
        )
        .run(id);
    }
    return this.enrollment(owner, id);
  }
  applyReceipt(owner, id, receipt) {
    demand(receipt && receipt.enrollmentId === id, 'PROVIDER_BINDING_MISMATCH');
    identifier(receipt.profileRef);
    demand(PROFILE_STATES.includes(receipt.state), 'INVALID_PROVIDER_STATE');
    demand(
      Number.isSafeInteger(receipt.version) && receipt.version > 0,
      'INVALID_PROVIDER_VERSION',
    );
    return this.transaction(() => {
      const row = this.enrollment(owner, id);
      demand(row.state !== 'requested', 'NOT_PROVISIONED');
      demand(
        !row.profile_ref || row.profile_ref === receipt.profileRef,
        'PROFILE_CHANGED',
      );
      demand(receipt.version >= row.provider_version, 'STALE_PROVIDER_RECEIPT');
      if (receipt.version === row.provider_version) {
        demand(receipt.state === row.state, 'PROVIDER_VERSION_CONFLICT');
        return row;
      }
      demand(
        row.state !== 'deleted' || receipt.state === 'deleted',
        'PROFILE_DELETED',
      );
      this.db
        .prepare(`UPDATE esim_enrollments SET state = ?, profile_ref = ?,
        provider_version = ?, generation = generation + 1 WHERE id = ?`)
        .run(receipt.state, receipt.profileRef, receipt.version, id);
      return this.enrollment(owner, id);
    });
  }
  async reconcile(owner, id) {
    this.enrollment(owner, id);
    const receipt = await this.provider.lookup(id);
    // Absence is not proof that an earlier remote create did not happen.
    if (receipt) this.applyReceipt(owner, id, receipt);
    return this.enrollment(owner, id);
  }
  /**
   * Store a signed callback as a reconciliation hint. The payload/ICCID is never persisted and
   * callbacks do not directly grant, renew, or revoke service; status must be pulled from the
   * provider API and matched to the existing owner/order before changing entitlement.
   */
  receiveEsimGoV3Callback(rawBody, signatureHeader, apiKey, dedupeSecret, now = this.now()) {
    demand(Number.isSafeInteger(now) && now >= 0, 'INVALID_CLOCK');
    demand(typeof dedupeSecret === 'string' && dedupeSecret.length >= 32 && dedupeSecret.length <= 512,
      'CALLBACK_DEDUPE_SECRET_REQUIRED');
    const callback = verifyEsimGoV3Callback(rawBody, signatureHeader, apiKey);
    const callbackDigest = createHmac('sha256', dedupeSecret)
      .update('rockstar-esim-go-callback-inbox-v1\0')
      .update(callback.rawBody)
      .digest('hex');
    return this.transaction(() => {
      const existing = this.db.prepare(
        'SELECT event_type FROM esim_provider_event_inbox WHERE callback_digest = ?',
      ).get(callbackDigest);
      if (existing) return { status: 'duplicate', eventType: existing.event_type };
      this.db.prepare(`INSERT INTO esim_provider_event_inbox
        (callback_digest, provider, event_type, received_at, state)
        VALUES (?, 'esim-go-v3', ?, ?, 'received')`)
        .run(callbackDigest, callback.eventType, now);
      return { status: 'accepted', eventType: callback.eventType };
    });
  }
  revoke(owner, id) {
    return this.transaction(() => {
      const row = this.enrollment(owner, id);
      if (row.access === 'active')
        this.db
          .prepare(
            "UPDATE esim_enrollments SET access = 'revoked', generation = generation + 1 WHERE id = ?",
          )
          .run(id);
      return this.enrollment(owner, id);
    });
  }
  registerFixtureDevice(owner, deviceId, capabilities) {
    identifier(owner);
    identifier(deviceId);
    const keys = [
      'esimSupported',
      'receiverInstalled',
      'localRuntimePresent',
      'modelAssetsVerified',
    ];
    demand(
      capabilities &&
        Object.keys(capabilities).length === keys.length &&
        keys.every((key) => typeof capabilities[key] === 'boolean'),
      'INVALID_CAPABILITIES',
    );
    this.transaction(() => {
      const existing = this.db
        .prepare('SELECT owner FROM esim_devices WHERE id = ?')
        .get(deviceId);
      demand(
        !existing || existing.owner === owner,
        'DEVICE_OWNERSHIP_CONFLICT',
      );
      this.db
        .prepare(`INSERT INTO esim_devices(id, owner, capabilities) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET capabilities = excluded.capabilities`)
        .run(deviceId, owner, JSON.stringify(capabilities));
    });
  }
  bootstrap(owner, id, deviceId) {
    identifier(deviceId);
    const row = this.enrollment(owner, id);
    demand(row.access === 'active', 'ACCESS_REVOKED');
    demand(row.state === 'enabled', 'ESIM_NOT_ENABLED');
    const device = this.db
      .prepare('SELECT * FROM esim_devices WHERE id = ? AND owner = ?')
      .get(deviceId, owner);
    demand(device, 'DEVICE_NOT_FOUND');
    const caps = JSON.parse(device.capabilities);
    demand(caps.esimSupported, 'ESIM_UNSUPPORTED');
    const issuedAt = this.now();
    demand(Number.isSafeInteger(issuedAt) && issuedAt >= 0, 'INVALID_CLOCK');
    const payload = {
      schema: 'rockstar-esim-bootstrap-fixture/1',
      environment: 'fixture',
      enrollmentId: id,
      owner,
      deviceId,
      generation: row.generation,
      issuedAt,
      expiresAt: issuedAt + LEASE_MS,
      pack: row.pack,
      defaultAgentRequests: [...PACKS[row.pack]],
      allowAdditionalSkySelections: true,
      setup: caps.receiverInstalled
        ? 'receiver_ready'
        : 'receiver_install_required',
      localAi:
        !caps.receiverInstalled || !caps.localRuntimePresent
          ? 'runtime_required'
          : !caps.modelAssetsVerified
            ? 'assets_required'
            : 'inference_test_required',
      cloudAi: 'provider_connection_required',
      grantsExecutionPermission: false,
      grantsOsInstallPermission: false,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return {
      payload: encoded,
      signature: sign(null, Buffer.from(encoded), this.privateKey).toString(
        'base64url',
      ),
    };
  }
  validateOnline(owner, id, deviceId, envelope) {
    const payload = verifyFixtureBootstrap(envelope, this.publicKey, {
      owner,
      enrollmentId: id,
      deviceId,
      now: this.now(),
    });
    const row = this.enrollment(owner, id);
    demand(
      row.access === 'active' &&
        row.state === 'enabled' &&
        row.generation === payload.generation,
      'BOOTSTRAP_REVOKED',
    );
    return payload;
  }
}

export function verifyFixtureBootstrap(
  envelope,
  publicKey,
  { owner, enrollmentId, deviceId, now },
) {
  demand(
    envelope &&
      typeof envelope.payload === 'string' &&
      envelope.payload.length <= 16384 &&
      typeof envelope.signature === 'string' &&
      envelope.signature.length <= 256,
    'INVALID_ENVELOPE',
  );
  demand(
    verify(
      null,
      Buffer.from(envelope.payload),
      publicKey,
      Buffer.from(envelope.signature, 'base64url'),
    ),
    'INVALID_SIGNATURE',
  );
  const data = JSON.parse(
    Buffer.from(envelope.payload, 'base64url').toString(),
  );
  demand(
    data.schema === 'rockstar-esim-bootstrap-fixture/1' &&
      data.environment === 'fixture',
    'INVALID_SCHEMA',
  );
  demand(
    data.owner === owner &&
      data.deviceId === deviceId &&
      data.enrollmentId === enrollmentId,
    'BOOTSTRAP_BINDING_MISMATCH',
  );
  demand(
    Number.isSafeInteger(now) &&
      Number.isSafeInteger(data.issuedAt) &&
      Number.isSafeInteger(data.expiresAt) &&
      data.expiresAt - data.issuedAt === LEASE_MS &&
      now >= data.issuedAt &&
      now < data.expiresAt,
    'BOOTSTRAP_EXPIRED',
  );
  demand(
    data.grantsExecutionPermission === false &&
      data.grantsOsInstallPermission === false,
    'INVALID_AUTHORITY',
  );
  return data;
}

// A persistent fake provider lets tests reproduce a crash after issue but before receipt.
// It returns no SM-DP+ URL, LPA activation code, ICCID, phone number or usable QR.
export class FixtureEsimProvider {
  mode = 'fixture';
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`CREATE TABLE IF NOT EXISTS fixture_profiles (
      enrollment_id TEXT PRIMARY KEY, profile_ref TEXT UNIQUE NOT NULL,
      state TEXT NOT NULL, version INTEGER NOT NULL
    )`);
  }
  close() {
    this.db.close();
  }
  async issue(enrollmentId) {
    identifier(enrollmentId);
    const profileRef =
      'fixture-' +
      createHash('sha256').update(enrollmentId).digest('hex').slice(0, 24);
    this.db
      .prepare(
        "INSERT OR IGNORE INTO fixture_profiles VALUES (?, ?, 'issued', 1)",
      )
      .run(enrollmentId, profileRef);
    return this.lookup(enrollmentId);
  }
  async lookup(enrollmentId) {
    const row = this.db
      .prepare('SELECT * FROM fixture_profiles WHERE enrollment_id = ?')
      .get(enrollmentId);
    return row
      ? {
          enrollmentId: row.enrollment_id,
          profileRef: row.profile_ref,
          state: row.state,
          version: row.version,
        }
      : null;
  }
  setState(enrollmentId, state) {
    demand(PROFILE_STATES.includes(state), 'INVALID_PROVIDER_STATE');
    const result = this.db
      .prepare(
        'UPDATE fixture_profiles SET state = ?, version = version + 1 WHERE enrollment_id = ?',
      )
      .run(state, enrollmentId);
    demand(result.changes === 1, 'PROFILE_NOT_FOUND');
  }
}
