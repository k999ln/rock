import type { NoahCollectionItem, NoahCollectionRun } from './noah-collection.ts';
import type { NoahPinTopic } from './noah-pins.ts';
export type NoahAgentSource = Pick<NoahCollectionItem, 'source' | 'sourceUrl' | 'author' | 'metrics' | 'observedAt' | 'createdAt'>;
export type NoahAgentCard = {
  id: string; name: string; provider: string; summary: string; host: string | null; users: number; oneTap: boolean;
  topic: NoahPinTopic; shape: 0 | 1 | 2; savedIn: string[];
  feedbackId?: string; href?: string; external?: boolean; sources?: NoahAgentSource[]; run?: NoahCollectionRun;
  /** Noah 自身の紹介の窓口（広告を含む）。カードの表に、送信先の名前の代わりに、その事を書く。送信先は詳細の画面に出す。 */
  notice?: 'noah-ad';
};
// カードの下の行の決まり（noahCardOrigin）は lib/noah-pins.ts（画面の試験の台が本物を使う、通信しない式の置き場）。
