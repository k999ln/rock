type UnknownRecord = Record<string, unknown>;

function object(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Read display-only included Package keys from the owner-scoped entitlement API response. */
export function includedRockstarServicePackageKeys(payload: unknown): Set<string> {
  if (!object(payload) || !Array.isArray(payload.entitlements)) return new Set();
  const packageKeys = new Set<string>();
  for (const entitlement of payload.entitlements) {
    if (!object(entitlement) || entitlement.status !== 'active' || !object(entitlement.serviceProfile)) continue;
    const profile = entitlement.serviceProfile;
    if (!['ready', 'review_required'].includes(String(profile.state)) ||
        profile.activation !== 'owner_choice_required' || !Array.isArray(profile.packages))
      continue;
    for (const item of profile.packages) {
      if (object(item) && item.state === 'ready' && typeof item.packageKey === 'string' &&
          /^[a-z0-9]+(?:[.-][a-z0-9]+)+@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(item.packageKey))
        packageKeys.add(item.packageKey);
    }
  }
  return packageKeys;
}
