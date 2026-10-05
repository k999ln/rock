import type { Automation } from './catalog';
import { candidateOutputKind } from './sky-candidate-output.ts';

// Implementation scope, not a claim of authenticated/live acceptance.
export type SkyExecutionScope =
  | 'browser-processing'
  | 'cloud-processing'
  | 'paper-simulation'
  | 'assisted-preparation'
  | 'local-planning'
  | 'local-guide'
  | 'pc-connector'
  | 'pc-service'
  | 'pc-app'
  | 'pc-cli'
  | 'connection-required'
  | 'template'
  | 'connection-plan'
  | 'unavailable';

const implemented: Record<string, SkyExecutionScope> = {
  'rockstar-amc': 'assisted-preparation',
  'rockstar-csv-cleanup': 'cloud-processing',
  'rockstar-markets-analysis': 'paper-simulation',
  'mercari-revenue': 'assisted-preparation',
  'fashion-brand-ops': 'local-planning',
  coconala: 'browser-processing',
  'mr-free-article': 'browser-processing',
  'mr-citations': 'browser-processing',
  'mr-delivery': 'pc-connector',
  'rockstar-ledger': 'pc-service',
  'jev-evaluation': 'connection-required',
  'rockstar-legal-intake': 'local-guide',
  'rockstar-patent-assistant': 'local-guide',
  'rockstar-ip-studio': 'pc-app',
  'jev-router': 'pc-cli',
};

export function skyToolExecutionScope(tool: Automation): SkyExecutionScope {
  if (Object.hasOwn(implemented, tool.id)) return implemented[tool.id];
  if (tool.runner === 'candidate-local')
    return candidateOutputKind(tool.id) ?? 'unavailable';
  return 'unavailable';
}
