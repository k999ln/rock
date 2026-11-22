'use client';
/**
 * 運営の画面「定期便の台帳」（審査者だけ。task 124。仕様: docs/noah/spec-124-teikibin-ledger.md の 9.2 章）。日本語だけ。
 * 上から: 約束してよい額 → 月を選ぶ → 入金と費用 → 寄与 → 受け取る人 → 締め（下書き → 締める）→ 払い出しと定期便。
 * お金は送らない。振込は台帳の外で行い、ここには結果（振込の番号）だけを書く。確かめる値（口座番号など）は、送った後に画面から消す。
 */
import { useEffect, useState } from 'react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import styles from './noah-teikibin-operator.module.css';

type MonthSummary = {
  month: string;
  state: 'closing' | 'closed';
  form: 'cash' | 'goods';
  people: number;
  netCashMinor: number;
  poolMinor: number;
  companyMinor: number;
  shortfallMinor: number;
  planPriceMinor: number | null;
  pendingPayouts: number;
  pendingCashMinor: number;
  pendingGoods: number;
};
type Overview = {
  currentMonth: string;
  open: boolean;
  keyReady: boolean;
  warnings: string[];
  months: MonthSummary[];
  people: { total: number; verified: number; revoked: number };
  coverage: { sustainablePerPersonMinor: number; requiredMonthlyPoolMinor: number; monthlyGapMinor: number; promiseAllowed: boolean } | null;
  ownerScope: string | null;
};
type Entry = { id: string; kind: string; amountMinor: number; source: string; reference: string; note: string; voided: boolean; voidReason: string | null };
type Contribution = { id: string; code: string | null; kind: string; units: number; rateMinor: number; feeMinor: number; reference: string; voided: boolean };
type MonthDetail = {
  month: string;
  entries: Entry[];
  contributions: Contribution[];
  sums: Record<string, number>;
  close: MonthSummary | null;
};
type Preview = {
  digest: string;
  problems: string[];
  people: number;
  lines: number;
  deductionsMinor: number;
  settlement: { netCashMinor: number; feesMinor: number; reserveMinor: number; surplusMinor: number; dividendPoolMinor: number; companyMinor: number; companyShortfallMinor: number };
  sample: { code: string | null; feeMinor: number; dividendMinor: number; deductionMinor: number; cashMinor: number; goodsMinor: number }[];
};
type Line = { code: string; feeMinor: number; dividendMinor: number; deductionMinor: number; cashMinor: number; goodsMinor: number; payoutState: string; payoutRef: string | null; goodsState: string; goodsRef: string | null };
type PersonRow = { code: string; verified: boolean; method: string | null; revoked: boolean; revokeReason: string | null; planOptIn: boolean };

const KIND_LABELS: Record<string, string> = { income: '入金', refund: '返金', platform_fee: '手数料', direct_cost: '実費', creator_share: '作った人の分' };
const SOURCE_LABELS: Record<string, string> = { coconala: 'ココナラ', noah: 'Noah', cloud: 'クラウド', ai: 'AI', bank: '銀行', other: 'その他' };
const CONTRIBUTION_LABELS: Record<string, string> = { compute: '計算資源', judgment: '人の確認', referral: '紹介' };
const STATE_LABELS: Record<string, string> = { none: '—', pending: '待ち', held: '保留', paid: '振込済み', assigned: '割当済み' };
const yen = (value: number) => `${value.toLocaleString('ja-JP')} 円`;
const previousMonth = (month: string) => {
  const year = Number(month.slice(0, 4)), number = Number(month.slice(5, 7));
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
};
const field = (form: HTMLFormElement, name: string) => {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value.trim() : '';
};
const whole = (text: string) => (/^\d+$/u.test(text) ? Number(text) : Number.NaN);

export default function NoahTeikibinOperator() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [denied, setDenied] = useState(false);
  const [month, setMonth] = useState('');
  const [detail, setDetail] = useState<MonthDetail | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [preview, setPreview] = useState<{ result: Preview; params: { form: string; reserveBps: number; dividendBps: number; planPrice: number | null } } | null>(null);
  const [target, setTarget] = useState('150000');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  /** 読む（審査者でなければ denied、失敗は notice）。状態は、呼んだ側が await の後に置く。 */
  async function get<T>(query: string): Promise<T | null> {
    const response = await fetch(`/api/noah/teikibin${query}`, { cache: 'no-store' });
    if (response.status === 404) {
      setDenied(true);
      return null;
    }
    const body = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      setNotice(body.error ?? '読み込めませんでした。');
      return null;
    }
    return body;
  }
  async function refresh(goal: string, value: string) {
    const next = await get<Overview>(`?state=1&target=${encodeURIComponent(/^\d+$/u.test(goal) ? goal : '0')}`);
    if (next) setOverview(next);
    if (!value) return;
    const [nextDetail, nextLines, nextPeople] = await Promise.all([
      get<MonthDetail>(`?month=${value}`),
      get<{ lines: Line[] }>(`?payouts=${value}`),
      get<{ people: PersonRow[] }>('?people=1'),
    ]);
    if (nextDetail) setDetail(nextDetail);
    setLines(nextLines?.lines ?? []);
    setPeople(nextPeople?.people ?? []);
  }

  useEffect(() => {
    let stopped = false;
    const read = async () => {
      const response = await fetch('/api/noah/teikibin?state=1&target=150000', { cache: 'no-store' });
      const body = (await response.json()) as Overview & { error?: string };
      if (stopped) return;
      if (response.status === 404) setDenied(true);
      else if (!response.ok) setNotice(body.error ?? '読み込めませんでした。');
      else {
        setOverview(body);
        setMonth((current) => current || previousMonth(body.currentMonth));
      }
    };
    void read();
    return () => {
      stopped = true;
    };
  }, []);

  useEffect(() => {
    if (!month) return;
    let stopped = false;
    const read = async () => {
      const load = async <T,>(query: string) => {
        const response = await fetch(`/api/noah/teikibin${query}`, { cache: 'no-store' });
        return response.ok ? ((await response.json()) as T) : null;
      };
      const [nextDetail, nextLines, nextPeople] = await Promise.all([
        load<MonthDetail>(`?month=${month}`),
        load<{ lines: Line[] }>(`?payouts=${month}`),
        load<{ people: PersonRow[] }>('?people=1'),
      ]);
      if (stopped) return;
      setDetail(nextDetail);
      setLines(nextLines?.lines ?? []);
      setPeople(nextPeople?.people ?? []);
      setPreview(null);
    };
    void read();
    return () => {
      stopped = true;
    };
  }, [month]);

  async function post(body: Record<string, unknown>, done?: () => void) {
    const scope = overview?.ownerScope;
    if (!scope) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/noah/teikibin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope },
        body: JSON.stringify(body),
      });
      const answer = (await response.json()) as { error?: string };
      if (!response.ok) {
        setNotice(answer.error ?? '操作できませんでした。');
        return;
      }
      done?.();
      setNotice('保存しました。');
      setPreview(null);
      await refresh(target, month);
    } catch {
      setNotice('通信できませんでした。もう一度試してください。');
    } finally {
      setBusy(false);
    }
  }

  function submitEntry(form: HTMLFormElement) {
    void post(
      { action: 'entry', month, kind: field(form, 'kind'), amount: whole(field(form, 'amount')), source: field(form, 'source'), reference: field(form, 'reference'), note: field(form, 'note') },
      () => form.reset(),
    );
  }
  function submitContribution(form: HTMLFormElement) {
    void post(
      { action: 'contribution', month, code: field(form, 'code'), kind: field(form, 'kind'), units: whole(field(form, 'units')), rate: whole(field(form, 'rate')), reference: field(form, 'reference') },
      () => form.reset(),
    );
  }
  function submitVerify(form: HTMLFormElement) {
    // 確かめる値は、送った後すぐに画面から消す（台帳には HMAC だけが残る）。
    void post({ action: 'verify', code: field(form, 'code'), method: field(form, 'method'), identity: field(form, 'identity') }, () => form.reset());
  }
  function submitRevoke(form: HTMLFormElement) {
    void post({ action: 'revoke', code: field(form, 'code'), reason: field(form, 'reason') }, () => form.reset());
  }
  async function submitPreview(form: HTMLFormElement) {
    const params = {
      form: field(form, 'form'),
      reserveBps: whole(field(form, 'reserve')),
      dividendBps: whole(field(form, 'dividend')),
      planPrice: field(form, 'price') === '' ? null : whole(field(form, 'price')),
    };
    const query = new URLSearchParams({ preview: month, form: params.form, reserve: field(form, 'reserve'), dividend: field(form, 'dividend') });
    if (params.planPrice !== null) query.set('price', field(form, 'price'));
    setNotice('');
    const result = await get<Preview>(`?${query}`);
    if (result) setPreview({ result, params });
  }
  function closeMonth() {
    if (!preview) return;
    void post({ action: 'close', month, ...preview.params, digest: preview.result.digest });
  }
  function submitLine(form: HTMLFormElement, submitter: HTMLElement | null, code: string) {
    const action = submitter?.getAttribute('value') ?? '';
    if (action === 'paid') void post({ action, month, code, payoutRef: field(form, 'ref') });
    else if (action === 'goods') void post({ action, month, code, assignmentRef: field(form, 'ref') });
    else void post({ action, month, code });
  }
  function voidRow(action: 'void-entry' | 'void-contribution', id: string, form: HTMLFormElement) {
    void post({ action, id, reason: field(form, 'reason') });
  }

  if (denied) return <main className={styles.page}><p>この画面は、運営（審査者）だけが使えます。</p></main>;
  if (!overview) return <main className={styles.page}><p>読み込んでいます…</p></main>;
  const closed = detail?.close ?? null;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>定期便の台帳</h1>
        <p>
          切り替え NOAH_TEIKIBIN: <strong>{overview.open ? '開' : '閉（利用者には額を出していません）'}</strong> ／ 確かめる鍵: <strong>{overview.keyReady ? 'あり' : 'なし（受け取る人を確かめられません）'}</strong>
        </p>
        {overview.warnings.map((warning) => <p key={warning} className={styles.warn}>{warning}</p>)}
        {notice && <output className={styles.notice}>{notice}</output>}
      </header>

      <section className={styles.card}>
        <h2>約束してよい額</h2>
        <p className={styles.help}>締めた月のうち、等分に回せた額が最も少なかった月を、今の確かめた人数（{overview.people.verified} 人）で割った額までしか、毎月の額として約束できません。</p>
        <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); void refresh(target, ''); }}>
          <label>1 人に毎月渡したい額（円）<input name="target" inputMode="numeric" value={target} onChange={(event) => setTarget(event.target.value)} /></label>
          <button type="submit">計算する</button>
        </form>
        {overview.coverage ? (
          <dl className={styles.facts}>
            <div><dt>約束してよい額（1 人・月）</dt><dd>{yen(overview.coverage.sustainablePerPersonMinor)}</dd></div>
            <div><dt>目標に要る原資（月）</dt><dd>{yen(overview.coverage.requiredMonthlyPoolMinor)}</dd></div>
            <div><dt>足りない額（月）</dt><dd>{yen(overview.coverage.monthlyGapMinor)}</dd></div>
            <div><dt>目標を約束できるか</dt><dd>{overview.coverage.promiseAllowed ? 'できる' : 'できない'}</dd></div>
          </dl>
        ) : (
          <p className={styles.help}>締めた月が無いか、確かめた人がいないので、まだ計算できません。</p>
        )}
        <p className={styles.help}>受け取る人: 全員 {overview.people.total} 人・確かめた人 {overview.people.verified} 人・止めた人 {overview.people.revoked} 人</p>
      </section>

      <section className={styles.card}>
        <h2>月</h2>
        <label>
          扱う月
          <input type="month" value={month} max={overview.currentMonth} min="2026-01" onChange={(event) => setMonth(event.target.value)} />
        </label>
        <table className={styles.table}>
          <thead><tr><th>月</th><th>状態</th><th>人数</th><th>入金（返金後）</th><th>等分に回した額</th><th>会社</th><th>振込待ち</th></tr></thead>
          <tbody>
            {overview.months.map((row) => (
              <tr key={row.month}>
                <td><button type="button" className={styles.link} onClick={() => setMonth(row.month)}>{row.month}</button></td>
                <td>{row.state === 'closed' ? '締めた' : '締めの途中'}（{row.form === 'cash' ? '現金' : '定期便'}）</td>
                <td>{row.people}</td>
                <td>{yen(row.netCashMinor)}</td>
                <td>{yen(row.poolMinor)}</td>
                <td>{yen(row.companyMinor)}{row.shortfallMinor > 0 ? `（持ち出し ${yen(row.shortfallMinor)}）` : ''}</td>
                <td>{row.pendingPayouts} 人・{yen(row.pendingCashMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {detail && (
        <>
          <section className={styles.card}>
            <h2>{month} の入金と費用</h2>
            <p className={styles.help}>実際に入った・出たお金だけを書きます（見込みは書かない）。同じ種類・同じ番号は 1 回だけです。{closed ? 'この月は締めてあるので、変えられません。' : ''}</p>
            <dl className={styles.facts}>
              {Object.entries(detail.sums).map(([kind, amount]) => <div key={kind}><dt>{KIND_LABELS[kind] ?? kind}</dt><dd>{yen(amount)}</dd></div>)}
            </dl>
            {!closed && (
              <form className={styles.grid} onSubmit={(event) => { event.preventDefault(); submitEntry(event.currentTarget); }}>
                <label>種類<select name="kind">{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>金額（円）<input name="amount" inputMode="numeric" required /></label>
                <label>出どころ<select name="source">{Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>受領番号<input name="reference" required minLength={3} maxLength={120} /></label>
                <label>メモ<input name="note" maxLength={200} /></label>
                <button type="submit" disabled={busy}>記録する</button>
              </form>
            )}
            <table className={styles.table}>
              <thead><tr><th>種類</th><th>金額</th><th>出どころ</th><th>番号</th><th>メモ</th><th>操作</th></tr></thead>
              <tbody>
                {detail.entries.map((entry) => (
                  <tr key={entry.id} className={entry.voided ? styles.voided : undefined}>
                    <td>{KIND_LABELS[entry.kind] ?? entry.kind}</td>
                    <td>{yen(entry.amountMinor)}</td>
                    <td>{SOURCE_LABELS[entry.source] ?? entry.source}</td>
                    <td>{entry.reference}</td>
                    <td>{entry.voided ? `取り消し: ${entry.voidReason ?? ''}` : entry.note}</td>
                    <td>
                      {!entry.voided && !closed && (
                        <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); voidRow('void-entry', entry.id, event.currentTarget); }}>
                          <input name="reason" placeholder="取り消す理由" aria-label="取り消す理由" required minLength={2} />
                          <button type="submit" disabled={busy}>取り消す</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className={styles.card}>
            <h2>{month} の寄与（作業料）</h2>
            <p className={styles.help}>検収に通った量 × 割り当てた時の単価。確かめた人にだけ記録できます。</p>
            {!closed && (
              <form className={styles.grid} onSubmit={(event) => { event.preventDefault(); submitContribution(event.currentTarget); }}>
                <label>受け取り番号<input name="code" required placeholder="K7QM-2XPA" /></label>
                <label>種類<select name="kind">{Object.entries(CONTRIBUTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>量<input name="units" inputMode="numeric" required /></label>
                <label>単価（円）<input name="rate" inputMode="numeric" required /></label>
                <label>検収の番号<input name="reference" required minLength={3} maxLength={120} /></label>
                <button type="submit" disabled={busy}>記録する</button>
              </form>
            )}
            <table className={styles.table}>
              <thead><tr><th>番号</th><th>種類</th><th>量</th><th>単価</th><th>作業料</th><th>検収</th><th>操作</th></tr></thead>
              <tbody>
                {detail.contributions.map((row) => (
                  <tr key={row.id} className={row.voided ? styles.voided : undefined}>
                    <td>{row.code}</td>
                    <td>{CONTRIBUTION_LABELS[row.kind] ?? row.kind}</td>
                    <td>{row.units}</td>
                    <td>{yen(row.rateMinor)}</td>
                    <td>{yen(row.feeMinor)}</td>
                    <td>{row.reference}</td>
                    <td>
                      {!row.voided && !closed && (
                        <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); voidRow('void-contribution', row.id, event.currentTarget); }}>
                          <input name="reason" placeholder="取り消す理由" aria-label="取り消す理由" required minLength={2} />
                          <button type="submit" disabled={busy}>取り消す</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section className={styles.card}>
        <h2>受け取る人</h2>
        <p className={styles.help}>受け取り番号の人を、振込先の口座（または eSIM の回線）で確かめます。同じ口座で 2 人分は確かめられません。打った値は台帳に残らず、鍵付きの要約だけが残ります。</p>
        <form className={styles.grid} onSubmit={(event) => { event.preventDefault(); submitVerify(event.currentTarget); }} autoComplete="off">
          <label>受け取り番号<input name="code" required placeholder="K7QM-2XPA" /></label>
          <label>確かめ方<select name="method"><option value="bank_account">振込先の口座</option><option value="esim_line">eSIM の回線</option></select></label>
          <label>確かめる値（銀行コード・支店・口座番号など）<input name="identity" required minLength={4} maxLength={200} autoComplete="off" /></label>
          <button type="submit" disabled={busy || !overview.keyReady}>確かめる</button>
        </form>
        <form className={styles.grid} onSubmit={(event) => { event.preventDefault(); submitRevoke(event.currentTarget); }}>
          <label>止める受け取り番号<input name="code" required /></label>
          <label>理由<input name="reason" required minLength={2} maxLength={200} /></label>
          <button type="submit" disabled={busy}>受け取りを止める</button>
        </form>
        <table className={styles.table}>
          <thead><tr><th>番号</th><th>状態</th><th>確かめ方</th><th>有料を希望</th></tr></thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.code}>
                <td>{person.code}</td>
                <td>{person.revoked ? `止めた（${person.revokeReason ?? ''}）` : person.verified ? '確かめた' : '確かめ待ち'}</td>
                <td>{person.method === 'bank_account' ? '口座' : person.method === 'esim_line' ? 'eSIM' : '—'}</td>
                <td>{person.planOptIn ? 'はい' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {detail && !closed && (
        <section className={styles.card}>
          <h2>{month} を締める</h2>
          <p className={styles.help}>下書きで結果を見てから締めます。下書きの後に記録が変わったら、締めずにもう一度下書きを求めます。締めた月は変えられません。</p>
          <form className={styles.grid} onSubmit={(event) => { event.preventDefault(); void submitPreview(event.currentTarget); }}>
            <label>渡し方<select name="form"><option value="cash">現金</option><option value="goods">定期便（物）</option></select></label>
            <label>予備の率（1万分率）<input name="reserve" inputMode="numeric" defaultValue="0" required /></label>
            <label>本人の分の率（1万分率）<input name="dividend" inputMode="numeric" defaultValue="0" required /></label>
            <label>有料の値段（円・空なら差し引かない）<input name="price" inputMode="numeric" /></label>
            <button type="submit" disabled={busy}>下書きを見る</button>
          </form>
          {preview && (
            <div className={styles.preview}>
              {preview.result.problems.map((problem) => <p key={problem} className={styles.warn}>{problem}</p>)}
              <dl className={styles.facts}>
                <div><dt>入金（返金後）</dt><dd>{yen(preview.result.settlement.netCashMinor)}</dd></div>
                <div><dt>作業料</dt><dd>{yen(preview.result.settlement.feesMinor)}</dd></div>
                <div><dt>予備</dt><dd>{yen(preview.result.settlement.reserveMinor)}</dd></div>
                <div><dt>余剰</dt><dd>{yen(preview.result.settlement.surplusMinor)}</dd></div>
                <div><dt>等分に回す額</dt><dd>{yen(preview.result.settlement.dividendPoolMinor)}</dd></div>
                <div><dt>会社に残る額</dt><dd>{yen(preview.result.settlement.companyMinor)}</dd></div>
                <div><dt>会社の持ち出し</dt><dd>{yen(preview.result.settlement.companyShortfallMinor)}</dd></div>
                <div><dt>有料の差し引き</dt><dd>{yen(preview.result.deductionsMinor)}</dd></div>
                <div><dt>等分を受ける人</dt><dd>{preview.result.people} 人（結果の行 {preview.result.lines}）</dd></div>
              </dl>
              <table className={styles.table}>
                <thead><tr><th>番号</th><th>作業料</th><th>等分</th><th>差し引き</th><th>現金</th><th>物</th></tr></thead>
                <tbody>
                  {preview.result.sample.map((line, index) => (
                    <tr key={line.code ?? index}><td>{line.code}</td><td>{yen(line.feeMinor)}</td><td>{yen(line.dividendMinor)}</td><td>{yen(line.deductionMinor)}</td><td>{yen(line.cashMinor)}</td><td>{yen(line.goodsMinor)}</td></tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className={styles.danger} disabled={busy || preview.result.problems.length > 0} onClick={closeMonth}>この内容で {month} を締める</button>
            </div>
          )}
        </section>
      )}

      {closed && (
        <section className={styles.card}>
          <h2>{month} の払い出しと定期便</h2>
          <p className={styles.help}>振込は台帳の外で行い、終わった行に振込の番号を書きます。同じ番号は 2 回使えません。</p>
          <p><a href={`/api/noah/teikibin?export=${month}`}>振込待ちの一覧（CSV）を受け取る</a></p>
          <table className={styles.table}>
            <thead><tr><th>番号</th><th>作業料</th><th>等分</th><th>差し引き</th><th>現金</th><th>振込</th><th>物</th><th>定期便</th><th>操作</th></tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.code}>
                  <td>{line.code}</td>
                  <td>{yen(line.feeMinor)}</td>
                  <td>{yen(line.dividendMinor)}</td>
                  <td>{yen(line.deductionMinor)}</td>
                  <td>{yen(line.cashMinor)}</td>
                  <td>{STATE_LABELS[line.payoutState] ?? line.payoutState}{line.payoutRef ? `（${line.payoutRef}）` : ''}</td>
                  <td>{yen(line.goodsMinor)}</td>
                  <td>{STATE_LABELS[line.goodsState] ?? line.goodsState}{line.goodsRef ? `（${line.goodsRef}）` : ''}</td>
                  <td>
                    <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); submitLine(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter, line.code); }}>
                      {(line.payoutState === 'pending' || line.goodsState === 'pending') && <input name="ref" placeholder="振込の番号・割当の ID" aria-label="振込の番号・割当の ID" minLength={3} maxLength={120} />}
                      {line.payoutState === 'pending' && <button type="submit" name="action" value="paid" disabled={busy}>振込済みにする</button>}
                      {line.payoutState === 'pending' && <button type="submit" name="action" value="hold" disabled={busy}>保留</button>}
                      {line.payoutState === 'held' && <button type="submit" name="action" value="release" disabled={busy}>保留を戻す</button>}
                      {line.goodsState === 'pending' && <button type="submit" name="action" value="goods" disabled={busy}>割り当てた</button>}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
