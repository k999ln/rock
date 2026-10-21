import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const COST_FIELDS = [
  'partsCents', 'inboundFreightCents', 'assemblyAndTestCents', 'packagingCents',
  'outboundShippingCents', 'supportReserveCents', 'warrantyReserveCents', 'returnsReserveCents',
];
const REQUIRED_GATES = [
  'exactBomFrozen', 'supplierQuoteAndAllocationConfirmed', 'singlePhysicalPrototypePassed',
  'assemblyAndBurnInProcedurePassed', 'shippingPackagingDropTestPassed',
  'usDeliveryWindowEvidence', 'sellerTaxAndResaleSetupVerified',
  'customerTermsAndWarrantyApproved', 'returnsAndRefundReserveFunded',
  'merchantLiveAccountConnected', 'checkoutWebhookRefundReconciliationPassed',
  'orderToDeliveryDryRunPassed',
];

function cents(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function evaluateProSalesReadiness(record) {
  const blockers = [];
  if (record?.market !== 'US') blockers.push('US sales region is not fixed');
  if (record?.seller?.legalIdentityVerified !== true || record?.seller?.publicContactVerified !== true) {
    blockers.push('seller identity and customer contact are not verified');
  }
  if (record?.candidateOnly !== false || !record?.candidateSku) blockers.push('exact sellable SKU is not frozen');
  if (record?.paymentProviderSelected !== true) blockers.push('payment provider and merchant terms are not selected');
  for (const gate of REQUIRED_GATES) if (record?.gates?.[gate] !== true) blockers.push(`gate pending: ${gate}`);
  const components = record?.components;
  if (!Array.isArray(components) || components.length === 0 || components.some(part =>
    !part?.supplierSku || !part?.writtenQuote || part?.physicalFitAccepted !== true)) {
    blockers.push('component SKUs, written supplier quotes or same-unit fit checks are missing');
  }

  const economics = record?.economics ?? {};
  const thresholds = record?.proposedInternalThresholds ?? {};
  const price = economics.priceCentsExcludingSalesTax;
  if (!cents(price) || price === 0) blockers.push('customer price is missing');
  if (COST_FIELDS.some(field => !cents(economics[field]))) blockers.push('itemized landed and support costs are missing');
  if (!cents(economics.paymentFeeRateBasisPoints) || !cents(economics.paymentFeeFixedCents)) {
    blockers.push('payment processing fee assumptions are missing');
  }
  if (thresholds.approvedByOwner !== true || !cents(thresholds.minimumContributionCents)
      || !cents(thresholds.minimumContributionRateBasisPoints)) {
    blockers.push('internal contribution thresholds need owner approval');
  }
  if (!cents(economics.availableWorkingCapitalCents) || !cents(economics.confirmedSupplierCreditCents)) {
    blockers.push('available cash and written supplier credit are unknown');
  }

  let calculation = null;
  if (cents(price) && COST_FIELDS.every(field => cents(economics[field]))
      && cents(economics.paymentFeeRateBasisPoints) && cents(economics.paymentFeeFixedCents)) {
    const variableCostsCents = COST_FIELDS.reduce((sum, field) => sum + economics[field], 0);
    const paymentFeeCents = Math.ceil(price * economics.paymentFeeRateBasisPoints / 10000)
      + economics.paymentFeeFixedCents;
    const contributionCents = price - variableCostsCents - paymentFeeCents;
    const contributionRateBasisPoints = Math.floor(contributionCents * 10000 / price);
    const prePayoutCashNeedCents = economics.partsCents + economics.inboundFreightCents
      + economics.assemblyAndTestCents + economics.packagingCents + economics.outboundShippingCents;
    calculation = { variableCostsCents, paymentFeeCents, contributionCents,
      contributionRateBasisPoints, prePayoutCashNeedCents };
    if (cents(thresholds.minimumContributionCents) && contributionCents < thresholds.minimumContributionCents) {
      blockers.push('contribution dollars below proposed floor');
    }
    if (cents(thresholds.minimumContributionRateBasisPoints)
        && contributionRateBasisPoints < thresholds.minimumContributionRateBasisPoints) {
      blockers.push('contribution rate below proposed floor');
    }
    if (cents(economics.availableWorkingCapitalCents) && cents(economics.confirmedSupplierCreditCents)
        && economics.availableWorkingCapitalCents + economics.confirmedSupplierCreditCents < prePayoutCashNeedCents) {
      blockers.push('cash and confirmed supplier credit cannot cover costs before payment payout');
    }
  }
  if (record?.salesEnabled === true && blockers.length) blockers.push('salesEnabled conflicts with unmet gates');
  return { ready: blockers.length === 0, blockers, calculation };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] ?? 'data/avocado-pro-sales-readiness.json';
  const result = evaluateProSalesReadiness(JSON.parse(readFileSync(path, 'utf8')));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ready ? 0 : 2;
}
