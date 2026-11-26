'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { NoahPinMotion, type NoahCoverView } from './noah-art-motion';
import NoahAgentFeedback from './noah-agent-feedback';
import { useNoahAppearance } from './noah-appearance';
import { useNoahLocale } from './noah-locale';
import { noahTrainingFilm } from '@/lib/noah-theater-films';
import styles from './noah-project-detail.module.css';

function DetailFeedback({ id }: { id: string }) {
  const { t } = useNoahLocale();
  const direct = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id);
  const [project, setProject] = useState(direct ? id : ''), [failed, setFailed] = useState(false);
  useEffect(() => {
    if (direct) return;
    const controller = new AbortController();
    void fetch(`/api/noah/discover/project?${new URLSearchParams({ family: id })}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const body = await response.json() as { card?: { feedbackId?: string } };
        if (!response.ok || !/^project-[a-f0-9]{64}$/.test(body.card?.feedbackId || '')) throw Error();
        if (!controller.signal.aborted) setProject(body.card!.feedbackId!);
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [id, direct]);
  return project ? <NoahAgentFeedback id={project} embedded /> : <section className={styles.privateFeedback}>
    <h2>{t('口コミ・評価')}</h2><p>{t(failed ? '評価を読み込めませんでした。' : '読み込んでいます…')}</p>
  </section>;
}

/** One presentation for catalog, connected and private Agents. Actions stay owned by each caller. */
export default function NoahDetailTemplate({ id, name, provider, summary, action, children, meta, feedbackId,
  icon, overviewTitle, intro, requestForm, detailsLabel,
  cover, mediaId = id, expanded = false, backHref = '/noah', backLabel = 'Agentを探す', category, privateAgent = false,
}: { id: string; name: string; provider?: string; summary?: string; action?: ReactNode; children?: ReactNode;
  meta?: ReactNode; feedbackId?: string; cover?: NoahCoverView; mediaId?: string; expanded?: boolean;
  backHref?: string; backLabel?: string; category?: string; privateAgent?: boolean;
  icon?: ReactNode; overviewTitle?: string; intro?: ReactNode; requestForm?: ReactNode; detailsLabel?: string;
}) {
  const theme = useNoahAppearance(), { t } = useNoahLocale();
  const more = useRef<HTMLDetailsElement>(null);
  const film = mediaId === noahTrainingFilm.projectId ? noahTrainingFilm : null;
  return <main className={styles.fullscreenDetail} data-noah-fullscreen-detail data-theme={theme}>
    <section className={styles.screen} aria-label={film ? t('予告編') : name}>
      {film ? <video className={styles.screenVideo} autoPlay loop playsInline muted preload="auto" disablePictureInPicture
        aria-label={t(film.title)} poster={film.poster} src={film.video} />
        : cover?.type.startsWith('video/') ? <video className={styles.screenVideo} autoPlay loop playsInline muted preload="metadata" disablePictureInPicture src={cover.url} aria-label={name} />
        : <div className={styles.screenArt}><NoahPinMotion id={id} name={name} summary={summary} cover={cover} /></div>}
      <div className={styles.screenTop}><Link className={styles.screenLink} href={backHref}>← {t(backLabel)}</Link></div>
    </section>
    <div className={`${styles.page} ${styles.compactPage}`} id="noah-project-details" tabIndex={-1}>
      <header className={styles.identityRow}><div className={styles.templateIdentity}>{icon}<div><h1>{name}</h1>{provider && <p>{t('提供:')} {provider}</p>}{meta && <div className={styles.templateMeta}>{meta}</div>}</div></div>
        <div className={styles.templateAction}>{action || <button className={styles.primary} onClick={() => {
          if (more.current) { more.current.open = true; more.current.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
        }}>{t('利用条件を見る')}</button>}</div>
      </header>
      <section className={styles.overview} aria-label={t('詳細')}><h2>{overviewTitle ?? t('詳細')}</h2>
        {category && <p className={styles.category}>{category}</p>}
        {summary && <p className={`${styles.summary} ${styles.templateSummary}`} title={summary}>{summary}</p>}
      </section>
      {intro}
      {requestForm}
      {children && <details ref={more} className={styles.templateMore} id="noah-detail-more" open={expanded || undefined}>
        <summary>{detailsLabel ?? t('使い方を読む')}</summary><div>{children}</div>
      </details>}
      {feedbackId ? <DetailFeedback key={feedbackId} id={feedbackId} />
        : privateAgent ? <section className={styles.privateFeedback}><h2>{t('口コミ・評価')}</h2><p>{t('自分のAgent')}</p></section> : null}
    </div>
  </main>;
}
