/**
 * Agent の詳細の、見ただけでやる事がわかる部分の式（components/noah-detail-plain.tsx）。通信しない。
 * 本人 2026-11-28「ちゃんとした大手のサイトみたいに見ただけで特に説明なくともやることがわかるような UIUX にして」。
 */
import type { NoahStep } from './noah-steps.ts';

/** 道具の受け取る項目（「zip（文字）」「service（文字・任意）」）から、型を外す。任意の物だけ「（任意）」を残す。 */
export function noahPlainNeeds(inputs: readonly string[] = []): string[] {
  return inputs.map((input) => {
    const match = /^(.*?)（([^）]*)）$/u.exec(input);
    if (!match) return input;
    return match[2].split('・').includes('任意') ? `${match[1]}（任意）` : match[1];
  });
}

/** 道具の名前（find_pros）を読める形（find pros）にする。工程の名前が日本語の札の時は、そのまま。 */
export function noahPlainToolName(label: string): string {
  return /^[A-Za-z0-9_.:-]+$/.test(label) ? label.replace(/[_.:-]+/g, ' ').trim() : label;
}

/** カードに出す「要る情報」。必須の物は名前を並べ、任意の物は数だけにする（任意が 16 個並ぶと、何が要るのか読めない）。 */
export function noahPlainNeedsLine(needs: readonly string[] = []): { required: string[]; optional: number } {
  const required = needs.filter((need) => !need.endsWith('（任意）'));
  return { required, optional: needs.length - required.length };
}

export type NoahPlainUse = { key: string; name: string; text: string; needs: string[] };

/** 「こんな事を頼めます」に並べる物（道具の工程ごと）。道具の工程が無い時は空（説明は、上の「詳細」に出ているので繰り返さない）。 */
export function noahPlainUses(steps: readonly NoahStep[] = []): NoahPlainUse[] {
  return steps.filter((step) => step.id.startsWith('tool:'))
    .map((step) => ({ key: step.id, name: noahPlainToolName(step.label), text: step.note ?? '', needs: noahPlainNeeds(step.flow?.inputs) }));
}

/** 「接続」を押すと何が起きるかの 1 行（日本語の原文。画面で訳す）。 */
export function noahDetailActionNote({ signedIn, connected, typed, need }: { signedIn: boolean; connected: boolean; typed: number; need: string | null }): string {
  if (connected) return 'つながっています。やる事を選んで頼めます。';
  if (!signedIn) return '押すと、利用開始の画面に進みます。パスキーで始められます。';
  if (typed > 0) return '押すと、つなぐ前に要る入力の欄が開きます。';
  if (need && need !== 'サインイン') return '押すと、相手の許可の画面に進みます。';
  return '押すと、すぐにつながります。';
}
