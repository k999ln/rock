'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createMiiWorkAdapter, type MiiWorkReadback } from '@/lib/mii-work-adapter';
import { createMiiIndexedDbJournal } from '@/lib/mii-indexeddb-journal';
import type { WorkJob } from '@/lib/workflow';

/** Software preview only. A real mii supplies its own authenticated host and sensors. */
export default function MiiWorkPreview({ job, ownerScope, onRead }: {
  job: WorkJob; ownerScope: string; onRead: (job: WorkJob) => void;
}) {
  const adapter = useRef<ReturnType<typeof createMiiWorkAdapter> | null>(null);
  const boot = useRef(''); const sequence = useRef(0);
  const context = (value: WorkJob, owner: string) => `${owner}\0${value.id}\0${value.revision}\0${value.agentBinding?.agentId ?? ''}\0${value.agentBinding?.agentRevision ?? ''}`;
  const currentContext = context(job, ownerScope);
  const activeContext = useRef(currentContext);
  const lastContext = useRef(currentContext);
  const [current, setCurrent] = useState<{ context: string; value: MiiWorkReadback } | null>(null);
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState('');
  const [renderContext, setRenderContext] = useState(currentContext);
  if (renderContext !== currentContext) {
    setRenderContext(currentContext);
    if (current?.context !== currentContext) { setCurrent(null); setConfirmed(false); setMessage(''); }
  }
  useEffect(() => () => { adapter.current?.close(); }, []);
  useLayoutEffect(() => {
    activeContext.current = currentContext;
    if (lastContext.current === currentContext) return;
    lastContext.current = currentContext;
    if (current?.context === currentContext) return;
    adapter.current?.disconnect();
  }, [currentContext, current]);
  const visible = current?.context === currentContext ? current.value : null;

  async function read() {
    if (busy || !job.agentBinding) return;
    const requestedContext = activeContext.current;
    setCurrent(null); setConfirmed(false); setBusy(true); setMessage('');
    try {
      adapter.current ??= createMiiWorkAdapter({ journal: createMiiIndexedDbJournal() });
      boot.current ||= `preview-${crypto.randomUUID()}`;
      const now = Date.now();
      adapter.current.observe({ bootId: boot.current, placeEpoch: 1, sequence: ++sequence.current, sceneRevision: 1,
        observedAt: now, expiresAt: now + 30_000, attached: true, tracking: 'tracked' });
      const result = await adapter.current.readExisting({ jobId: job.id, ownerScope, revision: job.revision,
        sceneRevision: 1, agentId: job.agentBinding.agentId, agentRevision: job.agentBinding.agentRevision });
      if (activeContext.current !== requestedContext) return;
      setCurrent({ context: context(result.job, ownerScope), value: result }); setConfirmed(false); onRead(result.job);
      setMessage(result.cancelReconciliation === 'pending' ? '停止要求の結果が未確認です。同じ仕事を照合してください。' :
        result.cancelReconciliation === 'unavailable' ? '仕事は読めました。停止記録の保存先は利用できません。' : '同じ担当と仕事を読み直しました。');
    } catch { if (activeContext.current === requestedContext) { setCurrent(null); setMessage('本人・担当・仕事の状態を確認できません。元の画面で確認してください。'); } }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (busy || !visible || !confirmed || !adapter.current) return;
    const requestedContext = activeContext.current;
    setBusy(true);
    try {
      const result = await adapter.current.cancelPlan({ commandId: crypto.randomUUID(), jobId: visible.job.id,
        revision: visible.job.revision, confirmed: true });
      if (activeContext.current !== requestedContext) return;
      setCurrent(null); setConfirmed(false);
      setMessage(result.state === 'plan_cancelled'
        ? '計画の取消を受け付けました。実行先や物理機器が停止したかは未確認です。同じ仕事を読み直してください。'
        : '停止要求の結果は未確認です。同じ仕事を読み直してください。');
    } catch { if (activeContext.current === requestedContext) setMessage('停止記録を保存できないか、停止の確認が必要です。同じ仕事を読み直してください。'); }
    finally { setBusy(false); }
  }
  return <details className="work-notice">
    <summary>mii連携のソフト試用</summary>
    <p>合成入力による文章表示の試用です。センサー・座標・校正や実際のmii・音声・空間表示・物理停止は確認していません。</p>
    <button type="button" disabled={busy || !job.agentBinding} onClick={() => void read()}>miiから同じ仕事を確認</button>
    {visible && <section aria-label="miiから見た同じ仕事">
      <p>{visible.job.title} · 版 {visible.job.revision} · {visible.job.status === 'cancelled' ? '計画取消（実行先の停止は未確認）' : visible.job.status}</p>
      <h3>依頼内容</h3><p>{typeof visible.job.plan?.objective === 'string' ? visible.job.plan.objective : '保存された依頼内容を確認できません。'}</p>
      <h3>担当</h3>
      <p>担当ID: {visible.job.agentBinding?.agentId ?? '未確認'} · 版 {visible.job.agentBinding?.agentRevision ?? '未確認'}。
        保存された担当との一致: {visible.agentBinding === 'verified' ? '確認済み' : '未確認'}。実行端末と機器の状態は未確認です。</p>
      <h3>Toolの状態</h3>
      {(visible.job.toolAttempts?.length ?? 0) === 0 && <p>この仕事に保存されたToolの試行記録はありません。</p>}
      {(visible.job.toolAttempts ?? []).map(item => <p key={item.id}>{item.toolName}：{item.state === 'pending'
        ? '試行を記録済みです。処理の開始・終了は未確認です。'
        : item.state === 'claimed' ? '実行の受付を記録しました。実際の処理・停止は未確認です。'
        : item.state === 'stop_requested' ? '停止要求を記録しました。実行先の停止は未確認です。'
        : item.state === 'cancelled_before_claim' ? '開始許可前の取消を記録しました。外部処理の有無は別途確認してください。'
        : item.state === 'observed_unverified' ? (item.stopRequestedAt
          ? '停止要求後の応答を観測しました。実行成功と実行先の停止は独立確認されていません。'
          : '画面で応答を観測しました。実行成功は独立確認されていません。') : '状態を確認できません。'}</p>)}
      <h3>保存済み成果</h3>
      {visible.job.standaloneAgent?.text && <div><p>保存済みのAgent成果</p><pre>{visible.job.standaloneAgent.text}</pre></div>}
      {visible.job.skyApp?.result?.body && <div><p>保存済みの連携成果（下書き）</p><pre>{visible.job.skyApp.result.body}</pre></div>}
      {visible.job.freeCloud?.text && <div><p>保存済みの回答（最終状態は元の仕事で確認）</p><pre>{visible.job.freeCloud.text}</pre></div>}
      {Object.entries(visible.job.composition?.artifacts ?? {}).map(([id, artifact]) => <div key={id}>
        <p>保存済みの組合せ成果：{artifact.status === 'passed' ? '保存時に検査済み' : '確認待ち'}</p><pre>{artifact.text}</pre></div>)}
      {(visible.job.toolObservations ?? []).map(item => <div key={item.id}><p>{item.toolName}の保存された観測（独立未検証）</p><pre>{item.text}</pre></div>)}
      {!visible.job.standaloneAgent?.text && !visible.job.skyApp?.result?.body && !visible.job.freeCloud?.text &&
        !Object.keys(visible.job.composition?.artifacts ?? {}).length && !(visible.job.toolObservations?.length) &&
        <p>この画面で確認できる保存済み本文はありません。成果の不在や失敗を意味しません。</p>}
      <p>費用はこの画面では照合していません。未確認の額を0円や確定済みとして扱わず、元の仕事の明細を確認してください。</p>
      <a href={`/api/sky/exports/${encodeURIComponent(visible.job.id)}?revision=${visible.job.revision}`} download>この仕事を持ち出す</a>
      <p>持出し内容と省略・未確認の項目は、生成されたファイルで確認してください。</p>
      {visible.job.standaloneAgent?.text && <p>この持出しにAgent成果本文は含まれません。元の成果画面から保存してください。</p>}
      {visible.job.freeCloud?.text && <p>この持出しに保存済み回答が含まれるとは限りません。元の成果画面も確認してください。</p>}
      {!!Object.keys(visible.job.composition?.artifacts ?? {}).length && <p>組合せ仕事の内部成果はこの持出しの対象外です。</p>}
      {visible.job.status === 'active' && <><label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />この仕事の計画取消を確認</label>
        <button type="button" disabled={busy || !confirmed || visible.cancelReconciliation !== 'clear'} onClick={() => void cancel()}>計画取消を依頼</button></>}
    </section>}
    {message && <p role="alert">{message}</p>}
  </details>;
}
