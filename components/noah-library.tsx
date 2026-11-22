'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { NoahUpload } from '@/lib/noah-agent-store';
import type { SkyLibraryAgent } from '@/lib/sky-agent-library';
import type { NoahSharedAgent } from '@/lib/noah-invites';
import WorkspaceShell from './workspace-shell';
import { NoahInstallationsList } from './noah-managed-installation';
import { NoahInstancesList } from './noah-instances';
import { adapterLabels } from './noah-agent-catalog';
import styles from './noah-agent-catalog.module.css';
type Library = { ownerScope: string; uploads: NoahUpload[]; roles: SkyLibraryAgent[]; shared: NoahSharedAgent[]; releases?: {packageKey:string;manifestSha256:string;name:string;version:string}[] };

export default function NoahLibrary({embedded=false}:{embedded?:boolean}={}) {
  const Heading=embedded?'h2':'h1';
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
  return <WorkspaceShell title="Noah" tone="sky"><main className={styles.page}>
    {!embedded && <nav className={styles.nav}><Link href="/noah/explore">見つける</Link><Link href="/noah/activity">仕事・成果</Link><Link href="/noah/usage">利用状況</Link><Link href="/noah/marketplace">マーケット</Link><Link href="/noah/purchases">購入履歴</Link><Link href="/noah/publisher">公開する</Link></nav>}
    <header className={styles.hero}><div><span className={styles.eyebrow}>YOUR AGENTS</span><Heading>自分のAgent</Heading><p>接続したAgentに仕事を頼む。自作Agentの内容や接続先を管理する。</p></div><Link className={styles.primary} href="/noah/agents/new">Agentを追加</Link></header>
    <NoahInstancesList />
    <NoahInstallationsList />
    {!!data?.releases?.length && <section className={styles.notice}><h2>購入・出品した配布版</h2><p>接続時に、現在の審査・購入利用権を再確認します。</p><ul>{data.releases.map(r=><li key={r.packageKey}><Link href={`/noah/releases/${r.manifestSha256}`}>{r.name} · v{r.version} — 詳細・接続</Link></li>)}</ul></section>}
    <section aria-label="自作・登録したAgent"><div className={styles.sectionTitle}><h2>自分が登録したAgent</h2><Link href="/noah/agents/new">下書きを再開・新規登録</Link></div>
      <label className={styles.search}>検索<input aria-label="登録したAgentを検索" value={query} onChange={e => setQuery(e.target.value)} placeholder="名前・任せたい仕事" /></label>
      {loading && <output>登録を読み込み中…</output>}
      {error && <p className={styles.error} role="alert">{error} <button onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>再試行</button></p>}
      {!loading && !error && !matches.length && <p className={styles.empty}>{query ? '条件に合う登録はありません。' : '自作Agentはまだ登録していません。コード・ZIP・公開リポジトリから追加できます。'}</p>}
      <div className={styles.grid}>{matches.map(a => <Link key={a.id} className={styles.card} href={`/noah/agents/${a.id}`}><span className={styles.tag}>自分だけに表示 · v{a.manifest.version}</span><h2>{a.manifest.name}</h2><p>{a.manifest.summary}</p><span className={styles.cardFooter}>{a.uploadState !== 'ready' ? 'ファイルの保存待ち' : adapterLabels[a.manifest.adapter]} · 詳細・接続・削除</span></Link>)}</div>
    </section>
    {!!data?.shared.length && <section className={styles.notice}><h2>招待で受け取ったAgent</h2><ul>{data.shared.map(a=><li key={a.inviteId}><Link href={`/noah/invites/${a.inviteId}`}>{a.manifest.name} · v{a.manifest.version}</Link> · {a.executionAllowed?'接続・実行可':a.access==='source'?'閲覧・コード取得':'閲覧'} · {new Date(a.expiresAt).toLocaleDateString('ja-JP')}まで</li>)}</ul></section>}
    {!!data?.roles.length && <section className={styles.notice}><h2>保存済みの担当設定 · {data.roles.length}件</h2><p>以前に作成した文章担当やToolの設定も保持しています。</p><ul>{data.roles.map(a => <li key={a.id}>{a.name} · {a.model} · {a.enabled ? '設定が有効' : '利用停止中'}</li>)}</ul><Link href="/noah/saved?tab=roles">担当設定を編集する</Link></section>}
  </main></WorkspaceShell>;
}
