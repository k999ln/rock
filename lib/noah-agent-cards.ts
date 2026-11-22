import type { NoahCollectionItem, NoahCollectionRun } from './noah-collection.ts';
import type { NoahPinTopic } from './noah-pins.ts';
import type { NoahPin } from './noah-pin-scene.ts';
export type NoahAgentSource = Pick<NoahCollectionItem, 'source' | 'sourceUrl' | 'author' | 'metrics' | 'observedAt' | 'createdAt'>;
export type NoahAgentCard = {
  id: string; name: string; provider: string; summary: string; host: string | null; users: number; oneTap: boolean;
  topic: NoahPinTopic; shape: 0 | 1 | 2; savedIn: string[];
  feedbackId?: string; href?: string; external?: boolean; sources?: NoahAgentSource[]; run?: NoahCollectionRun;
  /** Noah 自身の紹介の窓口（広告を含む）。カードの表に、送信先の名前の代わりに、その事を書く。送信先は詳細の画面に出す。 */
  notice?: 'noah-ad';
  /** 日本語の題・入れる物・返る物と、場面の絵（codex/tasks/130 で Luna Max が書き、確かめた物だけ）。無い時は、名前・説明・頭文字の面。 */
  pin?: NoahPin;
};
// カードの下の行の決まり（noahCardOrigin）は lib/noah-pins.ts（画面の試験の台が本物を使う、通信しない式の置き場）。
