import type { EveNewsLink } from './eve-news-feed.ts';
import { mergeFeedBuffer } from './sky-continuous-ranking.ts';

export type ContinuousNewsFeed = {
  selection?: string;
  articles: EveNewsLink[];
  fetchedAt: string;
  stale: boolean;
  arrivedKeys?: string[];
  staleKeys?: string[];
};

/** A newer response never upgrades old cached articles into fresh observations. */
export function mergeNewsCandidates(
  previous: ContinuousNewsFeed | null,
  incoming: ContinuousNewsFeed,
  displayedKeys: string[],
): ContinuousNewsFeed {
  const wrap = (article: EveNewsLink) => ({
    key: `news:${article.id}`,
    createdAt: Date.parse(article.seenAt),
    article,
  });
  const buffer = mergeFeedBuffer(
    (previous?.articles ?? []).map(wrap),
    incoming.articles.map(wrap),
    displayedKeys,
  );
  const existing = new Set(
    (previous?.articles ?? []).map((article) => article.id),
  );
  const retained = new Set(buffer.map((item) => item.key));
  const staleIds = new Set(
    previous?.staleKeys ??
      (previous?.stale ? previous.articles.map((article) => article.id) : []),
  );
  for (const article of incoming.articles) {
    if (incoming.stale) staleIds.add(article.id);
    else staleIds.delete(article.id);
  }
  return {
    ...incoming,
    articles: buffer.map((item) => item.article),
    arrivedKeys: [
      ...new Set([
        ...(previous?.arrivedKeys ?? []),
        ...(previous && !incoming.stale
          ? incoming.articles
              .filter((article) => !existing.has(article.id))
              .map((article) => `news:${article.id}`)
          : []),
      ]),
    ].filter((key) => retained.has(key)),
    staleKeys: buffer
      .filter((item) => staleIds.has(item.article.id))
      .map((item) => item.article.id),
  };
}
