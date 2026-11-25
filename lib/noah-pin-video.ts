/**
 * Noah のピンの動画（spec-115 の 10 章）。本人の指示（2026-11-25）「文章いらない、題名だけ、ピン画像のgifにしてイメージを説明する動画みたいな感じ、
 * ディティールは説明動画５〜8秒とか」「こういう動画をgifにしてピン画像にする」「作らない、かっこいい動画収集してそれをgifに変換する」。
 * 本人の決定（2026-11-25）: 見えている間は繰り返す・AI 中心で足りない所は実写・Agent ごとに中身で探す・出どころは今は書かない。
 * Higgsfield の動画は「すでに許可とってるから大丈夫だよ」（本人）。
 *
 * 動画は、集めた動画を scripts/noah-pin-video.mjs で 5〜8 秒・縦 3:4・音なし・つなぎ目の無いループの mp4 にした物（GIF と同じ見た目で、ずっと軽い）。
 * ここは、外から来た 1 本の記録を確かめる関数と、Agent ごとに動画を選ぶ式だけ（通信も保存もしない）。
 */

/** 動画の出どころ。higgsfield は本人が許可を取ってある物。coverr・pexels は商用で使えて作り変えてよい素材のサイト。 */
export const NOAH_PIN_VIDEO_SOURCES = ['higgsfield', 'coverr', 'pexels', 'other'] as const;
export type NoahPinVideoSource = typeof NOAH_PIN_VIDEO_SOURCES[number];

/** 1 本のピンの動画。url は mp4（音なし）、poster は最初の絵。width:height は 3:4。seconds は 5〜8。sourceId と sourceUrl は、元をたどるための記録（画面には出さない）。 */
export type NoahPinVideo = {
  url: string; poster: string; width: number; height: number; seconds: number;
  source: NoahPinVideoSource; sourceId: string; sourceUrl: string; ai: boolean;
};

/** 長さの範囲（秒）。本人の指示「説明動画５〜8秒とか」。 */
export const NOAH_PIN_VIDEO_SECONDS = { min: 5, max: 8 } as const;
/** 縦と横の比（横 3・縦 4）。 */
export const NOAH_PIN_VIDEO_RATIO = { width: 3, height: 4 } as const;

const KEYS = ['url', 'poster', 'width', 'height', 'seconds', 'source', 'sourceId', 'sourceUrl', 'ai'];
const CONTROL = (text: string) => Array.from(text).some((char) => { const code = char.codePointAt(0) ?? 0; return code < 32 || code === 127; });

/** 同じサイトの「/」で始まる道か、https の URL。ファイルの種類は、道の最後の拡張子で見る（? や # は付けない）。 */
function mediaUrl(value: unknown, kinds: readonly string[]): boolean {
  if (typeof value !== 'string' || !value || value.length > 500 || CONTROL(value) || /[\s?#\\]/.test(value)) return false;
  let path: string;
  if (value.startsWith('/')) {
    if (value.startsWith('//')) return false;
    path = value;
  } else {
    let url: URL;
    try { url = new URL(value); } catch { return false; }
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    path = url.pathname;
  }
  if (path.split('/').some((part) => part === '..' || part === '.')) return false;
  const dot = path.lastIndexOf('.');
  return dot > path.lastIndexOf('/') && kinds.includes(path.slice(dot + 1).toLowerCase());
}

/** 外から来た 1 本の記録を確かめる。形が違えば null と理由（項目の名前つき）。 */
export function parseNoahPinVideo(value: unknown): { video: NoahPinVideo; error: null } | { video: null; error: string } {
  const fail = (error: string) => ({ video: null, error });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('not_object');
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!KEYS.includes(key)) return fail(`unknown_key:${key}`);
  if (!mediaUrl(input.url, ['mp4', 'webm'])) return fail('url');
  if (!mediaUrl(input.poster, ['jpg', 'jpeg', 'webp', 'png'])) return fail('poster');
  const { width, height, seconds } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) < 120 || (height as number) > 2160) return fail('size');
  if ((width as number) * NOAH_PIN_VIDEO_RATIO.height !== (height as number) * NOAH_PIN_VIDEO_RATIO.width) return fail('ratio');
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < NOAH_PIN_VIDEO_SECONDS.min || seconds > NOAH_PIN_VIDEO_SECONDS.max) return fail('seconds');
  if (typeof input.source !== 'string' || !(NOAH_PIN_VIDEO_SOURCES as readonly string[]).includes(input.source)) return fail('source');
  const sourceId = input.sourceId;
  if (typeof sourceId !== 'string' || !sourceId.trim() || sourceId !== sourceId.trim() || sourceId.length > 200 || CONTROL(sourceId)) return fail('sourceId');
  if (!mediaUrlOrPage(input.sourceUrl)) return fail('sourceUrl');
  if (typeof input.ai !== 'boolean') return fail('ai');
  return { video: {
    url: input.url as string, poster: input.poster as string, width: width as number, height: height as number, seconds,
    source: input.source as NoahPinVideoSource, sourceId, sourceUrl: input.sourceUrl as string, ai: input.ai,
  }, error: null };
}

/** 元の頁は https の URL なら何でもよい（拡張子は問わない）。 */
function mediaUrlOrPage(value: unknown): boolean {
  if (typeof value !== 'string' || !value || value.length > 500 || CONTROL(value) || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

/** 集めた動画 1 本の、選ぶための記録。tags は、動画に映っている物の言葉（英語の小文字。AI が絵を見て書く）。 */
export type NoahPinVideoEntry = { id: string; tags: string[]; ai: boolean };

/** 言葉をそろえる（全角を半角に、大文字を小文字に、前後と中の空白を 1 つに）。空になった物と重なりは落とす。 */
export function noahPinVideoTags(words: readonly string[]): string[] {
  const out: string[] = [];
  for (const word of words) {
    const tag = word.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/** 合うと見なす、言葉の重なりの最低の割合（Agent の言葉の 3 つに 1 つ）。 */
export const NOAH_PIN_VIDEO_MIN_MATCH = 1 / 3;
/** 1 回使われるごとに引く点（同じ動画を、なるべく使い回さない。本人の決定「Agent ごとに中身で探す」）。 */
export const NOAH_PIN_VIDEO_REUSE_COST = 0.2;

/**
 * 1 つの Agent に、集めた動画から 1 本を選ぶ。want は、その Agent の中身の言葉（英語。題・入れる物・返る物から AI が書く）。
 * 合う割合 = want のうち、動画の tags にもある言葉の割合。それが NOAH_PIN_VIDEO_MIN_MATCH 以上の物だけを候補にする。
 * AI で作った動画の候補が 1 本でもあれば、その中から選ぶ。無ければ実写から選ぶ（本人の決定「AI 中心、足りない所は実写」）。
 * 点 = 合う割合 − 使った回数 × NOAH_PIN_VIDEO_REUSE_COST。同じ点なら、使った回数が少ない物、次に id の順。合う物が無ければ null（図解のまま）。
 */
export function pickNoahPinVideo(want: readonly string[], library: readonly NoahPinVideoEntry[], used: ReadonlyMap<string, number> = new Map()): { id: string; match: number } | null {
  const words = noahPinVideoTags(want);
  if (!words.length) return null;
  type Row = { id: string; ai: boolean; match: number; uses: number; score: number };
  const rows: Row[] = [];
  for (const entry of library) {
    const tags = new Set(noahPinVideoTags(entry.tags));
    const match = words.filter((word) => tags.has(word)).length / words.length;
    if (match < NOAH_PIN_VIDEO_MIN_MATCH) continue;
    const uses = used.get(entry.id) ?? 0;
    rows.push({ id: entry.id, ai: entry.ai, match, uses, score: match - uses * NOAH_PIN_VIDEO_REUSE_COST });
  }
  const pool = rows.some((row) => row.ai) ? rows.filter((row) => row.ai) : rows;
  pool.sort((a, b) => b.score - a.score || a.uses - b.uses || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const best = pool[0];
  return best ? { id: best.id, match: best.match } : null;
}
