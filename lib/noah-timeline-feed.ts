import type { ResearchSummary } from './noah-research-types';
import type { SkySocialPost } from './sky-social';

export type NoahTimelineItem =
  | { key: string; kind: 'agent'; agent: ResearchSummary }
  | { key: string; kind: 'post'; post: SkySocialPost };
export type NoahTimelineFilter = 'all' | 'agent';

export function timelineFilter(hash: string): NoahTimelineFilter {
  return hash === '#agents' ? 'agent' : 'all';
}

/** Preserve each source's order; show up to two followed posts for each Agent and ordinary post. */
export function mixNoahTimeline(agents: ResearchSummary[], posts: SkySocialPost[]): NoahTimelineItem[] {
  const publicPosts = posts.filter(post => !post.community);
  const followed: NoahTimelineItem[] = publicPosts.filter(post => post.following).map(post => ({ key: `post:${post.id}`, kind: 'post', post }));
  const others: NoahTimelineItem[] = publicPosts.filter(post => !post.following).map(post => ({ key: `post:${post.id}`, kind: 'post', post }));
  const catalog: NoahTimelineItem[] = agents.map(agent => ({ key: `agent:${agent.id}`, kind: 'agent', agent }));
  const result: NoahTimelineItem[] = [], seen = new Set<string>();
  for (let n = 0; n < Math.max(Math.ceil(followed.length / 2), catalog.length, others.length); n++) {
    for (const item of [followed[n * 2], followed[n * 2 + 1], catalog[n], others[n]]) {
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
    // Ignore historical/late snapshots from the retired mixed feed, too.
    if (item.kind !== 'agent' && item.kind !== 'post') return false;
    if (item.kind === 'post' && item.post.community) return false;
    if (filter === 'agent' && item.kind !== 'agent') return false;
    if (!term) return true;
    const text = item.kind === 'agent' ? `${item.agent.name} ${item.agent.summary} ${item.agent.author}` : `${item.post.content} ${item.post.author.name}`;
    return text.toLocaleLowerCase().includes(term);
  });
}
