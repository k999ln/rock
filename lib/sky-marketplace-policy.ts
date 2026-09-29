/**
 * Sky Market's current commercial policy.
 *
 * This is a display/quote policy until the billing provider and payout
 * contract are enabled. Keeping it in one module prevents the marketplace,
 * connection passport and publisher copy from drifting apart.
 */
export const SKY_MARKETPLACE_COMMISSION_BPS = 1_000;
export const SKY_MARKETPLACE_COMMISSION_RATE =
  SKY_MARKETPLACE_COMMISSION_BPS / 10_000;
export const SKY_MARKETPLACE_COMMISSION_LABEL = '10%';

export function marketplaceCommissionMinor(grossMinor: number) {
  if (!Number.isSafeInteger(grossMinor) || grossMinor < 0)
    throw new Error('INVALID_GROSS_MINOR');
  return Number((BigInt(grossMinor) * BigInt(SKY_MARKETPLACE_COMMISSION_BPS)) / BigInt(10_000));
}

export function marketplaceProviderNetMinor(grossMinor: number) {
  return grossMinor - marketplaceCommissionMinor(grossMinor);
}
