import type { SkyToolPackage } from './sky-tool-package.ts';
import type { McpConnection, McpToolPassport } from './mcp-hub.ts';

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
 * the owner can select a connected PC stdio tool with the exact reviewed I/O
 * schema, and both the Package and runtime declare no per-run usage charge.
 */
export function compatibleLocalPackageRuntimes(
  manifest: SkyToolPackage,
  servers: readonly McpConnection[],
): PackageRuntimeCandidate[] {
  if (
    manifest.adapter.connectionType !== 'mcp_stdio' ||
    !manifest.capabilities.executionTargets.includes('pc') ||
    manifest.pricing.model !== 'free'
  ) return [];

  const input = canonical(manifest.io.inputSchema);
  const output = canonical(manifest.io.outputSchema);
  return servers.flatMap((server) => {
    if (server.transport !== 'stdio' || server.state !== 'connected' || !server.passport)
      return [];
    return server.passport.tools
      .filter((tool) => tool.pricing.model === 'free' && tool.outputSchema !== undefined &&
        canonical(tool.inputSchema) === input && canonical(tool.outputSchema) === output)
      .map((tool) => ({ server, tool }));
  });
}
