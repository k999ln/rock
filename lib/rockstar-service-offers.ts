import { parseSkyToolPackage, skyToolPackageKey, skyToolPackageSha256 } from './sky-tool-package.ts';

export const ROCKSTAR_SERVICE_OFFER_PROFILES_SCHEMA = 'rockstar-service-offer-profiles/1' as const;

type OfferProfile = {
  issuerId: string;
  offerId: string;
  profileId: string;
  version: string;
  label: string;
  packages: Array<{ packageKey: string; manifestSha256: string }>;
};

type Catalog = { schema: typeof ROCKSTAR_SERVICE_OFFER_PROFILES_SCHEMA; profiles: OfferProfile[] };
type PackageRegistryItem = {
  packageKey: string;
  manifest: unknown;
  manifestSha256: string;
  status: string;
  installable: boolean;
};

export type RockstarServiceOfferProfileDisplay = {
  state: 'ready' | 'review_required' | 'not_configured' | 'catalog_unavailable';
  profileId: string | null;
  version: string | null;
  label: string | null;
  activation: 'owner_choice_required';
  packageCount: number;
  packages: Array<{ packageKey: string; name: string | null; state: 'ready' | 'unavailable' }>;
};

export class RockstarServiceOfferProfileError extends Error {
  constructor() { super('ROCKSTAR_SERVICE_OFFER_PROFILE_INVALID'); this.name = 'RockstarServiceOfferProfileError'; }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function parseRockstarServiceOfferProfiles(raw: string): Catalog {
  if (raw.length > 16_384) throw new RockstarServiceOfferProfileError();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new RockstarServiceOfferProfileError(); }
  if (!object(parsed) || Object.keys(parsed).length !== 2 ||
      parsed.schema !== ROCKSTAR_SERVICE_OFFER_PROFILES_SCHEMA || !Array.isArray(parsed.profiles) ||
      parsed.profiles.length > 128) throw new RockstarServiceOfferProfileError();

  const identities = new Set<string>();
  const profiles: OfferProfile[] = [];
  for (const value of parsed.profiles) {
    if (!object(value) || Object.keys(value).length !== 6 ||
        !validId(value.issuerId) || !validId(value.offerId) ||
        typeof value.profileId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(value.profileId) ||
        typeof value.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version) ||
        typeof value.label !== 'string' || !value.label.trim() || value.label.length > 80 ||
        hasControlCharacter(value.label) ||
        !Array.isArray(value.packages) || value.packages.length < 1 || value.packages.length > 12)
      throw new RockstarServiceOfferProfileError();
    const issuerId = value.issuerId as string;
    const offerId = value.offerId as string;
    const identity = `${issuerId}\0${offerId}`;
    if (identities.has(identity)) throw new RockstarServiceOfferProfileError();
    identities.add(identity);
    const packageKeys = new Set<string>();
    const packages: OfferProfile['packages'] = [];
    for (const pin of value.packages) {
      if (!object(pin) || Object.keys(pin).length !== 2 || typeof pin.packageKey !== 'string' ||
          !/^[a-z0-9]+(?:[.-][a-z0-9]+)+@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pin.packageKey) ||
          typeof pin.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(pin.manifestSha256) ||
          packageKeys.has(pin.packageKey)) throw new RockstarServiceOfferProfileError();
      packageKeys.add(pin.packageKey);
      packages.push({ packageKey: pin.packageKey, manifestSha256: pin.manifestSha256 });
    }
    profiles.push({
      issuerId, offerId,
      profileId: value.profileId as string, version: value.version as string,
      label: (value.label as string).trim(), packages,
    });
  }
  return { schema: ROCKSTAR_SERVICE_OFFER_PROFILES_SCHEMA, profiles };
}

/** Resolve a signed purchase offer to exact reviewed Sky packages without installing or authorizing execution. */
export async function describeRockstarServiceOfferProfile(
  issuerId: string,
  offerId: string,
  raw: string | undefined,
  registry: PackageRegistryItem[] = [],
): Promise<RockstarServiceOfferProfileDisplay> {
  const empty = (state: RockstarServiceOfferProfileDisplay['state']): RockstarServiceOfferProfileDisplay => ({
    state, profileId: null, version: null, label: null, activation: 'owner_choice_required', packageCount: 0, packages: [],
  });
  if (raw === undefined || raw.length === 0) return empty('not_configured');
  let catalog: Catalog;
  try { catalog = parseRockstarServiceOfferProfiles(raw); }
  catch { return empty('catalog_unavailable'); }
  const profile = catalog.profiles.find((item) => item.issuerId === issuerId && item.offerId === offerId);
  if (!profile) return empty('not_configured');

  const packages = await Promise.all(profile.packages.map(async (pin) => {
    const matches = registry.filter((item) => item.packageKey === pin.packageKey);
    if (matches.length !== 1 || matches[0].status !== 'verified' || !matches[0].installable ||
        matches[0].manifestSha256 !== pin.manifestSha256)
      return { packageKey: pin.packageKey, name: null, state: 'unavailable' as const };
    try {
      const manifest = parseSkyToolPackage(matches[0].manifest);
      if (skyToolPackageKey(manifest) !== pin.packageKey ||
          await skyToolPackageSha256(manifest) !== pin.manifestSha256)
        return { packageKey: pin.packageKey, name: null, state: 'unavailable' as const };
      return { packageKey: pin.packageKey, name: manifest.name, state: 'ready' as const };
    } catch {
      return { packageKey: pin.packageKey, name: null, state: 'unavailable' as const };
    }
  }));
  return {
    state: packages.every((item) => item.state === 'ready') ? 'ready' : 'review_required',
    profileId: profile.profileId,
    version: profile.version,
    label: profile.label,
    activation: 'owner_choice_required',
    packageCount: packages.length,
    packages,
  };
}
