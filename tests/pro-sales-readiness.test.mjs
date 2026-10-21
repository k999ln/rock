import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateProSalesReadiness } from '../scripts/check-pro-sales-readiness.mjs';

const source = JSON.parse(readFileSync(new URL('../data/avocado-pro-sales-readiness.json', import.meta.url)));

void test('real sales stay closed while the SKU, stock, physical acceptance and merchant are missing', () => {
  const result = evaluateProSalesReadiness(source);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some(value => value.includes('supplier')));
  assert.ok(result.blockers.some(value => value.includes('merchantLiveAccountConnected')));
  assert.equal(result.calculation, null);
});

void test('a complete but underwater build cannot be offered', () => {
  const valid = structuredClone(source);
  valid.candidateOnly = false;
  valid.paymentProviderSelected = true;
  valid.seller.legalIdentityVerified = true;
  valid.seller.publicContactVerified = true;
  valid.components = valid.components.map(part => ({ ...part, supplierSku: 'quoted', writtenQuote: 'ref', physicalFitAccepted: true }));
  valid.gates = Object.fromEntries(Object.keys(valid.gates).map(gate => [gate, true]));
  valid.proposedInternalThresholds.approvedByOwner = true;
  Object.assign(valid.economics, {
    priceCentsExcludingSalesTax: 250000, partsCents: 220000, inboundFreightCents: 5000,
    assemblyAndTestCents: 20000, packagingCents: 3000, outboundShippingCents: 5000,
    supportReserveCents: 7000, warrantyReserveCents: 5000, returnsReserveCents: 5000,
    availableWorkingCapitalCents: 300000, confirmedSupplierCreditCents: 0,
  });
  const result = evaluateProSalesReadiness(valid);
  assert.equal(result.ready, false);
  assert.ok(result.calculation.contributionCents < 0);
  assert.ok(result.blockers.some(value => value.includes('contribution')));
});

void test('a funded quote with all evidence can pass the mathematical gate', () => {
  const valid = structuredClone(source);
  valid.candidateOnly = false;
  valid.paymentProviderSelected = true;
  valid.seller.legalIdentityVerified = true;
  valid.seller.publicContactVerified = true;
  valid.components = valid.components.map(part => ({ ...part, supplierSku: 'quoted', writtenQuote: 'ref', physicalFitAccepted: true }));
  valid.gates = Object.fromEntries(Object.keys(valid.gates).map(gate => [gate, true]));
  valid.proposedInternalThresholds.approvedByOwner = true;
  Object.assign(valid.economics, {
    priceCentsExcludingSalesTax: 300000, partsCents: 180000, inboundFreightCents: 5000,
    assemblyAndTestCents: 18000, packagingCents: 3000, outboundShippingCents: 7000,
    supportReserveCents: 7000, warrantyReserveCents: 10000, returnsReserveCents: 10000,
    availableWorkingCapitalCents: 213000, confirmedSupplierCreditCents: 0,
  });
  const result = evaluateProSalesReadiness(valid);
  assert.equal(result.ready, true);
  assert.equal(result.calculation.paymentFeeCents, 8730);
  assert.equal(result.calculation.prePayoutCashNeedCents, 213000);
  delete valid.gates.merchantLiveAccountConnected;
  assert.equal(evaluateProSalesReadiness(valid).ready, false);
});
