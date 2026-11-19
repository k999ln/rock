'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { WorkJob } from '@/lib/workflow';
import type { NoahOperationConfig } from '@/lib/noah-operations';
import { recipeFor } from '@/lib/noah-execution-contract.mjs';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { startNoahVisiblePolling } from '@/lib/noah-visible-polling';
import styles from './noah-agent-catalog.module.css';
import NoahOperationRuntime from './noah-operation-runtime';

type OperationJob = WorkJob & { noahOperation: NonNullable<WorkJob['noahOperation']> & { hostState?: string; hostError?: string } };
const states: Record<string,string> = { enabled: '運用中', paused: '停止済み', stopping: '停止を確認中', blocked: '確認が必要', exhausted: '設定した上限で終了', archived: '整理済み' };
export default function NoahOperationPanel({ id, scope, prompt, connected, ownCodex, providerConsent }: { id: string; scope: string; prompt: string; connected: boolean; ownCodex: boolean; providerConsent: boolean }) {
  const [intervalSeconds,setIntervalSeconds] = useState(300), [maxRuns,setMaxRuns] = useState(3), [hours,setHours] = useState(1), [confirmed,setConfirmed] = useState(false);
  const [jobs,setJobs] = useState<OperationJob[]>([]), [error,setError] = useState(''), [readError,setReadError] = useState(''), [pending,setPending] = useState(false), [tick,setTick] = useState(0);
  const [archived,setArchived] = useState(false), [triggerAgent,setTriggerAgent] = useState(''), [sources,setSources] = useState<{id:string;label:string}[]>([]);
  const [editing,setEditing] = useState<OperationJob | null>(null), [editPrompt,setEditPrompt] = useState('');
  const [maxModelCalls,setMaxModelCalls] = useState('');
  const validModelBudget = ownCodex || maxModelCalls === '' || (Number.isInteger(Number(maxModelCalls)) && Number(maxModelCalls) >= 1 && Number(maxModelCalls) <= 1200);
  const currentPrompt = editing ? editPrompt : prompt;
  const [observedAt,setObservedAt] = useState(0);
  const intent = useRef<{ signature: string; config: NoahOperationConfig } | null>(null), busy = useRef(false);
  useEffect(() => {
    if (!scope) return;
    return startNoahVisiblePolling(async signal => {
      try {
        const r = await fetch(`/__noah/operations?agentId=${encodeURIComponent(id)}${archived ? '&archived=1' : ''}`, { cache: 'no-store', signal }), data = await r.json() as { ownerScope?: string; jobs?: OperationJob[]; error?: string };
        if (!r.ok || data.ownerScope !== scope || !Array.isArray(data.jobs)) throw new Error(data.error || '運用を確認できません。');
        if (!signal.aborted) { setJobs(data.jobs.filter((j: OperationJob) => j.noahOperation?.config.agentId === id)); setReadError(''); setObservedAt(Date.now()); }
        return data.jobs.some(j => ['enabled','stopping'].includes(j.noahOperation.state)) ? 5000 : 15000;
      } catch (e) { if (!signal.aborted) { setJobs([]); setReadError(e instanceof Error ? e.message : '運用を確認できません。'); } }
    }, 15000);
  }, [id,scope,tick,archived]);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const r = await fetch('/__noah/executions?summary=1', { cache: 'no-store', signal: controller.signal }), data = await r.json() as { ownerScope?: string; jobs?: {title:string;noahExecution?:{agentId:string}}[] };
        if (!r.ok || data.ownerScope !== scope || !Array.isArray(data.jobs)) throw new Error();
        const names = new Map<string,string>();
        try {
          const r = await fetch('/api/noah/agents', {cache:'no-store',signal:controller.signal}), own = await r.json() as {ownerScope?:string;agents?:{id:string;manifest:{name:string}}[]};
          if (r.ok && own.ownerScope === scope && Array.isArray(own.agents)) for (const agent of own.agents) names.set(agent.id,agent.manifest.name);
        } catch { /* History remains selectable when the display-name lookup fails. */ }
        const choices = new Map<string,string>();
        for (const j of data.jobs) if (j.noahExecution?.agentId && j.noahExecution.agentId !== id && !choices.has(j.noahExecution.agentId)) choices.set(j.noahExecution.agentId, `${names.get(j.noahExecution.agentId) || recipeFor(j.noahExecution.agentId)?.name || '登録済みAgent'}（${j.noahExecution.agentId.slice(0,8)}）`);
        if (!controller.signal.aborted) setSources([...choices].map(([id,label]) => ({id,label})));
      } catch { if (!controller.signal.aborted) setSources([]); }
    })();
    return () => controller.abort();
  }, [id,scope,tick]);
  async function act(action: 'start' | 'stop' | 'resume' | 'revise' | 'archive' | 'restore', job?: OperationJob) {
    if (busy.current || !scope || (['start','revise'].includes(action) && (!confirmed || !validModelBudget || !currentPrompt.trim() || (action === 'start' && !connected) || (ownCodex && !providerConsent)))) return;
    busy.current = true; setPending(true); setError('');
    try {
      const signature = JSON.stringify([id,scope,currentPrompt,intervalSeconds,maxRuns,hours,providerConsent,triggerAgent,maxModelCalls]);
      const config = (): NoahOperationConfig => ({ id: editing?.id || crypto.randomUUID(), agentId: id, prompt: currentPrompt, intervalSeconds,maxRuns,expiresAt: Date.now() + hours * 3600000,...(!ownCodex && maxModelCalls !== '' ? {maxModelCalls:Number(maxModelCalls)} : {}),timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,confirmation: 'noah-operation/1', ...(triggerAgent ? { trigger: {kind: 'work.returned', agentId: triggerAgent} } : {}), ...(ownCodex ? { providerConsent: 'codex-account/1' } : {}) });
      if (action === 'start' && intent.current?.signature !== signature) intent.current = { signature, config: config() };
      const body = action === 'start' ? intent.current!.config : action === 'revise' ? { revision: editing!.revision, config: config() } : ['archive','restore'].includes(action) ? { revision: job!.revision } : {};
      const r = await fetch(`/__noah/operations${action === 'start' ? '' : `/${job?.id || editing?.id}/${action}`}`, { method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope }, body: JSON.stringify(body) }), data = await r.json() as { ownerScope?: string; error?: string };
      if (!r.ok || data.ownerScope !== scope) throw new Error(data.error || '操作を確認できません。');
      if (action === 'revise') { setEditing(null); setConfirmed(false); intent.current = null; }
      setTick(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : '操作できません。'); }
    finally { busy.current = false; setPending(false); }
  }
  return <section aria-label="Agentの継続運用">
    <h3>裏側で続けて運用する</h3>
    <p>上の依頼内容を保存して、指定した間隔や別のAgentの成果をきっかけに実行します。画面を閉じても続きます。MacとNoahを起動しておいてください。</p>
    {editing && <p>条件{editing.noahOperation.configVersion ?? 1}を変更中。保存後も停止したままです。過去の依頼と成果は残します。</p>}
    {editing && <label>運用する依頼<textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} /></label>}
    <label>実行のきっかけ <select aria-label="実行のきっかけ" value={triggerAgent ? 'event' : 'interval'} onChange={e => { setTriggerAgent(e.target.value === 'event' ? (sources[0]?.id || 'select-agent') : ''); setConfirmed(false); }}><option value="interval">指定した間隔</option><option value="event">別のAgentの成果が届いたら</option></select></label>
    {triggerAgent && <label>成果を受け取るAgent <select aria-label="成果を受け取るAgent" value={triggerAgent} onChange={e => {setTriggerAgent(e.target.value); setConfirmed(false);}}><option value="select-agent">選んでください</option>{sources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}
    {triggerAgent && <p>直近100件の仕事にあるAgentから選べます。開始・再開後の正常な成果本文を、1件ずつ次の依頼へ渡します（最大2,000文字、ファイルは除外）。停止中の成果は取り込みません。自己申告の成功を業務完了とは扱いません。</p>}
    <div className={styles.actions}>
      <label>{triggerAgent ? '実行の最小間隔 ' : '間隔 '} <select value={intervalSeconds} onChange={e => setIntervalSeconds(Number(e.target.value))}>{[[60,'1分'],[300,'5分'],[900,'15分'],[3600,'1時間']].map(([v,label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      <label>最大回数 <input type="number" min={1} max={100} value={maxRuns} onChange={e => setMaxRuns(Number(e.target.value))} style={{ width: 72 }} /></label>
      <label>期限 <select value={hours} onChange={e => setHours(Number(e.target.value))}>{[1,6,24].map(h => <option key={h} value={h}>{h}時間後</option>)}</select></label>
    </div>
    {!ownCodex && <label>モデル呼出しの累計上限（任意）<input aria-label="モデル呼出しの累計上限" type="number" min={1} max={1200} value={maxModelCalls} onChange={e=>{setMaxModelCalls(e.target.value);setConfirmed(false);}} /></label>}
    {!ownCodex && <p>呼出し前に枠を予約し、通信切断や停止でも使用済み枠を戻しません。これはモデルの成功数・金額の上限ではありません。</p>}
    <p className={styles.muted}>同時実行はこのMacで1件。混雑中は待機し、取り逃した予定はまとめて実行しません。失敗・接続変更で停止します。再起動後は停止状況を確認して再開できます。</p>
    {ownCodex && <p>毎回OpenAIへ依頼と作業結果を送り、本人のCodex利用枠を消費します。イベント運用では選んだAgentの成果本文も送信します。料金は未計測です。回数の上限は金額の上限ではありません。</p>}
    <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />この依頼を、選んだきっかけ・回数・期限まで実行することを確認しました。</label>
    <div className={styles.actions}><button disabled={pending || Boolean(readError) || !validModelBudget || !confirmed || (!editing && !connected) || !currentPrompt.trim() || triggerAgent === 'select-agent' || !Number.isInteger(maxRuns) || maxRuns < 1 || maxRuns > 100 || (id === 'anicca' && currentPrompt.trim().length < 16) || (ownCodex && !providerConsent)} onClick={() => void act(editing ? 'revise' : 'start')}>{editing ? '条件を保存（停止を維持）' : '運用開始'}</button>
      <button disabled={pending} onClick={() => { intent.current = null; setConfirmed(false); setEditing(null); }}>新しい運用を設定</button></div>
    {readError && <p role="alert" className={styles.error}>{readError}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
    <label><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />整理済みの運用を表示（直近20件）</label>
    {jobs.map(job => { const op = job.noahOperation, interrupted = ['interrupted','unavailable'].includes(op.hostState || ''), uncertain = op.history.at(-1)?.state === 'unknown'; return <article key={job.id}>
      <h4>{interrupted ? 'hostの継続を確認できません' : states[op.state]}</h4><p>{op.config.prompt}</p><p>条件{op.configVersion ?? 1}{op.config.trigger ? ` · 成果を受け取る: ${sources.find(s => s.id === op.config.trigger!.agentId)?.label || op.config.trigger.agentId}` : ' · 定期実行'}</p>
      <p>{op.attempts} / {op.config.maxRuns}回を受付・成功{op.succeeded}回。{op.config.intervalSeconds / 60}分間隔</p>
      {!op.binding?.provider && <p>モデル呼出し予約{op.modelBudgetSinceSequence && op.modelBudgetSinceSequence > 1 ? `（第${op.modelBudgetSinceSequence}回の仕事から）` : ''}：{op.reservedModelCalls ?? '未計測'}回 / {op.config.maxModelCalls === undefined ? '運用別の上限なし' : `${op.config.maxModelCalls}回`}</p>}
      <p>期限：{new Date(op.config.expiresAt).toLocaleString('ja-JP', { timeZone: op.config.timeZone })}（{op.config.timeZone}）</p>
      {!op.config.trigger && op.nextRunAt !== null && !interrupted && op.state === 'enabled' && <p>次回：{new Date(op.nextRunAt).toLocaleString('ja-JP', { timeZone: op.config.timeZone })}{op.active ? '（実行中は重複起動しません）' : ''}</p>}
      {(op.error || op.hostError) && <output>{op.hostError || op.error}</output>}
      {op.active && <p><Link href={`/noah/work/${op.active.jobId}`}>実行中の仕事を確認</Link></p>}
      <div className={styles.actions}>{(['enabled','stopping'].includes(op.state) || interrupted) && <button disabled={pending} onClick={() => void act('stop',job)}>{interrupted ? '停止状況を確認' : '運用を停止'}</button>}
        {['paused','blocked'].includes(op.state) && !op.active && !uncertain && <button disabled={pending || !connected || op.attempts >= op.config.maxRuns || (op.config.maxModelCalls !== undefined && (op.reservedModelCalls ?? 0) >= op.config.maxModelCalls) || op.config.expiresAt <= observedAt} onClick={() => void act('resume',job)}>同じ条件で再開</button>}
        {['paused','blocked','exhausted'].includes(op.state) && !op.active && !uncertain && <>
          <button disabled={pending} onClick={() => {setEditing(job);setEditPrompt(op.config.prompt);setIntervalSeconds(op.config.intervalSeconds);setMaxRuns(op.config.maxRuns);setMaxModelCalls(op.config.maxModelCalls === undefined ? '' : String(op.config.maxModelCalls));setHours(1);setTriggerAgent(op.config.trigger?.agentId || '');setConfirmed(false);}}>条件を変更</button>
          <button disabled={pending} onClick={() => void act('archive',job)}>履歴を残して整理</button>
        </>}
        {op.state === 'archived' && <button disabled={pending} onClick={() => void act('restore',job)}>停止状態で復元</button>}</div>
      <NoahOperationRuntime key={`${scope}/${job.id}`} job={job} scope={scope} connected={connected} disabled={pending || Boolean(readError)} onUpdated={() => setTick(n => n + 1)} />
      {op.history.length > 0 && <details><summary>実行履歴（直近{op.history.length}件）</summary><ul>{op.history.slice().reverse().map(h => <li key={h.jobId}>{h.state === 'skipped' ? `第${h.sequence}回 · 実行前に中止` : <Link href={`/noah/work/${h.jobId}`}>第{h.sequence}回 · {h.state === 'returned' ? '結果あり' : h.state === 'cancelled' ? '停止' : h.state === 'unknown' ? '結果不明' : '失敗'}</Link>}{h.configVersion && ` · 条件${h.configVersion}`}{` · 実行環境${h.bindingVersion ?? 1}`}{h.event && <> · <Link href={`/noah/work/${h.event.jobId}`}>起点の成果</Link></>}</li>)}</ul></details>}
    </article>; })}
  </section>;
}
