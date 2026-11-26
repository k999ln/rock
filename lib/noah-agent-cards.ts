import type { NoahCollectionItem, NoahCollectionRun } from './noah-collection.ts';
import type { NoahPinTopic } from './noah-pins.ts';
import type { NoahPin } from './noah-pin-scene.ts';
import type { NoahPinVideo } from './noah-pin-video.ts';
export type NoahAgentSource = Pick<NoahCollectionItem, 'source' | 'sourceUrl' | 'author' | 'metrics' | 'observedAt' | 'createdAt'>;
export type NoahAgentCard = {
  id: string; name: string; provider: string; summary: string; host: string | null; users: number; oneTap: boolean;
  topic: NoahPinTopic; shape: 0 | 1 | 2; savedIn: string[];
  marketplace?: { kind: 'package' | 'tool' | 'model'; key: string; label: string; cover?: { type: 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4' | 'video/webm'; url: string } };
  feedbackId?: string; href?: string; external?: boolean; sources?: NoahAgentSource[]; run?: NoahCollectionRun;
  /** Noah 自身の紹介の窓口（広告を含む）。カードの表に、送信先の名前の代わりに、その事を書く。送信先は詳細の画面に出す。 */
  notice?: 'noah-ad';
  /** 日本語の題・入れる物・返る物と、資料の図解（codex/tasks/131 で Luna Max が書き、確かめた物だけ）。無い時は、名前・説明・頭文字の面。 */
  pin?: NoahPin;
  /** ピンの動画（集めた動画を 5〜8 秒・縦 3:4・音なしのループにした物。codex/tasks/132）。ある時は、図解の代わりに見えている間繰り返す。 */
  pinVideo?: NoahPinVideo;
};
// カードの下の行の決まり（noahCardOrigin）は lib/noah-pins.ts（画面の試験の台が本物を使う、通信しない式の置き場）。
