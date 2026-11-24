'use client';

import type { ReactNode } from 'react';
import type { NoahWorkUsageReceipt } from '@/lib/noah-work-usage-receipt';
import { formatCurrencyMinor } from '@/lib/currency-format';
import { useNoahLocale } from './noah-locale';
import styles from './noah-work-usage-receipt.module.css';

const locations = {
  'managed-cloud': 'Noahのクラウド',
  provider: '提供元のクラウド',
  form: '接続したAgent',
  local: 'このMac',
} as const;

const quantities = [
  ['modelCalls', 'モデル呼び出し', '{n} 回'],
  ['toolCalls', 'ツール呼び出し', '{n} 回'],
  ['providerTurns', '提供元への依頼', '{n} ターン'],
  ['inputTokens', 'モデルへの入力', '{n} トークン'],
  ['outputTokens', 'モデルからの出力', '{n} トークン'],
  ['neurons', 'モデルの計算量', '{n} neuron'],
] as const;

function Row({ label, children, primary }: { label: string; children: ReactNode; primary?: boolean }) {
  return <div className={primary ? styles.primary : undefined}><dt>{label}</dt><dd>{children}</dd></div>;
}

export default function NoahWorkUsageReceiptPanel({
  receipt, id, requestId, host,
}: {
  receipt?: NoahWorkUsageReceipt;
  id: string;
  requestId?: string;
  host?: string | null;
}) {
  const { t, locale } = useNoahLocale();
  const measured = quantities.flatMap(([key, label, unit]) => {
    const value = receipt?.metrics[key];
    return value == null ? [] : [{ key, label, value: t(unit, { n: value.toLocaleString(locale) }) }];
  });
  const unmeasured = receipt?.source === 'managed-cloud' && measured.length > 0
    ? quantities.filter(([key]) => key !== 'providerTurns' && receipt.metrics[key] == null).map(([, label]) => t(label))
    : [];
  const location = receipt ? t(locations[receipt.source]) : '';
  const endpoint = host === 'Noahクラウド' && receipt?.source === 'managed-cloud' ? null : host;
  const zero = formatCurrencyMinor(0, 'JPY', locale);
  const confirmed = receipt?.pricingBasis === 'included'
    ? t('{amount}（無料枠）', { amount: zero })
    : receipt?.pricingBasis === 'noah-relay'
      ? zero
      : t('未確定');

  return (
    <section className={styles.receipt} aria-label={t('この仕事の利用明細')}>
      <h2>{t('この仕事の利用明細')}</h2>
      <dl className={styles.rows}>
        <Row label={t('Noah利用料（確定額）')} primary>{confirmed}</Row>
        {receipt?.externalCharge === 'unreported' && <Row label={t('提供元の料金')}>{t('未確定（請求情報なし）')}</Row>}
        {receipt?.source === 'local' && <Row label={t('端末の稼働費')}>{t('未計測')}</Row>}
        {measured.map(({ key, label, value }) => (
          <Row key={key} label={t(label)}>
            {value}
          </Row>
        ))}
        {!measured.length && <Row label={t('利用量')}>{t('未計測')}</Row>}
        {unmeasured.length > 0 && <Row label={t('未計測の項目')}>{new Intl.ListFormat(locale).format(unmeasured)}</Row>}
        {measured.length > 0 && receipt?.externalCharge === 'unreported' && <Row label={t('提供元の利用量')}>{t('未計測')}</Row>}
        {receipt?.estimateYen != null && (
          <Row label={t('有料プラン換算（参考）')}>
            {t('約 {amount}', { amount: new Intl.NumberFormat(locale, {
              style: 'currency', currency: 'JPY', maximumFractionDigits: 1,
            }).format(receipt.estimateYen) })}
          </Row>
        )}
      </dl>
      <details className={styles.details}>
        <summary>{t('計測の根拠と仕事番号')}</summary>
        <dl className={styles.rows}>
          <Row label={t('実行先')}>{[location, endpoint].filter(Boolean).join(' · ') || t('記録なし')}</Row>
          {receipt?.source === 'managed-cloud' && receipt.metrics.neurons != null && (
            <Row label={t('計測方法')}>{t('モデルの報告値。使用量の報告がない呼び出しは上限値で記録します。')}</Row>
          )}
          {receipt?.model && <Row label={t('使用モデル')}><bdi>{receipt.model}</bdi></Row>}
          {receipt?.agentVersion && (
            <Row label={t(/^[a-f0-9]{64}$/i.test(receipt.agentVersion) ? '実行定義（SHA-256）' : 'Agentの版')}>
              <bdi>{receipt.agentVersion}</bdi>
            </Row>
          )}
          {requestId && requestId !== id && <Row label={t('依頼番号')}><bdi>{requestId}</bdi></Row>}
          <Row label={t('仕事番号')}><bdi>{id}</bdi></Row>
        </dl>
      </details>
    </section>
  );
}
