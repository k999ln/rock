// Sky Compute Grid — wire protocol of the persistent grid.
//
// lib/sky-compute-grid.ts stays the pure contract of the synthetic host
// fixture. This module defines what real devices and real buyers send:
//   - buyers create an order with the lot contents;
//   - an enrolled device signs every request with its hardware-backed,
//     attested P-256 key (the same key the A2A Broker enrolment registers);
//   - the device never states who it is, how trusted it is or what it is paid:
//     those come from the session, the enrolment record and the stored offer.

import type { A2ATrustedBrokerKeyResolver } from './a2a-broker-authorization.ts';
import { sha256Hex } from './sky-compute-grid-crypto.ts';
import {
  COMPUTE_SKUS,
  encodeLotInput,
  sameArtifacts,
  wellFormedText,
  type ComputeSkuDefinition,
  type ComputeSkuRegistry,
} from './sky-compute-grid-skus.ts';

export const COMPUTE_GRID_DEVICE_REQUEST_SCHEMA = 'sky-compute-grid-device-request/1' as const;
export const COMPUTE_GRID_LEASE_SCHEMA = 'sky-compute-lease/2' as const;
export const COMPUTE_GRID_CREDIT_ASSET = 'sky_compute_credits' as const;
export const COMPUTE_GRID_ATTESTATION_AUTHORITY = 'android-key-attestation-google' as const;
const SIGNATURE_DOMAIN = new TextEncoder().encode('rock-sky-compute-grid-device-request/1\0');

const DAY_MS = 24 * 60 * 60_000;
export const COMPUTE_GRID_LIMITS = Object.freeze({
  maxLotsPerOrder: 64,
  maxOrderRequestBytes: 2 * 1024 * 1024,
  maxOrderInputBytes: 1536 * 1024,
  maxOpenOrdersPerOwner: 32,
  maxLotsPerLease: 8,
  leaseTtlMs: 10 * 60_000,
  // The device must stop at expiresAt; the coordinator waits this much longer
  // for a receipt that was already on the wire before it reclaims the lots.
  receiptGraceMs: 30_000,
  requestPastSkewMs: 5 * 60_000,
  requestFutureSkewMs: 60_000,
  minimumDeadlineMs: 60_000,
  maximumDeadlineMs: 7 * DAY_MS,
  maximumOfferWindowMs: 7 * DAY_MS,
  maximumAttemptsPerLot: 6,
  // A quorum that cannot agree asks at most this many extra devices.
  maximumExtraReplicas: 2,
  maximumPriceMicrosPerLot: 1_000_000_000_000,
  maximumBudgetMicros: 1_000_000_000_000_000,
  outputRetentionMs: 7 * DAY_MS,
  // Android Keystore signs at most 16 KiB including the domain prefix.
  maximumDevicePayloadBytes: 15_000,
  maximumDeviceRequestBytes: 1536 * 1024,
});

export type ComputeGridMode = 'disabled' | 'owner_pool' | 'owner_and_public_pool';
export type ComputeGridPool = 'owner' | 'public';
export type ComputeGridDataClass = 'public' | 'synthetic' | 'owner_private';
export type ComputeGridValidationMethod = 'owner_trust' | 'independent_reference' | 'duplicate_quorum';
export type ComputeGridThermalStatus = 'none' | 'light' | 'moderate' | 'severe';
export type ComputeGridReleaseReason =
  | 'owner_active' | 'unplugged' | 'metered_network' | 'thermal' | 'shutdown' | 'runtime_error';

/**
 * The persistent grid is off unless the deployment opts in. `owner_pool` only
 * ever pairs an order with devices of the same account. The public pool is a
 * separate, later acceptance and must not be switched on to "try it".
 */
export function computeGridMode(value: unknown): ComputeGridMode {
  return value === 'owner_pool' || value === 'owner_and_public_pool' ? value : 'disabled';
}

export class ComputeGridLiveError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400, message = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function fail(code: string, status = 400): never {
  throw new ComputeGridLiveError(code, status);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = /^[0-9a-f]{64}$/;
const lotIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/;
const regionPattern = /^[A-Z]{2}(?:-[A-Z0-9]{2,12})?$/;
const thermalRank: Record<ComputeGridThermalStatus, number> = { none: 0, light: 1, moderate: 2, severe: 3 };
const releaseReasons: readonly ComputeGridReleaseReason[] =
  ['owner_active', 'unplugged', 'metered_network', 'thermal', 'shutdown', 'runtime_error'];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function uniqueStrings<T extends string>(value: unknown, allowed: readonly T[], minimum: number): value is T[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= allowed.length &&
    new Set(value).size === value.length && value.every((item) => allowed.includes(item as T));
}

export type ComputeGridConditions = {
  charging: boolean;
  deviceIdle: boolean;
  unmeteredNetwork: boolean;
  thermalStatus: ComputeGridThermalStatus;
};

/** Reasons a device must not start or continue a lease. Empty means allowed. */
export function conditionRejections(conditions: ComputeGridConditions) {
  const reasons: string[] = [];
  if (!conditions.charging) reasons.push('not_charging');
  if (!conditions.deviceIdle) reasons.push('device_in_use');
  if (!conditions.unmeteredNetwork) reasons.push('metered_network');
  if (thermalRank[conditions.thermalStatus] > thermalRank.light) reasons.push('thermal_limit');
  return reasons;
}

function parseConditions(value: unknown): ComputeGridConditions {
  if (!record(value) || !exactKeys(value, ['charging', 'deviceIdle', 'unmeteredNetwork', 'thermalStatus']) ||
      typeof value.charging !== 'boolean' || typeof value.deviceIdle !== 'boolean' ||
      typeof value.unmeteredNetwork !== 'boolean' || typeof value.thermalStatus !== 'string' ||
      !Object.hasOwn(thermalRank, value.thermalStatus))
    fail('device_conditions_invalid');
  return value as ComputeGridConditions;
}

export type ComputeGridOfferTerms = {
  skuId: string;
  pools: ComputeGridPool[];
  platform: 'android';
  abi: 'arm64-v8a';
  region: string;
  memoryMiB: number;
  maxLotsPerLease: number;
  priceMicrosPerLot: number;
  maxInputBytesPerLot: number;
  dataClasses: ComputeGridDataClass[];
  availableFrom: number;
  availableUntil: number;
  runtimeArtifactSha256: string;
  modelSha256: string;
  tokenizerSha256: string;
};

const offerKeys = [
  'skuId', 'pools', 'platform', 'abi', 'region', 'memoryMiB', 'maxLotsPerLease', 'priceMicrosPerLot',
  'maxInputBytesPerLot', 'dataClasses', 'availableFrom', 'availableUntil',
  'runtimeArtifactSha256', 'modelSha256', 'tokenizerSha256',
] as const;

function dispatchableSku(skuId: unknown, skus: ComputeSkuRegistry) {
  const sku = typeof skuId === 'string' ? skus.get(skuId) : undefined;
  if (!sku) fail('sku_not_reviewed');
  if (sku.status !== 'dispatchable') fail('sku_not_dispatchable');
  return sku;
}

function parseOfferTerms(value: unknown, skus: ComputeSkuRegistry): ComputeGridOfferTerms {
  if (!record(value) || !exactKeys(value, offerKeys)) fail('offer_invalid');
  const sku = dispatchableSku(value.skuId, skus);
  if (!uniqueStrings<ComputeGridPool>(value.pools, ['owner', 'public'], 1)) fail('offer_pools_invalid');
  if (value.platform !== 'android' || value.abi !== 'arm64-v8a') fail('offer_platform_unsupported');
  if (typeof value.region !== 'string' || !regionPattern.test(value.region)) fail('offer_region_invalid');
  if (!integer(value.memoryMiB, 1, 1_048_576)) fail('offer_memory_invalid');
  if (!integer(value.maxLotsPerLease, 1, COMPUTE_GRID_LIMITS.maxLotsPerLease)) fail('offer_lots_invalid');
  if (!integer(value.priceMicrosPerLot, 0, COMPUTE_GRID_LIMITS.maximumPriceMicrosPerLot)) fail('offer_price_invalid');
  if (!integer(value.maxInputBytesPerLot, 1, sku.input.maxInputBytesPerLot)) fail('offer_input_limit_invalid');
  if (!uniqueStrings<ComputeGridDataClass>(value.dataClasses, ['public', 'synthetic', 'owner_private'], 1))
    fail('offer_data_classes_invalid');
  if (!integer(value.availableFrom, 1, Number.MAX_SAFE_INTEGER) ||
      !integer(value.availableUntil, 1, Number.MAX_SAFE_INTEGER) ||
      value.availableUntil <= value.availableFrom ||
      value.availableUntil - value.availableFrom > COMPUTE_GRID_LIMITS.maximumOfferWindowMs)
    fail('offer_window_invalid');
  const artifacts = {
    runtimeArtifactSha256: value.runtimeArtifactSha256 as string,
    modelSha256: value.modelSha256 as string,
    tokenizerSha256: value.tokenizerSha256 as string,
  };
  if (![artifacts.runtimeArtifactSha256, artifacts.modelSha256, artifacts.tokenizerSha256]
        .every((item) => typeof item === 'string' && digest.test(item)) ||
      !sameArtifacts(sku.artifacts, artifacts))
    fail('offer_artifact_unreviewed');
  return value as ComputeGridOfferTerms;
}

type DeviceRequestBase = {
  requestId: string;
  authorityId: typeof COMPUTE_GRID_ATTESTATION_AUTHORITY;
  deviceRef: string;
  keyId: string;
  issuedAt: number;
};

export type ComputeGridReceiptResult = {
  lotId: string;
  inputSha256: string;
  outputSha256: string;
  outputBytes: number;
};

export type ComputeGridDeviceEvidence = {
  chargingThroughout: boolean;
  deviceIdleThroughout: boolean;
  unmeteredThroughout: boolean;
  maximumThermalStatus: ComputeGridThermalStatus;
};

export type ComputeGridDeviceRequest = DeviceRequestBase & (
  | { action: 'offer'; offer: ComputeGridOfferTerms }
  | { action: 'withdraw'; skuId: string }
  | { action: 'claim'; skuId: string; conditions: ComputeGridConditions }
  | { action: 'release'; leaseId: string; reason: ComputeGridReleaseReason }
  | {
      action: 'receipt';
      leaseId: string;
      startedAt: number;
      completedAt: number;
      runtimeArtifactSha256: string;
      modelSha256: string;
      tokenizerSha256: string;
      deviceEvidence: ComputeGridDeviceEvidence;
      results: ComputeGridReceiptResult[];
    }
);

const baseKeys = ['schema', 'action', 'requestId', 'authorityId', 'deviceRef', 'keyId', 'issuedAt'] as const;

function parseDevicePayload(value: unknown, skus: ComputeSkuRegistry): ComputeGridDeviceRequest {
  if (!record(value) || value.schema !== COMPUTE_GRID_DEVICE_REQUEST_SCHEMA) fail('device_request_schema_invalid');
  if (typeof value.requestId !== 'string' || !uuid.test(value.requestId) ||
      value.authorityId !== COMPUTE_GRID_ATTESTATION_AUTHORITY ||
      typeof value.deviceRef !== 'string' || !uuid.test(value.deviceRef) ||
      typeof value.keyId !== 'string' || !digest.test(value.keyId) ||
      !integer(value.issuedAt, 1, Number.MAX_SAFE_INTEGER))
    fail('device_request_identity_invalid');
  const base: DeviceRequestBase = {
    requestId: value.requestId,
    authorityId: COMPUTE_GRID_ATTESTATION_AUTHORITY,
    deviceRef: value.deviceRef,
    keyId: value.keyId,
    issuedAt: value.issuedAt as number,
  };
  switch (value.action) {
    case 'offer':
      if (!exactKeys(value, [...baseKeys, 'offer'])) fail('device_request_shape_invalid');
      return { ...base, action: 'offer', offer: parseOfferTerms(value.offer, skus) };
    case 'withdraw':
      if (!exactKeys(value, [...baseKeys, 'skuId']) || typeof value.skuId !== 'string' || !skus.has(value.skuId))
        fail('device_request_shape_invalid');
      return { ...base, action: 'withdraw', skuId: value.skuId as string };
    case 'claim':
      if (!exactKeys(value, [...baseKeys, 'skuId', 'conditions'])) fail('device_request_shape_invalid');
      return {
        ...base,
        action: 'claim',
        skuId: dispatchableSku(value.skuId, skus).skuId,
        conditions: parseConditions(value.conditions),
      };
    case 'release':
      if (!exactKeys(value, [...baseKeys, 'leaseId', 'reason']) ||
          typeof value.leaseId !== 'string' || !uuid.test(value.leaseId) ||
          !releaseReasons.includes(value.reason as ComputeGridReleaseReason))
        fail('device_request_shape_invalid');
      return { ...base, action: 'release', leaseId: value.leaseId as string, reason: value.reason as ComputeGridReleaseReason };
    case 'receipt': {
      if (!exactKeys(value, [...baseKeys, 'leaseId', 'startedAt', 'completedAt', 'runtimeArtifactSha256',
            'modelSha256', 'tokenizerSha256', 'deviceEvidence', 'results']) ||
          typeof value.leaseId !== 'string' || !uuid.test(value.leaseId) ||
          !integer(value.startedAt, 1, Number.MAX_SAFE_INTEGER) ||
          !integer(value.completedAt, value.startedAt as number, Number.MAX_SAFE_INTEGER) ||
          ![value.runtimeArtifactSha256, value.modelSha256, value.tokenizerSha256]
            .every((item) => typeof item === 'string' && digest.test(item)))
        fail('receipt_invalid');
      const evidence = value.deviceEvidence;
      if (!record(evidence) ||
          !exactKeys(evidence, ['chargingThroughout', 'deviceIdleThroughout', 'unmeteredThroughout', 'maximumThermalStatus']) ||
          typeof evidence.chargingThroughout !== 'boolean' || typeof evidence.deviceIdleThroughout !== 'boolean' ||
          typeof evidence.unmeteredThroughout !== 'boolean' || typeof evidence.maximumThermalStatus !== 'string' ||
          !Object.hasOwn(thermalRank, evidence.maximumThermalStatus))
        fail('receipt_evidence_invalid');
      const results = value.results;
      if (!Array.isArray(results) || results.length < 1 || results.length > COMPUTE_GRID_LIMITS.maxLotsPerLease)
        fail('receipt_results_invalid');
      const seen = new Set<string>();
      for (const result of results) {
        if (!record(result) || !exactKeys(result, ['lotId', 'inputSha256', 'outputSha256', 'outputBytes']) ||
            typeof result.lotId !== 'string' || !lotIdPattern.test(result.lotId) || seen.has(result.lotId) ||
            typeof result.inputSha256 !== 'string' || !digest.test(result.inputSha256) ||
            typeof result.outputSha256 !== 'string' || !digest.test(result.outputSha256) ||
            !integer(result.outputBytes, 1, 16 * 1024 * 1024))
          fail('receipt_results_invalid');
        seen.add(result.lotId);
      }
      return {
        ...base,
        action: 'receipt',
        leaseId: value.leaseId as string,
        startedAt: value.startedAt as number,
        completedAt: value.completedAt as number,
        runtimeArtifactSha256: value.runtimeArtifactSha256 as string,
        modelSha256: value.modelSha256 as string,
        tokenizerSha256: value.tokenizerSha256 as string,
        deviceEvidence: evidence as ComputeGridDeviceEvidence,
        results: results as ComputeGridReceiptResult[],
      };
    }
    default:
      return fail('device_request_action_invalid');
  }
}

/** Whether the evidence in a receipt satisfies the lease's execution policy. */
export function evidenceRejections(evidence: ComputeGridDeviceEvidence) {
  const reasons: string[] = [];
  if (!evidence.chargingThroughout) reasons.push('not_charging_throughout');
  if (!evidence.deviceIdleThroughout) reasons.push('device_used_during_lease');
  if (!evidence.unmeteredThroughout) reasons.push('metered_network_during_lease');
  if (thermalRank[evidence.maximumThermalStatus] > thermalRank.light) reasons.push('thermal_limit_exceeded');
  return reasons;
}

export function computeGridDeviceSigningBytes(payload: string) {
  const body = new TextEncoder().encode(payload);
  const bytes = new Uint8Array(SIGNATURE_DOMAIN.length + body.length);
  bytes.set(SIGNATURE_DOMAIN);
  bytes.set(body, SIGNATURE_DOMAIN.length);
  return bytes;
}

function decodeSignature(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value)) return null;
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '==');
    const canonical = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return bytes.length === 64 && canonical === value ? bytes : null;
  } catch {
    return null;
  }
}

export type VerifiedComputeGridDeviceRequest = {
  request: ComputeGridDeviceRequest;
  payload: string;
  payloadSha256: string;
  signature: string;
  outputs: Record<string, string>;
};

/**
 * Authenticate one device request.
 *
 * `ownerUserId` is the already authenticated session owner. The request is
 * accepted only when its signature verifies under the active, attested key
 * that this owner enrolled for this device. Nothing the device writes about
 * its own identity or trust is used beyond locating that key.
 */
export async function verifyComputeGridDeviceRequest(
  body: unknown,
  ownerUserId: string,
  resolveKey: A2ATrustedBrokerKeyResolver,
  now = Date.now(),
  skus: ComputeSkuRegistry = COMPUTE_SKUS,
): Promise<VerifiedComputeGridDeviceRequest> {
  if (!record(body) || typeof body.payload !== 'string') fail('device_request_shape_invalid');
  const hasOutputs = Object.hasOwn(body, 'outputs');
  if (!exactKeys(body, hasOutputs ? ['payload', 'signature', 'outputs'] : ['payload', 'signature']))
    fail('device_request_shape_invalid');
  const payload = body.payload as string;
  if (!wellFormedText(payload) ||
      new TextEncoder().encode(payload).byteLength > COMPUTE_GRID_LIMITS.maximumDevicePayloadBytes)
    fail('device_request_too_large', 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    fail('device_request_shape_invalid');
  }
  const request = parseDevicePayload(parsed, skus);
  if (request.issuedAt > now + COMPUTE_GRID_LIMITS.requestFutureSkewMs ||
      request.issuedAt < now - COMPUTE_GRID_LIMITS.requestPastSkewMs)
    fail('device_request_stale', 401);

  const outputs: Record<string, string> = {};
  if (hasOutputs) {
    if (request.action !== 'receipt' || !record(body.outputs)) fail('device_request_shape_invalid');
    const expected = new Set(request.results.map((result) => result.lotId));
    const provided = Object.keys(body.outputs as Record<string, unknown>);
    if (provided.length !== expected.size || !provided.every((lotId) => expected.has(lotId)))
      fail('receipt_outputs_invalid');
    for (const lotId of provided) {
      const value = (body.outputs as Record<string, unknown>)[lotId];
      if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0)
        fail('receipt_outputs_invalid');
      outputs[lotId] = value;
    }
  } else if (request.action === 'receipt') fail('receipt_outputs_invalid');

  const signature = decodeSignature(body.signature);
  if (!signature) fail('device_signature_invalid', 401);
  let publicKey: Uint8Array | null;
  try {
    publicKey = await resolveKey({
      authorityId: request.authorityId,
      ownerUserId,
      deviceRef: request.deviceRef,
      keyId: request.keyId,
    });
  } catch {
    publicKey = null;
  }
  // Only an enrolled, attested P-256 device key (65-byte uncompressed point).
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 65 || publicKey[0] !== 4)
    fail('device_key_not_enrolled', 403);
  let verified = false;
  try {
    const key = await crypto.subtle.importKey('raw', new Uint8Array(publicKey).buffer as ArrayBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    verified = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
      new Uint8Array(signature).buffer as ArrayBuffer,
      computeGridDeviceSigningBytes(payload).buffer as ArrayBuffer);
  } catch {
    verified = false;
  }
  if (!verified) fail('device_signature_invalid', 401);
  return {
    request,
    payload,
    payloadSha256: await sha256Hex(new TextEncoder().encode(payload)),
    signature: body.signature as string,
    outputs,
  };
}

/** Stable, non-identifying reference of one enrolled device. */
export async function computeGridProviderReference(ownerUserId: string, deviceRef: string) {
  const providerRefHash = await sha256Hex(new TextEncoder().encode(
    `rockstar-sky-compute-grid-provider/1\0${ownerUserId}\0${deviceRef}`,
  ));
  const label = providerRefHash.slice(0, 8).toUpperCase();
  return { providerRefHash, providerPseudonym: `Device ${label.slice(0, 4)}-${label.slice(4)}` };
}

export type ParsedComputeOrderLot = {
  lotId: string;
  itemCount: number;
  input: Uint8Array;
  inputSha256: string;
};

export type ParsedComputeOrder = {
  orderId: string;
  pool: ComputeGridPool;
  sku: ComputeSkuDefinition;
  dataClass: ComputeGridDataClass;
  regions: string[];
  minimumMemoryMiB: number;
  maximumPriceMicrosPerLot: number;
  budgetMicros: number;
  deadlineAt: number;
  validation: { method: ComputeGridValidationMethod; quorum: 1 | 2 | 3 };
  lots: ParsedComputeOrderLot[];
  requestSha256: string;
};

const orderKeys = [
  'orderId', 'pool', 'skuId', 'dataClass', 'regions', 'minimumMemoryMiB',
  'maximumPriceMicrosPerLot', 'budgetMicros', 'deadlineAt', 'validation', 'lots',
] as const;

/**
 * Validate a buyer's order. The pool decides what is allowed:
 * - `owner`: devices of the same account only. Owner-private text is allowed,
 *   nothing is charged, and `owner_trust` may skip cross-checking.
 * - `public`: other people's devices. Public or synthetic text only, and every
 *   lot must be verified by a reference computation or an independent quorum.
 */
export async function parseComputeOrder(
  value: unknown,
  mode: ComputeGridMode,
  now = Date.now(),
  skus: ComputeSkuRegistry = COMPUTE_SKUS,
): Promise<ParsedComputeOrder> {
  if (mode === 'disabled') fail('compute_grid_disabled', 503);
  if (!record(value) || !exactKeys(value, orderKeys)) fail('order_invalid');
  if (typeof value.orderId !== 'string' || !uuid.test(value.orderId)) fail('order_id_invalid');
  if (value.pool !== 'owner' && value.pool !== 'public') fail('order_pool_invalid');
  if (value.pool === 'public' && mode !== 'owner_and_public_pool') fail('public_pool_not_enabled', 403);
  const sku = dispatchableSku(value.skuId, skus);
  if (value.dataClass !== 'public' && value.dataClass !== 'synthetic' && value.dataClass !== 'owner_private')
    fail('order_data_class_invalid');
  if (value.dataClass === 'owner_private' && value.pool !== 'owner') fail('owner_private_requires_owner_pool');
  if (!Array.isArray(value.regions) || value.regions.length > 16 ||
      new Set(value.regions).size !== value.regions.length ||
      !value.regions.every((region) => typeof region === 'string' && regionPattern.test(region)))
    fail('order_regions_invalid');
  if (!integer(value.minimumMemoryMiB, 1, 1_048_576)) fail('order_memory_invalid');
  if (!integer(value.maximumPriceMicrosPerLot, 0, COMPUTE_GRID_LIMITS.maximumPriceMicrosPerLot) ||
      !integer(value.budgetMicros, 0, COMPUTE_GRID_LIMITS.maximumBudgetMicros))
    fail('order_budget_invalid');
  if (value.pool === 'owner' && (value.maximumPriceMicrosPerLot !== 0 || value.budgetMicros !== 0))
    fail('owner_pool_is_not_charged');
  if (!integer(value.deadlineAt, now + COMPUTE_GRID_LIMITS.minimumDeadlineMs, now + COMPUTE_GRID_LIMITS.maximumDeadlineMs))
    fail('order_deadline_invalid');

  const validation = value.validation;
  if (!record(validation) || !exactKeys(validation, ['method', 'quorum'])) fail('order_validation_invalid');
  const method = validation.method as ComputeGridValidationMethod;
  const quorum = validation.quorum as 1 | 2 | 3;
  if (method === 'owner_trust') {
    if (value.pool !== 'owner' || quorum !== 1) fail('order_validation_invalid');
  } else if (method === 'independent_reference') {
    if (quorum !== 1) fail('order_validation_invalid');
    if (!sku.reference) fail('sku_has_no_reference_computation');
  } else if (method === 'duplicate_quorum') {
    if (quorum !== 2 && quorum !== 3) fail('order_validation_invalid');
  } else fail('order_validation_invalid');

  const lots = value.lots;
  if (!Array.isArray(lots) || lots.length < 1 || lots.length > COMPUTE_GRID_LIMITS.maxLotsPerOrder)
    fail('order_lots_invalid');
  const parsedLots: ParsedComputeOrderLot[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const lot of lots) {
    if (!record(lot) || !exactKeys(lot, ['lotId', 'items']) ||
        typeof lot.lotId !== 'string' || !lotIdPattern.test(lot.lotId) || seen.has(lot.lotId))
      fail('order_lot_invalid');
    seen.add(lot.lotId);
    const items = lot.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > sku.input.maxItemsPerLot ||
        !items.every(wellFormedText))
      fail('order_lot_items_invalid');
    const input = encodeLotInput(items as string[]);
    if (input.byteLength > sku.input.maxInputBytesPerLot) fail('order_lot_too_large', 413);
    totalBytes += input.byteLength;
    if (totalBytes > COMPUTE_GRID_LIMITS.maxOrderInputBytes) fail('order_too_large', 413);
    parsedLots.push({ lotId: lot.lotId, itemCount: items.length, input, inputSha256: await sha256Hex(input) });
  }

  const regions = [...(value.regions as string[])].sort();
  const canonical = JSON.stringify([
    'sky-compute-order-request/1', value.orderId, value.pool, sku.skuId, value.dataClass, regions,
    value.minimumMemoryMiB, value.maximumPriceMicrosPerLot, value.budgetMicros, value.deadlineAt,
    method, quorum, parsedLots.map((lot) => [lot.lotId, lot.inputSha256, lot.input.byteLength, lot.itemCount]),
  ]);
  return {
    orderId: value.orderId,
    pool: value.pool,
    sku,
    dataClass: value.dataClass,
    regions,
    minimumMemoryMiB: value.minimumMemoryMiB as number,
    maximumPriceMicrosPerLot: value.maximumPriceMicrosPerLot as number,
    budgetMicros: value.budgetMicros as number,
    deadlineAt: value.deadlineAt as number,
    validation: { method, quorum },
    lots: parsedLots,
    requestSha256: await sha256Hex(new TextEncoder().encode(canonical)),
  };
}

export const COMPUTE_GRID_EXECUTION_POLICY = Object.freeze({
  requiresCharging: true,
  requiresDeviceIdle: true,
  requiresUnmeteredNetwork: true,
  maximumThermalStatus: 'light',
  arbitraryCodeAllowed: false,
  stopOnOwnerUse: true,
} as const);
