/**
 * 棚の最初のカード 17 枚（data/noah-shelf-first-cards.json）の場面の絵。人（Claude）が、カードの題・入れる物・返る物を読んで書いた物。
 * 札の言葉は、カードの題・説明・入れる物・返る物の文にそのままある言葉だけを使う（作り話の数・例は入れない。試験が確かめる）。Luna Max が 1.7 万件の絵を書く時の見本も兼ねる（codex/tasks/130）。
 * 形は lib/noah-pin-scene.ts の parseNoahPinScene で確かめる（tests/noah-pin-scene.test.mjs が全部を確かめる）。
 */
import { parseNoahPinScene, type NoahPinScene } from './noah-pin-scene.ts';

export const NOAH_SHELF_SCENE_SOURCE: Readonly<Record<string, unknown>> = {
  'pkg:keihi-kamoku': { template: 'transform', parts: ['receipt', 'ledger'], labels: ['カフェ代', '勘定科目'] },
  'pkg:invoice-bango': { template: 'inspect', parts: ['document'], variant: 'ok', labels: ['請求書', 'T と 13 桁', '登録の有無'] },
  'pkg:koukoku-hyougen': { template: 'inspect', parts: ['flyer'], variant: 'warn', labels: ['広告・告知', '気になる箇所', '言い換えの例'] },
  'pkg:jidouka-shiyou': { template: 'steps', labels: ['承認'] },
  'pkg:web-shirabe': { template: 'browse', labels: ['日付'] },
  'pkg:kyujin-sagasi': { template: 'board', variant: 'building', labels: ['希望に近い'] },
  'pkg:houritsu-sagasi': { template: 'shelf', variant: 'law', labels: ['フリーランス'] },
  'pkg:eigo-hatsuon': { template: 'speak', labels: ['comfortable', '音節と強勢'] },
  'pkg:chugokugo-tango': { template: 'word', labels: ['学习', 'ピンイン', 'HSK の級'] },
  'pkg:quiz-sagasi': { template: 'play', labels: ['例の問題'] },
  'pkg:kodomo-nurie': { template: 'print', variant: 'math', labels: ['算数'] },
  'pkg:furusato-jogen': { template: 'gauge', parts: ['gift'], labels: ['ふるさと納税', '上限の目安'] },
  'pkg:nencho-shisan': { template: 'return', labels: ['源泉徴収', '還付'] },
  'pkg:tedori': { template: 'split', labels: ['総支給', '手取り', '引かれる物'] },
  'pkg:koyo-mikoro': { template: 'place', parts: ['station'], variant: 'autumn', labels: ['見頃の期間'] },
  'pkg:coin-locker': { template: 'nearby', parts: ['restroom'], variant: 'lockers', labels: ['距離'] },
  'pkg:hoikuen': { template: 'building', variant: 'nursery', labels: ['住所・電話'] },
};

/** 確かめて通った物だけ（形の違う物は載せない。試験が、全部通る事を確かめる）。 */
export const NOAH_SHELF_SCENES: Readonly<Record<string, NoahPinScene>> = Object.fromEntries(
  Object.entries(NOAH_SHELF_SCENE_SOURCE).flatMap(([id, value]) => { const { scene } = parseNoahPinScene(value); return scene ? [[id, scene]] : []; }),
);
