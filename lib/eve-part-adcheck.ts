/**
 * Eve が作った部品: 広告の表示・表現を点検する（能力 compliance.check）。task 130、2026-11-24。
 *
 * 決まった言葉の点検だけをする（LLM なし。法律の判断はしない。外へ通信しない）。最初の組み合わせでは、LP を公開する前の門（disclose）に使う。
 * 1. 広告であることの表示: 本文の最初の 100 文字の中に「PR」「広告」「プロモーション」のどれかがある（景品表示法のステルスマーケティング規制）。
 * 2. 言い切り・順位・約束の表現が無い（台本の部品と同じ一覧。「必ずご確認ください」のような確かめを勧める使い方は通す）。
 * 3. 効き目の言い切りが無い（治る・痩せる・効果があります など。薬機法・景品表示法で根拠が要る表現）。
 * 見本の文字・HTML は、入力の中の文字（入れ子の text・html も）を全部集めて、1 つずつ点検する。1 つでも当たれば ok は false。
 */

import { eveGraphemes } from './eve-part-llm.ts';
import { EVE_PART_SCRIPT_BANNED } from './eve-part-writer.ts';

export const EVE_PART_ADCHECK_REF = 'eve-part:ad-check';

const EFFECT = /(治る|治ります|治します|完治|痩せ(る|ます)|効果があります|効果抜群|効き目|副作用(なし|がない|はありません))/u;
const LABEL = /(PR|広告|プロモーション)/u;

export type EveAdProblem = { document: string; rule: 'label' | 'claim' | 'effect'; detail: string };
export type EveAdCheck = { ok: boolean; problems: EveAdProblem[]; documents: number };

/** HTML から文字だけを取り出す（script・style は捨てる）。 */
export function eveHtmlText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|section|article|header)>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n\s+/gu, '\n')
    .trim();
}

/** 入力の中の文字を、名前付きで集める（入れ子は 4 段まで、合わせて 200 個まで）。 */
function documents(input: unknown, path: string, out: { name: string; text: string }[], depth = 0) {
  if (out.length >= 200 || depth > 4) return;
  if (typeof input === 'string') {
    if (input.trim()) out.push({ name: path || '本文', text: /<[a-z][\s\S]*>/iu.test(input) ? eveHtmlText(input) : input });
    return;
  }
  if (Array.isArray(input)) input.forEach((v, i) => documents(v, `${path}[${i}]`, out, depth + 1));
  else if (input && typeof input === 'object') for (const [k, v] of Object.entries(input)) documents(v, path ? `${path}.${k}` : k, out, depth + 1);
}

export function eveCheckAd(input: unknown): EveAdCheck {
  const docs: { name: string; text: string }[] = [];
  documents(input, '', docs);
  if (!docs.length) throw new Error('点検する文字がありません。');
  const problems: EveAdProblem[] = [];
  for (const d of docs) {
    const head = Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(d.text)).slice(0, 100).map((s) => s.segment).join('');
    if (!LABEL.test(head)) problems.push({ document: d.name, rule: 'label', detail: `最初の 100 文字に「PR」「広告」「プロモーション」がありません（${eveGraphemes(d.text)} 文字）。` });
    const claim = new RegExp(EVE_PART_SCRIPT_BANNED.source, 'giu');
    for (const m of d.text.matchAll(claim)) problems.push({ document: d.name, rule: 'claim', detail: `言い切り・順位・約束の表現「${m[0]}」があります。` });
    const effect = new RegExp(EFFECT.source, 'gu');
    for (const m of d.text.matchAll(effect)) problems.push({ document: d.name, rule: 'effect', detail: `効き目の言い切り「${m[0]}」があります。` });
  }
  return { ok: problems.length === 0, problems, documents: docs.length };
}
