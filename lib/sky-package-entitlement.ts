import { rockstarEntitlementStore } from './rockstar-entitlement-claim.ts';
import { describeRockstarServiceOfferProfile, parseRockstarServiceOfferProfiles } from './rockstar-service-offers.ts';
import { skyToolPackageStore } from './sky-tool-package-store.ts';

/** Reuse the configured, exact package pins of the owner's existing service grant. */
export async function includedSkyPackage(db: Pick<D1Database, 'prepare'>, owner: string,
  packageKey: string, configuration?: string, manifestSha256?: string): Promise<boolean> {
  if (!configuration) return false;
  const profiles = parseRockstarServiceOfferProfiles(configuration).profiles;
  const entitlements = await rockstarEntitlementStore(db).activeOffers(owner, profiles);
  const active = profiles.filter(profile => entitlements.some(e => e.issuerId === profile.issuerId && e.offerId === profile.offerId));
  const references = active.flatMap(profile => profile.packages);
  if (!references.some(pin => pin.packageKey === packageKey && (!manifestSha256 || pin.manifestSha256 === manifestSha256))) return false;
  const registry = await skyToolPackageStore(db).verifiedRegistryPackages(references);
  for (const selected of active) {
    if (!selected.packages.some(pin => pin.packageKey === packageKey && (!manifestSha256 || pin.manifestSha256 === manifestSha256))) continue;
    const profile = await describeRockstarServiceOfferProfile(selected.issuerId, selected.offerId, configuration, registry);
    if (profile.state === 'catalog_unavailable') throw new Error('PACKAGE_CATALOG_UNAVAILABLE');
    if (profile.packages.some(item => item.state === 'ready' && item.packageKey === packageKey)) return true;
  }
  return false;
}
