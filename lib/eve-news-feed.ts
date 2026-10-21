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

export function gdeltNewsUrl() {
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.search = new URLSearchParams({
    query: EVE_NEWS_QUERY,
    mode: 'artlist',
    maxrecords: '20',
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
  if (!input || typeof input !== 'object' || !Array.isArray((input as { articles?: unknown }).articles)) throw Error('News provider returned an invalid article list');
  const seen = new Set<string>();
  const result: EveNewsLink[] = [];
  for (const raw of (input as { articles: unknown[] }).articles.slice(0, 40)) {
    if (!raw || typeof raw !== 'object') continue;
    const article = raw as Record<string, unknown>;
    if (typeof article.url !== 'string' || typeof article.title !== 'string') continue;
    let url: URL;
    try { url = new URL(article.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || seen.has(url.href)) continue;
    if (/(^|\/)(author|authors|by|tag|tags|category|search|profile)(\/|$)/i.test(url.pathname)) continue;
    const archivedYear = url.pathname.match(/\/(20\d{2})\/(?:0?[1-9]|1[0-2])(?:\/|$)/);
    if (archivedYear && Number(archivedYear[1]) < new Date().getUTCFullYear() - 1) continue;
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
      language: typeof article.language === 'string' ? article.language.slice(0, 50) : 'unknown',
      sourceCountry: typeof article.sourcecountry === 'string' ? article.sourcecountry.slice(0, 80) : 'unknown',
    });
    if (result.length === 20) break;
  }
  return result;
}
