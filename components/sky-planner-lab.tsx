'use client';

import { SkyNotice, SkyWorkProgress } from '@/components/sky-feedback';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createSkyAppJob, executeSkyAppJob, confirmSkyAppJob, stopSkyAppJob, plannerSkyRequest } from '@/lib/sky-app-foundation';
import { parsePlannerHandoff, plannerHandoffRequest, plannerResultMessage, privatePlannerOrigins, type PlannerHandoff } from '@/lib/sky-planner-bridge';
import type { WorkJob } from '@/lib/workflow';
import type { SkyAppRequest } from '@/lib/sky-app-contract';
import { ProductDomainNavigation } from './product-domain-navigation';
import { SkyAppServerPanel } from './sky-app-server-panel';
import { SkyPortableExport } from '@/components/sky-portable-export';
import { SkyAppResultView } from '@/components/sky-app-result-view';
import styles from './sky-add-zoom-prototype.module.css';

type Binding = { handoff: PlannerHandoff; origin: string; expiresAt: number; revision: string; target: Window };
export default function SkyPlannerLab() {
  const [brief, setBrief] = useState('担当作業：会議後の作業メモを整理する。成果物：確認用メモ。完了条件：本人が内容を確認する。');
  const [taskId, setTaskId] = useState('planner-test-1');
  const [job, setJob] = useState<WorkJob | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');
  const [binding, setBinding] = useState<Binding | null>(null);
  const [returned, setReturned] = useState(false);
  const [working, setWorking] = useState(false);
  const [channel, setChannel] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null), current = useRef<WorkJob | null>(null);
  const latestBinding = useRef<Binding | null>(null), receiveVersion = useRef(0);
  function put(value: WorkJob | null) { current.current = value; setJob(value); }
  function stop() {
    if (channel) { void channelCommand('stop'); return; }
    controller.current?.abort(); controller.current = null; setWorking(false);
    if (current.current && ['active', 'review'].includes(current.current.status)) put(stopSkyAppJob(current.current));
  }
  function reset() {
    if (channel) {
      controller.current?.abort(); controller.current = null; setWorking(false);
      const old = current.current;
      if (old && ['active', 'review'].includes(old.status)) void fetch('/api/sky/app-lab', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', channel, revision: old.revision, commandId: crypto.randomUUID() }) }).catch(() => {});
      setChannel(null);
    } else stop();
    receiveVersion.current++; latestBinding.current = null; setBinding(null); put(null);
    setApproved(false); setError(''); setReturned(false);
  }
  async function channelCommand(action: 'run' | 'confirm' | 'stop' | 'deliver') {
    const j = current.current;
    if (!channel || !j) return;
    if (action === 'stop') { controller.current?.abort(); controller.current = null; }
    else if (controller.current) return;
    const active = new AbortController(); controller.current = active; setWorking(true); setError('');
    try {
      const response = await fetch('/api/sky/app-lab', { method: 'POST', signal: active.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, channel, revision: j.revision, commandId: crypto.randomUUID() }) });
      if (!response.ok) throw new Error('受渡しの状態が変わりました。Plannerから開き直してください。');
      const value = await response.json() as { job: WorkJob };
      if (controller.current !== active) return;
      put(value.job); if (action === 'deliver') setReturned(true);
    } catch (cause) { if (controller.current === active && !active.signal.aborted) setError((cause as Error).message); }
    finally { if (controller.current === active) { controller.current = null; setWorking(false); } }
  }
  useEffect(() => {
    const match = /^#channel=([a-f0-9]{64})$/u.exec(window.location.hash);
    if (!match) return;
    const version = ++receiveVersion.current;
    window.history.replaceState(null, '', window.location.pathname);
    const controller = new AbortController();
    void fetch('/api/sky/app-lab', { headers: { 'X-Sky-Lab-Channel': match[1] }, signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('受渡しの期限が切れたか、見つかりません。Plannerから開き直してください。');
        const value = await response.json() as { job: WorkJob; expiresAt: number };
        if (controller.signal.aborted || version !== receiveVersion.current) return;
        const request = value.job.skyApp!.request;
        setChannel(match[1]); put(value.job); setBrief(request.input); setTaskId(request.sourceId); setApproved(false);
      }).catch((cause: unknown) => { if (!controller.signal.aborted) setError((cause as Error).message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const opener = window.opener as Window | null;
    if (!opener) return;
    let active = true;
    const listener = (event: MessageEvent<unknown>) => {
      if (event.source !== opener || latestBinding.current || !privatePlannerOrigins.some((v) => v === event.origin)) return;
      try {
        const handoff = parsePlannerHandoff(event.data, event.origin), version = ++receiveVersion.current;
        void plannerHandoffRequest(handoff).then((request) => {
          if (!active || version !== receiveVersion.current || latestBinding.current) return;
          controller.current?.abort(); controller.current = null; setWorking(false); put(null); setApproved(false);
          const b = { handoff, origin: event.origin, expiresAt: Date.now() + 10 * 60_000, revision: request.sourceRevision, target: opener };
          latestBinding.current = b; setBinding(b); setBrief(request.input); setTaskId(request.sourceId); setReturned(false);
          opener.postMessage({ type: 'avocado.sky.accepted.v1', token: handoff.token }, event.origin);
        }).catch(() => { if (active) setError('Plannerの依頼を確認できませんでした。開き直してください。'); });
      } catch { setError('Plannerの受渡し形式を確認してください。'); }
    };
    window.addEventListener('message', listener);
    for (const origin of privatePlannerOrigins) opener.postMessage({ type: 'avocado.sky.ready.v1' }, origin);
    return () => { active = false; window.removeEventListener('message', listener); controller.current?.abort(); };
  }, []);
  useEffect(() => () => { controller.current?.abort(); }, []);
  async function run() {
    if (!approved || controller.current || current.current?.status === 'review') return;
    if (channel) { await channelCommand('run'); return; }
    setError(''); setReturned(false);
    try {
      let request: SkyAppRequest;
      const b = latestBinding.current;
      if (b) {
        if (b.expiresAt < Date.now() || b.target.closed) throw new Error('Plannerとの接続期限が切れました。開き直してください。');
        request = await plannerHandoffRequest(b.handoff);
      } else request = plannerSkyRequest({ taskId, revision: 'manual-1', brief });
      const initial = createSkyAppJob(request), active = new AbortController(); controller.current = active; put(initial); setWorking(true);
      try {
        const next = await executeSkyAppJob(initial, { signal: active.signal });
        if (controller.current === active && !active.signal.aborted) put(next);
      } catch (cause) {
        if (controller.current === active && !active.signal.aborted) { stop(); setError((cause as Error).message); }
      } finally { if (controller.current === active) { controller.current = null; setWorking(false); } }
    } catch (cause) { setError((cause as Error).message); }
  }
  function returnResult() {
    if (channel) { void channelCommand('deliver'); return; }
    try {
      const b = latestBinding.current, j = current.current;
      if (!b || !j || returned || b.target.closed || b.expiresAt < Date.now()) throw new Error('Plannerとの受渡しを開き直してください。');
      b.target.postMessage(plannerResultMessage(j, b.handoff, b.revision), b.origin); setReturned(true);
    } catch (cause) { setError((cause as Error).message); }
  }
  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><div className={styles.brand}><span className={styles.mark}>✦</span><strong>Sky / プランナー</strong></div><span className={styles.host}>自分だけで使う試作</span></header>
    <section className={styles.hero}><h1>予定に必要な準備を、Skyで。</h1><p>依頼して、下書きを確認・保存できます。必要なら途中で停止できます。</p></section>
    <div className={styles.content}>
      <section className={styles.devicePath}><strong>{binding || channel ? 'ローカルPlannerのタスクを受信しました' : '自分で依頼を入力する'}</strong><p>依頼文から、作業を始める前の確認用メモを作ります。調査・制作・連絡は行いません。プランナーへ戻した後も、内容は自分で確認してください。</p><p>{channel ? '依頼と成果はローカルSkyサーバーのmemoryで10分保持します。再起動で消えます。本人アカウントへの保存は別操作です。' : 'この画面の内容は再読み込みで消えます。残したい成果はファイルに保存してください。アカウントに残す場合は別に保存操作が必要です。'}</p></section>
      <section className={styles.work}><h2>1. 依頼を確認</h2>
        <label htmlFor="planner-task">作業を区別する名前</label><input id="planner-task" className={styles.labInput} maxLength={100} value={taskId} disabled={!!binding || !!channel || working} onChange={(e) => { reset(); setTaskId(e.target.value); }} />
        <label htmlFor="planner-brief">依頼文</label><textarea id="planner-brief" maxLength={2000} rows={6} value={brief} disabled={!!binding || !!channel || working} onChange={(e) => { reset(); setBrief(e.target.value); }} />
        <label className={styles.labCheck}><input type="checkbox" checked={approved} disabled={working} onChange={(e) => setApproved(e.target.checked)} />{channel ? 'この依頼を0円でローカルSkyサーバーの処理へ渡す' : 'この依頼を0円でこのタブ内のSky処理へ渡す'}</label>
        <div className={styles.labActions}><button type="button" onClick={() => void run()} disabled={!approved || working || job?.status === 'review' || (!!channel && job?.status !== 'active')}>Skyで実行</button><button type="button" onClick={stop} disabled={!job || !['active', 'review'].includes(job.status)}>停止して成果を破棄</button></div>
      </section>
      {job && <section className={styles.work} aria-live="polite"><SkyWorkProgress job={job} />
        {job.skyApp?.result && <><SkyAppResultView binding={job.skyApp} /><div className={styles.labActions}>
          <button type="button" disabled={working || job.status !== 'review'} onClick={() => { if (channel) void channelCommand('confirm'); else put(confirmSkyAppJob(job)); }}>成果を確認済みにする</button>
          <button type="button" disabled={working || (!binding && !channel) || job.status !== 'completed' || returned} onClick={returnResult}>{returned ? 'Plannerへ下書きを送信済み' : 'Plannerへ下書きを返す'}</button>
        </div><details><summary>詳しい記録を表示（JSON）</summary><textarea aria-label="Sky成果JSON" readOnly rows={8} value={JSON.stringify(job, null, 2)} /></details>
        <SkyPortableExport key={`${job.id}/${job.revision}`} job={job} /><SkyAppServerPanel key={job.id} local={job} /></>}
      </section>}
      {error && <SkyNotice className={styles.labError} message={error} />}
      <div className={styles.labActions}><button type="button" onClick={reset}>この作業を閉じる</button><Link href="/sky/add/zoom/lab">会議メモの試作へ</Link></div><ProductDomainNavigation />
    </div><footer className={styles.footer}>これは自分だけで使う試作です。一般公開は保留しています。</footer>
  </div></main>;
}
