import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMercariRevenuePlan,
  mercariConnectorReadiness,
  transitionMercariRevenuePlan,
} from '../lib/mercari-revenue.ts';

const id = '123e4567-e89b-42d3-a456-426614174000';
const input = {
  id,
  channel: 'consumer_assisted',
  title: '動作確認済みキーボード',
  condition: '角に小傷あり、全キー動作確認済み',
  facts: '型番ABC。付属品はUSBケーブルのみです。',
  priceJPY: 4000,
  marketplaceFeeJPY: 400,
  shippingJPY: 750,
  itemCostJPY: 500,
  otherCostJPY: 100,
  ownsStock: true,
  accurate: true,
  prohibitedChecked: true,
};

void test('creates an approval-gated listing draft and subtracts every direct cost', () => {
  const plan = createMercariRevenuePlan(input, '2026-09-12T12:00:00.000Z');
  assert.equal(plan.status, 'review');
  assert.equal(plan.expectedNetJPY, 2250);
  assert.match(plan.listingDraft, /角に小傷/);
  assert.equal(plan.verification, 'not_applicable');
});

void test('rejects unowned inventory, incomplete checks and malformed money', () => {
  assert.throws(
    () => createMercariRevenuePlan({ ...input, ownsStock: false }),
    /在庫の保有/,
  );
  assert.throws(
    () => createMercariRevenuePlan({ ...input, priceJPY: 299 }),
    /300円以上/,
  );
  assert.throws(
    () => createMercariRevenuePlan({ ...input, shippingJPY: 1.5 }),
    /整数/,
  );
});

void test('requires ordered approval and keeps self-reported sales unverified', () => {
  const review = createMercariRevenuePlan(input);
  assert.throws(
    () =>
      transitionMercariRevenuePlan(review, {
        id,
        action: 'mark_listed',
        expectedRevision: 0,
        listingReference: 'https://jp.mercari.com/item/example',
      }),
    /承認後/,
  );
  const approved = transitionMercariRevenuePlan(review, {
    id,
    action: 'approve',
    expectedRevision: 0,
  });
  const listed = transitionMercariRevenuePlan(approved, {
    id,
    action: 'mark_listed',
    expectedRevision: 1,
    listingReference: 'https://jp.mercari.com/item/example',
  });
  const reported = transitionMercariRevenuePlan(listed, {
    id,
    action: 'report_sale',
    expectedRevision: 2,
    saleReference: 'manual-order-reference',
    reportedNetJPY: 2250,
  });
  assert.equal(reported.status, 'awaiting_provider_verification');
  assert.equal(reported.verification, 'provider_required');
  assert.ok(!('verified' in reported));
});

void test('rejects stale revisions and documents the fixed-IP provider boundary', () => {
  const plan = createMercariRevenuePlan(input);
  assert.throws(
    () =>
      transitionMercariRevenuePlan(plan, {
        id,
        action: 'approve',
        expectedRevision: 9,
      }),
    /別の画面/,
  );
  assert.equal(mercariConnectorReadiness.consumerAssisted, 'ready');
  assert.equal(mercariConnectorReadiness.directSiteApiCall, false);
  assert.match(mercariConnectorReadiness.shopsApi, /fixed_ip/);
});
