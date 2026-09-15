import type { Automation } from './catalog';
import type { AutomationFundCandidate } from './automation-fund';

function affinity(category: string) {
  const strategies: AutomationFundCandidate['strategyAffinity'] = ['balanced'];
  if (/販売|ブランド|経費|契約/u.test(category)) strategies.push('commerce');
  if (/記事|案件|納品|法律|生活/u.test(category))
    strategies.push('creator-services');
  return strategies;
}

export function fundCandidatesFromCatalog(
  catalog: Automation[],
): AutomationFundCandidate[] {
  return catalog.map((tool) => ({
    toolId: tool.id,
    role: tool.category,
    strategyAffinity: affinity(tool.category),
    ready: tool.status === 'ready',
    verifiedGrossMinor: 0,
    operatingCostMinor: 0,
    completedReceipts: 0,
    failedRuns: 0,
  }));
}
