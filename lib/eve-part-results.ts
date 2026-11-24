/**
 * Eve が作った部品: 成果・売上を読む（能力 tracking.results）。task 130、2026-11-24。
 *
 * 2026-11-24 の確かめで、Noah の一覧にこの能力をこなせるエージェントが 0 件だった（data/eve-verifications/2026-11-24.json）。
 * そこで Eve が作る。LLM は使わない決まった式で、ASP の管理画面から本人が書き出した CSV を読み、件数と金額を数える。
 * ASP へのログイン・書き出しは本人の工程（パスワードは本人だけ）。この部品は、渡された CSV の文字だけを読む。外へ通信しない。
 *
 * 読める形（見出しの行で決める。どれにも当たらなければ読まずに失敗を返す。推量で列を当てない）:
 * - daily: 日ごとの集計（日付・クリック・発生・承認・承認報酬）。見本の仕事と同じ形。
 * - rentracks: レントラックスの売上一覧（toolkits/noah-affiliate-agents/business-rentracks.mjs と同じ見出し）。1 行 1 成果で、状況（承認・未承認・拒否）と報酬額を持つ。クリックの列は無い（clicks は null）。
 */

export const EVE_PART_RESULTS_REF = 'eve-part:results-csv';

export type EveResultsFormat = 'daily' | 'rentracks';
export type EveResults = {
  format: EveResultsFormat;
  /** クリックの数。売上一覧のようにクリックの列が無い形は null（0 と測っていないを混ぜない）。 */
  clicks: number | null;
  /** 発生した成果の数（承認・未承認・拒否の合計）。 */
  occurred: number;
  approved: number;
  pending: number;
  rejected: number;
  approvedYen: number;
  pendingYen: number;
  currency: 'JPY';
  rows: number;
  from: string | null;
  to: string | null;
};

const MAX_BYTES = 2_000_000;
const MAX_ROWS = 50_000;

/** CSV を行と列に分ける（引用符・引用符の中のカンマと改行・BOM・CRLF に対応）。 */
export function eveParseCsv(text: string): string[][] {
  if (text.length > MAX_BYTES) throw new Error('CSV が大きすぎます（2 MB まで）。');
  const s = text.replace(/^﻿/u, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
      if (rows.length > MAX_ROWS + 1) throw new Error(`行が多すぎます（${MAX_ROWS} 行まで）。`);
    } else cell += c;
  }
  if (quoted) throw new Error('引用符が閉じていません。');
  row.push(cell);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

/** 金額・件数を整数にする（「8,000」「¥8,000」「8000円」「－」）。読めなければ投げる。 */
function int(value: string | undefined, label: string): number {
  const v = (value ?? '').normalize('NFKC').replace(/[¥,円\s]/gu, '');
  if (v === '' || v === '-' || v === '−' || v === 'ー') return 0;
  if (!/^-?\d+$/u.test(v)) throw new Error(`「${label}」の値が数ではありません（${value}）。`);
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`「${label}」の値が範囲の外です（${value}）。`);
  return n;
}
const day = (value: string | undefined) => {
  const m = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/u.exec((value ?? '').normalize('NFKC').trim());
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
};
const span = (days: (string | null)[]) => {
  const ok = days.filter((d): d is string => d !== null).sort();
  return { from: ok[0] ?? null, to: ok.at(-1) ?? null };
};

const DAILY = ['日付', 'クリック', '発生', '承認', '承認報酬'] as const;
const RENTRACKS = ['売上日時', '売上番号', '報酬額', '状況'] as const;

/** 見出しから形を決める。どれにも当たらなければ null。 */
export function eveResultsFormat(header: readonly string[]): EveResultsFormat | null {
  const h = header.map((v) => v.normalize('NFKC').trim());
  if (DAILY.every((k) => h.includes(k))) return 'daily';
  if (RENTRACKS.every((k) => h.includes(k))) return 'rentracks';
  return null;
}

/** 成果・売上を読む。input.csv（組み合わせの中では素材の名前「成果の CSV」）に CSV の文字。通貨は円だけ。 */
export function eveReadResults(input: { csv?: unknown; currency?: unknown; '成果の CSV'?: unknown }): EveResults {
  const csv = input.csv ?? input['成果の CSV'];
  if (typeof csv !== 'string' || !csv.trim()) throw new Error('CSV の文字がありません。');
  if (input.currency !== undefined && input.currency !== 'JPY') throw new Error('通貨は円（JPY）だけを読みます。');
  const [header, ...body] = eveParseCsv(csv);
  const format = header ? eveResultsFormat(header) : null;
  if (!header || !format) throw new Error('見出しの行が、読める形（日ごとの集計・レントラックスの売上一覧）のどれにも当たりません。');
  const col = (name: string) => header.findIndex((v) => v.normalize('NFKC').trim() === name);
  if (format === 'daily') {
    const at = Object.fromEntries(DAILY.map((k) => [k, col(k)])) as Record<(typeof DAILY)[number], number>;
    let clicks = 0, occurred = 0, approved = 0, approvedYen = 0;
    for (const r of body) {
      clicks += int(r[at['クリック']], 'クリック');
      occurred += int(r[at['発生']], '発生');
      approved += int(r[at['承認']], '承認');
      approvedYen += int(r[at['承認報酬']], '承認報酬');
    }
    if (approved > occurred) throw new Error('承認の数が発生の数より多い行があります。元の CSV を確かめてください。');
    return { format, clicks, occurred, approved, pending: occurred - approved, rejected: 0, approvedYen, pendingYen: 0, currency: 'JPY', rows: body.length, ...span(body.map((r) => day(r[at['日付']]))) };
  }
  const iState = col('状況'), iYen = col('報酬額'), iDay = col('売上日時'), iId = col('売上番号');
  const seen = new Set<string>();
  let approved = 0, pending = 0, rejected = 0, approvedYen = 0, pendingYen = 0;
  for (const r of body) {
    const id = (r[iId] ?? '').trim();
    if (!id) throw new Error('売上番号の無い行があります。');
    if (seen.has(id)) throw new Error(`同じ売上番号（${id}）が 2 回あります。`);
    seen.add(id);
    const state = (r[iState] ?? '').normalize('NFKC').trim();
    const yen = int(r[iYen], '報酬額');
    if (state === '承認') { approved++; approvedYen += yen; }
    else if (state === '拒否' || state === '否認' || state === 'キャンセル') rejected++;
    else if (state === '未承認' || state === '保留' || state === '発生') { pending++; pendingYen += yen; }
    else throw new Error(`状況「${state}」は読めません（承認・未承認・拒否のどれか）。`);
  }
  return { format, clicks: null, occurred: approved + pending + rejected, approved, pending, rejected, approvedYen, pendingYen, currency: 'JPY', rows: body.length, ...span(body.map((r) => day(r[iDay]))) };
}
