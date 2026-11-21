/**
 * 棚の画面の文と、入口が返す形（task 110）。画面（components/noah-shelf.tsx・noah-shelf-review.tsx）と、保存の側（lib/noah-shelf-store.ts）の両方が読む。
 * ここは、表にも、Noah の他の部品にも触らない（画面の bundle へ入るため。型は、型としてだけ読む）。
 * 仕様: docs/noah/spec-110-shelf.md の 10 章。
 */
import type { NoahPackage, NoahPackageReason, NoahRunPlace, NoahShelfId } from './noah-shelf.ts';

/** 棚の画面の文（決まった文。カードの名前と説明は運営の言葉で、提供者の説明とは別に出す）。 */
export const NOAH_SHELF_TEXT = {
  title: '棚',
  lead: 'やりたい仕事を選ぶだけで、使う道具は Noah が組んであります。',
  operatorNote: 'Noah の説明',
  use: '使う',
  noNumbers: 'まだ数字はありません',
  trial: '新しく入りました',
  priceHint: (yen: number) => `先に売った人の最低額: ${yen.toLocaleString('ja-JP')} 円（約束ではありません）`,
  owner: (steps: number, minutes: number) => (steps ? `あなたがやる事 ${steps} つ・約 ${minutes} 分` : `あなたがやる事 0・約 ${minutes} 分`),
  runs: { provider: '相手のサーバー', home: 'あなたの端末', noah: 'Noah の中' } satisfies Record<NoahRunPlace, string>,
  give: '渡す物',
  get: '受け取る物',
  advice: '助言まで（診断や、薬の指示はしません）',
} as const;
/** 載せていない理由の文（運営の画面）。 */
export const NOAH_SHELF_REASON_TEXT: Record<NoahPackageReason, string> = {
  retired: '外しました',
  draft: 'まだ動かして確かめていません',
  advice_unreviewed: '専門家の確かめが、まだです',
  later_chain: '工程をつなぐカードは、まだ出せません',
  later_home: 'あなたの端末で動くカードは、まだ出せません',
  step_missing: '工程の先がありません',
  step_not_running: '工程の先が、今は動きません',
  step_changed: '確かめた時から、中身が変わりました。もう一度動かしてください',
};

/** 棚に出す 1 枚（GET /api/noah/shelf）。 */
export type NoahShelfCard = {
  id: string; shelf: NoahShelfId; topic: NoahPackage['topic']; topicLabel: string; title: string; promise: string; give: string; get: string;
  priceHint: NoahPackage['priceHint'] | null; advice: boolean; runs: NoahRunPlace[]; ownerSteps: number; ownerMinutes: number;
  position: number; why: 'operator' | 'evidence' | 'trial' | 'personal'; target: string;
};
/** 運営の画面の 1 枚。 */
export type NoahShelfStateCard = {
  id: string; shelf: NoahShelfId; topic: NoahPackage['topic']; title: string; status: NoahPackage['status']; position: number; revision: number;
  listed: boolean; reason: NoahPackageReason | null; reasonStep: number | null; reasonText: string | null;
  verifiedAt: number | null; runs: number | null; reviewAt: number | null; advice: boolean; checkedAt: number | null; updatedAt: number; package: NoahPackage;
};

/** 相手のサーバーの道具 1 つのカードを押した時の行き先。系列の ID は `/` を含むので、query で渡す。 */
export const noahShelfTarget = (familyId: string, tool: string, pkg: string, position: number) =>
  `/noah/ready/agent?${new URLSearchParams({ id: familyId, tool, from: pkg, pos: String(position) }).toString()}`;

