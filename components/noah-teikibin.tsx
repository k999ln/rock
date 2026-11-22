'use client';
/**
 * 利用者の画面「あなたの定期便」（task 124。仕様: docs/noah/spec-124-teikibin-ledger.md の 9.1 章）。
 * 出す額は、締めた月の実数だけ（見込み・目標は出さない）。切り替えが閉の間は、額を出さず、申し込みも出さない。
 * 1 か月を 1 枚の箱にして、受け取る額を大きく出す。
 */
import { useEffect, useState } from 'react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { useNoahLocale } from './noah-locale';
import styles from './noah-teikibin.module.css';

type MonthLine = {
  month: string;
  form: 'cash' | 'goods';
  feeMinor: number;
  dividendMinor: number;
  deductionMinor: number;
  cashMinor: number;
  goodsMinor: number;
  paidPlan: boolean;
  payoutState: 'none' | 'pending' | 'held' | 'paid';
  goodsState: 'none' | 'pending' | 'assigned';
  paidAt: number | null;
};
type Person = { code: string; verified: boolean; revoked: boolean; planOptIn: boolean };
type View = {
  open: boolean;
  signedIn: boolean;
  reviewerPreview?: boolean;
  person?: Person | null;
  months?: MonthLine[];
  planPriceMinor?: number | null;
  ownerScope?: string | null;
};

const PAYOUT_LABELS = { pending: '振込待ち', held: '保留', paid: '振込済み' } as const;
const GOODS_LABELS = { pending: '届ける準備中', assigned: '届ける物が決まりました' } as const;

/** 箱の上に出す状態（現金と物の両方がある月は 2 つ）。 */
function statusLabels(line: MonthLine): string[] {
  const labels: string[] = [];
  if (line.payoutState !== 'none') labels.push(PAYOUT_LABELS[line.payoutState]);
  if (line.goodsState !== 'none') labels.push(GOODS_LABELS[line.goodsState]);
  return labels.length ? labels : ['受け取りなし'];
}

export default function NoahTeikibin() {
  const { t, locale } = useNoahLocale();
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let stopped = false;
    const read = async () => {
      try {
        const response = await fetch('/api/noah/teikibin', { cache: 'no-store' });
        if (!response.ok) throw Error(String(response.status));
        const body = (await response.json()) as View;
        if (!stopped) {
          setView(body);
          setFailed(false);
        }
      } catch {
        if (!stopped) setFailed(true);
      }
    };
    void read();
    return () => {
      stopped = true;
    };
  }, []);

  async function send(body: Record<string, unknown>) {
    const scope = view?.ownerScope;
    if (!scope) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/noah/teikibin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope },
        body: JSON.stringify(body),
      });
      const next = (await response.json()) as View & { error?: string };
      if (!response.ok) {
        setNotice(next.error ?? t('読み込めませんでした。もう一度試してください。'));
        return;
      }
      setView({ ...next, ownerScope: scope });
    } catch {
      setNotice(t('読み込めませんでした。もう一度試してください。'));
    } finally {
      setBusy(false);
    }
  }

  const yen = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'JPY' }).format(value);
  const monthName = (month: string) =>
    new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

  if (!view) {
    return (
      <main className={styles.page}>
        {failed ? <p role="alert">{t('読み込めませんでした。もう一度試してください。')}</p> : <p className={styles.muted}>{t('読み込んでいます…')}</p>}
      </main>
    );
  }
  if (!view.open) {
    return (
      <main className={styles.page}>
        <section className={styles.hero}>
          <h1>{t('定期便')}</h1>
          <p>{t('Agent が実際に稼いだお金の一部を、Noah を使う人に届ける準備をしています。始まる時に、ここでお知らせします。')}</p>
        </section>
      </main>
    );
  }
  const person = view.person ?? null;
  const months = view.months ?? [];
  const price = view.planPriceMinor ?? null;
  return (
    <main className={styles.page}>
      {view.reviewerPreview && <p className={styles.preview}>{t('運営の確認用に表示しています（まだ一般には開いていません）')}</p>}
      <section className={styles.hero}>
        <h1>{t('あなたの定期便')}</h1>
        <p>{t('Agent が実際に稼いだお金を月ごとに締めて、使っている人に等しく分けます。今は現金で、仕入先とつながったら、運営が選んだ食べ物や日用品が届きます。')}</p>
      </section>

      <section className={styles.status}>
        {!view.signedIn ? (
          <p>{t('サインインすると、定期便の状態を見られます。')}</p>
        ) : !person ? (
          <button type="button" className={styles.primary} disabled={busy} onClick={() => void send({ action: 'join' })}>
            {t('受け取りを申し込む')}
          </button>
        ) : person.revoked ? (
          <p>{t('受け取りは止まっています。')}</p>
        ) : (
          <>
            <span className={styles.label}>{t('受け取り番号')}</span>
            <strong className={styles.code}>{person.code}</strong>
            <p>{person.verified ? t('受け取れます') : t('運営があなたを確かめると、次の締めから受け取れます。')}</p>
          </>
        )}
      </section>

      {person && !person.revoked && price !== null && (
        <section className={styles.plan}>
          <label>
            <input type="checkbox" checked={person.planOptIn} disabled={busy} onChange={(event) => void send({ action: 'plan', optIn: event.target.checked })} />
            <span>{t('有料（つなげる数 50・クラウド・定期便の上乗せ）を、本人の分から払う')}</span>
          </label>
          <p className={styles.muted}>
            {t('有料の値段: {price}', { price: yen(price) })} {t('等分が値段より少ない月は、差し引かず、次の月は無料のままです。')}
          </p>
        </section>
      )}

      <section aria-label={t('締めた月')}>
        {months.length === 0 ? (
          <p className={styles.muted}>{t('まだ締めた月はありません。')}</p>
        ) : (
          <ul className={styles.months}>
            {months.map((line) => (
              <li key={line.month} className={styles.box}>
                <header>
                  <h2>{monthName(line.month)}</h2>
                  <span className={styles.chips}>
                    {statusLabels(line).map((label) => (
                      <span key={label} className={styles.chip}>{t(label)}</span>
                    ))}
                  </span>
                </header>
                <p className={styles.amount}>
                  <span>{t('受け取る額')}</span>
                  <strong>{yen(line.cashMinor + line.goodsMinor)}</strong>
                </p>
                <dl className={styles.detail}>
                  <div><dt>{t('等分')}</dt><dd>{yen(line.dividendMinor)}</dd></div>
                  <div><dt>{t('作業料')}</dt><dd>{yen(line.feeMinor)}</dd></div>
                  {line.deductionMinor > 0 && <div><dt>{t('差し引き')}</dt><dd>−{yen(line.deductionMinor)}</dd></div>}
                  <div><dt>{t('受け取り方')}</dt><dd>{line.form === 'goods' ? t('定期便') : t('現金')}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className={styles.note}>{t('受け取った額は、収入として扱われる場合があります。')}</p>
      {notice && <p role="alert" className={styles.alert}>{notice}</p>}
    </main>
  );
}
