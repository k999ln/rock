export const CSV_FEE_POLICY_VERSION = 'csv-seller-fee/1';
export const CSV_MONTHLY_THRESHOLD_USD_MINOR = 3_000;
export const CSV_MONTHLY_FEE_USD_MINOR = 888;

export type CsvFeeDecision = {
  policyVersion: typeof CSV_FEE_POLICY_VERSION;
  monthJst: string;
  verifiedNetUsdMinor: number;
  feeDueUsdMinor: 0;
  status: 'on_hold';
  reason: 'revenue_flow_pending';
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
  return {
    policyVersion: CSV_FEE_POLICY_VERSION,
    monthJst: input.monthJst,
    verifiedNetUsdMinor: input.verifiedNetUsdMinor,
    feeDueUsdMinor: 0,
    status: 'on_hold',
    reason: 'revenue_flow_pending',
  };
}
