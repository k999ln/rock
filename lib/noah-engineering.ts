import { noahUploadId } from './noah-agent-upload.ts';
import type { NoahPageParams } from './noah-page-routes.ts';

export const noahEngineeringSteps = ['create', 'connect', 'test', 'publish'] as const;
export type NoahEngineeringStep = (typeof noahEngineeringSteps)[number];

export function noahEngineeringSelection(params: NoahPageParams) {
  const step = noahEngineeringSteps.find(item => item === params.step) ?? null;
  if (!params.agent) return { step, agent: null };
  try { return { step, agent: noahUploadId(params.agent) }; }
  catch { return { step, agent: null }; }
}

export function noahEngineeringHref(step: NoahEngineeringStep, agent?: string | null) {
  const query = new URLSearchParams({ step });
  if (agent && (step === 'test' || step === 'publish')) query.set('agent', agent);
  return '/noah/engineering?' + query;
}
