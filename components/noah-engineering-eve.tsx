'use client';

import { ArrowUpRight } from 'lucide-react';
import { engineeringAdvice, engineeringEveHref } from '@/lib/noah-engineering-eve';
import type { NoahEngineeringStep } from '@/lib/noah-engineering';
import { useNoahLocale } from './noah-locale';
import styles from './noah-engineering-eve.module.css';

export default function NoahEngineeringEve({ stage = 'create', agentName }: {
  stage?: NoahEngineeringStep;
  agentName?: string | null;
}) {
  const { t, locale } = useNoahLocale();
  return (
    <aside className={styles.eve} aria-label="Eve">
      <span aria-hidden="true" className={styles.monogram}>E</span>
      <div className={styles.copy}>
        <h2>Eve</h2>
        <p>{t(engineeringAdvice[stage].tip)}</p>
      </div>
      <a href={engineeringEveHref(stage, locale)} target="_blank" rel="noopener noreferrer"
        aria-label={agentName ? t('{name}についてEveと話す（新しいタブ）', { name: agentName }) : t('Eveと話す（新しいタブ）')}>
        {t('Eveと話す')} <ArrowUpRight size={17} aria-hidden="true" />
      </a>
    </aside>
  );
}
