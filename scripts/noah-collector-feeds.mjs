// Noah の Agent 収集に足した出所（task 121）。鍵の要らない公開 API と、公開の一覧だけを読む。
// 出所ごとに期限・失敗の待ち・ETag を収集機の SQLite（クラウドの checkpoint に入る）へ残し、続きから動く。
// 本文の転載はしない: 投稿（Hacker News）は題名とリンクと数だけ。awesome 一覧は MIT の一覧の、1 行の説明だけ。
// 鍵が要る所: Smithery（無料の鍵 SMITHERY_API_KEY が有る時だけ）。Glama・PulseMCP は鍵と表示義務・申請が要るので読まない。
// X・Reddit・Bluesky は、運営の Codex が読んだリンクを scripts/noah-collector-social.mjs で受け取る（ここでは読まない）。
import { NOAH_COLLECTION_LIMITS, collectionUrl, collectionMaxAge } from '../lib/noah-collection.ts';
import { looksLikeNoahSecret } from '../lib/noah-connect-requirements.ts';
import { xAgentProject } from './noah-collector-x.mjs';

const HOUR = 3_600_000, DAY = 24 * HOUR;
/** 出所ごとの間隔と、1 回に読む量。相手の制限（GitHub の未認証の検索は 1 分 10 回など）より十分少なく。 */
export const NOAH_FEEDS = {
  hackernews: { source: 'hackernews', everyMs: 30 * 60_000 },
  'github-mcp': { source: 'github', everyMs: 2 * HOUR },
  'huggingface-mcp': { source: 'huggingface', everyMs: 2 * HOUR },
  npm: { source: 'npm', everyMs: 6 * HOUR },
  docker: { source: 'docker', everyMs: 6 * HOUR },
  awesome: { source: 'awesome', everyMs: 6 * HOUR },
  smithery: { source: 'smithery', everyMs: 6 * HOUR, key: true },
};
/** 一覧のうち、許諾（MIT）を確かめた物だけ。説明 1 行を、出典のリンク付きで載せる。 */
export const AWESOME_LISTS = [
  { repo: 'punkpeye/awesome-mcp-servers', format: 'list' },
  { repo: 'wong2/awesome-mcp-servers', format: 'list' },
  { repo: 'jaw9c/awesome-remote-mcp-servers', format: 'remote-table' },
];
const UA = 'NoahBot/1 (+https://avoado.si/noah/help#bot)';
const text = (value, max) => {
  const out = Array.from(String(value ?? '')).map(char => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char)).join('').replace(/\s+/gu, ' ').trim();
  return Array.from(out).slice(0, max).join('');
};
const safe = value => (looksLikeNoahSecret(value) ? '' : value);
const iso = value => { const at = Date.parse(value ?? ''); return Number.isFinite(at) && at > 0 ? at : undefined; };
const count = value => (Number.isSafeInteger(value) && value >= 0 ? value : undefined);
const metricsOf = entries => { const out = {}; for (const [key, value] of entries) if (count(value) !== undefined) out[key] = value; return Object.keys(out).length ? out : undefined; };
/** 配布元の URL を、比べられる形にする。GitHub と HF の Space は小文字の決まった形、他は https の origin と path だけ。 */
export function projectUrl(value) {
  const known = xAgentProject(value);
  if (known) return known;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    return collectionUrl(`${url.origin}${url.pathname.replace(/\/+$/u, '') || '/'}`);
  } catch { return null; }
}

export class FeedFailure extends Error {
  constructor(code, retryAt = 0) { super(code); this.code = code; this.retryAt = retryAt; }
}
async function readBounded(response, limit) {
  if (!response.body || Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new FeedFailure('invalid_response'); }
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > limit) throw new FeedFailure('invalid_response'); chunks.push(value); }
    const joined = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder('utf-8', { fatal: true }).decode(joined);
  } catch (error) { throw error instanceof FeedFailure ? error : new FeedFailure('invalid_response'); } finally { await reader.cancel().catch(() => {}); }
}
/** 1 回の取得。転送は追わない。429・503 は相手の待ち時間を守る。 */
async function get(fetcher, url, { headers = {}, limit = 4 * 1024 * 1024, etag = null, now } = {}) {
  const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'application/json', ...(etag ? { 'If-None-Match': etag } : {}), ...headers } });
  if (response.status === 304) { await response.body?.cancel(); return { notModified: true }; }
  if (!response.ok) {
    const retry = response.headers.get('retry-after'), reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
    const at = retry && /^\d+$/u.test(retry) ? now + Number(retry) * 1000 : Number.isFinite(reset) && reset > now ? reset : 0;
    await response.body?.cancel();
    throw new FeedFailure(response.status === 429 || (response.status === 403 && at) ? 'rate_limited' : [401, 403].includes(response.status) ? 'needs_credentials' : 'unavailable', at);
  }
  return { body: await readBounded(response, limit), etag: response.headers.get('etag') };
}
const json = body => { try { return JSON.parse(body); } catch { throw new FeedFailure('invalid_response'); } };

/** 紹介 1 件の形（lib/noah-collection.ts の決まり）。expiresAt は、出所ごとの期限まで。 */
function lead(source, fields, now) {
  return { source, observedAt: now, expiresAt: now + collectionMaxAge(source), ...fields };
}

// ---- Hacker News（Algolia の公開検索 API）。直近 7 日の投稿のうち、配布元（GitHub・HF・npm）か、Show HN の物。
export const HN_QUERIES = ['MCP server', 'Model Context Protocol', 'AI agent', 'MCP'];
const HN_TOPIC = /\bmcp\b|agent|model context|\bllm|\bai\b|claude|\bgpt|copilot|assistant/iu;
async function hackernews({ fetcher, now }) {
  const items = new Map();
  for (const query of HN_QUERIES) {
    const url = new URL('https://hn.algolia.com/api/v1/search_by_date');
    url.search = new URLSearchParams({ query, tags: 'story', numericFilters: `created_at_i>${Math.floor((now - 7 * DAY) / 1000)}`, hitsPerPage: '100' }).toString();
    const page = json((await get(fetcher, url, { now })).body);
    if (!Array.isArray(page?.hits)) throw new FeedFailure('invalid_response');
    for (const hit of page.hits) {
      const id = String(hit?.objectID ?? ''), title = text(hit?.title, 300);
      if (!/^\d{1,12}$/u.test(id) || !title || typeof hit.url !== 'string') continue;
      const show = /^show hn\b/iu.test(title), project = projectUrl(hit.url);
      // 本文にだけ語がある投稿（題名が別の話題）は外す。
      if (!project || !HN_TOPIC.test(`${title} ${hit.url}`)) continue;
      const known = /^https:\/\/(github\.com|huggingface\.co\/spaces|www\.npmjs\.com\/package)\//u.test(project);
      if (!known && !show) continue;
      const name = safe(text(title.replace(/^show hn\s*[:：-]\s*/iu, ''), 200));
      if (!name) continue;
      items.set(`hackernews:${id}`, lead('hackernews', {
        id: `hackernews:${id}`, name, summary: 'Hacker Newsで紹介されたAgentです。内容と利用条件は配布元で確認できます。', author: 'Hacker News',
        url: project, sourceUrl: `https://news.ycombinator.com/item?id=${id}`, createdAt: count(hit.created_at_i) ? hit.created_at_i * 1000 : undefined,
        metrics: metricsOf([['points', hit.points], ['comments', hit.num_comments]]),
      }, now));
    }
  }
  return [...items.values()];
}

// ---- GitHub の MCP の新着（公開の検索 API。直近 14 日に作られた物を、スターの多い順）。
export const GITHUB_MCP_QUERIES = ['topic:mcp-server', 'topic:model-context-protocol', 'topic:mcp', '"mcp server" in:name,description'];
async function githubMcp({ fetcher, now, keys = {} }) {
  const since = new Date(now - 14 * DAY).toISOString().slice(0, 10), items = new Map();
  for (const query of GITHUB_MCP_QUERIES) {
    const url = new URL('https://api.github.com/search/repositories');
    url.search = new URLSearchParams({ q: `${query} created:>=${since} fork:false archived:false`, sort: 'stars', order: 'desc', per_page: '50' }).toString();
    // GitHub の定期実行の鍵（読むだけ）が有れば使う（未認証の検索は、共有の IP で混みやすい）。api.github.com だけへ送り、転送は追わない。
    const page = json((await get(fetcher, url, { now, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(keys.github ? { Authorization: `Bearer ${keys.github}` } : {}) } })).body);
    if (!Array.isArray(page?.items)) throw new FeedFailure('invalid_response');
    for (const repo of page.items) {
      const full = typeof repo?.full_name === 'string' ? repo.full_name : '';
      const project = xAgentProject(`https://github.com/${full}`);
      if (!project || repo.private || repo.fork) continue;
      const key = project.slice('https://github.com/'.length);
      items.set(key, lead('github', {
        id: `github-mcp:${key}`, name: safe(text(repo.name, 200)) || key, summary: safe(text(repo.description, 500)), author: text(repo.owner?.login, 200) || key.split('/')[0],
        url: project, sourceUrl: project, createdAt: iso(repo.created_at), metrics: metricsOf([['stars', repo.stargazers_count]]),
      }, now));
    }
  }
  return [...items.values()];
}

// ---- Hugging Face の MCP の Space（タグ mcp-server）。新しく作られた順と、いいねの多い順。ブラウザで試せる。
async function huggingfaceMcp({ fetcher, now }) {
  const items = new Map();
  for (const sort of ['createdAt', 'likes']) {
    const url = new URL('https://huggingface.co/api/spaces');
    url.search = new URLSearchParams({ filter: 'mcp-server', sort, direction: '-1', limit: '100', full: 'true' }).toString();
    const page = json((await get(fetcher, url, { now })).body);
    if (!Array.isArray(page)) throw new FeedFailure('invalid_response');
    for (const space of page) {
      const project = typeof space?.id === 'string' ? xAgentProject(`https://huggingface.co/spaces/${space.id}`) : null;
      // 提供元が「全年齢向けではない」と付けた Space は読まない。
      if (!project || space.private || (Array.isArray(space.tags) && space.tags.includes('not-for-all-audiences'))) continue;
      const card = space.cardData && typeof space.cardData === 'object' ? space.cardData : {};
      items.set(space.id, lead('huggingface', {
        id: `huggingface-mcp:${space.id}`, name: safe(text(card.title, 200)) || space.id.split('/')[1], summary: safe(text(card.short_description, 500)), author: text(space.author ?? space.id.split('/')[0], 200),
        url: project, sourceUrl: project, createdAt: iso(space.createdAt), run: 'space', metrics: metricsOf([['likes', space.likes]]),
      }, now));
    }
  }
  return [...items.values()];
}

// ---- npm（公開の検索）。MCP の鍵語の包み。手元の計算機で動かす配布。
export const NPM_QUERIES = ['keywords:mcp-server', 'keywords:modelcontextprotocol', 'keywords:mcp'];
async function npm({ fetcher, now, state }) {
  // npm の検索の日付は「最後に公開した日」なので、初めて読んだ回の包みは、前からある物とする（その後に初めて見えた包みが新着）。
  const items = new Map(), seeding = !state.seeded;
  for (const query of NPM_QUERIES) for (const from of [0, 250]) {
    const url = new URL('https://registry.npmjs.org/-/v1/search');
    url.search = new URLSearchParams({ text: query, size: '250', from: String(from) }).toString();
    const page = json((await get(fetcher, url, { now })).body);
    if (!Array.isArray(page?.objects)) throw new FeedFailure('invalid_response');
    for (const object of page.objects) {
      const pkg = object?.package, name = typeof pkg?.name === 'string' ? pkg.name : '';
      if (!/^(?:@[a-z0-9][a-z0-9._~-]{0,213}\/)?[a-z0-9][a-z0-9._~-]{0,213}$/u.test(name) || items.has(name)) continue;
      let sourceUrl;
      try { sourceUrl = collectionUrl(`https://www.npmjs.com/package/${name}`); } catch { continue; }
      const repository = typeof pkg.links?.repository === 'string' ? projectUrl(pkg.links.repository.replace(/^git\+/u, '').replace(/\.git$/u, '')) : null;
      items.set(name, lead('npm', {
        id: `npm:${name}`, name: text(name, 200), summary: safe(text(pkg.description, 500)), author: text(pkg.publisher?.username ?? name.split('/')[0], 200),
        url: repository ?? sourceUrl, sourceUrl, createdAt: iso(pkg.date), run: 'mac', metrics: metricsOf([['downloads', object.downloads?.weekly]]), seeding,
      }, now));
    }
  }
  state.seeded = true;
  return [...items.values()];
}

// ---- Docker の MCP 一覧（hub.docker.com の mcp 名前空間）。手元の計算機で動かす配布。
// 未認証では 1 頁目（100 件）より先を読めないので、更新の新しい順と、取得の多い順の 1 頁目ずつ。登録の日（date_registered）が出た時。
const DOCKER_INFRA = new Set(['signatures', 'docker-mcp-catalog', 'catalog', 'community-registry']);
async function docker({ fetcher, now }) {
  const items = new Map();
  for (const ordering of ['last_updated', 'pull_count']) {
    const url = new URL('https://hub.docker.com/v2/namespaces/mcp/repositories');
    url.search = new URLSearchParams({ page_size: '100', ordering }).toString();
    const body = json((await get(fetcher, url, { now })).body);
    if (!Array.isArray(body?.results)) throw new FeedFailure('invalid_response');
    for (const repo of body.results) {
      const name = typeof repo?.name === 'string' ? repo.name : '';
      if (!/^[a-z0-9][a-z0-9._-]{0,254}$/u.test(name) || DOCKER_INFRA.has(name) || repo.is_private) continue;
      const sourceUrl = `https://hub.docker.com/r/mcp/${name}`;
      items.set(name, lead('docker', {
        id: `docker:mcp/${name}`, name, summary: safe(text(repo.description, 500)), author: 'Docker MCP',
        url: sourceUrl, sourceUrl, createdAt: iso(repo.date_registered), run: 'mac', metrics: metricsOf([['pulls', repo.pull_count], ['stars', repo.star_count]]),
      }, now));
    }
  }
  return [...items.values()];
}

// ---- awesome 一覧（GitHub の README。ETag で変わった時だけ読む）。初めて読んだ時の行は「前からある物」、後から増えた行が新着。
const LIST_LINE = /^\s*[-*]\s+(?:<img[^>]*>\s*)?(?:\*\*)?\[([^\]]{1,200})\]\((https:\/\/[^)\s]{1,500})\)(?:\*\*)?(.*)$/u;
export function parseAwesome(markdown, format) {
  const out = [];
  for (const line of markdown.split('\n')) {
    if (format === 'remote-table') {
      const cells = line.split('|').map(cell => cell.trim());
      if (cells.length < 6 || !(cells[3] ?? '').startsWith('`https://')) continue;
      const site = /\((https:\/\/[^)\s]{1,500})\)/u.exec(cells[5] ?? '')?.[1];
      const auth = text(cells[4].replace(/[^\p{L}\p{N} .+-]/gu, ''), 40);
      const url = site && projectUrl(site);
      if (!url) continue;
      out.push({ name: text(cells[1], 200), url, summary: text(`${cells[2]}のリモートMCP（${auth || '認証不明'}）`, 300), auth });
      continue;
    }
    const match = LIST_LINE.exec(line);
    if (!match) continue;
    const url = projectUrl(match[2]);
    if (!url || /^https:\/\/(github\.com\/[^/]+\/awesome-|glama\.ai\/)/u.test(url)) continue;
    const rest = match[3].replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/gu, '').replace(/<[^>]+>/gu, '').replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1').replace(/\*\*/gu, '');
    const dash = rest.search(/\s[-–—]\s/u);
    out.push({ name: text(match[1].replace(/[`*]/gu, ''), 200), url, summary: text(dash >= 0 ? rest.slice(dash + 3) : '', 300) });
  }
  return out;
}
async function awesome({ fetcher, now, state }) {
  const items = [], etags = state.etags ?? {}, seeded = state.seeded ?? {}, previous = state.lists ?? {};
  for (const list of AWESOME_LISTS) {
    const result = await get(fetcher, `https://raw.githubusercontent.com/${list.repo}/HEAD/README.md`, { now, etag: etags[list.repo], limit: 6 * 1024 * 1024, headers: { Accept: 'text/plain' } });
    const entries = result.notModified ? previous[list.repo] ?? [] : parseAwesome(result.body, list.format);
    if (!result.notModified) { etags[list.repo] = result.etag; previous[list.repo] = entries; }
    for (const entry of entries) {
      if (!entry.name || looksLikeNoahSecret(entry.name) || looksLikeNoahSecret(entry.summary)) continue;
      const owner = entry.url.startsWith('https://github.com/') ? entry.url.split('/')[3] : new URL(entry.url).hostname;
      items.push(lead('awesome', {
        id: `awesome:${list.repo}:${entry.url}`.slice(0, 320), name: entry.name, summary: entry.summary, author: text(owner, 200),
        url: entry.url, sourceUrl: `https://github.com/${list.repo}`, seeding: !seeded[list.repo],
        ...(entry.auth && /oauth|key|token|bearer/iu.test(entry.auth) ? { run: 'key' } : {}),
      }, now));
    }
    seeded[list.repo] = true;
  }
  // 一覧の中身は、ETag が同じ間の再読込に使う（GitHub の帯域を使わない）。
  Object.assign(state, { etags, seeded, lists: previous });
  return items;
}

// ---- Smithery（鍵が有る時だけ。並べ替えが無いので、頁を順に回る。1 回 20 頁 = 2,000 件）。
async function smithery({ fetcher, now, state, keys }) {
  if (!keys.smithery) throw new FeedFailure('needs_credentials');
  const items = [];
  let page = state.page ?? 1;
  for (let read = 0; read < 20; read++) {
    const url = new URL('https://api.smithery.ai/servers');
    url.search = new URLSearchParams({ page: String(page), pageSize: '100' }).toString();
    const body = json((await get(fetcher, url, { now, headers: { Authorization: `Bearer ${keys.smithery}` } })).body);
    if (!Array.isArray(body?.servers) || !body.pagination) throw new FeedFailure('invalid_response');
    for (const server of body.servers) {
      const name = typeof server?.qualifiedName === 'string' ? server.qualifiedName : '';
      if (!/^[\x21-\x7e]{1,300}$/u.test(name) || server.unlisted || server.inactive) continue;
      let sourceUrl;
      try { sourceUrl = collectionUrl(`https://smithery.ai/servers/${name}`); } catch { continue; }
      const home = typeof server.homepage === 'string' ? projectUrl(server.homepage) : null;
      items.push(lead('smithery', {
        id: `smithery:${name}`, name: safe(text(server.displayName, 200)) || name, summary: safe(text(server.description, 500)), author: text(server.namespace ?? name, 200),
        url: home && !home.startsWith('https://smithery.ai/') ? home : sourceUrl, sourceUrl, createdAt: iso(server.createdAt),
        run: server.remote ? 'key' : 'mac', metrics: metricsOf([['uses', server.useCount]]),
      }, now));
    }
    page = page >= Number(body.pagination.totalPages) ? 1 : page + 1;
    if (page === 1) break;
  }
  state.page = page;
  return items;
}

const READERS = { hackernews, 'github-mcp': githubMcp, 'huggingface-mcp': huggingfaceMcp, npm, docker, awesome, smithery };

/** 収集機の SQLite の、出所の状態と、集めた紹介の表（手元だけ。本番の表ではない）。 */
export function feedTables(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS _noah_collector_feeds(id TEXT PRIMARY KEY, next_at INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, error TEXT, last_success_at INTEGER, state_json TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS _noah_collector_leads(id TEXT PRIMARY KEY, feed TEXT NOT NULL, source TEXT NOT NULL, item_json TEXT NOT NULL, first_seen_at INTEGER NOT NULL, seen_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS _noah_collector_leads_source ON _noah_collector_leads(source, seen_at);`);
}

/**
 * 期限の来た出所を、1 つずつ読む。失敗した出所は、その出所だけ待つ（2 の n 乗分、最大 1 日。相手の指定が長ければ、そちら）。
 * 出た時（createdAt）の決まり: 出所の時刻と、Noah が初めて見た時の、早い方。出所の時刻が無い物（awesome 一覧）は、初めて見た時。
 * ただし、一覧を初めて読んだ回の行は、前からある物として 30 日前にする（一覧の全部が「新着」にならないように）。
 */
export async function collectFeeds({ local, fetcher, now = Date.now, keys = {}, signal }) {
  feedTables(local.sql);
  const results = {};
  for (const [id, feed] of Object.entries(NOAH_FEEDS)) {
    if (signal?.aborted) break;
    const at = now();
    const row = local.sql.prepare('SELECT next_at,failures,state_json FROM _noah_collector_feeds WHERE id=?').get(id) ?? { next_at: 0, failures: 0, state_json: '{}' };
    if (feed.key && !keys[feed.source]) { results[id] = { status: 'needs_credentials' }; continue; }
    if (row.next_at > at) { results[id] = { status: 'not_due', nextAt: row.next_at }; continue; }
    const state = JSON.parse(row.state_json);
    try {
      const items = await READERS[id]({ fetcher, now: at, state, keys });
      local.assertLease();
      local.sql.exec('BEGIN');
      try {
        const upsert = local.sql.prepare(`INSERT INTO _noah_collector_leads(id,feed,source,item_json,first_seen_at,seen_at) VALUES(?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET item_json=excluded.item_json, seen_at=excluded.seen_at`);
        const first = local.sql.prepare('SELECT first_seen_at FROM _noah_collector_leads WHERE id=?');
        for (const { seeding, ...item } of items) {
          const seen = first.get(item.id)?.first_seen_at ?? (seeding ? at - 30 * DAY : at);
          const createdAt = Math.min(item.createdAt ?? seen, seen);
          upsert.run(item.id, id, feed.source, JSON.stringify({ ...item, createdAt }), seen, at);
        }
        local.sql.prepare(`INSERT INTO _noah_collector_feeds(id,next_at,failures,error,last_success_at,state_json) VALUES(?,?,0,NULL,?,?)
          ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at,failures=0,error=NULL,last_success_at=excluded.last_success_at,state_json=excluded.state_json`).run(id, at + feed.everyMs, at, JSON.stringify(state));
        local.sql.exec('COMMIT');
      } catch (error) { local.sql.exec('ROLLBACK'); throw error; }
      results[id] = { status: 'updated', collected: items.length };
    } catch (error) {
      if (error?.message === 'collector_lease_lost') throw error;
      const code = error instanceof FeedFailure ? error.code : 'unavailable', failures = row.failures + 1;
      const next = Math.max(at + Math.min(2 ** Math.min(failures, 10) * 60_000, DAY), error instanceof FeedFailure ? error.retryAt : 0);
      local.sql.prepare(`INSERT INTO _noah_collector_feeds(id,next_at,failures,error,state_json) VALUES(?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at,failures=excluded.failures,error=excluded.error`).run(id, next, failures, code, row.state_json);
      results[id] = { status: code, nextAt: next };
    }
  }
  // 期限を過ぎた紹介（出所が 7 日以上返さなくなった物）は、手元からも消す。
  local.sql.prepare('DELETE FROM _noah_collector_leads WHERE seen_at < ?').run(now() - NOAH_COLLECTION_LIMITS.maxAgeMs);
  return results;
}

/** 今の紹介（期限内）を、出所ごとに返す。 */
export function feedLeads(local, now) {
  feedTables(local.sql);
  return local.sql.prepare('SELECT item_json FROM _noah_collector_leads ORDER BY id').all().map(row => JSON.parse(row.item_json)).filter(item => item.expiresAt > now);
}
export function feedStatus(sql) {
  feedTables(sql);
  return sql.prepare('SELECT id,last_success_at,next_at AS next_run_at,error AS error_code,failures AS failure_count FROM _noah_collector_feeds ORDER BY id').all();
}
