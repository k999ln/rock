'use client';
/* oxlint-disable next/no-html-link-for-pages -- The dedicated cloud Worker serves a separate document with a fresh line check. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cloud, SquareTerminal, ShoppingBag, Signal } from 'lucide-react';
import type { NoahAgentCard } from '@/lib/noah-agent-cards';
import type { NoahFirstJob } from '@/lib/noah-first-jobs';
import { noahCardHref } from '@/lib/noah-project-view';
import { noahReadyDetailHref } from '@/lib/noah-ready-view';
import NoahAppIcon from './noah-app-icon';
import { NoahPinMotion } from './noah-art-motion';
import { useNoahLocale } from './noah-locale';
import styles from './noah-store.module.css';
import { NoahAgentPin, NoahAgentPinGrid } from './noah-agent-pin';

const hrefFor = (card: NoahAgentCard) => noahCardHref(card) ?? noahReadyDetailHref(card.id);

function TodayHeading() {
  const { locale, t } = useNoahLocale();
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function updateDate() {
      const now = new Date();
      setToday(now);
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(updateDate, midnight.getTime() - now.getTime());
    }
    updateDate();
    return () => clearTimeout(timer);
  }, []);
  return <header className={styles.top}>
    <div className={styles.date}>{today && <time>{new Intl.DateTimeFormat(locale, {
      weekday: 'long', month: 'long', day: 'numeric',
    }).format(today)}</time>}</div>
    <div className={styles.titleRow}>
      <h1>{t('Today')}</h1>
      <Link className={styles.engineering} href="/noah/engineering">
        <SquareTerminal size={18} aria-hidden="true" />{t('Agentエンジニアリング')}
      </Link>
    </div>
  </header>;
}

export default function NoahStoreEntry({ jobs, items }: { jobs?: (NoahFirstJob & { href: string })[]; items: NoahAgentCard[] }) {
  const { locale, t } = useNoahLocale();
  // firstJobs contains only requests whose execution path can currently be offered.
  const job = jobs?.find(option => option.id === 'memory') ?? jobs?.[0];
  const project = job ? new URL(job.href, 'https://avoado.si').searchParams.get('id') : null;
  const card = job ? items.find(item => (item.feedbackId ?? item.id) === project) : items.find(item => item.name);
  const memory = job?.id === 'memory';
  const feature = job ? {
    href: job.href,
    title: memory ? t('この仕事、誰の担当だっけ？') : t(job.title),
    name: memory ? 'Memory' : card?.name || t(job.title),
    subtitle: memory ? t(job.title) : t(job.output),
    label: t('使う'),
  } : card ? {
    href: hrefFor(card), title: card.name, name: card.name,
    subtitle: card.summary || card.provider, label: t('見る'),
  } : null;
  const related = items.filter(item => item !== card && item.name).slice(0, 4);
  return <div className={styles.entry}>
    <TodayHeading />
    {feature && <div className={styles.showcase} data-related={related.length > 0 || undefined}>
      <article className={styles.feature}>
        <Link className={styles.coverLink} href={feature.href}>
          <div className={styles.featureArt} data-memory={memory || undefined}>
            <div className={styles.featureStage}><NoahPinMotion id={project ?? card?.id ?? feature.name} name={feature.name} summary={card?.summary ?? feature.subtitle} /></div>
            <small>{t('ピックアップ')}</small>
            <h2 aria-label={feature.title}>{memory && locale === 'ja'
              ? feature.title.split(/(?<=、)/u).map(phrase => <span className={styles.phrase} key={phrase}>{phrase}</span>)
              : feature.title}</h2>
          </div>
          <div className={styles.featureFoot}>
            <NoahAppIcon name={feature.name} topic={card?.topic} className={styles.featureIcon} />
            <div className={styles.featureByline}><strong>{feature.name}</strong><small>{feature.subtitle}</small></div>
            <span className={styles.pill}>{feature.label}</span>
          </div>
        </Link>
      </article>
      {related.length > 0 && <section className={styles.collection} aria-labelledby="noah-featured-agents-title">
        <header className={styles.listHeading}>
          <h2 id="noah-featured-agents-title">{t('注目のAgent')}</h2>
          <Link href="/noah#noah-collection">{t('すべて見る')}</Link>
        </header>
        <NoahAgentPinGrid compact>{related.map(item =>
          <NoahAgentPin key={item.id} id={item.id} name={item.name} summary={item.summary || item.provider}
            href={hrefFor(item)} topic={item.topic} shape={item.shape} />
        )}</NoahAgentPinGrid>
      </section>}
    </div>}
  </div>;
}

export function NoahStoreServices() {
  const { t } = useNoahLocale();
  return <aside className={styles.services}>
    <nav aria-label={t('ストアのサービス')}>
      <Link href="/noah/purchases"><ShoppingBag size={17} aria-hidden="true" />{t('購入履歴')}</Link>
      <Link href="/noah/sell">{t('販売する')}</Link>
    </nav>
    <nav aria-label={t('eSIMでつなぐ専用クラウド')}>
      <Link href="/connect"><Signal size={17} aria-hidden="true" />{t('eSIM専用クラウド（準備中）')}</Link>
      <a href="/api/noah/cloud-work" aria-label={t('専用クラウドの接続状況を確認')}><Cloud size={17} aria-hidden="true" />{t('接続状況を確認')}</a>
    </nav>
  </aside>;
}
