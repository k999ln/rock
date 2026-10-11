// Sky Compute Grid — persistent coordinator.
//
// Everything a device or a buyer can cause goes through this store. The store
// decides *what* should happen; the triggers of drizzle/0063_sky_compute_grid.sql
// keep the books (slots, reservations, credits) and refuse impossible states,
// so a bug or a race here aborts a batch instead of paying twice.
//
// Rules the code below relies on:
//   - every multi-row change is one D1 batch (one transaction);
//   - statements are plain INSERT/UPDATE, never OR IGNORE / OR REPLACE, because
//     a conflict policy on the outer statement would silence trigger guards;
//   - verification has one implementation, `settleLot`, reached from receipts
//     and from the sweep.

import {
  COMPUTE_GRID_KEY_VERSION,
  computeGridBase64,
  computeGridDataKeyConfigured,
  openComputeBytes,
  sealComputeBytes,
  sha256Hex,
} from './sky-compute-grid-crypto.ts';
import {
  COMPUTE_GRID_CREDIT_ASSET,
  COMPUTE_GRID_EXECUTION_POLICY,
  COMPUTE_GRID_LEASE_SCHEMA,
  COMPUTE_GRID_LIMITS,
  ComputeGridLiveError,
  computeGridProviderReference,
  conditionRejections,
  evidenceRejections,
  type ComputeGridDeviceRequest,
  type ComputeGridMode,
  type ComputeGridPool,
  type ComputeGridValidationMethod,
  type ParsedComputeOrder,
  type VerifiedComputeGridDeviceRequest,
} from './sky-compute-grid-live.ts';
import {
  COMPUTE_SKUS,
  compareLotOutputs,
  decodeLotInput,
  invalidLotOutput,
  type ComputeSkuDefinition,
  type ComputeSkuRegistry,
} from './sky-compute-grid-skus.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type RequestOf<Action extends ComputeGridDeviceRequest['action']> =
  Extract<ComputeGridDeviceRequest, { action: Action }>;

export type ComputeGridStoreOptions = {
  mode: ComputeGridMode;
  // 64 hex characters. Without it nothing can be stored or handed out.
  dataKey?: string;
  skus?: ComputeSkuRegistry;
};

type OfferRow = {
  id: string; ownerUserId: string; deviceRef: string; keyId: string; skuId: string;
  servesOwnerPool: number; servesPublicPool: number; providerRefHash: string; providerPseudonym: string;
  region: string; memoryMib: number; maxLotsPerLease: number; priceMicrosPerLot: number;
  maxInputBytesPerLot: number; dataClassesJson: string; availableFrom: number; availableUntil: number;
  state: 'active' | 'withdrawn'; conditionsJson: string | null; conditionsObservedAt: number | null;
  verifiedLots: number; rejectedLots: number; expiredLeases: number; releasedLeases: number;
  runtimeArtifactSha256: string; modelSha256: string; tokenizerSha256: string;
  signedAt: number; createdAt: number; updatedAt: number;
};

type OrderRow = {
  id: string; ownerUserId: string; pool: ComputeGridPool; skuId: string; dataClass: string;
  runtimeArtifactSha256: string; modelSha256: string; tokenizerSha256: string; regionsJson: string;
  minimumMemoryMib: number; maximumPriceMicrosPerLot: number; budgetMicros: number;
  reservedMicros: number; settledMicros: number; skyFeeBps: number;
  validationMethod: ComputeGridValidationMethod; quorum: number; deadlineAt: number;
  state: 'open' | 'completed' | 'completed_with_failures' | 'cancelled' | 'expired';
  lotCount: number; verifiedLots: number; failedLots: number; requestSha256: string;
  createdAt: number; updatedAt: number; closedAt: number | null; purgedAt: number | null;
};

type LeaseRow = {
  id: string; orderId: string; offerId: string; orderOwnerUserId: string; providerOwnerUserId: string;
  deviceRef: string; keyId: string; pool: ComputeGridPool; skuId: string; priceMicrosPerLot: number;
  lotCount: number; state: 'active' | 'submitted' | 'rejected' | 'released' | 'expired';
  issuedAt: number; expiresAt: number; closedAt: number | null;
};

type LotRow = {
  orderId: string; lotId: string; ownerUserId: string; inputSha256: string; inputBytes: number;
  itemCount: number; inputCiphertext: string | null; inputNonce: string | null; keyVersion: string;
  state: 'queued' | 'verified' | 'failed' | 'cancelled'; requiredResults: number; openSlots: number;
  attempts: number; verifiedOutputSha256: string | null; verifiedAssignmentId: string | null;
};

type AssignmentRow = {
  id: string; leaseId: string; orderId: string; lotId: string; providerOwnerUserId: string;
  deviceRef: string; priceMicros: number; state: string; outputSha256: string | null;
  outputBytes: number | null; outputCiphertext: string | null; outputNonce: string | null;
  createdAt: number;
};

const OFFER_COLUMNS = `id, owner_user_id AS ownerUserId, device_ref AS deviceRef, key_id AS keyId,
  sku_id AS skuId, serves_owner_pool AS servesOwnerPool, serves_public_pool AS servesPublicPool,
  provider_ref_hash AS providerRefHash, provider_pseudonym AS providerPseudonym, region,
  memory_mib AS memoryMib, max_lots_per_lease AS maxLotsPerLease,
  price_micros_per_lot AS priceMicrosPerLot, max_input_bytes_per_lot AS maxInputBytesPerLot,
  data_classes_json AS dataClassesJson, available_from AS availableFrom,
  available_until AS availableUntil, state, conditions_json AS conditionsJson,
  conditions_observed_at AS conditionsObservedAt, verified_lots AS verifiedLots,
  rejected_lots AS rejectedLots, expired_leases AS expiredLeases, released_leases AS releasedLeases,
  runtime_artifact_sha256 AS runtimeArtifactSha256, model_sha256 AS modelSha256,
  tokenizer_sha256 AS tokenizerSha256, signed_at AS signedAt, created_at AS createdAt,
  updated_at AS updatedAt`;

const ORDER_COLUMNS = `id, owner_user_id AS ownerUserId, pool, sku_id AS skuId, data_class AS dataClass,
  runtime_artifact_sha256 AS runtimeArtifactSha256, model_sha256 AS modelSha256,
  tokenizer_sha256 AS tokenizerSha256, regions_json AS regionsJson,
  minimum_memory_mib AS minimumMemoryMib, maximum_price_micros_per_lot AS maximumPriceMicrosPerLot,
  budget_micros AS budgetMicros, reserved_micros AS reservedMicros, settled_micros AS settledMicros,
  sky_fee_bps AS skyFeeBps, validation_method AS validationMethod, quorum, deadline_at AS deadlineAt,
  state, lot_count AS lotCount, verified_lots AS verifiedLots, failed_lots AS failedLots,
  request_sha256 AS requestSha256, created_at AS createdAt, updated_at AS updatedAt,
  closed_at AS closedAt, purged_at AS purgedAt`;

const LEASE_COLUMNS = `id, order_id AS orderId, offer_id AS offerId,
  order_owner_user_id AS orderOwnerUserId, provider_owner_user_id AS providerOwnerUserId,
  device_ref AS deviceRef, key_id AS keyId, pool, sku_id AS skuId,
  price_micros_per_lot AS priceMicrosPerLot, lot_count AS lotCount, state,
  issued_at AS issuedAt, expires_at AS expiresAt, closed_at AS closedAt`;

const LOT_COLUMNS = `order_id AS orderId, lot_id AS lotId, owner_user_id AS ownerUserId,
  input_sha256 AS inputSha256, input_bytes AS inputBytes, item_count AS itemCount,
  input_ciphertext AS inputCiphertext, input_nonce AS inputNonce, key_version AS keyVersion, state,
  required_results AS requiredResults, open_slots AS openSlots, attempts,
  verified_output_sha256 AS verifiedOutputSha256, verified_assignment_id AS verifiedAssignmentId`;

const ASSIGNMENT_COLUMNS = `id, lease_id AS leaseId, order_id AS orderId, lot_id AS lotId,
  provider_owner_user_id AS providerOwnerUserId, device_ref AS deviceRef, price_micros AS priceMicros,
  state, output_sha256 AS outputSha256, output_bytes AS outputBytes,
  output_ciphertext AS outputCiphertext, output_nonce AS outputNonce, created_at AS createdAt`;

// A device may take a lot only when neither it nor (in the public pool) any
// other device of the same account already holds or answered that lot.
const NO_PRIOR_ASSIGNMENT = `NOT EXISTS (SELECT 1 FROM sky_compute_assignments a
  WHERE a.order_id = t.order_id AND a.lot_id = t.lot_id
    AND a.state NOT IN ('expired', 'released')
    AND a.provider_owner_user_id = ?
    AND (a.device_ref = ? OR ? = 'public'))`;

function changes(result: D1Result | undefined) {
  return Number(result?.meta?.changes ?? 0);
}

/** Prefix every column of a `column AS alias` list with a table alias. */
function qualify(columns: string, table: string) {
  return columns.split(',').map((column) => `${table}.${column.trim()}`).join(', ');
}

function offerView(row: OfferRow) {
  const decided = row.verifiedLots + row.rejectedLots;
  return {
    offerId: row.id,
    deviceRef: row.deviceRef,
    keyId: row.keyId,
    skuId: row.skuId,
    pools: [...(row.servesOwnerPool ? ['owner'] : []), ...(row.servesPublicPool ? ['public'] : [])],
    providerPseudonym: row.providerPseudonym,
    region: row.region,
    trustTier: 'hardware_backed' as const,
    memoryMiB: row.memoryMib,
    maxLotsPerLease: row.maxLotsPerLease,
    priceMicrosPerLot: row.priceMicrosPerLot,
    maxInputBytesPerLot: row.maxInputBytesPerLot,
    dataClasses: JSON.parse(row.dataClassesJson) as string[],
    availableFrom: row.availableFrom,
    availableUntil: row.availableUntil,
    state: row.state,
    lastConditions: row.conditionsJson ? JSON.parse(row.conditionsJson) as unknown : null,
    lastConditionsAt: row.conditionsObservedAt,
    history: {
      verifiedLots: row.verifiedLots,
      rejectedLots: row.rejectedLots,
      expiredLeases: row.expiredLeases,
      releasedLeases: row.releasedLeases,
      // Share of decided lots that verified; null until something was decided.
      reliabilityBps: decided > 0 ? Math.floor((row.verifiedLots * 10_000) / decided) : null,
    },
    updatedAt: row.updatedAt,
  };
}

function orderView(row: OrderRow) {
  return {
    orderId: row.id,
    pool: row.pool,
    skuId: row.skuId,
    dataClass: row.dataClass,
    regions: JSON.parse(row.regionsJson) as string[],
    minimumMemoryMiB: row.minimumMemoryMib,
    maximumPriceMicrosPerLot: row.maximumPriceMicrosPerLot,
    budgetMicros: row.budgetMicros,
    reservedMicros: row.reservedMicros,
    settledMicros: row.settledMicros,
    asset: COMPUTE_GRID_CREDIT_ASSET,
    skyFeeBps: row.skyFeeBps,
    validation: { method: row.validationMethod, quorum: row.quorum },
    deadlineAt: row.deadlineAt,
    state: row.state,
    lots: {
      total: row.lotCount,
      verified: row.verifiedLots,
      failed: row.failedLots,
      pending: row.lotCount - row.verifiedLots - row.failedLots,
    },
    createdAt: row.createdAt,
    closedAt: row.closedAt,
    purgedAt: row.purgedAt,
  };
}

export function skyComputeGridStore(db: Database, options: ComputeGridStoreOptions) {
  const skus = options.skus ?? COMPUTE_SKUS;

  function enabled() {
    if (options.mode === 'disabled') throw new ComputeGridLiveError('compute_grid_disabled', 503);
  }

  function dataKey() {
    if (!computeGridDataKeyConfigured(options.dataKey))
      throw new ComputeGridLiveError('compute_grid_data_key_unavailable', 503);
    return options.dataKey;
  }

  function skuOf(skuId: string): ComputeSkuDefinition {
    const sku = skus.get(skuId);
    if (!sku) throw new ComputeGridLiveError('sku_not_reviewed', 503);
    return sku;
  }

  const offerByDevice = (ownerUserId: string, deviceRef: string, skuId: string) =>
    db.prepare(`SELECT ${OFFER_COLUMNS} FROM sky_compute_offers
      WHERE owner_user_id = ? AND device_ref = ? AND sku_id = ?`)
      .bind(ownerUserId, deviceRef, skuId).first<OfferRow>();

  const orderById = (orderId: string) =>
    db.prepare(`SELECT ${ORDER_COLUMNS} FROM sky_compute_orders WHERE id = ?`).bind(orderId).first<OrderRow>();

  const ownedOrder = (ownerUserId: string, orderId: string) =>
    db.prepare(`SELECT ${ORDER_COLUMNS} FROM sky_compute_orders WHERE id = ? AND owner_user_id = ?`)
      .bind(orderId, ownerUserId).first<OrderRow>();

  const leaseById = (leaseId: string) =>
    db.prepare(`SELECT ${LEASE_COLUMNS} FROM sky_compute_leases WHERE id = ?`).bind(leaseId).first<LeaseRow>();

  const lotByKey = (orderId: string, lotId: string) =>
    db.prepare(`SELECT ${LOT_COLUMNS} FROM sky_compute_lots WHERE order_id = ? AND lot_id = ?`)
      .bind(orderId, lotId).first<LotRow>();

  async function lotInput(order: OrderRow, lot: LotRow) {
    if (!lot.inputCiphertext || !lot.inputNonce) return null;
    return openComputeBytes(
      { ciphertext: lot.inputCiphertext, nonce: lot.inputNonce, keyVersion: lot.keyVersion },
      dataKey(),
      { role: 'lot-input', ownerUserId: order.ownerUserId, orderId: order.id, lotId: lot.lotId, sha256: lot.inputSha256 },
    );
  }

  async function assignmentOutput(order: OrderRow, assignment: AssignmentRow) {
    if (!assignment.outputCiphertext || !assignment.outputNonce || !assignment.outputSha256) return null;
    return openComputeBytes(
      { ciphertext: assignment.outputCiphertext, nonce: assignment.outputNonce, keyVersion: COMPUTE_GRID_KEY_VERSION },
      dataKey(),
      {
        role: 'lot-output', ownerUserId: order.ownerUserId, orderId: order.id, lotId: assignment.lotId,
        assignmentId: assignment.id, sha256: assignment.outputSha256,
      },
    );
  }

  /** Give back what the order still holds once it is closed. Safe to repeat. */
  function holdRelease(orderId: string, now: number) {
    return db.prepare(`INSERT INTO sky_compute_credit_entries
        (id, owner_user_id, kind, balance_delta_micros, held_delta_micros, order_id, lease_id,
         assignment_id, idempotency_key, created_at)
      SELECT 'hold_release:' || o.id, o.owner_user_id, 'hold_release', 0,
        -(o.budget_micros - o.settled_micros), o.id, NULL, NULL, 'hold_release:' || o.id, ?
      FROM sky_compute_orders o
      WHERE o.id = ? AND o.state <> 'open' AND o.pool = 'public'
        AND o.budget_micros - o.settled_micros > 0
        AND NOT EXISTS (SELECT 1 FROM sky_compute_credit_entries e
          WHERE e.idempotency_key = 'hold_release:' || o.id)`).bind(now, orderId);
  }

  async function closeOrderIfDone(orderId: string, now: number) {
    await db.batch([
      db.prepare(`UPDATE sky_compute_orders
        SET state = CASE WHEN failed_lots = 0 THEN 'completed' ELSE 'completed_with_failures' END,
            closed_at = ?, updated_at = ?
        WHERE id = ? AND state = 'open' AND verified_lots + failed_lots = lot_count
          AND reserved_micros = 0
          AND NOT EXISTS (SELECT 1 FROM sky_compute_assignments a
            WHERE a.order_id = sky_compute_orders.id AND a.state IN ('leased', 'submitted'))`)
        .bind(now, now, orderId),
      holdRelease(orderId, now),
    ]);
  }

  /**
   * Decide one lot from the results currently on file.
   *
   * - `owner_trust`: the owner's own attested device is believed.
   * - `independent_reference`: the coordinator recomputes the lot.
   * - `duplicate_quorum`: enough different providers must agree with each other.
   * Exact SKUs compare bytes; floating-point SKUs compare cosine similarity.
   */
  async function settleLot(orderId: string, lotId: string, now: number) {
    for (let round = 0; round < 4; round += 1) {
      const [order, lot] = await Promise.all([orderById(orderId), lotByKey(orderId, lotId)]);
      if (!order || !lot) return;
      const sku = skuOf(order.skuId);
      const submitted = (await db.prepare(`SELECT ${ASSIGNMENT_COLUMNS} FROM sky_compute_assignments
        WHERE order_id = ? AND lot_id = ? AND state = 'submitted' ORDER BY created_at ASC, id ASC`)
        .bind(orderId, lotId).all<AssignmentRow>()).results;
      if (submitted.length === 0) return;

      const outputs = new Map<string, Uint8Array>();
      for (const assignment of submitted) {
        const bytes = await assignmentOutput(order, assignment);
        if (bytes) outputs.set(assignment.id, bytes);
      }
      const agree = (left: Uint8Array | undefined, right: Uint8Array | undefined) =>
        left !== undefined && right !== undefined && compareLotOutputs(sku, lot.itemCount, left, right).agrees;
      const toState = (assignment: AssignmentRow, state: 'verified' | 'rejected' | 'unverified', reason: string, guard: string, binds: unknown[]) =>
        db.prepare(`UPDATE sky_compute_assignments SET state = ?, detail_json = ?, updated_at = ?
          WHERE id = ? AND state = 'submitted' AND ${guard}`)
          .bind(state, JSON.stringify({ decidedBy: order.validationMethod, reason }), now, assignment.id, ...binds);
      const lotIs = (state: string) => `EXISTS (SELECT 1 FROM sky_compute_lots t
        WHERE t.order_id = ? AND t.lot_id = ? AND t.state = '${state}')`;
      const verifiedBy = `EXISTS (SELECT 1 FROM sky_compute_lots t WHERE t.order_id = ? AND t.lot_id = ?
        AND t.state = 'verified' AND t.verified_assignment_id = ?)`;

      // The lot was decided earlier: late results are judged against that answer.
      if (lot.state === 'verified') {
        const canonicalRow = await db.prepare(`SELECT ${ASSIGNMENT_COLUMNS} FROM sky_compute_assignments WHERE id = ?`)
          .bind(lot.verifiedAssignmentId).first<AssignmentRow>();
        const canonical = canonicalRow ? await assignmentOutput(order, canonicalRow) : null;
        await db.batch(submitted.map((assignment) => agree(outputs.get(assignment.id), canonical ?? undefined)
          ? toState(assignment, 'verified', 'agrees_with_verified_output', lotIs('verified'), [orderId, lotId])
          : toState(assignment, canonical ? 'rejected' : 'unverified',
              canonical ? 'differs_from_verified_output' : 'verified_output_purged', lotIs('verified'), [orderId, lotId])));
        continue;
      }
      if (lot.state !== 'queued') {
        await db.batch(submitted.map((assignment) =>
          toState(assignment, 'unverified', `lot_${lot.state}`, lotIs(lot.state), [orderId, lotId])));
        continue;
      }

      // Choose the result that becomes the lot's answer, and who agrees with it.
      let pivot: AssignmentRow | null = null;
      let members: AssignmentRow[] = [];
      let losers: AssignmentRow[] = [];
      if (order.validationMethod === 'owner_trust') {
        pivot = submitted[0];
        members = [pivot];
      } else if (order.validationMethod === 'independent_reference') {
        const input = await lotInput(order, lot);
        if (!input || !sku.reference) return;
        const reference = sku.reference(decodeLotInput(input));
        pivot = submitted.find((assignment) => agree(outputs.get(assignment.id), reference)) ?? null;
        members = pivot ? [pivot] : [];
        losers = submitted.filter((assignment) => !agree(outputs.get(assignment.id), reference));
      } else {
        for (const candidate of submitted) {
          const group = submitted.filter((other) => agree(outputs.get(candidate.id), outputs.get(other.id)));
          if (group.length > members.length) {
            pivot = candidate;
            members = group;
          }
        }
        if (members.length < order.quorum) {
          pivot = null;
          members = [];
        } else losers = submitted.filter((assignment) => !members.includes(assignment));
      }

      if (pivot) {
        const answer = pivot;
        await db.batch([
          db.prepare(`UPDATE sky_compute_lots
            SET state = 'verified', verified_assignment_id = ?, verified_output_sha256 = ?,
                open_slots = 0, input_ciphertext = NULL, input_nonce = NULL, updated_at = ?
            WHERE order_id = ? AND lot_id = ? AND state = 'queued'
              AND EXISTS (SELECT 1 FROM sky_compute_assignments a WHERE a.id = ? AND a.state = 'submitted')`)
            .bind(answer.id, answer.outputSha256, now, orderId, lotId, answer.id),
          ...members.map((assignment) => toState(assignment, 'verified',
            assignment === answer ? 'lot_answer' : 'agrees_with_lot_answer', verifiedBy, [orderId, lotId, answer.id])),
          ...losers.map((assignment) => toState(assignment, 'rejected', 'differs_from_lot_answer',
            verifiedBy, [orderId, lotId, answer.id])),
          // Replicas that are still computing are no longer needed.
          db.prepare(`UPDATE sky_compute_assignments SET state = 'released', updated_at = ?
            WHERE order_id = ? AND lot_id = ? AND state = 'leased' AND ${verifiedBy}`)
            .bind(now, orderId, lotId, orderId, lotId, answer.id),
        ]);
        continue;
      }

      if (order.validationMethod === 'independent_reference') {
        // Every result on file disagrees with the reference: refuse them. The
        // trigger reopens the slot so another device can try.
        await db.batch(losers.map((assignment) =>
          toState(assignment, 'rejected', 'differs_from_reference', lotIs('queued'), [orderId, lotId])));
        return;
      }

      // Quorum not reached. Wait while results can still arrive; otherwise ask
      // one more device, and give up after the allowed extra replicas.
      const outstanding = await db.prepare(`SELECT count(*) AS total FROM sky_compute_assignments
        WHERE order_id = ? AND lot_id = ? AND state = 'leased'`).bind(orderId, lotId).first<{ total: number }>();
      if (lot.openSlots > 0 || (outstanding?.total ?? 0) > 0) return;
      if (lot.requiredResults < order.quorum + COMPUTE_GRID_LIMITS.maximumExtraReplicas) {
        await db.prepare(`UPDATE sky_compute_lots
          SET required_results = required_results + 1, open_slots = open_slots + 1, updated_at = ?
          WHERE order_id = ? AND lot_id = ? AND state = 'queued' AND open_slots = 0
            AND required_results = ?
            AND NOT EXISTS (SELECT 1 FROM sky_compute_assignments a
              WHERE a.order_id = ? AND a.lot_id = ? AND a.state = 'leased')`)
          .bind(now, orderId, lotId, lot.requiredResults, orderId, lotId).run();
        return;
      }
      await db.batch([
        db.prepare(`UPDATE sky_compute_lots
          SET state = 'failed', open_slots = 0, input_ciphertext = NULL, input_nonce = NULL, updated_at = ?
          WHERE order_id = ? AND lot_id = ? AND state = 'queued' AND open_slots = 0 AND required_results = ?`)
          .bind(now, orderId, lotId, lot.requiredResults),
        ...submitted.map((assignment) =>
          toState(assignment, 'unverified', 'no_quorum', lotIs('failed'), [orderId, lotId])),
      ]);
    }
  }

  async function settleSubmittedLots(orderId: string, now: number) {
    const pending = (await db.prepare(`SELECT DISTINCT lot_id AS lotId FROM sky_compute_assignments
      WHERE order_id = ? AND state = 'submitted' LIMIT 128`).bind(orderId).all<{ lotId: string }>()).results;
    for (const { lotId } of pending) await settleLot(orderId, lotId, now);
  }

  /** Close an order that can no longer make progress (cancelled or past its deadline). */
  async function endOrder(order: OrderRow, reason: 'cancelled' | 'expired', now: number) {
    await settleSubmittedLots(order.id, now);
    await db.batch([
      db.prepare(`UPDATE sky_compute_leases SET state = 'released', closed_at = ?
        WHERE order_id = ? AND state = 'active'`).bind(now, order.id),
      db.prepare(`UPDATE sky_compute_assignments SET state = 'unverified', detail_json = ?, updated_at = ?
        WHERE order_id = ? AND state = 'submitted'`)
        .bind(JSON.stringify({ reason: `order_${reason}` }), now, order.id),
      db.prepare(`UPDATE sky_compute_lots
        SET state = 'cancelled', open_slots = 0, input_ciphertext = NULL, input_nonce = NULL, updated_at = ?
        WHERE order_id = ? AND state = 'queued'`).bind(now, order.id),
      db.prepare(`UPDATE sky_compute_orders
        SET state = CASE WHEN verified_lots = lot_count THEN 'completed' ELSE ? END,
            closed_at = ?, updated_at = ?
        WHERE id = ? AND state = 'open' AND reserved_micros = 0`).bind(reason, now, now, order.id),
      holdRelease(order.id, now),
    ]);
  }

  /**
   * Housekeeping that every claim and order read triggers. Bounded per call:
   * reclaim leases that ran out, give up on lots that failed too often, end
   * orders past their deadline, close finished orders, and purge old payloads.
   */
  async function sweep(now = Date.now()) {
    const reclaimBefore = now - COMPUTE_GRID_LIMITS.receiptGraceMs;
    await db.prepare(`UPDATE sky_compute_leases SET state = 'expired', closed_at = ?
      WHERE id IN (SELECT id FROM sky_compute_leases
        WHERE state = 'active' AND expires_at <= ? ORDER BY expires_at ASC LIMIT 200)`)
      .bind(now, reclaimBefore).run();

    const exhausted = (await db.prepare(`SELECT order_id AS orderId, lot_id AS lotId FROM sky_compute_lots t
      WHERE t.state = 'queued' AND t.attempts >= ?
        AND NOT EXISTS (SELECT 1 FROM sky_compute_assignments a
          WHERE a.order_id = t.order_id AND a.lot_id = t.lot_id AND a.state = 'leased')
      LIMIT 64`).bind(COMPUTE_GRID_LIMITS.maximumAttemptsPerLot).all<{ orderId: string; lotId: string }>()).results;
    const touched = new Set<string>();
    for (const { orderId, lotId } of exhausted) {
      await settleLot(orderId, lotId, now);
      await db.batch([
        db.prepare(`UPDATE sky_compute_lots
          SET state = 'failed', open_slots = 0, input_ciphertext = NULL, input_nonce = NULL, updated_at = ?
          WHERE order_id = ? AND lot_id = ? AND state = 'queued' AND attempts >= ?
            AND NOT EXISTS (SELECT 1 FROM sky_compute_assignments a
              WHERE a.order_id = ? AND a.lot_id = ? AND a.state = 'leased')`)
          .bind(now, orderId, lotId, COMPUTE_GRID_LIMITS.maximumAttemptsPerLot, orderId, lotId),
        db.prepare(`UPDATE sky_compute_assignments SET state = 'unverified', detail_json = ?, updated_at = ?
          WHERE order_id = ? AND lot_id = ? AND state = 'submitted'
            AND EXISTS (SELECT 1 FROM sky_compute_lots t
              WHERE t.order_id = ? AND t.lot_id = ? AND t.state = 'failed')`)
          .bind(JSON.stringify({ reason: 'lot_attempts_exhausted' }), now, orderId, lotId, orderId, lotId),
      ]);
      touched.add(orderId);
    }

    const overdue = (await db.prepare(`SELECT ${ORDER_COLUMNS} FROM sky_compute_orders
      WHERE state = 'open' AND deadline_at <= ? ORDER BY deadline_at ASC LIMIT 16`)
      .bind(reclaimBefore).all<OrderRow>()).results;
    for (const order of overdue) await endOrder(order, 'expired', now);

    const finished = (await db.prepare(`SELECT id FROM sky_compute_orders
      WHERE state = 'open' AND verified_lots + failed_lots = lot_count LIMIT 32`).all<{ id: string }>()).results;
    for (const id of new Set([...touched, ...finished.map((row) => row.id)])) {
      await settleSubmittedLots(id, now);
      await closeOrderIfDone(id, now);
    }

    const stale = (await db.prepare(`SELECT id FROM sky_compute_orders
      WHERE state <> 'open' AND purged_at IS NULL AND closed_at <= ? LIMIT 16`)
      .bind(now - COMPUTE_GRID_LIMITS.outputRetentionMs).all<{ id: string }>()).results;
    for (const { id } of stale) await purge(id, now);
  }

  async function purge(orderId: string, now: number) {
    await db.batch([
      db.prepare(`UPDATE sky_compute_assignments SET output_ciphertext = NULL, output_nonce = NULL
        WHERE order_id = ? AND output_ciphertext IS NOT NULL
          AND EXISTS (SELECT 1 FROM sky_compute_orders o WHERE o.id = ? AND o.state <> 'open')`)
        .bind(orderId, orderId),
      db.prepare(`UPDATE sky_compute_lots SET input_ciphertext = NULL, input_nonce = NULL
        WHERE order_id = ? AND input_ciphertext IS NOT NULL
          AND EXISTS (SELECT 1 FROM sky_compute_orders o WHERE o.id = ? AND o.state <> 'open')`)
        .bind(orderId, orderId),
      db.prepare(`UPDATE sky_compute_orders SET purged_at = ?, updated_at = ?
        WHERE id = ? AND state <> 'open' AND purged_at IS NULL`).bind(now, now, orderId),
    ]);
  }

  async function leaseDocument(lease: LeaseRow) {
    const order = await orderById(lease.orderId);
    if (!order) throw new ComputeGridLiveError('lease_order_missing', 503);
    const rows = (await db.prepare(`SELECT ${qualify(LOT_COLUMNS, 't')}
      FROM sky_compute_assignments a JOIN sky_compute_lots t
        ON t.order_id = a.order_id AND t.lot_id = a.lot_id
      WHERE a.lease_id = ? AND a.state = 'leased' ORDER BY t.lot_id ASC`)
      .bind(lease.id).all<LotRow>()).results;
    const lots = [];
    for (const lot of rows) {
      const input = await lotInput(order, lot);
      if (!input) continue;
      lots.push({
        lotId: lot.lotId,
        inputSha256: lot.inputSha256,
        inputBytes: lot.inputBytes,
        itemCount: lot.itemCount,
        input: computeGridBase64.encode(input),
      });
    }
    return {
      schema: COMPUTE_GRID_LEASE_SCHEMA,
      leaseId: lease.id,
      orderId: lease.orderId,
      skuId: lease.skuId,
      runtimeArtifactSha256: order.runtimeArtifactSha256,
      modelSha256: order.modelSha256,
      tokenizerSha256: order.tokenizerSha256,
      pool: lease.pool,
      dataClass: order.dataClass,
      priceMicrosPerLot: lease.priceMicrosPerLot,
      asset: COMPUTE_GRID_CREDIT_ASSET,
      issuedAt: lease.issuedAt,
      expiresAt: lease.expiresAt,
      executionPolicy: COMPUTE_GRID_EXECUTION_POLICY,
      lots,
    };
  }

  async function receiptOutcome(lease: LeaseRow, stored: { outcome: string; outcomeJson: string }) {
    const rows = (await db.prepare(`SELECT lot_id AS lotId, state, detail_json AS detailJson
      FROM sky_compute_assignments WHERE lease_id = ? ORDER BY lot_id ASC`)
      .bind(lease.id).all<{ lotId: string; state: string; detailJson: string | null }>()).results;
    const recorded = JSON.parse(stored.outcomeJson) as { reasons: string[]; checks: Record<string, string> };
    return {
      leaseId: lease.id,
      state: stored.outcome as 'accepted' | 'rejected',
      reasons: recorded.reasons,
      lots: rows.map((row) => ({
        lotId: row.lotId,
        // What became of the lot for this device, as currently on the books.
        state: row.state,
        check: recorded.checks[row.lotId] ?? 'not_reported',
      })),
    };
  }

  async function listOffers(ownerUserId: string) {
    const rows = await db.prepare(`SELECT ${OFFER_COLUMNS} FROM sky_compute_offers
      WHERE owner_user_id = ? ORDER BY updated_at DESC LIMIT 100`).bind(ownerUserId).all<OfferRow>();
    return rows.results.map(offerView);
  }

  /** Credits of one account. `available` is what a new public order may hold. */
  async function account(ownerUserId: string) {
    const row = await db.prepare(`SELECT balance_micros AS balance, held_micros AS held
      FROM sky_compute_credit_accounts WHERE owner_user_id = ?`).bind(ownerUserId)
      .first<{ balance: number; held: number }>();
    const entries = await db.prepare(`SELECT id, kind, balance_delta_micros AS balanceDeltaMicros,
        held_delta_micros AS heldDeltaMicros, order_id AS orderId, created_at AS createdAt
      FROM sky_compute_credit_entries WHERE owner_user_id = ?
      ORDER BY created_at DESC, id DESC LIMIT 100`).bind(ownerUserId).all();
    const balance = row?.balance ?? 0;
    const held = row?.held ?? 0;
    return {
      asset: COMPUTE_GRID_CREDIT_ASSET,
      balanceMicros: balance,
      heldMicros: held,
      availableMicros: balance - held,
      // Credits are bookkeeping inside the grid. They are not money, cannot
      // be withdrawn, and are not yet redeemable against other services.
      redeemable: false as const,
      entries: entries.results,
    };
  }

  return {
    sweep,

    /** Register or refresh what one enrolled device offers for one SKU. */
    async registerOffer(ownerUserId: string, request: RequestOf<'offer'>, now = Date.now()) {
      enabled();
      const terms = request.offer;
      if (terms.pools.includes('public') && options.mode !== 'owner_and_public_pool')
        throw new ComputeGridLiveError('public_pool_not_enabled', 403);
      if (terms.availableUntil <= now) throw new ComputeGridLiveError('offer_window_elapsed');
      const reference = await computeGridProviderReference(ownerUserId, request.deviceRef);
      // Replaying an older signed offer never overwrites a newer one.
      await db.prepare(`INSERT INTO sky_compute_offers
          (id, owner_user_id, device_ref, authority_id, key_id, sku_id, serves_owner_pool,
           serves_public_pool, provider_ref_hash, provider_pseudonym, platform, abi, region, trust_tier,
           runtime_artifact_sha256, model_sha256, tokenizer_sha256, memory_mib, max_lots_per_lease,
           price_micros_per_lot, max_input_bytes_per_lot, data_classes_json, available_from,
           available_until, state, signed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'hardware_backed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
        ON CONFLICT(owner_user_id, device_ref, sku_id) DO UPDATE SET
          authority_id = excluded.authority_id, key_id = excluded.key_id,
          serves_owner_pool = excluded.serves_owner_pool, serves_public_pool = excluded.serves_public_pool,
          region = excluded.region, runtime_artifact_sha256 = excluded.runtime_artifact_sha256,
          model_sha256 = excluded.model_sha256, tokenizer_sha256 = excluded.tokenizer_sha256,
          memory_mib = excluded.memory_mib, max_lots_per_lease = excluded.max_lots_per_lease,
          price_micros_per_lot = excluded.price_micros_per_lot,
          max_input_bytes_per_lot = excluded.max_input_bytes_per_lot,
          data_classes_json = excluded.data_classes_json, available_from = excluded.available_from,
          available_until = excluded.available_until, state = 'active',
          signed_at = excluded.signed_at, updated_at = excluded.updated_at
        WHERE excluded.signed_at > sky_compute_offers.signed_at`)
        .bind(crypto.randomUUID(), ownerUserId, request.deviceRef, request.authorityId, request.keyId,
          terms.skuId, terms.pools.includes('owner') ? 1 : 0, terms.pools.includes('public') ? 1 : 0,
          reference.providerRefHash, reference.providerPseudonym, terms.platform, terms.abi, terms.region,
          terms.runtimeArtifactSha256, terms.modelSha256, terms.tokenizerSha256, terms.memoryMiB,
          terms.maxLotsPerLease, terms.priceMicrosPerLot, terms.maxInputBytesPerLot,
          JSON.stringify([...terms.dataClasses].sort()), terms.availableFrom, terms.availableUntil,
          request.issuedAt, now, now).run();
      const stored = await offerByDevice(ownerUserId, request.deviceRef, terms.skuId);
      if (!stored || stored.signedAt !== request.issuedAt || stored.keyId !== request.keyId)
        throw new ComputeGridLiveError('offer_superseded', 409);
      return offerView(stored);
    },

    async withdrawOffer(ownerUserId: string, request: RequestOf<'withdraw'>, now = Date.now()) {
      enabled();
      const result = await db.prepare(`UPDATE sky_compute_offers
        SET state = 'withdrawn', signed_at = ?, updated_at = ?
        WHERE owner_user_id = ? AND device_ref = ? AND sku_id = ? AND signed_at < ?`)
        .bind(request.issuedAt, now, ownerUserId, request.deviceRef, request.skuId, request.issuedAt).run();
      if (changes(result) !== 1) throw new ComputeGridLiveError('offer_not_registered', 409);
      return { withdrawn: true, deviceRef: request.deviceRef, skuId: request.skuId };
    },

    listOffers,

    /** Store an order and its lot contents. Repeating the same request is a no-op. */
    async createOrder(ownerUserId: string, order: ParsedComputeOrder, now = Date.now()) {
      enabled();
      const key = dataKey();
      const existing = await orderById(order.orderId);
      if (existing) {
        if (existing.ownerUserId !== ownerUserId || existing.requestSha256 !== order.requestSha256)
          throw new ComputeGridLiveError('order_id_conflict', 409);
        return { created: false, order: orderView(existing) };
      }
      const open = await db.prepare(`SELECT count(*) AS total FROM sky_compute_orders
        WHERE owner_user_id = ? AND state = 'open'`).bind(ownerUserId).first<{ total: number }>();
      if ((open?.total ?? 0) >= COMPUTE_GRID_LIMITS.maxOpenOrdersPerOwner)
        throw new ComputeGridLiveError('too_many_open_orders', 429);

      const statements = [
        db.prepare(`INSERT INTO sky_compute_orders
            (id, owner_user_id, pool, sku_id, data_class, runtime_artifact_sha256, model_sha256,
             tokenizer_sha256, regions_json, minimum_memory_mib, maximum_price_micros_per_lot,
             budget_micros, reserved_micros, settled_micros, sky_fee_bps, validation_method, quorum,
             deadline_at, state, lot_count, verified_lots, failed_lots, request_sha256, created_at,
             updated_at, closed_at, purged_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, 'open', ?, 0, 0, ?, ?, ?, NULL, NULL)`)
          .bind(order.orderId, ownerUserId, order.pool, order.sku.skuId, order.dataClass,
            order.sku.artifacts.runtimeArtifactSha256, order.sku.artifacts.modelSha256,
            order.sku.artifacts.tokenizerSha256, JSON.stringify(order.regions), order.minimumMemoryMiB,
            order.maximumPriceMicrosPerLot, order.budgetMicros, order.validation.method,
            order.validation.quorum, order.deadlineAt, order.lots.length, order.requestSha256, now, now),
        // A public order holds its whole budget. The account check refuses the
        // batch when the buyer does not have that many credits available.
        db.prepare(`INSERT INTO sky_compute_credit_entries
            (id, owner_user_id, kind, balance_delta_micros, held_delta_micros, order_id, lease_id,
             assignment_id, idempotency_key, created_at)
          SELECT 'hold:' || o.id, o.owner_user_id, 'hold', 0, o.budget_micros, o.id, NULL, NULL,
            'hold:' || o.id, ?
          FROM sky_compute_orders o WHERE o.id = ? AND o.pool = 'public' AND o.budget_micros > 0`)
          .bind(now, order.orderId),
      ];
      for (const lot of order.lots) {
        const sealed = await sealComputeBytes(lot.input, key, {
          role: 'lot-input', ownerUserId, orderId: order.orderId, lotId: lot.lotId, sha256: lot.inputSha256,
        });
        statements.push(db.prepare(`INSERT INTO sky_compute_lots
            (order_id, lot_id, owner_user_id, input_sha256, input_bytes, item_count, input_ciphertext,
             input_nonce, key_version, state, required_results, open_slots, attempts,
             verified_output_sha256, verified_assignment_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, 0, NULL, NULL, ?, ?)`)
          .bind(order.orderId, lot.lotId, ownerUserId, lot.inputSha256, lot.input.byteLength,
            lot.itemCount, sealed.ciphertext, sealed.nonce, sealed.keyVersion,
            order.validation.quorum, order.validation.quorum, now, now));
      }
      try {
        await db.batch(statements);
      } catch (error) {
        const raced = await orderById(order.orderId);
        if (raced && raced.ownerUserId === ownerUserId && raced.requestSha256 === order.requestSha256)
          return { created: false, order: orderView(raced) };
        if (raced) throw new ComputeGridLiveError('order_id_conflict', 409);
        if (order.pool === 'public' && order.budgetMicros > 0) {
          const account = await db.prepare(`SELECT balance_micros AS balance, held_micros AS held
            FROM sky_compute_credit_accounts WHERE owner_user_id = ?`).bind(ownerUserId)
            .first<{ balance: number; held: number }>();
          if ((account?.balance ?? 0) - (account?.held ?? 0) < order.budgetMicros)
            throw new ComputeGridLiveError('insufficient_credits', 402);
        }
        throw error;
      }
      const stored = await orderById(order.orderId);
      if (!stored) throw new ComputeGridLiveError('order_not_stored', 503);
      return { created: true, order: orderView(stored) };
    },

    async listOrders(ownerUserId: string, now = Date.now()) {
      enabled();
      await sweep(now);
      const rows = await db.prepare(`SELECT ${ORDER_COLUMNS} FROM sky_compute_orders
        WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 50`).bind(ownerUserId).all<OrderRow>();
      return rows.results.map(orderView);
    },

    /** One order with the state of every lot. Never shows who computed a lot. */
    async getOrder(ownerUserId: string, orderId: string, now = Date.now()) {
      enabled();
      await sweep(now);
      const order = await ownedOrder(ownerUserId, orderId);
      if (!order) return null;
      const lots = (await db.prepare(`SELECT t.lot_id AS lotId, t.state, t.input_sha256 AS inputSha256,
          t.input_bytes AS inputBytes, t.item_count AS itemCount, t.attempts,
          t.required_results AS requiredResults, t.verified_output_sha256 AS outputSha256,
          (SELECT f.provider_pseudonym FROM sky_compute_assignments a
             JOIN sky_compute_leases l ON l.id = a.lease_id
             JOIN sky_compute_offers f ON f.id = l.offer_id
            WHERE a.id = t.verified_assignment_id) AS providerPseudonym,
          (SELECT f.region FROM sky_compute_assignments a
             JOIN sky_compute_leases l ON l.id = a.lease_id
             JOIN sky_compute_offers f ON f.id = l.offer_id
            WHERE a.id = t.verified_assignment_id) AS providerRegion
        FROM sky_compute_lots t WHERE t.order_id = ? ORDER BY t.lot_id ASC`).bind(orderId).all()).results;
      return { ...orderView(order), lotDetails: lots };
    },

    /** Verified outputs of an order, decrypted for its owner. */
    async orderResults(ownerUserId: string, orderId: string, now = Date.now()) {
      enabled();
      await sweep(now);
      const order = await ownedOrder(ownerUserId, orderId);
      if (!order) return null;
      const sku = skuOf(order.skuId);
      const rows = (await db.prepare(`SELECT ${qualify(ASSIGNMENT_COLUMNS, 'a')},
          t.item_count AS itemCount
        FROM sky_compute_lots t JOIN sky_compute_assignments a ON a.id = t.verified_assignment_id
        WHERE t.order_id = ? AND t.state = 'verified' ORDER BY t.lot_id ASC`)
        .bind(orderId).all<AssignmentRow & { itemCount: number }>()).results;
      const results = [];
      for (const row of rows) {
        const bytes = await assignmentOutput(order, row);
        results.push({
          lotId: row.lotId,
          itemCount: row.itemCount,
          outputSha256: row.outputSha256,
          outputBytes: row.outputBytes,
          output: bytes ? computeGridBase64.encode(bytes) : null,
        });
      }
      return {
        orderId,
        skuId: order.skuId,
        state: order.state,
        output: { encoding: sku.output.encoding, dimensions: sku.output.dimensions },
        purged: order.purgedAt !== null,
        results,
      };
    },

    async cancelOrder(ownerUserId: string, orderId: string, now = Date.now()) {
      enabled();
      const order = await ownedOrder(ownerUserId, orderId);
      if (!order) return null;
      if (order.state === 'open') await endOrder(order, 'cancelled', now);
      const closed = await ownedOrder(ownerUserId, orderId);
      return closed ? orderView(closed) : null;
    },

    /** Delete the stored inputs and outputs of a closed order now. */
    async purgeOrder(ownerUserId: string, orderId: string, now = Date.now()) {
      enabled();
      const order = await ownedOrder(ownerUserId, orderId);
      if (!order) return null;
      if (order.state === 'open') throw new ComputeGridLiveError('order_still_open', 409);
      await purge(orderId, now);
      const purged = await ownedOrder(ownerUserId, orderId);
      return purged ? orderView(purged) : null;
    },

    /**
     * A device asks for work. It gets at most one lease at a time, only while
     * it reports charging, idle, unmetered and cool, and only for orders its
     * offer is compatible with. Asking again returns the lease it already holds.
     */
    async claim(ownerUserId: string, request: RequestOf<'claim'>, now = Date.now()) {
      enabled();
      const offer = await offerByDevice(ownerUserId, request.deviceRef, request.skuId);
      if (!offer || offer.state !== 'active') throw new ComputeGridLiveError('offer_not_registered', 409);
      if (offer.keyId !== request.keyId) throw new ComputeGridLiveError('offer_key_mismatch', 409);
      await db.prepare(`UPDATE sky_compute_offers
        SET conditions_json = ?, conditions_observed_at = ?, updated_at = ? WHERE id = ?`)
        .bind(JSON.stringify(request.conditions), now, now, offer.id).run();
      const reasons = conditionRejections(request.conditions);
      // A lease shorter than half a minute cannot finish a lot.
      if (now < offer.availableFrom || now > offer.availableUntil - 30_000) reasons.push('outside_supply_window');
      await sweep(now);

      const held = await db.prepare(`SELECT ${LEASE_COLUMNS} FROM sky_compute_leases
        WHERE provider_owner_user_id = ? AND device_ref = ? AND state = 'active'`)
        .bind(ownerUserId, request.deviceRef).first<LeaseRow>();
      if (reasons.length > 0) return { lease: null, reasons, heldLeaseId: held?.id ?? null };
      if (held) {
        if (held.expiresAt <= now) return { lease: null, reasons: ['previous_lease_in_grace'], heldLeaseId: held.id };
        const document = await leaseDocument(held);
        if (document.lots.length > 0 && held.skuId === request.skuId)
          return { lease: document, reasons: [], heldLeaseId: held.id };
        if (document.lots.length > 0) return { lease: null, reasons: ['another_lease_active'], heldLeaseId: held.id };
        // Every lot of the lease was settled by other devices: close it quietly.
        await db.prepare(`UPDATE sky_compute_leases SET state = 'released', closed_at = ?
          WHERE id = ? AND state = 'active'`).bind(now, held.id).run();
      }

      const publicAllowed = options.mode === 'owner_and_public_pool' && offer.servesPublicPool === 1 ? 1 : 0;
      const minimumDeadline = now + 30_000;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const candidates = (await db.prepare(`SELECT ${qualify(ORDER_COLUMNS, 'o')}
          FROM sky_compute_orders o
          WHERE o.state = 'open' AND o.sku_id = ? AND o.deadline_at > ?
            AND o.runtime_artifact_sha256 = ? AND o.model_sha256 = ? AND o.tokenizer_sha256 = ?
            AND o.minimum_memory_mib <= ?
            AND ((o.pool = 'owner' AND o.owner_user_id = ? AND ? = 1)
              OR (o.pool = 'public' AND ? = 1 AND o.maximum_price_micros_per_lot >= ?
                  AND (? = 0 OR o.budget_micros - o.reserved_micros - o.settled_micros >= ?)))
            AND EXISTS (SELECT 1 FROM json_each(?) d WHERE d.value = o.data_class)
            AND (json_array_length(o.regions_json) = 0
              OR EXISTS (SELECT 1 FROM json_each(o.regions_json) r WHERE r.value = ?))
            AND EXISTS (SELECT 1 FROM sky_compute_lots t
              WHERE t.order_id = o.id AND t.state = 'queued' AND t.open_slots > 0
                AND t.input_bytes <= ? AND ${NO_PRIOR_ASSIGNMENT.replace("? = 'public'", "o.pool = 'public'")})
          ORDER BY o.deadline_at ASC, o.created_at ASC LIMIT 8`)
          .bind(request.skuId, minimumDeadline, offer.runtimeArtifactSha256, offer.modelSha256,
            offer.tokenizerSha256, offer.memoryMib, ownerUserId, offer.servesOwnerPool, publicAllowed,
            offer.priceMicrosPerLot, offer.priceMicrosPerLot, offer.priceMicrosPerLot, offer.dataClassesJson,
            offer.region, offer.maxInputBytesPerLot, ownerUserId, request.deviceRef).all<OrderRow>()).results;
        if (candidates.length === 0) return { lease: null, reasons: ['no_matching_work'], heldLeaseId: null };

        let contended = false;
        for (const order of candidates) {
          const price = order.pool === 'owner' ? 0 : offer.priceMicrosPerLot;
          const affordable = price === 0
            ? COMPUTE_GRID_LIMITS.maxLotsPerLease
            : Math.floor((order.budgetMicros - order.reservedMicros - order.settledMicros) / price);
          const limit = Math.min(offer.maxLotsPerLease, COMPUTE_GRID_LIMITS.maxLotsPerLease, affordable);
          if (limit < 1) continue;
          const lots = (await db.prepare(`SELECT t.lot_id AS lotId FROM sky_compute_lots t
            WHERE t.order_id = ? AND t.state = 'queued' AND t.open_slots > 0 AND t.input_bytes <= ?
              AND ${NO_PRIOR_ASSIGNMENT}
            ORDER BY t.attempts ASC, t.lot_id ASC LIMIT ?`)
            .bind(order.id, offer.maxInputBytesPerLot, ownerUserId, request.deviceRef, order.pool, limit)
            .all<{ lotId: string }>()).results;
          if (lots.length === 0) continue;

          const leaseId = crypto.randomUUID();
          const expiresAt = Math.min(now + COMPUTE_GRID_LIMITS.leaseTtlMs, order.deadlineAt, offer.availableUntil);
          try {
            await db.batch([
              db.prepare(`INSERT INTO sky_compute_leases
                  (id, order_id, offer_id, order_owner_user_id, provider_owner_user_id, device_ref,
                   key_id, pool, sku_id, price_micros_per_lot, lot_count, state, issued_at, expires_at, closed_at)
                SELECT ?, o.id, f.id, o.owner_user_id, f.owner_user_id, f.device_ref, f.key_id, o.pool,
                  o.sku_id, ?, 0, 'active', ?, ?, NULL
                FROM sky_compute_orders o JOIN sky_compute_offers f ON f.id = ?
                WHERE o.id = ? AND o.state = 'open' AND o.deadline_at > ?
                  AND f.state = 'active' AND f.signed_at = ? AND f.key_id = ?
                  AND NOT EXISTS (SELECT 1 FROM sky_compute_leases l
                    WHERE l.provider_owner_user_id = f.owner_user_id AND l.device_ref = f.device_ref
                      AND l.state = 'active')`)
                .bind(leaseId, price, now, expiresAt, offer.id, order.id, minimumDeadline,
                  offer.signedAt, request.keyId),
              // One statement per lot: the trigger that takes the slot must not
              // run while a multi-row scan of the same table is still open.
              ...lots.map(({ lotId }) => db.prepare(`INSERT INTO sky_compute_assignments
                  (id, lease_id, order_id, lot_id, order_owner_user_id, provider_owner_user_id,
                   device_ref, price_micros, state, created_at, updated_at)
                SELECT ?, l.id, l.order_id, t.lot_id, l.order_owner_user_id, l.provider_owner_user_id,
                  l.device_ref, l.price_micros_per_lot, 'leased', ?, ?
                FROM sky_compute_leases l JOIN sky_compute_lots t ON t.order_id = l.order_id
                WHERE l.id = ? AND l.state = 'active' AND t.lot_id = ? AND t.state = 'queued'
                  AND t.open_slots > 0 AND ${NO_PRIOR_ASSIGNMENT}`)
                .bind(crypto.randomUUID(), now, now, leaseId, lotId, ownerUserId, request.deviceRef, order.pool)),
              db.prepare(`DELETE FROM sky_compute_leases WHERE id = ? AND lot_count = 0`).bind(leaseId),
            ]);
          } catch {
            // Lost a race for the budget or a lot: look at fresh state and retry.
            contended = true;
            break;
          }
          const lease = await leaseById(leaseId);
          if (lease) return { lease: await leaseDocument(lease), reasons: [], heldLeaseId: lease.id };
          // Nothing was leased: either another request of this device won, or
          // the lots went to someone else between the read and the batch.
          const concurrent = await db.prepare(`SELECT ${LEASE_COLUMNS} FROM sky_compute_leases
            WHERE provider_owner_user_id = ? AND device_ref = ? AND state = 'active'`)
            .bind(ownerUserId, request.deviceRef).first<LeaseRow>();
          if (concurrent) return { lease: await leaseDocument(concurrent), reasons: [], heldLeaseId: concurrent.id };
          contended = true;
        }
        if (!contended) break;
      }
      return { lease: null, reasons: ['no_matching_work'], heldLeaseId: null };
    },

    /** A device hands its lease back without results (owner picked it up, heat, unplugged). */
    async release(ownerUserId: string, request: RequestOf<'release'>, now = Date.now()) {
      enabled();
      const lease = await leaseById(request.leaseId);
      if (!lease || lease.providerOwnerUserId !== ownerUserId || lease.deviceRef !== request.deviceRef)
        throw new ComputeGridLiveError('lease_not_found', 404);
      const results = await db.batch([
        db.prepare(`UPDATE sky_compute_leases SET state = 'released', closed_at = ?
          WHERE id = ? AND state = 'active'`).bind(now, lease.id),
        db.prepare(`UPDATE sky_compute_offers SET released_leases = released_leases + 1
          WHERE id = ? AND EXISTS (SELECT 1 FROM sky_compute_leases l
            WHERE l.id = ? AND l.state = 'released' AND l.closed_at = ?)`).bind(lease.offerId, lease.id, now),
      ]);
      const current = await leaseById(lease.id);
      return { leaseId: lease.id, state: current?.state ?? lease.state, released: changes(results[0]) > 0 };
    },

    /**
     * Take in a signed receipt. One receipt per lease; resending the same bytes
     * returns the recorded outcome and a different receipt for the lease is
     * refused. Results are stored first and judged by `settleLot`.
     */
    async submitReceipt(ownerUserId: string, verified: VerifiedComputeGridDeviceRequest, now = Date.now()) {
      enabled();
      const key = dataKey();
      const request = verified.request;
      if (request.action !== 'receipt') throw new ComputeGridLiveError('device_request_action_invalid');
      const lease = await leaseById(request.leaseId);
      // Another account's lease is indistinguishable from one that never existed.
      if (!lease || lease.providerOwnerUserId !== ownerUserId || lease.deviceRef !== request.deviceRef)
        throw new ComputeGridLiveError('lease_not_found', 404);
      if (lease.keyId !== request.keyId) throw new ComputeGridLiveError('lease_key_mismatch', 409);

      const recorded = () => db.prepare(`SELECT payload_sha256 AS payloadSha256, outcome,
          outcome_json AS outcomeJson FROM sky_compute_receipts WHERE lease_id = ?`)
        .bind(lease.id).first<{ payloadSha256: string; outcome: string; outcomeJson: string }>();
      const replay = async () => {
        const stored = await recorded();
        if (!stored) return null;
        if (stored.payloadSha256 !== verified.payloadSha256)
          throw new ComputeGridLiveError('receipt_conflict', 409);
        return receiptOutcome(lease, stored);
      };
      const earlier = await replay();
      if (earlier) return earlier;
      if (lease.state !== 'active') throw new ComputeGridLiveError('lease_not_active', 409);
      if (now > lease.expiresAt + COMPUTE_GRID_LIMITS.receiptGraceMs) {
        await sweep(now);
        throw new ComputeGridLiveError('lease_expired', 409);
      }

      const order = await orderById(lease.orderId);
      if (!order) throw new ComputeGridLiveError('lease_order_missing', 503);
      const sku = skuOf(order.skuId);
      const assigned = new Map((await db.prepare(`SELECT a.id, a.lot_id AS lotId, a.state,
          t.input_sha256 AS inputSha256, t.item_count AS itemCount
        FROM sky_compute_assignments a JOIN sky_compute_lots t
          ON t.order_id = a.order_id AND t.lot_id = a.lot_id
        WHERE a.lease_id = ?`).bind(lease.id)
        .all<{ id: string; lotId: string; state: string; inputSha256: string; itemCount: number }>())
        .results.map((row) => [row.lotId, row]));

      const reasons: string[] = [];
      if (request.runtimeArtifactSha256 !== order.runtimeArtifactSha256 ||
          request.modelSha256 !== order.modelSha256 || request.tokenizerSha256 !== order.tokenizerSha256)
        reasons.push('artifact_digest_mismatch');
      // Device clocks drift; the coordinator's own clock already enforced the
      // lease window above. This only refuses times that cannot be this lease.
      if (request.startedAt < lease.issuedAt - COMPUTE_GRID_LIMITS.requestPastSkewMs ||
          request.completedAt > now + COMPUTE_GRID_LIMITS.requestFutureSkewMs)
        reasons.push('execution_window_invalid');
      reasons.push(...evidenceRejections(request.deviceEvidence));
      if (request.results.some((result) => !assigned.has(result.lotId))) reasons.push('result_lot_not_leased');

      const checks: Record<string, string> = {};
      const statements: D1PreparedStatement[] = [];
      const touched: string[] = [];
      if (reasons.length === 0) {
        for (const result of request.results) {
          const assignment = assigned.get(result.lotId)!;
          let check = 'stored';
          let bytes: Uint8Array | null = null;
          if (assignment.state !== 'leased') check = 'superseded';
          else if (result.inputSha256 !== assignment.inputSha256) check = 'input_digest_mismatch';
          else {
            try { bytes = computeGridBase64.decode(verified.outputs[result.lotId]); } catch { bytes = null; }
            if (!bytes || bytes.byteLength !== result.outputBytes) check = 'output_length_mismatch';
            else if ((await sha256Hex(bytes)) !== result.outputSha256) check = 'output_digest_mismatch';
            else check = invalidLotOutput(sku, assignment.itemCount, bytes) ?? 'stored';
          }
          checks[result.lotId] = check;
          if (check === 'superseded') continue;
          if (check !== 'stored' || !bytes) {
            statements.push(db.prepare(`UPDATE sky_compute_assignments
              SET state = 'rejected', detail_json = ?, updated_at = ?
              WHERE id = ? AND lease_id = ? AND state = 'leased'`)
              .bind(JSON.stringify({ reason: check }), now, assignment.id, lease.id));
            continue;
          }
          const sealed = await sealComputeBytes(bytes, key, {
            role: 'lot-output', ownerUserId: order.ownerUserId, orderId: order.id, lotId: result.lotId,
            assignmentId: assignment.id, sha256: result.outputSha256,
          });
          statements.push(db.prepare(`UPDATE sky_compute_assignments
            SET state = 'submitted', output_sha256 = ?, output_bytes = ?, output_ciphertext = ?,
                output_nonce = ?, updated_at = ?
            WHERE id = ? AND lease_id = ? AND state = 'leased'`)
            .bind(result.outputSha256, result.outputBytes, sealed.ciphertext, sealed.nonce, now,
              assignment.id, lease.id));
          touched.push(result.lotId);
        }
      }
      const accepted = reasons.length === 0;
      const receipt = db.prepare(`INSERT INTO sky_compute_receipts
          (id, lease_id, provider_owner_user_id, device_ref, key_id, payload, payload_sha256, signature,
           started_at, completed_at, outcome, outcome_json, received_at)
        SELECT ?, l.id, l.provider_owner_user_id, l.device_ref, l.key_id, ?, ?, ?, ?, ?, ?, ?, ?
        FROM sky_compute_leases l WHERE l.id = ? AND l.state = 'active'`)
        .bind(lease.id, verified.payload, verified.payloadSha256, verified.signature,
          request.startedAt, request.completedAt, accepted ? 'accepted' : 'rejected',
          JSON.stringify({ reasons, checks }), now, lease.id);
      try {
        const results = await db.batch([
          receipt,
          ...statements.map((statement) => statement),
          // Lots the device did not report go back to the queue (accepted
          // receipt) or are refused together with the receipt (rejected one).
          db.prepare(`UPDATE sky_compute_leases SET state = ?, closed_at = ?
            WHERE id = ? AND state = 'active'
              AND EXISTS (SELECT 1 FROM sky_compute_receipts r WHERE r.lease_id = ? AND r.payload_sha256 = ?)`)
            .bind(accepted ? 'submitted' : 'rejected', now, lease.id, lease.id, verified.payloadSha256),
          db.prepare(`UPDATE sky_compute_assignments SET state = 'released', updated_at = ?
            WHERE lease_id = ? AND state = 'leased'
              AND EXISTS (SELECT 1 FROM sky_compute_leases l WHERE l.id = ? AND l.state = 'submitted')`)
            .bind(now, lease.id, lease.id),
        ]);
        if (changes(results[0]) < 1) {
          const stored = await replay();
          if (stored) return stored;
          throw new ComputeGridLiveError('lease_not_active', 409);
        }
      } catch (error) {
        if (error instanceof ComputeGridLiveError) throw error;
        // Two copies of the receipt raced: the unique index let one through.
        const stored = await replay();
        if (stored) return stored;
        throw error;
      }
      for (const lotId of touched) await settleLot(order.id, lotId, now);
      await closeOrderIfDone(order.id, now);
      const stored = await recorded();
      if (!stored) throw new ComputeGridLiveError('receipt_not_recorded', 503);
      return receiptOutcome(lease, stored);
    },

    account,

    /**
     * Operator-only starting balance for a pilot account. There is deliberately
     * no API route for this: it is a deployment-side action.
     */
    async grantCredits(ownerUserId: string, amountMicros: number, grantId: string, now = Date.now()) {
      if (!Number.isSafeInteger(amountMicros) || amountMicros < 1 ||
          amountMicros > COMPUTE_GRID_LIMITS.maximumBudgetMicros || !/^[A-Za-z0-9._:-]{1,96}$/.test(grantId))
        throw new ComputeGridLiveError('grant_invalid');
      const result = await db.prepare(`INSERT INTO sky_compute_credit_entries
          (id, owner_user_id, kind, balance_delta_micros, held_delta_micros, order_id, lease_id,
           assignment_id, idempotency_key, created_at)
        SELECT ?, ?, 'grant', ?, 0, NULL, NULL, NULL, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM sky_compute_credit_entries e WHERE e.idempotency_key = ?)`)
        .bind(`grant:${grantId}`, ownerUserId, amountMicros, `grant:${grantId}`, now, `grant:${grantId}`).run();
      return { granted: changes(result) === 1 };
    },

    /** What the signed-in owner sees on the Compute Grid page. */
    async status(ownerUserId: string, now = Date.now()) {
      if (options.mode === 'disabled') return { mode: options.mode, offers: [], orders: [], account: null };
      await sweep(now);
      return {
        mode: options.mode,
        offers: await listOffers(ownerUserId),
        orders: (await db.prepare(`SELECT ${ORDER_COLUMNS} FROM sky_compute_orders
          WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 20`).bind(ownerUserId).all<OrderRow>())
          .results.map(orderView),
        account: await account(ownerUserId),
      };
    },
  };
}

export type SkyComputeGridStore = ReturnType<typeof skyComputeGridStore>;
