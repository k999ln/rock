'use client';

import { formatCurrencyMinor } from '@/lib/currency-format';
import type { NoahWorkRevenueReceipt } from '@/lib/noah-work-revenue-receipt';
import { useNoahLocale } from './noah-locale';
import styles from './noah-work-usage-receipt.module.css';

const shareNotes: Record<NoahWorkRevenueReceipt['authorShareStatus'], string> = {
  'pending-payment': 'この仕事への入金記録を待っています。',
  'pending-cost': 'この仕事の費用がそろうと、作者の取り分が決まります。',
  confirmed: '入金額から費用を引いた利益に作者の割合を掛けた額です。',
  'not-applicable': 'この仕事は作者への分配の対象外です。',
  unresolved: 'この仕事に対応する記録を確認できていません。',
};

export default function NoahWorkRevenueReceiptPanel({ receipt }: { receipt: NoahWorkRevenueReceipt }) {
  const { t, locale } = useNoahLocale();
  const money = (yen: number) => formatCurrencyMinor(yen, 'JPY', locale);
  const rate = new Intl.NumberFormat(locale, { style: 'percent' }).format(receipt.shareBps / 10_000);
  const status = receipt.authorShareStatus;
  const approved = receipt.approvedYen === null
    ? t(status === 'unresolved' ? '未確認' : '承認記録なし')
    : money(receipt.approvedYen);
  const paid = receipt.paidYen === null
    ? t(status === 'unresolved' ? '未確認' : '入金記録なし')
    : money(receipt.paidYen);
  const shareYen = receipt.authorShareYen;
  const confirmed = status === 'confirmed' && shareYen !== null;
  const share = confirmed
    ? t('確定（{amount}）', { amount: money(shareYen) })
    : t(status === 'not-applicable' ? '分配対象外' : '未確定');
  return (
    <section className={styles.receipt} aria-label={t('この仕事の収益明細')}>
      <h2>{t('この仕事の収益明細')}</h2>
      <dl className={styles.rows}>
        <div><dt>{t('成果承認額')}</dt><dd>{approved}</dd></div>
        <div><dt>{t('入金額')}</dt><dd>{paid}</dd></div>
        <div><dt>{t('この仕事の費用')}</dt><dd>{receipt.costYen === null ? t('未確定') : money(receipt.costYen)}</dd></div>
        <div className={styles.primary}><dt>{t('作者の取り分（{rate}）', { rate })}</dt><dd>{share}</dd></div>
      </dl>
      <p className={styles.shareNote}>{t(shareNotes[status])}</p>
      {receipt.evidenceConnection === 'unconfigured' && (
        <p className={styles.shareNote}>
          <strong>{t('証憑の連携待ち')}</strong>{' '}{t('提供元との接続後に、この仕事の新しい記録を取り込みます。')}
        </p>
      )}
    </section>
  );
}
