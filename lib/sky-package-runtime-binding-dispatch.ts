import type { StoredA2AAgent } from './a2a-agent-directory.ts';
import type { A2APriceQuote } from './a2a-price-quote.ts';
import {
  packageRuntimeQuoteRequirementsMatch,
  skyPackageRuntimeBindingDigest,
  trustedSkyPackageRuntimeBindingKeyResolver,
  verifySkyPackageRuntimeBinding,
} from './sky-package-runtime-binding.ts';
import {
  parseStoredSkyPackageRuntimeBinding,
  type StoredSkyPackageRuntimeBinding,
} from './sky-package-runtime-binding-store.ts';
import { skyPackageSchemaSha256 } from './sky-package-runtime.ts';
import type { StoredSkyToolPackage } from './sky-tool-package-store.ts';

/** Re-check every mutable registry fact immediately before A2A egress. */
export async function verifySkyPackageRuntimeBindingForDispatch(input: {
  bindingRow: StoredSkyPackageRuntimeBinding | null;
  bindingId: string;
  bindingDigest: string;
  agent: StoredA2AAgent | null;
  package: StoredSkyToolPackage | null;
  priceQuote: A2APriceQuote | null;
  trustedKeys: unknown;
  runtimeExtensionUri?: string;
  expectedLiveAgentCardSha256?: string;
}): Promise<boolean> {
  const { bindingRow, bindingId, bindingDigest, agent, package: pkg, priceQuote } = input;
  if (!bindingId && !bindingDigest) return true;
  if (!bindingRow || !agent || !pkg || !priceQuote || !input.trustedKeys ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(bindingId) || !/^[a-f0-9]{64}$/.test(bindingDigest) ||
      bindingRow.bindingId !== bindingId || bindingRow.digest !== bindingDigest ||
      bindingRow.status !== 'active' || bindingRow.revokedAt !== null || bindingRow.revokedBy !== null ||
      agent.origin !== bindingRow.agentOrigin || agent.cardSha256 !== input.expectedLiveAgentCardSha256 &&
        input.expectedLiveAgentCardSha256 !== undefined ||
      pkg.packageKey !== bindingRow.packageKey || pkg.manifestSha256 !== bindingRow.manifestSha256 ||
      pkg.status !== 'verified') return false;

  const binding = parseStoredSkyPackageRuntimeBinding(bindingRow);
  if (!binding) return false;
  const [inputSchemaSha256, outputSchemaSha256] = await Promise.all([
    skyPackageSchemaSha256(pkg.manifest.io.inputSchema),
    skyPackageSchemaSha256(pkg.manifest.io.outputSchema),
  ]);
  const verified = await verifySkyPackageRuntimeBinding(binding, {
    agentOrigin: agent.origin,
    agentName: agent.agentName,
    agentVersion: agent.agentVersion,
    agentCardSha256: agent.cardSha256,
    packageKey: pkg.packageKey,
    manifestSha256: pkg.manifestSha256,
    runtimeExtensionUri: input.runtimeExtensionUri ?? '',
    inputSchemaSha256,
    outputSchemaSha256,
  }, trustedSkyPackageRuntimeBindingKeyResolver(input.trustedKeys));
  return Boolean(verified &&
    await skyPackageRuntimeBindingDigest(verified) === bindingDigest &&
    verified.runtimeExtensionUri === input.runtimeExtensionUri &&
    verified.providerId === priceQuote.providerId &&
    packageRuntimeQuoteRequirementsMatch(verified, priceQuote));
}
