import { remoteMcpUrl } from './mcp-inspection.ts';
import { sha256Hex, looksLikeNoahSecret } from './noah-connect-requirements.ts';
import type { NoahPin } from './noah-pin-scene.ts';
import { parseNoahPinForStorage } from './noah-pin-storage.ts';

/**
 * 集めた Agent の紹介（R2 の出所ごとのスナップショット）。task 120 で 4 出所、task 121 で出所を増やし、並びを「新しく・使いやすい物が上」にした。
 * task 125 で Product Hunt と「Noahが読んだ」（運営の Codex が投稿から配布元まで読み、日本語で理解を書いた紹介）を足した。
 * 紹介は発見であって、実行の権利ではない。スマホから動く物（run: 'phone'）だけが、Noah の一覧（グリッド）の系列を指す。
 */
export const NOAH_COLLECTION_SOURCES = ['mcp-registry', 'github', 'huggingface', 'hackernews', 'npm', 'docker', 'smithery', 'awesome', 'producthunt', 'noah-read', 'x', 'reddit', 'bluesky'] as const;
export type NoahCollectionSource = typeof NOAH_COLLECTION_SOURCES[number];
export const NOAH_COLLECTION_LABELS: Record<NoahCollectionSource, string> = {
  'mcp-registry': 'MCP Registry', github: 'GitHub', huggingface: 'Hugging Face', hackernews: 'Hacker News', npm: 'npm', docker: 'Docker',
  smithery: 'Smithery', awesome: 'awesome一覧', producthunt: 'Product Hunt', 'noah-read': 'Noahが読んだ', x: 'X', reddit: 'Reddit', bluesky: 'Bluesky',
};
/**
 * 公開の紹介に出さない語（成人向け・顔の差し替え・脱衣など）。Noah は利用規約上、成人向けの道具を紹介しない。名前・説明・配布元の URL のどれかに当たれば、載せない。
 * 決まった語の照合だけ（ML なし）。外した数は収集機の状態に残す。
 */
export const NOAH_COLLECTION_BLOCKED = /\b(?:nsfw|uncensored|nude|nudity|naked|porn\w*|hentai|erotic\w*|sexy|undress\w*|deepfakes?|face[ -]?swap\w*|lewd|onlyfans|r18|18\+)(?![\w])/iu;
export const noahCollectionBlocked = (item: { name: string; summary: string; url: string }) => NOAH_COLLECTION_BLOCKED.test(`${item.name} ${item.summary} ${item.url}`);
/** 投稿（SNS）の出所。投稿の本文は転載せず、決まった説明文とリンク・数だけを載せる。 */
export const NOAH_COLLECTION_SOCIAL = ['x', 'reddit', 'bluesky'] as const;
export const NOAH_COLLECTION_SOCIAL_SUMMARY: Record<typeof NOAH_COLLECTION_SOCIAL[number], string> = {
  x: 'Xで紹介されたAgentのリンクです。内容と利用条件は配布元で確認できます。',
  reddit: 'Redditで紹介されたAgentのリンクです。内容と利用条件は配布元で確認できます。',
  bluesky: 'Blueskyで紹介されたAgentのリンクです。内容と利用条件は配布元で確認できます。',
};
export const NOAH_COLLECTION_PATH = '/api/noah/collection';
export const NOAH_COLLECTION_LIMITS = { items: 500, bytes: 1_048_576, maxAgeMs: 7 * 86_400_000, xAgeMs: 86_400_000, socialAgeMs: 3 * 86_400_000 };
/** 出所ごとの数（外部の反応）。Noah の王冠・利用人数へは足さない。並びの加点にだけ使う。 */
export const NOAH_COLLECTION_METRICS: Record<NoahCollectionSource, readonly string[]> = {
  'mcp-registry': [], github: ['stars'], huggingface: ['likes'], hackernews: ['points', 'comments'], npm: ['downloads'], docker: ['pulls', 'stars'],
  smithery: ['uses'], awesome: [], producthunt: [], 'noah-read': [], x: ['likes', 'reposts'], reddit: ['upvotes', 'comments'], bluesky: ['likes', 'reposts'],
};
export const NOAH_COLLECTION_METRIC_LABELS: Record<string, string> = {
  stars: 'スター', likes: 'いいね', reposts: 'リポスト', points: '点', comments: 'コメント', downloads: '週の取得', pulls: '取得', uses: '接続', upvotes: '賛成',
};
/**
 * 動かし方。phone: Noah の一覧にあり、スマホから押すだけで動く（鍵なし）。space: ブラウザで試せる（Hugging Face の Space）。
 * key: 鍵・サインインが要る。mac: 手元の計算機で動かす配布（npm・Docker など）。分からない物は、項目を置かない。
 */
export const NOAH_COLLECTION_RUNS = ['phone', 'space', 'key', 'mac'] as const;
export type NoahCollectionRun = typeof NOAH_COLLECTION_RUNS[number];
export const NOAH_COLLECTION_RUN_LABELS: Record<NoahCollectionRun, string> = { phone: 'スマホで今すぐ', space: 'ブラウザで試せる', key: '鍵が要る', mac: 'Macで動く' };
export type NoahCollectionMetrics = Partial<Record<'stars' | 'likes' | 'reposts' | 'points' | 'comments' | 'downloads' | 'pulls' | 'uses' | 'upvotes', number>>;
export type NoahCollectionItem = {
  id: string; source: NoahCollectionSource; name: string; summary: string; author: string;
  url: string; sourceUrl: string; observedAt: number; expiresAt: number;
  metrics?: NoahCollectionMetrics;
  /** 出た時（作られた・公開された・投稿された時）。無い紹介は、確かめた時の 7 日前として扱う。 */
  createdAt?: number;
  run?: NoahCollectionRun;
  /** run が phone の時の、Noah の系列（詳細の頁へつなぐ）。 */
  familyId?: string;
  pin?: NoahPin;
  // Collection cards are discoveries, never an execution entitlement.
};
export type NoahCollectionSnapshot = { schema: 'noah-collection/1'; source: NoahCollectionSource; collectedAt: number; items: NoahCollectionItem[] };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fail = (): never => { throw Error('collection_invalid'); };
function clean(v: unknown, max: number) {
  if (typeof v !== 'string' || v.length > max || Array.from(v).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || looksLikeNoahSecret(v)) return fail();
  return v;
}
export function collectionUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000 || looksLikeNoahSecret(value)) return fail();
  const url = remoteMcpUrl(value);
  if (url.search || url.hash) return fail();
  return url.href;
}
const HN_ITEM = /^https:\/\/news\.ycombinator\.com\/item\?id=\d{1,12}$/u;
/** 出典の URL が、その出所の物か。Hacker News の投稿だけは ?id= を持つので、形を固定して確かめる。 */
function sourceUrlOf(source: NoahCollectionSource, value: unknown) {
  if (source === 'hackernews') return typeof value === 'string' && HN_ITEM.test(value) ? value : fail();
  const href = collectionUrl(value), url = new URL(href), path = url.pathname;
  const ok = {
    github: url.hostname === 'github.com', awesome: url.hostname === 'github.com', huggingface: url.hostname === 'huggingface.co',
    'mcp-registry': url.hostname === 'registry.modelcontextprotocol.io',
    x: url.hostname === 'x.com' && /^\/[A-Za-z0-9_]{1,15}\/status\/\d{1,25}$/u.test(path),
    npm: url.hostname === 'www.npmjs.com' && /^\/package\/(?:@[a-z0-9][a-z0-9._~-]{0,213}\/)?[a-z0-9][a-z0-9._~-]{0,213}$/u.test(path),
    docker: url.hostname === 'hub.docker.com' && /^\/r\/[a-z0-9][a-z0-9._-]{0,254}\/[a-z0-9][a-z0-9._-]{0,254}$/u.test(path),
    smithery: url.hostname === 'smithery.ai' && /^\/servers\/[\x21-\x7e]{1,300}$/u.test(path),
    producthunt: url.hostname === 'www.producthunt.com' && /^\/(?:products|posts)\/[a-z0-9][a-z0-9-]{0,119}$/u.test(path),
    // 「Noahが読んだ」の出典は、運営が読んだ配布元の頁（README・公式の説明）。https の公開の頁なら、どの場所でもよい。
    'noah-read': true,
    reddit: url.hostname === 'www.reddit.com' && /^\/r\/[A-Za-z0-9_]{2,21}\/comments\/[a-z0-9]{1,12}(?:\/[A-Za-z0-9_-]{0,120})?\/?$/u.test(path),
    bluesky: url.hostname === 'bsky.app' && /^\/profile\/[A-Za-z0-9.:-]{3,253}\/post\/[a-z0-9]{10,16}$/u.test(path),
  }[source];
  return ok ? href : fail();
}
const FAMILY = /^[\x21-\x7e]{3,400}$/u;
const time = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : fail());
export function collectionMaxAge(source: NoahCollectionSource) {
  return source === 'x' ? NOAH_COLLECTION_LIMITS.xAgeMs : source === 'reddit' || source === 'bluesky' ? NOAH_COLLECTION_LIMITS.socialAgeMs : NOAH_COLLECTION_LIMITS.maxAgeMs;
}
export function parseCollectionSnapshot(value: unknown, now: number): NoahCollectionSnapshot {
  if (!object(value) || value.schema !== 'noah-collection/1' || !NOAH_COLLECTION_SOURCES.includes(value.source as NoahCollectionSource) || !Array.isArray(value.items) || value.items.length > NOAH_COLLECTION_LIMITS.items) return fail();
  const source = value.source as NoahCollectionSource, at = value.collectedAt;
  if (typeof at !== 'number' || !Number.isSafeInteger(at) || at < 1 || at > now + 120_000) return fail();
  const ids = new Set<string>();
  const items = value.items.map((raw): NoahCollectionItem => {
    if (!object(raw) || raw.source !== source) return fail();
    const id = clean(raw.id, 320), name = clean(raw.name, 200), summary = clean(raw.summary, 500), author = clean(raw.author, 200);
    if (!id || !name || ids.has(id)) return fail(); ids.add(id);
    const url = collectionUrl(raw.url), sourceUrl = sourceUrlOf(source, raw.sourceUrl);
    const observedAt = time(raw.observedAt), expiresAt = time(raw.expiresAt);
    if (observedAt > at || expiresAt <= observedAt || expiresAt > observedAt + collectionMaxAge(source)) return fail();
    // Posts are referenced by URL; their text is not republished as an Agent description.
    if (source === 'x' && (summary !== NOAH_COLLECTION_SOCIAL_SUMMARY.x || !author.startsWith('@'))) return fail();
    if (source === 'bluesky' && (summary !== NOAH_COLLECTION_SOCIAL_SUMMARY.bluesky || !author.startsWith('@'))) return fail();
    if (source === 'reddit' && (summary !== NOAH_COLLECTION_SOCIAL_SUMMARY.reddit || !/^r\/[A-Za-z0-9_]{2,21}$/u.test(author))) return fail();
    const metrics: NoahCollectionMetrics = {};
    if (raw.metrics !== undefined) {
      if (!object(raw.metrics)) return fail();
      for (const [metric, count] of Object.entries(raw.metrics)) {
        if (!NOAH_COLLECTION_METRICS[source].includes(metric) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return fail();
        metrics[metric as keyof NoahCollectionMetrics] = count;
      }
    }
    const extra: Pick<NoahCollectionItem, 'createdAt' | 'run' | 'familyId'> = {};
    if (raw.createdAt !== undefined) { extra.createdAt = time(raw.createdAt); if (extra.createdAt > at + 120_000) return fail(); }
    if (raw.run !== undefined) { if (!NOAH_COLLECTION_RUNS.includes(raw.run as NoahCollectionRun)) return fail(); extra.run = raw.run as NoahCollectionRun; }
    if (raw.familyId !== undefined) {
      if (typeof raw.familyId !== 'string' || !FAMILY.test(raw.familyId) || extra.run !== 'phone') return fail();
      extra.familyId = raw.familyId;
    }
    const pin = parseNoahPinForStorage(raw.pin);
    return { id, source, name, summary, author, url, sourceUrl, observedAt, expiresAt, ...(Object.keys(metrics).length ? { metrics } : {}), ...extra, ...(pin ? { pin } : {}) };
  });
  return { schema: 'noah-collection/1', source, collectedAt: at, items };
}

/**
 * 並び（task 121。本人の決め事 2026-11-22「新しく使いやすい物が上」「使った実績・握手で分かる事・話題の度合いの全部で測る」）。ML も乱数も使わない。
 * Noah のピンと同じ Reddit の hot の形: log10(票) + 出た時 / 12.5 時間。票が 10 倍になると、12.5 時間新しいのと同じだけ上がる。
 * 票 = 話題（出所の数を重み付きで足す）＋ 使いやすさ（動かし方・日本語の説明）＋ 出所の重なり（別々の場所で話題）。
 * Noah の中の利用（保存・成果）は、グリッドの並び（lib/noah-pins.ts）が持つ。ここで使うのは、紹介の数だけ。
 */
export const NOAH_COLLECTION_RANK = {
  epochMs: 1_134_028_003_000, perTenfoldMs: 45_000_000, missingAgeMs: 7 * 86_400_000,
  metric: { stars: 1, likes: 1, reposts: 3, points: 1, comments: 0.5, upvotes: 1, downloads: 0.01, pulls: 0.001, uses: 0.1 } as Record<string, number>,
  /** 1 つの数が足せる票の上限（週に何千万回取られる基盤の包みや、何万スターの古い repo が、新しい物をいつまでも押さえないように）。 */
  metricCap: 1000,
  /** Hugging Face のいいねは、GitHub のスターより付きにくいので 5 倍。 */
  huggingfaceLikes: 5,
  run: { phone: 40, space: 15, mac: 5, key: 0 } as Record<NoahCollectionRun, number>,
  japanese: 10, crossSource: 10,
} as const;
export type NoahCollectionRankInput = { sources: Pick<NoahCollectionItem, 'source' | 'metrics' | 'createdAt' | 'observedAt'>[]; run?: NoahCollectionRun; name: string; summary: string };
/** 出た時。出所のうち、いちばん新しい物（古い repo でも、今日の投稿で話題になれば、今日の話）。 */
export function noahCollectionNewsAt(sources: NoahCollectionRankInput['sources']) {
  return Math.max(...sources.map(s => s.createdAt ?? s.observedAt - NOAH_COLLECTION_RANK.missingAgeMs));
}
export function noahCollectionVotes(card: NoahCollectionRankInput) {
  const R = NOAH_COLLECTION_RANK;
  let votes = 0;
  for (const s of card.sources) for (const [metric, count] of Object.entries(s.metrics ?? {})) votes += Math.min(R.metricCap, count * (R.metric[metric] ?? 0) * (s.source === 'huggingface' && metric === 'likes' ? R.huggingfaceLikes : 1));
  votes += card.run ? R.run[card.run] : 0;
  if (/[぀-ヿ]/u.test(`${card.name} ${card.summary}`) && !NOAH_COLLECTION_SOCIAL.some(s => NOAH_COLLECTION_SOCIAL_SUMMARY[s] === card.summary)) votes += R.japanese;
  votes += R.crossSource * (new Set(card.sources.map(s => s.source)).size - 1);
  return votes;
}
export function noahCollectionHot(card: NoahCollectionRankInput) {
  return Math.log10(Math.max(noahCollectionVotes(card), 1)) + (noahCollectionNewsAt(card.sources) - NOAH_COLLECTION_RANK.epochMs) / NOAH_COLLECTION_RANK.perTenfoldMs;
}
const RUN_ORDER: NoahCollectionRun[] = ['phone', 'space', 'mac', 'key'];
export type NoahCollectionCard = NoahCollectionItem & { createdAt: number; hot: number; sources: Pick<NoahCollectionItem, 'source' | 'sourceUrl' | 'author' | 'metrics' | 'observedAt' | 'createdAt'>[] };
/**
 * 同じ配布 URL の紹介を 1 枚にまとめ、並べる。order: hot（新しく使いやすい順・既定）か new（出た時の新しい順）。
 * 1 枚の動かし方は、出所のうち、いちばん使いやすい物（スマホで今すぐ > ブラウザ > Mac > 鍵）。
 */
export function noahCollectionCards(items: NoahCollectionItem[], order: 'hot' | 'new' = 'hot'): NoahCollectionCard[] {
  const grouped = new Map<string, NoahCollectionItem[]>();
  for (const item of items) { const list = grouped.get(item.url) ?? []; list.push(item); grouped.set(item.url, list); }
  const cards = [...grouped.values()].map((list): NoahCollectionCard => {
    // 1 枚の名前・説明は、「Noahが読んだ」（配布元まで読んで日本語で書いた理解）を最初に、次に配布元の説明を持つ出所、投稿（決まった説明文）は最後。
    const order = (source: NoahCollectionSource) => (source === 'noah-read' ? 0 : NOAH_COLLECTION_SOCIAL.includes(source as never) ? 2 : 1);
    const sorted = [...list].sort((a, b) => order(a.source) - order(b.source) || b.observedAt - a.observedAt || a.id.localeCompare(b.id));
    const head = sorted[0];
    const run = RUN_ORDER.find(r => list.some(item => item.run === r));
    const familyId = list.find(item => item.run === 'phone' && item.familyId)?.familyId;
    // 同じ配布先を複数の出所が紹介していても、検査済みの図解が 1 件あれば統合後のカードへ残す。
    const pin = sorted.find(item => item.pin)?.pin;
    const sources = sorted.map(({ source, sourceUrl, author, metrics, observedAt, createdAt }) => ({ source, sourceUrl, author, metrics, observedAt, ...(createdAt ? { createdAt } : {}) }));
    const rank = { sources, run, name: head.name, summary: head.summary };
    const { run: _headRun, familyId: _headFamily, ...rest } = head;
    return { ...rest, ...(run ? { run } : {}), ...(run === 'phone' && familyId ? { familyId } : {}), ...(pin ? { pin } : {}), sources, createdAt: noahCollectionNewsAt(sources), hot: noahCollectionHot(rank) };
  });
  return cards.sort((a, b) => (order === 'new' ? b.createdAt - a.createdAt : b.hot - a.hot) || a.id.localeCompare(b.id));
}

export async function collectionSignature(key: string, timestamp: string, body: string, path: string = NOAH_COLLECTION_PATH) {
  const imported = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await sha256Hex(body);
  const signature = await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(`${timestamp}\nPOST\n${path}\n${hash}`));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function verifyCollectionSignature(key: string | undefined, timestamp: string | null, signature: string | null, body: string, now: number, path: string = NOAH_COLLECTION_PATH) {
  if (!key || key.length < 32 || !timestamp || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 120_000 || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = await collectionSignature(key, timestamp, body, path);
  let diff = 0; for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
