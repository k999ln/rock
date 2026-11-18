import type { EveNewsLink } from './eve-news-feed';
import type { ResearchSummary } from './noah-research-types';
import type { SkySocialPost } from './sky-social';

export type NoahTimelineItem =
  | { key: string; kind: 'news'; article: EveNewsLink; stale: boolean }
  | { key: string; kind: 'agent'; agent: ResearchSummary }
  | { key: string; kind: 'post' | 'community'; post: SkySocialPost };
export type NoahTimelineFilter = 'all' | 'news' | 'agent' | 'community' | 'following';

export function timelineFilter(hash: string): NoahTimelineFilter {
  if (hash === '#news') return 'news';
  if (hash === '#agents') return 'agent';
  if (hash === '#communities') return 'community';
  if (hash === '#following' || hash === '#social') return 'following';
  return 'all';
}

/** Interleave source-ranked rows, never invent a publication date for an Agent. */
export function mixNoahTimeline(news: EveNewsLink[], agents: ResearchSummary[], posts: SkySocialPost[], stale = false): NoahTimelineItem[] {
  const groups: NoahTimelineItem[][] = [
    news.map(article => ({ key: `news:${article.id}`, kind: 'news', article, stale })),
    agents.map(agent => ({ key: `agent:${agent.id}`, kind: 'agent', agent })),
    posts.map(post => ({ key: `post:${post.id}`, kind: post.community ? 'community' : 'post', post })),
  ];
  const result: NoahTimelineItem[] = [], seen = new Set<string>();
  for (let n = 0; n < Math.max(...groups.map(group => group.length)); n++) {
    for (const group of groups) {
      const item = group[n];
      if (item && !seen.has(item.key)) { seen.add(item.key); result.push(item); }
    }
  }
  return result;
}

export function appendNoahTimeline(previous: NoahTimelineItem[], incoming: NoahTimelineItem[]) {
  const seen = new Set(previous.map(item => item.key));
  return [...previous, ...incoming.filter(item => {
    if (seen.has(item.key)) return false;
    seen.add(item.key); return true;
  })];
}

export function selectNoahTimeline(items: NoahTimelineItem[], filter: NoahTimelineFilter, query = '') {
  const term = query.trim().toLocaleLowerCase();
  return items.filter(item => {
    if (filter === 'following' && !((item.kind === 'post' || item.kind === 'community') && item.post.following)) return false;
    if (filter !== 'all' && filter !== 'following' && item.kind !== filter) return false;
    if (!term) return true;
    const text = item.kind === 'news' ? `${item.article.title} ${item.article.publisher}`
      : item.kind === 'agent' ? `${item.agent.name} ${item.agent.summary} ${item.agent.author}`
        : `${item.post.content} ${item.post.author.name} ${item.post.community?.name ?? ''}`;
    return text.toLocaleLowerCase().includes(term);
  });
}
