import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommerceModel, ProviderCache, decide, saleEligible, permutations } from './commerce-state-model.mjs';

const results = [];
const counters = { decisionTableRows: 0, permutations: 0, cacheSchedules: 0, negativeControls: 0 };
const check = (name, fn) => test(name, () => {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); throw error; }
});
const paid = (input) => {
  const model = new CommerceModel();
  model.createOrder('O1', input);
  model.observe('O1', { payment: 'paid' });
  return model;
};
const refund = (id, status, amountMinor) => ({ id, status, amountMinor });
const rights = m => { const d = m.effective('O1'); return [d.allowed, d.access, d.reason]; };
const caseCommand = (m, orderId, change = {}) => ({
  caseState: 'withdrawn', refundEntitlementDisposition: 'restore',
  evidence: 'verified-buyer-agreement', actorScope: 'commerce.refund_case.resolve',
  expectedRevision: m.orders.get(orderId).revision,
  expectedEntitlementRevision: m.effective(orderId).revision, ...change,
});
const reservationCommand = (m, orderId, reservationId, amountMinor, change = {}) => ({
  reservationId, amountMinor, expectedRevision: m.orders.get(orderId).revision,
  expectedEntitlementRevision: m.effective(orderId).revision, ...change,
});

check('finite decision table preserves money, device linkage and all blockers', () => {
  const profiles = [[], [refund('R1', 'pending', 10000)], [refund('R1', 'unknown', 10000)],
    [refund('R1', 'failed', 10000)], [refund('R1', 'canceled', 10000)],
    [refund('R1', 'succeeded', 2000)], [refund('R1', 'succeeded', 10000)],
    [refund('R1', 'succeeded', 2000), refund('R2', 'failed', 8000)],
    [refund('R1', 'failed', 4000), refund('R2', 'unknown', 6000)]];
  for (const payment of ['unpaid', 'processing', 'paid', 'canceled'])
    for (const refunds of profiles)
      for (const dispute of ['none', 'needs_response', 'under_review', 'won', 'lost'])
        for (const reviewValid of [true, false])
          for (const providerReady of [true, false])
            for (const subjectLinked of [true, false]) {
              const order = { amountMinor: 10000, payment, refunds: Object.fromEntries(refunds.map(r=>[r.id,r])),
                disputes: dispute === 'none' ? {} : { D1: { state: dispute } },
                reviewValid, providerReady, subjectLinked, manifestMatches: true, packageRevoked: false };
              const d = decide(order);
              counters.decisionTableRows++;
              assert.equal(d.payment, payment, 'refunds/disputes never relabel the payment fact');
              assert.ok(d.money.refundSucceededMinor >= 0 && d.money.refundSucceededMinor <= 10000);
              if (d.runtimeAllowed) {
                assert.equal(payment, 'paid');
                assert.equal(d.money.refundSucceededMinor, 0);
                assert.equal(d.money.refundReservedMinor, 0);
                assert.equal(subjectLinked && reviewValid && providerReady, true);
                assert.ok(['none', 'won'].includes(dispute));
              }
              if (!subjectLinked) assert.equal(d.runtimeAllowed, false);
              const linked = decide({ ...order, subjectLinked: true });
              assert.equal(d.access, linked.access, 'buyer OAuth linkage does not delete paid ownership');
              if (d.money.refundSucceededMinor === 10000 || dispute === 'lost') assert.equal(d.access, 'revoked');
            }
});

check('partial refund + failed balance refund never restores purchase access', () => {
  const m = paid();
  m.observe('O1', { refunds: [refund('R1', 'succeeded', 2000), refund('R2', 'pending', 8000)] });
  m.observe('O1', { refunds: [refund('R2', 'failed', 8000)] });
  assert.deepEqual(rights(m), [false, 'suspended', 'partial_refund']);
  assert.equal(decide(m.orders.get('O1')).money.refundSucceededMinor, 2000);
});

check('pending to failed restores only after all refund outcomes and business case resolution', () => {
  const m = paid();
  m.observe('O1', { refunds: [refund('R1', 'pending', 4000), refund('R2', 'unknown', 6000)] });
  m.observe('O1', { refunds: [refund('R1', 'failed', 4000)] });
  assert.equal(m.effective('O1').allowed, false);
  m.observe('O1', { refunds: [refund('R2', 'canceled', 6000)] });
  assert.equal(m.effective('O1').allowed, false, 'Provider failure does not erase a refund promise');
  m.resolveRefundCase('O1', caseCommand(m, 'O1'));
  assert.equal(m.effective('O1').allowed, true);
});

check('independent refund observations converge across all 24 arrival permutations', () => {
  const events = [refund('R1', 'succeeded', 2000), refund('R2', 'failed', 2000),
    refund('R3', 'canceled', 2000), refund('R4', 'unknown', 4000)];
  const snapshots = [];
  for (const schedule of permutations(events)) {
    const m = paid();
    for (const event of schedule) m.observe('O1', { refunds: [event] });
    const d = decide(m.orders.get('O1'));
    snapshots.push(JSON.stringify({ money:d.money, access:d.access, reasons:[...d.reasons].sort() }));
    counters.permutations++;
  }
  assert.equal(new Set(snapshots).size, 1);
  assert.equal(JSON.parse(snapshots[0]).money.refundSucceededMinor, 2000);
});

check('refund history requires correction evidence; internal over-reservation rejects atomically', () => {
  const m = paid();
  m.observe('O1', { refunds: [refund('R1', 'succeeded', 6000)] });
  const before = structuredClone(m.orders.get('O1'));
  assert.throws(() => m.observe('O1', { refunds: [refund('R1', 'failed', 6000)] }), /correction_evidence_required/);
  assert.throws(() => m.reserveRefund('O1', reservationCommand(m, 'O1', 'OP2', 5000)), /overallocation/);
  const after = m.orders.get('O1');
  assert.deepEqual(after.refunds, before.refunds);
  assert.equal(after.revision, before.revision);
});

check('unknown local reservation never discards a confirmed external partial refund', () => {
  const m=paid();
  m.reserveRefund('O1',reservationCommand(m,'O1','OP-unknown',10000));
  m.observe('O1',{refunds:[refund('OP-unknown','unknown',10000)]});
  m.observe('O1',{refunds:[refund('re-dashboard','succeeded',5000)]},'dashboard-success');
  const order=m.orders.get('O1'), money=decide(order).money;
  assert.equal(money.refundSucceededMinor,5000,'Wallet preserves known Provider money');
  assert.equal(money.refundReservedMinor,10000,'unresolved operation is not silently written down');
  assert.equal(money.refundOutcomeUnknown,true);
  assert.equal(m.observations.has('dashboard-success'),true);
  assert.equal(order.refundHistory.at(-1).refundId,'re-dashboard');
  assert.equal(order.refundReviewRequired,true);
  assert.deepEqual(rights(m),[false,'suspended','reconciliation_required']);
  assert.throws(()=>m.reserveRefund('O1',reservationCommand(m,'O1','OP-next',1)),/manual_reconciliation/);
  assert.equal(m.createOrder('O2').id,'O1','overlap cannot cause another payment');
  m.observe('O1',{refunds:[refund('OP-unknown','failed',10000)]});
  assert.equal(decide(m.orders.get('O1')).money.refundSucceededMinor,5000);
  assert.equal(decide(m.orders.get('O1')).money.refundReservedMinor,0);
  assert.equal(m.effective('O1').allowed,false,'partial refund remains suspended after ambiguity clears');
});

check('reservation admission compares both revisions and rejects concurrent excess', () => {
  const m=paid(), first=reservationCommand(m,'O1','OP1',6000);
  const stale=reservationCommand(m,'O1','OP2',5000);
  m.reserveRefund('O1',first);
  assert.throws(()=>m.reserveRefund('O1',stale),/revision_conflict/);
  assert.throws(()=>m.reserveRefund('O1',reservationCommand(m,'O1','OP2',5000)),/overallocation/);
  m.reserveRefund('O1',reservationCommand(m,'O1','OP2',4000));
  assert.equal(decide(m.orders.get('O1')).money.refundReservedMinor,10000);
  assert.equal(Object.keys(m.orders.get('O1').refunds).length,2);
});

const lateFailure = (amountMinor = 10000) => ({ ...refund('R1', 'failed', amountMinor), correction: {
  source: 'current_provider_get', evidenceDigest: 'verified-normalized-facts-digest',
  failureBalanceTransaction: 'txn_bank_return', failureReason: 'expired_or_canceled_card',
} });

check('fresh late bank failure compensates refund fact, retains history and requires manual resolution', () => {
  const m=paid();m.observe('O1',{refunds:[refund('R1','succeeded',10000)]});
  m.observe('O1',{refunds:[lateFailure()]});
  const order=m.orders.get('O1');
  assert.deepEqual(order.refundHistory.map(h=>h.after),['succeeded','failed']);
  assert.equal(order.refundAdjustments[0].deltaSucceededMinor,-10000);
  assert.equal(decide(order).money.refundSucceededMinor,0);
  assert.equal(order.refundCaseState,'open');
  assert.equal(m.effective('O1').allowed,false);
  assert.throws(()=>m.createOrder('O2'),/manual_reconciliation_required/);
});

check('late bank return on old refund does not rewrite the new purchase entitlement', () => {
  const m=paid();m.observe('O1',{refunds:[refund('R1','succeeded',10000)]});
  m.createOrder('O2');m.observe('O2',{payment:'paid'});
  m.observe('O1',{refunds:[lateFailure()]});
  assert.equal(m.orders.get('O1').refundReviewRequired,true);
  assert.equal(m.effective('O1').orderId,'O2');
  assert.equal(m.effective('O1').allowed,true);
  assert.equal(m.orders.size,2);
});

check('old fenced correction cannot overwrite a newer refund observation', () => {
  const m=paid();m.observe('O1',{refunds:[refund('R1','succeeded',10000)]});
  const stale=m.beginObservation('O1');
  m.observe('O1',{refunds:[refund('R1','succeeded',10000)]});
  assert.throws(()=>m.applyObservation({...stale,observationId:'old-bank-return',facts:{refunds:[lateFailure()]}}),/stale_fence/);
  assert.equal(decide(m.orders.get('O1')).money.refundSucceededMinor,10000);
});

check('failed refund with outstanding refund obligation cannot restore access', () => {
  const m=paid();
  m.observe('O1',{refunds:[refund('R1','pending',10000)]});
  m.observe('O1',{refunds:[refund('R1','failed',10000)]});
  assert.equal(m.effective('O1').allowed,false);
  assert.throws(()=>m.resolveRefundCase('O1',caseCommand(m,'O1',{evidence:''})),/resolution_evidence/);
  m.resolveRefundCase('O1',caseCommand(m,'O1'));
  assert.equal(m.effective('O1').allowed,true);
});

check('non-card succeeded to requires_action correction is preserved but remains outside initial rail', () => {
  const m=paid();m.observe('O1',{refunds:[refund('R1','succeeded',10000)]});
  m.observe('O1',{refunds:[{...refund('R1','requires_action',10000),correction:{
    source:'current_provider_get',evidenceDigest:'non-card-return-evidence'}}]});
  assert.equal(decide(m.orders.get('O1')).money.refundReservedMinor,10000);
  assert.equal(m.effective('O1').allowed,false);
});

check('refund duplicate observation is idempotent; changed body conflicts', () => {
  const m = paid();
  const obs = { ...m.beginObservation('O1'), observationId:'same', facts:{refunds:[refund('R1','succeeded',2000)]} };
  m.applyObservation(obs);
  const revision = m.effective('O1').revision;
  assert.deepEqual(m.applyObservation(obs), { applied:false, replay:true });
  assert.equal(m.effective('O1').revision, revision);
  assert.throws(() => m.applyObservation({ ...obs, facts:{refunds:[refund('R1','succeeded',3000)]} }), /id_conflict/);
});

check('expired worker cannot overwrite newer Provider observation', () => {
  const m = paid();
  const workerA = m.beginObservation('O1');
  const workerB = m.beginObservation('O1');
  m.applyObservation({ ...workerB, observationId:'new', facts:{refunds:[refund('R1','succeeded',10000)]} });
  assert.throws(() => m.applyObservation({ ...workerA, observationId:'old', facts:{payment:'paid'} }), /stale_fence/);
  assert.equal(m.effective('O1').allowed, false);
  assert.equal(decide(m.orders.get('O1')).money.refundSucceededMinor, 10000);
  counters.negativeControls++;
  const naive = { payment:'paid', refunded:true, access:false };
  Object.assign(naive, { payment:'paid', refunded:false, access:true });
  assert.equal(naive.access, true, 'deliberately unfenced last-writer model demonstrates the counterexample');
});

check('same fence with stale order revision rejects after concurrent policy change', () => {
  const m = paid();
  const ticket = m.beginObservation('O1');
  m.updatePolicy('O1', { reviewValid:false });
  assert.throws(() => m.applyObservation({ ...ticket, observationId:'old-policy', facts:{payment:'paid'} }), /revision_conflict/);
  assert.equal(m.effective('O1').allowed, false);
});

check('refund + dispute order permutations preserve both independent facts', () => {
  const events = [{refunds:[refund('R1','succeeded',2000)]}, {disputes:[{id:'D1',state:'won'}]}];
  for (const schedule of permutations(events)) {
    const m=paid(); for(const e of schedule)m.observe('O1',e);
    assert.equal(m.orders.get('O1').disputes.D1.state,'won');
    assert.equal(m.effective('O1').access,'suspended');
    counters.permutations++;
  }
});

check('same buyer/package/mode resumes current order across devices; mode and buyer isolate', () => {
  const m=paid();
  assert.equal(m.createOrder('deviceB').id,'O1');
  assert.equal(m.orders.size,1);
  assert.equal(m.createOrder('otherBuyer',{buyer:'buyer-B'}).id,'otherBuyer');
  assert.equal(m.createOrder('liveBuyer',{mode:'live'}).id,'liveBuyer');
  assert.equal(m.createOrder('newVersion',{packageKey:'dev.tool@2.0.0'}).id,'newVersion');
  assert.equal(m.effective('newVersion').allowed,false);
});

check('unknown refund retains active slot and cannot trigger new payment', () => {
  const m=paid(); m.observe('O1',{refunds:[refund('R1','unknown',10000)]});
  assert.equal(m.createOrder('O2').id,'O1');
  assert.equal(m.orders.size,1);
});

check('old order late events cannot release or revoke a paid repurchase', () => {
  const m=paid(); m.observe('O1',{refunds:[refund('R1','succeeded',10000)]});
  const oldRevision=m.effective('O1').revision;
  m.createOrder('O2');m.observe('O2',{payment:'paid'});
  const before=m.effective('O1');assert.equal(before.orderId,'O2');
  assert.ok(before.revision>oldRevision);
  for(const late of [
    {refunds:[refund('R1','succeeded',10000)]},
    {payment:'paid'}, {disputes:[{id:'D1',state:'lost'}]},
  ]) {
    m.observe('O1',late);
    assert.equal(m.effective('O1').orderId,'O2');
    assert.equal(m.effective('O1').allowed,true);
    assert.ok(m.effective('O1').revision>before.revision);
  }
  counters.negativeControls++;
  const naiveRights={allowed:true};naiveRights.allowed=decide(m.orders.get('O1')).runtimeAllowed;
  assert.equal(naiveRights.allowed,false,'deliberate order-unscoped reducer is shown unsafe');
});

check('selling paused leaves ownership intact; package review revocation stops execution', () => {
  const m=paid();
  assert.equal(saleEligible({offerActive:false,providerReady:true,reviewValid:true}),false);
  assert.equal(m.effective('O1').allowed,true);
  m.updatePolicy('O1',{packageRevoked:true});assert.equal(m.effective('O1').allowed,false);
});

check('unlinked buyer remains paid and does not make the seller ineligible', () => {
  const m=paid({subjectLinked:false});
  assert.equal(m.orders.get('O1').payment,'paid');
  assert.equal(m.effective('O1').access,'active');
  assert.equal(m.effective('O1').reason,'subject_unlinked');
  assert.equal(saleEligible({offerActive:true,providerReady:true,reviewValid:true,subjectLinked:false}),true);
  m.updatePolicy('O1',{subjectLinked:true});assert.equal(m.effective('O1').allowed,true);
});

check('provider integration not ready blocks both new sale and existing execution', () => {
  const m=paid({providerReady:false});
  assert.equal(saleEligible({offerActive:true,providerReady:false,reviewValid:true}),false);
  assert.equal(m.effective('O1').access,'suspended');
});

check('cache converges to greatest revision across all 6 deliveries; deny never regresses', () => {
  const decisions=[
    {revision:9,allowed:true,checkedAt:0,validUntil:60000},
    {revision:10,allowed:true,checkedAt:1000,validUntil:61000},
    {revision:11,allowed:false,checkedAt:2000,validUntil:62000},
  ];
  for(const schedule of permutations(decisions)){
    let cache=new ProviderCache();let seenDeny=false;
    for(const d of schedule){
      cache.apply('principal-package',d);seenDeny ||= d.revision===11;
      cache=new ProviderCache(cache.snapshot()); // restart after every delivery
      if(seenDeny)assert.equal(cache.allows('principal-package',3000),false);
    }
    assert.equal(cache.entries.get('principal-package').revision,11);
    counters.cacheSchedules++;
  }
  counters.negativeControls++;
  const naive={allowed:false};Object.assign(naive,decisions[1]);assert.equal(naive.allowed,true);
});

check('cache TTL anchors to checkedAt, not arrival, and cannot authorize financial actions', () => {
  const cache=new ProviderCache();
  cache.apply('k',{revision:1,allowed:true,checkedAt:1000,validUntil:61000});
  assert.equal(cache.allows('k',60000),true);
  assert.equal(cache.allows('k',61000),false);
  assert.equal(cache.allows('k',2000,'financial'),false);
  assert.equal(cache.allows('k',2000,'external_write'),false);
  assert.throws(()=>cache.apply('x',{revision:1,allowed:true,checkedAt:0,validUntil:60001}),/ttl/);
});

check('repurchase revision advances through old negative; same-revision changed decision conflicts', () => {
  const m=paid();const cache=new ProviderCache();
  cache.apply('k',m.decision('O1',0));
  m.observe('O1',{refunds:[refund('R1','succeeded',10000)]});
  cache.apply('k',m.decision('O1',1000));assert.equal(cache.allows('k',2000),false);
  m.createOrder('O2');m.observe('O2',{payment:'paid'});
  const d=m.decision('O2',3000);cache.apply('k',d);assert.equal(cache.allows('k',4000),true);
  assert.throws(()=>cache.apply('k',{...d,allowed:false}),/same_revision_conflict/);
});

check('fresh recheck at unchanged revision may renew lease but old response cannot extend it', () => {
  const cache=new ProviderCache();
  cache.apply('k',{revision:5,allowed:true,checkedAt:1000,validUntil:61000});
  cache.apply('k',{revision:5,allowed:true,checkedAt:2000,validUntil:62000});
  assert.equal(cache.apply('k',{revision:5,allowed:true,checkedAt:1000,validUntil:61000}),false);
  assert.equal(cache.entries.get('k').validUntil,62000);
});

check('closed case without explicit entitlement disposition never restores access', () => {
  const m=paid();
  m.observe('O1',{refunds:[refund('R1','failed',10000)]});
  const order=m.orders.get('O1');
  for (const refundCaseState of ['resolved','withdrawn']) {
    assert.equal(decide({...order,refundCaseState,refundEntitlementDisposition:'undecided'}).runtimeAllowed,false);
  }
  assert.throws(()=>m.resolveRefundCase('O1',caseCommand(m,'O1',{
    caseState:'resolved',refundEntitlementDisposition:'undecided'})),/resolution_evidence/);
});

check('alternative compensation closes the case while keeping terminated access revoked', () => {
  const m=paid();
  m.observe('O1',{refunds:[refund('R1','succeeded',10000)]});
  m.observe('O1',{refunds:[lateFailure()]});
  m.resolveRefundCase('O1',caseCommand(m,'O1',{
    caseState:'resolved',refundEntitlementDisposition:'keep_revoked',
    evidence:'verified-alternative-compensation-contract-ended'}));
  assert.equal(decide(m.orders.get('O1')).money.refundSucceededMinor,0);
  assert.equal(decide(m.orders.get('O1')).access,'revoked');
  assert.equal(m.effective('O1').allowed,false);
  assert.equal(m.orders.get('O1').refundCaseHistory.at(-1).refundEntitlementDisposition,'keep_revoked');
});

check('support decision requires scope, order and entitlement revisions, and evidence atomically', () => {
  const m=paid();m.observe('O1',{refunds:[refund('R1','failed',10000)]});
  const before=structuredClone(m.orders.get('O1'));
  const base=caseCommand(m,'O1');
  assert.throws(()=>m.resolveRefundCase('O1',{...base,actorScope:'seller'}),/resolution_scope/);
  assert.throws(()=>m.resolveRefundCase('O1',{...base,expectedRevision:base.expectedRevision-1}),/revision_conflict/);
  assert.throws(()=>m.resolveRefundCase('O1',{...base,expectedEntitlementRevision:base.expectedEntitlementRevision-1}),/revision_conflict/);
  assert.throws(()=>m.resolveRefundCase('O1',{...base,evidence:''}),/resolution_evidence/);
  assert.deepEqual(m.orders.get('O1'),before);
  m.resolveRefundCase('O1',base);
  assert.equal(m.effective('O1').allowed,true);
});

check('verified contract reinstatement can restore latest order after late bank return', () => {
  const m=paid();m.observe('O1',{refunds:[refund('R1','succeeded',10000)]});
  m.observe('O1',{refunds:[lateFailure()]});
  m.resolveRefundCase('O1',caseCommand(m,'O1',{
    caseState:'resolved',refundEntitlementDisposition:'restore',
    evidence:'verified-buyer-contract-reinstatement-after-bank-return'}));
  assert.equal(m.effective('O1').orderId,'O1');
  assert.equal(m.effective('O1').allowed,true);
  assert.equal(m.orders.get('O1').refundReviewRequired,false);
});

check('old-case reinstatement cannot replace a newer order pointer', () => {
  const m=paid();m.observe('O1',{refunds:[refund('R1','succeeded',10000)]});
  m.createOrder('O2');m.observe('O2',{payment:'paid'});
  m.observe('O1',{refunds:[lateFailure()]});
  m.resolveRefundCase('O1',caseCommand(m,'O1',{
    caseState:'resolved',refundEntitlementDisposition:'restore',
    evidence:'verified-old-case-disposition'}));
  assert.equal(m.effective('O1').orderId,'O2');
  assert.equal(m.effective('O1').allowed,true);
});

check('new refund reopens a previously resolved case and discards old restore disposition', () => {
  const m=paid();m.observe('O1',{refunds:[refund('R1','failed',10000)]});
  m.resolveRefundCase('O1',caseCommand(m,'O1'));
  assert.equal(m.effective('O1').allowed,true);
  m.observe('O1',{refunds:[refund('R2','pending',10000)]});
  assert.equal(m.orders.get('O1').refundCaseState,'open');
  assert.equal(m.orders.get('O1').refundEntitlementDisposition,'undecided');
  assert.equal(m.effective('O1').allowed,false);
});

after(() => {
  const output={ schema:'commerce-reference-model-results/1', generatedAt:new Date().toISOString(),
    scope:'design reference model only; no production runtime or Stripe/D1 verification',
    nodeVersion:process.version,
    sourceSha256:Object.fromEntries(['commerce-state-model.mjs','commerce-state-model.test.mjs'].map(name=>[
      name,createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex')])),
    bounds:{orderPriceMinor:10000,decisionTable:'4 payments x 9 refund profiles x 5 disputes x 2 review x 2 provider x 2 subject link',
      maxRefundsPerOrder:4,maxOrdersPerPurchaseGroup:2,maxCacheDecisionSchedule:3,
      scheduleCoverage:'all permutations only for specified independent event sets; not unbounded state-space proof'},
    counters,tests:results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,
    nonClaims:['No D1 transaction implementation proof','No external Provider API compatibility proof','No live money or actual OAuth test','No exhaustive unbounded concurrency proof'] };
  const resultPath = process.env.COMMERCE_MODEL_RESULT
    ? resolve(process.env.COMMERCE_MODEL_RESULT)
    : fileURLToPath(new URL('../../work/design-validation/commerce-model-results.json',import.meta.url));
  mkdirSync(dirname(resultPath), { recursive: true });
  writeFileSync(resultPath,JSON.stringify(output,null,2)+'\n');
  console.log(`Model evidence: ${resultPath}`);
});
