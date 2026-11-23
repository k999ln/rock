/**
 * Noah のピンの絵（バージョン TAKE。2026-11-24 の本人の指示「こういうの思い描いてたんだけど。今のをバージョン1って名前で保存して、次のやつはバージョンTAKEで保存して全部作り直して」）。
 * 絵は「資料の図解」。しょうへい（@showheyohtaki）さんの「資料で使う図解・グラフの名前」のチートシート（Take｜AI革命 @aikakumei_take さんが紹介）の 24 種類から、
 * その Agent の仕事がいちばん伝わる図を 1 つ選び、図の中の札に、その Agent の言葉を入れる。灰色の面に青 1 色。
 * （バージョン 1 は、人と景色の「場面の絵」だった。ブランチ claude/noah-pins-version-1 に残してある。）
 *
 * 絵は「型（template。図の名前）」と、型ごとの決まった数の「札の言葉（labels）」だけで書く（座標は書かない）。札ごとに、図に収まる字の上限がある。
 * 決まった形の JSON なので、人が書いても、AI（Codex の Luna Max。codex/tasks/130）が説明を読んで書いても、同じ物差しで確かめられる。
 * 描くのは components/noah-pin-scene.tsx。ここは、確かめる関数と表だけ（通信も保存もしない）。
 * 仕様: docs/noah/spec-115-pin-grid.md の 9 章。
 */

type Spec = { no: number; name: string; en: string; slots: readonly number[]; height: number; summary: string };

/**
 * 図の表（チートシートの番号の順）。slots は札ごとの字の上限（英字・数字・記号は 0.6 字で数える）。並びの意味は summary の通り。height は絵の高さ（幅は 300）。
 * 足す時は、ここと components/noah-pin-scene.tsx の両方に足す（試験が、全部の図を描けるか・動くか・右上に字が無いかを確かめる）。
 */
export const NOAH_PIN_TEMPLATES = {
  venn: { no: 1, name: 'ベン図', en: 'Venn diagram', slots: [6, 6], height: 230, summary: '2 つの円の重なり。重なり（青）が、その Agent が返す物。labels = [左の円, 右の円]' },
  matrix: { no: 2, name: '4象限マトリクス（2×2）', en: '2x2 matrix', slots: [5, 5, 6], height: 230, summary: '縦横 2 つの軸で 4 つに分け、青い点で 1 つを示す。labels = [横の軸, 縦の軸, 青い点]' },
  tree: { no: 3, name: 'ロジックツリー', en: 'Logic tree', slots: [5, 6, 6, 6], height: 240, summary: '1 つを 3 つに分ける。labels = [根（入れる物）, 枝 1, 枝 2, 枝 3]' },
  pyramid: { no: 4, name: 'ピラミッド図', en: 'Pyramid diagram', slots: [6, 6], height: 230, summary: '下から積み上げる段。labels = [青い段, 段の名前（左上の札）]' },
  mindmap: { no: 5, name: 'マインドマップ', en: 'Mind map', slots: [5, 4, 4, 4, 4], height: 240, summary: '中心から 4 つに広げる。labels = [中心, 枝 1, 枝 2, 枝 3, 枝 4]' },
  flowchart: { no: 6, name: 'フローチャート', en: 'Flowchart', slots: [6, 4, 5, 5], height: 240, summary: 'ひし形の分かれ目を通る手順。labels = [始め, ひし形（確かめる事）, 次の箱, 結果（青）]' },
  cycle: { no: 7, name: 'サイクル図', en: 'Cycle diagram', slots: [4, 4, 4, 4], height: 240, summary: '矢印が輪になって回り続ける 4 つ。labels = [上, 右, 下, 左]' },
  fishbone: { no: 8, name: 'フィッシュボーン図（特性要因図）', en: 'Fishbone diagram', slots: [3, 5, 5], height: 220, summary: '魚の骨の形で原因を洗い出す。labels = [頭（結果）, 上の骨, 下の骨]' },
  scatter: { no: 9, name: '散布図', en: 'Scatter plot', slots: [5, 5], height: 220, summary: '点の散らばりで 2 つの関係を見る。labels = [横の軸, 縦の軸]' },
  bubble: { no: 10, name: 'バブルチャート', en: 'Bubble chart', slots: [4, 5], height: 220, summary: '円の大きさで 3 つ目を見せる。labels = [いちばん大きい円, 横の軸]' },
  heatmap: { no: 11, name: 'ヒートマップ', en: 'Heatmap', slots: [7, 6, 3], height: 230, summary: '表のマスを色の濃さで塗る。labels = [表（左下の札）, 濃い所, 濃さ]' },
  radar: { no: 12, name: 'レーダーチャート', en: 'Radar chart', slots: [4, 4, 5], height: 230, summary: 'くもの巣の形で項目を比べる。labels = [左上の項目, 左下の項目, 下の項目]' },
  gauge: { no: 13, name: 'ゲージチャート', en: 'Gauge chart', slots: [5, 5], height: 220, summary: '半円のメーターと針。labels = [測る物, 目盛りの印]' },
  combo: { no: 14, name: '複合グラフ（棒＋折れ線）', en: 'Combo chart (bar + line)', slots: [5, 4], height: 220, summary: '棒と折れ線で 2 つの数を重ね、差を示す。labels = [青い棒, 差]' },
  pictogram: { no: 15, name: '絵グラフ（ピクトグラム）', en: 'Pictogram chart', slots: [6, 5], height: 214, summary: '人の印の数で割合を見せる。labels = [左下の札, 右の青い札]' },
  stacked: { no: 16, name: '帯グラフ（100%積み上げ）', en: '100% stacked bar chart', slots: [6, 5, 4], height: 216, summary: '全体の帯を、割合で区切った帯に分けて内訳を見せる。labels = [いちばん大きい部分（青）, 2 番目, 3 番目]' },
  gantt: { no: 17, name: 'ガントチャート', en: 'Gantt chart', slots: [6, 4], height: 220, summary: '日付の目盛りに横棒で期間を並べる。labels = [青い期間, 縦の線（日）]' },
  timeline: { no: 18, name: 'タイムライン', en: 'Timeline', slots: [4, 4, 4], height: 210, summary: '1 本の線に出来事を順に並べる。labels = [左, 中, 右（青）]' },
  funnel: { no: 19, name: 'ファネル図', en: 'Funnel chart', slots: [6, 5, 5], height: 230, summary: '段ごとに絞られていく漏斗。labels = [いちばん上, 2 段目, 最後（青）]' },
  journey: { no: 20, name: 'カスタマージャーニーマップ', en: 'Customer journey map', slots: [8, 4], height: 220, summary: '段ごとの上下を線で見せる。labels = [下の札, いちばん高い所]' },
  treemap: { no: 21, name: 'ツリーマップ', en: 'Treemap', slots: [5, 4], height: 220, summary: '四角の大きさで全体の内訳。labels = [いちばん大きい四角（青）, 右下の四角]' },
  swimlane: { no: 22, name: 'スイムレーン図', en: 'Swimlane diagram', slots: [3, 3, 3], height: 230, summary: '担当ごとのレーンで手順を分ける。labels = [上のレーン, 下のレーン, 下のレーンの青い手順]' },
  chevron: { no: 23, name: '矢羽根図（シェブロン）', en: 'Chevron process', slots: [3, 3, 3], height: 200, summary: '矢羽根を横に並べて工程を見せる。labels = [1 つ目, 2 つ目, 3 つ目（青）]' },
  concentric: { no: 24, name: '同心円図', en: 'Concentric circle diagram', slots: [3, 6], height: 230, summary: '円の入れ子で範囲を絞る。labels = [中心, 右下の札]' },
} as const satisfies Record<string, Spec>;
export type NoahPinTemplate = keyof typeof NOAH_PIN_TEMPLATES;

/** 1 枚の絵。parts と variant は、バージョン 1 と同じ JSON の形を保つために残した項目（TAKE では、いつも空と null）。 */
export type NoahPinScene = { template: NoahPinTemplate; labels: string[]; parts: string[]; variant: string | null };

/**
 * 絵の右上の、何も置かない所（幅 300 の絵の座標。x より右で、かつ y より上）。グリッドの保存のボタンが、スマホの 2 列（カードの幅 約 160px〜）で覆う所。
 * 図を足す時も、札の字は、ここに置かない（tests/noah-pin-scene.test.mjs が、いちばん長い札で確かめる）。
 */
export const NOAH_PIN_KEEP_OUT = { x: 195, y: 100 } as const;

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
