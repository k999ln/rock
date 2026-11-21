import type { ResearchSummary } from './noah-research-types';
import type { FeedbackFeedEntry } from './noah-feedback.ts';
import type { SkySocialPost } from './sky-social';
import { NOAH_SHELF_TEXT, type NoahShelfCard } from './noah-shelf-view.ts';

export type NoahTimelineItem =
  | { key: string; kind: 'agent'; agent: ResearchSummary }
  | { key: string; kind: 'post'; post: SkySocialPost }
  | { key: string; kind: 'feedback'; opinion: FeedbackFeedEntry }
  /** 棚のカード（出どころは「Noah の棚」。docs/noah/spec-110-shelf.md の 10 章）。 */
  | { key: string; kind: 'card'; card: NoahShelfCard };

/** 棚の 3 段を、タイムラインへ流す順にする（各段の 1 枚目、各段の 2 枚目… の順。段の中の順は、サーバーの並びのまま）。 */
export function noahShelfTimelineCards(shelves: readonly { cards?: readonly NoahShelfCard[] }[]): NoahShelfCard[] {
  const lists = shelves.map((shelf) => (Array.isArray(shelf.cards) ? shelf.cards : []));
  const out: NoahShelfCard[] = [];
  for (let n = 0; n < Math.max(0, ...lists.map((list) => list.length)); n++) for (const list of lists) if (list[n]) out.push(list[n]);
  return out;
}
/** タイムラインのカードの下に出す 1 行（動く所・あなたがやる事・数）。 */
export const noahTimelineCardFacts = (card: NoahShelfCard) => [
  ...card.runs.map((place) => NOAH_SHELF_TEXT.runs[place]),
  NOAH_SHELF_TEXT.owner(card.ownerSteps, card.ownerMinutes),
  card.numbers ? NOAH_SHELF_TEXT.numbers(card.numbers) : NOAH_SHELF_TEXT.noNumbers,
].join(' · ');
export type NoahTimelineFilter = 'all' | 'agent';

export function timelineFilter(hash: string): NoahTimelineFilter {
  return hash === '#agents' ? 'agent' : 'all';
}

/** Preserve each source's order; place personal posts before each clearly identified Agent introduction. */
export function mixNoahTimeline(
  agents: ResearchSummary[],
  posts: SkySocialPost[],
  opinions: FeedbackFeedEntry[] = [],
  cards: NoahShelfCard[] = [],
): NoahTimelineItem[] {
  const publicPosts = posts.filter((post) => !post.community);
  const followed: NoahTimelineItem[] = publicPosts
    .filter((post) => post.following)
    .map((post) => ({ key: `post:${post.id}`, kind: 'post', post }));
  const others: NoahTimelineItem[] = [
    ...publicPosts
      .filter((post) => !post.following)
      .map((post) => ({ key: `post:${post.id}`, kind: 'post' as const, post })),
    ...opinions.map((opinion) => ({
      key: `feedback:${opinion.id}`,
      kind: 'feedback' as const,
      opinion,
    })),
  ];
  others.sort(
    (a, b) =>
      (b.kind === 'feedback'
        ? b.opinion.createdAt
        : b.kind === 'post'
          ? b.post.createdAt
          : 0) -
      (a.kind === 'feedback'
        ? a.opinion.createdAt
        : a.kind === 'post'
          ? a.post.createdAt
          : 0),
  );
  const catalog: NoahTimelineItem[] = agents.map((agent) => ({
    key: `agent:${agent.id}`,
    kind: 'agent',
    agent,
  }));
  // 棚のカードは、1 巡に 1 枚（Agent の紹介の後）。
  const shelf: NoahTimelineItem[] = cards.map((card) => ({ key: `card:${card.id}`, kind: 'card', card }));
  const result: NoahTimelineItem[] = [],
    seen = new Set<string>();
  for (
    let n = 0;
    n < Math.max(Math.ceil(followed.length / 2), catalog.length, others.length, shelf.length);
    n++
  ) {
    for (const item of [
      followed[n * 2],
      followed[n * 2 + 1],
      others[n],
      catalog[n],
      shelf[n],
    ]) {
      if (item && !seen.has(item.key)) {
        seen.add(item.key);
        result.push(item);
      }
    }
  }
  return result;
}

export function appendNoahTimeline(
  previous: NoahTimelineItem[],
  incoming: NoahTimelineItem[],
) {
  const seen = new Set(previous.map((item) => item.key));
  return [
    ...previous,
    ...incoming.filter((item) => {
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    }),
  ];
}

export function selectNoahTimeline(
  items: NoahTimelineItem[],
  filter: NoahTimelineFilter,
  query = '',
) {
  const term = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    // Ignore historical/late snapshots from the retired mixed feed, too.
    if (
      item.kind !== 'agent' &&
      item.kind !== 'post' &&
      item.kind !== 'feedback' &&
      item.kind !== 'card'
    )
      return false;
    if (item.kind === 'post' && item.post.community) return false;
    if (filter === 'agent' && item.kind !== 'agent') return false;
    if (!term) return true;
    const text =
      item.kind === 'agent'
        ? `${item.agent.name} ${item.agent.summary} ${item.agent.author}`
        : item.kind === 'feedback'
          ? `${item.opinion.content} ${item.opinion.author} ${item.opinion.agentName}`
          : item.kind === 'card'
            ? `${item.card.title} ${item.card.promise} ${item.card.give} ${item.card.get} ${item.card.topicLabel}`
            : `${item.post.content} ${item.post.author.name}`;
    return text.toLocaleLowerCase().includes(term);
  });
}
