'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NoahPinMotion, type NoahCoverView } from './noah-art-motion';
import NoahAgentFeedback from './noah-agent-feedback';
import { useNoahAppearance } from './noah-appearance';
import { useNoahLocale } from './noah-locale';
import { noahTrainingFilm } from '@/lib/noah-theater-films';
import type { NoahPin } from '@/lib/noah-pin-scene';
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

/**
 * One presentation for catalog, connected and private Agents. Actions stay owned by each caller.
 * 「操作の流れと道具」（「使い方を読む」）は、最初から開いておく。開かないと、この Agent でできる事と使い方の流れが見えないため
 * （本人 2026-11-28「最初からトグル開いてるようにして」）。閉じるのは本人の自由。
 */
export default function NoahDetailTemplate({ id, name, provider, summary, artSummary, original, action, children, meta, feedbackId,
  icon, overviewTitle, intro, requestForm, detailsLabel, actionNote, facts, explain,
  cover, pin, mediaId = id, category, privateAgent = false,
}: { id: string; name: string; provider?: string; summary?: string;
  /** 頭の絵を選ぶ元の説明（一覧のカードと同じ英語の説明）。無ければ summary。絵の中の字は、いつも summary（見せる説明）。 */
  artSummary?: string;
  /** summary が訳の時の、提供者が書いた元の説明。「自動翻訳 · 原文」を開くと読める（spec-74: 提供者の文を、いつでも読めるように）。 */
  original?: string; action?: ReactNode; children?: ReactNode;
  meta?: ReactNode; feedbackId?: string; cover?: NoahCoverView; pin?: NoahPin; mediaId?: string;
  category?: string; privateAgent?: boolean;
  icon?: ReactNode; overviewTitle?: string; intro?: ReactNode; requestForm?: ReactNode; detailsLabel?: string;
  /** 「接続」などの主な操作を押すと何が起きるかの 1 行。名前の行のすぐ下に出す（2026-11-28）。 */
  actionNote?: ReactNode;
  /** 料金・道具の数・利用の数などの札。操作のすぐ下に出す（大手のストアの並び。2026-11-28）。 */
  facts?: ReactNode;
  /** 見ただけでやる事がわかる節（こんな事を頼めます・使い方・安全のために）。依頼の欄の下、詳しい情報の上に出す。 */
  explain?: ReactNode;
}) {
  const theme = useNoahAppearance(), { t } = useNoahLocale();
  const more = useRef<HTMLDetailsElement>(null);
  const film = mediaId === noahTrainingFilm.projectId ? noahTrainingFilm : null;
  return <main className={styles.fullscreenDetail} data-noah-fullscreen-detail data-theme={theme}>
    <section className={styles.screen} aria-label={film ? t('予告編') : name}>
      {film ? <video className={styles.screenVideo} autoPlay loop playsInline muted preload="auto" disablePictureInPicture
        aria-label={t(film.title)} poster={film.poster} src={film.video} />
        : cover?.type.startsWith('video/') ? <video className={styles.screenVideo} autoPlay loop playsInline muted preload="metadata" disablePictureInPicture src={cover.url} aria-label={name} />
        : <div className={styles.screenArt}><NoahPinMotion id={id} name={name} summary={artSummary ?? summary} caption={summary} cover={cover}
          diagram={pin ? { scene: pin.scene, tone: 0 } : undefined} /></div>}
    </section>
    <div className={`${styles.page} ${styles.compactPage}`} id="noah-project-details" tabIndex={-1}>
      <header className={styles.identityRow}><div className={styles.templateIdentity}>{icon}<div><h1>{name}</h1>{pin && <p className={styles.noahDescription}>{t('Noah の説明')}</p>}{provider && <p>{t('提供:')} {provider}</p>}{meta && <div className={styles.templateMeta}>{meta}</div>}</div></div>
        <div className={styles.templateAction}>{action || <button className={styles.primary} onClick={() => {
          if (more.current) { more.current.open = true; more.current.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
        }}>{t('利用条件を見る')}</button>}</div>
      </header>
      {actionNote && <p className={styles.actionNote}>{actionNote}</p>}
      {facts && <div className={styles.templateFacts}>{facts}</div>}
      <section className={styles.overview} aria-label={t('詳細')}><h2>{overviewTitle ?? t('詳細')}</h2>
        {category && <p className={styles.category}>{category}</p>}
        {pin && <p className={styles.pinExchange}><span>{pin.give}</span><span aria-hidden="true">→</span><span>{pin.get}</span></p>}
        {summary && <p className={`${styles.summary} ${styles.templateSummary}`} title={summary}>{summary}</p>}
        {summary && original && original !== summary && <details className={styles.summarySource}>
          <summary>{t('自動翻訳')} · {t('原文')}</summary><p>{original}</p>
        </details>}
      </section>
      {intro}
      {requestForm}
      {explain}
      {children && <details ref={more} className={styles.templateMore} id="noah-detail-more" open>
        <summary>{detailsLabel ?? t('使い方を読む')}</summary><div>{children}</div>
      </details>}
      {feedbackId ? <DetailFeedback key={feedbackId} id={feedbackId} />
        : privateAgent ? <section className={styles.privateFeedback}><h2>{t('口コミ・評価')}</h2><p>{t('自分のAgent')}</p></section> : null}
    </div>
  </main>;
}
