import { chooseSkyModel, discoverSkyLocalModels } from './sky-model-routing.ts';
import { discoverFreeCloudModels, freeCloudEnabled, type FreeCloudRuntime } from './sky-free-cloud.ts';
import { skyRecurringUsage } from './sky-recurring-usage.ts';
import type { LlmRuntimeEnv } from './llm-providers.ts';

export async function selectSkyModel(input: {
  db: Pick<D1Database,'prepare'|'batch'>; owner: string; prompt: string;
  allowCloud: boolean; runtime: LlmRuntimeEnv & FreeCloudRuntime; fetcher?: typeof fetch;
}) {
  const candidates = await discoverSkyLocalModels(input.runtime,input.fetcher);
  let cloudStatus = input.allowCloud ? 'not_connected' : 'consent_required';
  if (input.allowCloud && freeCloudEnabled(input.runtime,input.owner)) {
    try {
      const plan = await skyRecurringUsage(input.db,input.owner);
      cloudStatus = plan.reason;
      if (plan.reason==='available') candidates.push(...await discoverFreeCloudModels(input.fetcher));
    } catch { cloudStatus = 'unavailable'; }
  }
  return {selection:chooseSkyModel(input.prompt,candidates),cloudStatus};
}
