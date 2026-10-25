'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import type { WorkJob } from '@/lib/workflow';
import { prepareEveTextEstimate } from '@/lib/eve-text-job';
import { remoteAiTextRequest, readEveTextEstimate, eveTextEstimateIsCurrent, type EveTextEstimate } from '@/lib/remote-ai-text-client';
import { formatCurrencyMinor, formatCurrencyRatePerMillionTokens, parseCurrencyInputToMinor } from '@/lib/currency-format';

const labels: Record<string, string> = { 'ordinary-input': '入力', 'cached-input': 'キャッシュ入力', 'cache-write': 'キャッシュ保存', output: '出力' };

/** Estimates are ephemeral. Restoring a saved job never starts even an estimate. */
export default function EveTextEstimatePanel({ job, ownerScope, disabled = false }: {
  job: WorkJob; ownerScope: string | null; disabled?: boolean;
}) {
  const [consent, setConsent] = useState(false);
  const [model, setModel] = useState('');
  const [currency, setCurrency] = useState('');
  const [cap, setCap] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<EveTextEstimate | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(false);
  const flight = useRef(false);
  const identity = JSON.stringify([ownerScope, job.id, job.revision, job.status, job.composition, disabled]);
  const [renderedIdentity, setRenderedIdentity] = useState(identity);
  // Adjust this component's state before React commits a different saved selection.
  if (renderedIdentity !== identity) {
    setRenderedIdentity(identity); setConsent(false); setResult(null); setError(''); setBusy(false);
    setModel(''); setCurrency(''); setCap('');
  }
  const view = JSON.stringify([identity, consent, model, currency, cap]);
  const latest = useRef('');
  useLayoutEffect(() => {
    mounted.current = true; epoch.current++; flight.current = false;
    latest.current = '';
    return () => { mounted.current = false; flight.current = false; latest.current = ''; };
  }, [identity]);
  useLayoutEffect(() => { latest.current = view; }, [view]);
  useLayoutEffect(() => {
    if (!result) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const token = epoch.current;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!active || !mounted.current || token !== epoch.current) return;
        if (eveTextEstimateIsCurrent(result)) { schedule(); return; }
        setResult(null); setError('見積の有効期限が切れました。改めて見積もってください。');
      }, Math.max(0, Math.min(2_147_483_647, result.estimate.expiresAt - Date.now())));
    };
    schedule();
    return () => { active = false; clearTimeout(timer); };
  }, [result]);
  const available = !disabled && Boolean(ownerScope) && ['review', 'completed'].includes(job.status) &&
    Boolean(job.composition?.source && !job.composition.materialCleared);
  function invalidate() {
    epoch.current++; flight.current = false; latest.current = '';
    setConsent(false); setResult(null); setError(''); setBusy(false);
  }
  async function estimate() {
    if (!mounted.current || latest.current !== view || flight.current || !available || !consent) return;
    const token = epoch.current;
    const current = () => mounted.current && token === epoch.current;
    const comparisonCap = cap.trim() ? parseCurrencyInputToMinor(cap, currency) : null;
    if ((currency && !/^[A-Z]{3}$/.test(currency)) || (cap.trim() && (!currency || comparisonCap === null))) {
      setError('比較上限を入力する場合は、通貨と金額を確認してください。'); return;
    }
    flight.current = true; setBusy(true); setError(''); setResult(null);
    try {
      const prepared = await prepareEveTextEstimate(job);
      if (!current()) return;
      const response = await remoteAiTextRequest<unknown>('/api/llm/estimate', 'POST', {
        provider: 'openai', eveSource: { jobId: job.id, revision: job.revision }, consent: true,
        ...(model.trim() ? { model: model.trim() } : {}), ...(currency ? { currency } : {}),
        ...(comparisonCap !== null ? { maximumBudgetMinor: comparisonCap } : {}), maxOutputTokens: 1200,
      });
      if (!current()) return;
      const estimateResult = readEveTextEstimate(response, { sourceRef: prepared.sourceRef, promptDigest: prepared.promptDigest,
        currency: currency || undefined, model: model.trim() || undefined, outputTokenLimit: 1200, comparisonCapMinor: comparisonCap });
      setResult(estimateResult);
    } catch {
      if (current()) setError('見積を確認できません。保存した仕事・通貨・料金の接続状態を確認し、改めて見積もってください。');
    } finally { if (current()) { flight.current = false; setBusy(false); } }
  }
  // Check again during render: a valid reply may expire before React commits it.
  const displayed = result && eveTextEstimateIsCurrent(result) ? result : null;
  return <section aria-label="保存資料の料金見積">
    <h2>保存した資料で料金を見積もる</h2>
    <p>2つの保存資料と依頼を使った見積のみです。この画面では生成・費用の承認・課金は行いません。</p>
    <p>この環境では文章生成を開始できません。資料の保存・復元はそのまま利用できます。</p>
    <fieldset disabled={!available}>
      <label>モデル（任意）<input aria-label="見積モデル" maxLength={120} value={model} onChange={(event) => { invalidate(); setModel(event.target.value); }} /></label>
      <label>通貨（任意）<input aria-label="見積通貨" maxLength={3} placeholder="USD、JPYなど" value={currency} onChange={(event) => { invalidate(); setCurrency(event.target.value.toUpperCase()); }} /></label>
      <label>比較用上限（任意・未承認）<input aria-label="見積比較上限" inputMode="decimal" value={cap} maxLength={24} onChange={(event) => { invalidate(); setCap(event.target.value); }} /></label>
      <label><input type="checkbox" checked={consent} onChange={(event) => {
        invalidate(); setConsent(event.target.checked);
      }} />保存した2資料と依頼を料金見積に使います。</label>
      <button type="button" disabled={!available || !consent || busy} onClick={() => void estimate()}>{busy ? '見積を確認中…' : '見積のみ確認'}</button>
    </fieldset>
    {(error || (result && !displayed)) && <p role="alert">{error || '見積の有効期限が切れました。改めて見積もってください。'}</p>}
    {displayed && <div aria-label="料金見積の結果">
      <p>保存版 {displayed.sourceRef.revision}・{displayed.estimate.modelId}：最大見積 {formatCurrencyMinor(displayed.estimate.maximumChargeMinor, displayed.estimate.currency)}</p>
      <p>{!cap.trim() ? '比較用上限は未指定です。実行費用は未承認です。' :
        displayed.withinUserCap ? '比較用上限の範囲内です。実行費用は未承認です。' : '比較用上限を超えています。実行は開始していません。'}</p>
      <ul>{displayed.unitRates.map((rate) => <li key={rate.category}>{labels[rate.category]}：{formatCurrencyRatePerMillionTokens(rate.rateMinorMicrosPerMillionTokens, displayed.estimate.currency)}</li>)}</ul>
      <p>料金版 {displayed.estimate.pricingVersion}。<a href={displayed.rateSource} rel="noreferrer" target="_blank">単価の出典</a></p>
      <p>Providerへ送信していません。これは確定した利用明細や請求額ではありません。</p>
    </div>}
  </section>;
}
