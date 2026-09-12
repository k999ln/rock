export type EstimateInput = {
  revenue: number;
  fx: number;
  watts: number;
  hours: number;
  kwhRate: number;
  dataGB: number;
  dataRate: number;
  apiCost: number;
};
export const defaultEstimate: EstimateInput = {
  revenue: 0,
  fx: 150,
  watts: 60,
  hours: 40,
  kwhRate: 31,
  dataGB: 10,
  dataRate: 0,
  apiCost: 0,
};
export const limits: Record<keyof EstimateInput, number> = {
  revenue: 100000000,
  fx: 10000,
  watts: 10000,
  hours: 744,
  kwhRate: 10000,
  dataGB: 100000,
  dataRate: 100000,
  apiCost: 100000000,
};
export function estimate(input: EstimateInput) {
  for (const key of Object.keys(limits) as (keyof EstimateInput)[]) {
    if (
      typeof input[key] !== 'number' ||
      !Number.isFinite(input[key]) ||
      input[key] < 0 ||
      input[key] > limits[key] ||
      (key === 'fx' && input[key] === 0)
    )
      throw new Error('入力値の範囲を確認してください。');
  }
  const revenue = Math.round(input.revenue);
  const feeCap = Math.round(8.88 * input.fx);
  const electricity = Math.round(
    (input.watts / 1000) * input.hours * input.kwhRate,
  );
  const data = Math.round(input.dataGB * input.dataRate);
  const api = Math.round(input.apiCost);
  const operatingCost = electricity + data + api;
  const recoveredCost = Math.min(revenue, operatingCost);
  const unrecoveredCost = operatingCost - recoveredCost;
  const fee = Math.min(revenue - recoveredCost, feeCap);
  const payout = revenue - recoveredCost - fee;
  return {
    revenue,
    feeCap,
    fee,
    payout,
    electricity,
    data,
    api,
    operatingCost,
    recoveredCost,
    unrecoveredCost,
    totalCost: recoveredCost + fee,
    net: payout - unrecoveredCost,
  };
}
