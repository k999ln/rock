'use client';

import Link from 'next/link';
import { useNoahLocale } from './noah-locale';
import styles from './rockstar-account.module.css';

export default function NoahContractLinks() {
  const { t } = useNoahLocale();
  return (
    <nav className={styles.contractLinks} aria-label={t('契約と利用状況')}>
      <Link href="/noah/purchases">{t('購入履歴・eSIM設定')}</Link>
      <Link href="/noah/usage">{t('Agentの利用記録')}</Link>
      <Link href="/noah/linux#monthly-statement">{t('クラウドの使用額・請求明細')}</Link>
    </nav>
  );
}
