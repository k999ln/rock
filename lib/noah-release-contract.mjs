export const releaseAgentId = digest => /^([a-f0-9]{64})$/.test(digest) ? `release-${digest}` : null;
export const isReleaseAgentId = id => typeof id === 'string' && /^release-[a-f0-9]{64}$/.test(id);
export const isReleasePackageKey = key => typeof key === 'string' && key.length <= 240 && /^[a-z0-9]+(?:[.-][a-z0-9]+)+@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(key);
