import type { A2APriceQuote } from './a2a-price-quote.ts';
import type { A2ADelegation } from './a2a-delegation-contract.ts';

// Fixed projections preserve the existing worker scans, which omit predecessor.
const identityColumns = `id, owner_user_id AS ownerUserId, parent_job_id AS parentJobId`;
const detailColumns = `idempotency_key AS idempotencyKey, message_id AS messageId, target_origin AS targetOrigin,
target_agent_name AS targetAgentName, target_agent_version AS targetAgentVersion,
protocol_version AS protocolVersion, input_sha256 AS inputSha256,
authorization_sha256 AS authorizationSha256, price_quote_digest AS priceQuoteDigest,
price_quote_json AS priceQuoteJson, package_runtime_binding_id AS packageRuntimeBindingId,
package_runtime_binding_digest AS packageRuntimeBindingDigest, budget_currency AS budgetCurrency,
budget_limit_minor AS budgetLimitMinor,
parent_budget_limit_minor AS parentBudgetLimitMinor,
continue_while_device_offline AS continueWhileDeviceOffline,
deadline_at AS deadlineAt, state,
remote_task_id AS remoteTaskId, remote_context_id AS remoteContextId,
remote_state AS remoteState, artifacts_captured AS artifactsCaptured,
revision, created_at AS createdAt, updated_at AS updatedAt`;
export const a2aDelegationColumns = `${identityColumns},
predecessor_delegation_id AS predecessorDelegationId, ${detailColumns}`;
export const a2aDelegationReconciliationColumns = `${identityColumns}, ${detailColumns}`;

export type A2ADelegationRow = Omit<A2ADelegation, 'continueWhileDeviceOffline' | 'priceQuote'> & {
  continueWhileDeviceOffline: number | boolean;
  priceQuoteJson: string | null;
};

export function normalizeDelegation(row: A2ADelegationRow | null): A2ADelegation | null {
  if (!row) return null;
  const { priceQuoteJson, ...delegation } = row;
  let priceQuote: A2APriceQuote | null = null;
  try { priceQuote = priceQuoteJson ? JSON.parse(priceQuoteJson) as A2APriceQuote : null; } catch { /* fail closed at dispatch */ }
  return {
    ...delegation,
    predecessorDelegationId: delegation.predecessorDelegationId ?? null,
    priceQuoteDigest: delegation.priceQuoteDigest ?? '',
    priceQuote,
    packageRuntimeBindingId: delegation.packageRuntimeBindingId ?? '',
    packageRuntimeBindingDigest: delegation.packageRuntimeBindingDigest ?? '',
    continueWhileDeviceOffline: row.continueWhileDeviceOffline === 1 || row.continueWhileDeviceOffline === true,
  };
}

