import type { NoahWorkRevenueReceipt } from './noah-work-revenue-receipt.ts';
import type { NoahWorkUsageReceipt } from './noah-work-usage-receipt.ts';
import type { NoahReceivedResult } from './noah-result-media.ts';
import type { NoahCloudFile } from './noah-cloud-contract.ts';
/**
 * 頼む画面（道具を選ぶ・入力欄・確かめ・仕事の一覧）が使う、画面の文と、状態 → 見た目の決まり。
 *
 * 通信も保存もしない関数だけ（部品は components/noah-ask.tsx・noah-work-list.tsx）。
 * ここの関数は、権限を与えない。頼めるかどうか・道具を呼ぶかどうかを決めるのは、いつも API の側（lib/noah-ask.ts）。
 * 提供者の文（道具の名前・説明・成果）は、文字として出す（HTML として解釈しない）。
 * 仕様: docs/noah/spec-87-tool-agent.md の 11.5。
 */
import type { NoahFormField, NoahFormValue, NoahToolForm } from './noah-form.ts';

/** 道具の一覧の 1 件（GET /api/noah/connect/[id]/tools の tools）。 */
export type NoahAskTool = {
  name: string; summary: string; readOnly: boolean; sha256: string; usable: boolean; reason?: string; required: number; needsConfirm: boolean;
  form: NoahToolForm | null; description?: string;
};
/** 依頼の 1 件（GET /api/noah/ask の asks・GET /api/noah/ask/[id]）。 */
export type NoahAskItem = {
  id: string; connectionId: string; workId: string; state: string; mode: string; revision: number; tool: string | null; host: string | null;
  stopRequested: boolean; error?: string; createdAt: number; updatedAt: number; finishedAt?: number;
  /** 一覧で読んだ時だけ: その依頼の Agent（接続の系列の ID）。 */
  agentId?: string;
  delivery?: 'missing_image';
  result?: NoahReceivedResult; note?: string;
  cloudFiles?: NoahCloudFile[];
  usageReceipt?: NoahWorkUsageReceipt;
  revenueReceipt?: NoahWorkRevenueReceipt;
};

/** 画面の文（決まった文）。 */
export const NOAH_ASK_TEXT = {
  tools: '道具',
  pick: '何をしますか？',
  filter: '語で絞る（名前・説明）',
  none: '入力欄で使える道具が、今はありません。',
  noMatch: '合う道具が、ありません。',
  more: '細かい設定',
  submit: '頼む',
  sending: '送っています…',
  confirm: '確かめて頼む',
  cancel: 'やめる',
  offline: '通信できませんでした。もう一度試してください。',
  work: '仕事',
  open: '開く',
  close: '閉じる',
  stop: '止める',
  /** Agent をまたぐ一覧（「実行中」「成果データ」）の行から、その Agent の詳細へ。 */
  agent: 'この Agent を開く',
  raw: '元の形で見る',
  outline: '項目ごとに見る',
  received: '結果を受け取りました',
} as const;

export const noahAskSendsToText = (host: string) => `入力は ${host} へ送られます。`;
/** 読み取りだけと宣言されていない道具を、最初に使う前の確かめの文。 */
export const noahAskConfirmText = (tool: string) => `${tool} を使います。この道具は「読み取りだけ」と宣言されていません。相手のサーバーで、何かを変えたり送ったりするかもしれません。`;
export const noahAskOmittedText = (count: number) => `ほかに ${count} 個の設定があります（入力欄では使えません）。`;
/** 頼んだ画面の幅の区分（「スマホで使われるか」を数えるためだけに送る）。 */
export const noahScreenKind = (width: number): 'narrow' | 'wide' => (width < 600 ? 'narrow' : 'wide');

/** 道具の印（色だけで分けない。必ず文字で出す）。 */
export function noahToolMarks(tool: Pick<NoahAskTool, 'usable' | 'readOnly' | 'required' | 'needsConfirm'>): string[] {
  if (!tool.usable) return ['入力欄ではまだ使えません'];
  // 読み取りだけと宣言されていない道具は、最初の 1 回、送る前に確かめる（選ぶ前から、そうと分かるように出す）。
  return [tool.readOnly ? '読み取りだけ' : null, tool.readOnly && tool.required === 0 ? '押すだけ' : null, tool.needsConfirm ? '送る前に確かめます' : null].filter((mark): mark is string => mark !== null);
}
/** 語で絞る（名前と説明。大文字と小文字を分けない）。 */
export function noahFilterTools<T extends Pick<NoahAskTool, 'name' | 'summary'>>(tools: T[], word: string, label: (tool: T) => string = (tool) => tool.name): T[] {
  const needle = word.trim().toLowerCase();
  return needle ? tools.filter((tool) => tool.name.toLowerCase().includes(needle) || label(tool).toLowerCase().includes(needle) || tool.summary.toLowerCase().includes(needle)) : tools;
}

/** 入力欄の値（画面が持つ形）。選択肢から複数を選ぶ欄だけが、並び。それ以外は、文字。 */
export type NoahFieldValue = string | string[];
/** 欄の最初の値。提供者が決めた既定の値があれば、入れて見せる。 */
export function noahFieldInitial(field: NoahFormField): NoahFieldValue {
  const preset = field.default;
  if (field.kind === 'list') {
    const items = Array.isArray(preset) ? preset.map(String) : [];
    return field.choices ? items : items.join('\n');
  }
  return preset === undefined || Array.isArray(preset) ? '' : String(preset);
}
/** 道具へ渡す入力（空の欄は、渡さない）。値の検査と直しは noahFormArgs（画面と API が、同じ関数を使う）。 */
export function noahFormInput(fields: NoahFormField[], values: Record<string, NoahFieldValue>): Record<string, NoahFieldValue> {
  const input: Record<string, NoahFieldValue> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined || (typeof value === 'string' ? value.trim() === '' : value.length === 0)) continue;
    input[field.name] = value;
  }
  return input;
}
/** 確かめの時に見せる、入力の一覧（項目名と値。値は 200 文字で切る）。 */
export function noahConfirmRows(fields: NoahFormField[], args: Record<string, unknown>): { label: string; value: string }[] {
  const show = (value: unknown) => {
    const text = Array.isArray(value) ? value.map(String).join('、') : typeof value === 'boolean' ? (value ? 'はい' : 'いいえ') : String(value as NoahFormValue);
    const chars = Array.from(text);
    return chars.length > 200 ? `${chars.slice(0, 200).join('')}…` : text;
  };
  return fields.filter((field) => Object.hasOwn(args, field.name)).map((field) => ({ label: field.label, value: show(args[field.name]) }));
}

const seconds = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`; };
/**
 * 「止めています…」が、これより長く続いた依頼には、「止める」をもう一度出す（数値は候補）。
 * 実行の場が持つ時間（30 秒）と、その後の待ち（5 秒）より長い。ここまで続くのは、実行の場が無くなった時だけなので、押すと、その場で止まる
 * （巡回の後始末が先に片付けていれば、押す前に「止めました。」になっている）。
 */
export const NOAH_ASK_STOP_AGAIN_MS = 45_000;
/** 仕事の行の文と、止められるか。 */
export function noahAskRowView(ask: Pick<NoahAskItem, 'state' | 'stopRequested' | 'error' | 'createdAt' | 'updatedAt' | 'delivery'>, now: number): { text: string; stoppable: boolean; done: boolean } {
  if (ask.state === 'queued') return { text: ask.stopRequested ? '止めています…' : '順番を待っています', stoppable: !ask.stopRequested, done: false };
  if (ask.state === 'running') {
    if (!ask.stopRequested) return { text: `進んでいます（${seconds(now - ask.createdAt)}）`, stoppable: true, done: false };
    return { text: '止めています…（相手のサーバーで始まっていれば、止められません）', stoppable: now - ask.updatedAt > NOAH_ASK_STOP_AGAIN_MS, done: false };
  }
  if(ask.delivery==='missing_image')return {text:'画像が未受取',stoppable:false,done:true};
  if (ask.state === 'succeeded') return { text: NOAH_ASK_TEXT.received, stoppable: false, done: true };
  if (ask.state === 'failed') return { text: `できませんでした。${ask.error ?? ''}`, stoppable: false, done: true };
  if (ask.state === 'stopped') return { text: ask.error ?? '止めました。', stoppable: false, done: true };
  return { text: ask.error ?? '結果を確かめられませんでした。相手のサーバーで実行されたかは分かりません。', stoppable: false, done: true };
}
/** 成果の先頭（行で数える）。more は、続きがある。 */
export function noahResultPreview(text: string, lines = 3): { text: string; more: boolean } {
  const all = text.split(/\r?\n/), head = all.slice(0, lines).join('\n');
  const chars = Array.from(head);
  return chars.length > 400 ? { text: `${chars.slice(0, 400).join('')}…`, more: true } : { text: head, more: all.length > lines };
}
/**
 * 成果の文を、文字の所と、リンクにする所に分ける。リンクにするのは `https://` で始まる所だけ。行き先の host を、横に書く。
 * 文の終わりの句読点と閉じ括弧は、リンクに入れない。ASCII でない文字を含む行き先は、その手前までをリンクにする。
 */
export function noahLinkParts(text: string): ({ text: string } | { href: string; host: string })[] {
  const parts: ({ text: string } | { href: string; host: string })[] = [];
  let last = 0;
  // 行き先は、空白・引用符・山括弧・ASCII でない文字（全角の括弧や句読点）の手前まで。
  for (const match of text.matchAll(/https:\/\/[^\s<>"'`\u0080-\uffff]+/g)) {
    const raw = match[0].replace(/[),.\]]+$/, ''), start = match.index ?? 0;
    let host: string;
    try { host = new URL(raw).hostname; } catch { continue; }
    if (!host) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ href: raw, host });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
