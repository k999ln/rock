'use client';

import Link from 'next/link';
import type { LinuxWorkspace } from '@/lib/sky-linux-service';
import { useNoahLocale } from './noah-locale';
import styles from './noah-contract-results.module.css';

type ReadState = 'loading' | 'ready' | 'pending' | 'unavailable' | 'signin' | 'changed';

const noAccessText: Record<Exclude<ReadState, 'ready'>, string> = {
  loading: '利用明細を読み込んでいます。',
  pending: '利用明細を読み込んでいます。',
  signin: '契約したRockstar IDでサインインしてください。',
  unavailable: '利用明細を取得できませんでした。',
  changed: 'アカウントまたは契約が変わりました。元のアカウントを確認してください。',
};

export default function NoahContractResults({ state, workspace, supported, refresh }: {
  state: ReadState;
  workspace?: LinuxWorkspace;
  supported: boolean;
  refresh: () => void;
}) {
  const { t, locale } = useNoahLocale();
  const price = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', currencyDisplay: 'code' });
  const money = (minor: number) => price.format(minor / 100);
  const number = new Intl.NumberFormat(locale);
  return <main className={styles.page}>
    <Link href="/noah/my?view=saved&tab=results">‹ {t('成果')}</Link>
    <h1>{t('専用クラウドの成果と利用明細')}</h1>
    {state !== 'ready' ? <output>{t(noAccessText[state])}</output>
      : !workspace ? <p>{t('このアカウントで読める契約の仕事はありません。')}</p>
      : !supported ? <p>{t('この形式の利用明細は契約画面で確認してください。')}</p>
      : <>
        {workspace.mode === 'sandbox' && <p className={styles.notice}>{t('テスト契約の明細です。実際の引き落としはありません。')}</p>}
        {workspace.jobs.length === 0 && <p>{t('まだ依頼がありません。')}</p>}
        {workspace.jobs.map(job => {
          const confirmed = Boolean(job.receiptId);
          const released = job.state === 'cancelled' && !confirmed;
          const status = confirmed ? t('確定額') : released ? t('予約解除') : t('未確定');
          return <details key={job.id} className={styles.job}>
            <summary>
              <strong>{job.listing.agent.name}</strong>
              <span>{status}{confirmed && ' · ' + money(job.computeMinor + job.authorMinor)}</span>
              <small>{new Date(job.approvedAt).toLocaleString(locale)}</small>
            </summary>
            {job.run.text && <p dir="auto" className={styles.result}>{job.run.text}</p>}
            <dl>
              <dt>{t('実行先')}</dt><dd>{t('avokado 専用Linux')}</dd>
              <dt>{t('CPU使用量')}</dt><dd>{confirmed ? t('{ms} ミリ秒', { ms: number.format(job.cpuMs) }) : t('未計測・未確定')}</dd>
              <dt>{t('計算料金')}</dt><dd>{confirmed ? money(job.computeMinor) : t('未確定')}</dd>
              <dt>{t('Agent利用料')}</dt><dd>{confirmed ? money(job.authorMinor) : t('未確定')}</dd>
              <dt>{t('確定額')}</dt><dd>{confirmed ? money(job.computeMinor + job.authorMinor) : t('確定額の記録はありません。')}</dd>
              {!confirmed && !released && <><dt>{t('予約中の金額')}</dt><dd>{money(job.reservedMinor)}</dd></>}
              <dt>{t('承認した上限')}</dt><dd>{money(job.reservedMinor)}</dd>
              <dt>{t('料金条件の版')}</dt><dd>{workspace.terms.version}</dd>
              <dt>{t('仕事番号')}</dt><dd dir="ltr">{job.id}</dd>
              {confirmed && <><dt>{t('受領記録')}</dt><dd dir="ltr">{job.receiptId}</dd></>}
            </dl>
          </details>;
        })}
      </>}
    <footer>
      <button type="button" onClick={refresh} disabled={state === 'loading'}>{t('状態を更新')}</button>
      <Link href="/noah/linux#monthly-statement">{t('クラウドの使用額・請求明細')}</Link>
    </footer>
  </main>;
}
