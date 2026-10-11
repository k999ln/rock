// Shared harness for the persistent Compute Grid tests: a real D1 (Miniflare)
// with the real migrations, plus simulated devices that hold a P-256 key the
// way an enrolled Android Broker does and sign every request with it.
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { a2aBrokerDeviceKeyResolver } from '../lib/a2a-broker-trust.ts';
import {
  COMPUTE_GRID_ATTESTATION_AUTHORITY,
  COMPUTE_GRID_DEVICE_REQUEST_SCHEMA,
  computeGridDeviceSigningBytes,
  parseComputeOrder,
  verifyComputeGridDeviceRequest,
} from '../lib/sky-compute-grid-live.ts';
import { skyComputeGridStore } from '../lib/sky-compute-grid-store.ts';
import {
  COMPUTE_SKUS,
  LEXICAL_EMBEDDING_SKU,
  decodeLotInput,
} from '../lib/sky-compute-grid-skus.ts';

export const DATA_KEY = 'ab'.repeat(32);
export const START = Date.UTC(2026, 9, 11, 3, 0, 0);
const MIGRATIONS = ['0048_rockstar_a2a_broker_enrollment.sql', '0063_sky_compute_grid.sql'];
const TABLES = [
  'sky_compute_assignments', 'sky_compute_credit_accounts', 'sky_compute_credit_entries',
  'sky_compute_leases', 'sky_compute_lots', 'sky_compute_offers', 'sky_compute_orders',
  'sky_compute_receipts', 'rockstar_a2a_broker_devices', 'rockstar_a2a_broker_enrollment_challenges',
];

export async function openGridDatabase() {
  const worker = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("Sky Compute Grid D1 fixture")}}',
    compatibilityDate: '2026-08-18',
    d1Databases: ['DB'],
    host: '127.0.0.1',
    port: 0,
  }));
  const db = await worker.getD1Database('DB');
  async function reset() {
    for (const table of TABLES) await db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    for (const name of MIGRATIONS) {
      const sql = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8');
      for (const statement of sql.split('--> statement-breakpoint').filter((part) => part.trim()))
        await db.prepare(statement).run();
    }
  }
  await reset();
  return { db, reset, dispose: () => worker.dispose() };
}

export const b64 = (bytes) => Buffer.from(bytes).toString('base64');
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** An enrolled device: owner, device reference and an attested hardware key. */
export async function enrollDevice(db, ownerUserId, { now = START, status = 'active' } = {}) {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  const keyId = sha256(raw);
  const deviceRef = randomUUID();
  await db.prepare(`INSERT INTO rockstar_a2a_broker_devices
      (authority_id, owner_user_id, device_ref, key_id, algorithm, public_key_hex, public_key_sha256,
       application_package, minimum_application_version, signing_certificate_sha256, security_level,
       verified_boot_state, attested_at, registered_at, status, revoked_at)
    VALUES (?, ?, ?, ?, 'ES256', ?, ?, 'dev.rock.automation', '1', ?, 'TRUSTED_ENVIRONMENT', 'VERIFIED', ?, ?, ?, ?)`)
    .bind(COMPUTE_GRID_ATTESTATION_AUTHORITY, ownerUserId, deviceRef, keyId, raw.toString('hex'), keyId,
      'c'.repeat(64), now, now, status, status === 'active' ? null : now).run();
  return { ownerUserId, deviceRef, keyId, privateKey: pair.privateKey };
}

/** Build the exact wire body a device sends: signed payload text + outputs. */
export function deviceBody(device, action, fields, { now = START, outputs, signer = device, requestId = randomUUID() } = {}) {
  const payload = JSON.stringify({
    schema: COMPUTE_GRID_DEVICE_REQUEST_SCHEMA,
    action,
    requestId,
    authorityId: COMPUTE_GRID_ATTESTATION_AUTHORITY,
    deviceRef: device.deviceRef,
    keyId: device.keyId,
    issuedAt: now,
    ...fields,
  });
  const signature = sign('sha256', computeGridDeviceSigningBytes(payload),
    { key: signer.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return outputs ? { payload, signature, outputs } : { payload, signature };
}

export function lexicalOffer(overrides = {}, now = START) {
  const sku = COMPUTE_SKUS.get(LEXICAL_EMBEDDING_SKU);
  return {
    skuId: sku.skuId,
    pools: ['owner'],
    platform: 'android',
    abi: 'arm64-v8a',
    region: 'JP-KANTO',
    memoryMiB: 8192,
    maxLotsPerLease: 4,
    priceMicrosPerLot: 0,
    maxInputBytesPerLot: 65_536,
    dataClasses: ['public', 'synthetic', 'owner_private'],
    availableFrom: now - 60_000,
    availableUntil: now + 6 * 60 * 60_000,
    ...sku.artifacts,
    ...overrides,
  };
}

export function orderInput(overrides = {}, now = START) {
  return {
    orderId: randomUUID(),
    pool: 'owner',
    skuId: LEXICAL_EMBEDDING_SKU,
    dataClass: 'owner_private',
    regions: [],
    minimumMemoryMiB: 1024,
    maximumPriceMicrosPerLot: 0,
    budgetMicros: 0,
    deadlineAt: now + 60 * 60_000,
    validation: { method: 'owner_trust', quorum: 1 },
    lots: [
      { lotId: 'lot-001', items: ['朝のメモ: 牛乳を買う', 'meeting notes for Tuesday'] },
      { lotId: 'lot-002', items: ['旅行の計画 京都 二泊三日'] },
    ],
    ...overrides,
  };
}

const GOOD_CONDITIONS = { charging: true, deviceIdle: true, unmeteredNetwork: true, thermalStatus: 'none' };
const GOOD_EVIDENCE = {
  chargingThroughout: true, deviceIdleThroughout: true, unmeteredThroughout: true, maximumThermalStatus: 'light',
};

/**
 * A grid as the API routes use it, with a clock the test controls. Every device
 * call goes through the real signature verification before it reaches the store.
 */
export function gridHarness(db, { mode = 'owner_pool', skus = COMPUTE_SKUS, dataKey = DATA_KEY } = {}) {
  const store = skyComputeGridStore(db, { mode, dataKey, skus });
  const resolveKey = a2aBrokerDeviceKeyResolver(db, undefined);
  const verified = (device, body, now) => verifyComputeGridDeviceRequest(body, device.ownerUserId, resolveKey, now, skus);
  return {
    store,
    resolveKey,
    verified,
    async offer(device, overrides = {}, now = START) {
      const { request } = await verified(device, deviceBody(device, 'offer', { offer: lexicalOffer(overrides, now) }, { now }), now);
      return store.registerOffer(device.ownerUserId, request, now);
    },
    async order(ownerUserId, overrides = {}, now = START) {
      const parsed = await parseComputeOrder(orderInput(overrides, now), mode, now, skus);
      return (await store.createOrder(ownerUserId, parsed, now)).order;
    },
    async claim(device, { now = START, conditions = GOOD_CONDITIONS, skuId = LEXICAL_EMBEDDING_SKU } = {}) {
      const { request } = await verified(device, deviceBody(device, 'claim', { skuId, conditions }, { now }), now);
      return store.claim(device.ownerUserId, request, now);
    },
    async release(device, leaseId, { now = START, reason = 'owner_active' } = {}) {
      const { request } = await verified(device, deviceBody(device, 'release', { leaseId, reason }, { now }), now);
      return store.release(device.ownerUserId, request, now);
    },
    /**
     * Run the lease on the simulated device and send the receipt. `compute`
     * turns the decoded items of one lot into output bytes; returning null
     * leaves that lot out of the receipt.
     */
    async work(device, lease, { now = START, compute, evidence = GOOD_EVIDENCE, artifacts, requestId } = {}) {
      const sku = skus.get(lease.skuId);
      const run = compute ?? ((items) => sku.reference(items));
      const results = [];
      const outputs = {};
      for (const lot of lease.lots) {
        const input = Buffer.from(lot.input, 'base64');
        const output = run(decodeLotInput(input), lot);
        if (!output) continue;
        results.push({ lotId: lot.lotId, inputSha256: sha256(input), outputSha256: sha256(output), outputBytes: output.byteLength });
        outputs[lot.lotId] = b64(output);
      }
      const body = deviceBody(device, 'receipt', {
        leaseId: lease.leaseId,
        startedAt: now - 1_000,
        completedAt: now,
        runtimeArtifactSha256: lease.runtimeArtifactSha256,
        modelSha256: lease.modelSha256,
        tokenizerSha256: lease.tokenizerSha256,
        ...artifacts,
        deviceEvidence: evidence,
        results,
      }, { now, outputs, requestId });
      return { body, outcome: await store.submitReceipt(device.ownerUserId, await verified(device, body, now), now) };
    },
  };
}
