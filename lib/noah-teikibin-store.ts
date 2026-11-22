/**
 * 定期便の台帳の読み書き（task 123。仕様: docs/noah/spec-123-teikibin-ledger.md の 4 章・7 章）。
 *
 * 誰が操作してよいか（審査者か・本人か）は、入口（lib/noah-teikibin-api.ts）が決める。ここは、規則（R2〜R13）を守って読み書きするだけ。
 * 締めは、途中で止まっても、同じ操作をもう一度送れば、保存した結果から続ける（7.2 章の 6）。
 * 生の口座番号・回線番号は、ここに来ない（入口で HMAC にしてから渡す）。身元の鍵は、画面へ返さない。
 */
import { NoahAgentError } from './noah-agent-upload.ts';
import {
  TEIKIBIN_LIMITS,
  emptyTeikibinSums,
  teikibinCanonicalInput,
  teikibinClose,
  teikibinCoverage,
  teikibinDigest,
  teikibinMonthOf,
  teikibinNewCode,
  teikibinPayoutCsv,
  teikibinPreviousMonth,
  type TeikibinCloseInput,
  type TeikibinContributionKind,
  type TeikibinEntryKind,
  type TeikibinForm,
  type TeikibinGoodsState,
  type TeikibinLine,
  type TeikibinMethod,
  type TeikibinPayoutState,
  type TeikibinSource,
} from './noah-teikibin.ts';

export type TeikibinDependencies = {
  db: D1Database;
  now: () => number;
  /** 行の ID（試験で差し替える）。 */
  uuid?: () => string;
  /** 受け取り番号の乱数（試験で差し替える）。 */
  random?: (size: number) => Uint8Array;
};

type PersonRow = {
  id: string;
  owner_id: string;
  code: string;
  identity_key: string | null;
  method: TeikibinMethod | null;
  verified_by: string | null;
  verified_at: number | null;
  revoked_at: number | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  plan_opt_in: number;
  created_at: number;
};
type EntryRow = {
  id: string;
  month: string;
  kind: TeikibinEntryKind;
  amount_minor: number;
  source: TeikibinSource;
  reference: string;
  note: string;
  recorded_by: string;
  created_at: number;
  voided_at: number | null;
  voided_by: string | null;
  void_reason: string | null;
};
type ContributionRow = {
  id: string;
  month: string;
  person_id: string;
  kind: TeikibinContributionKind;
  accepted_units: number;
  unit_rate_minor: number;
  reference: string;
  recorded_by: string;
  created_at: number;
  voided_at: number | null;
  voided_by: string | null;
  void_reason: string | null;
  code?: string;
};
type MonthRow = {
  month: string;
  state: 'closing' | 'closed';
  form: TeikibinForm;
  reserve_bps: number;
  dividend_bps: number;
  plan_price_minor: number | null;
  people: number;
  lines: number;
  net_cash_minor: number;
  fees_minor: number;
  reserve_minor: number;
  surplus_minor: number;
  pool_minor: number;
  company_minor: number;
  shortfall_minor: number;
  settlement?: string;
  digest: string;
  closed_by: string;
  started_at: number;
  closed_at: number | null;
};
type LineRow = {
  month: string;
  person_id: string;
  fee_minor: number;
  dividend_minor: number;
  deduction_minor: number;
  cash_minor: number;
  goods_minor: number;
  paid_plan: number;
  payout_state: TeikibinPayoutState;
  payout_ref: string | null;
  paid_by: string | null;
  paid_at: number | null;
  goods_state: TeikibinGoodsState;
  goods_ref: string | null;
  assigned_by: string | null;
  assigned_at: number | null;
  code?: string;
  form?: TeikibinForm;
  month_state?: 'closing' | 'closed';
};

/** 締めた結果の、保存の形（1 人 1 行の配列。並びは settleCompanyOrder の並び＝受け取る人の ID の順）。 */
type SavedLine = [string, number, number, number, number, number, 0 | 1, 'none' | 'pending', 'none' | 'pending'];

export type TeikibinCloseParams = {
  form: TeikibinForm;
  reserveBps: number;
  dividendBps: number;
  planPriceMinor: number | null;
};

const CLOSED_MONTH = '締めた月は変えられません。次の月に調整の行を入れてください。';
const LATER_CLOSED = '後の月が締めてあります。';
const MONTH_RUNNING = '月が終わってから締めてください。';
const TOO_MANY = 'この月の数が上限を超えています。';
const DUPLICATE_REFERENCE = '同じ番号の記録が、違う内容であります。';

/** 受け取る人を、運営の画面へ返す形（身元の鍵は返さない）。 */
export function teikibinPersonView(row: PersonRow) {
  return {
    code: row.code,
    verified: row.verified_at !== null,
    method: row.method,
    verifiedAt: row.verified_at,
    revoked: row.revoked_at !== null,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    planOptIn: row.plan_opt_in === 1,
    createdAt: row.created_at,
  };
}
const entryView = (row: EntryRow) => ({
  id: row.id,
  month: row.month,
  kind: row.kind,
  amountMinor: row.amount_minor,
  source: row.source,
  reference: row.reference,
  note: row.note,
  createdAt: row.created_at,
  voided: row.voided_at !== null,
  voidedAt: row.voided_at,
  voidReason: row.void_reason,
});
const contributionView = (row: ContributionRow) => ({
  id: row.id,
  month: row.month,
  code: row.code ?? null,
  kind: row.kind,
  units: row.accepted_units,
  rateMinor: row.unit_rate_minor,
  feeMinor: row.accepted_units * row.unit_rate_minor,
  reference: row.reference,
  createdAt: row.created_at,
  voided: row.voided_at !== null,
  voidReason: row.void_reason,
});
const monthView = (row: MonthRow) => ({
  month: row.month,
  state: row.state,
  form: row.form,
  reserveBps: row.reserve_bps,
  dividendBps: row.dividend_bps,
  planPriceMinor: row.plan_price_minor,
  people: row.people,
  lines: row.lines,
  netCashMinor: row.net_cash_minor,
  feesMinor: row.fees_minor,
  reserveMinor: row.reserve_minor,
  surplusMinor: row.surplus_minor,
  poolMinor: row.pool_minor,
  companyMinor: row.company_minor,
  shortfallMinor: row.shortfall_minor,
  closedAt: row.closed_at,
});
const lineView = (row: LineRow) => ({
  month: row.month,
  code: row.code ?? null,
  form: row.form ?? null,
  feeMinor: row.fee_minor,
  dividendMinor: row.dividend_minor,
  deductionMinor: row.deduction_minor,
  cashMinor: row.cash_minor,
  goodsMinor: row.goods_minor,
  paidPlan: row.paid_plan === 1,
  payoutState: row.payout_state,
  payoutRef: row.payout_ref,
  paidAt: row.paid_at,
  goodsState: row.goods_state,
  goodsRef: row.goods_ref,
  assignedAt: row.assigned_at,
});
/** 利用者に返す形（振込の番号・割当の ID・運営の名は返さない）。 */
const userLineView = (row: LineRow) => ({
  month: row.month,
  form: row.form ?? 'cash',
  feeMinor: row.fee_minor,
  dividendMinor: row.dividend_minor,
  deductionMinor: row.deduction_minor,
  cashMinor: row.cash_minor,
  goodsMinor: row.goods_minor,
  paidPlan: row.paid_plan === 1,
  payoutState: row.payout_state,
  goodsState: row.goods_state,
  paidAt: row.paid_at,
});

const isUnique = (error: unknown) => /UNIQUE/iu.test(String(error instanceof Error ? error.message : error));

export function createNoahTeikibinStore(deps: TeikibinDependencies) {
  const { db } = deps;
  const now = () => deps.now();
  const uuid = deps.uuid ?? (() => crypto.randomUUID());
  const one = <T>(query: string, ...args: unknown[]) => db.prepare(query).bind(...args).first<T>();
  const all = async <T>(query: string, ...args: unknown[]) => (await db.prepare(query).bind(...args).all<T>()).results ?? [];
  const run = async (query: string, ...args: unknown[]) => Number((await db.prepare(query).bind(...args).run()).meta?.changes ?? 0);

  const personByOwner = (owner: string) => one<PersonRow>('SELECT * FROM noah_teikibin_people WHERE owner_id=?', owner);
  const personByCode = (code: string) => one<PersonRow>('SELECT * FROM noah_teikibin_people WHERE code=?', code);
  const monthRow = (month: string) => one<MonthRow>('SELECT * FROM noah_teikibin_months WHERE month=?', month);
  async function refuseClosed(month: string) {
    if (await one<{ state: string }>('SELECT state FROM noah_teikibin_months WHERE month=?', month)) throw new NoahAgentError(CLOSED_MONTH, 409);
  }
  async function sumsOf(month: string) {
    const sums = emptyTeikibinSums();
    const rows = await all<{ kind: TeikibinEntryKind; total: number }>(
      'SELECT kind, SUM(amount_minor) AS total FROM noah_teikibin_entries WHERE month=? AND voided_at IS NULL GROUP BY kind',
      month,
    );
    for (const row of rows) sums[row.kind] = Number(row.total);
    return sums;
  }
  /** 締めた月の行を、受け取り番号つきで読む。締めの途中の月は読まない。 */
  const lineOf = (month: string, code: string) =>
    one<LineRow>(
      `SELECT l.*, p.code, m.form, m.state AS month_state FROM noah_teikibin_lines l
        JOIN noah_teikibin_people p ON p.id=l.person_id JOIN noah_teikibin_months m ON m.month=l.month
       WHERE l.month=? AND p.code=?`,
      month,
      code,
    );
  async function requireLine(month: string, code: string) {
    const line = await lineOf(month, code);
    if (!line) throw new NoahAgentError('その月の、その受け取り番号の行がありません。', 404);
    if (line.month_state !== 'closed') throw new NoahAgentError('締めの途中です。もう一度「締める」を押してください。', 409);
    return line;
  }

  // -------------------------------------------------------------------------
  // 本人
  // -------------------------------------------------------------------------

  /** 受け取りを申し込む。あれば今の行を返す。受け取り番号がぶつかった時だけ、作り直す。 */
  async function join(owner: string) {
    const existing = await personByOwner(owner);
    if (existing) return existing;
    for (let attempt = 0; attempt < 5; attempt++) {
      await run(
        'INSERT OR IGNORE INTO noah_teikibin_people(id, owner_id, code, plan_opt_in, created_at) VALUES (?, ?, ?, 0, ?)',
        uuid(),
        owner,
        teikibinNewCode(deps.random),
        now(),
      );
      const row = await personByOwner(owner);
      if (row) return row;
    }
    throw new NoahAgentError('受け取り番号を作れませんでした。もう一度試してください。', 503);
  }

  async function setPlan(owner: string, optIn: boolean) {
    const changes = await run('UPDATE noah_teikibin_people SET plan_opt_in=? WHERE owner_id=?', optIn ? 1 : 0, owner);
    if (!changes) throw new NoahAgentError('先に受け取りを申し込んでください。', 409);
    return personByOwner(owner);
  }

  /** 本人の画面。締めた月の実数だけ（R14）。 */
  async function userView(owner: string) {
    const person = await personByOwner(owner);
    const latest = await one<{ plan_price_minor: number | null }>(
      "SELECT plan_price_minor FROM noah_teikibin_months WHERE state='closed' ORDER BY month DESC LIMIT 1",
    );
    const months = person
      ? await all<LineRow>(
          `SELECT l.*, m.form FROM noah_teikibin_lines l JOIN noah_teikibin_months m ON m.month=l.month
            WHERE l.person_id=? AND m.state='closed' ORDER BY l.month DESC LIMIT ?`,
          person.id,
          TEIKIBIN_LIMITS.monthsShown,
        )
      : [];
    return {
      person: person
        ? { code: person.code, verified: person.verified_at !== null, revoked: person.revoked_at !== null, planOptIn: person.plan_opt_in === 1 }
        : null,
      months: months.map(userLineView),
      planPriceMinor: latest?.plan_price_minor ?? null,
    };
  }

  /** 有料かどうか（8.4 章）。日本時間で前の月に、締めて差し引いた本人だけが有料。 */
  async function paidPlan(owner: string): Promise<boolean> {
    const previous = teikibinPreviousMonth(teikibinMonthOf(now()));
    const row = await one<{ paid_plan: number }>(
      `SELECT l.paid_plan FROM noah_teikibin_lines l
        JOIN noah_teikibin_people p ON p.id=l.person_id JOIN noah_teikibin_months m ON m.month=l.month
       WHERE p.owner_id=? AND l.month=? AND m.state='closed' AND p.revoked_at IS NULL`,
      owner,
      previous,
    );
    return row?.paid_plan === 1;
  }

  // -------------------------------------------------------------------------
  // 入金と費用（R2・R3・R17）
  // -------------------------------------------------------------------------

  async function addEntry(
    owner: string,
    input: { month: string; kind: TeikibinEntryKind; amount: number; source: TeikibinSource; reference: string; note: string },
  ) {
    const same = () => one<EntryRow>('SELECT * FROM noah_teikibin_entries WHERE kind=? AND reference=? AND voided_at IS NULL', input.kind, input.reference);
    const answerSame = (row: EntryRow) => {
      if (row.month === input.month && row.amount_minor === input.amount && row.source === input.source && row.note === input.note) return entryView(row);
      throw new NoahAgentError(DUPLICATE_REFERENCE, 409);
    };
    await refuseClosed(input.month);
    const existing = await same();
    if (existing) return answerSame(existing);
    const id = uuid();
    let changes = 0;
    try {
      changes = await run(
        `INSERT INTO noah_teikibin_entries(id, month, kind, amount_minor, source, reference, note, recorded_by, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM noah_teikibin_months WHERE month=?)
            AND (SELECT COUNT(*) FROM noah_teikibin_entries WHERE month=? AND kind=? AND voided_at IS NULL) < ?`,
        id, input.month, input.kind, input.amount, input.source, input.reference, input.note, owner, now(),
        input.month, input.month, input.kind, TEIKIBIN_LIMITS.rows,
      );
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
    if (!changes) {
      await refuseClosed(input.month);
      const raced = await same();
      if (raced) return answerSame(raced);
      throw new NoahAgentError(TOO_MANY, 409);
    }
    return entryView((await one<EntryRow>('SELECT * FROM noah_teikibin_entries WHERE id=?', id))!);
  }

  async function voidEntry(owner: string, id: string, reason: string) {
    const row = await one<EntryRow>('SELECT * FROM noah_teikibin_entries WHERE id=?', id);
    if (!row) throw new NoahAgentError('記録が見つかりません。', 404);
    if (row.voided_at !== null) return entryView(row);
    await refuseClosed(row.month);
    const changes = await run(
      `UPDATE noah_teikibin_entries SET voided_at=?, voided_by=?, void_reason=?
        WHERE id=? AND voided_at IS NULL AND NOT EXISTS (SELECT 1 FROM noah_teikibin_months m WHERE m.month=noah_teikibin_entries.month)`,
      now(), owner, reason, id,
    );
    if (!changes) await refuseClosed(row.month);
    return entryView((await one<EntryRow>('SELECT * FROM noah_teikibin_entries WHERE id=?', id))!);
  }

  // -------------------------------------------------------------------------
  // 寄与（作業料の元）
  // -------------------------------------------------------------------------

  async function addContribution(
    owner: string,
    input: { month: string; code: string; kind: TeikibinContributionKind; units: number; rate: number; reference: string },
  ) {
    await refuseClosed(input.month);
    const person = await personByCode(input.code);
    if (!person) throw new NoahAgentError('受け取り番号が見つかりません。', 404);
    if (person.verified_at === null || person.revoked_at !== null) throw new NoahAgentError('確かめた人にだけ、寄与を記録できます。', 409);
    const same = () => one<ContributionRow>('SELECT * FROM noah_teikibin_contributions WHERE reference=? AND voided_at IS NULL', input.reference);
    const answerSame = (row: ContributionRow) => {
      if (row.month === input.month && row.person_id === person.id && row.kind === input.kind && row.accepted_units === input.units && row.unit_rate_minor === input.rate) {
        return contributionView({ ...row, code: person.code });
      }
      throw new NoahAgentError(DUPLICATE_REFERENCE, 409);
    };
    const existing = await same();
    if (existing) return answerSame(existing);
    const id = uuid();
    let changes = 0;
    try {
      changes = await run(
        `INSERT INTO noah_teikibin_contributions(id, month, person_id, kind, accepted_units, unit_rate_minor, reference, recorded_by, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM noah_teikibin_months WHERE month=?)
            AND (SELECT COUNT(*) FROM noah_teikibin_contributions WHERE month=? AND voided_at IS NULL) < ?`,
        id, input.month, person.id, input.kind, input.units, input.rate, input.reference, owner, now(),
        input.month, input.month, TEIKIBIN_LIMITS.rows,
      );
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
    if (!changes) {
      await refuseClosed(input.month);
      const raced = await same();
      if (raced) return answerSame(raced);
      throw new NoahAgentError(TOO_MANY, 409);
    }
    return contributionView({ ...(await one<ContributionRow>('SELECT * FROM noah_teikibin_contributions WHERE id=?', id))!, code: person.code });
  }

  async function voidContribution(owner: string, id: string, reason: string) {
    const row = await one<ContributionRow>(
      'SELECT c.*, p.code FROM noah_teikibin_contributions c JOIN noah_teikibin_people p ON p.id=c.person_id WHERE c.id=?',
      id,
    );
    if (!row) throw new NoahAgentError('記録が見つかりません。', 404);
    if (row.voided_at !== null) return contributionView(row);
    await refuseClosed(row.month);
    const changes = await run(
      `UPDATE noah_teikibin_contributions SET voided_at=?, voided_by=?, void_reason=?
        WHERE id=? AND voided_at IS NULL AND NOT EXISTS (SELECT 1 FROM noah_teikibin_months m WHERE m.month=noah_teikibin_contributions.month)`,
      now(), owner, reason, id,
    );
    if (!changes) await refuseClosed(row.month);
    return contributionView({ ...row, voided_at: now(), void_reason: reason });
  }

  // -------------------------------------------------------------------------
  // 受け取る人（R8・R9）
  // -------------------------------------------------------------------------

  /** 確かめる。identityKey は入口で作った HMAC（生の値は来ない）。 */
  async function verify(owner: string, code: string, method: TeikibinMethod, identityKey: string) {
    const taken = method === 'esim_line' ? 'この回線は、もう別の受け取り番号で確かめてあります。' : 'この口座は、もう別の受け取り番号で確かめてあります。';
    const person = await personByCode(code);
    if (!person) throw new NoahAgentError('受け取り番号が見つかりません。', 404);
    if (person.revoked_at !== null) throw new NoahAgentError('この受け取り番号は止めてあります。', 409);
    if (person.identity_key !== null) {
      if (person.identity_key === identityKey && person.method === method) return teikibinPersonView(person);
      throw new NoahAgentError('この受け取り番号は、もう確かめてあります。', 409);
    }
    if (await one<{ code: string }>('SELECT code FROM noah_teikibin_people WHERE identity_key=? AND revoked_at IS NULL', identityKey)) {
      throw new NoahAgentError(taken, 409);
    }
    let changes = 0;
    try {
      changes = await run(
        'UPDATE noah_teikibin_people SET identity_key=?, method=?, verified_by=?, verified_at=? WHERE id=? AND identity_key IS NULL AND revoked_at IS NULL',
        identityKey, method, owner, now(), person.id,
      );
    } catch (error) {
      if (isUnique(error)) throw new NoahAgentError(taken, 409);
      throw error;
    }
    if (!changes) throw new NoahAgentError('受け取る人の状態が変わりました。再読込してください。', 409);
    return teikibinPersonView((await personByCode(code))!);
  }

  async function revoke(owner: string, code: string, reason: string) {
    const person = await personByCode(code);
    if (!person) throw new NoahAgentError('受け取り番号が見つかりません。', 404);
    if (person.revoked_at === null) {
      await run('UPDATE noah_teikibin_people SET revoked_at=?, revoked_by=?, revoke_reason=? WHERE id=? AND revoked_at IS NULL', now(), owner, reason, person.id);
    }
    return teikibinPersonView((await personByCode(code))!);
  }

  async function people(after: string) {
    const rows = await all<PersonRow>('SELECT * FROM noah_teikibin_people WHERE code>? ORDER BY code LIMIT ?', after, TEIKIBIN_LIMITS.peoplePage);
    return { people: rows.map(teikibinPersonView), next: rows.length === TEIKIBIN_LIMITS.peoplePage ? rows.at(-1)!.code : null };
  }

  // -------------------------------------------------------------------------
  // 月の記録と締め（R3・R5・R6・R13・7.2 章）
  // -------------------------------------------------------------------------

  async function monthDetail(month: string) {
    const [entries, contributions, closed, sums] = await Promise.all([
      all<EntryRow>('SELECT * FROM noah_teikibin_entries WHERE month=? ORDER BY created_at DESC, id LIMIT 500', month),
      all<ContributionRow>(
        'SELECT c.*, p.code FROM noah_teikibin_contributions c JOIN noah_teikibin_people p ON p.id=c.person_id WHERE c.month=? ORDER BY c.created_at DESC, c.id LIMIT 500',
        month,
      ),
      monthRow(month),
      sumsOf(month),
    ]);
    return {
      month,
      entries: entries.map(entryView),
      contributions: contributions.map(contributionView),
      sums,
      close: closed ? monthView(closed) : null,
    };
  }

  async function closeInput(month: string, params: TeikibinCloseParams): Promise<TeikibinCloseInput> {
    const [sums, contributions, verified] = await Promise.all([
      sumsOf(month),
      all<ContributionRow>('SELECT * FROM noah_teikibin_contributions WHERE month=? AND voided_at IS NULL ORDER BY id LIMIT ?', month, TEIKIBIN_LIMITS.rows + 1),
      all<PersonRow>(
        'SELECT id, plan_opt_in FROM noah_teikibin_people WHERE verified_at IS NOT NULL AND revoked_at IS NULL ORDER BY id LIMIT ?',
        TEIKIBIN_LIMITS.people + 1,
      ),
    ]);
    return {
      month,
      ...params,
      sums,
      contributions: contributions.map((row) => ({ id: row.id, personId: row.person_id, kind: row.kind, units: row.accepted_units, rate: row.unit_rate_minor })),
      people: verified.map((row) => ({ id: row.id, planOptIn: row.plan_opt_in === 1 })),
    };
  }

  async function problemsOf(month: string) {
    const problems: string[] = [];
    if (month >= teikibinMonthOf(now())) problems.push(MONTH_RUNNING);
    if (await one<{ later: number }>('SELECT 1 AS later FROM noah_teikibin_months WHERE month>? LIMIT 1', month)) problems.push(LATER_CLOSED);
    const existing = await monthRow(month);
    if (existing?.state === 'closed') problems.push('この月はもう締めてあります。');
    if (existing?.state === 'closing') problems.push('締めの途中です。もう一度「締める」を押してください。');
    return problems;
  }

  /** 締めの下書き。書かない（7.2 章の 1）。 */
  async function preview(month: string, params: TeikibinCloseParams) {
    const input = await closeInput(month, params);
    const result = teikibinClose(input);
    const digest = await teikibinDigest(teikibinCanonicalInput(input));
    const sample = result.lines.slice(0, 50);
    const codes = new Map(
      sample.length
        ? (await all<{ id: string; code: string }>(
            `SELECT id, code FROM noah_teikibin_people WHERE id IN (${sample.map(() => '?').join(',')})`,
            ...sample.map((line) => line.personId),
          )).map((row) => [row.id, row.code])
        : [],
    );
    return {
      month,
      digest,
      problems: await problemsOf(month),
      sums: input.sums,
      settlement: result.settlement,
      deductionsMinor: result.deductionsMinor,
      people: input.people.length,
      lines: result.lines.length,
      sample: sample.map((line) => ({ code: codes.get(line.personId) ?? null, ...withoutPerson(line) })),
    };
  }

  /** 締める。途中で止まっていれば、保存した結果から続ける（7.2 章）。 */
  async function close(owner: string, month: string, params: TeikibinCloseParams, digest: string) {
    let row = await monthRow(month);
    if (row?.state === 'closed') throw new NoahAgentError('この月はもう締めてあります。', 409);
    if (!row) {
      if (month >= teikibinMonthOf(now())) throw new NoahAgentError(MONTH_RUNNING, 409);
      if (await one<{ later: number }>('SELECT 1 AS later FROM noah_teikibin_months WHERE month>? LIMIT 1', month)) throw new NoahAgentError(LATER_CLOSED, 409);
      const input = await closeInput(month, params);
      const result = teikibinClose(input);
      if ((await teikibinDigest(teikibinCanonicalInput(input))) !== digest) {
        throw new NoahAgentError('記録が変わりました。もう一度、下書きを見てください。', 409);
      }
      const saved: SavedLine[] = result.lines.map((line) => [
        line.personId, line.feeMinor, line.dividendMinor, line.deductionMinor, line.cashMinor, line.goodsMinor, line.paidPlan, line.payoutState, line.goodsState,
      ]);
      const settlement = JSON.stringify({
        v: 1,
        input: teikibinCanonicalInput(input),
        settlement: result.settlement,
        deductionsMinor: result.deductionsMinor,
        lines: saved,
      });
      const s = result.settlement;
      // 後の月が締めてあれば書かない（R5。下書きを見た後に、別の操作で後の月が締められた時）。
      await run(
        `INSERT OR IGNORE INTO noah_teikibin_months(month, state, form, reserve_bps, dividend_bps, plan_price_minor, people, lines,
           net_cash_minor, fees_minor, reserve_minor, surplus_minor, pool_minor, company_minor, shortfall_minor, settlement, digest, closed_by, started_at)
         SELECT ?, 'closing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM noah_teikibin_months WHERE month>?)`,
        month, params.form, params.reserveBps, params.dividendBps, params.planPriceMinor, input.people.length, saved.length,
        s.netCashMinor, s.feesMinor, s.reserveMinor, s.surplusMinor, s.dividendPoolMinor, s.companyMinor, s.companyShortfallMinor,
        settlement, digest, owner, now(), month,
      );
      row = await monthRow(month);
      if (!row) throw new NoahAgentError(LATER_CLOSED, 409);
      if (row.state === 'closed') return monthView(row);
    }
    // 人ごとの結果を書く。INSERT OR IGNORE なので、やり直しても 2 重にならない。
    const lines = (JSON.parse(row.settlement ?? '{"lines":[]}') as { lines: SavedLine[] }).lines;
    const statements: D1PreparedStatement[] = [];
    for (let index = 0; index < lines.length; index += TEIKIBIN_LIMITS.rowsPerStatement) {
      const chunk = lines.slice(index, index + TEIKIBIN_LIMITS.rowsPerStatement);
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO noah_teikibin_lines(month, person_id, fee_minor, dividend_minor, deduction_minor, cash_minor, goods_minor, paid_plan, payout_state, goods_state)
             VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
          )
          .bind(...chunk.flatMap((line) => [month, ...line])),
      );
    }
    for (let index = 0; index < statements.length; index += TEIKIBIN_LIMITS.statementsPerBatch) {
      await db.batch(statements.slice(index, index + TEIKIBIN_LIMITS.statementsPerBatch));
    }
    await run(
      `UPDATE noah_teikibin_months SET state='closed', closed_at=?
        WHERE month=? AND state='closing' AND (SELECT COUNT(*) FROM noah_teikibin_lines WHERE month=?)=noah_teikibin_months.lines`,
      now(), month, month,
    );
    const done = (await monthRow(month))!;
    if (done.state !== 'closed') throw new NoahAgentError('締めの行を書けませんでした。もう一度「締める」を押してください。', 503);
    return monthView(done);
  }

  // -------------------------------------------------------------------------
  // 払い出しと定期便（R10・R11・R12）
  // -------------------------------------------------------------------------

  async function payouts(month: string) {
    const rows = await all<LineRow>(
      `SELECT l.*, p.code, m.form FROM noah_teikibin_lines l
        JOIN noah_teikibin_people p ON p.id=l.person_id JOIN noah_teikibin_months m ON m.month=l.month
       WHERE l.month=? ORDER BY p.code LIMIT ?`,
      month,
      TEIKIBIN_LIMITS.payoutsPage,
    );
    return rows.map(lineView);
  }

  async function exportCsv(month: string) {
    if (!(await one<{ ok: number }>("SELECT 1 AS ok FROM noah_teikibin_months WHERE month=? AND state='closed'", month))) {
      throw new NoahAgentError('この月はまだ締めていません。', 404);
    }
    const rows = await all<{ code: string; cash_minor: number }>(
      `SELECT p.code, l.cash_minor FROM noah_teikibin_lines l JOIN noah_teikibin_people p ON p.id=l.person_id
        WHERE l.month=? AND l.payout_state='pending' ORDER BY p.code`,
      month,
    );
    return teikibinPayoutCsv(month, rows.map((row) => ({ code: row.code, cashMinor: row.cash_minor })));
  }

  async function markPaid(owner: string, month: string, code: string, payoutRef: string) {
    const line = await requireLine(month, code);
    if (line.payout_state === 'paid' && line.payout_ref === payoutRef) return lineView(line);
    if (line.payout_state !== 'pending') throw new NoahAgentError('この行は、振込待ちではありません。', 409);
    const used = 'この振込の番号は、もう使われています。';
    if (await one<{ used: number }>('SELECT 1 AS used FROM noah_teikibin_lines WHERE payout_ref=?', payoutRef)) throw new NoahAgentError(used, 409);
    let changes = 0;
    try {
      changes = await run(
        "UPDATE noah_teikibin_lines SET payout_state='paid', payout_ref=?, paid_by=?, paid_at=? WHERE month=? AND person_id=? AND payout_state='pending'",
        payoutRef, owner, now(), month, line.person_id,
      );
    } catch (error) {
      if (isUnique(error)) throw new NoahAgentError(used, 409);
      throw error;
    }
    if (!changes) throw new NoahAgentError('この行は、振込待ちではありません。', 409);
    return lineView((await lineOf(month, code))!);
  }

  async function setHold(month: string, code: string, hold: boolean) {
    const line = await requireLine(month, code);
    const from = hold ? 'pending' : 'held', to = hold ? 'held' : 'pending';
    if (line.payout_state === to) return lineView(line);
    const changes = await run('UPDATE noah_teikibin_lines SET payout_state=? WHERE month=? AND person_id=? AND payout_state=?', to, month, line.person_id, from);
    if (!changes) throw new NoahAgentError(hold ? 'この行は、振込待ちではありません。' : 'この行は、保留ではありません。', 409);
    return lineView((await lineOf(month, code))!);
  }

  async function assignGoods(owner: string, month: string, code: string, assignmentRef: string) {
    const line = await requireLine(month, code);
    if (line.goods_state === 'assigned' && line.goods_ref === assignmentRef) return lineView(line);
    if (line.goods_state !== 'pending') throw new NoahAgentError('この行は、定期便の割当待ちではありません。', 409);
    const changes = await run(
      "UPDATE noah_teikibin_lines SET goods_state='assigned', goods_ref=?, assigned_by=?, assigned_at=? WHERE month=? AND person_id=? AND goods_state='pending'",
      assignmentRef, owner, now(), month, line.person_id,
    );
    if (!changes) throw new NoahAgentError('この行は、定期便の割当待ちではありません。', 409);
    return lineView((await lineOf(month, code))!);
  }

  // -------------------------------------------------------------------------
  // 運営の画面の全体（8.3 章）
  // -------------------------------------------------------------------------

  async function overview(targetPerPersonMinor: number) {
    const [months, counts, pending] = await Promise.all([
      all<MonthRow>(
        `SELECT month, state, form, reserve_bps, dividend_bps, plan_price_minor, people, lines, net_cash_minor, fees_minor, reserve_minor,
                surplus_minor, pool_minor, company_minor, shortfall_minor, digest, closed_by, started_at, closed_at
           FROM noah_teikibin_months ORDER BY month DESC LIMIT 120`,
      ),
      one<{ total: number; verified: number | null; revoked: number | null }>(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN verified_at IS NOT NULL AND revoked_at IS NULL THEN 1 ELSE 0 END) AS verified,
                SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked
           FROM noah_teikibin_people`,
      ),
      all<{ month: string; payouts: number | null; cash: number | null; goods: number | null }>(
        `SELECT month,
                SUM(CASE WHEN payout_state='pending' THEN 1 ELSE 0 END) AS payouts,
                SUM(CASE WHEN payout_state='pending' THEN cash_minor ELSE 0 END) AS cash,
                SUM(CASE WHEN goods_state='pending' THEN 1 ELSE 0 END) AS goods
           FROM noah_teikibin_lines GROUP BY month`,
      ),
    ]);
    const verified = Number(counts?.verified ?? 0);
    const waiting = new Map(pending.map((row) => [row.month, row]));
    return {
      currentMonth: teikibinMonthOf(now()),
      months: months.map((row) => ({
        ...monthView(row),
        pendingPayouts: Number(waiting.get(row.month)?.payouts ?? 0),
        pendingCashMinor: Number(waiting.get(row.month)?.cash ?? 0),
        pendingGoods: Number(waiting.get(row.month)?.goods ?? 0),
      })),
      people: { total: Number(counts?.total ?? 0), verified, revoked: Number(counts?.revoked ?? 0) },
      coverage: teikibinCoverage(months.filter((row) => row.state === 'closed').map((row) => row.pool_minor), verified, targetPerPersonMinor),
    };
  }

  return {
    join,
    setPlan,
    userView,
    paidPlan,
    addEntry,
    voidEntry,
    addContribution,
    voidContribution,
    verify,
    revoke,
    people,
    monthDetail,
    preview,
    close,
    payouts,
    exportCsv,
    markPaid,
    setHold,
    assignGoods,
    overview,
  };
}

function withoutPerson(line: TeikibinLine) {
  const { personId: _personId, ...rest } = line;
  return rest;
}
