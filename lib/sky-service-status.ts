import { readSkyStripeConfig } from './sky-stripe.ts';
import { remoteAiPricingGateAccepted } from './remote-ai-pricing-gate.ts';

// Public prerequisite information only. Configured never means provider-tested.
export type SkyServiceStatus = {
  version: 1;
  database: 'available' | 'unavailable';
  csvStorageConfigured: boolean;
  legalAiConfigured: boolean;
  patentAiConfigured: boolean;
  jevConfigured: boolean;
  payments: 'unconfigured' | 'test' | 'live';
};

export function skyServiceStatus(
  bindings: Record<string, unknown>,
  databaseAvailable: boolean,
  origin: string,
): SkyServiceStatus {
  const remoteEnabled = bindings.SKY_REMOTE_LLM_ENABLED === 'true' && remoteAiPricingGateAccepted();
  const present = (name: string) => typeof bindings[name] === 'string' && (bindings[name] as string).trim().length > 0;
  let payments: SkyServiceStatus['payments'] = 'unconfigured';
  try {
    const config = readSkyStripeConfig(bindings);
    if (config.origin === origin) payments = config.mode;
  } catch { /* An invalid or foreign-origin configuration cannot enable payments. */ }
  return {
    version: 1,
    database: databaseAvailable ? 'available' : 'unavailable',
    csvStorageConfigured: Boolean(bindings.BUCKET),
    legalAiConfigured: remoteEnabled && present('OPENAI_API_KEY'),
    patentAiConfigured: remoteEnabled && present('OPENAI_API_KEY'),
    jevConfigured: remoteEnabled && present('AI_GATEWAY_API_KEY'),
    payments,
  };
}

export function parseSkyServiceStatus(value: unknown): SkyServiceStatus | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || (v.database !== 'available' && v.database !== 'unavailable') ||
    (v.payments !== 'unconfigured' && v.payments !== 'test' && v.payments !== 'live') ||
    !['csvStorageConfigured', 'legalAiConfigured', 'patentAiConfigured', 'jevConfigured'].every((key) => typeof v[key] === 'boolean')) return undefined;
  return {
    version: 1,
    database: v.database as SkyServiceStatus['database'],
    csvStorageConfigured: v.csvStorageConfigured as boolean,
    legalAiConfigured: v.legalAiConfigured as boolean,
    patentAiConfigured: v.patentAiConfigured as boolean,
    jevConfigured: v.jevConfigured as boolean,
    payments: v.payments as SkyServiceStatus['payments'],
  };
}
