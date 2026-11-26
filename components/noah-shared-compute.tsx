'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { noahAccountHref } from '@/lib/noah-navigation';
import { OWNER_SCOPE_HEADER, readOwnerScope } from '@/lib/owner-intent';
import { SHARED_SAMPLES } from '@/lib/noah-shared-workload';
import common from './noah-unified.module.css';
import styles from './noah-shared-compute.module.css';

const endpoint = '/api/noah/shared-compute';
const sampleTitle = new Map(SHARED_SAMPLES.map(sample => [sample.id, sample.title]));
const categories: Record<string, string> = { meeting: '会議', inventory: '在庫', research: '研究' };
type JobStatus = 'queued' | 'leased' | 'completed' | 'cancelled' | 'expired';
const states: Record<JobStatus, string> = {
  queued: '参加端末を待っています', leased: '参加端末で計算中', completed: '検収済み', cancelled: '取り消し済み', expired: '期限切れ',
};
type Job = { id: string; sampleId: string; status: JobStatus; result: {label: string; score: number} | null; receiptId: string | null };
type Dashboard = {
  ownerScope: string; consentVersion: string; acceptingDevices: boolean; devices: { id: string; active: boolean; enrolledAt: number; mode: 'test' | 'live'; currentEnvironment: boolean }[]; jobs: Job[];
};
type PlanState = {
  ownerScope: string; configured: boolean; testMode: boolean;
  plan: {amountMinor: number; currency: string; merchant: string; monthlyJobs: number; termsVersion: string} | null;
  contract: {termsVersion: string; amountMinor: number; currency: string; merchant: string; monthlyJobs: number} | null;
  subscription: {status: 'none' | 'pending' | 'active' | 'ending' | 'inactive'; entitled: boolean; periodEnd: number | null; canCancel: boolean; renewalStopped: boolean};
};
const planStates = { none: '未契約', pending: '申込み手続き中', active: '利用中', ending: '期間終了時に解約', inactive: '利用停止中' };

class AccountRequired extends Error {}
async function api<T>(path: string, signal: AbortSignal, action?: {owner: string; body: object}): Promise<T> {
  const response = await fetch(endpoint + path, {
    method: action ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    ...(action ? {headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: action.owner }, body: JSON.stringify(action.body)} : {}),
  });
  if (response.status === 401) throw new AccountRequired();
  const data = await response.json();
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? data.error : null;
    throw new Error(typeof message === 'string' ? message : '操作を完了できませんでした。再度お試しください。');
  }
  return data as T;
}
function errorText(error: unknown) {
  if (error instanceof Error && error.name === 'Error') return error.message;
  return '接続を確認して、もう一度お試しください。';
}
function priceLabel(plan: {amountMinor: number; currency: string}) {
  const money = new Intl.NumberFormat('ja-JP', {style: 'currency', currency: plan.currency});
  const digits = money.resolvedOptions().maximumFractionDigits ?? 2;
  return money.format(plan.amountMinor / 10 ** digits);
}
function Consent({value, change, children}: {value: boolean; change: (value: boolean) => void; children: ReactNode}) {
  return <label className={styles.consent}><input type="checkbox" checked={value} onChange={event => change(event.target.checked)} />{children}</label>;
}

export default function NoahSharedCompute() {
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [board, setBoard] = useState<Dashboard | null>(null);
  const [planError, setPlanError] = useState(''), [queueError, setQueueError] = useState('');
  const [login, setLogin] = useState(false);
  const [actionError, setActionError] = useState(''), [notice, setNotice] = useState('');
  const [acceptedPlan, setAcceptedPlan] = useState(''), [acceptedHost, setAcceptedHost] = useState(''), [acceptedJob, setAcceptedJob] = useState('');
  const [sample, setSample] = useState(SHARED_SAMPLES[0].id);
  const [platform, setPlatform] = useState<'android' | 'linux'>('android');
  const [secret, setSecret] = useState<{id: string; token: string; platform: 'android' | 'linux'} | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const pendingJob = useRef<{id: string; sample: string} | null>(null);
  const currentOwner = useRef<string | null>(null);
  const action = useRef<AbortController | null>(null);
  const running = board?.jobs.some(job => job.status === 'queued' || job.status === 'leased') ?? false;
  const pendingCheckout = plan?.subscription.status === 'pending';
  const terms = plan?.contract ?? plan?.plan;
  const planIntent = plan && terms ? [plan.ownerScope, terms.termsVersion].join('/') : '';
  const hostIntent = board ? [board.ownerScope, board.consentVersion, platform].join('/') : '';
  const jobIntent = board ? [board.ownerScope, board.consentVersion, sample].join('/') : '';
  const planConsent = !!planIntent && acceptedPlan === planIntent;
  const hostConsent = !!hostIntent && acceptedHost === hostIntent;
  const jobConsent = !!jobIntent && acceptedJob === jobIntent;

  useEffect(() => () => action.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    let accountChanged = false;
    let timer: number | undefined;
    let pendingChecks = 0;
    function observeOwner<T extends {ownerScope: string}>(data: T, commit: (data: T) => void) {
      if (controller.signal.aborted || accountChanged) return;
      const owner = readOwnerScope(data.ownerScope);
      if (!owner || (currentOwner.current && currentOwner.current !== owner)) {
        accountChanged = true;
        window.location.reload();
        return;
      }
      currentOwner.current = owner;
      commit(data);
    }
    function onError(error: unknown, target: (message: string) => void) {
      if (controller.signal.aborted) return;
      if (error instanceof AccountRequired) { setLogin(true); setSecret(null); }
      else target(errorText(error));
    }
    async function load(includePlan: boolean, includeJobs: boolean) {
      await Promise.all([
        includePlan && api<PlanState>('/plan', controller.signal).then(value => observeOwner(value, data => { setPlan(data); setPlanError(''); })).catch(error => onError(error, setPlanError)),
        includeJobs && api<Dashboard>('', controller.signal).then(value => observeOwner(value, data => { setBoard(data); setQueueError(''); })).catch(error => onError(error, setQueueError)),
      ]);
      if (includePlan && pendingCheckout) pendingChecks++;
      const checkCheckout = pendingCheckout && pendingChecks < 8;
      if (!controller.signal.aborted && !accountChanged && !login && (running || checkCheckout)) {
        timer = window.setTimeout(() => {
          const visible = !document.hidden && !action.current;
          void load(visible && checkCheckout, visible && running);
        }, 8000);
      }
    }
    void load(true, true);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [refresh, running, pendingCheckout, login]);

  async function run(fn: (signal: AbortSignal) => Promise<void>) {
    if (action.current) return;
    const controller = new AbortController();
    action.current = controller;
    setBusy(true); setActionError(''); setNotice('');
    try { await fn(controller.signal); }
    catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof AccountRequired) { setLogin(true); setSecret(null); }
        else setActionError(errorText(error));
      }
    } finally {
      action.current = null;
      if (!controller.signal.aborted) { setBusy(false); setRefresh(n => n + 1); }
    }
  }
  function checkout() {
    if (!plan || !terms || !planConsent) return;
    const termsVersion = terms.termsVersion;
    void run(async signal => {
      const result = await api<{url: string}>('/plan', signal, {owner: plan.ownerScope, body: {action: 'checkout', termsVersion}});
      const destination = new URL(result.url);
      if (destination.origin !== 'https://checkout.stripe.com') throw new Error('申込み先を確認できませんでした。');
      window.location.assign(destination.href);
    });
  }
  function submit() {
    if (!board || !jobConsent || !plan?.subscription.entitled) return;
    const request = pendingJob.current?.sample === sample ? pendingJob.current : {id: crypto.randomUUID(), sample};
    pendingJob.current = request;
    void run(async signal => {
      await api('', signal, {owner: board.ownerScope, body: {action: 'submit', requestId: request.id, sampleId: sample, consentVersion: board.consentVersion, acceptThirdParty: true}});
      pendingJob.current = null; setAcceptedJob(''); setNotice('依頼を受け付けました。結果はこの画面で確認できます。');
    });
  }
  function enroll() {
    if (!board?.acceptingDevices || !hostConsent) return;
    const id = crypto.randomUUID();
    void run(async signal => {
      const result = await api<{deviceToken: string}>('', signal, {owner: board.ownerScope, body: {action: 'enroll', deviceId: id, consentVersion: board.consentVersion, acceptThirdParty: true}});
      setSecret({id, token: result.deviceToken, platform}); setAcceptedHost('');
    });
  }
  function revoke(id: string) {
    if (!board) return;
    void run(async signal => {
      await api('', signal, {owner: board.ownerScope, body: {action: 'revoke', deviceId: id}});
      setSecret(current => current?.id === id ? null : current); setNotice('端末の提供を停止しました。');
    });
  }

  return <main className={common.page}>
    <header className={common.heading}><h1>参加型計算</h1></header>
    {login ? <section className={styles.section}><p>月額契約や参加端末を管理するには、Noahのアカウントにログインしてください。</p>
      <Link className={common.secondary} href={noahAccountHref('/noah/shared-compute')}>ログインする</Link></section> :
    <div className={styles.groups}>
      <section className={styles.section} aria-labelledby="compute-plan">
        <h2 id="compute-plan">月額プラン</h2>
        <p>公開サンプルの文章分類を参加端末に依頼できます。Noahが端末への割り当てと結果の検収を行います。</p>
        {planError && <p role="alert">{planError}</p>}
        {!plan && !planError && <output>契約状況を確認中…</output>}
        {plan && <>
          {plan.testMode && terms && <p className={styles.note}>テスト環境です。実際の請求は発生しません。</p>}
          {terms ? <>
            <p><strong className={styles.price}>{priceLabel(terms)}</strong> ／月（税込）</p>
            <p>月{terms.monthlyJobs.toLocaleString('ja-JP')}件まで。無料期間・超過課金はありません。請求元は{terms.merchant}です。</p>
          </> : <p className={styles.note}>現在、新規申込みの受付を準備しています。</p>}
          <p>{planStates[plan.subscription.status]}{plan.subscription.renewalStopped && plan.subscription.status === 'inactive' && ' · 自動更新停止済み'}{plan.subscription.periodEnd && plan.subscription.entitled ? ' · 利用期限 ' + new Date(plan.subscription.periodEnd).toLocaleDateString('ja-JP') : ''}</p>
          {plan.subscription.canCancel && plan.subscription.status !== 'ending' && <button type="button" disabled={busy} className={common.secondary} onClick={() => void run(async signal => {
            await api('/plan', signal, {owner: plan.ownerScope, body: {action: 'cancel'}}); setNotice('契約の更新停止を受け付けました。');
          })}>次回からの自動更新を停止</button>}
          {plan.plan && plan.configured && !plan.subscription.entitled && !plan.subscription.canCancel && <>
            <Consent value={planConsent} change={yes => setAcceptedPlan(yes ? planIntent : '')}>料金と利用枠を確認しました。解約するまで毎月自動更新します。</Consent>
            <button type="button" className={common.secondary} disabled={busy || !planConsent} onClick={checkout}>月額プランの申込みへ</button>
          </>}
        </>}
      </section>
      {!!(actionError || notice) && <div className={styles.feedback}>{actionError ? <p role="alert">{actionError}</p> : <output>{notice}</output>}</div>}
      <section className={styles.section} aria-labelledby="compute-job">
        <h2 id="compute-job">分類を依頼する</h2>
        {queueError && <p role="alert">{queueError}</p>}
        <label className={styles.field}>公開サンプル
          <select value={sample} onChange={event => { setSample(event.target.value); setAcceptedJob(''); }}>{SHARED_SAMPLES.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        </label>
        <Consent value={jobConsent} change={yes => setAcceptedJob(yes ? jobIntent : '')}>このサンプルを他の利用者の参加端末に渡して分類します。</Consent>
        <button className={common.secondary} type="button" disabled={busy || !plan?.subscription.entitled || !board || !jobConsent} onClick={submit}>参加端末に依頼</button>
        {plan && !plan.subscription.entitled && <p className={styles.note}>依頼には有効な月額プランが必要です。</p>}
        {!!board?.jobs.length && <ul className={styles.list} aria-label="自分の依頼">{board.jobs.map(job => <li key={job.id}>
          <strong>{sampleTitle.get(job.sampleId) ?? job.sampleId}</strong><span>{states[job.status]}</span>
          {job.result && <p>分類結果　{categories[job.result.label] ?? job.result.label}（スコア {job.result.score}）</p>}
          {job.receiptId && <small>検収記録　{job.receiptId}</small>}
          {(job.status === 'queued' || job.status === 'leased') && <button className={common.secondary} type="button" disabled={busy} onClick={() => void run(async signal => {
            await api('', signal, {owner: board.ownerScope, body: {action: 'cancel', jobId: job.id}}); setNotice('依頼を取り消しました。');
          })}>依頼を取り消す</button>}
        </li>)}</ul>}
      </section>
      <section className={styles.section} aria-labelledby="compute-host">
        <h2 id="compute-host">自分の端末を提供する</h2>
        <p>参加中は他の利用者の公開サンプルをこの端末で分類します。端末の電力と通信を使い、発熱することがあります。提供者への報酬はありません。</p>
        <p>Android 11以降とLinuxに対応します。電源・温度・回線の条件を確認できる端末で、参加プログラムを開いている間だけ処理します。1回の起動は最大15分、30件、アプリの通信量256 KiBまでです。端末の提供は無料で、いつでも停止できます。提供停止後も月額契約は自動更新の設定に従います。</p>
        <label className={styles.field}>参加する端末
          <select value={platform} onChange={event => { setPlatform(event.target.value === 'linux' ? 'linux' : 'android'); setAcceptedHost(''); }}>
            <option value="android">Android 11以降</option><option value="linux">Linux</option>
          </select>
        </label>
        {platform === 'android' && <p className={styles.note}>参加にはAndroidアプリ「Noah 端末参加」が必要です。現在は開発者向けの試験版です。</p>}
        <Consent value={hostConsent} change={yes => setAcceptedHost(yes ? hostIntent : '')}>他の利用者の処理に、選んだ端末を提供することに同意します。</Consent>
        <button type="button" className={common.secondary} disabled={busy || !board?.acceptingDevices || !hostConsent} onClick={enroll}>端末を登録する</button>
        {board && !board.acceptingDevices && <p className={styles.note}>現在、新しい参加端末の受付を準備しています。</p>}
        {secret && <section className={styles.setup} aria-label="端末の接続手順">
          {secret.platform === 'android' ? <>
            <h3>Androidで参加</h3>
            <p>「Noah 端末参加」を開き、端末IDと下の接続キーを入力します。参加時間を選び、同意して開始してください。画面を離れるか、アプリの停止ボタンを押すと終了します。</p>
            <p>端末ID</p><code>{secret.id}</code>
          </> : <>
          <h3>Linux端末で起動</h3>
          <p>Node.js 22以降を用意し、次の2ファイルを同じフォルダーに保存してください。</p>
          <p><a href="/noah-shared-compute/runner.mjs" download>実行プログラム</a> · <a href="/noah-shared-compute/model.json" download>分類モデル</a></p>
          <code>node runner.mjs --device {secret.id}</code>
          <p>起動後に接続キーを入力します。停止は Ctrl+C でできます。</p>
          </>}
          <p>接続キーは今回だけ表示します。紛失した場合は、この端末の提供を停止して登録し直してください。</p>
          <code>{secret.token}</code>
          <button type="button" className={common.secondary} onClick={() => setSecret(null)}>キーを閉じる</button>
        </section>}
        {!!board?.devices.length && <ul className={styles.list} aria-label="自分の参加端末">{board.devices.map(device => <li key={device.id}>
          <strong>端末 {device.id.slice(0, 8)}</strong><span>{device.active ? '登録済み' : '提供停止済み'} · {device.mode === 'test' ? 'テスト環境' : '実運用環境'}{!device.currentEnvironment && '（現在の接続先とは異なります）'}</span>
          {device.active && <button type="button" className={common.secondary} disabled={busy} onClick={() => revoke(device.id)}>この端末の提供を停止</button>}
        </li>)}</ul>}
      </section>
      <div><button className={common.secondary} type="button" disabled={busy} onClick={() => setRefresh(n => n + 1)}>状況を更新</button></div>
    </div>}
  </main>;
}
