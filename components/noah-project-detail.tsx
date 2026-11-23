'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { NoahAgentSource } from '@/lib/noah-agent-cards';
import type { NoahProjectDetail as Detail } from '@/lib/noah-project-view';
import { NOAH_COLLECTION_LABELS } from '@/lib/noah-collection';
import NoahAgentSourceRatings from './noah-agent-source-ratings';
import NoahReadyDetail from './noah-ready-detail';
import NoahLoading from './noah-loading';
import NoahCloudAgent from './noah-cloud-agent';
import NoahProviderRunner from './noah-provider-runner';
import { useNoahLocale } from './noah-locale';
import styles from './noah-project-detail.module.css';
import { NOAH_PIN_TOPIC_LABELS } from '@/lib/noah-pins';
import NoahProductHeader from './noah-product-header';

function ProjectSources({ sources }: { sources: NoahAgentSource[] }) {
  const { t, locale } = useNoahLocale();
  return <section id="ratings" className={styles.provenance} aria-labelledby="project-sources-heading">
    <h2 id="project-sources-heading">{t('掲載元と確認日')}</h2>
    <ul>{sources.map(source => <li key={source.sourceUrl}>
      <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{NOAH_COLLECTION_LABELS[source.source]} <span aria-hidden="true">↗</span></a>
      <time dateTime={new Date(source.observedAt).toISOString()}>{new Intl.DateTimeFormat(locale, {dateStyle:'medium'}).format(source.observedAt)}</time>
    </li>)}</ul>
    <NoahAgentSourceRatings sources={sources} />
  </section>;
}

export default function NoahProjectDetail({ id, firstJob }: { id: string; firstJob?: string }) {
  const { t } = useNoahLocale();
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState(false), [url, setUrl] = useState(''), [frameLoaded, setFrameLoaded] = useState(false), [slow, setSlow] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/noah/discover/project?${new URLSearchParams(firstJob ? { id, firstJob } : { id })}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json() as Detail & { error?: string };
        if (!response.ok) throw Error(body.error || 'Agentを読み込めません。');
        if (!controller.signal.aborted) setDetail(body);
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Agentを読み込めません。'); });
    return () => controller.abort();
  }, [id, firstJob, attempt]);
  useEffect(() => {
    if (!url || frameLoaded) return;
    const timer = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(timer);
  }, [url, frameLoaded]);
  async function openSpace() {
    if (opening) return;
    setOpening(true); setError(''); setUrl(''); setSlow(false); setFrameLoaded(false);
    try {
      const response = await fetch(`/api/noah/discover/project?${new URLSearchParams({ id, open: 'space' })}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || typeof body.url !== 'string') throw Error(body.error || '利用画面を確認できません。');
      // A second boundary before rendering third-party content. Never navigate the top-level page.
      const target = new URL(body.url);
      if (target.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.hf\.space$/.test(target.hostname) || target.port || target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw Error('利用画面を確認できません。');
      setUrl(target.href);
    } catch (e) { setError(e instanceof Error ? e.message : '接続できませんでした。'); }
    finally { setOpening(false); }
  }
  const usageLink = <a href="#noah-project-use">{t('利用条件を見る')}</a>;
  if (firstJob) {
    const job = detail?.firstJob?.id === firstJob ? detail.firstJob : undefined;
    return <main className={styles.page}>
      <Link className={styles.back} href="/noah#first-jobs">← {t('目的を選び直す')}</Link>
      {!detail && !error && <NoahLoading label={t('仕事の受付を確認しています…')} />}
      {error && <div className={styles.error} role="alert"><p>{t(error)}</p><button type="button" onClick={() => { setError(''); setAttempt(n => n + 1); }}>{t('読み直す')}</button></div>}
      {detail && (!job ? <p><output>{t('この仕事は現在利用できません。別の目的を選んでください。')}</output></p> : <>
        <NoahProductHeader name={detail.card.name || job.id} title={t(job.title)} topic={detail.card.topic}
          attribution={[detail.card.name, detail.card.provider].filter(Boolean).join(' · ')}
          action={usageLink} />
        <dl className={styles.jobFacts} id="noah-project-use" tabIndex={-1}>
          <div><dt>{t('用意するもの')}</dt><dd>{t(job.input)}</dd></div>
          <div><dt>{t('受け取れるもの')}</dt><dd>{t(job.output)}</dd></div>
        </dl>
        {job.operation && detail.connection.kind === 'setup' && <NoahProviderRunner key={id} projectId={id} operation={job.operation}/>}
        {job.id === 'memory' && detail.connection.kind === 'cloud' && detail.connection.profile === 'memory' && <NoahCloudAgent key={id} projectId={id} profile="memory" providerFamilyId={null}/>}
      </>)}
      <Link className={styles.back} href="/noah/saved?tab=results">{t('保存した成果を見る')}</Link>
    </main>;
  }
  const sourceNotes = detail?.card.sources?.length ? <ProjectSources sources={detail.card.sources} /> : null;
  if (detail?.connection.kind === 'ready') {
    return <NoahReadyDetail id={detail.connection.familyId} internalOnly sourceNotes={sourceNotes} />;
  }
  return <div className={styles.page}>
    <Link className={styles.back} href="/noah">← Agentを探す</Link>
    {!detail && !error && <NoahLoading label="Agentを確認しています…" />}
    {error && <div role="alert" className={styles.error}><p>{error}</p>{!detail && <button onClick={() => { setDetail(null); setError(''); setAttempt(n => n + 1); }}>読み直す</button>}</div>}
    {detail && <>
      <NoahProductHeader name={detail.card.name} topic={detail.card.topic}
        attribution={detail.card.provider ? `${t('提供:')} ${detail.card.provider}` : undefined}
        action={usageLink} />
      <div className={styles.overview}>
        {detail.card.topic && <p className={styles.category}>{t('カテゴリ')} · {t(NOAH_PIN_TOPIC_LABELS[detail.card.topic])}</p>}
        {detail.card.summary && <p className={styles.summary}>{detail.card.summary}</p>}
      </div>
      <div id="noah-project-use" tabIndex={-1} className={styles.usage}>
        {detail.connection.kind === 'cloud'
          ? <NoahCloudAgent key={id} projectId={id} profile={detail.connection.profile} providerFamilyId={detail.connection.providerFamilyId} />
          : <NoahProviderRunner key={id} projectId={id}/>}
      </div>
      {sourceNotes}
      {detail.connection.kind === 'cloud' ? null : detail.connection.kind === 'space' ? <><details><summary>提供元の画面を開く</summary><section className={styles.connection} aria-label="Noah内で使う">
        <h2>Noahで使う</h2><p>この画面でAgentの利用画面を開きます。入力は提供者のHugging Face Spaceに送られます。</p>
        <button className={styles.primary} hidden={Boolean(url)} disabled={opening} onClick={() => void openSpace()}>{opening ? '接続先を確認しています…' : '利用画面を開く'}</button>
        {error && <p><Link className={styles.back} href={`/noah/agents/new?${new URLSearchParams({ sourceUrl: `https://huggingface.co/spaces/${detail.connection.repository}`, name: detail.card.name })}`}>Noahで取込・設定する</Link></p>}
        {url && <><div className={styles.frameHeader}><span>利用画面 · {new URL(url).hostname}</span><button disabled={opening} onClick={() => void openSpace()}>再読み込み</button><button onClick={() => { setUrl(''); setFrameLoaded(false); setSlow(false); }}>閉じる</button></div>
          {!frameLoaded && <NoahLoading compact label="利用画面を読み込んでいます…" />}
          {slow && <output>起動に時間がかかっています。表示できない場合は「再読み込み」を押してください。</output>}
          <iframe className={styles.frame} title={`${detail.card.name}の利用画面`} src={url} sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" referrerPolicy="no-referrer" onLoad={() => { setFrameLoaded(true); setSlow(false); }} />
          <p className={styles.muted}>利用画面に停止や認証の案内が出る場合は、その状態に従ってください。画面の表示だけでは処理の成功を意味しません。</p></>}
      </section></details></> : <details className={styles.connection}><summary>自分で実行設定を追加する</summary>
        <p>通常は「使う」から提供元の接続先を確認できます。自分で接続を追加する場合だけ、取込・設定を開いてください。</p>
        <Link className={styles.back} href={detail.connection.importHref ?? '/noah/agents/new'}>取込・設定</Link>
      </details>}
    </>}
  </div>;
}
