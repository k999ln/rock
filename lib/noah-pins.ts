/**
 * Noah のピンタレスト風の一覧（task 115。2026-11-22 の本人の決定）: 並べる Agent の分野と色、カードの高さ、数えた実績の点、並べ方。
 *
 * 通信も保存もしない関数だけ（保存は lib/noah-boards-store.ts、入口は lib/noah-pins-api.ts）。
 * 並びに、学習したモデルを使わない。乱数も使わない。使うのは、数えた事実（保存した人・頼んで成果が返った人・「表示しない」にした人の数）と、決まった式だけ。
 * 借りた考え（どれも、学習の部分は借りない）:
 * - X の For You（github.com/xai-org/x-algorithm、Apache-2.0）の作りの形: 候補の出所 → 外す規則 → 重み付きの和 → 同じ作者が続くと下げる → 新しい物を少し試す。
 *   X は重みを「学習したモデルが予測した確率」に掛けるが、Noah は数えた人数に掛ける（予測はしない）。
 * - Reddit の hot（reddit の公開コード r2/lib/db/_sorts.pyx）: sign × log10(max(|票|, 1)) + (時刻 − 1134028003) / 45000。12.5 時間ごとに、票が 10 倍の物と並ぶ。
 * - Pinterest の Pixie（arXiv:1711.07601）: ピン ↔ ボードの 2 部グラフを歩いて、よく行き着くピンを薦める。複数の起点から届いた物を強くする (Σ√回数)²。
 *   乱数で歩く代わりに、1 往復（Agent → ボード → Agent）で行き着く見込みを、決まった値で数える。
 * 仕様: docs/noah/spec-115-pin-grid.md。
 */

// ---------------------------------------------------------------------------
// 分野（カードの色と、続けて同じ分野を並べない決まりに使う）。決まった語の一致だけで決める（学習しない）。
// ---------------------------------------------------------------------------

/** 分野。上から順に見て、最初に語が当たった物。どれにも当たらなければ other。足す時は、ここへ 1 行足す。 */
export const NOAH_PIN_TOPICS = [
  { id: 'money', label: 'お金・税', words: ['税', '会計', '経理', '仕訳', '請求', 'インボイス', '給与', '年金', 'invoice', 'tax', 'accounting', 'payroll', 'finance', 'stock', 'crypto', 'bank', 'price', 'pricing', 'budget', 'payment'] },
  { id: 'dev', label: '開発', words: ['github', 'git ', 'code', 'coding', 'developer', 'api', 'sdk', 'deploy', 'database', 'sql', 'kubernetes', 'docker', 'devops', 'debug', 'npm', 'python', 'typescript', 'manpage', 'cli', 'log'] },
  { id: 'research', label: '調べもの', words: ['search', 'research', 'web', 'news', 'paper', 'arxiv', 'scholar', 'wiki', 'law', 'legal', '法令', '調べ', '検索', 'statistics', 'patent', 'docs', 'documentation'] },
  { id: 'work', label: '仕事', words: ['job', 'jobs', 'hiring', 'recruit', '求人', 'crm', 'sales', 'marketing', 'seo', 'email', 'calendar', 'meeting', 'project', 'task', 'invoice', 'contract', 'ad copy', '広告', 'business', 'company'] },
  { id: 'learn', label: '学び', words: ['learn', 'lesson', 'course', 'quiz', 'study', 'school', 'teacher', 'student', 'tutor', 'dictionary', 'vocabulary', 'pronounce', 'language', 'math', '英語', '中国語', '学習', '勉強'] },
  { id: 'life', label: '暮らし', words: ['travel', 'hotel', 'weather', 'recipe', 'food', 'restaurant', 'map', 'transit', 'train', 'locker', 'toilet', 'shopping', 'home', 'family', 'childcare', '保育', '紅葉', '旅', '料理', 'event'] },
  { id: 'data', label: 'データ', words: ['data', 'dataset', 'csv', 'analytics', 'chart', 'metrics', 'sensor', 'iot', 'blockchain', 'onchain', 'geo', 'census', 'open data', 'registry', 'catalog'] },
  { id: 'media', label: '画像・動画・音', words: ['image', 'photo', 'video', 'audio', 'music', 'design', 'figma', 'color', 'font', 'icon', 'youtube', 'podcast', 'art', '画像', '動画', '音楽'] },
  { id: 'words', label: '言葉・文章', words: ['text', 'writing', 'translate', 'translation', 'summar', 'markdown', 'pdf', 'document', 'prompt', 'grammar', 'copy', '文章', '翻訳', '要約'] },
] as const;
export type NoahPinTopic = (typeof NOAH_PIN_TOPICS)[number]['id'] | 'other';
export const NOAH_PIN_TOPIC_LABELS: Record<NoahPinTopic, string> = { ...Object.fromEntries(NOAH_PIN_TOPICS.map((topic) => [topic.id, topic.label])), other: 'いろいろ' } as Record<NoahPinTopic, string>;

/** 名前と説明から分野を決める。英字は小文字にしてから、語が含まれるかだけを見る。 */
export function noahPinTopic(name: string, summary: string): NoahPinTopic {
  const text = ` ${name} ${summary} `.toLowerCase();
  for (const topic of NOAH_PIN_TOPICS) if (topic.words.some((word) => text.includes(word))) return topic.id;
  return 'other';
}

/** 文字の並びから、決まった 32 bit の数（FNV-1a）。カードの高さと、色の濃さを決めるだけに使う（並びには使わない）。 */
export function noahPinHash(value: string): number {
  let hash = 0x811c9dc5;
  for (const char of value) { hash ^= char.codePointAt(0) ?? 0; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash >>> 0;
}
/** カードの絵の面の高さ（3 段）。同じ Agent はいつも同じ高さ（並べ直しても、カードの形が変わらない）。 */
export const noahPinShape = (id: string): 0 | 1 | 2 => (noahPinHash(id) % 3) as 0 | 1 | 2;
/** 絵の面に大きく出す文字（名前の頭の 1〜2 文字。英字は大文字）。 */
export function noahPinInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return '?';
  const first = Array.from(words[0]);
  if (/^\p{Script=Latin}/u.test(first[0] ?? '')) return (words.length > 1 ? first[0] + Array.from(words[1])[0] : first.slice(0, 2).join('')).toUpperCase();
  return first[0];
}

// ---------------------------------------------------------------------------
// 数えた実績の点（Reddit の hot）
// ---------------------------------------------------------------------------

export const NOAH_PIN_RANK = {
  /** 票の重み。保存した人 1、頼んで成果が返った人 2、「表示しない」にした人 −5（X と同じく、嫌がられた事を強く引く）。 */
  saveWeight: 1, succeededWeight: 2, hideWeight: 5,
  /** Reddit の hot の時間の幅（秒）と、起点（2005-12-08）。 */
  hotSeconds: 45_000, hotEpoch: 1_134_028_003,
  /** 5 枚に 1 枚は、まだ実績の無い新しい物を試しに出す（X の新しい投稿のお試し・棚の 5 枚に 1 枚と同じ考え）。 */
  trialEvery: 5,
  /** 同じ提供者が、近くに続いてよい数（直近 lookback 枚の中で）。X の同じ作者が続くと下げる決まりの代わり。 */
  sameProviderWithin: 6, sameProviderMax: 1,
  /** 同じ分野が続いてよい枚数。 */
  sameTopicRun: 2,
  /** 「これも使われています」に使う最小の人数（docs/noah-detailed-design.md 18 章の「見せる最小の人数」と同じ）。 */
  minPeople: 5,
  /** 本人の保存の重みの半減期（日）。新しい保存ほど、おすすめに強く効く（Pixie の起点の重み）。 */
  halfLifeDays: 7,
  /** 1 頁の枚数・本人のおすすめの起点の数・「これも使われています」の枚数。 */
  pageSize: 30, personalQueries: 20, related: 12,
};

/** 票: 保存した人 + 2 × 成果が返った人 − 5 × 表示しない人。どれも人数（同じ人の 2 回目は数えない）。 */
export function noahPinVotes(stats: { savers: number; succeeded: number; hides: number }): number {
  return stats.savers * NOAH_PIN_RANK.saveWeight + stats.succeeded * NOAH_PIN_RANK.succeededWeight - stats.hides * NOAH_PIN_RANK.hideWeight;
}
/** Reddit の hot と同じ式。anchorAt は、その Agent が一覧に載った時刻（ミリ秒）。小数 7 桁で丸める。 */
export function noahPinHot(votes: number, anchorAt: number): number {
  const order = Math.log10(Math.max(Math.abs(votes), 1)), sign = votes > 0 ? 1 : votes < 0 ? -1 : 0;
  const seconds = anchorAt / 1000 - NOAH_PIN_RANK.hotEpoch;
  return Math.round((sign * order + seconds / NOAH_PIN_RANK.hotSeconds) * 1e7) / 1e7;
}

// ---------------------------------------------------------------------------
// 本人へのおすすめ（Pixie を、決まった値で）
// ---------------------------------------------------------------------------

/** 本人の保存（起点）。新しいほど重い（半減期 halfLifeDays）。 */
export type NoahPixieQuery = { familyId: string; savedAt: number };
/** 起点の Agent から、ボードを 1 つ経て行き着く Agent。boardSize は、そのボードの Agent の数。owner は、そのボードの持ち主（人数を数えるため）。 */
export type NoahPixieEdge = { from: string; to: string; boardId: string; boardSize: number; owner: string };

/**
 * 起点ごとに、1 往復（Agent → そのAgent を含むボード → そのボードの Agent）で行き着く見込みを数え、Pixie の (Σ√(重み × 見込み))² で合わせる。
 * 見込み = Σ_{起点と行き先を両方含むボード} 1 / (起点を含むボードの数 × ボードの Agent の数)（乱数で歩いた時の、1 歩目の行き着く割合と同じ）。
 * 行き先へ届いた人（ボードの持ち主）が minPeople 人より少ない物は使わない（少ない人の保存から、誰のボードか分からないように）。起点そのもの・exclude の物は出さない。
 */
export function noahPixieScores(queries: readonly NoahPixieQuery[], edges: readonly NoahPixieEdge[], now: number, exclude: ReadonlySet<string> = new Set()): { familyId: string; score: number; people: number }[] {
  const weight = new Map<string, number>();
  for (const query of queries) {
    const age = Math.max(0, now - query.savedAt) / 86_400_000;
    weight.set(query.familyId, Math.max(weight.get(query.familyId) ?? 0, 2 ** (-age / NOAH_PIN_RANK.halfLifeDays)));
  }
  const boardsOf = new Map<string, Set<string>>();
  for (const edge of edges) { const set = boardsOf.get(edge.from) ?? new Set<string>(); set.add(edge.boardId); boardsOf.set(edge.from, set); }
  const visits = new Map<string, Map<string, number>>(), people = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.from === edge.to || !weight.has(edge.from) || weight.has(edge.to) || exclude.has(edge.to) || edge.boardSize < 1) continue;
    const share = 1 / ((boardsOf.get(edge.from)?.size ?? 1) * edge.boardSize);
    const byQuery = visits.get(edge.to) ?? new Map<string, number>();
    byQuery.set(edge.from, (byQuery.get(edge.from) ?? 0) + share);
    visits.set(edge.to, byQuery);
    const owners = people.get(edge.to) ?? new Set<string>(); owners.add(edge.owner); people.set(edge.to, owners);
  }
  const out: { familyId: string; score: number; people: number }[] = [];
  for (const [familyId, byQuery] of visits) {
    const count = people.get(familyId)?.size ?? 0;
    if (count < NOAH_PIN_RANK.minPeople) continue;
    let root = 0;
    for (const [from, value] of byQuery) root += Math.sqrt((weight.get(from) ?? 0) * value);
    out.push({ familyId, score: root * root, people: count });
  }
  return out.sort((a, b) => b.score - a.score || (a.familyId < b.familyId ? -1 : 1));
}

// ---------------------------------------------------------------------------
// 並べ方（候補の出所を混ぜる・新しい物を試す・続けない）
// ---------------------------------------------------------------------------

/** 1 枚分の、並べ方に要る事実。provider は台帳の名前の「/」の前（同じ提供者の物）。 */
export type NoahPinCandidate = { id: string; provider: string; topic: NoahPinTopic };
/**
 * 候補の出所。personal: フォローしたボードに新しく入った物と、本人へのおすすめ（最初の頁だけ）。popular: 票のある物の hot の順。
 * ran: 人が動かして成果が返った物（新しい順）。fresh: まだ実績の無い物（その日の並び）。
 */
export type NoahPinSources = { personal: NoahPinCandidate[]; popular: NoahPinCandidate[]; ran: NoahPinCandidate[]; fresh: NoahPinCandidate[] };
/** 席の順。5 枚目ごとに fresh（お試し）。本人へのおすすめがあれば、3 枚目ごとに混ぜる。 */
const PATTERN: (keyof NoahPinSources)[] = ['personal', 'popular', 'ran', 'popular', 'fresh'];

/**
 * 出所を決まった順に混ぜ、同じ Agent を 2 回出さず、同じ提供者が近くに続かないように、同じ分野が sameTopicRun 枚より続かないように並べる。
 * 決まりを守れる候補が無い時は、決まりを緩めて、出所の順に出す（空きを作らない）。size 枚まで。exclude（前の頁で出した物）は出さない。
 */
export function noahComposePins(sources: NoahPinSources, size: number, exclude: ReadonlySet<string> = new Set()): NoahPinCandidate[] {
  const queues = Object.fromEntries((Object.keys(sources) as (keyof NoahPinSources)[]).map((key) => [key, sources[key].filter((item) => !exclude.has(item.id))])) as NoahPinSources;
  const used = new Set<string>(), out: NoahPinCandidate[] = [];
  const fits = (item: NoahPinCandidate) => {
    if (used.has(item.id)) return false;
    const recent = out.slice(-NOAH_PIN_RANK.sameProviderWithin);
    if (recent.filter((other) => other.provider === item.provider).length >= NOAH_PIN_RANK.sameProviderMax) return false;
    const tail = out.slice(-NOAH_PIN_RANK.sameTopicRun);
    return !(tail.length === NOAH_PIN_RANK.sameTopicRun && tail.every((other) => other.topic === item.topic));
  };
  const take = (key: keyof NoahPinSources, strict: boolean) => {
    const queue = queues[key];
    const index = queue.findIndex((item) => !used.has(item.id) && (!strict || fits(item)));
    if (index < 0) return null;
    const [item] = queue.splice(index, 1);
    return item;
  };
  for (let slot = 0; out.length < size; slot++) {
    const want = PATTERN[slot % PATTERN.length];
    const order: (keyof NoahPinSources)[] = [want, ...PATTERN.filter((key) => key !== want)];
    let item: NoahPinCandidate | null = null;
    for (const strict of [true, false]) {
      for (const key of order) { item = take(key, strict); if (item) break; }
      if (item) break;
    }
    if (!item) break;
    used.add(item.id); out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 頁の印（続きを読む時に、出所ごとの位置を持つ）
// ---------------------------------------------------------------------------

export type NoahPinCursor = {
  /** popular: 最後に出した物の [hot, id]。ran: [l2_at, id]。fresh: [shuffle, id]。null はその出所を最初から（または読み切った）。 */
  popular: [number, string] | null; ran: [number, string] | null; fresh: [number, string] | null;
  /** 読み切った出所。 */
  done: ('popular' | 'ran' | 'fresh')[];
  /** 最初の頁で、本人へのおすすめから出した物（後の頁で重ねて出さない）。30 件まで。 */
  shown: string[];
};
const ID = /^[\x21-\x7e]{3,400}$/u;
/** base64url（Workers と Node の両方で動くよう、Buffer を使わない）。 */
function base64url(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}
function unbase64url(value: string): string {
  const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - (value.length % 4)) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}
export function noahPinCursorEncode(cursor: NoahPinCursor): string {
  return base64url(JSON.stringify(cursor));
}
/** 壊れた印・形の違う印は null（呼ぶ側が 400 にする）。 */
export function noahPinCursorDecode(value: string): NoahPinCursor | null {
  if (!value || value.length > 8_000 || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(unbase64url(value)); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (Object.keys(o).some((key) => !['popular', 'ran', 'fresh', 'done', 'shown'].includes(key))) return null;
  const pair = (v: unknown): [number, string] | null | undefined => {
    if (v === null) return null;
    if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || !Number.isFinite(v[0]) || typeof v[1] !== 'string' || !ID.test(v[1])) return undefined;
    return [v[0], v[1]];
  };
  const popular = pair(o.popular), ran = pair(o.ran), fresh = pair(o.fresh);
  if (popular === undefined || ran === undefined || fresh === undefined) return null;
  const done = o.done, shown = o.shown;
  if (!Array.isArray(done) || done.length > 3 || !done.every((key) => key === 'popular' || key === 'ran' || key === 'fresh')) return null;
  if (!Array.isArray(shown) || shown.length > 30 || !shown.every((id) => typeof id === 'string' && ID.test(id))) return null;
  return { popular, ran, fresh, done: [...new Set(done)] as NoahPinCursor['done'], shown: [...shown] as string[] };
}

// ---------------------------------------------------------------------------
// ボード
// ---------------------------------------------------------------------------

export const NOAH_BOARD_LIMITS = { boardsPerOwner: 100, pinsPerBoard: 500, followsPerOwner: 500, nameChars: 40 };
/** ボードの名前: 前後の空白を除いて 1〜40 文字。改行・制御文字を入れない。 */
export function noahBoardName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/gu, ' ');
  const chars = Array.from(name);
  if (chars.length < 1 || chars.length > NOAH_BOARD_LIMITS.nameChars || chars.some((ch) => (ch.codePointAt(0) ?? 0) < 0x20 || ch === '\u007f')) return null;
  return name;
}
export const noahBoardVisibility = (value: unknown): 'private' | 'public' | null => (value === 'private' || value === 'public' ? value : null);

/** 画面の文（決まった文）。 */
export const NOAH_PIN_TEXT = {
  save: '保存', saved: '保存済み', saveTo: '保存先', newBoard: '新しいボード', boardName: 'ボードの名前', public: '公開する（他の人も見られる・フォローできる）',
  create: '作って保存', hide: '表示しない', related: 'これも使われています', boards: 'ボード', myBoards: 'あなたのボード', following: 'フォロー中のボード',
  follow: 'フォロー', unfollow: 'フォロー中', empty: 'まだ並べられる Agent がありません。少し後で開いてください。', signIn: '保存するには、サインインしてください。',
  closed: 'この一覧は、準備中です。', boardEmpty: 'このボードには、まだ Agent がありません。', more: '読み込んでいます…',
};
