/** Bounded, deterministic discovery ranking. Ranking never grants read access. */
export type FeedCandidate = {
  key: string;
  source: string;
  text: string;
  createdAt: number;
  following?: boolean;
  community?: boolean;
};
export const FEED_BATCH = 12;
export const FEED_WINDOW = 200;
const stopWords = new Set(
  'the and for with from this that have news https www com です ます する した こと これ それ ため から まで ある いる なる ない について そして'.split(
    ' ',
  ),
);
const wordSegments =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('ja', { granularity: 'word' })
    : null;
export function feedTerms(text: string): string[] {
  const normalized = text.normalize('NFKC').toLowerCase();
  const terms = wordSegments
    ? [...wordSegments.segment(normalized)]
        .filter((part) => part.isWordLike)
        .flatMap(
          (part) =>
            part.segment.match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]{1,39}/gu) ?? [],
        )
    : (normalized.match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]{1,39}/gu) ?? []);
  return [...new Set(terms.filter((t) => !stopWords.has(t)))].slice(0, 24);
}

/** Reserve room for new candidates while keeping the currently rendered rows. */
export function mergeFeedBuffer<T extends { key: string; createdAt: number }>(
  previous: T[],
  incoming: T[],
  pinned: string[] = [],
  limit = FEED_WINDOW,
): T[] {
  const size = Math.min(FEED_WINDOW, Math.max(0, Math.floor(limit)));
  const byKey = new Map(
    [...previous, ...incoming]
      .filter((item) => Number.isFinite(item.createdAt))
      .map((item) => [item.key, item]),
  );
  const incomingKeys = new Set(incoming.map((item) => item.key));
  const sorted = [...byKey.values()].sort(
    (a, b) => b.createdAt - a.createdAt || a.key.localeCompare(b.key),
  );
  const fresh = [
    ...sorted.filter((item) => incomingKeys.has(item.key)),
    ...sorted.filter((item) => !incomingKeys.has(item.key)),
  ].slice(0, size);
  const kept = new Set(fresh.map((item) => item.key));
  for (const key of [...new Set(pinned)].slice(0, FEED_WINDOW)) {
    const item = byKey.get(key);
    if (item && !kept.has(key)) {
      fresh.push(item);
      kept.add(key);
    }
  }
  return fresh;
}

export function shouldRevealFeedUpdates(input: {
  enabled: boolean;
  live: boolean;
  pending: number;
  scrollY: number;
  visible: boolean;
  composing: boolean;
  selecting: boolean;
}) {
  return (
    input.enabled &&
    input.live &&
    input.pending > 0 &&
    input.visible &&
    Number.isFinite(input.scrollY) &&
    input.scrollY <= 120 &&
    !input.composing &&
    !input.selecting
  );
}
export function rankFeed<T extends FeedCandidate>(
  candidates: T[],
  {
    now,
    interests = [],
    seen = [],
    recentSources = [],
  }: {
    now: number;
    interests?: string[];
    seen?: string[];
    recentSources?: string[];
  },
  limit = FEED_BATCH,
): Array<{ item: T; reason: string }> {
  const excluded = new Set(seen),
    unique = new Map<string, T>();
  for (const item of candidates.slice(0, FEED_WINDOW * 3)) {
    if (
      !excluded.has(item.key) &&
      !unique.has(item.key) &&
      Number.isFinite(item.createdAt)
    )
      unique.set(item.key, item);
  }
  const topics = new Set(interests.slice(0, 48));
  const scored = [...unique.values()].map((item) => {
    const matches = feedTerms(item.text).filter((term) =>
      topics.has(term),
    ).length;
    const ageHours = Math.max(0, now - item.createdAt) / 3_600_000;
    const score =
      14 / (1 + ageHours / 6) +
      Math.min(18, matches * 6) +
      (item.following ? 8 : 0) +
      (item.community ? 5 : 0);
    return { item, score, matches };
  });
  const sources = recentSources.slice(-6),
    result: Array<{ item: T; reason: string }> = [];
  while (
    scored.length &&
    result.length < Math.min(FEED_BATCH * 2, Math.max(0, limit))
  ) {
    const explore = (seen.length + result.length + 1) % 5 === 0;
    scored.sort((a, b) => {
      const value = (entry: typeof a) =>
        (explore
          ? 14 / (1 + Math.max(0, now - entry.item.createdAt) / 21_600_000)
          : entry.score) -
        sources.filter((s) => s === entry.item.source).length * 8;
      return (
        value(b) - value(a) ||
        b.item.createdAt - a.item.createdAt ||
        a.item.key.localeCompare(b.item.key)
      );
    });
    const chosen = scored.shift()!;
    result.push({
      item: chosen.item,
      reason: chosen.item.following
        ? 'フォロー中'
        : chosen.matches && !explore
          ? '選んだ話題に関連'
          : explore
            ? '新しい話題を発見'
            : chosen.item.community
              ? 'コミュニティーから'
              : '新しく届いた投稿',
    });
    sources.push(chosen.item.source);
    if (sources.length > 6) sources.shift();
  }
  return result;
}

/** Keep the reader's position: existing rows never move when candidates arrive. */
export function appendFeed<T extends FeedCandidate>(
  keys: string[],
  candidates: T[],
  interests: string[],
  now: number,
  limit = FEED_BATCH,
) {
  const byKey = new Map(candidates.map((item) => [item.key, item]));
  const retained = keys.filter((key) => byKey.has(key));
  const next = rankFeed(
    candidates,
    {
      now,
      interests,
      seen: retained,
      recentSources: retained.slice(-6).map((key) => byKey.get(key)!.source),
    },
    Math.min(limit, FEED_WINDOW - retained.length),
  );
  return {
    keys: [...retained, ...next.map(({ item }) => item.key)].slice(
      0,
      FEED_WINDOW,
    ),
    next,
  };
}

export function feedPollDelay(failures: number) {
  return Math.min(120_000, 25_000 * 2 ** Math.min(3, Math.max(0, failures)));
}
