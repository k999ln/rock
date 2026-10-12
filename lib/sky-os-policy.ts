/** OS policy describes the host contract; it never grants a purchase or runtime permission. */
export type SkyOsPolicy = {
  label: string;
  profiles: 'account' | 'single' | 'multiple';
  purchaseSharing: 'buyer' | 'device_profiles' | 'per_product';
  savedProfileLimit: number | null;
  hardwareLimits: Record<string, number>;
};
export type SkyOsPolicyResult = {
  state: 'configured' | 'unconfigured';
  osId: string;
  hardwareModel: string | null;
  policy: SkyOsPolicy | null;
};

const webPolicy: SkyOsPolicy = {
  label: 'Web',
  profiles: 'account',
  purchaseSharing: 'buyer',
  savedProfileLimit: null,
  hardwareLimits: {},
};
const identifier = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const limit = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;
function parsePolicy(value: unknown): SkyOsPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_OS_POLICY');
  const p = value as Record<string, unknown>;
  if (
    Object.keys(p).some(
      (key) =>
        ![
          'label',
          'profiles',
          'purchaseSharing',
          'savedProfileLimit',
          'hardwareLimits',
        ].includes(key),
    ) ||
    typeof p.label !== 'string' ||
    !p.label.trim() ||
    p.label.length > 80 ||
    !['account', 'single', 'multiple'].includes(String(p.profiles)) ||
    !['buyer', 'device_profiles', 'per_product'].includes(
      String(p.purchaseSharing),
    ) ||
    (p.savedProfileLimit !== null && !limit(p.savedProfileLimit)) ||
    !p.hardwareLimits ||
    typeof p.hardwareLimits !== 'object' ||
    Array.isArray(p.hardwareLimits)
  )
    throw new Error('INVALID_OS_POLICY');
  for (const [model, count] of Object.entries(p.hardwareLimits)) {
    if (!identifier.test(model) || !limit(count))
      throw new Error('INVALID_OS_POLICY');
  }
  if (
    p.profiles === 'single' &&
    (p.savedProfileLimit !== 1 ||
      Object.values(p.hardwareLimits).some((count) => count !== 1))
  )
    throw new Error('INVALID_OS_POLICY');
  return structuredClone(p) as SkyOsPolicy;
}

// Only deployment bindings are accepted here. Never pass request headers, query
// parameters, navigator.userAgent or localStorage as the trusted host context.
export function resolveSkyOsPolicy(
  bindings: Record<string, unknown>,
): SkyOsPolicyResult {
  const osId =
    typeof bindings.SKY_OS_ID === 'string' ? bindings.SKY_OS_ID : 'web';
  const hardwareModel =
    typeof bindings.SKY_HARDWARE_MODEL === 'string'
      ? bindings.SKY_HARDWARE_MODEL
      : null;
  const unresolved: SkyOsPolicyResult = {
    state: 'unconfigured',
    osId,
    hardwareModel,
    policy: null,
  };
  if (
    (bindings.SKY_OS_ID !== undefined &&
      typeof bindings.SKY_OS_ID !== 'string') ||
    (bindings.SKY_HARDWARE_MODEL !== undefined &&
      typeof bindings.SKY_HARDWARE_MODEL !== 'string')
  )
    return unresolved;
  if (
    !identifier.test(osId) ||
    (hardwareModel !== null && !identifier.test(hardwareModel))
  )
    return unresolved;
  try {
    const policies = new Map<string, SkyOsPolicy>([['web', webPolicy]]);
    if (bindings.SKY_OS_POLICIES !== undefined) {
      if (
        typeof bindings.SKY_OS_POLICIES !== 'string' ||
        bindings.SKY_OS_POLICIES.length > 65536
      )
        return unresolved;
      const config: unknown = JSON.parse(bindings.SKY_OS_POLICIES);
      if (!config || typeof config !== 'object' || Array.isArray(config))
        return unresolved;
      for (const [id, value] of Object.entries(config)) {
        if (!identifier.test(id)) return unresolved;
        policies.set(id, parsePolicy(value));
      }
    }
    const configured = policies.get(osId);
    if (!configured) return unresolved;
    const policy = structuredClone(configured);
    // A machine-specific limit is authoritative. null means unknown, not unlimited.
    if (hardwareModel && Object.hasOwn(policy.hardwareLimits, hardwareModel))
      policy.savedProfileLimit = policy.hardwareLimits[hardwareModel];
    return { state: 'configured', osId, hardwareModel, policy };
  } catch {
    return unresolved;
  }
}
