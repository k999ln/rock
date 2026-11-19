import { a2aDelegationStore } from './a2a-delegation-store.ts';
import { observeStoredAgentUsage } from './sky-usage-observation.ts';
import { SkyPackageRuntimeBindingStore, parseStoredSkyPackageRuntimeBinding } from './sky-package-runtime-binding-store.ts';
import { skyPackageRuntimeBindingDigest } from './sky-package-runtime-binding.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
/** Read-only provenance of an existing verified receipt. A registered publisher
 * identifies a Package; remuneration still needs its own accepted contract. */
export async function observeAgentUsageProvenance(db: Database, owner: string, parentJobId: string, delegationId: string) {
  const store = a2aDelegationStore(db), child = await store.get(owner, delegationId);
  if (!child || child.parentJobId !== parentJobId) return null;
  const row = await store.getUsageReceipt(owner, delegationId);
  const usage = row ? observeStoredAgentUsage(row) : null;
  if (!row || !usage || row.parentJobId !== parentJobId) return null;
  const source = { schema: 'sky-agent-usage-provenance/1' as const, parentJobId, delegationId,
    providerId: row.providerId, currency: row.currency, receiptIssuedAt: row.issuedAt, receiptReference: row.providerReference,
    receiptSha256: await sha256Hex(row.receiptJson), pricingVersion: usage.pricingVersion,
    developerPayment: { status: 'contract_not_bound' as const, amountMinor: null } };
  const absent = (status: 'agent_only' | 'package_unavailable') => ({ ...source, status, package: null });
  if (!child.packageRuntimeBindingId && !child.packageRuntimeBindingDigest) return absent('agent_only');
  const stored = await new SkyPackageRuntimeBindingStore(db).get(child.packageRuntimeBindingId);
  const binding = stored ? parseStoredSkyPackageRuntimeBinding(stored) : null;
  let digest: string | null = null;
  try { digest = binding ? await skyPackageRuntimeBindingDigest(binding) : null; } catch { /* A malformed historical record cannot hide the receipt. */ }
  if (!stored || !binding || stored.digest !== child.packageRuntimeBindingDigest ||
      digest !== stored.digest ||
      binding.agentOrigin !== child.targetOrigin || binding.agentName !== child.targetAgentName ||
      binding.agentVersion !== child.targetAgentVersion || binding.providerId !== row.providerId ||
      binding.pricingVersion !== usage.pricingVersion) return absent('package_unavailable');
  // A version change/removal cannot silently attribute historical usage to a new publisher.
  const publisher = await db.prepare(`SELECT user_id AS publisherId FROM sky_tool_packages
    WHERE package_key = ? AND manifest_sha256 = ?`).bind(binding.packageKey, binding.manifestSha256)
    .first<{ publisherId: string }>();
  if (!publisher?.publisherId) return absent('package_unavailable');
  return { ...source, status: 'package_attributed' as const, package: {
    packageKey: binding.packageKey, manifestSha256: binding.manifestSha256,
    registeredPublisherId: publisher.publisherId, runtimeBindingId: binding.bindingId,
    runtimeBindingDigest: stored.digest, runtimeBindingStatus: stored.status,
  } };
}

export type AgentUsageProvenance = NonNullable<Awaited<ReturnType<typeof observeAgentUsageProvenance>>>;
export type CapturedAgentUsageSource = { capturedAt: string; provenance: AgentUsageProvenance; collectionConsent?: import('./sky-agent-collection-consent.ts').AgentCollectionConsent; authorAllocation?: import('./sky-author-remuneration.ts').AuthorAllocationCandidate; authorAgreement?: import('./sky-author-usage-agreement.ts').BoundAuthorUsageAgreement };
/** Keep the first server-observed source. Registry changes never rewrite a captured publisher. */
export function resolveCapturedAgentUsageSource(captured: CapturedAgentUsageSource | undefined, observed: AgentUsageProvenance | null) {
  if (!captured) return { provenance: observed, state: 'observed' as const, currentBindingStatus: observed?.package?.runtimeBindingStatus ?? null };
  const previous = captured.provenance;
  const same = observed && previous.parentJobId === observed.parentJobId &&
    previous.delegationId === observed.delegationId && previous.providerId === observed.providerId &&
    previous.receiptReference === observed.receiptReference && previous.receiptSha256 === observed.receiptSha256 &&
    previous.pricingVersion === observed.pricingVersion &&
    (previous.currency === undefined || previous.currency === observed.currency) &&
    (previous.receiptIssuedAt === undefined || previous.receiptIssuedAt === observed.receiptIssuedAt) &&
    JSON.stringify(previous.package && { ...previous.package, runtimeBindingStatus: undefined }) ===
      JSON.stringify(observed.package && { ...observed.package, runtimeBindingStatus: undefined });
  return { provenance: previous, state: same ? 'captured' as const : 'source_conflict' as const, currentBindingStatus: observed?.package?.runtimeBindingStatus ?? null };
}
