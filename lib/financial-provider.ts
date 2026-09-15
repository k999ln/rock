export const FINANCIAL_PROVIDER_SCHEMA =
  'rockstar-financial-provider/1' as const;
export const ROCK_SETTLEMENT_PROVIDER_ID =
  'org.rockstar.settlement-wallet' as const;
export const ROCK_MONTHLY_FEE_CAP_MINOR = 888;

export const FINANCIAL_CAPABILITIES = [
  'collect_platform_fee',
  'custody',
  'receive',
  'payout',
  'exchange',
  'fund_catalog',
  'subscribe',
  'redeem',
  'valuation',
  'reporting',
] as const;

export type FinancialCapability = (typeof FINANCIAL_CAPABILITIES)[number];
export type FinancialProviderManifest = {
  schemaVersion: typeof FINANCIAL_PROVIDER_SCHEMA;
  providerId: string;
  displayName: string;
  providerType: 'wallet' | 'fund';
  ownership: 'rock_first_party' | 'third_party';
  mode: 'SANDBOX' | 'LIVE';
  status:
    | 'sandbox_available'
    | 'sandbox_verified'
    | 'live_eligible'
    | 'suspended'
    | 'revoked';
  capabilities: FinancialCapability[];
  currencies: string[];
  userFundsCustodied: boolean;
  fundManagementEnabled: boolean;
  liveEnabled: boolean;
  osRebuildRequired: false;
};

export const ROCK_SETTLEMENT_PROVIDER: FinancialProviderManifest = {
  schemaVersion: FINANCIAL_PROVIDER_SCHEMA,
  providerId: ROCK_SETTLEMENT_PROVIDER_ID,
  displayName: 'Rock Settlement Wallet',
  providerType: 'wallet',
  ownership: 'rock_first_party',
  mode: 'SANDBOX',
  status: 'sandbox_verified',
  capabilities: ['collect_platform_fee', 'reporting'],
  currencies: ['usd'],
  userFundsCustodied: false,
  fundManagementEnabled: false,
  liveEnabled: false,
  osRebuildRequired: false,
};

function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('FINANCIAL_PROVIDER_INVALID');
  return value as Record<string, unknown>;
}

function identifier(value: unknown, code: string, maximum = 128) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  )
    throw new Error(code);
  return value;
}

export function validateFinancialProviderManifest(
  value: unknown,
): FinancialProviderManifest {
  const input = object(value);
  const allowed = new Set([
    'schemaVersion',
    'providerId',
    'displayName',
    'providerType',
    'ownership',
    'mode',
    'status',
    'capabilities',
    'currencies',
    'userFundsCustodied',
    'fundManagementEnabled',
    'liveEnabled',
    'osRebuildRequired',
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new Error('FINANCIAL_PROVIDER_UNSUPPORTED_FIELD');
  if (input.schemaVersion !== FINANCIAL_PROVIDER_SCHEMA)
    throw new Error('FINANCIAL_PROVIDER_SCHEMA_UNSUPPORTED');
  if (input.providerType !== 'wallet' && input.providerType !== 'fund')
    throw new Error('FINANCIAL_PROVIDER_TYPE_INVALID');
  if (
    input.ownership !== 'rock_first_party' &&
    input.ownership !== 'third_party'
  )
    throw new Error('FINANCIAL_PROVIDER_OWNERSHIP_INVALID');
  if (input.mode !== 'SANDBOX' && input.mode !== 'LIVE')
    throw new Error('FINANCIAL_PROVIDER_MODE_INVALID');
  if (
    ![
      'sandbox_available',
      'sandbox_verified',
      'live_eligible',
      'suspended',
      'revoked',
    ].includes(String(input.status))
  )
    throw new Error('FINANCIAL_PROVIDER_STATUS_INVALID');
  if (
    !Array.isArray(input.capabilities) ||
    input.capabilities.length < 1 ||
    new Set(input.capabilities).size !== input.capabilities.length ||
    input.capabilities.some(
      (capability) =>
        !FINANCIAL_CAPABILITIES.includes(capability as FinancialCapability),
    )
  )
    throw new Error('FINANCIAL_PROVIDER_CAPABILITY_INVALID');
  if (
    !Array.isArray(input.currencies) ||
    input.currencies.length < 1 ||
    new Set(input.currencies).size !== input.currencies.length ||
    input.currencies.some(
      (currency) =>
        typeof currency !== 'string' || !/^[a-z]{3}$/u.test(currency),
    )
  )
    throw new Error('FINANCIAL_PROVIDER_CURRENCY_INVALID');
  if (
    typeof input.userFundsCustodied !== 'boolean' ||
    typeof input.fundManagementEnabled !== 'boolean' ||
    typeof input.liveEnabled !== 'boolean'
  )
    throw new Error('FINANCIAL_PROVIDER_BOUNDARY_INVALID');
  if (input.osRebuildRequired !== false)
    throw new Error('FINANCIAL_PROVIDER_REBUILD_INVALID');
  if (
    input.mode === 'LIVE' ||
    input.liveEnabled === true ||
    input.status === 'live_eligible'
  )
    throw new Error('FINANCIAL_PROVIDER_LIVE_DISABLED');
  if (
    input.providerId === ROCK_SETTLEMENT_PROVIDER_ID &&
    (input.userFundsCustodied !== false ||
      input.fundManagementEnabled !== false ||
      JSON.stringify(input.capabilities) !==
        JSON.stringify(['collect_platform_fee', 'reporting']))
  )
    throw new Error('ROCK_SETTLEMENT_SCOPE_INVALID');
  return {
    schemaVersion: FINANCIAL_PROVIDER_SCHEMA,
    providerId: identifier(
      input.providerId,
      'FINANCIAL_PROVIDER_ID_INVALID',
      80,
    ),
    displayName:
      typeof input.displayName === 'string' &&
      input.displayName.trim().length > 0
        ? input.displayName.trim().slice(0, 100)
        : (() => {
            throw new Error('FINANCIAL_PROVIDER_NAME_INVALID');
          })(),
    providerType: input.providerType,
    ownership: input.ownership,
    mode: input.mode,
    status: input.status as FinancialProviderManifest['status'],
    capabilities: [...input.capabilities] as FinancialCapability[],
    currencies: [...input.currencies] as string[],
    userFundsCustodied: input.userFundsCustodied,
    fundManagementEnabled: input.fundManagementEnabled,
    liveEnabled: input.liveEnabled,
    osRebuildRequired: false,
  };
}

export type RockFeeCollectionInput = {
  receiptId: string;
  userId: string;
  period: string;
  currency: 'usd';
  allocatedSkyFeeMinor: number;
  previouslyCollectedMinor: number;
  mode: 'SANDBOX';
};

export function prepareRockFeeCollection(value: unknown) {
  const input = object(value);
  const allowed = new Set([
    'receiptId',
    'userId',
    'period',
    'currency',
    'allocatedSkyFeeMinor',
    'previouslyCollectedMinor',
    'mode',
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new Error('ROCK_FEE_COLLECTION_UNSUPPORTED_FIELD');
  if (input.mode !== 'SANDBOX')
    throw new Error('ROCK_FEE_COLLECTION_LIVE_DISABLED');
  if (input.currency !== 'usd')
    throw new Error('ROCK_FEE_COLLECTION_CURRENCY_INVALID');
  if (
    typeof input.period !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])$/u.test(input.period)
  )
    throw new Error('ROCK_FEE_COLLECTION_PERIOD_INVALID');
  const allocated = input.allocatedSkyFeeMinor;
  const collected = input.previouslyCollectedMinor;
  if (
    !Number.isSafeInteger(allocated) ||
    !Number.isSafeInteger(collected) ||
    Number(allocated) < 0 ||
    Number(collected) < 0 ||
    Number(allocated) + Number(collected) > ROCK_MONTHLY_FEE_CAP_MINOR
  )
    throw new Error('ROCK_FEE_COLLECTION_CAP_EXCEEDED');
  const receiptId = identifier(
    input.receiptId,
    'ROCK_FEE_COLLECTION_RECEIPT_INVALID',
  );
  const userId = identifier(input.userId, 'ROCK_FEE_COLLECTION_USER_INVALID');
  return {
    providerId: ROCK_SETTLEMENT_PROVIDER_ID,
    instructionId: `rock-fee:${receiptId}`,
    idempotencyKey: `rock-fee:${receiptId}`,
    receiptId,
    userId,
    period: input.period,
    currency: 'usd' as const,
    amountMinor: Number(allocated),
    status:
      Number(allocated) === 0 ? ('not_required' as const) : ('ready' as const),
    mode: 'SANDBOX' as const,
  };
}
