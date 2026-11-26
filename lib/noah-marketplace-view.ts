import type { NoahAgentCard } from './noah-agent-cards.ts';
import type { NoahPageParams } from './noah-page-routes.ts';
export function noahMarketplaceHref(params: NoahPageParams = {}) {
  const query = new URLSearchParams();
  for (const key of ['package', 'model', 'q', 'collectionQuery', 'collectionSource', 'collectionTopic']) {
    const input = params[key], value = Array.isArray(input) ? input[0] : input;
    if (typeof value === 'string' && value.trim()) query.set(key, value.trim().slice(0, key === 'package' ? 256 : 200));
  }
  return `/noah${query.size ? `?${query}` : ''}`;
}
export function noahMarketplaceCardHref(market: NonNullable<NoahAgentCard['marketplace']>, params: NoahPageParams = {}) {
  return market.kind === 'tool' ? `/noah/tools/${encodeURIComponent(market.key)}`
    : noahMarketplaceHref({ ...params, package: undefined, model: undefined, [market.kind]: market.key });
}
