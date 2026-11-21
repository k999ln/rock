'use client';
import { useEffect, useRef, useState } from 'react';
import NoahLoading from './noah-loading';
import Link from 'next/link';
import WorkspaceShell from './workspace-shell';
import { downloadNoahFile, noahExecutionLabels } from './noah-execution-panel';
import { startNoahVisiblePolling } from '@/lib/noah-visible-polling';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { WorkJob } from '@/lib/workflow';
import styles from './noah-agent-catalog.module.css';

const agentPath = (id: string) => id.startsWith('invite-') ? `/noah/invites/${id.slice(7)}` : id.startsWith('release-') ? `/noah/releases/${id.slice(8)}` : `/noah/agents/${id}`;
type Summary = { id: string; createdAt: string; title: string; noahExecution: { agentId: string; state: string; prompt: string; exitCode?: number } };
export default function NoahWork({ jobId }: { jobId?: string }) {
  const [jobs, setJobs] = useState<Summary[]>([]), [job, setJob] = useState<WorkJob | null>(null);
  const [scope, setScope] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [tick, setTick] = useState(0), [pending, setPending] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    return startNoahVisiblePolling(async signal => {
      const controller = { signal };
      try {
        const response = await fetch(jobId ? `/__noah/executions/${encodeURIComponent(jobId)}` : '/__noah/executions?summary=1', { cache: 'no-store', signal: controller.signal });
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('このMacの実行ホストに接続してください。');
        const data = await response.json() as { jobs?: Summary[]; job?: WorkJob; ownerScope?: string; error?: string };
        if (!response.ok || !data.ownerScope) throw new Error(data.error || '実行ホストに接続できません。');
        if (!controller.signal.aborted) { setScope(data.ownerScope); setJobs(data.jobs || []); setJob(data.job || null); setError(''); }
      } catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : '仕事を確認できません。'); setScope(''); setJobs([]); setJob(null); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 5000);
  }, [jobId, tick]);
  async function stop() {
    if (!scope || !jobId || busy.current) return;
    busy.current = true; setPending(true);
    try {
      const response = await fetch(`/__noah/executions/${jobId}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope }, body: '{}' });
      const data = await response.json() as { error?: string; ownerScope?: string };
      if (!response.ok || data.ownerScope !== scope) throw new Error(data.error || '停止を確認できません。');
      setTick(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : '停止を確認できません。'); }
    finally { busy.current = false; setPending(false); }
  }
  const execution = job?.noahExecution;
  return <WorkspaceShell title="Noah" tone="sky"><main className={styles.page}>
    <nav className={styles.nav}><Link href="/noah/explore">見つける</Link><Link href="/noah/saved?tab=agents">自分のAgent</Link><Link href="/noah/work">仕事</Link><Link href="/noah/usage">利用状況</Link><Link href="/noah/outbox">送信履歴</Link></nav>
    <header className={styles.hero}><div><h1>{jobId ? '仕事の結果' : 'Agentに頼んだ仕事'}</h1><p>このMacで受け付けた依頼と成果を、画面を開き直しても確認できます。</p></div></header>
    {loading && <NoahLoading label="仕事を読み込み中…" />}
    {error && <p role="alert" className={styles.error}>{error} <button onClick={() => setTick(n => n + 1)}>再試行</button></p>}
    {!jobId && !loading && !error && !jobs.length && <p>依頼した仕事はまだありません。Agentの詳細から接続して依頼できます。</p>}
    {jobs.map(item => <article key={item.id} className={styles.notice}><h2><Link href={`/noah/work/${item.id}`} style={{ display: 'block' }}>{item.title}</Link></h2><p>{item.noahExecution.prompt}</p><p>{item.noahExecution.exitCode !== undefined && item.noahExecution.exitCode !== 0 ? 'エラーを含む結果' : noahExecutionLabels[item.noahExecution.state]} · {new Date(item.createdAt).toLocaleString('ja-JP')}</p><Link href={agentPath(item.noahExecution.agentId)}>担当Agentを見る</Link></article>)}
    {execution && <article className={styles.notice}><h2>{noahExecutionLabels[execution.state]}</h2><p>{execution.prompt}</p>
      <Link href={agentPath(execution.agentId)}>担当Agentを見る</Link>
      {['queued', 'running'].includes(execution.state) && <button disabled={pending || !scope} onClick={() => { void stop(); }}>{pending ? '停止を確認中…' : '実行を停止'}</button>}
      {execution.error && <p role="alert">{execution.error}</p>}
      {execution.result && <>{execution.result.exitCode !== 0 && <p role="alert">Agentがエラーを返しました。途中の出力を含みます。</p>}{execution.result.files.map(file => <p key={file.name}><button onClick={() => downloadNoahFile(file)}>{file.name} を保存（{file.bytes.toLocaleString()}バイト）</button></p>)}<details><summary>Agentの応答・実行ログ</summary><p>{execution.provider ? 'Codexへの依頼' : 'モデル呼出'} {execution.calls}回 · 終了コード {execution.result.exitCode}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 480, overflow: 'auto' }}>{execution.result.text}</pre></details></>}
      <p>実行ID: {job!.id}。Agentが返した成果です。内容を確認して利用してください。</p>
    </article>}
  </main></WorkspaceShell>;
}
