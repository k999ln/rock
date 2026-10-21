/**
 * Finite in-memory reference model for design review only.
 * No imports from production, network, credentials, or payment side effects.
 * Atomicity is represented by clone-then-commit. It is NOT a D1 proof.
 */
export const REFUND_OPEN = new Set(['requested', 'submitting', 'unknown', 'pending', 'requires_action']);
const REFUND_FINAL = new Set(['succeeded', 'failed', 'canceled']);
const DISPUTE_OPEN = new Set(['needs_response', 'under_review']);
const DISPUTE_FINAL = new Set(['won', 'lost']);
const stable = (value) => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const groupKey = (o) => JSON.stringify([o.mode, o.buyer, o.packageKey]);

export function decide(order) {
  const refunds = Object.values(order.refunds);
  const disputes = Object.values(order.disputes);
  const refundSucceededMinor = refunds.filter(r => r.status === 'succeeded').reduce((sum, r) => sum + r.amountMinor, 0);
  const refundReservedMinor = refunds.filter(r => REFUND_OPEN.has(r.status)).reduce((sum, r) => sum + r.amountMinor, 0);
  const refundOutcomeUnknown = refunds.some(r => r.status === 'unknown');
  const reasons = [];
  let access;
  if (refundSucceededMinor > order.amountMinor || refundSucceededMinor + refundReservedMinor > order.amountMinor) {
    access = 'suspended'; reasons.push('reconciliation_required');
  } else if (refundSucceededMinor === order.amountMinor || disputes.some(d => d.state === 'lost')) {
    access = 'revoked';
    if (refundSucceededMinor === order.amountMinor) reasons.push('fully_refunded');
    if (disputes.some(d => d.state === 'lost')) reasons.push('dispute_lost');
  } else if (order.refundCaseState !== undefined && order.refundCaseState !== 'none'
      && order.refundEntitlementDisposition === 'keep_revoked') {
    access = 'revoked'; reasons.push('contract_terminated');
  } else if (order.payment !== 'paid') {
    access = order.payment === 'canceled' ? 'revoked' : 'pending'; reasons.push('not_paid');
  } else {
    if (refunds.some(r => REFUND_OPEN.has(r.status))) reasons.push('refund_in_progress');
    if (refundSucceededMinor > 0) reasons.push('partial_refund');
    if (disputes.some(d => DISPUTE_OPEN.has(d.state))) reasons.push('dispute_open');
    if (!order.reviewValid) reasons.push('review_expired');
    if (order.packageRevoked) reasons.push('package_revoked');
    if (!order.manifestMatches) reasons.push('manifest_mismatch');
    if (!order.providerReady) reasons.push('provider_link_required');
    if (order.refundCaseState === 'open') reasons.push('refund_in_progress');
    if (['resolved', 'withdrawn'].includes(order.refundCaseState)
        && order.refundEntitlementDisposition !== 'restore') reasons.push('case_disposition_required');
    if (order.refundReviewRequired) reasons.push('reconciliation_required');
    access = reasons.length ? 'suspended' : 'active';
  }
  // Buyer OAuth linkage affects use readiness, not order ownership or sale eligibility.
  const runtimeReason = access === 'active' && !order.subjectLinked ? 'subject_unlinked' : reasons[0] ?? 'allowed';
  return {
    payment: order.payment,
    money: { capturedMinor: order.payment === 'paid' ? order.amountMinor : 0,
      refundSucceededMinor, refundReservedMinor, refundOutcomeUnknown },
    access, reasons, runtimeAllowed: access === 'active' && order.subjectLinked,
    runtimeReason,
  };
}

export function saleEligible({ offerActive, providerReady, reviewValid, packageRevoked = false }) {
  return offerActive && providerReady && reviewValid && !packageRevoked;
}

export class CommerceModel {
  orders = new Map();
  groups = new Map();
  observations = new Map();
  outbox = [];

  createOrder(id, input = {}) {
    if (this.orders.has(id)) throw new Error('order_exists');
    const order = { id, buyer: 'buyer-A', mode: 'test', packageKey: 'dev.tool@1.0.0',
      amountMinor: 10000, manifest: 'hash-A', payment: 'unpaid', refunds: {}, disputes: {},
      reviewValid: true, packageRevoked: false, manifestMatches: true, providerReady: true,
      subjectLinked: true, refundReviewRequired: false, refundCaseState: 'none', refundEntitlementDisposition: 'undecided', refundCaseHistory: [],
      refundHistory: [], refundAdjustments: [], revision: 0, fence: 0, ...input };
    const key = groupKey(order);
    const group = this.groups.get(key) ?? { key, revision: 0, slot: null, orderIds: [] };
    if (group.slot) return this.orders.get(group.slot); // same buyer/package/mode resumes existing purchase
    if (group.orderIds.some(id => this.orders.get(id).refundReviewRequired)) throw new Error('manual_reconciliation_required');
    group.slot = id;
    group.orderIds.push(id);
    this.orders.set(id, order);
    this.groups.set(key, group);
    this.#publish(order, 'created');
    return structuredClone(order);
  }

  beginObservation(orderId) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('unknown_order');
    order.fence += 1;
    return { orderId, mode: order.mode, expectedOrderRevision: order.revision, leaseFence: order.fence };
  }

  observe(orderId, facts, id = `obs-${this.observations.size + 1}`) {
    return this.applyObservation({ ...this.beginObservation(orderId), observationId: id, facts });
  }

  reserveRefund(orderId, command) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('unknown_order');
    const group = this.groups.get(groupKey(order));
    const { reservationId, amountMinor, expectedRevision, expectedEntitlementRevision } = command;
    if (order.revision !== expectedRevision || group.revision !== expectedEntitlementRevision)
      throw new Error('revision_conflict');
    if (!reservationId || order.refunds[reservationId]) throw new Error('reservation_id_conflict');
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error('refund_invalid');
    const current = decide(order);
    if (order.payment !== 'paid') throw new Error('refund_without_payment');
    if (order.refundReviewRequired || current.money.refundOutcomeUnknown)
      throw new Error('manual_reconciliation_required');
    if (current.money.refundSucceededMinor + current.money.refundReservedMinor + amountMinor > order.amountMinor)
      throw new Error('refund_overallocation');
    // Local operation reservations share the finite model's collection only.
    // Production persists these separately from Provider Refund objects.
    return this.observe(orderId, { refunds: [{ id: reservationId, status: 'requested', amountMinor }] });
  }

  applyObservation(observation) {
    const old = this.observations.get(observation.observationId);
    if (old) {
      if (old !== stable(observation)) throw new Error('observation_id_conflict');
      return { applied: false, replay: true };
    }
    const current = this.orders.get(observation.orderId);
    if (!current || current.mode !== observation.mode) throw new Error('observation_scope');
    if (current.fence !== observation.leaseFence) throw new Error('stale_fence');
    if (current.revision !== observation.expectedOrderRevision) throw new Error('revision_conflict');
    const next = structuredClone(current);
    const { payment, refunds = [], disputes = [] } = observation.facts;
    if (refunds.some(refund => !next.refunds[refund.id])) {
      next.refundCaseState = 'open';
      next.refundEntitlementDisposition = 'undecided';
    }
    if (payment) {
      if (!['unpaid', 'processing', 'paid', 'canceled'].includes(payment)) throw new Error('payment_state');
      if (current.payment === 'paid' && payment !== 'paid') throw new Error('payment_regression');
      if (current.payment === 'canceled' && payment !== 'canceled') throw new Error('payment_terminal_conflict');
      next.payment = payment;
    }
    for (const refund of refunds) {
      if (!Number.isSafeInteger(refund.amountMinor) || refund.amountMinor <= 0
          || !REFUND_OPEN.has(refund.status) && !REFUND_FINAL.has(refund.status)) throw new Error('refund_invalid');
      const before = next.refunds[refund.id];
      if (before && before.amountMinor !== refund.amountMinor) throw new Error('refund_amount_conflict');
      if (before && REFUND_FINAL.has(before.status) && before.status !== refund.status) {
        // A bank may return a refund after it was reported succeeded. Preserve
        // history and apply verified compensating facts; do not silently revive access.
        const correction = refund.correction;
        const allowedLateCorrection = before.status === 'succeeded'
          && ['failed', 'requires_action'].includes(refund.status)
          && correction?.source === 'current_provider_get'
          && typeof correction.evidenceDigest === 'string'
          && (refund.status === 'requires_action'
            || typeof correction.failureBalanceTransaction === 'string' && typeof correction.failureReason === 'string');
        if (!allowedLateCorrection) throw new Error('refund_correction_evidence_required');
        next.refundReviewRequired = true;
        next.refundCaseState = 'open';
        next.refundEntitlementDisposition = 'undecided';
        next.refundAdjustments.push({ refundId: refund.id, deltaSucceededMinor: -before.amountMinor,
          observationId: observation.observationId, correction: structuredClone(correction) });
      }
      if (!before || stable(before) !== stable(refund)) next.refundHistory.push({
        refundId: refund.id, before: before?.status ?? null, after: refund.status,
        observationId: observation.observationId, amountMinor: refund.amountMinor,
      });
      next.refunds[refund.id] = structuredClone(refund);
    }
    for (const dispute of disputes) {
      if (!DISPUTE_OPEN.has(dispute.state) && !DISPUTE_FINAL.has(dispute.state)) throw new Error('dispute_invalid');
      const before = next.disputes[dispute.id];
      if (before && DISPUTE_FINAL.has(before.state) && before.state !== dispute.state) throw new Error('dispute_terminal_conflict');
      next.disputes[dispute.id] = structuredClone(dispute);
    }
    const result = decide(next);
    if (result.money.refundSucceededMinor + result.money.refundReservedMinor > next.amountMinor) {
      // A Provider fact must survive a concurrent unknown local reservation.
      // Do not silently reduce either amount: overlap needs reconciliation.
      next.refundReviewRequired = true;
      next.refundCaseState = 'open';
      next.refundEntitlementDisposition = 'undecided';
    }
    if (Object.keys(next.refunds).length && next.payment !== 'paid') throw new Error('refund_without_payment');
    if (result.money.refundSucceededMinor === next.amountMinor && result.money.refundReservedMinor === 0
        && !next.refundReviewRequired) {
      next.refundCaseState = 'resolved';
      next.refundEntitlementDisposition = 'keep_revoked';
    }
    next.revision += 1;
    this.orders.set(next.id, next);
    this.observations.set(observation.observationId, stable(observation));
    const group = this.groups.get(groupKey(next));
    const terminalRelease = next.payment === 'canceled' || (
      result.money.refundSucceededMinor === next.amountMinor && result.money.refundReservedMinor === 0);
    if (terminalRelease && group.slot === next.id) group.slot = null;
    this.#publish(next, observation.observationId);
    return { applied: true, replay: false };
  }

  updatePolicy(orderId, changes) {
    const order = this.orders.get(orderId);
    for (const name of Object.keys(changes)) {
      if (!['reviewValid', 'packageRevoked', 'manifestMatches', 'providerReady', 'subjectLinked',
        'refundReviewRequired'].includes(name))
        throw new Error('policy_field');
      if (typeof changes[name] !== 'boolean') throw new Error('policy_boolean');
    }
    Object.assign(order, changes);
    order.revision += 1;
    this.#publish(order, 'policy_changed');
  }

  resolveRefundCase(orderId, command) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('unknown_order');
    const group = this.groups.get(groupKey(order));
    const { caseState, refundEntitlementDisposition, evidence, expectedRevision,
      expectedEntitlementRevision, actorScope } = command;
    if (actorScope !== 'commerce.refund_case.resolve') throw new Error('case_resolution_scope');
    if (expectedRevision !== order.revision || expectedEntitlementRevision !== group.revision)
      throw new Error('case_revision_conflict');
    if (!['resolved', 'withdrawn'].includes(caseState)
        || !['restore', 'keep_revoked'].includes(refundEntitlementDisposition)
        || typeof evidence !== 'string' || evidence.length < 8)
      throw new Error('case_resolution_evidence_required');
    if (Object.values(order.refunds).some(r => REFUND_OPEN.has(r.status))) throw new Error('refund_outcome_unresolved');
    if (refundEntitlementDisposition === 'restore' &&
        Object.values(order.refunds).some(r => r.status === 'succeeded'))
      throw new Error('remaining_successful_refund');
    const next = structuredClone(order);
    next.refundCaseState = caseState;
    next.refundEntitlementDisposition = refundEntitlementDisposition;
    next.refundReviewRequired = false;
    next.refundCaseHistory.push({ caseState, refundEntitlementDisposition, evidence,
      expectedRevision, expectedEntitlementRevision, actorScope });
    next.revision += 1;
    this.orders.set(orderId, next);
    // An old case cannot take the pointer from O2, or revive O1 after a later order.
    if (refundEntitlementDisposition === 'restore' && group.slot === null
        && group.orderIds.at(-1) === orderId) group.slot = orderId;
    this.#publish(next, 'refund_case_resolved');
  }

  #publish(order, cause) {
    const group = this.groups.get(groupKey(order));
    group.revision += 1; // never resets across refund/re-purchase
    const decision = this.effective(group.key);
    this.outbox.push({ key: group.key, revision: group.revision, cause, ...decision });
  }

  effective(keyOrOrderId) {
    const key = this.orders.has(keyOrOrderId) ? groupKey(this.orders.get(keyOrOrderId)) : keyOrOrderId;
    const group = this.groups.get(key);
    const order = group.slot ? this.orders.get(group.slot) : null;
    if (!order) {
      const correction = group.orderIds.some(id => this.orders.get(id).refundReviewRequired);
      return { orderId: null, allowed: false, access: correction ? 'suspended' : 'revoked',
        reason: correction ? 'reconciliation_required' : 'not_paid', revision: group.revision };
    }
    const decision = decide(order);
    return { orderId: order.id, allowed: decision.runtimeAllowed, access: decision.access,
      reason: decision.runtimeReason, revision: group.revision };
  }

  decision(orderId, nowMs, operation = 'read') {
    const effective = this.effective(orderId);
    return { ...effective, operation, checkedAt: nowMs, validUntil: nowMs + 60_000 };
  }
}

export class ProviderCache {
  // high-water decisions must survive restarts in a real implementation.
  entries = new Map();
  constructor(snapshot = []) { this.entries = new Map(structuredClone(snapshot)); }
  apply(key, decision) {
    const previous = this.entries.get(key);
    if (decision.validUntil > decision.checkedAt + 60_000) throw new Error('ttl_over_limit');
    if (previous && decision.revision < previous.revision) return false;
    if (previous && decision.revision === previous.revision) {
      const fact = ({ checkedAt, validUntil, ...facts }) => facts;
      if (stable(fact(decision)) !== stable(fact(previous))) throw new Error('same_revision_conflict');
      if (decision.checkedAt < previous.checkedAt) return false;
    }
    this.entries.set(key, structuredClone(decision));
    return true;
  }
  allows(key, nowMs, operation = 'read') {
    if (['financial', 'external_write'].includes(operation)) return false;
    const value = this.entries.get(key);
    return !!value?.allowed && nowMs >= value.checkedAt && nowMs < value.validUntil;
  }
  snapshot() { return structuredClone([...this.entries]); }
}

export function* permutations(values) {
  if (values.length === 0) { yield []; return; }
  for (let index = 0; index < values.length; index += 1) {
    for (const rest of permutations(values.filter((_, i) => i !== index))) yield [values[index], ...rest];
  }
}
