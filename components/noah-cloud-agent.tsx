'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NOAH_CLOUD_PROFILES, noahCloudListYen, type NoahCloudConnection, type NoahCloudFile, type NoahCloudProfile, type NoahCloudUsage } from '@/lib/noah-cloud-contract';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import NoahLoading from './noah-loading';
import NoahReadyDetail from './noah-ready-detail';
import { useNoahLocale } from './noah-locale';
import styles from './noah-cloud-agent.module.css';

type Job = { id: string; state: string; prompt: string; result?: { text: string }; files: NoahCloudFile[]; error?: string; calls: number; usage?: NoahCloudUsage | null };
type State = { ownerScope: string; connection: NoahCloudConnection | null; jobs: Job[] };
const active = (job: Job) => ['queued', 'running'].includes(job.state);
const label: Record<string, string> = { queued: '受付済み', running: '実行中', returned: '結果を受け取りました', failed: '実行できませんでした', cancelled: '停止済み', unknown: '結果を確認できません' };
function download(file: NoahCloudFile) {
  const blob = new Blob([Uint8Array.from(atob(file.base64), c => c.charCodeAt(0))], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = file.name.split('/').at(-1) || 'result'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function NoahCloudAgent({ projectId, profile, providerFamilyId, eveDraft }: { projectId: string; profile: NoahCloudProfile; providerFamilyId: string | null; eveDraft?: string }) {
  const { t } = useNoahLocale();
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [readError, setReadError] = useState('');
  const [pending, setPending] = useState(false), [prompt, setPrompt] = useState(eveDraft ?? ''), [place, setPlace] = useState<'cloud' | 'provider'>('cloud');
  const [confirmation, setConfirmation] = useState<'connect' | 'start' | null>(null);
  const submission = useRef<{ id: string; prompt: string; connectionId: string } | null>(null);
  const current = useRef(0);
  const definition = NOAH_CLOUD_PROFILES[profile];
  const consultation = eveDraft !== undefined;
  const requestTarget: Record<string, string> = { projectId };
  if (consultation) requestTarget.purpose = 'eve-engineering';
  const endpoint = `/api/noah/cloud-agents?${new URLSearchParams(requestTarget)}`;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const generation = ++current.current;
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000) });
      const data = await response.json() as State & { error?: string };
      if (!response.ok) throw Error(data.error || '接続を確認できません。');
      const running = data.jobs.filter(active).slice(0, 2);
      for (const job of running) {
        const res = await fetch(`${endpoint}&jobId=${encodeURIComponent(job.id)}`, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
        const value = await res.json() as { job?: Job; ownerScope?: string; error?: string };
        if (!res.ok || value.ownerScope !== data.ownerScope || !value.job) throw Error(value.error || '結果を確認できません。');
        data.jobs = data.jobs.map(item => item.id === job.id ? value.job! : item);
      }
      if (!signal?.aborted && current.current === generation) { setState(data); setReadError(''); }
    } catch (e) { if (!signal?.aborted && current.current === generation) { setState(null); setReadError(e instanceof Error ? e.message : '接続を確認できません。'); } }
  }, [endpoint]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => { void refresh(controller.signal); }, 0); return () => { clearTimeout(timer); controller.abort(); }; }, [refresh]);
  const progressing = state?.connection?.state === 'preparing' || state?.jobs.some(active);
  useEffect(() => { if (!progressing || pending) return; const timer = setInterval(() => { void refresh(); }, 2000); return () => clearInterval(timer); }, [progressing, pending, refresh]);
  async function act(action: 'connect' | 'disconnect' | 'start' | 'stop', jobId?: string, confirmed = false) {
    if (!state || pending) return;
    setPending(true); setError('');
    try {
      let extra: Record<string, unknown> = {};
      if (action === 'connect') extra = { id: crypto.randomUUID() };
      if (action === 'stop') extra = { jobId };
      if (action === 'start') {
        const connectionId = state.connection?.id ?? '';
        if (!submission.current || submission.current.prompt !== prompt || submission.current.connectionId !== connectionId) submission.current = { id: crypto.randomUUID(), prompt, connectionId };
        extra = { jobId: submission.current.id, connectionId, prompt };
      }
      const response = await fetch('/api/noah/cloud-agents', { method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: state.ownerScope }, body: JSON.stringify({ action, ...requestTarget, ...extra, confirm: confirmed }), signal: AbortSignal.timeout(25000) });
      const data = await response.json() as { error?: string; confirmationRequired?: boolean };
      if (!response.ok) {
        if (data.confirmationRequired && (action === 'start' || action === 'connect')) setConfirmation(action);
        else if (response.status >= 400 && response.status < 500 && action === 'start') { submission.current = null; await refresh(); }
        throw Error(data.error || '操作できませんでした。');
      }
      setConfirmation(null);
      if (action === 'start') { submission.current = null; setPrompt(''); }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : '操作できませんでした。'); }
    finally { setPending(false); }
  }
  return <section className={styles.panel} aria-label={t('クラウドで使う')}>
    {providerFamilyId && <div className={styles.places} aria-label={t('実行先')}><button aria-pressed={place === 'cloud'} onClick={() => setPlace('cloud')}>{t('Noahのクラウド')}</button><button aria-pressed={place === 'provider'} onClick={() => setPlace('provider')}>{t('提供元に直接接続')}</button></div>}
    {place === 'provider' && providerFamilyId ? <NoahReadyDetail id={providerFamilyId} internalOnly /> : <>
      <div className={styles.heading}><h2>{t(consultation ? 'Eveに相談する' : 'Noahのクラウドで使う')}</h2><span>{consultation && 'Hermes · '}v{definition.version}</span></div>
      <p>{t(consultation ? '作りたいAgentについて教えてください。EveはNoahの無料クラウドでHermesを使い、設計案をこの画面に返します。' : definition.description)}</p><p className={styles.note}>{t('インストールやモデルの設定は不要です。入力はNoahのクラウドとCloudflareのモデルに送信されます。')}</p>
      {readError && <div role="alert"><p>{t(readError)}</p><button onClick={() => void refresh()}>{t('再確認')}</button></div>}
      {error && <p role="alert" className={styles.error}>{t(error)}</p>}
      {confirmation && <div><p>{t('表示中の入力と送信先を確認して、この操作を実行します。')}</p><button disabled={pending || !state} onClick={() => void act(confirmation, undefined, true)}>{t(confirmation === 'connect' ? '確認して接続' : '確認して依頼')}</button><button disabled={pending} onClick={() => setConfirmation(null)}>{t('戻る')}</button></div>}
      {!state && !readError && <NoahLoading compact label={t('クラウドの接続を確認中')} />}
      {consultation && <><label htmlFor="eve-engineering-question">{t('相談したいこと')}</label>
        <textarea id="eve-engineering-question" value={prompt} maxLength={12000} rows={5} disabled={pending} onChange={event => { setPrompt(event.target.value); setConfirmation(null); }} /></>}
      {state && <>
        {state.connection?.state === 'preparing' ? <div className={styles.preparing}><NoahLoading variant="connection" label={t('実行環境を準備しています')} /><p>{t('実行環境を準備しています')}</p><button disabled={pending} onClick={() => void act('disconnect')}>{t('準備を止める')}</button></div> : state.connection?.state === 'connected' ? <>
          <div className={styles.connected}><span>{t('接続済み')}</span><button disabled={pending} onClick={() => void act('disconnect')}>{t('切断')}</button></div>
          <form onSubmit={event => { event.preventDefault(); void act('start'); }}>
            {!consultation && <><label htmlFor={`cloud-prompt-${profile}`}>{profile === 'boss' ? '面接を準備したい求人票' : profile === 'memory' ? t('整理したいメモ') : '何をしてほしいですか'}</label>
            <textarea id={`cloud-prompt-${profile}`} value={prompt} maxLength={12000} onChange={event => { setPrompt(event.target.value); setConfirmation(null); }} placeholder={profile === 'boss' ? '求人票の仕事内容・応募条件を貼り付ける' : profile === 'time' ? '例: 東京の現在時刻とロンドンとの時差を教えて' : profile === 'hermes' ? '例: 小さなサービスを公開する3工程の計画を作り、重要な条件をメモして' : profile === 'thinking' ? '例: 小さなサービスを公開するまでの作業順を整理して' : profile === 'memory' ? t('例：春の展示会は田中さんが会場、森さんが招待状を担当。人と担当の関係をまとめて。') : '例: 1200と800の合計を計算し、total.txtに保存して'} rows={5} disabled={pending} />
            </>}
            <button className={styles.primary} disabled={pending || !prompt.trim() || state.jobs.some(active)}>{t(pending ? '受付中…' : consultation ? 'Eveに送る' : '依頼する')}</button>

          </form>
        </> : <><button className={styles.primary} disabled={pending} onClick={() => void act('connect')}>{t(pending ? '接続中…' : '接続して使う')}</button>{state.connection?.error && <p role="alert">{t(state.connection.error)}</p>}</>}
        {!!state.jobs.length && <div className={styles.history} aria-live={consultation ? 'polite' : undefined}><h3>{t(consultation ? '相談と返答' : '依頼と結果')}</h3>{state.jobs.map(job => <article key={job.id}>
          <div className={styles.jobHeading}><strong>{t(label[job.state] || job.state)}</strong>{active(job) && <button disabled={pending} onClick={() => void act('stop', job.id)}>{t('停止')}</button>}</div>
          <p className={styles.prompt}>{job.prompt}</p>
          {job.result && <>{consultation && <strong>{t('Eveの返答（Hermesで実行）')}</strong>}<pre>{job.result.text}</pre><p className={styles.note}>{t('Agentから受け取った内容です。利用前に確認してください。')}</p></>}
          {job.error && <p role="alert">{t(job.error)}</p>}
          {!!job.files?.length && <div className={styles.files}>{job.files.map(file => <button key={file.name} onClick={() => download(file)}>{t('{name}を保存',{name:file.name})}</button>)}</div>}
          {active(job) && <p className={styles.note}>{t('画面を閉じてもクラウドで処理が続きます。')}</p>}
          {job.usage && <p className={styles.note}>{t('使った量: モデル {calls} 回・{neurons} neuron（無料の枠の中。有料プランの値段なら 約 {yen} 円）', { calls: job.calls, neurons: job.usage.neurons.toLocaleString(), yen: noahCloudListYen(job.usage) })}</p>}
        </article>)}</div>}
      </>}
    </>}
  </section>;
}
