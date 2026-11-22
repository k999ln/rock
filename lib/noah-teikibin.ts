/**
 * 定期便の台帳の、通信も保存もしない部分（task 123。仕様: docs/noah/spec-123-teikibin-ledger.md）。
 *
 * - 切り替えの読み方（NOAH_TEIKIBIN・NOAH_TEIKIBIN_KEY）、月の扱い（日本時間の暦の月）、入力の検査。
 * - 受け取り番号と、確かめた身元の鍵（HMAC。生の口座番号・回線番号は残さない）。
 * - 締めの計算。分け方は lib/sky-company-order.ts の settleCompanyOrder を、その月の合計で 1 回呼ぶ（新しい式は作らない）。
 *   その後に、有料の差し引き（等分が値段以上の時だけ）と、渡し方（現金か定期便か）を決める。
 * - お金は送らない。振込は運営が行い、台帳には結果だけを書く（AGENTS.md §6）。
 */
import { NoahAgentError } from './noah-agent-upload.ts';
import {
  basicIncomeCoverage,
  CompanyOrderError,
  settleCompanyOrder,
  type CompanyOrderSettlement,
} from './sky-company-order.ts';

export const TEIKIBIN_ENTRY_KINDS = ['income', 'refund', 'platform_fee', 'direct_cost', 'creator_share'] as const;
export type TeikibinEntryKind = (typeof TEIKIBIN_ENTRY_KINDS)[number];
export const TEIKIBIN_SOURCES = ['coconala', 'noah', 'cloud', 'ai', 'bank', 'other'] as const;
export type TeikibinSource = (typeof TEIKIBIN_SOURCES)[number];
export const TEIKIBIN_CONTRIBUTION_KINDS = ['compute', 'judgment', 'referral'] as const;
export type TeikibinContributionKind = (typeof TEIKIBIN_CONTRIBUTION_KINDS)[number];
export const TEIKIBIN_METHODS = ['bank_account', 'esim_line'] as const;
export type TeikibinMethod = (typeof TEIKIBIN_METHODS)[number];
export const TEIKIBIN_FORMS = ['cash', 'goods'] as const;
export type TeikibinForm = (typeof TEIKIBIN_FORMS)[number];
export type TeikibinPayoutState = 'none' | 'pending' | 'held' | 'paid';
export type TeikibinGoodsState = 'none' | 'pending' | 'assigned';

/** 数の上限（仕様書の R17 と 8 章）。 */
export const TEIKIBIN_LIMITS = {
  /** 1 か月に等分を受けられる人の数。 */
  people: 5000,
  /** 1 か月の、種類ごとの記録（入金・費用）と、寄与の行の数。 */
  rows: 5000,
  /** 書き込みの本文の大きさ（byte）。 */
  body: 4096,
  /** 利用者の画面に出す、締めた月の数。 */
  monthsShown: 24,
  /** 運営の画面の、受け取る人の一覧の 1 頁。 */
  peoplePage: 200,
  /** 運営の画面の、人ごとの結果の 1 頁。 */
  payoutsPage: 500,
  /** 記録できる最初の月。 */
  firstMonth: '2026-01',
  /** 締めの行を書く時の、1 文の人数と、1 回の batch の文の数（D1 の 1 文 100 個・1 回 50 文の上限の内）。 */
  rowsPerStatement: 9,
  statementsPerBatch: 45,
} as const;

/** 入金と費用の種類の、画面の言葉（運営の画面）。 */
export const TEIKIBIN_KIND_LABELS: Record<TeikibinEntryKind, string> = {
  income: '入金',
  refund: '返金',
  platform_fee: '手数料',
  direct_cost: '実費',
  creator_share: '作った人の分',
};
export const TEIKIBIN_SOURCE_LABELS: Record<TeikibinSource, string> = {
  coconala: 'ココナラ',
  noah: 'Noah',
  cloud: 'クラウド',
  ai: 'AI',
  bank: '銀行',
  other: 'その他',
};
export const TEIKIBIN_CONTRIBUTION_LABELS: Record<TeikibinContributionKind, string> = {
  compute: '計算資源',
  judgment: '人の確認',
  referral: '紹介',
};

// ---------------------------------------------------------------------------
// 切り替え
// ---------------------------------------------------------------------------

export type NoahTeikibinFlags = {
  /** NOAH_TEIKIBIN: 利用者の画面と申し込みを開ける。閉じている間は、審査者だけが使える。 */
  open: boolean;
  /** NOAH_TEIKIBIN_KEY: 身元の HMAC の鍵（32 文字以上）。無ければ、受け取る人を確かめられない。 */
  key: string | null;
  /** 読めなかった値の説明。運営の画面に出す。 */
  warnings: string[];
};

export function parseNoahTeikibinFlags(env: Record<string, string | undefined>): NoahTeikibinFlags {
  const warnings: string[] = [];
  const raw = env.NOAH_TEIKIBIN;
  if (raw !== undefined && raw !== '' && raw !== 'true' && raw !== 'false') {
    warnings.push('NOAH_TEIKIBIN は true か false です。閉じた物として扱います。');
  }
  const key = env.NOAH_TEIKIBIN_KEY ?? '';
  if (key !== '' && key.length < 32) {
    warnings.push('NOAH_TEIKIBIN_KEY は 32 文字以上にしてください。受け取る人を確かめられません。');
  }
  return { open: raw === 'true', key: key.length >= 32 ? key : null, warnings };
}

// ---------------------------------------------------------------------------
// 月（日本時間の暦の月。YYYY-MM）
// ---------------------------------------------------------------------------

const JST_OFFSET_MS = 9 * 3_600_000;
const MONTH = /^20\d{2}-(?:0[1-9]|1[0-2])$/u;

/** その時刻の、日本時間の月。 */
export function teikibinMonthOf(now: number): string {
  const date = new Date(now + JST_OFFSET_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 前の月。 */
export function teikibinPreviousMonth(month: string): string {
  const year = Number(month.slice(0, 4)), number = Number(month.slice(5, 7));
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

/** 記録できる月か（2026-01 から今の月まで。R4）。 */
export function teikibinMonth(value: unknown, now: number): string {
  if (typeof value !== 'string' || !MONTH.test(value) || value < TEIKIBIN_LIMITS.firstMonth || value > teikibinMonthOf(now)) {
    throw new NoahAgentError('月を確かめてください。');
  }
  return value;
}

// ---------------------------------------------------------------------------
// 入力の検査
// ---------------------------------------------------------------------------

function integer(value: unknown, min: number, max: number, message: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new NoahAgentError(message);
  return value;
}

/** 文字の欄。NFKC にそろえ、前後の空白を除く。制御文字は受けない。 */
function plain(value: unknown, min: number, max: number, message: string): string {
  if (typeof value !== 'string') throw new NoahAgentError(message);
  const text = value.normalize('NFKC').trim();
  if (text.length < min || text.length > max) throw new NoahAgentError(message);
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) throw new NoahAgentError(message);
  }
  return text;
}

export const teikibinAmount = (value: unknown) =>
  integer(value, 1, 1_000_000_000, '金額は 1 円以上 10 億円以下の整数で入力してください。');
export const teikibinBps = (value: unknown, label: string) =>
  integer(value, 0, 10_000, `${label}は 0 以上 10000 以下（1万分率）で入力してください。`);
export const teikibinPrice = (value: unknown): number | null =>
  value === null ? null : integer(value, 1, 1_000_000, '有料の値段は 1 円以上 100 万円以下の整数か、空にしてください。');
export const teikibinUnits = (value: unknown) =>
  integer(value, 0, 100_000_000, '検収に通った量は 0 以上 1 億以下の整数で入力してください。');
export const teikibinRate = (value: unknown) =>
  integer(value, 0, 1_000_000, '単価は 0 円以上 100 万円以下の整数で入力してください。');
export const teikibinReference = (value: unknown) => plain(value, 3, 120, '番号は 3〜120 文字で入力してください。');
export const teikibinNote = (value: unknown) =>
  value === undefined || value === '' ? '' : plain(value, 1, 200, 'メモは 200 文字までです。');
export const teikibinReason = (value: unknown) => plain(value, 2, 200, '理由を 2〜200 文字で入力してください。');

export function teikibinOneOf<T extends string>(value: unknown, list: readonly T[], message: string): T {
  if (typeof value !== 'string' || !(list as readonly string[]).includes(value)) throw new NoahAgentError(message);
  return value as T;
}

// ---------------------------------------------------------------------------
// 受け取り番号（8 文字。見間違えやすい I・L・O・0・1 を使わない）
// ---------------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_CHARACTER = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/u;

/** 新しい受け取り番号（例 K7QM-2XPA）。偏りが出ないよう、248 以上の byte は捨てる（31 × 8 = 248）。 */
export function teikibinNewCode(random: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size))): string {
  const picked: string[] = [];
  while (picked.length < 8) {
    for (const byte of random(16)) {
      if (byte < 248 && picked.length < 8) picked.push(CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length));
    }
  }
  return `${picked.slice(0, 4).join('')}-${picked.slice(4).join('')}`;
}

/** 運営が打った受け取り番号を、保存の形（XXXX-XXXX）にそろえる。 */
export function teikibinCode(value: unknown): string {
  if (typeof value !== 'string') throw new NoahAgentError('受け取り番号を確かめてください。');
  const compact = value.normalize('NFKC').toUpperCase().replace(/[\s-]/gu, '');
  if (!CODE_CHARACTER.test(compact)) throw new NoahAgentError('受け取り番号を確かめてください。');
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

// ---------------------------------------------------------------------------
// 身元の鍵（R9）
// ---------------------------------------------------------------------------

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * 確かめた身元（振込先の口座、または eSIM の回線）を、比べられる形にそろえる。
 * 空白とハイフンの違い・全角と半角・大文字と小文字の違いで、同じ口座が別人に見えないようにする。
 */
export function teikibinIdentityText(method: TeikibinMethod, raw: unknown): string {
  const text = plain(raw, 4, 200, '確かめる値を 4〜200 文字で入力してください。').toUpperCase().replace(/[\s\-‐‑‒–—―ー]/gu, '');
  if (text.length < 4) throw new NoahAgentError('確かめる値を 4〜200 文字で入力してください。');
  return `${method}\u0000${text}`;
}

/** 身元の HMAC-SHA256（16 進 64 文字）。生の値は、この関数の外へ出さない。 */
export async function teikibinIdentityKey(key: string, method: TeikibinMethod, raw: unknown): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', material, new TextEncoder().encode(`noah-teikibin-identity-v1\u0000${teikibinIdentityText(method, raw)}`));
  return hex(signature);
}

/** 値の SHA-256（16 進 64 文字）。締めの入力の要約に使う。 */
export async function teikibinDigest(value: unknown): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))));
}

// ---------------------------------------------------------------------------
// 締めの計算（6 章）
// ---------------------------------------------------------------------------

export type TeikibinSums = Record<TeikibinEntryKind, number>;
export const emptyTeikibinSums = (): TeikibinSums => ({ income: 0, refund: 0, platform_fee: 0, direct_cost: 0, creator_share: 0 });

export type TeikibinCloseInput = {
  month: string;
  form: TeikibinForm;
  reserveBps: number;
  dividendBps: number;
  planPriceMinor: number | null;
  sums: TeikibinSums;
  /** 取り消していない寄与。personId は受け取る人の ID。 */
  contributions: readonly { id: string; personId: string; kind: TeikibinContributionKind; units: number; rate: number }[];
  /** 締める時点で確かめてあり、止めていない人。 */
  people: readonly { id: string; planOptIn: boolean }[];
};

export type TeikibinLine = {
  personId: string;
  feeMinor: number;
  dividendMinor: number;
  deductionMinor: number;
  cashMinor: number;
  goodsMinor: number;
  paidPlan: 0 | 1;
  payoutState: 'none' | 'pending';
  goodsState: 'none' | 'pending';
};

export type TeikibinSettlement = Omit<CompanyOrderSettlement, 'lines' | 'recordingAllowed' | 'payoutAllowed'>;

export type TeikibinClose = {
  input: TeikibinCloseInput;
  settlement: TeikibinSettlement;
  lines: TeikibinLine[];
  /** 有料の差し引きの合計（運営に残る）。 */
  deductionsMinor: number;
};

/** 締めの入力を、並びの違いで要約が変わらない形にする。 */
export function teikibinCanonicalInput(input: TeikibinCloseInput) {
  return {
    v: 1,
    month: input.month,
    form: input.form,
    reserveBps: input.reserveBps,
    dividendBps: input.dividendBps,
    planPriceMinor: input.planPriceMinor,
    sums: TEIKIBIN_ENTRY_KINDS.map((kind) => input.sums[kind]),
    contributions: [...input.contributions]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((item) => [item.id, item.personId, item.kind, item.units, item.rate]),
    people: [...input.people]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((person) => [person.id, person.planOptIn ? 1 : 0]),
  };
}

/**
 * その月の合計から、人ごとの結果を決める。
 * 1. settleCompanyOrder: 入金 − 返金 − 手数料 − 実費（作った人の分を含む）− 予備 − 作業料 = 余剰。余剰 × 本人の分の率を、確かめた人で等分。
 * 2. 差し引き: 値段があり、本人が有料を選び、等分が値段以上の時だけ（R7）。
 * 3. 渡し方: 現金の月は、作業料と等分の残りを現金で。定期便の月は、作業料だけ現金で、等分の残りを物で。
 */
export function teikibinClose(input: TeikibinCloseInput): TeikibinClose {
  if (input.people.length > TEIKIBIN_LIMITS.people || input.contributions.length > TEIKIBIN_LIMITS.rows) {
    throw new NoahAgentError('この月の数が上限を超えています。', 409);
  }
  if (input.sums.refund > input.sums.income) {
    throw new NoahAgentError('返金が入金を超えています。締める前に記録を確かめてください。', 409);
  }
  let settled: CompanyOrderSettlement;
  try {
    settled = settleCompanyOrder({
      orderId: `noah-teikibin-${input.month}`,
      cashReceivedMinor: input.sums.income,
      refundsMinor: input.sums.refund,
      platformFeeMinor: input.sums.platform_fee,
      directCostsMinor: input.sums.direct_cost + input.sums.creator_share,
      reserveBps: input.reserveBps,
      dividendBps: input.dividendBps,
      contributions: input.contributions.map((item) => ({
        id: item.id,
        participantRef: item.personId,
        kind: item.kind,
        acceptedUnits: item.units,
        unitRateMinor: item.rate,
      })),
      dividendParticipants: input.people.map((person) => person.id),
    });
  } catch (error) {
    if (error instanceof CompanyOrderError) throw new NoahAgentError(`締めの計算ができません。${error.message}`, 409);
    throw error;
  }
  const optIn = new Map(input.people.map((person) => [person.id, person.planOptIn]));
  const price = input.planPriceMinor;
  const lines = settled.lines.map((line): TeikibinLine => {
    const deductionMinor = price !== null && optIn.get(line.participantRef) === true && line.dividendMinor >= price ? price : 0;
    const rest = line.dividendMinor - deductionMinor;
    const cashMinor = input.form === 'cash' ? line.feeMinor + rest : line.feeMinor;
    const goodsMinor = input.form === 'goods' ? rest : 0;
    return {
      personId: line.participantRef,
      feeMinor: line.feeMinor,
      dividendMinor: line.dividendMinor,
      deductionMinor,
      cashMinor,
      goodsMinor,
      paidPlan: deductionMinor > 0 ? 1 : 0,
      payoutState: cashMinor > 0 ? 'pending' : 'none',
      goodsState: goodsMinor > 0 ? 'pending' : 'none',
    };
  });
  const total = (pick: (line: TeikibinLine) => number) => lines.reduce((sum, line) => sum + pick(line), 0);
  if (total((line) => line.cashMinor + line.goodsMinor + line.deductionMinor) !== total((line) => line.feeMinor + line.dividendMinor)) {
    throw new NoahAgentError('締めの合計が合いません。', 409);
  }
  const { lines: _lines, recordingAllowed: _recording, payoutAllowed: _payout, ...settlement } = settled;
  return { input, settlement, lines, deductionsMinor: total((line) => line.deductionMinor) };
}

// ---------------------------------------------------------------------------
// 約束してよい額（運営の画面だけ。R14）
// ---------------------------------------------------------------------------

/** 締めた月の、等分に回した額（新しい順でも古い順でもよい）から、1 人に毎月約束してよい額。締めた月が無ければ null。 */
export function teikibinCoverage(pools: readonly number[], people: number, targetPerPersonMinor: number) {
  if (!pools.length || people < 1) return null;
  return basicIncomeCoverage({ monthlyDividendPoolsMinor: pools.slice(0, 120), participants: people, targetPerPersonMinor });
}

// ---------------------------------------------------------------------------
// 払い出しの一覧（CSV）
// ---------------------------------------------------------------------------

/** 振込待ちの一覧。Excel で文字が崩れないよう BOM を付ける。番号と月は英数字だけなので、引用符は要らない。 */
export function teikibinPayoutCsv(month: string, rows: readonly { code: string; cashMinor: number }[]): string {
  const lines = ['月,受け取り番号,金額（円）', ...rows.map((row) => `${month},${row.code},${row.cashMinor}`)];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
