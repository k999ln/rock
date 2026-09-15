export const CSV_FEE_POLICY_VERSION = 'csv-seller-fee/1';
export const CSV_MONTHLY_THRESHOLD_USD_MINOR = 3_000;
export const CSV_MONTHLY_FEE_USD_MINOR = 888;

export type CsvFeeDecision = {
  policyVersion: typeof CSV_FEE_POLICY_VERSION;
  monthJst: string;
  verifiedNetUsdMinor: number;
  feeDueUsdMinor: 0 | 888;
  status: 'waived' | 'due';
  reason: 'below_threshold' | 'eligible';
};

export function csvFeeDecision(input: {
  monthJst: string;
  verifiedNetUsdMinor: number;
  providerEvidence: string;
}): CsvFeeDecision {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.monthJst))
    throw new Error('MONTH_JST');
  if (
    !Number.isSafeInteger(input.verifiedNetUsdMinor) ||
    input.verifiedNetUsdMinor < 0
  )
    throw new Error('VERIFIED_NET');
  if (!input.providerEvidence.trim()) throw new Error('PROVIDER_EVIDENCE');
  const eligible = input.verifiedNetUsdMinor >= CSV_MONTHLY_THRESHOLD_USD_MINOR;
  return {
    policyVersion: CSV_FEE_POLICY_VERSION,
    monthJst: input.monthJst,
    verifiedNetUsdMinor: input.verifiedNetUsdMinor,
    feeDueUsdMinor: eligible ? 888 : 0,
    status: eligible ? 'due' : 'waived',
    reason: eligible ? 'eligible' : 'below_threshold',
  };
}
