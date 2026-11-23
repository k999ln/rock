'use client';
/* oxlint-disable next/no-html-link-for-pages -- The dedicated cloud Worker serves an independent HTML document with a fresh line check. */
import Link from 'next/link';
import { ChevronRight, Cloud, PackagePlus, ShoppingBag } from 'lucide-react';
import type { NoahAgentCard } from '@/lib/noah-agent-cards';
import type { NoahFirstJob } from '@/lib/noah-first-jobs';
import { noahPinInitials } from '@/lib/noah-pins';
import { noahCardHref } from '@/lib/noah-project-view';
import { noahReadyDetailHref } from '@/lib/noah-ready-view';
import { useNoahLocale } from './noah-locale';
import styles from './noah-store.module.css';
import pins from './noah-pins.module.css';

const hrefFor = (card: NoahAgentCard) => noahCardHref(card) ?? noahReadyDetailHref(card.id);

export default function NoahStoreEntry({ jobs, items }: { jobs?: (NoahFirstJob & { href: string })[]; items: NoahAgentCard[] }) {
  const { t } = useNoahLocale();
  // firstJobs contains only requests whose execution path can currently be offered.
  const job = jobs?.find(option => option.id === 'memory') ?? jobs?.[0];
  const project = job ? new URL(job.href, 'https://avoado.si').searchParams.get('id') : null;
  const card = job ? items.find(item => (item.feedbackId ?? item.id) === project) : items.find(item => item.name);
  const feature = job ? { href: job.href, title: t(job.title), body: t(job.output), name: card?.name || (job.id === 'memory' ? 'Memory' : t(job.title)), label: t('使う') }
    : card ? { href: hrefFor(card), title: card.name, body: card.summary, name: card.provider || card.name, label: t('見る') } : null;
  const related = items.filter(item => item !== card && item.name).slice(0, 3);
  return <div className={styles.entry}>
    <div className={styles.top}><h1>{t('Agentストア')}</h1>
      <nav aria-label={t('ストアのサービス')}>
        <Link href="/noah/marketplace"><ShoppingBag size={17} aria-hidden="true"/>{t('Agentを買う')}</Link>
        <Link href="/noah/publisher"><PackagePlus size={17} aria-hidden="true"/>{t('Agentを載せる')}</Link>
      </nav>
    </div>
    <nav className={styles.cloudLine} aria-label={t('eSIMでつなぐ専用クラウド')}>
      <Link href="/connect"><Cloud size={19} aria-hidden="true"/><span>{t('eSIMでつなぐ専用クラウド')}</span><ChevronRight size={15} aria-hidden="true"/></Link>
      <a href="/api/noah/cloud-work" aria-label={t('専用eSIMで成果・料金を確認')}>{t('専用クラウドを開く')} <ChevronRight size={14} aria-hidden="true"/></a>
    </nav>
    {feature && <div className={styles.showcase} data-related={related.length > 0 || undefined}>
      <Link className={styles.feature} href={feature.href}>
        <span className={styles.featureArt}><small>{t('ピックアップ')}</small><strong>{feature.title}</strong><span>{feature.body}</span></span>
        <span className={styles.featureFoot}><b className={styles.featureIcon} aria-hidden="true">{noahPinInitials(feature.name)}</b><strong>{feature.name}</strong><span className={styles.pill}>{feature.label}</span></span>
      </Link>
      {related.length > 0 && <div className={styles.collection}>
        <h2>{t('注目のAgent')}</h2>
        {related.map(item => <Link href={hrefFor(item)} key={item.id} className={styles.row}>
          <span className={`${styles.appIcon} ${pins.tone}`} data-topic={item.topic} aria-hidden="true">{noahPinInitials(item.name)}</span>
          <span className={styles.rowText}><strong>{item.name}</strong><small>{item.summary || item.provider}</small></span>
          <span className={styles.pill}>{t('見る')}</span>
        </Link>)}
      </div>}
    </div>}

  </div>;
}
