import type { SkyToolPackage } from './sky-tool-package.ts';
import type { McpConnection, McpConnectionPassport, McpToolPassport } from './mcp-hub.ts';

// Remember invalid observations across re-renders and copied passport objects.
// At capacity, fail closed until a page reload rather than reviving old stamps.
const observations = new Map<string, { last: number; observedAt: number; expiresAt: number; deadlineMono: number; invalid: boolean }>();
const MAX_OBSERVATIONS = 1024;
let lastWall: number | undefined;
/** A recent connector observation, not a guarantee of provider behavior. */
export function isFreshMcpObservation(passport: McpConnectionPassport | null, now = Date.now()): boolean {
  if (!passport || typeof passport.observationId !== 'string' || !/^[a-f0-9-]{36}$/.test(passport.observationId) ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(passport.observedAt) ||
      !Number.isSafeInteger(passport.observationExpiresAt)) return false;
  if (lastWall !== undefined && now < lastWall) for (const state of observations.values()) state.invalid = true;
  lastWall = now;
  const observedAt = passport.observedAt!, expiresAt = passport.observationExpiresAt!, id = passport.observationId;
  let state = observations.get(id);
  if (!state) {
    if (observations.size >= MAX_OBSERVATIONS) return false;
    state = { last: now, observedAt, expiresAt, deadlineMono: performance.now() + Math.max(0, expiresAt - now), invalid: false }; observations.set(id, state);
  }
  if (state.observedAt !== observedAt || state.expiresAt !== expiresAt || performance.now() >= state.deadlineMono || now < state.last || now < observedAt || now >= expiresAt || expiresAt <= observedAt || expiresAt - observedAt > 30_000)
    state.invalid = true;
  state.last = Math.max(state.last, now);
  return !state.invalid;
}

export type PackageRuntimeCandidate = {
  server: McpConnection;
  tool: McpToolPassport;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
    // Use code-point ordering so schema digests are stable across host locales.
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function skyPackageSchemaSha256(schema: Record<string, unknown>) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(schema)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * A Sky Package does not name an MCP operation. Offer a local runtime only when
 * the owner can select a connected PC Tool with the exact reviewed I/O schema,
 * and both the Package and runtime declare no per-run usage charge. The
 * connector's local_http transport is loopback-only; remote HTTP is excluded.
 */
export function compatibleLocalPackageRuntimes(
  manifest: SkyToolPackage,
  servers: readonly McpConnection[],
): PackageRuntimeCandidate[] {
  if (
    !['mcp_stdio', 'mcp_streamable_http'].includes(manifest.adapter.connectionType) ||
    !manifest.capabilities.executionTargets.includes('pc') ||
    manifest.pricing.model !== 'free'
  ) return [];

  const input = canonical(manifest.io.inputSchema);
  const output = canonical(manifest.io.outputSchema);
  return servers.flatMap((server) => {
    const transportMatches = (manifest.adapter.connectionType === 'mcp_stdio' && server.transport === 'stdio') ||
      (manifest.adapter.connectionType === 'mcp_streamable_http' && server.transport === 'local_http');
    if (!transportMatches || server.state !== 'connected' || !isFreshMcpObservation(server.passport))
      return [];
    return server.passport!.tools
      .filter((tool) => tool.pricing.model === 'free' && tool.outputSchema !== undefined &&
        canonical(tool.inputSchema) === input && canonical(tool.outputSchema) === output)
      .map((tool) => ({ server, tool }));
  });
}
