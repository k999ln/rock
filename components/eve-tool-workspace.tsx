'use client';
import SkyUsageDetails from './sky-usage-details';
import { useEffect, useRef, useState } from 'react';
import type { WorkJob } from '@/lib/workflow';
import { evePlannerPrompt, EVE_PLANNER_MAX_ATTEMPTS } from '@/lib/eve-plan-candidate';
import styles from './eve-tool-workspace.module.css';
type Result = { job: WorkJob; historySaved?: boolean };
async function api<T>(query = '', value?: unknown, method = 'PATCH'): Promise<T> {
  const response = await fetch(`/api/eve/tool-work${query}`, { method: value ? method : 'GET', cache: 'no-store', credentials: 'same-origin', ...(value ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) } : {}) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? '仕事を読み書きできません。');
  return data;
}
export default function EveToolWorkspace({ threadId, onThread }: { threadId: string; onThread: (id: string) => void }) {
  const [jobs, setJobs] = useState<WorkJob[]>([]), [savedCurrent, setCurrent] = useState<WorkJob | null>(null);
  const [objective, setObjective] = useState('原稿内の引用を出典欄へ整理し、リンク先を保持する'), [source, setSource] = useState('');
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const plannerAbort = useRef<AbortController | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planningMode, setPlanningMode] = useState<'recipe' | 'local-llm'>('recipe'), [models, setModels] = useState<Array<{name: string; digest: string}>>([]), [plannerModel, setPlannerModel] = useState('');
  const mounted = useRef(true), viewThread = useRef(threadId);
  const current = savedCurrent?.eveTool?.threadId === threadId ? savedCurrent : null;
  useEffect(() => { viewThread.current = threadId; }, [threadId]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; plannerAbort.current?.abort(); }; }, []);
  const sequence = useRef(0), createAttempt = useRef<{ key: string; jobId: string; threadId: string } | null>(null);
  async function load() {
    const version = ++sequence.current;
    try { const d = await api<{ jobs: WorkJob[] }>(threadId ? `?thread=${encodeURIComponent(threadId)}` : ''); if (mounted.current && version === sequence.current) { setJobs(d.jobs); setCurrent(previous => { const latest = d.jobs.find(job => job.id === previous?.id); return latest && latest.revision >= (previous?.revision ?? 0) ? latest : previous; }); } }
    catch (e) { if (mounted.current && version === sequence.current) setNotice(e instanceof Error ? e.message : '再読込してください。'); }
  }
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => { clearTimeout(timer); sequence.current++; }; }, [threadId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function create() {
    setBusy(true); setNotice('');
    const startingThread = threadId;
    const key = JSON.stringify({ threadId, objective, source, planningMode, plannerModel });
    const attempt = createAttempt.current?.key === key ? createAttempt.current : { key, jobId: crypto.randomUUID(), threadId: threadId || crypto.randomUUID() };
    createAttempt.current = attempt;
    try {
      const d = await api<Result>('', { jobId: attempt.jobId, threadId: attempt.threadId, objective, source, saveMaterial: consent }, 'POST');
      if (!mounted.current || viewThread.current !== startingThread) return;
      setCurrent(d.job); onThread(attempt.threadId); createAttempt.current = null;
      setNotice(d.historySaved === false ? '仕事は保存済みです。会話への反映を再試行してください。' : '計画を保存しました。内容を確認して実行してください。');
      await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : '再読込してください。'); }
    finally { setBusy(false); }
  }
  async function discoverModels() {
    setBusy(true); setNotice('');
    try {
      const r = await fetch('/api/llm/local-models', { cache: 'no-store', credentials: 'same-origin' });
      const d = await r.json() as { models?: Array<{name: string; digest: string}>; error?: string };
      if (!r.ok || !d.models) throw new Error(d.error ?? '本人用localhostの接続先で確認してください。');
      if (!mounted.current) return;
      setModels(d.models); setPlannerModel(d.models[0]?.name ?? '');
      setNotice(d.models.length ? '導入済みモデルだけを表示しています。まだ推論はしていません。' : '導入済みモデルがありません。');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'モデルを確認できません。'); }
    finally { setBusy(false); }
  }
  async function propose(existing?: WorkJob) {
    const selected = existing?.eveTool?.planning;
    const model = selected?.modelLabel ?? plannerModel;
    const installed = models.find(m => m.name === model && (!selected || m.digest === selected.modelDigest));
    if (!installed || (!existing && !consent)) { setNotice('同じ名前とハッシュの導入済みモデルを確認してください。'); return; }
    setBusy(true); setPlanning(true); setNotice('');
    const controller = new AbortController(); plannerAbort.current = controller;
    const startingThread = threadId; let job = existing;
    const visible = () => mounted.current && (viewThread.current === startingThread || viewThread.current === job?.eveTool?.threadId);
    const save = async (action: string, extra: Record<string, unknown> = {}) => {
      const result = await api<Result>('', { jobId: job!.id, revision: job!.revision, commandId: crypto.randomUUID(), action, ...extra });
      job = result.job; if (visible()) setCurrent(job); return job;
    };
    try {
      if (!job) {
        const key = JSON.stringify({ threadId, objective, source, model, digest: installed.digest });
        const draft = createAttempt.current?.key === key ? createAttempt.current : { key, jobId: crypto.randomUUID(), threadId: threadId || crypto.randomUUID() };
        createAttempt.current = draft;
        const result = await api<Result>('', { jobId: draft.jobId, threadId: draft.threadId, objective, source, saveMaterial: consent, plannerRequest: { modelLabel: installed.name, modelDigest: installed.digest } }, 'POST');
        createAttempt.current = null;
        job = result.job;
        if (!visible()) return;
        setCurrent(job); viewThread.current = job.eveTool!.threadId; onThread(job.eveTool!.threadId);
      }
      const instructions = evePlannerPrompt({ jobId: job.id, objective: job.plan.objective, sourceSha256: job.eveTool!.sourceSha256 });
      let correction = '';
      for (let n = 0; n < EVE_PLANNER_MAX_ATTEMPTS; n++) {
        controller.signal.throwIfAborted(); if (!visible()) return;
        const previous = job.eveTool!.planning!.attempts.at(-1);
        if (previous?.state === 'leased' && previous.leaseUntil <= Date.now()) await save('planner-abandon', { attemptId: previous.id });
        await save('planner-claim');
        const attempt = job.eveTool!.planning!.attempts.at(-1)!;
        const r = await fetch('/api/llm/text', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'ollama', model, evePlanner: { jobId: job.id, attemptId: attempt.id }, ...instructions, prompt: instructions.prompt + correction, maxOutputTokens: 600 }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) });
        const data = await r.json() as { eveWork?: WorkJob; historySaved?: boolean; inferenceOutcome?: string; plannerBlocked?: string; error?: string };
        if (!r.ok || !data.eveWork) throw new Error(data.error ?? 'ローカルLLMへ接続できません。');
        controller.signal.throwIfAborted(); if (!visible()) return;
        job = data.eveWork; setCurrent(job);
        const historyNotice = data.historySaved === false ? '仕事と使用量は保存済みです。会話への反映は未完了です。「会話へ再反映」で修復できます。' : '';
        if (data.plannerBlocked) { setNotice((data.plannerBlocked === 'model_changed' ? '選んだAIの版が変わっています。自動では続けません。新しい仕事でモデルを選び直すか、この仕事は固定手順を選んでください。' : '選んだAIの版を確認できません。自動では続けません。接続状態と保存した仕事を確認してください。') + historyNotice); return; }
        if (data.inferenceOutcome === 'unknown') throw new Error('推論の結果は不明です。再読込して状態を確認してください。' + historyNotice);
        if (job.eveTool!.planning!.status === 'proposed') { setNotice('計画候補を保存・検証しました。内容を確認して採用してください。Toolは未実行です。' + historyNotice); return; }
        correction = '\nThe previous proposal was rejected. Return only the JSON template with matching identifiers and permitted connected nodes. Never execute anything.';
      }
      setNotice('試行上限に達しました。保存状態を確認するか、固定手順を明示的に選んでください。');
    } catch (e) {
      const pending = job?.eveTool?.planning?.attempts.at(-1);
      if (pending?.state === 'leased') { try { await save('planner-abandon', { attemptId: pending.id }); } catch { /* Read durable state before any retry. */ } }
      if (visible()) setNotice(controller.signal.aborted ? '計画候補の採用を中止しました。推論の終了は未確認です。保存状態を再読込できます。' : e instanceof Error ? e.message : '保存状態を確認してください。');
    } finally { plannerAbort.current = null; setPlanning(false); setBusy(false); if (visible()) await load(); }
  }
  async function decidePlanner(action: 'planner-adopt' | 'planner-recipe') {
    if (!current) return;
    setBusy(true); setNotice(''); const startingThread = threadId;
    try {
      const d = await api<Result>('', { jobId: current.id, revision: current.revision, commandId: crypto.randomUUID(), action });
      if (!mounted.current || viewThread.current !== startingThread) return;
      setCurrent(d.job); setNotice('使用する計画を保存しました。Toolはまだ実行していません。'); await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : '保存状態を確認してください。'); }
    finally { setBusy(false); }
  }
  async function command(action: 'advance' | 'cancel' | 'complete' | 'sync') {
    if (!current) return;
    setBusy(true); setNotice('');
    const startingThread = threadId;
    try {
      const d = await api<Result>('', { jobId: current.id, revision: current.revision, commandId: crypto.randomUUID(), action });
      if (!mounted.current || viewThread.current !== startingThread) return;
      setCurrent(d.job); setNotice(d.historySaved === false ? '仕事は保存済みです。会話への反映を再試行してください。' : '仕事と会話を保存しました。'); await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : '再読込してください。'); }
    finally { setBusy(false); }
  }
  async function choose(id: string) {
    setBusy(true); const startingThread = threadId;
    try { const d = await api<Result>(`?id=${encodeURIComponent(id)}`); if (!mounted.current || viewThread.current !== startingThread) return; setCurrent(d.job); onThread(d.job.eveTool!.threadId); }
    catch (e) { setNotice(e instanceof Error ? e.message : '再読込してください。'); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-label="EveからsmisのToolを実行">
    <h3>smisのToolで仕事を進める</h3>
    <p>素材をこのサイトに送って本人用の仕事に保存し、サイト側の固定処理で引用を整形します。固定手順ではモデルを呼び出しません。Pixel内Linuxでの処理や記事の事実確認は含みません。</p>
    {current && <p>以前の会話に「端末内」と表示されていても、この引用整形はサイト側の固定処理です。保存済みの会話は変更していません。</p>}
    <label>目的<input value={objective} maxLength={1000} disabled={busy} onChange={e => { setObjective(e.target.value); }} /></label>
    <label>引用を含む原稿<textarea value={source} maxLength={10000} rows={5} disabled={busy} onChange={e => { setSource(e.target.value); }} placeholder="本文。（出典: [資料](https://example.com/source)）" /></label>
    <label><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />本人用の仕事に素材・成果を保存する。秘密情報は含めません。</label>
    <label>計画の作成方法<select value={planningMode} disabled={busy} onChange={e => { setPlanningMode(e.target.value as 'recipe' | 'local-llm'); }}><option value="recipe">固定手順（LLMなし）</option><option value="local-llm">導入済みローカルLLMの候補を検証</option></select></label>
    {planningMode === 'local-llm' && <div>
      <p>本人用localhostのOllama接続のみ。目的と素材ハッシュをモデルへ渡します。素材本文は計画用に送らず、有料Cloudへ切り替えません。</p>
      <button type="button" disabled={busy} onClick={() => void discoverModels()}>導入済みモデルを確認</button>
      <label>計画用モデル<select value={plannerModel} disabled={busy} onChange={e => { setPlannerModel(e.target.value); }}><option value="">モデルを選んでください</option>{models.map(m => <option key={m.digest} value={m.name}>{m.name}</option>)}</select></label>
      <button type="button" disabled={busy || !consent || !source.trim() || !objective.trim() || !plannerModel} onClick={() => void propose()}>新しい仕事の計画候補を作る</button>
      {planning && <button type="button" onClick={() => plannerAbort.current?.abort()}>計画作成を中止</button>}
    </div>}
    {planningMode === 'recipe' && <button type="button" disabled={busy || !consent || !objective.trim() || !source.trim()} onClick={() => void create()}>計画を作成・保存</button>}
    <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void load()}>保存した仕事を再読込</button>{jobs.map(job => <button type="button" disabled={busy} key={job.id} onClick={() => void choose(job.id)}>{job.title} · {job.status === 'cancelled' ? '停止済み' : job.status === 'completed' ? '完了' : '続きから'}</button>)}</div>
    {current && <article>
      <h4>{current.title}</h4><p>計画：引用整形 → 完成条件の検査 → 本人確認。予算0円・外部権限なし。</p>
      <p>仕事ID：{current.id} · 版{current.revision} · {current.status === 'active' ? '続行待ち' : current.status === 'review' ? '本人確認待ち' : current.status === 'completed' ? '完了' : '停止済み'}</p>
      {current.status === 'cancelled' && current.eveTool?.planning?.attempts.some(a => ['leased', 'unknown'].includes(a.state)) && <p>仕事の続行・候補採用は停止しました。計画用のローカル推論が終了したかは未確認です。</p>}
      <p>計画元：{current.eveTool?.planning && !['adopted', 'recipe'].includes(current.eveTool.planning.status) ? '選択待ち（Toolは未実行）' : current.eveTool?.planner === 'validated-llm-candidate/1' ? `検証済みのLLM候補（申告モデル：${current.eveTool.plannerCandidate?.modelLabel ?? '未報告'}）` : '固定手順'}</p>
      {current.eveTool?.planning?.attempts.map(a => a.inference?.usage ? <SkyUsageDetails key={a.id} observation={a.inference.usage} /> : <p key={a.id}>{a.inference?.state === 'not_sent' ? '計画用AIへは依頼していません。版の確認で停止しました。' : <>試行の使用量：未報告・請求未確定{a.inference?.state === 'sending' ? '（応答照合待ち）' : ''}</>}</p>)}
      {current.eveTool?.planning && !['adopted', 'recipe'].includes(current.eveTool.planning.status) && current.status === 'active' && <div>
        <p>計画作成：{({draft:'候補作成待ち',leased:'応答待ち',proposed:'本人の採用待ち',adopted:'採用済み',recipe:'固定手順'})[current.eveTool.planning.status]} · 保存済み試行 {current.eveTool.planning.attempts.length}/2。モデル名・ハッシュは申告値で、推論や請求の証明ではありません。</p>
        <ul>{current.eveTool.planning.attempts.map(a => <li key={a.id}>{({ leased: '応答待ち', accepted: '候補検証済み', invalid: '候補不合格', unknown: '結果不明' })[a.state]} · 期限 {new Date(a.leaseUntil).toISOString()}{a.reason ? ` · ${{candidate_invalid:'計画の条件に不適合',lease_expired:'応答期限を超過',client_abandoned:'採用中止・推論終了未確認',inference_unconfirmed:'推論の結果を確認できません',model_changed:'AIの版が変更されています',model_unavailable:'AIの版を確認できません'}[a.reason]}` : ''}</li>)}</ul>
        {current.eveTool.planning.candidate && <details><summary>計画候補の詳細（Toolは未実行）</summary><pre className={styles.result}>{current.eveTool.planning.candidate}</pre></details>}
        <button type="button" disabled={busy} onClick={() => void discoverModels()}>導入済みモデルを再確認</button>
        <button type="button" disabled={busy || current.eveTool.planning.status === 'proposed' || current.eveTool.planning.attempts.length >= 2 || current.eveTool.planning.attempts.at(-1)?.inference?.blockedReason === 'model_changed'} onClick={() => void propose(current)}>同じ仕事の計画作成を再開</button>
        <button type="button" disabled={busy || current.eveTool.planning.status !== 'proposed'} onClick={() => void decidePlanner('planner-adopt')}>保存候補を確認して採用</button>
        <button type="button" disabled={busy} onClick={() => void decidePlanner('planner-recipe')}>この仕事は固定手順を使う</button>
      </div>}
      {current.eveTool?.pendingFailure && <p>{current.eveTool.pendingFailure.repairable ? '冗長な結合で成果上限を超えました。合格済みの同一成果を保持し、完成条件を変えずに手順を整理できます。' : '完成条件を保った自動修正はできません。検査を緩めずに続行を止めています。'} 修正回数：{current.eveTool.repairCount ?? 0}/2</p>}
      {current.eveTool?.pendingFailure && current.composition?.artifacts[current.eveTool.pendingFailure.stepId]?.checks.filter(check => !check.passed).map((check, index) => <p key={index}>未達の完成条件：{check.name} — {check.detail}</p>)}
      <ol>{current.steps.map(step => <li key={step.id}>{step.title}：{step.passed ? '合格' : '未完了'}</li>)}</ol>
      {current.eveTool?.verification?.checks.map(check => <p key={check.name}>{check.passed ? '合格' : '要確認'}：{check.name} — {check.detail}</p>)}
      {current.composition?.artifacts[current.eveTool?.outputStepId ?? 's1'] && <pre className={styles.result}>{current.composition.artifacts[current.eveTool?.outputStepId ?? 's1'].text}</pre>}
      <div className={styles.actions}>
        <button type="button" disabled={busy || (Boolean(current.eveTool?.planning) && !['adopted', 'recipe'].includes(current.eveTool!.planning!.status)) || current.status !== 'active' || (Boolean(current.eveTool?.pendingFailure) && !current.eveTool?.pendingFailure?.repairable) || Object.values(current.composition?.artifacts ?? {}).some(a => a.status !== 'passed')} onClick={() => void command('advance')}>{current.eveTool?.pendingFailure?.repairable ? '手順を修正して続行' : '次の工程を実行'}</button>
        <button type="button" disabled={busy || current.status !== 'review'} onClick={() => void command('complete')}>成果を確認して完了</button>
        <button type="button" disabled={busy || ['completed', 'cancelled'].includes(current.status)} onClick={() => void command('cancel')}>停止</button>
        <button type="button" disabled={busy} onClick={() => void command('sync')}>会話へ再反映</button>
      </div>
    </article>}
    {notice && <output>{notice}</output>}
  </section>;
}
