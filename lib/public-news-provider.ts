import {
  gdeltNewsUrl,
  parseGdeltArticles,
  cachedNewsForTopic,
  type EveNewsLink,
} from './eve-news-feed.ts';

const RSS_PATHS: Record<string, [string, string]> = {
  all: ['news', 'world'],
  world: ['news/world', 'world'],
  technology: ['news/technology', 'technology'],
  business: ['news/business', 'business'],
  science: ['news/science_and_environment', 'science'],
  games: ['news/technology', 'games'],
};
export function publicNewsFeeds(topic = '') {
  const key = topic || 'world';
  if (!Object.hasOwn(RSS_PATHS, key)) throw Error('Unknown news topic');
  const paths = RSS_PATHS[key];
  if (!paths) throw Error('Unknown news topic');
  return [
    `https://feeds.bbci.co.uk/${paths[0]}/rss.xml`,
    `https://www.theguardian.com/${paths[1]}/rss`,
  ];
}
function xmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
      (entity, key: string) => {
        const chars: Record<string, string> = {
          amp: '&',
          lt: '<',
          gt: '>',
          quot: '"',
          apos: "'",
        };
        if (chars[key]) return chars[key];
        const code = key.startsWith('#x')
          ? parseInt(key.slice(2), 16)
          : Number(key.slice(1));
        return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      },
    )
    .trim();
}
/** Metadata only, fixed publishers, no XML execution or external entity expansion. */
export function parsePublicRss(
  xml: string,
  feedUrl: string,
  now = Date.now(),
): EveNewsLink[] {
  const publisher = new URL(feedUrl).hostname;
  if (!['feeds.bbci.co.uk', 'www.theguardian.com'].includes(publisher))
    throw Error('Unapproved feed');
  if (
    xml.length > 512_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    !/<rss[\s>]/i.test(xml)
  )
    throw Error('Invalid RSS');
  const field = (item: string, name: string) =>
    xmlText(
      item.match(
        new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'),
      )?.[1] || '',
    );
  const seen = new Set<string>();
  const articles: EveNewsLink[] = [];
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const title = field(match[1], 'title'),
      stamp = Date.parse(field(match[1], 'pubDate'));
    if (
      !title ||
      title.length > 400 ||
      !Number.isFinite(stamp) ||
      stamp > now + 5 * 60_000 ||
      now - stamp > 72 * 60 * 60_000
    )
      continue;
    let url: URL;
    try {
      url = new URL(field(match[1], 'link'));
    } catch {
      continue;
    }
    const host = url.hostname;
    const allowed =
      publisher === 'feeds.bbci.co.uk'
        ? ['www.bbc.com', 'www.bbc.co.uk', 'bbc.com', 'bbc.co.uk'].includes(
            host,
          )
        : host === 'www.theguardian.com';
    if (!allowed || url.protocol !== 'https:' || url.username || url.password)
      continue;
    url.hash = '';
    for (const key of Array.from(url.searchParams.keys()))
      if (/^(utm_|at_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    articles.push({
      id: url.href,
      title,
      url: url.href,
      publisher: host.replace(/^www\./, ''),
      seenAt: new Date(stamp).toISOString(),
      language: 'English',
      sourceCountry: 'United Kingdom',
      timestampKind: 'published',
      provider: 'publisher-rss',
    });
    if (articles.length === 40) break;
  }
  return articles.sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt));
}
async function boundedText(response: Response) {
  if (!response.body) throw Error('Empty RSS');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    text = '';
  try {
    for (;;) {
      const value = await reader.read();
      if (value.done) break;
      bytes += value.value.byteLength;
      if (bytes > 512_000) throw Error('RSS exceeds limit');
      text += decoder.decode(value.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function fetchPublicNews(
  topic = '',
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  // RSS providers are independent; one outage cannot turn all feeds into an error.
  let availableButEmpty = false;
  try {
    const articles = await Promise.any(
      publicNewsFeeds(topic).map(async (url) => {
        const response = await fetcher(url, {
          headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
          signal: AbortSignal.timeout(4500),
          redirect: 'manual',
        });
        if (!response.ok) throw Error('RSS unavailable');
        const parsed = parsePublicRss(await boundedText(response), url, now);
        const selected =
          topic === 'games' ? cachedNewsForTopic(parsed, topic) : parsed;
        if (!selected.length) {
          if (topic === 'games' && parsed.length) availableButEmpty = true;
          throw Error('No recent RSS articles');
        }
        return selected;
      }),
    );
    return { source: 'Publisher RSS', articles };
  } catch (error) {
    if (availableButEmpty)
      return {
        source: 'Publisher RSS',
        articles: [],
        selection: 'headline-keywords',
      };
    console.warn(
      'news-rss-unavailable',
      error instanceof AggregateError
        ? error.errors.map((e) =>
            e instanceof Error ? e.message.slice(0, 160) : 'unavailable',
          )
        : 'unavailable',
    );
    const response = await fetcher(gdeltNewsUrl(topic), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw Error('News providers unavailable');
    const articles = parseGdeltArticles(await response.json()).filter(
      (a) =>
        Date.parse(a.seenAt) <= now + 300_000 &&
        now - Date.parse(a.seenAt) <= 72 * 60 * 60_000,
    );
    if (!articles.length) throw Error('No recent news');
    return { source: 'GDELT DOC 2.0', articles };
  }
}
