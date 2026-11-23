/**
 * 棚の最初のカード 17 枚（data/noah-shelf-first-cards.json）の図解（バージョン TAKE）。人（Claude）が、カードの題・説明・入れる物・返る物を読んで、図を選び札を書いた物。
 * 札の言葉は、カードの題・説明・入れる物・返る物の文にそのままある言葉だけを使う（作り話の数・例は入れない。試験が確かめる）。同じ図は 2 枚まで。
 * Luna Max が 1.7 万件の図解を書く時の見本も兼ねる（codex/tasks/130）。
 * 形は lib/noah-pin-scene.ts の parseNoahPinScene で確かめる（tests/noah-pin-scene.test.mjs が全部を確かめる）。
 */
import { parseNoahPinScene, type NoahPinScene } from './noah-pin-scene.ts';

export const NOAH_SHELF_SCENE_SOURCE: Readonly<Record<string, unknown>> = {
  // 取引 1 つを、勘定科目・仕訳の例・税区分に分ける。
  'pkg:keihi-kamoku': { template: 'tree', labels: ['取引の内容', '勘定科目', '仕訳の例', '税区分'] },
  // 番号の形を確かめ、公表データで登録の有無を見る。
  'pkg:invoice-bango': { template: 'flowchart', labels: ['登録番号', '形の確認', '公表データ', '登録の有無'] },
  // 文の中の気になる箇所を、重さの濃さで見せる。
  'pkg:koukoku-hyougen': { template: 'heatmap', labels: ['広告・告知の文', '気になる箇所', '重さ'] },
  // 自動化と人の担当を分け、人が承認する段を青に。
  'pkg:jidouka-shiyou': { template: 'swimlane', labels: ['自動化', '人', '承認'] },
  // 調べたい事 1 つを、題・URL・日付・要点に分ける。
  'pkg:web-shirabe': { template: 'tree', labels: ['調べたい事', '題・URL', '日付', '要点'] },
  // 採用ページの求人から、希望に近い物へ絞る。
  'pkg:kyujin-sagasi': { template: 'funnel', labels: ['採用ページ', '求人', '希望に近い'] },
  // 言葉と日本の法令の重なり（その言葉を含む法令）。
  'pkg:houritsu-sagasi': { template: 'venn', labels: ['フリーランス', '日本の法令'] },
  // 単語の強く読む所を、線のいちばん高い所で見せる。
  'pkg:eigo-hatsuon': { template: 'journey', labels: ['comfortable', '強勢'] },
  // 単語が、HSK の級の段のどこにあるか。
  'pkg:chugokugo-tango': { template: 'pyramid', labels: ['学习', 'HSK の級'] },
  // みんなで参加する人の数と、例の問題。
  'pkg:quiz-sagasi': { template: 'pictogram', labels: ['みんなで', '例の問題'] },
  // 区切られた形に、数を数えて色をぬる。
  'pkg:kodomo-nurie': { template: 'treemap', labels: ['数を数えて', '色をぬる'] },
  // 寄附額の目安を、上限の印に向けたメーターで。
  'pkg:furusato-jogen': { template: 'gauge', labels: ['寄附額', '上限の目安'] },
  // 源泉徴収された額との差が、還付。
  'pkg:nencho-shisan': { template: 'combo', labels: ['源泉徴収', '還付'] },
  // 総支給を、手取り・社会保険料・所得税の帯に分ける。
  'pkg:tedori': { template: 'stacked', labels: ['手取り', '社会保険料', '所得税'] },
  // 名所ごとの見頃の期間と、行く日の縦の線。
  'pkg:koyo-mikoro': { template: 'gantt', labels: ['見頃の期間', '行く日'] },
  // 地区を中心に、距離の近い順の輪。
  'pkg:coin-locker': { template: 'concentric', labels: ['地区', '距離の近い順'] },
  // 保育園の名前から、住所・電話・種類・URL に広げる。
  'pkg:hoikuen': { template: 'mindmap', labels: ['保育園', '住所', '電話', '種類', 'URL'] },
};

/** 確かめて通った物だけ（形の違う物は載せない。試験が、全部通る事を確かめる）。 */
export const NOAH_SHELF_SCENES: Readonly<Record<string, NoahPinScene>> = Object.fromEntries(
  Object.entries(NOAH_SHELF_SCENE_SOURCE).flatMap(([id, value]) => { const { scene } = parseNoahPinScene(value); return scene ? [[id, scene]] : []; }),
);
