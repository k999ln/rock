import {
  describeEsimStarterAgentPack,
  parseEsimServerPlanCatalog,
  type EsimServerPlanCatalog,
  type EsimStarterAgentPackageDisplay,
} from './esim-plan-catalog.ts';

export type EsimPublicPlanTerms = {
  id: string;
  name: string;
  description: string;
  coverageCountryCodes: string[];
  roamingCountryCodes: string[];
  dataAllowance: { kind: 'fixed'; amountMb: number } | { kind: 'unlimited' };
  validityDays: number;
  serviceStarts: 'after_profile_installation' | 'after_first_network_attach';
  installPrerequisites: string[];
  starterAgentPack: {
    id: string;
    version: string;
    packages: EsimStarterAgentPackageDisplay[];
  };
};

export type EsimPublicCatalogResponse = {
  catalogVersion: string;
  purchaseEnabled: false;
  commerceState: 'contract_pending';
  plans: EsimPublicPlanTerms[];
};

export type EsimPublicCatalogState = EsimPublicCatalogResponse | {
  purchaseEnabled: false;
  commerceState: 'catalog_not_configured';
  plans: [];
};

const MAX_BYTES = 16 * 1024;
const ISO_COUNTRY = /^[A-Z]{2}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function countryList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 250 && value.every((code) =>
    typeof code === 'string' && ISO_COUNTRY.test(code)) && new Set(value).size === value.length;
}

type EsimPublicPlanMetadata = Omit<EsimPublicPlanTerms, 'starterAgentPack'>;

function terms(value: unknown): (EsimPublicPlanMetadata & { packageKey: string; manifestSha256: string }) | null {
  const plan = record(value);
  if (!plan || Object.keys(plan).length !== 11 ||
      typeof plan.packageKey !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(plan.packageKey) ||
      typeof plan.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(plan.manifestSha256) ||
      typeof plan.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(plan.id) ||
      !validString(plan.name, 80) || !validString(plan.description, 500) ||
      !countryList(plan.coverageCountryCodes) || plan.coverageCountryCodes.length === 0 ||
      !countryList(plan.roamingCountryCodes) ||
      !Number.isSafeInteger(plan.validityDays) || (plan.validityDays as number) < 1 ||
      (plan.validityDays as number) > 365 ||
      (plan.serviceStarts !== 'after_profile_installation' &&
        plan.serviceStarts !== 'after_first_network_attach') ||
      !Array.isArray(plan.installPrerequisites) || plan.installPrerequisites.length > 12 ||
      !plan.installPrerequisites.every((item) => validString(item, 160))) return null;

  const allowance = record(plan.dataAllowance);
  if (!allowance || (allowance.kind === 'fixed'
    ? Object.keys(allowance).length !== 2 || !Number.isSafeInteger(allowance.amountMb) ||
      (allowance.amountMb as number) < 1 || (allowance.amountMb as number) > 1_000_000
    : allowance.kind === 'unlimited' ? Object.keys(allowance).length !== 1 : true)) return null;

  return {
    packageKey: plan.packageKey,
    manifestSha256: plan.manifestSha256,
    id: plan.id,
    name: plan.name,
    description: plan.description,
    coverageCountryCodes: plan.coverageCountryCodes,
    roamingCountryCodes: plan.roamingCountryCodes,
    dataAllowance: allowance.kind === 'fixed'
      ? { kind: 'fixed', amountMb: allowance.amountMb as number }
      : { kind: 'unlimited' },
    validityDays: plan.validityDays as number,
    serviceStarts: plan.serviceStarts,
    installPrerequisites: plan.installPrerequisites,
  };
}

/**
 * Projects a separately curated customer-terms document onto known provider
 * packages. Provider wholesale details, retail price assumptions, bundle names,
 * and internal package identifiers never enter this public response.
 */
export async function createEsimPublicCatalog(
  raw: string | undefined,
  serverCatalog: EsimServerPlanCatalog,
  registry: Parameters<typeof describeEsimStarterAgentPack>[1] = [],
): Promise<EsimPublicCatalogResponse | null> {
  if (!raw) return null;
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new Error('ESIM_PUBLIC_CATALOG_INVALID');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('ESIM_PUBLIC_CATALOG_INVALID'); }
  const root = record(parsed);
  if (!root || Object.keys(root).length !== 2 || typeof root.version !== 'string' ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(root.version) || !Array.isArray(root.plans) ||
      root.plans.length > 100) throw new Error('ESIM_PUBLIC_CATALOG_INVALID');

  const seenIds = new Set<string>();
  const publicPlans: EsimPublicPlanTerms[] = [];
  for (const item of root.plans) {
    const plan = terms(item);
    if (!plan || seenIds.has(plan.id)) throw new Error('ESIM_PUBLIC_CATALOG_INVALID');
    seenIds.add(plan.id);
    const serverPlan = serverCatalog.plans.find((candidate) => candidate.packageKey === plan.packageKey &&
      candidate.manifestSha256 === plan.manifestSha256);
    if (!serverPlan) continue;
    const { packageKey: _packageKey, manifestSha256: _manifestSha256, ...projection } = plan;
    const packages = await describeEsimStarterAgentPack(serverPlan.starterAgentPack, registry);
    publicPlans.push({
      ...projection,
      starterAgentPack: {
        id: serverPlan.starterAgentPack.id,
        version: serverPlan.starterAgentPack.version,
        packages,
      },
    });
  }
  return {
    catalogVersion: root.version,
    purchaseEnabled: false,
    commerceState: 'contract_pending',
    plans: publicPlans,
  };
}

export async function readEsimPublicCatalog(
  serverCatalogJson: string | undefined,
  publicCatalogJson: string | undefined,
  registry: Parameters<typeof describeEsimStarterAgentPack>[1] = [],
): Promise<EsimPublicCatalogState> {
  if (!serverCatalogJson || !publicCatalogJson)
    return Promise.resolve({ commerceState: 'catalog_not_configured', purchaseEnabled: false, plans: [] });
  const validatedServerCatalog = parseEsimServerPlanCatalog(serverCatalogJson);
  return (await createEsimPublicCatalog(publicCatalogJson, validatedServerCatalog, registry)) ?? {
    commerceState: 'catalog_not_configured', purchaseEnabled: false, plans: [],
  };
}
