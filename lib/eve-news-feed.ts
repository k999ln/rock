export type EveNewsLink = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  seenAt: string;
  language: string;
  sourceCountry: string;
};

export const EVE_NEWS_QUERY = 'politics sourcelang:english';
export const EVE_NEWS_PROVIDER = 'GDELT DOC 2.0';

export const EVE_NEWS_TOPICS: Record<string, string> = {
  all: '(technology OR science OR politics OR business OR gaming) sourcelang:english',
  technology: '(technology OR software OR robotics) sourcelang:english',
  world: 'politics sourcelang:english',
  business: '(business OR economy) sourcelang:english',
  science: 'science sourcelang:english',
  games: '(gaming OR videogames) sourcelang:english',
};
export function gdeltNewsUrl(topic = '') {
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.search = new URLSearchParams({
    query: EVE_NEWS_TOPICS[topic] ?? EVE_NEWS_QUERY,
    mode: 'artlist',
    maxrecords: '80',
    timespan: '24h',
    sort: 'datedesc',
    format: 'json',
  }).toString();
  return url.toString();
}

function seenAt(value: unknown) {
  if (typeof value !== 'string' || !/^\d{8}T\d{6}Z$/.test(value)) return null;
  const stamp = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
  return Number.isFinite(Date.parse(stamp)) ? stamp : null;
}

export function parseGdeltArticles(input: unknown): EveNewsLink[] {
  if (
    !input ||
    typeof input !== 'object' ||
    !Array.isArray((input as { articles?: unknown }).articles)
  )
    throw Error('News provider returned an invalid article list');
  const seen = new Set<string>();
  const result: EveNewsLink[] = [];
  for (const raw of (input as { articles: unknown[] }).articles.slice(0, 100)) {
    if (!raw || typeof raw !== 'object') continue;
    const article = raw as Record<string, unknown>;
    if (typeof article.url !== 'string' || typeof article.title !== 'string')
      continue;
    let url: URL;
    try {
      url = new URL(article.url);
    } catch {
      continue;
    }
    url.hash = '';
    const tracking = Array.from(url.searchParams.keys()).filter((key) =>
      /^(utm_|fbclid$|gclid$)/i.test(key),
    );
    for (const key of tracking) url.searchParams.delete(key);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      seen.has(url.href)
    )
      continue;
    if (
      /(^|\/)(author|authors|by|tag|tags|category|search|profile)(\/|$)/i.test(
        url.pathname,
      )
    )
      continue;
    const archivedYear = url.pathname.match(
      /\/(20\d{2})\/(?:0?[1-9]|1[0-2])(?:\/|$)/,
    );
    if (
      archivedYear &&
      Number(archivedYear[1]) < new Date().getUTCFullYear() - 1
    )
      continue;
    const title = article.title.trim();
    const date = seenAt(article.seendate);
    if (!title || title.length > 400 || !date) continue;
    seen.add(url.href);
    result.push({
      id: url.href,
      title,
      url: url.href,
      publisher: url.hostname.replace(/^www\./, ''),
      seenAt: date,
      language:
        typeof article.language === 'string'
          ? article.language.slice(0, 50)
          : 'unknown',
      sourceCountry:
        typeof article.sourcecountry === 'string'
          ? article.sourcecountry.slice(0, 80)
          : 'unknown',
    });
    if (result.length === 80) break;
  }
  return result;
}

/** Recovery selection only: headline words are not an article accuracy judgement. */
export function cachedNewsForTopic(articles: EveNewsLink[], topic: string) {
  const patterns: Record<string, RegExp> = {
    technology:
      /\b(technology|software|robot|ai|quantum|data center|hardware|model|cyber|digital)\b/i,
    world:
      /\b(politic|government|election|senator|minister|president|war|diploma|parliament)/i,
    business:
      /\b(business|econom|market|trade|accountan|invest|finance|compan|industr|price|bank)/i,
    science:
      /\b(science|scientific|research|clinical|cancer|drug|space|physics|biolog|medical|quantum)/i,
    games:
      /\b(gaming|videogame|game|games|esports|nintendo|playstation|xbox|bioware)/i,
  };
  return topic === 'all'
    ? articles
    : Object.hasOwn(patterns, topic)
      ? articles.filter((article) => patterns[topic].test(article.title))
      : [];
}
