export const SKY_MONTHLY_FEE_CAP_MINOR = 888;
export const SETTLEMENT_CURRENCY = 'usd';

export type BeneficiaryRole = 'toc' | 'tob';

export type EarningReceipt = {
  receiptId: string;
  executionReceiptId: string;
  userId: string;
  beneficiaryRole: BeneficiaryRole;
  sourceProvider: string;
  providerReference: string;
  payoutAccountId: string;
  evidenceSha256: string;
  currency: typeof SETTLEMENT_CURRENCY;
  grossAmountMinor: number;
  operatingCostMinor: number;
  occurredAt: number;
};

function text(value: unknown, name: string, pattern: RegExp, maximum = 256) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    !pattern.test(value)
  )
    throw new Error(`EARNING_RECEIPT_${name}_INVALID`);
  return value;
}

function amount(value: unknown, name: string) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 100_000_000_00
  )
    throw new Error(`EARNING_RECEIPT_${name}_INVALID`);
  return value;
}

export function periodForUnix(timestamp: number) {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0)
    throw new Error('EARNING_RECEIPT_OCCURRED_AT_INVALID');
  return new Date(timestamp * 1000).toISOString().slice(0, 7);
}

export function validateEarningReceipt(value: unknown): EarningReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('EARNING_RECEIPT_INVALID');
  const item = value as Partial<EarningReceipt>;
  const grossAmountMinor = amount(item.grossAmountMinor, 'GROSS');
  const operatingCostMinor = amount(item.operatingCostMinor, 'OPERATING_COST');
  if (operatingCostMinor > grossAmountMinor)
    throw new Error('EARNING_RECEIPT_OPERATING_COST_EXCEEDS_GROSS');
  if (item.beneficiaryRole !== 'toc' && item.beneficiaryRole !== 'tob')
    throw new Error('EARNING_RECEIPT_ROLE_INVALID');
  if (item.currency !== SETTLEMENT_CURRENCY)
    throw new Error('EARNING_RECEIPT_CURRENCY_INVALID');
  const occurredAt = amount(item.occurredAt, 'OCCURRED_AT');
  periodForUnix(occurredAt);
  return {
    receiptId: text(item.receiptId, 'ID', /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u),
    executionReceiptId: text(
      item.executionReceiptId,
      'EXECUTION_ID',
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u,
    ),
    userId: text(item.userId, 'USER', /^\S+$/u),
    beneficiaryRole: item.beneficiaryRole,
    sourceProvider: text(
      item.sourceProvider,
      'PROVIDER',
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u,
      80,
    ),
    providerReference: text(
      item.providerReference,
      'PROVIDER_REFERENCE',
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u,
    ),
    payoutAccountId: text(
      item.payoutAccountId,
      'PAYOUT_ACCOUNT',
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u,
    ),
    evidenceSha256: text(
      item.evidenceSha256,
      'EVIDENCE',
      /^[0-9a-f]{64}$/u,
      64,
    ),
    currency: SETTLEMENT_CURRENCY,
    grossAmountMinor,
    operatingCostMinor,
    occurredAt,
  };
}

export function allocateEarning(input: {
  grossAmountMinor: number;
  operatingCostMinor: number;
  previousSkyFeeMinor: number;
  beneficiaryRole: BeneficiaryRole;
}) {
  const gross = amount(input.grossAmountMinor, 'GROSS');
  const cost = amount(input.operatingCostMinor, 'OPERATING_COST');
  const previousFee = amount(input.previousSkyFeeMinor, 'PREVIOUS_FEE');
  if (cost > gross)
    throw new Error('EARNING_RECEIPT_OPERATING_COST_EXCEEDS_GROSS');
  if (previousFee > SKY_MONTHLY_FEE_CAP_MINOR)
    throw new Error('SETTLEMENT_PREVIOUS_FEE_INVALID');
  const netAfterCosts = gross - cost;
  const skyFee =
    input.beneficiaryRole === 'toc'
      ? Math.min(netAfterCosts, SKY_MONTHLY_FEE_CAP_MINOR - previousFee)
      : 0;
  return {
    grossAmountMinor: gross,
    operatingCostMinor: cost,
    skyFeeMinor: skyFee,
    distributableMinor: netAfterCosts - skyFee,
    remainingFeeCapMinor: SKY_MONTHLY_FEE_CAP_MINOR - previousFee - skyFee,
  };
}
