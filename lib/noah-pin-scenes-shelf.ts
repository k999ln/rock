/**
 * 棚の最初のカード 17 枚（data/noah-shelf-first-cards.json）の図解（バージョン TAKE。しょうへいさんの図解パックの書き写し）。人（Claude）が、カードの題・説明・入れる物・返る物を読んで、図を選び札を書いた物。
 * 札の言葉は、カードの題・説明・入れる物・返る物の文にそのままある言葉だけを使う（作り話の数・例は入れない。試験が確かめる）。同じ図は 2 枚まで。
 * Luna Max が 1.7 万件の図解を書く時の見本も兼ねる（codex/tasks/130）。
 * 形は lib/noah-pin-scene.ts の parseNoahPinScene で確かめる（tests/noah-pin-scene.test.mjs が全部を確かめる）。
 */
import { parseNoahPinScene, type NoahPinScene } from './noah-pin-scene.ts';

export const NOAH_SHELF_SCENE_SOURCE: Readonly<Record<string, unknown>> = {
  // 取引 1 つ（根）を、勘定科目・仕訳の例・税区分の 3 つに分ける。
  'pkg:keihi-kamoku': { template: 'tree', labels: ['取引の内容', '勘定科目', '仕訳の例', '税区分'] },
  // 番号から始め、形を確かめ（ひし形。合わなければ戻る）、公表データを見て、登録の有無で終わる。
  'pkg:invoice-bango': { template: 'flowchart', labels: ['登録番号', '形の確認', '公表データ', '登録の有無'] },
  // 広告・告知の文の表を、重さの濃さで塗り、いちばん濃い所が気になる箇所。
  'pkg:koukoku-hyougen': { template: 'heatmap', labels: ['広告・告知の文', '気になる箇所', '重さ'] },
  // 手作業・自動化・承認の段のレーンを、手順が渡る（最後の青い箱は、人が承認する所）。
  'pkg:jidouka-shiyou': { template: 'swimlane', labels: ['手作業', '自動化', '承認の段'] },
  // 調べたい事 1 つ（根）を、題・URL・日付・要点に分ける。
  'pkg:web-shirabe': { template: 'tree', labels: ['調べたい事', '題・URL', '日付', '要点'] },
  // 採用ページの求人から、希望に近い物へ絞る。
  'pkg:kyujin-sagasi': { template: 'funnel', labels: ['採用ページ', '求人', '希望に近い'] },
  // 仕事と法律の重なり（仕事に関係する法律）が青い。
  'pkg:houritsu-sagasi': { template: 'venn', labels: ['仕事', '法律'] },
  // 単語 1 つ（真ん中）から、発音記号・音節・強勢・こつへ広げる。
  'pkg:eigo-hatsuon': { template: 'mindmap', labels: ['comfortable', '発音記号', '音節', '強勢', 'こつ'] },
  // 単語が、HSK の級の段のどこにあるか（いちばん上の青い段）。
  'pkg:chugokugo-tango': { template: 'pyramid', labels: ['学习', 'HSK の級'] },
  // みんなで（人の印）遊べるクイズ。
  'pkg:quiz-sagasi': { template: 'pictogram', labels: ['みんなで', '遊べるクイズ'] },
  // 区切られた形を色でぬる、算数ぬりえ。
  'pkg:kodomo-nurie': { template: 'treemap', labels: ['算数ぬりえ', '色をぬる'] },
  // 寄附額のメーターと、いっぱいの所が上限の目安。
  'pkg:furusato-jogen': { template: 'gauge', labels: ['寄附額', '上限の目安'] },
  // 毎月の引かれた所得税（棒）と、年末調整で戻る額（線）。
  'pkg:nencho-shisan': { template: 'combo', labels: ['引かれた所得税', '戻る額'] },
  // 総支給の帯を、手取り・社会保険料・所得税に区切る。
  'pkg:tedori': { template: 'stacked', labels: ['手取り', '社会保険料', '所得税'] },
  // 名所ごとの見頃の期間（青）と、それを通る行く日の縦線。
  'pkg:koyo-mikoro': { template: 'gantt', labels: ['見頃の期間', '行く日'] },
  // 地区を真ん中に、距離の近い順の輪。
  'pkg:coin-locker': { template: 'concentric', labels: ['地区', '距離の近い順'] },
  // 保育園の名前から、住所・電話・種類・URL に広げる。
  'pkg:hoikuen': { template: 'mindmap', labels: ['保育園', '住所', '電話', '種類', 'URL'] },
};

/** 確かめて通った物だけ（形の違う物は載せない。試験が、全部通る事を確かめる）。 */
export const NOAH_SHELF_SCENES: Readonly<Record<string, NoahPinScene>> = Object.fromEntries(
  Object.entries(NOAH_SHELF_SCENE_SOURCE).flatMap(([id, value]) => { const { scene } = parseNoahPinScene(value); return scene ? [[id, scene]] : []; }),
);
