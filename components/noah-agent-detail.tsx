'use client';
/* oxlint-disable next/no-html-link-for-pages -- API downloads and external apps require document navigation. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { aniccaAgent } from '@/lib/noah-agent-upload';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { NoahUpload } from '@/lib/noah-agent-store';
import { adapterLabels } from './noah-agent-catalog';
import { permissionLabels } from './noah-agent-upload-form';
import styles from './noah-agent-catalog.module.css';
import NoahLocalConnectionPanel from './noah-local-connection';
import NoahManagedInstallation from './noah-managed-installation';
import { NoahInviteManager } from './noah-invites';
import { NOAH_TEST_MANIFEST_SHA256 } from '@/lib/noah-local-connection';
export default function NoahAgentDetail({ id, remote = false }: { id: string; remote?: boolean }) {
  const router = useRouter(), builtin = id === 'anicca';
  const [upload, setUpload] = useState<NoahUpload | null>(null), [scope, setScope] = useState('');
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [pending, setPending] = useState(false);
  const [launchUrl, setLaunchUrl] = useState(''), [attempt, setAttempt] = useState(0), [confirmDelete, setConfirmDelete] = useState(false);
  const [retrySource, setRetrySource] = useState<File | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (builtin) return () => controller.abort();
    fetch(`/api/noah/agents/${id}`, { cache: 'no-store', signal: controller.signal }).then(async r => {
      const data = await r.json() as { agent: NoahUpload; ownerScope: string; error?: string }; if (!r.ok) throw new Error(data.error || '取得できません。');
      if (!controller.signal.aborted) { setUpload(data.agent); setScope(data.ownerScope); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [id, builtin, attempt]);
  const m = builtin ? aniccaAgent : upload?.manifest;
  const testConnection = upload?.manifestSha256 === NOAH_TEST_MANIFEST_SHA256;
  async function connect() {
    if (!m || pending || (upload && upload.uploadState !== 'ready')) return;
    setPending(true); setError(''); setMessage(''); setLaunchUrl('');
    try {
      if (m.adapter === 'source') { setMessage('コードを保存しました。実行方式と必要な環境の設定が必要です。'); return; }
      if (m.adapter === 'web') { setLaunchUrl(m.endpointUrl!); setMessage('専用画面でサインインや必要な設定を行ってください。実行状態はAgent側で確認できます。'); return; }
      const url = m.adapter === 'local_app' ? '/__noah/local-apps/anicca/connect' : m.adapter === 'mcp_http' ? '/api/sky/mcp/inspect' : '/api/sky/a2a-agents';
      const payload = m.adapter === 'local_app' ? {} : m.adapter === 'mcp_http' ? { endpointUrl: m.endpointUrl } : { origin: new URL(m.endpointUrl!).origin };
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({ error: 'この接続は対応するPCホストで利用してください。' })) as { error?: string; url: string; status: string; toolCount: number; message?: string; agent: { agentName: string } };
      if (!response.ok) throw new Error(data.error || '接続できませんでした。');
      if (m.adapter === 'local_app') {
        if (data.url !== 'http://127.0.0.1:18791') throw new Error('起動先を確認できません。');
        setLaunchUrl(data.url); setMessage('このMacで初期設定画面が起動しました。業務アカウントやモデルの設定を続けてください。');
      } else if (m.adapter === 'mcp_http') {
        setMessage(data.status === 'ready' ? `MCPの接続を確認しました。${data.toolCount}個のToolがあります。Eveで実行するには、Tool定義と権限の登録・審査が必要です。` : data.message || '接続先で認証・設定が必要です。');
      } else { setMessage(`${data.agent.agentName}のAgent Cardを登録しました。業務実行には対応するTool定義と実行許可の設定が必要です。`); }
    } catch (e) { setError(e instanceof Error ? e.message : '接続できませんでした。'); }
    finally { setPending(false); }
  }
  async function disconnectLocal() {
    setPending(true); setError('');
    try { const r = await fetch('/__noah/local-apps/anicca/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!r.ok) throw new Error('停止を確認できませんでした。'); setLaunchUrl(''); setMessage('Noahから起動した初期設定画面を停止しました。');
    } catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  async function remove() {
    if (!scope || pending) return; setPending(true); setError('');
    try {
      if (testConnection) {
        const stopped = await fetch(`/__noah/connections/${id}/disconnect`, { method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope }, body: '{}' });
        if (!stopped.ok) throw new Error('テストAgentの停止を確認してから削除してください。');
      }
      const r = await fetch(`/api/noah/agents/${id}`, { method: 'DELETE', headers: { [OWNER_SCOPE_HEADER]: scope } }); const d = await r.json() as { error?: string }; if (!r.ok) throw new Error(d.error); router.push('/noah/agents'); }
    catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  async function retryUpload() {
    if (!upload || !scope || !retrySource || pending) return;
    setPending(true); setError('');
    try {
      const form = new FormData(); form.set('id', upload.id); form.set('manifest', JSON.stringify(upload.manifest)); form.set('rightsConfirmed', 'true'); form.set('source', retrySource);
      const response = await fetch('/api/noah/agents', { method: 'POST', headers: { [OWNER_SCOPE_HEADER]: scope }, body: form });
      const data = await response.json() as { agent: NoahUpload; error?: string };
      if (!response.ok) throw new Error(data.error || 'ファイルを保存できません。');
      setUpload(data.agent); setRetrySource(null); setMessage('ファイルの保存が完了しました。');
    } catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  return <div className={`${styles.page} ${styles.formPage}`}>
    <nav className={styles.nav}><Link href="/noah/agents">← Agent一覧</Link><Link href="/noah/library">自分のAgent</Link></nav>
    {error && <div role="alert" className={styles.error}>{error} {!m && <button onClick={() => setAttempt(n => n + 1)}>再試行</button>}</div>}
    {!m && !error && <output>読み込んでいます…</output>}
    {m && <>
      <header className={styles.hero}><div><span className={styles.eyebrow}>{builtin ? 'EXTERNAL AGENT' : 'PRIVATE / YOUR AGENT'}</span><h1>{m.name}</h1><p>{m.summary}</p></div></header>
      <div className={styles.facts}><div><small>接続方式</small><strong>{builtin ? '背景実行・本人Codex接続' : m.runtime ? 'ターミナル用テンプレート' : testConnection ? 'テストAgent接続' : adapterLabels[m.adapter]}</strong></div><div><small>作者 / 版</small><strong>{m.author} / {m.version}</strong></div><div><small>実行する場所</small><strong>{builtin || m.runtime ? 'このMacの隔離環境' : testConnection ? 'クラウド / このMac' : m.adapter === 'source' ? '未設定' : m.adapter === 'local_app' ? '隔離環境の対応待ち' : '接続先のサービス'}</strong></div></div>
      {testConnection && upload?.uploadState === 'ready' && <NoahLocalConnectionPanel key={id + scope} id={id} ownerScope={scope} />}
      {builtin && !remote && <NoahManagedInstallation key={id} id={id} />}
      <section className={styles.notice}><h2>利用条件</h2>{!builtin && upload?.uploadState === 'ready' && <p><Link href={`/noah/outbox?agent=${id}`}>このAgentの情報を送る →</Link></p>}<p>{m.priceNote}</p><p>必要な権限：{m.permissions.map(p => permissionLabels[p]).join('、') || '申告なし'}</p><p>ライセンス：{m.license}</p>
        {m.endpointUrl && <p>{testConnection ? '元の登録URL（テストでは使用しません）' : '接続先'}：<a href={m.endpointUrl} target="_blank" rel="noopener noreferrer">{m.endpointUrl}</a></p>}
        {m.sourceUrl && <p><a href={m.sourceUrl} target="_blank" rel="noopener noreferrer">ソースを見る ↗</a></p>}
      </section>
      {upload?.uploadState === 'pending' ? <div className={styles.notice}><p>ファイルの保存が未完了です。元と同じ「{upload.original?.name || upload.source?.name}」を選んで再試行してください。</p><label>再送する原本ファイル<input type="file" disabled={pending} onChange={e => setRetrySource(e.target.files?.[0] || null)} /></label><button disabled={!retrySource || pending} onClick={() => void retryUpload()}>アップロードを再試行</button></div> :
        !testConnection && !builtin && m.adapter !== 'source' && <div className={styles.actions}><button className={styles.primary} disabled={pending} onClick={() => void connect()}>{pending ? '確認しています…' : '接続する'}</button>
          {launchUrl && <a className={styles.primary} href={launchUrl} target="_blank" rel="noopener noreferrer">{m.adapter === 'local_app' ? 'Aniccaの設定画面を開く ↗' : 'Agentを使う ↗'}</a>}
          {launchUrl && m.adapter === 'local_app' && <button disabled={pending} onClick={() => void disconnectLocal()}>設定画面を停止</button>}</div>}
      {remote && (builtin || m.runtime) && <p><Link href={`/noah/activity?agent=${id}`}>自分のMacを選んで接続・実行</Link></p>}
      {!remote && m.adapter === 'source' && (m.runtime && upload?.uploadState === 'ready' ? <NoahManagedInstallation key={id + scope} id={id} terminal /> : <p className={styles.notice}>コードを保存しています。実行方式と必要な環境の準備が完了すると接続できます。</p>)}
      {message && <output className={styles.notice}>{message}</output>}
      
      {upload && <section className={styles.notice}><h2>登録したファイル</h2><p>{upload.source ? `${upload.source.name} · ${(upload.source.bytes / 1024).toFixed(1)} KiB` : '接続先と定義を保存しています。'}</p>
        <p><Link href={`/noah/usage?scope=publisher&agent=${encodeURIComponent(`noah-upload:${upload.id}`)}`}>このAgentの利用状況を見る →</Link></p>
        <details><summary>外部Agentから利用状況を送る</summary><p>サーバー側の報告キーは <code>noah-upload:{upload.id}</code>。既存の開発者キーと利用報告APIを使います。<Link href="/sky/publish">開発者キーの管理</Link></p><p>接続だけでは使用量は届きません。作者がAgentの実行完了・失敗時に報告処理を組み込みます。</p></details>
        {upload.processing && <div><h3>{{ refactored: 'リファクタして保存しました', unchanged: '変更なしで保存しました', unsupported: '自動整理の対象外・原本を保存', failed: '整理・検証を完了できず・原本を保存' }[upload.processing.status]}</h3><p>{upload.processing.message}</p>
          {upload.processing.changes.length > 0 && <details><summary>変更内容を見る（{upload.processing.changes.length}件）</summary>{upload.processing.changes.map((c, i) => <div key={i}><p>{c.file && `${c.file} · `}{c.line}行目 · {c.rule === 'agent-refactor' ? 'Agentによる整理・固定テスト確認済み' : 'booleanを返す条件分岐'}</p><p>変更前</p><pre>{c.before}</pre><p>変更後</p><pre>{c.after}</pre></div>)}</details>}
          {upload.processing.files && <details><summary>ファイル別の処理結果</summary>{upload.processing.files.map(f => <p key={f.name}>{f.name} · {f.message}</p>)}</details>}
          <small>処理器: {upload.processing.engine} · 実行・公開の合格ではありません。</small>
        </div>}
        <div className={styles.actions}>{upload.source && upload.uploadState === 'ready' && <a href={`/api/noah/agents/${id}/source`}>保存したコード・ファイルをダウンロード</a>}
          {upload.original && <a href={`/api/noah/agents/${id}/source?variant=original`}>元コード・原本をダウンロード</a>}</div>
        {upload.original && <details><summary>コードの照合情報</summary><code className={styles.digest}>原本 SHA-256: {upload.original.sha256}</code><code className={styles.digest}>保存版 SHA-256: {upload.source?.sha256}</code></details>}
        <details><summary>定義・照合情報</summary><code className={styles.digest}>SHA-256: {upload.manifestSha256}</code><pre>{JSON.stringify(m, null, 2)}</pre></details>
        <p><Link href="/noah/publisher">マーケットへの掲載を申請する →</Link></p>
        <p className={styles.muted}>掲載申請は別途入力・審査が必要です。本人用ファイルは自動公開されません。</p>
        {!confirmDelete ? <button onClick={() => setConfirmDelete(true)}>自分の一覧から削除</button> : <div className={styles.actions}><span>この登録を削除します。外部Agent本体は停止しません。</span><button disabled={pending} onClick={() => void remove()}>削除する</button><button onClick={() => setConfirmDelete(false)}>戻る</button></div>}
      </section>}
      {upload?.uploadState === 'ready' && scope && <NoahInviteManager key={`${id}/${scope}`} agentId={id} scope={scope} hasSource={Boolean(upload.source)} hasRuntime={Boolean(upload.manifest.runtime)} />}
    </>}
  </div>;
}
