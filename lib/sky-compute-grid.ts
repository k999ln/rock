import { createHash } from 'node:crypto';

export const SKY_COMPUTE_GRID_SKU = 'public-text-embedding-v1' as const;
export const SKY_COMPUTE_GRID_SETTLEMENT_ASSET = 'sky_test_credits' as const;

export type ComputeTrustTier =
  | 'software'
  | 'play_integrity_device'
  | 'hardware_backed';
export type ThermalStatus = 'none' | 'light' | 'moderate' | 'severe';

export type CapacityOffer = {
  schema: 'sky-capacity-offer/1';
  offerId: string;
  providerRefHash: string;
  providerPseudonym: string;
  platform: 'android';
  abi: 'arm64-v8a';
  region: string;
  trustTier: ComputeTrustTier;
  runtimeArtifactSha256: string;
  modelSha256: string;
  tokenizerSha256: string;
  memoryMiB: number;
  benchmarkLotsPerHour: number;
  reliabilityBps: number;
  availableFrom: string;
  availableUntil: string;
  maxLots: number;
  priceMicrosPerLot: number;
  settlementAsset: typeof SKY_COMPUTE_GRID_SETTLEMENT_ASSET;
  workloadPolicy: {
    dataClasses: ('public' | 'synthetic')[];
    maxInputBytesPerLot: number;
    permitsPersonalData: false;
    permitsSecrets: false;
    permitsArbitraryCode: false;
  };
  currentConditions: {
    charging: boolean;
    deviceIdle: boolean;
    unmeteredNetwork: boolean;
    thermalStatus: ThermalStatus;
  };
};

export type ComputeLot = {
  lotId: string;
  inputSha256: string;
  inputBytes: number;
};

export type ComputeOrder = {
  schema: 'sky-compute-order/1';
  orderId: string;
  buyerRefHash: string;
  skuId: typeof SKY_COMPUTE_GRID_SKU;
  dataClass: 'public' | 'synthetic';
  runtimeArtifactSha256: string;
  modelSha256: string;
  tokenizerSha256: string;
  regions: string[];
  minimumTrustTier: ComputeTrustTier;
  minimumMemoryMiB: number;
  maximumInputBytesPerLot: number;
  maximumPriceMicrosPerLot: number;
  budgetMicros: number;
  deadline: string;
  interruptible: true;
  cloudFallbackAuthorized: false;
  containsPersonalData: false;
  containsSecrets: false;
  validation: {
    method: 'independent_reference' | 'duplicate_quorum';
    quorum: 1 | 2 | 3;
  };
  lots: ComputeLot[];
};

export type ComputeLease = {
  schema: 'sky-compute-lease/1';
  leaseId: string;
  orderId: string;
  offerId: string;
  providerPseudonym: string;
  region: string;
  trustTier: ComputeTrustTier;
  skuId: typeof SKY_COMPUTE_GRID_SKU;
  runtimeArtifactSha256: string;
  modelSha256: string;
  tokenizerSha256: string;
  lots: ComputeLot[];
  priceMicrosPerLot: number;
  settlementAsset: typeof SKY_COMPUTE_GRID_SETTLEMENT_ASSET;
  issuedAt: string;
  expiresAt: string;
  executionPolicy: {
    requiresCharging: true;
    requiresDeviceIdle: true;
    requiresUnmeteredNetwork: true;
    maximumThermalStatus: 'light';
    arbitraryCodeAllowed: false;
    stopOnOwnerUse: true;
  };
};

export type ComputeReceipt = {
  schema: 'sky-compute-receipt/1';
  receiptId: string;
  leaseId: string;
  orderId: string;
  offerId: string;
  providerRefHash: string;
  runtimeArtifactSha256: string;
  modelSha256: string;
  tokenizerSha256: string;
  startedAt: string;
  completedAt: string;
  deviceEvidence: {
    trustTier: ComputeTrustTier;
    chargingThroughout: boolean;
    deviceIdleThroughout: boolean;
    unmeteredThroughout: boolean;
    maximumThermalStatus: ThermalStatus;
  };
  results: Array<{
    lotId: string;
    inputSha256: string;
    outputSha256: string;
    outputBytes: number;
    status: 'completed';
  }>;
};

export type DuplicateObservation = {
  leaseId: string;
  outputSha256: string;
};

export type VerificationEvidence = {
  providerRefHash: string;
  referenceOutputs?: Record<string, string>;
  duplicateOutputs?: Record<string, DuplicateObservation[]>;
};

export type OfferRejection = {
  offerId: string;
  reasons: string[];
};

export type ComputeMatch = {
  state: 'matched' | 'partial' | 'unmatched';
  leases: ComputeLease[];
  unmatchedLotIds: string[];
  rejectedOffers: OfferRejection[];
  reservedMicros: number;
};

const sha256Pattern = /^[0-9a-f]{64}$/u;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/u;
const regionPattern = /^[A-Z]{2}(?:-[A-Z0-9]{2,12})?$/u;
const trustRank: Record<ComputeTrustTier, number> = {
  software: 0,
  play_integrity_device: 1,
  hardware_backed: 2,
};
const thermalRank: Record<ThermalStatus, number> = {
  none: 0,
  light: 1,
  moderate: 2,
  severe: 3,
};

export class ComputeGridError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function requireValue(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ComputeGridError(code, message);
}

function validInstant(value: string) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function positiveSafeInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

function validDigest(value: string) {
  return typeof value === 'string' && sha256Pattern.test(value);
}

function digestId(prefix: string, parts: unknown[]) {
  return `${prefix}_${createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 24)}`;
}

export function validateCapacityOffer(offer: CapacityOffer) {
  requireValue(offer?.schema === 'sky-capacity-offer/1', 'OFFER_SCHEMA', '供給offerのschemaが不正です。');
  requireValue(idPattern.test(offer.offerId), 'OFFER_ID', '供給offerのIDが不正です。');
  requireValue(validDigest(offer.providerRefHash), 'OFFER_PROVIDER', '提供者参照はhashだけを使用してください。');
  requireValue(
    typeof offer.providerPseudonym === 'string' && offer.providerPseudonym.length >= 3 && offer.providerPseudonym.length <= 40,
    'OFFER_PSEUDONYM',
    '公開用の提供者名が不正です。',
  );
  requireValue(offer.platform === 'android' && offer.abi === 'arm64-v8a', 'OFFER_PLATFORM', '初期供給端末はAndroid arm64だけです。');
  requireValue(regionPattern.test(offer.region), 'OFFER_REGION', '地域は国または粗い地域codeで指定してください。');
  requireValue(offer.trustTier in trustRank, 'OFFER_TRUST', '端末trust tierが不正です。');
  requireValue(
    validDigest(offer.runtimeArtifactSha256) && validDigest(offer.modelSha256) && validDigest(offer.tokenizerSha256),
    'OFFER_ARTIFACT',
    'runtime、model、tokenizerのhashが必要です。',
  );
  requireValue(positiveSafeInteger(offer.memoryMiB) && offer.memoryMiB <= 1_048_576, 'OFFER_MEMORY', 'memory上限が不正です。');
  requireValue(positiveSafeInteger(offer.benchmarkLotsPerHour), 'OFFER_BENCHMARK', '検証済みbenchmarkが必要です。');
  requireValue(Number.isInteger(offer.reliabilityBps) && offer.reliabilityBps >= 0 && offer.reliabilityBps <= 10_000, 'OFFER_RELIABILITY', '信頼度はbasis pointsで指定してください。');
  requireValue(validInstant(offer.availableFrom) && validInstant(offer.availableUntil) && Date.parse(offer.availableUntil) > Date.parse(offer.availableFrom), 'OFFER_WINDOW', '供給時間帯が不正です。');
  requireValue(positiveSafeInteger(offer.maxLots) && offer.maxLots <= 10_000, 'OFFER_LOTS', '供給lot数が不正です。');
  requireValue(Number.isSafeInteger(offer.priceMicrosPerLot) && offer.priceMicrosPerLot >= 0, 'OFFER_PRICE', 'lot単価が不正です。');
  requireValue(offer.settlementAsset === SKY_COMPUTE_GRID_SETTLEMENT_ASSET, 'OFFER_ASSET', 'MVPはtest creditだけを扱います。');
  requireValue(
    Array.isArray(offer.workloadPolicy?.dataClasses) &&
      offer.workloadPolicy.dataClasses.length > 0 &&
      offer.workloadPolicy.dataClasses.every((value) => value === 'public' || value === 'synthetic') &&
      positiveSafeInteger(offer.workloadPolicy.maxInputBytesPerLot) &&
      offer.workloadPolicy.permitsPersonalData === false &&
      offer.workloadPolicy.permitsSecrets === false &&
      offer.workloadPolicy.permitsArbitraryCode === false,
    'OFFER_POLICY',
    'MVPは公開・合成dataと固定runtimeだけを許可します。',
  );
  requireValue(
    typeof offer.currentConditions?.charging === 'boolean' &&
      typeof offer.currentConditions?.deviceIdle === 'boolean' &&
      typeof offer.currentConditions?.unmeteredNetwork === 'boolean' &&
      offer.currentConditions.thermalStatus in thermalRank,
    'OFFER_CONDITIONS',
    '端末の充電・idle・通信・温度状態が不正です。',
  );
  return offer;
}

export function validateComputeOrder(order: ComputeOrder) {
  requireValue(order?.schema === 'sky-compute-order/1', 'ORDER_SCHEMA', 'compute orderのschemaが不正です。');
  requireValue(idPattern.test(order.orderId), 'ORDER_ID', 'order IDが不正です。');
  requireValue(validDigest(order.buyerRefHash), 'ORDER_BUYER', '購入者参照はhashだけを使用してください。');
  requireValue(order.skuId === SKY_COMPUTE_GRID_SKU, 'ORDER_SKU', '未審査のcompute SKUです。');
  requireValue(order.dataClass === 'public' || order.dataClass === 'synthetic', 'ORDER_DATA', 'MVPは公開・合成dataだけを扱います。');
  requireValue(order.containsPersonalData === false && order.containsSecrets === false, 'ORDER_SENSITIVE', '個人情報または秘密を端末gridへ配れません。');
  requireValue(order.interruptible === true && order.cloudFallbackAuthorized === false, 'ORDER_EXECUTION', 'MVP orderは中断可能で、cloud fallbackなしに固定します。');
  requireValue(
    validDigest(order.runtimeArtifactSha256) && validDigest(order.modelSha256) && validDigest(order.tokenizerSha256),
    'ORDER_ARTIFACT',
    'runtime、model、tokenizerのhashが必要です。',
  );
  requireValue(
    Array.isArray(order.regions) && order.regions.length > 0 && order.regions.length <= 16 && order.regions.every((region) => regionPattern.test(region)),
    'ORDER_REGION',
    '許可地域が不正です。',
  );
  requireValue(order.minimumTrustTier in trustRank, 'ORDER_TRUST', '必要trust tierが不正です。');
  requireValue(positiveSafeInteger(order.minimumMemoryMiB), 'ORDER_MEMORY', '必要memoryが不正です。');
  requireValue(positiveSafeInteger(order.maximumInputBytesPerLot), 'ORDER_INPUT_LIMIT', 'lot入力上限が不正です。');
  requireValue(Number.isSafeInteger(order.maximumPriceMicrosPerLot) && order.maximumPriceMicrosPerLot >= 0, 'ORDER_PRICE', 'lot上限単価が不正です。');
  requireValue(Number.isSafeInteger(order.budgetMicros) && order.budgetMicros >= 0, 'ORDER_BUDGET', '予算が不正です。');
  requireValue(validInstant(order.deadline), 'ORDER_DEADLINE', '期限が不正です。');
  requireValue(
    order.validation?.method === 'independent_reference' || order.validation?.method === 'duplicate_quorum',
    'ORDER_VALIDATION',
    '検証方式が不正です。',
  );
  requireValue(
    [1, 2, 3].includes(order.validation.quorum) &&
      (order.validation.method === 'duplicate_quorum' ? order.validation.quorum >= 2 : order.validation.quorum === 1),
    'ORDER_QUORUM',
    '検証quorumが不正です。',
  );
  requireValue(Array.isArray(order.lots) && order.lots.length > 0 && order.lots.length <= 10_000, 'ORDER_LOTS', 'compute lotが必要です。');
  const ids = new Set<string>();
  for (const lot of order.lots) {
    requireValue(idPattern.test(lot.lotId) && !ids.has(lot.lotId), 'ORDER_LOT_ID', 'lot IDは一意である必要があります。');
    ids.add(lot.lotId);
    requireValue(validDigest(lot.inputSha256), 'ORDER_LOT_DIGEST', 'lot入力hashが不正です。');
    requireValue(positiveSafeInteger(lot.inputBytes) && lot.inputBytes <= order.maximumInputBytesPerLot, 'ORDER_LOT_SIZE', 'lot入力が上限を超えています。');
  }
  requireValue(
    order.lots.length * order.maximumPriceMicrosPerLot <= order.budgetMicros,
    'ORDER_BUDGET',
    '全lotの上限額を予算内に収めてください。',
  );
  return order;
}

function rejectionReasons(order: ComputeOrder, offer: CapacityOffer, nowMs: number) {
  const reasons: string[] = [];
  if (Date.parse(order.deadline) <= nowMs) reasons.push('order_deadline_elapsed');
  if (Date.parse(offer.availableFrom) > nowMs || Date.parse(offer.availableUntil) <= nowMs) reasons.push('outside_supply_window');
  if (!order.regions.includes(offer.region)) reasons.push('region_not_allowed');
  if (trustRank[offer.trustTier] < trustRank[order.minimumTrustTier]) reasons.push('trust_tier_too_low');
  if (offer.runtimeArtifactSha256 !== order.runtimeArtifactSha256 || offer.modelSha256 !== order.modelSha256 || offer.tokenizerSha256 !== order.tokenizerSha256) reasons.push('artifact_digest_mismatch');
  if (offer.memoryMiB < order.minimumMemoryMiB) reasons.push('insufficient_memory');
  if (!offer.workloadPolicy.dataClasses.includes(order.dataClass)) reasons.push('data_class_not_allowed');
  if (offer.workloadPolicy.maxInputBytesPerLot < Math.max(...order.lots.map((lot) => lot.inputBytes))) reasons.push('input_limit_too_low');
  if (offer.priceMicrosPerLot > order.maximumPriceMicrosPerLot) reasons.push('price_above_cap');
  if (!offer.currentConditions.charging) reasons.push('not_charging');
  if (!offer.currentConditions.deviceIdle) reasons.push('device_in_use');
  if (!offer.currentConditions.unmeteredNetwork) reasons.push('metered_network');
  if (thermalRank[offer.currentConditions.thermalStatus] > thermalRank.light) reasons.push('thermal_limit');
  return reasons;
}

function scoreOffer(order: ComputeOrder, offer: CapacityOffer) {
  const priceRange = Math.max(1, order.maximumPriceMicrosPerLot);
  const priceScore = Math.round(((order.maximumPriceMicrosPerLot - offer.priceMicrosPerLot) / priceRange) * 4_000);
  const reliabilityScore = Math.round((offer.reliabilityBps / 10_000) * 3_000);
  const benchmarkScore = Math.min(1_500, offer.benchmarkLotsPerHour * 25);
  const exactRegionScore = order.regions[0] === offer.region ? 1_000 : 500;
  const trustScore = trustRank[offer.trustTier] * 250;
  return priceScore + reliabilityScore + benchmarkScore + exactRegionScore + trustScore;
}

export function matchComputeOrder(
  order: ComputeOrder,
  offers: CapacityOffer[],
  now = new Date(),
): ComputeMatch {
  validateComputeOrder(order);
  const nowMs = now.valueOf();
  requireValue(Number.isFinite(nowMs), 'MATCH_TIME', 'matching時刻が不正です。');
  const rejectedOffers: OfferRejection[] = [];
  const eligible: CapacityOffer[] = [];
  for (const offer of offers) {
    validateCapacityOffer(offer);
    const reasons = rejectionReasons(order, offer, nowMs);
    if (reasons.length > 0) rejectedOffers.push({ offerId: offer.offerId, reasons });
    else eligible.push(offer);
  }
  eligible.sort((left, right) => scoreOffer(order, right) - scoreOffer(order, left) || left.offerId.localeCompare(right.offerId));

  const unassigned = [...order.lots];
  const leases: ComputeLease[] = [];
  let reservedMicros = 0;
  for (const offer of eligible) {
    const affordableLots = offer.priceMicrosPerLot === 0
      ? unassigned.length
      : Math.floor((order.budgetMicros - reservedMicros) / offer.priceMicrosPerLot);
    const assigned = unassigned.splice(0, Math.min(offer.maxLots, affordableLots));
    if (assigned.length === 0) continue;
    const expiresAtMs = Math.min(Date.parse(order.deadline), Date.parse(offer.availableUntil), nowMs + 10 * 60_000);
    const lease: ComputeLease = {
      schema: 'sky-compute-lease/1',
      leaseId: digestId('lease', [order.orderId, offer.offerId, assigned.map((lot) => lot.lotId)]),
      orderId: order.orderId,
      offerId: offer.offerId,
      providerPseudonym: offer.providerPseudonym,
      region: offer.region,
      trustTier: offer.trustTier,
      skuId: order.skuId,
      runtimeArtifactSha256: order.runtimeArtifactSha256,
      modelSha256: order.modelSha256,
      tokenizerSha256: order.tokenizerSha256,
      lots: assigned,
      priceMicrosPerLot: offer.priceMicrosPerLot,
      settlementAsset: offer.settlementAsset,
      issuedAt: now.toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      executionPolicy: {
        requiresCharging: true,
        requiresDeviceIdle: true,
        requiresUnmeteredNetwork: true,
        maximumThermalStatus: 'light',
        arbitraryCodeAllowed: false,
        stopOnOwnerUse: true,
      },
    };
    leases.push(lease);
    reservedMicros += assigned.length * offer.priceMicrosPerLot;
    if (unassigned.length === 0) break;
  }
  return {
    state: unassigned.length === 0 ? 'matched' : leases.length > 0 ? 'partial' : 'unmatched',
    leases,
    unmatchedLotIds: unassigned.map((lot) => lot.lotId),
    rejectedOffers,
    reservedMicros,
  };
}

export function verifyComputeReceipt(
  order: ComputeOrder,
  lease: ComputeLease,
  receipt: ComputeReceipt,
  evidence: VerificationEvidence,
) {
  validateComputeOrder(order);
  const reasons: string[] = [];
  if (receipt.schema !== 'sky-compute-receipt/1') reasons.push('receipt_schema_invalid');
  if (!idPattern.test(receipt.receiptId)) reasons.push('receipt_id_invalid');
  if (receipt.leaseId !== lease.leaseId || receipt.orderId !== order.orderId || receipt.offerId !== lease.offerId) reasons.push('lease_binding_mismatch');
  if (!validDigest(evidence.providerRefHash) || receipt.providerRefHash !== evidence.providerRefHash) reasons.push('provider_reference_invalid');
  if (receipt.runtimeArtifactSha256 !== lease.runtimeArtifactSha256 || receipt.modelSha256 !== lease.modelSha256 || receipt.tokenizerSha256 !== lease.tokenizerSha256) reasons.push('artifact_digest_mismatch');
  if (!validInstant(receipt.startedAt) || !validInstant(receipt.completedAt) || Date.parse(receipt.startedAt) < Date.parse(lease.issuedAt) || Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt) || Date.parse(receipt.completedAt) > Date.parse(lease.expiresAt)) reasons.push('execution_window_invalid');
  if (
    receipt.deviceEvidence?.trustTier !== lease.trustTier ||
    trustRank[receipt.deviceEvidence?.trustTier] < trustRank[order.minimumTrustTier] ||
    !receipt.deviceEvidence?.chargingThroughout ||
    !receipt.deviceEvidence?.deviceIdleThroughout ||
    !receipt.deviceEvidence?.unmeteredThroughout ||
    !(receipt.deviceEvidence?.maximumThermalStatus in thermalRank) ||
    thermalRank[receipt.deviceEvidence.maximumThermalStatus] > thermalRank.light
  ) reasons.push('device_safety_gate_failed');

  const expectedLots = new Map(lease.lots.map((lot) => [lot.lotId, lot]));
  const resultIds = new Set<string>();
  let verifiedLots = 0;
  for (const result of receipt.results ?? []) {
    const lot = expectedLots.get(result.lotId);
    if (!lot || resultIds.has(result.lotId)) {
      reasons.push('result_lot_set_invalid');
      continue;
    }
    resultIds.add(result.lotId);
    if (result.status !== 'completed' || result.inputSha256 !== lot.inputSha256 || !validDigest(result.outputSha256) || !positiveSafeInteger(result.outputBytes)) {
      reasons.push(`result_invalid:${result.lotId}`);
      continue;
    }
    if (order.validation.method === 'independent_reference') {
      if (evidence.referenceOutputs?.[result.lotId] !== result.outputSha256) {
        reasons.push(`reference_mismatch:${result.lotId}`);
        continue;
      }
    } else {
      const observations = evidence.duplicateOutputs?.[result.lotId] ?? [];
      const matchingLeases = new Set(
        observations
          .filter((item) => item.leaseId !== lease.leaseId && item.outputSha256 === result.outputSha256)
          .map((item) => item.leaseId),
      );
      if (1 + matchingLeases.size < order.validation.quorum) {
        reasons.push(`duplicate_quorum_missing:${result.lotId}`);
        continue;
      }
    }
    verifiedLots += 1;
  }
  if (resultIds.size !== expectedLots.size) reasons.push('result_lot_set_incomplete');
  if (verifiedLots !== expectedLots.size) reasons.push('not_all_lots_verified');
  const state = reasons.length === 0 ? 'verified' as const : 'rejected' as const;
  return {
    state,
    verifiedLots: state === 'verified' ? verifiedLots : 0,
    reasons: [...new Set(reasons)],
    usageReceipt: state === 'verified'
      ? {
          schema: 'sky-compute-usage/1' as const,
          receiptId: receipt.receiptId,
          leaseId: lease.leaseId,
          orderId: order.orderId,
          verifiedLots,
          unitPriceMicros: lease.priceMicrosPerLot,
          totalMicros: verifiedLots * lease.priceMicrosPerLot,
          settlementAsset: lease.settlementAsset,
          verificationMethod: order.validation.method,
        }
      : null,
  };
}

export function createSettlementPreview(
  lease: ComputeLease,
  verification: ReturnType<typeof verifyComputeReceipt>,
) {
  requireValue(verification.state === 'verified' && verification.usageReceipt !== null, 'SETTLEMENT_UNVERIFIED', '検証済みlotだけを精算候補にできます。');
  return {
    schema: 'sky-compute-settlement-preview/1' as const,
    idempotencyKey: digestId('settlement', [lease.leaseId, verification.usageReceipt.receiptId, verification.usageReceipt.totalMicros]),
    leaseId: lease.leaseId,
    providerPseudonym: lease.providerPseudonym,
    amountMicros: verification.usageReceipt.totalMicros,
    asset: lease.settlementAsset,
    state: 'service_credit_hold' as const,
    livePayoutAuthorized: false as const,
    walletMutationAllowed: false as const,
    note: 'Host fixture only. Walletへ記帳せず、本番払出し審査まで保留します。',
  };
}

export function runComputeGridFixture(input: {
  now: string;
  order: ComputeOrder;
  offers: CapacityOffer[];
  receipt: ComputeReceipt;
  verificationEvidence: VerificationEvidence;
}) {
  const match = matchComputeOrder(input.order, input.offers, new Date(input.now));
  requireValue(match.leases.length === 1, 'FIXTURE_MATCH', 'fixtureは1 leaseへ収まる必要があります。');
  const lease = match.leases[0];
  const receipt = { ...input.receipt, leaseId: lease.leaseId };
  const verification = verifyComputeReceipt(input.order, lease, receipt, input.verificationEvidence);
  const settlement = createSettlementPreview(lease, verification);
  return {
    evidenceKind: 'synthetic_host_fixture' as const,
    productionAccepted: false as const,
    androidRuntimeConnected: false as const,
    match,
    verification,
    settlement,
  };
}
