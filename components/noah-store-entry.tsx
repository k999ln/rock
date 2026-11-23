'use client';
/* oxlint-disable next/no-html-link-for-pages -- The dedicated cloud Worker serves a separate document with a fresh line check. */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Cloud, PackagePlus, ShoppingBag, Signal } from 'lucide-react';
import type { NoahAgentCard } from '@/lib/noah-agent-cards';
import type { NoahFirstJob } from '@/lib/noah-first-jobs';
import { NOAH_PIN_TOPIC_LABELS, noahPinInitials } from '@/lib/noah-pins';
import { noahCardHref } from '@/lib/noah-project-view';
import { noahReadyDetailHref } from '@/lib/noah-ready-view';
import NoahAppIcon from './noah-app-icon';
import { useNoahLocale } from './noah-locale';
import styles from './noah-store.module.css';
import pins from './noah-pins.module.css';

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
    <h1>{t('Today')}</h1>
  </header>;
}

function FeaturedPins({ items }: { items: NoahAgentCard[] }) {
  const { t } = useNoahLocale();
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const element = list.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    // Span four-pixel grid tracks so CSS places each new link in the shortest column.
    // Measure the links, which keep their intrinsic height as their list items span tracks.
    const observer = new ResizeObserver(() => {
      for (const card of element.children) {
        const link = card.firstElementChild;
        if (link && card instanceof HTMLElement)
          card.style.gridRowEnd = `span ${Math.max(1, Math.ceil(link.getBoundingClientRect().height / 4))}`;
      }
      element.dataset.measured = 'true';
    });
    for (const link of element.querySelectorAll('a')) observer.observe(link);
    return () => observer.disconnect();
  }, [items]);

  return <ul className={styles.pinGrid} ref={list}>
    {items.map(item => <li key={item.id} className={pins.tone} data-topic={item.topic} data-shape={item.shape}>
      <Link href={hrefFor(item)} className={styles.pinLink}>
        <span className={pins.panel} aria-hidden="true">
          <span className={pins.initials}>{noahPinInitials(item.name)}</span>
          <span className={pins.topicLabel}>{t(NOAH_PIN_TOPIC_LABELS[item.topic])}</span>
        </span>
        <strong className={styles.pinTitle}>{item.name}</strong>
        {(item.summary || item.provider) && <small className={styles.pinSummary}>{item.summary || item.provider}</small>}
      </Link>
    </li>)}
  </ul>;
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
          <Link href="/noah/explore">{t('すべて見る')}</Link>
        </header>
        <FeaturedPins items={related} />
      </section>}
    </div>}
  </div>;
}

export function NoahStoreServices() {
  const { t } = useNoahLocale();
  return <aside className={styles.services}>
    <nav aria-label={t('ストアのサービス')}>
      <Link href="/noah/marketplace"><ShoppingBag size={17} aria-hidden="true" />{t('Agentを買う')}</Link>
      <Link href="/noah/publisher"><PackagePlus size={17} aria-hidden="true" />{t('Agentを載せる')}</Link>
    </nav>
    <nav aria-label={t('eSIMでつなぐ専用クラウド')}>
      <Link href="/connect"><Signal size={17} aria-hidden="true" />{t('eSIMでつなぐ専用クラウド')}</Link>
      <a href="/api/noah/cloud-work" aria-label={t('専用eSIMで成果・料金を確認')}><Cloud size={17} aria-hidden="true" />{t('専用クラウドを開く')}</a>
    </nav>
  </aside>;
}
