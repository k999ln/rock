/**
 * Noah のピンの絵（バージョン TAKE）。本人の指示（2026-11-24）「こういうの思い描いてたんだけど。今のをバージョン1って名前で保存して、次のやつはバージョンTAKEで保存して全部作り直して」
 * 「この人のレポジトリかなんか公開してるんじゃないの真似して欲しいんだけど」。
 * 絵は、しょうへい（大滝昇平 / Shohei Ohtaki, @showheyohtaki）さんの Motion Prompt の「資料で使う図解・グラフの名前」24 種類（MIT License）を
 * 書き写した図（lib/noah-pin-diagram.ts）。その Agent の仕事がいちばん伝わる図を 1 つ選び、図の中の札に、その Agent の言葉を入れる。
 * （バージョン 1 は、人と景色の「場面の絵」だった。ブランチ claude/noah-pins-version-1 に残してある。）
 *
 * 絵は「型（template。図の名前）」と、型ごとの決まった数の「札の言葉（labels）」だけで書く（座標は書かない）。札ごとに、図に収まる字の上限がある。
 * 決まった形の JSON なので、人が書いても、AI（Codex の Luna Max。codex/tasks/130）が説明を読んで書いても、同じ物差しで確かめられる。
 * 描くのは lib/noah-pin-diagram.ts（Canvas）と components/noah-pin-scene.tsx。ここは、確かめる関数と表だけ（通信も保存もしない）。
 * 仕様: docs/noah/spec-115-pin-grid.md の 9 章。
 */

type Spec = { no: number; name: string; en: string; slots: readonly number[]; summary: string };

/**
 * 図の表（元のパックの番号 01〜24 の順。#217〜240。名前は元の meta.json の名前）。slots は札ごとの字の上限（英字・数字・記号は 0.6 字で数える）。並びの意味は summary の通り。
 * 上限は、札を置く所の幅を、いちばん小さくした字（14〜24px。絵の幅 539 のうち）で割った数（8 字まで）。
 * 足す時は、ここと lib/noah-pin-diagram.ts の両方に足す（試験が、全部の図を描けるか・札が絵に収まるか・作り話の数が無いかを確かめる）。
 */
export const NOAH_PIN_TEMPLATES = {
  venn: { no: 1, name: 'ベン図', en: 'Venn diagram', slots: [6, 6], summary: '2 つの円が寄って重なり、重なりだけが青くなる。重なりが、その Agent が返す物。labels = [左の円（青）, 右の円]（札は円の外側）' },
  matrix: { no: 2, name: '4象限マトリクス（2×2）', en: '2x2 matrix', slots: [5, 8, 8], summary: '縦横 2 つの軸で 4 つに分け、右上の青い点が狙い。labels = [横の軸, 縦の軸, 青い点]' },
  tree: { no: 3, name: 'ロジックツリー', en: 'Logic tree (issue tree)', slots: [7, 8, 8, 8], summary: '左の 1 つを右へ 3 つに分ける（その先は小さな箱）。labels = [根（入れる物）, 枝 1, 枝 2, 枝 3]' },
  pyramid: { no: 4, name: 'ピラミッド図', en: 'Pyramid diagram', slots: [8, 7], summary: '下から 4 段積み上がり、いちばん上の段が青い。labels = [青い段（右の札）, 段の名前（左の札）]' },
  mindmap: { no: 5, name: 'マインドマップ', en: 'Mind map', slots: [8, 5, 5, 5, 5], summary: '真ん中の言葉から、左右へ曲がった枝が伸びる。labels = [真ん中, 右上の枝, 右下の枝, 左上の枝, 左下の枝]' },
  flowchart: { no: 6, name: 'フローチャート', en: 'Flowchart', slots: [7, 7, 7, 7], summary: '始め → 手順 → ひし形の分かれ目（No は戻る）→ 手順 → 終わり。labels = [始め, ひし形（確かめる事）, 次の手順, 終わり]（次の手順は図の下、他は上）' },
  cycle: { no: 7, name: 'サイクル図', en: 'Cycle diagram', slots: [7, 7, 7, 7], summary: '輪の上の 4 つの丸（1〜4）を矢印が回る。labels = [1（右上）, 2（右下）, 3（左下）, 4（左上）]' },
  fishbone: { no: 8, name: 'フィッシュボーン図（特性要因図）', en: 'Fishbone diagram', slots: [5, 8, 8], summary: '背骨の先の頭が結果、上下の骨が原因。labels = [頭（結果）, 上の骨, 下の骨]' },
  scatter: { no: 9, name: '散布図', en: 'Scatter plot', slots: [8, 8], summary: '点が左から右へ右上がりに出て、点線の傾向線が引かれる。labels = [横の軸, 縦の軸]' },
  bubble: { no: 10, name: 'バブルチャート', en: 'Bubble chart', slots: [5, 8], summary: '大きさの違う円が軸の上で膨らむ。いちばん大きい円が青い。labels = [いちばん大きい円（円の中）, 横の軸]' },
  heatmap: { no: 11, name: 'ヒートマップ', en: 'Heatmap', slots: [8, 8, 8], summary: '表のマスが、波のように青の濃さで塗られる。labels = [表の名前（左上）, いちばん濃い所（下の青い札）, 濃さの名前（右上の見本の左）]' },
  radar: { no: 12, name: 'レーダーチャート', en: 'Radar chart', slots: [8, 8, 8, 8], summary: 'くもの巣の目盛りに、灰色の形と、広がる青い形。labels = [左上の軸, 右上の軸, 右下の軸, 左下の軸]' },
  gauge: { no: 13, name: 'ゲージチャート', en: 'Gauge chart', slots: [8, 8], summary: '半円のメーターの針が振れて止まる（数は描かない）。labels = [測る物（下）, 目盛りのいっぱいの所（右の端）]' },
  combo: { no: 14, name: '複合グラフ（棒＋折れ線）', en: 'Combo chart (bar + line)', slots: [8, 8], summary: '棒（左の目盛り）と折れ線（右の目盛り）を重ねる。labels = [棒, 折れ線]（左上の凡例）' },
  pictogram: { no: 15, name: '絵グラフ（ピクトグラム）', en: 'Pictogram chart (icon array)', slots: [6, 8], summary: '人の印が 10 人並び、3 人が青くなる。labels = [大きい青い札, 小さい札]（どちらも人の左）' },
  stacked: { no: 16, name: '帯グラフ（100%積み上げ）', en: '100% stacked bar chart', slots: [8, 6, 5], summary: '同じ長さの帯が 4 本、区切りの割合で塗られる（数は描かない）。labels = [1 つ目の区切り（青）, 2 つ目, 3 つ目]（いちばん上の帯の中）' },
  gantt: { no: 17, name: 'ガントチャート', en: 'Gantt chart', slots: [8, 8], summary: '列の目盛りに横棒の期間が並び、青い期間を縦線（日）が通る。labels = [青い期間（その行の左）, 縦線の日（下）]' },
  timeline: { no: 18, name: 'タイムライン', en: 'Timeline', slots: [8, 8, 8], summary: '1 本の線に出来事が順に出る。labels = [左, 真ん中, 右（青）]（線の上の札）' },
  funnel: { no: 19, name: 'ファネル図', en: 'Funnel chart', slots: [8, 8, 7], summary: '段ごとに短くなる帯で絞り込みを見せる。labels = [いちばん上, 2 段目, いちばん下（青）]' },
  journey: { no: 20, name: 'カスタマージャーニーマップ', en: 'Customer journey map', slots: [6, 6], summary: '段ごとの気持ちの上下を線と顔で見せる。labels = [いちばん高い所（青）, いちばん低い所]' },
  treemap: { no: 21, name: 'ツリーマップ', en: 'Treemap', slots: [8, 7], summary: '大きな四角が、大きい順の四角で埋まる。labels = [いちばん大きい四角（青）, 2 番目の四角]' },
  swimlane: { no: 22, name: 'スイムレーン図', en: 'Swimlane diagram', slots: [4, 4, 4], summary: '担当ごとのレーンを、手順の箱と矢印が渡る。labels = [上のレーン, 真ん中のレーン, 下のレーン]（担当の名前）' },
  chevron: { no: 23, name: '矢羽根図（シェブロン）', en: 'Chevron process', slots: [8, 8, 8], summary: '矢羽根が 5 つ、左から順に並ぶ（1〜5）。labels = [1 番目, 3 番目, 5 番目（青）]（矢羽根の下）' },
  concentric: { no: 24, name: '同心円図', en: 'Concentric circle diagram', slots: [3, 8], summary: '同じ中心の円が内へ重なる。labels = [真ん中の円（白い字）, 外の円の右の札]' },
} as const satisfies Record<string, Spec>;
export type NoahPinTemplate = keyof typeof NOAH_PIN_TEMPLATES;

/** 1 枚の絵。parts と variant は、バージョン 1 と同じ JSON の形を保つために残した項目（TAKE では、いつも空と null）。 */
export type NoahPinScene = { template: NoahPinTemplate; labels: string[]; parts: string[]; variant: string | null };

/** 札の言葉の長さの、どの図でも越えない上限（字の数。英字・数字・記号は 0.6 字で数える）。図ごとの上限は slots。 */
export const NOAH_PIN_LABEL_MAX = 8;

export function noahPinLabelWidth(text: string): number {
  return Array.from(text).reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) < 128 ? 0.6 : 1), 0);
}

/** 言葉に使えない物: 改行・制御文字・山かっこ（絵の中で字として出すだけなので、HTML としては扱わないが、念のため受け付けない）。 */
const BAD = { test: (text: string) => Array.from(text).some((char) => { const code = char.codePointAt(0) ?? 0; return code < 32 || code === 127 || char === '<' || char === '>'; }) };

/**
 * 外から来た JSON（人が書いた物・AI が書いた物）を確かめて、1 枚の絵にする。形が違えば null と理由。
 * 確かめる事: 図が表にある・札の数がちょうど・札が空でなく、その図の字の上限に収まる・parts は空・variant は null・余計な項目が無い。
 */
export function parseNoahPinScene(value: unknown): { scene: NoahPinScene; error: null } | { scene: null; error: string } {
  const fail = (error: string) => ({ scene: null, error });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('not_object');
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!['template', 'labels', 'parts', 'variant'].includes(key)) return fail(`unknown_key:${key}`);
  if (typeof input.template !== 'string' || !Object.hasOwn(NOAH_PIN_TEMPLATES, input.template)) return fail('template');
  const template = input.template as NoahPinTemplate, spec: Spec = NOAH_PIN_TEMPLATES[template];
  const labels = input.labels, parts = input.parts ?? [], variant = input.variant ?? null;
  if (!Array.isArray(labels) || labels.length !== spec.slots.length) return fail('labels_count');
  for (const [index, label] of labels.entries()) {
    if (typeof label !== 'string' || !label.trim() || label !== label.trim() || BAD.test(label)) return fail(`label:${index}`);
    if (noahPinLabelWidth(label) > spec.slots[index]) return fail(`label_long:${index}`);
  }
  if (!Array.isArray(parts) || parts.length !== 0) return fail('parts_count');
  if (variant !== null) return fail('variant');
  return { scene: { template, labels: [...labels] as string[], parts: [], variant: null }, error: null };
}

/** AI への説明（codex/tasks/130 の指示書が、そのまま使う表）。図ごとに 1 行。 */
export function noahPinTemplateGuide(): string {
  return (Object.entries(NOAH_PIN_TEMPLATES) as [NoahPinTemplate, Spec][]).map(([name, spec]) =>
    `- ${name}（${String(spec.no).padStart(2, '0')} ${spec.name} / ${spec.en}）: ${spec.summary}。札の字の上限 = [${spec.slots.join(', ')}]`).join('\n');
}

/** 1 枚のピンの字と絵（題・入れる物・返る物・図解）。Luna Max が 1.7 万件ぶん書く物の形（codex/tasks/130）。 */
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
