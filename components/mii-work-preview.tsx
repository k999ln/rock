'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createMiiWorkAdapter, type MiiWorkReadback, type MiiBudgetReadback } from '@/lib/mii-work-adapter';
import { formatCurrencyMinor } from '@/lib/currency-format';
import { createMiiIndexedDbJournal } from '@/lib/mii-indexeddb-journal';
import { describeMiiPreviewRead } from '@/lib/mii-preview-descriptors';
import type { WorkJob } from '@/lib/workflow';

export type MiiWorkInput = {
  id: string; text: string; isCurrent: () => boolean; onJob: (job: WorkJob) => void;
};

/** Software preview only. A real mii supplies its own authenticated host and sensors. */
export default function MiiWorkPreview({ job, ownerScope, onRead, onInput, inputAvailable = false }: {
  job: WorkJob; ownerScope: string; onRead: (job: WorkJob) => void;
  onInput?: (input: MiiWorkInput) => void; inputAvailable?: boolean;
}) {
  const adapter = useRef<ReturnType<typeof createMiiWorkAdapter> | null>(null);
  const boot = useRef(''); const sequence = useRef(0), observationExpiry = useRef(0);
  const place = useRef(1), scene = useRef(1), inputEpoch = useRef(0);
  const leaseEpoch = useRef(0);
  const [text, setText] = useState('');
  const [requiredText, setRequiredText] = useState('');
  const available = useRef(inputAvailable);
  const context = (value: WorkJob, owner: string) => `${owner}\0${value.id}\0${value.revision}\0${value.agentBinding?.agentId ?? ''}\0${value.agentBinding?.agentRevision ?? ''}`;
  const currentContext = context(job, ownerScope);
  const activeContext = useRef(currentContext);
  const lastContext = useRef(currentContext);
  const [current, setCurrent] = useState<{ context: string; value: MiiWorkReadback; epoch: number;
    issuedAt: number; expiresAt: number; clock: { last: number } } | null>(null);
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState('');
  const [budget, setBudget] = useState<{ context: string; expiresAt: number; value: MiiBudgetReadback } | null>(null);
  const [renderContext, setRenderContext] = useState(currentContext);
  const [renderInputAvailable, setRenderInputAvailable] = useState(inputAvailable);
  if (renderInputAvailable !== inputAvailable) { setRenderInputAvailable(inputAvailable); setBudget(null); }
  if (renderContext !== currentContext) {
    setRenderContext(currentContext);
    if (current?.context !== currentContext) { setCurrent(null); setBudget(null); setConfirmed(false); setMessage(''); setText(''); setRequiredText(''); }
  }
  useEffect(() => {
    const lease = leaseEpoch, input = inputEpoch, ownedAdapter = adapter;
    return () => { lease.current++; input.current++; ownedAdapter.current?.close(); };
  }, []);
  useEffect(() => {
    if (!budget) return;
    const timer = setTimeout(() => setBudget(current => current === budget ? null : current), Math.max(0, Math.min(30_000, budget.expiresAt - Date.now())));
    return () => clearTimeout(timer);
  }, [budget]);
  useEffect(() => {
    if (!current) return;
    let timer: ReturnType<typeof setTimeout>;
    let closed = false;
    const check = () => {
      if (closed || leaseEpoch.current !== current.epoch) return;
      clearTimeout(timer);
      const now = Date.now();
      if (!Number.isSafeInteger(now) || now < current.issuedAt || now < current.clock.last || now >= current.expiresAt) {
        leaseEpoch.current++; inputEpoch.current++; adapter.current?.disconnect();
        setCurrent(value => value?.epoch === current.epoch ? null : value);
        setBudget(null); setConfirmed(false);
        setMessage('観測期限が切れたか時計が変わりました。同じ仕事を読み直してください。');
        return;
      }
      current.clock.last = now;
      timer = setTimeout(check, Math.min(1_000, current.expiresAt - now));
    };
    timer = setTimeout(check, Math.max(0, Math.min(1_000, current.expiresAt - Date.now())));
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', check);
    if (typeof window !== 'undefined') window.addEventListener('focus', check);
    return () => { closed = true; clearTimeout(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', check);
      if (typeof window !== 'undefined') window.removeEventListener('focus', check); };
  }, [current]);
  useLayoutEffect(() => {
    activeContext.current = currentContext;
    if (lastContext.current === currentContext) return;
    lastContext.current = currentContext;
    if (current?.context === currentContext) return;
    leaseEpoch.current++; inputEpoch.current++;
    adapter.current?.disconnect();
  }, [currentContext, current]);
  useLayoutEffect(() => {
    available.current = inputAvailable;
    // Tool availability fences input, not the independent saved-output view.
    if (!inputAvailable) inputEpoch.current++;
  }, [inputAvailable]);
  const visible = current?.context === currentContext ? current.value : null;

  async function read() {
    if (busy || !job.agentBinding) return;
    const requestedContext = activeContext.current;
    const epoch = ++leaseEpoch.current;
    setCurrent(null); setBudget(null); setConfirmed(false); setBusy(true); setMessage('');
    try {
      adapter.current ??= createMiiWorkAdapter({ journal: createMiiIndexedDbJournal(), descriptors: describeMiiPreviewRead });
      boot.current ||= `preview-${crypto.randomUUID()}`;
      const now = Date.now(); observationExpiry.current = now + 30_000;
      adapter.current.observe({ bootId: boot.current, placeEpoch: place.current, sequence: ++sequence.current, sceneRevision: scene.current,
        observedAt: now, expiresAt: now + 30_000, attached: true, tracking: 'tracked' });
      const result = await adapter.current.readExisting({ jobId: job.id, ownerScope, revision: job.revision,
        sceneRevision: scene.current, agentId: job.agentBinding.agentId, agentRevision: job.agentBinding.agentRevision });
      if (!Number.isSafeInteger(result.observationExpiresAt)) throw new Error('MII_OBSERVATION_UNAVAILABLE');
      observationExpiry.current = Math.min(observationExpiry.current, result.observationExpiresAt);
      const acceptedAt = Date.now();
      if (activeContext.current !== requestedContext || leaseEpoch.current !== epoch || acceptedAt < now || acceptedAt >= observationExpiry.current) return;
      setCurrent({ context: context(result.job, ownerScope), value: result, epoch,
        issuedAt: now, expiresAt: observationExpiry.current, clock: { last: acceptedAt } }); setConfirmed(false); onRead(result.job);
      setMessage(result.cancelReconciliation === 'pending' ? '停止要求の結果が未確認です。同じ仕事を照合してください。' :
        result.cancelReconciliation === 'unavailable' ? '仕事は読めました。停止記録の保存先は利用できません。' : '同じ担当と仕事を読み直しました。');
    } catch { if (activeContext.current === requestedContext && leaseEpoch.current === epoch) { setCurrent(null); setMessage('本人・担当・仕事の状態を確認できません。元の画面で確認してください。'); } }
    finally { setBusy(false); }
  }
  async function readBudget() {
    if (busy || !visible || !adapter.current) return;
    const requestedContext = activeContext.current, expiresAt = observationExpiry.current, epoch = current?.epoch;
    setBudget(null); setMessage(''); setBusy(true);
    try {
      const result = await adapter.current.readBudget();
      if (activeContext.current !== requestedContext || leaseEpoch.current !== epoch || Date.now() >= expiresAt) return;
      setBudget({ context: requestedContext, expiresAt, value: result });
    } catch { if (activeContext.current === requestedContext && leaseEpoch.current === epoch) setMessage('同じ仕事の委任予算を確認できません。金額は推測しません。'); }
    finally { setBusy(false); }
  }
  function invalidateInput(kind: 'tracking' | 'detach' | 'boot' | 'scene') {
    leaseEpoch.current++; inputEpoch.current++;
    adapter.current?.disconnect();
    if (kind === 'boot') { boot.current = ''; sequence.current = 0; }
    if (kind === 'detach') place.current++;
    if (kind === 'scene') scene.current++;
    setCurrent(null); setBudget(null); setConfirmed(false);
    setMessage('観測を失効しました。再接続だけでは実行を再開しません。既に送った処理が停止したかは未確認です。同じ仕事を読み直してください。');
  }
  function stageInput() {
    if (busy || !visible || !onInput || !inputAvailable || !text.trim() || text.length > 4000) return;
    try {
      const required = requiredText.trim() ? JSON.parse(requiredText) as unknown : undefined;
      const guard = adapter.current!.createInputGuard(required), epoch = ++inputEpoch.current;
      const sourceJob = visible.job, owner = ownerScope;
      let acceptedContext = activeContext.current;
      const isCurrent = () => available.current && inputEpoch.current === epoch &&
        activeContext.current === acceptedContext && guard();
      onInput({ id: crypto.randomUUID(), text: text.trim(), isCurrent,
        onJob: next => {
          if (!isCurrent() || next.id !== sourceJob.id || next.revision <= sourceJob.revision ||
              next.agentBinding?.agentId !== sourceJob.agentBinding?.agentId ||
              next.agentBinding?.agentRevision !== sourceJob.agentBinding?.agentRevision) return;
          acceptedContext = context(next, owner);
          activeContext.current = acceptedContext;
          setCurrent(value => value && current && value.epoch === current.epoch ? { ...value, context: acceptedContext, value: { ...visible, job: next } } : value); onRead(next);
        } });
      setMessage('同じ仕事のTool確認画面へ入力を渡しました。上の実行内容と引数を確認し、今回の実行を承認してください。観測期限は読み取りから30秒です。');
    } catch (error) {
      const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
      setMessage(code === 'MII_CAPABILITY_MISSING'
        ? '指定した必要能力は不足しています。入力を渡しません。保存済みの仕事は読めます。'
        : code === 'MII_CAPABILITIES_UNCONFIRMED'
        ? '指定した必要能力は未確認です。入力を渡しません。保存済みの仕事は読めます。'
        : code === 'MII_CAPABILITY_REQUIREMENTS_INVALID' || error instanceof SyntaxError
          ? '必要能力のJSONを確認してください。入力を渡しません。'
          : '入力の観測または仕事の状態が古くなりました。同じ仕事を読み直してください。');
    }
  }
  async function cancel() {
    if (busy || !visible || !confirmed || !adapter.current) return;
    const requestedContext = activeContext.current;
    const epoch = ++leaseEpoch.current;
    inputEpoch.current++; setCurrent(null); setBudget(null); setConfirmed(false);
    setMessage('停止要求の結果を確認しています。実行先や物理機器の停止は未確認です。');
    setBusy(true);
    try {
      const result = await adapter.current.cancelPlan({ commandId: crypto.randomUUID(), jobId: visible.job.id,
        revision: visible.job.revision, confirmed: true });
      if (activeContext.current !== requestedContext || leaseEpoch.current !== epoch) return;
      setMessage(result.state === 'plan_cancelled'
        ? '計画の取消を受け付けました。実行先や物理機器が停止したかは未確認です。同じ仕事を読み直してください。'
        : '停止要求の結果は未確認です。同じ仕事を読み直してください。');
    } catch { if (activeContext.current === requestedContext && leaseEpoch.current === epoch) setMessage('停止記録を保存できないか、停止の確認が必要です。同じ仕事を読み直してください。'); }
    finally { setBusy(false); }
  }
  return <details className="work-notice">
    <summary>mii連携のソフト試用</summary>
    <p>合成入力による文章表示の試用です。センサー・座標・校正や実際のmii・音声・空間表示・物理停止は確認していません。</p>
    <button type="button" disabled={busy || !job.agentBinding} onClick={() => void read()}>miiから同じ仕事を確認</button>
    {onInput && <>
      <p>音声の代わりに文章を入力します。選んだ互換Toolへ同じ仕事で渡し、実行には別途承認が必要です。</p>
      <label>miiへの合成テキスト<textarea maxLength={4000} value={text}
        onChange={event => { inputEpoch.current++; setText(event.target.value); }} /></label>
      <label>追加の必要能力（JSON、任意）<textarea maxLength={2048} value={requiredText}
        placeholder={'例: {"executor":["model.inference"],"output":["audio.render"]}'}
        onChange={event => { inputEpoch.current++; setRequiredText(event.target.value); setMessage(''); }} /></label>
      <p>host・executor・outputごとの能力IDを指定できます。空欄は追加条件なしです。宣言の照合は権限や実機の証明ではありません。</p>
      <button type="button" disabled={busy || !visible || !inputAvailable || !text.trim() || visible.job.status !== 'active' ||
        visible.cancelReconciliation !== 'clear' || Boolean(visible.job.toolAttempts?.length)} onClick={stageInput}>同じ仕事のTool確認へ渡す</button>
      {!inputAvailable && <p>先にこの担当の互換runtime/toolを選んでください。対応しない能力へは渡せません。</p>}
      <div aria-label="mii観測の失効を試す">
        <button type="button" onClick={() => invalidateInput('tracking')}>追跡喪失を模擬</button>
        <button type="button" onClick={() => invalidateInput('detach')}>取り外しを模擬</button>
        <button type="button" onClick={() => invalidateInput('boot')}>再起動を模擬</button>
        <button type="button" onClick={() => invalidateInput('scene')}>scene変更を模擬</button>
      </div>
    </>}
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
      <h3>同じ仕事の委任予算</h3>
      <button type="button" disabled={busy} onClick={() => void readBudget()}>委任予算を読み直す</button>
      {budget?.context === currentContext && budget.value.jobId === visible.job.id && budget.value.jobRevision === visible.job.revision
        ? budget.value.budget ? <p>取得時点の委任予算（{new Date(budget.value.readAt).toLocaleString()}、版 {budget.value.budget.revision}）：上限 {formatCurrencyMinor(budget.value.budget.budgetLimitMinor, budget.value.budget.currency)} · 予約中 {formatCurrencyMinor(budget.value.budget.reservedMinor, budget.value.budget.currency)} · 利用量確定記録 {formatCurrencyMinor(budget.value.budget.settledMinor, budget.value.budget.currency)}。</p>
          : <p>取得時点（{new Date(budget.value.readAt).toLocaleString()}）では、この仕事の委任予算記録はありません。</p>
        : <p>委任予算は未確認です。</p>}
      <p>委任予算はMCP Toolの料金や請求確定額ではありません。取得後に変更される場合があります。未確認の額を0円や確定済みとして扱わず、Toolの費用は元の仕事の明細を確認してください。</p>
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
