import { chooseSkyModel, discoverSkyLocalModels } from './sky-model-routing.ts';
import { discoverFreeCloudModels, freeCloudEnabled, type FreeCloudRuntime } from './sky-free-cloud.ts';
import { skyRecurringUsage } from './sky-recurring-plan.ts';
import type { LlmRuntimeEnv } from './llm-providers.ts';

export async function selectSkyModel(input: {
  db: Pick<D1Database,'prepare'|'batch'>; owner: string; prompt: string;
  allowCloud: boolean; runtime: LlmRuntimeEnv & FreeCloudRuntime; fetcher?: typeof fetch; clock?: () => number;
}) {
  const candidates = await discoverSkyLocalModels(input.runtime,input.fetcher);
  let cloudStatus = input.allowCloud ? 'not_connected' : 'consent_required';
  if (input.allowCloud && freeCloudEnabled(input.runtime,input.owner)) {
    try {
      const plan = await skyRecurringUsage(input.db,input.owner,(input.clock ?? Date.now)());
      cloudStatus = plan.reason;
      if (plan.reason==='available') { const cloud=await discoverFreeCloudModels(input.fetcher); candidates.push(...cloud); cloudStatus=cloud.length?'available':'no_anonymous_model'; }
    } catch (error) { cloudStatus = error instanceof Error ? error.message : 'unavailable'; }
  }
  return {selection:chooseSkyModel(input.prompt,candidates),cloudStatus};
}
