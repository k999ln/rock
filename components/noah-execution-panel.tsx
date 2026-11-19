'use client';
import { useEffect, useRef, useState } from 'react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { startNoahVisiblePolling } from '@/lib/noah-visible-polling';
import type { WorkJob } from '@/lib/workflow';
import type { NoahFile } from '@/lib/noah-execution';
import styles from './noah-agent-catalog.module.css';
import NoahOperationPanel from './noah-operation-panel';
import { noahModel } from '@/lib/noah-model-catalog.mjs';

type Execution = { model: string; providerModel?: string; capability: string; limits: { seconds: number; modelCalls: number } };
export const noahExecutionLabels: Record<string, string> = { queued: '実行待ち', running: 'Agentが処理しています', returned: '結果を受け取りました', failed: '実行できませんでした', cancelled: '停止しました', unknown: '結果を確認できません' };
const labels = noahExecutionLabels;
const active = (job: WorkJob | undefined) => ['queued', 'running'].includes(job?.noahExecution?.state || '');
export function downloadNoahFile(file: NoahFile) {
  const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
  // Always download as an attachment. Never execute or render Agent HTML.
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })), a = document.createElement('a');
  a.href = url; a.download = file.name.split('/').at(-1) || 'result'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const download = downloadNoahFile;
function filePreview(file: NoahFile) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(file.base64), c => c.charCodeAt(0)));
    return text.includes(String.fromCharCode(0)) ? null : text.slice(0, 2000);
  } catch { return null; }
}
export default function NoahExecutionPanel({ id, scope, execution }: { id: string; scope: string; execution?: Execution }) {
  const [prompt, setPrompt] = useState(''), [jobs, setJobs] = useState<WorkJob[]>([]), [error, setError] = useState(''), [pollError, setPollError] = useState(''), [pending, setPending] = useState(false), [tick, setTick] = useState(0);
  const [providerConsent, setProviderConsent] = useState(false);
  const ownCodex = execution?.model === 'codex-account';
  const anicca = id === 'anicca';
  const intent = useRef<{ id: string; prompt: string } | null>(null), busy = useRef(false);
  useEffect(() => {
    if (!scope) return;
    return startNoahVisiblePolling(async signal => {
      try {
        const response = await fetch(`/__noah/executions?agentId=${encodeURIComponent(id)}`, { cache: 'no-store', signal });
        const data = await response.json() as { jobs?: WorkJob[]; ownerScope?: string; error?: string };
        if (!response.ok || data.ownerScope !== scope || !Array.isArray(data.jobs)) throw new Error(data.error || '実行記録を確認できません。');
        if (!signal.aborted) {
          setJobs(data.jobs.filter((j: WorkJob) => j.noahExecution?.agentId === id).sort((a: WorkJob, b: WorkJob) => b.createdAt.localeCompare(a.createdAt)));
          setPollError('');
        }
        return data.jobs.some(active) ? 2000 : 10000;
      } catch (e) { if (!signal.aborted) { setJobs([]); setPollError(e instanceof Error ? e.message : '確認できません。'); } }
    }, 10000);
  }, [id, scope, tick]);
  async function action(stopId?: string) {
    if (busy.current || !scope || (!stopId && ownCodex && !providerConsent)) return;
    busy.current = true; setPending(true); setError('');
    if (!stopId && (!intent.current || intent.current.prompt !== prompt)) intent.current = { id: crypto.randomUUID(), prompt };
    try {
      const response = await fetch(`/__noah/executions${stopId ? `/${stopId}/stop` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope }, body: JSON.stringify(stopId ? {} : { ...intent.current, agentId: id, ...(ownCodex ? { providerConsent: 'codex-account/1' } : {}) }) });
      const data = await response.json() as { ownerScope?: string; error?: string };
      if (!response.ok || data.ownerScope !== scope) throw new Error(data.error || '実行の受付を確認できません。');
      setTick(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : '実行できません。'); }
    finally { busy.current = false; setPending(false); }
  }
  const latest = jobs[0];
  return <section aria-label="Agentに依頼" className={styles.notice}>
    <h2>このAgentに仕事を頼む</h2>
    {execution ? <><p>{execution.capability}</p><p>{ownCodex ? `本人のCodex（${execution.providerModel || '設定済みモデル'}）を使用。1依頼最大${execution.limits.seconds}秒。契約の利用枠を消費します。料金は未計測です。` : <>{execution.model === 'none' ? 'モデルを使わずコードを実行します。' : `このMacの ${noahModel(execution.model)?.name || execution.model} を使用。`}1回最大{execution.limits.seconds}秒{execution.model === 'none' ? '' : `・モデル${execution.limits.modelCalls}回`}、API利用料0円。</>}</p>
      <label htmlFor={`request-${id}`}>依頼内容</label><textarea id={`request-${id}`} value={prompt} maxLength={3000} rows={5} style={{ width: '100%', boxSizing: 'border-box', padding: 12 }} placeholder={anicca ? '例：毎週金曜に資料を整理するための30分の作業計画を日本語で作って（16文字以上）' : '例：Pythonで税込価格を計算する関数を作り、price.pyに保存して'} onChange={e => setPrompt(e.target.value)} />
      {ownCodex && <label><input type="checkbox" checked={providerConsent} onChange={e => setProviderConsent(e.target.checked)} />依頼と作業結果をOpenAIへ送り、本人のCodexの利用枠を使うことを確認しました。</label>}
      <div className={styles.actions}><button className={styles.primary} disabled={!prompt.trim() || (anicca && prompt.trim().length < 16) || pending || Boolean(pollError) || jobs.some(active) || (ownCodex && !providerConsent)} onClick={() => void action()}>{anicca ? 'Aniccaへ依頼して実行' : ownCodex ? 'Codexへ依頼して実行' : '依頼して実行'}</button>
      {!jobs.some(active) && <button disabled={pending} onClick={() => { intent.current = null; setPrompt(''); setProviderConsent(false); }}>新しい依頼にする</button>}</div>
      <p className={styles.muted}>{ownCodex ? '認証は公式Codexに保持し、Agentのコマンドは専用Linux作業領域で処理します。本人の画面・ブラウザ・ファイルは操作しません。' : '専用の作業領域で処理します。Mac内のファイルやアカウントにはアクセスせず、外部送信・購入は行いません。'}画面を閉じても処理は続きますが、MacとNoahの起動が必要です。</p>
      <p className={styles.muted}>処理中も他の画面へ移動できます。このMacでの仕事は同時に1件ずつ進みます。Macの負荷が気になるときは、実行中の仕事を停止できます。</p></> : <p>上で接続すると依頼できます。保存済みの実行結果は下で確認できます。</p>}
    <NoahOperationPanel key={`${scope}/${id}`} id={id} scope={scope} prompt={prompt} connected={Boolean(execution)} ownCodex={ownCodex} providerConsent={providerConsent} />
    {pollError && <p role="alert" className={styles.error}>{pollError}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {latest && <article aria-live="polite"><h3>{labels[latest.noahExecution!.state]}</h3><p>{latest.noahExecution!.prompt}</p>
      {active(latest) && <button disabled={pending} onClick={() => void action(latest.id)}>実行を停止</button>}
      {latest.noahExecution!.error && <p>{latest.noahExecution!.error}</p>}
      {latest.noahExecution!.result && <><p>終了コード：{latest.noahExecution!.result.exitCode} / {latest.noahExecution!.provider ? 'Codexへの依頼' : 'モデル呼出'}：{latest.noahExecution!.calls}回</p>
        {latest.noahExecution!.result.exitCode !== 0 && <p role="alert">Agentがエラーを返しました。以下は途中の出力です。</p>}
        <details open={!latest.noahExecution!.result.files.length}><summary>Agentの応答・実行ログ</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto' }}>{latest.noahExecution!.result.text}</pre></details>
        <ul>{latest.noahExecution!.result.files.map(f => <li key={f.name}><button onClick={() => download(f)}>{f.name} を保存（{f.bytes} bytes）</button>
          {f.bytes === 0 ? <output>空のファイルです。依頼どおりの結果か、実行ログを確認してください。</output> : filePreview(f) !== null && <pre aria-label={`${f.name} の内容`} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 180, overflow: 'auto' }}>{filePreview(f)}</pre>}
          {f.bytes > 2000 && <p>先頭部分のプレビューです。全文は保存して確認できます。</p>}</li>)}</ul></>}
      <p className={styles.muted}>Work ID：{latest.id}。Agentの出力です。内容の正しさや外部業務の完了は、本人の確認が必要です。</p>
    </article>}
    {jobs.length > 1 && <details><summary>過去の実行（{jobs.length - 1}件）</summary>{jobs.slice(1).map(j => <details key={j.id}><summary>{labels[j.noahExecution!.state]} · {j.noahExecution!.prompt.slice(0, 70)}</summary><p>Work ID：{j.id}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{j.noahExecution!.result?.text || j.noahExecution!.error}</pre>{j.noahExecution!.result?.files.map(f => <button key={f.name} onClick={() => download(f)}>{f.name} を保存</button>)}</details>)}</details>}
  </section>;
}
