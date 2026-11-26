'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { noahInviteCoverUrl, noahPrivateCoverUrl, noahReleaseCoverUrl, type NoahCover } from '@/lib/noah-cover';
import type { NoahUpload } from '@/lib/noah-agent-store';
import type { SkyLibraryAgent } from '@/lib/sky-agent-library';
import type { NoahSharedAgent } from '@/lib/noah-invites';
import { NoahAgentPin, NoahAgentPinGrid } from './noah-agent-pin';
import WorkspaceShell from './workspace-shell';
import { NoahInstallationsList } from './noah-managed-installation';
import { NoahInstancesList } from './noah-instances';
import { adapterLabels } from './noah-agent-catalog';
import styles from './noah-agent-catalog.module.css';
import myStyles from './noah-my.module.css';
type Library = { ownerScope: string; uploads: NoahUpload[]; roles: SkyLibraryAgent[]; shared: NoahSharedAgent[]; releases?: {cover?:NoahCover;packageKey:string;manifestSha256:string;name:string;version:string}[] };

export default function NoahLibrary({embedded=false}:{embedded?:boolean}={}) {
  const Container=embedded?'section':'main';
  const [data, setData] = useState<Library | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0), [query, setQuery] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/noah/library', { cache: 'no-store', signal: controller.signal }).then(async r => {
      const result = await r.json() as Library & { error?: string };
      if (!r.ok) throw new Error(result.error || '読み込めません。');
      const sharedResponse = await fetch('/api/noah/invites?received=1', { cache: 'no-store', signal: controller.signal });
      const received = await sharedResponse.json() as { shared: NoahSharedAgent[]; ownerScope: string; error?: string };
      if (!sharedResponse.ok || received.ownerScope !== result.ownerScope) throw new Error(received.error || 'アカウントが変わりました。読み直してください。');
      if (!controller.signal.aborted) { setData({ ...result, shared: received.shared }); setError(''); }
    }).catch(e => { if (!controller.signal.aborted) { setData(null); setError(e.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  const matches = data?.uploads.filter(a => `${a.manifest.name} ${a.manifest.summary}`.toLowerCase().includes(query.trim().toLowerCase())) || [];
  const content = <Container className={styles.page} aria-label={embedded ? "自分のAgent" : undefined}>
    {!embedded && <nav className={styles.nav}><Link href="/noah/explore">見つける</Link><Link href="/noah/activity">仕事・成果</Link><Link href="/noah/usage">利用状況</Link><Link href="/noah">マーケット</Link><Link href="/noah/purchases">購入履歴</Link><Link href="/noah/publisher">公開する</Link></nav>}
    {embedded ? <div className={myStyles.libraryActions}><Link href="/noah/agents/new">Agentを追加</Link></div> : <header className={styles.hero}><div><span className={styles.eyebrow}>YOUR AGENTS</span><h1>自分のAgent</h1><p>接続したAgentに仕事を頼む。自作Agentの内容や接続先を管理する。</p></div><Link className={styles.primary} href="/noah/agents/new">Agentを追加</Link></header>}
    <NoahInstancesList />
    <NoahInstallationsList />
    {!!data?.releases?.length && <section className={styles.notice}>
      <h2>購入・出品した配布版</h2><p>接続時に、現在の審査・購入利用権を再確認します。</p>
      <NoahAgentPinGrid>{data.releases.map(release => <NoahAgentPin key={release.packageKey} id={release.packageKey}
        name={release.name} cover={release.cover && { type:release.cover.type, url:noahReleaseCoverUrl(release.packageKey,release.manifestSha256) }} href={`/noah/releases/${release.manifestSha256}`} meta={`v${release.version} · 詳細・接続`} />)}</NoahAgentPinGrid>
    </section>}
    <section aria-label="自作・登録したAgent"><div className={styles.sectionTitle}><h2>自分が登録したAgent</h2><Link href="/noah/agents/new">下書きを再開・新規登録</Link></div>
      <label className={styles.search}>検索<input aria-label="登録したAgentを検索" value={query} onChange={e => setQuery(e.target.value)} placeholder="名前・任せたい仕事" /></label>
      {loading && <output>登録を読み込み中…</output>}
      {error && <p className={styles.error} role="alert">{error} <button onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>再試行</button></p>}
      {!loading && !error && !matches.length && <p className={styles.empty}>{query ? '条件に合う登録はありません。' : '自作Agentはまだ登録していません。コード・ZIP・公開リポジトリから追加できます。'}</p>}
      <NoahAgentPinGrid>{matches.map(agent => <NoahAgentPin key={agent.id} id={agent.id} name={agent.manifest.name}
        cover={agent.manifest.cover && { type:agent.manifest.cover.type, url:noahPrivateCoverUrl(agent.id) }} href={`/noah/agents/${agent.id}`} summary={agent.manifest.summary}
        meta={<>自分だけに表示 · v{agent.manifest.version} · {agent.uploadState !== 'ready' ? 'ファイルの保存待ち' : adapterLabels[agent.manifest.adapter]} · 詳細・接続・削除</>} />)}</NoahAgentPinGrid>
    </section>
    {!!data?.shared.length && <section className={styles.notice}>
      <h2>招待で受け取ったAgent</h2>
      <NoahAgentPinGrid>{data.shared.map(agent => <NoahAgentPin key={agent.inviteId} id={agent.uploadId} name={agent.manifest.name}
        cover={agent.manifest.cover && { type:agent.manifest.cover.type, url:noahInviteCoverUrl(agent.inviteId) }} href={`/noah/invites/${agent.inviteId}`} summary={agent.manifest.summary}
        meta={<>v{agent.manifest.version} · {agent.executionAllowed ? '接続・実行可' : agent.access === 'source' ? '閲覧・コード取得' : '閲覧'} · {new Date(agent.expiresAt).toLocaleDateString('ja-JP')}まで</>} />)}</NoahAgentPinGrid>
    </section>}
    {!!data?.roles.length && <section className={styles.notice}>
      <h2>保存済みの担当設定 · {data.roles.length}件</h2><p>以前に作成した文章担当やToolの設定も保持しています。</p>
      <NoahAgentPinGrid>{data.roles.map(agent => <NoahAgentPin key={agent.id} id={agent.id} name={agent.name}
        meta={`${agent.model} · ${agent.enabled ? '設定が有効' : '利用停止中'}`} />)}</NoahAgentPinGrid>
      <Link href="/noah/saved?tab=roles">担当設定を編集する</Link>
    </section>}
  </Container>;
  return embedded ? content : <WorkspaceShell title="Noah" tone="sky">{content}</WorkspaceShell>;
}
