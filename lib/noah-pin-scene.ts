/**
 * Noah のピンの絵（場面の絵。2026-11-22 の本人の決定）。構図100選のような、平らな形の場面の絵で、何をする Agent かを見せる。
 *
 * 絵は「型（template）」と、型ごとの決まった数の「札の言葉（labels）」「部品（parts）」「種類（variant）」だけで書く（座標は書かない）。
 * 決まった形の JSON なので、人が書いても、AI（Codex の Luna Max。codex/tasks/130）が説明を読んで書いても、同じ物差しで確かめられる。
 * 描くのは components/noah-pin-scene.tsx。ここは、確かめる関数と表だけ（通信も保存もしない）。
 * 仕様: docs/noah/spec-115-pin-grid.md の 9 章。
 */

/** 入れる → 返る、の型で使える部品。 */
export const NOAH_PIN_PARTS = [
  'receipt', 'ledger', 'document', 'chart', 'mail', 'calendar', 'photo', 'code', 'database', 'chat', 'phone', 'map', 'cup', 'book', 'music', 'video',
  'gift', 'coin', 'list', 'idea',
] as const;
export type NoahPinPart = (typeof NOAH_PIN_PARTS)[number];

type Spec = { labels: number; parts?: readonly (readonly string[])[]; variants?: readonly string[]; height: number; summary: string };

/**
 * 型の表。labels は札の言葉の数（並びの意味は summary の通り）。parts は部品の数と、それぞれ選べる物。variants は種類。height は絵の高さ（幅は 300）。
 * 足す時は、ここと components/noah-pin-scene.tsx の両方に足す（試験が、全部の型を描けるかを確かめる）。
 */
export const NOAH_PIN_TEMPLATES = {
  transform: { labels: 2, parts: [NOAH_PIN_PARTS, NOAH_PIN_PARTS], height: 220, summary: '入れる物 → 返る物。labels = [入れる物の札, 返る物の札]。parts = [入れる物, 返る物]' },
  inspect: { labels: 3, parts: [['document', 'flyer']], variants: ['ok', 'warn'], height: 240, summary: '書類を確かめる。labels = [書類の題, 確かめる所の文, 結果の札]。variant = ok（問題なし）か warn（気になる所あり）' },
  steps: { labels: 1, height: 260, summary: '手順を並べて書類にまとめる。labels = [流れの中の判断の札（例: 承認）]' },
  browse: { labels: 1, height: 220, summary: 'ウェブで調べて、出典つきの一覧を返す。labels = [一覧の各行に付く札（例: 日付）]' },
  board: { labels: 1, variants: ['building', 'house', 'paper'], height: 250, summary: '掲示板の中から 1 つを選ぶ。labels = [選んだ物の札]。variant = 掲示の紙の絵' },
  shelf: { labels: 1, variants: ['law', 'book'], height: 230, summary: '本棚から 1 冊を探す。labels = [見つけた物の札]。variant = 本の表紙の印' },
  speak: { labels: 2, height: 230, summary: '話して確かめる。labels = [吹き出しの言葉, 下の札]' },
  word: { labels: 3, height: 210, summary: '単語を引く。labels = [単語, 読み, 小さい札]' },
  play: { labels: 1, height: 250, summary: 'みんなで遊ぶ問題。labels = [問題の札（例: Q1）]' },
  print: { labels: 1, variants: ['math', 'letters'], height: 240, summary: '印刷して使う紙と道具。labels = [紙の中の言葉]' },
  gauge: { labels: 2, parts: [['gift', 'coin', 'cup']], height: 220, summary: '目安・上限を出す。labels = [物の札, 目盛りの札]' },
  return: { labels: 2, height: 230, summary: 'お金が戻る。labels = [出した所の札, 戻る物の札]' },
  split: { labels: 3, height: 210, summary: '内訳に分ける。labels = [全体の札, いちばん大きい部分の札, 残りの札]' },
  place: { labels: 1, parts: [['station', 'temple', 'none']], variants: ['autumn', 'spring', 'green'], height: 270, summary: '景色の中の場所を探す。labels = [上の札]。variant = 木の季節' },
  nearby: { labels: 1, parts: [['restroom', 'none']], variants: ['lockers', 'shop'], height: 240, summary: '近くの物を探す。labels = [距離などの札]。variant = 左の物' },
  building: { labels: 1, variants: ['nursery', 'hospital', 'office'], height: 230, summary: '施設を調べる。labels = [札（例: 住所・電話）]' },
} as const satisfies Record<string, Spec>;
export type NoahPinTemplate = keyof typeof NOAH_PIN_TEMPLATES;

/** 1 枚の絵。 */
export type NoahPinScene = { template: NoahPinTemplate; labels: string[]; parts: string[]; variant: string | null };

/** 札の言葉の長さの上限（字の数。英字・数字・記号は 0.6 字で数える）。スマホの 2 列で、札が絵からはみ出さない長さ。 */
export const NOAH_PIN_LABEL_MAX = 8;
/** 吹き出し・単語の言葉は、少し長くてよい（字の数。数え方は同じ）。 */
export const NOAH_PIN_WORD_MAX = 10;

export function noahPinLabelWidth(text: string): number {
  return Array.from(text).reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) < 128 ? 0.6 : 1), 0);
}

/** 言葉に使えない物: 改行・制御文字・山かっこ（絵の中で字として出すだけなので、HTML としては扱わないが、念のため受け付けない）。 */
const BAD = { test: (text: string) => Array.from(text).some((char) => { const code = char.codePointAt(0) ?? 0; return code < 32 || code === 127 || char === '<' || char === '>'; }) };

/**
 * 外から来た JSON（人が書いた物・AI が書いた物）を確かめて、1 枚の絵にする。形が違えば null と理由。
 * 確かめる事: 型が表にある・札の数がちょうど・札が空でなく長すぎない・部品と種類が表にある・余計な項目が無い。
 */
export function parseNoahPinScene(value: unknown): { scene: NoahPinScene; error: null } | { scene: null; error: string } {
  const fail = (error: string) => ({ scene: null, error });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('not_object');
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!['template', 'labels', 'parts', 'variant'].includes(key)) return fail(`unknown_key:${key}`);
  if (typeof input.template !== 'string' || !Object.hasOwn(NOAH_PIN_TEMPLATES, input.template)) return fail('template');
  const template = input.template as NoahPinTemplate, spec: Spec = NOAH_PIN_TEMPLATES[template];
  const labels = input.labels, parts = input.parts ?? [], variant = input.variant ?? null;
  if (!Array.isArray(labels) || labels.length !== spec.labels) return fail('labels_count');
  const wide = template === 'speak' || template === 'word';
  for (const [index, label] of labels.entries()) {
    if (typeof label !== 'string' || !label.trim() || label !== label.trim() || BAD.test(label)) return fail(`label:${index}`);
    if (noahPinLabelWidth(label) > (wide && index === 0 ? NOAH_PIN_WORD_MAX : NOAH_PIN_LABEL_MAX)) return fail(`label_long:${index}`);
  }
  const allowed = spec.parts ?? [];
  if (!Array.isArray(parts) || parts.length !== allowed.length) return fail('parts_count');
  for (const [index, part] of parts.entries()) if (typeof part !== 'string' || !allowed[index].includes(part)) return fail(`part:${index}`);
  if (spec.variants ? typeof variant !== 'string' || !spec.variants.includes(variant) : variant !== null) return fail('variant');
  return { scene: { template, labels: [...labels] as string[], parts: [...parts] as string[], variant: variant as string | null }, error: null };
}

/** AI への説明（codex/tasks/130 の指示書が、そのまま使う表）。型ごとに 1 行。 */
export function noahPinTemplateGuide(): string {
  return (Object.entries(NOAH_PIN_TEMPLATES) as [NoahPinTemplate, Spec][]).map(([name, spec]) => {
    const parts = spec.parts?.map((choices, index) => `parts[${index}] ∈ {${choices.join(', ')}}`).join('; ');
    const variants = spec.variants ? `variant ∈ {${spec.variants.join(', ')}}` : 'variant = null';
    return `- ${name}: ${spec.summary}。${[parts, variants].filter(Boolean).join('; ')}`;
  }).join('\n');
}

/** 1 枚のピンの字と絵（題・入れる物・返る物・場面の絵）。Luna Max が 1.7 万件ぶん書く物の形（codex/tasks/130）。 */
export type NoahPin = { title: string; give: string; get: string; scene: NoahPinScene };
/** 題・入れる物・返る物の長さの上限（字の数。数え方は noahPinLabelWidth と同じ）。 */
export const NOAH_PIN_TEXT_MAX = { title: 20, give: 30, get: 30 } as const;

/** 外から来た 1 枚（AI が書いた物）を確かめる。形が違えば null と理由（項目の名前つき）。 */
export function parseNoahPin(value: unknown): { pin: NoahPin; error: null } | { pin: null; error: string } {
  const fail = (error: string) => ({ pin: null, error });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('not_object');
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!['title', 'give', 'get', 'scene'].includes(key)) return fail(`unknown_key:${key}`);
  for (const key of ['title', 'give', 'get'] as const) {
    const text = input[key];
    if (typeof text !== 'string' || !text.trim() || text !== text.trim() || BAD.test(text)) return fail(key);
    if (noahPinLabelWidth(text) > NOAH_PIN_TEXT_MAX[key]) return fail(`${key}_long`);
  }
  const scene = parseNoahPinScene(input.scene);
  if (!scene.scene) return fail(`scene:${scene.error}`);
  return { pin: { title: input.title as string, give: input.give as string, get: input.get as string, scene: scene.scene }, error: null };
}
