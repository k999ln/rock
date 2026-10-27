import type { WorkJob } from './workflow.ts';
import { parseCompositionPlan, type CompositionPlan } from './work-composition.ts';
import { prepareEveTextEstimate } from './eve-text-job.ts';
import { readOwnerScope } from './owner-intent.ts';
import { readEveTextEstimate, eveTextEstimateIsCurrent, type EveTextEstimate } from './remote-ai-text-client.ts';

const SCHEMA = 'eve.text-handoff/1';
const ACCEPTANCE = '資料と見積条件を準備資料として保存する。実行許可・費用予約・生成の完了ではありません。';
const fail = (): never => { throw new Error('本人・保存資料の版・見積期限・明示した準備上限を確認し、改めて見積もってください。'); };
const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
  byte => byte.toString(16).padStart(2, '0')).join('');

export type EveHandoffApproval = { materials: true; conditions: true; capMinor: number };
export type EveTextHandoff = { source: string; plan: CompositionPlan; originJobId: string; expiresAt: number };

/** Display routing only. This zero-budget checker can never dispatch a model. */
export function isEveTextHandoffPlan(plan: CompositionPlan): boolean {
  return plan.acceptance === ACCEPTANCE && plan.inputKind === 'text' && plan.budgetMinor === 0 &&
    plan.nodes.length === 1 && plan.nodes[0].id === 's1' && plan.nodes[0].tool === 'compose-check' &&
    JSON.stringify(plan.nodes[0].inputs) === '["source"]' &&
    Object.keys(plan.nodes[0].config).length === 2 && plan.nodes[0].config.minChars === 1 &&
    Array.isArray(plan.nodes[0].config.requiredText) && plan.nodes[0].config.requiredText.length === 2 &&
    plan.nodes[0].config.requiredText[0] === SCHEMA && /^[a-f0-9]{64}$/.test(String(plan.nodes[0].config.requiredText[1]));
}

/** A client-reviewed preparation snapshot, not a signed quote or spending grant.
 * The original material is referenced, never copied into another job here.
 * Caller supplies a job from an authenticated same-owner read; this helper
 * validates the projection and does not authenticate a WorkJob itself. */
export async function prepareEveTextHandoff(job: WorkJob, ownerScope: string, quote: EveTextEstimate,
  approval: EveHandoffApproval): Promise<EveTextHandoff> {
  if (!readOwnerScope(ownerScope) || !approval || Object.keys(approval).sort().join() !== 'capMinor,conditions,materials' ||
    approval.materials !== true || approval.conditions !== true || !Number.isSafeInteger(approval.capMinor) || approval.capMinor < 0) return fail();
  const prepared = await prepareEveTextEstimate(job);
  const checked = readEveTextEstimate(quote, { ...prepared, outputTokenLimit: 1200, comparisonCapMinor: approval.capMinor });
  if (!checked.withinUserCap || checked.estimate.maximumChargeMinor > approval.capMinor ||
    !['USD', 'JPY'].includes(checked.estimate.currency) || checked.cardId.length > 256 || checked.rateSource.length > 2048 ||
    checked.estimate.modelId.length > 120 || checked.estimate.pricingVersion.length > 256) return fail();
  const { currency, maximumChargeMinor, inputTokenUpperBound, outputTokenLimit, modelId, pricingVersion, rateCardDigest, expiresAt } = checked.estimate;
  const snapshot = { estimate: { currency, maximumChargeMinor, inputTokenUpperBound, outputTokenLimit, modelId, pricingVersion, rateCardDigest, expiresAt },
    unitRates: checked.unitRates.map(rate => ({ category: rate.category, rateMinorMicrosPerMillionTokens: rate.rateMinorMicrosPerMillionTokens })),
    rateSource: checked.rateSource, cardId: checked.cardId, sourceRef: prepared.sourceRef, promptDigest: prepared.promptDigest,
    withinUserCap: true, userCapMinor: approval.capMinor, estimateOnly: true, executionAuthorized: false, providerSubmission: 'not_performed' };
  const payload = { ownerScope, quote: snapshot, approval: { materials: true, conditions: true, capMinor: approval.capMinor },
    preparationOnly: true, executionAuthorized: false };
  const bindingDigest = await hash(JSON.stringify(payload));
  if (!eveTextEstimateIsCurrent(checked)) return fail();
  const source = JSON.stringify({ schema: SCHEMA, payload, bindingDigest });
  if (new TextEncoder().encode(source).byteLength > 12_000) return fail();
  const plan = parseCompositionPlan({ version: 1, objective: `見積条件の準備：${job.id}`, acceptance: ACCEPTANCE,
    inputKind: 'text', budgetMinor: 0, currency, deadline: '',
    nodes: [{ id: 's1', tool: 'compose-check', inputs: ['source'], config: { minChars: 1, requiredText: [SCHEMA, bindingDigest] } }] });
  return { source, plan, originJobId: job.id, expiresAt };
}

export function eveTextHandoffOrigin(source: string): string {
  try {
    const value = JSON.parse(source);
    const id = value?.payload?.quote?.sourceRef?.jobId;
    if (value?.schema !== SCHEMA || typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(id)) return fail();
    return id;
  } catch { return fail(); }
}

/** Revalidate against a fresh authenticated source read before a new write.
 * No cross-job atomic authorization is claimed: the saved descriptor is data,
 * and any future effect must obtain a separate authoritative approval/claim. */
export async function validateEveTextHandoff(source: string, job: WorkJob, ownerScope: string): Promise<EveTextHandoff> {
  try {
    const value = JSON.parse(source);
    if (value?.schema !== SCHEMA || value?.payload?.ownerScope !== ownerScope ||
      value?.payload?.preparationOnly !== true || value?.payload?.executionAuthorized !== false) return fail();
    const expected = await prepareEveTextHandoff(job, ownerScope, value.payload.quote, value.payload.approval);
    if (expected.source !== source) return fail();
    return expected;
  } catch { return fail(); }
}
