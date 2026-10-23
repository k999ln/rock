'use client';
import EveNewsWorkspace from './eve-news-workspace';
import EveToolWorkspace from './eve-tool-workspace';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import SkyAgentEveProfile,{useSkyAgentProfileRequested} from './sky-agent-eve-profile';
import SkyFreeCloudPanel from './sky-free-cloud-panel';
import type { EveHistoryItem } from '@/lib/eve-history';
import type { EveDeviceJob } from '@/lib/eve-device-sync';
import type {
  EveRuntimeExecution,
  EveRuntimePending,
} from '@/lib/eve-runtime-sync';
import {
  skyEveDevicePath,
  skyEveDeviceState,
  skyEveSelectionMatches,
  skyEveConsentKey,
  skyEveTargetKey,
  skyEveSelectionTargetKey,
  skyEveExecutionTargets,
  isEveRuntimePresence,
  type EveExecutionPresence,
  type EveRuntimePresence,
  type SkyEveSelection,
} from '@/lib/sky-eve-connections';
import styles from './eve-sync-workspace.module.css';
import WorkspaceShell from './workspace-shell';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(path, {
      ...init,
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    const d = (await r.json()) as T & { error?: string };
    if (!r.ok)
      throw Object.assign(new Error(d.error ?? '接続できません。'), {
        status: r.status,
      });
    return d;
  } finally {
    clearTimeout(timer);
  }
}
const label = (s: string) =>
  ({
    active: '実行中',
    review: '下書き・確認待ち',
    completed: '確認済み',
    cancelled: '停止済み',
  })[s] ?? s;
const subscribeNewsSourceRequest=()=>()=>{};
export default function EveSyncWorkspace({
  initialThreadId = '',
  initialSelection = { kind: 'none' },
}: {
  initialThreadId?: string;
  initialSelection?: SkyEveSelection;
}) {
  const profileRequested=useSkyAgentProfileRequested();
  const [cloudHistoryOpen,setCloudHistoryOpen]=useState(false);
  const newsSourceRequested=useSyncExternalStore(subscribeNewsSourceRequest,()=>new URL(window.location.href).searchParams.has('newsSource'),()=>false);
  const [newsWorkExpanded,setNewsWorkOpen]=useState<boolean|null>(null);
  const newsWorkOpen=newsWorkExpanded??newsSourceRequested;
  const toolRequested=useSyncExternalStore(subscribeNewsSourceRequest,()=>new URL(window.location.href).searchParams.get('mode')==='tool-work',()=>false);
  const [toolExpanded,setToolExpanded]=useState<boolean|null>(null);
  const toolOpen=toolExpanded??toolRequested;
  const [pinnedSelection, setPinnedSelection] = useState(initialSelection);
  const [threads, setThreads] = useState<EveHistoryItem[]>([]),
    [selected, setSelected] = useState(initialThreadId),
    [item, setItem] = useState<EveHistoryItem | null>(null),
    [jobs, setJobs] = useState<EveDeviceJob[]>([]),
    [devices, setDevices] = useState<EveExecutionPresence[]>([]);
  const [input, setInput] = useState(''),
    [targetId, setTargetId] = useState(skyEveSelectionTargetKey(initialSelection)),
    [agentId, setAgentId] = useState(
      initialSelection.kind === 'device' || initialSelection.kind === 'runtime'
        ? initialSelection.agentId
        : '',
    ),
    [consentTarget, setConsentTarget] = useState(''),
    [message, setMessage] = useState(''),
    [signedIn, setSignedIn] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(false),
    [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [runtimeJobs, setRuntimeJobs] = useState<EveRuntimeExecution[]>([]),
    [runtimePending, setRuntimePending] = useState<EveRuntimePending[]>([]),
    [runtimeNotice, setRuntimeNotice] = useState('');
  const [stoppingRuntime, setStoppingRuntime] = useState('');
  const account = useRef(''),
    expanded = useRef(false);
  const [connectionOwner, setConnectionOwner] = useState('');
  const [observedAt, setObservedAt] = useState(0);
  const activeThread = useRef(initialThreadId),
    operation = useRef<{ id: string; key: string } | null>(null);
  useEffect(() => {
    let live = true;
    let fetching = false;
    const load = async () => {
      if (fetching || document.hidden || !navigator.onLine) return;
      fetching = true;
      try {
        const runtimeLoad = api<{
          ownerUserId: string;
          devices: EveRuntimePresence[];
          executions: EveRuntimeExecution[];
          pending: EveRuntimePending[];
        }>('/api/eve/runtime').then(
          (data) => ({ data, error: null }),
          (error) => ({
            data: null,
            error: error as Error & { status?: number },
          }),
        );
        const [history, sync, runtime] = await Promise.all([
          api<{
            ownerUserId: string;
            items: EveHistoryItem[];
            cursor: string | null;
          }>('/api/eve/history'),
          api<{
            ownerUserId: string;
            jobs: EveDeviceJob[];
            devices: EveExecutionPresence[];
          }>('/api/eve/device-sync'),
          runtimeLoad,
        ]);
        if (!live) return;
        if (
          runtime.error?.status === 401 ||
          (runtime.data && runtime.data.ownerUserId !== history.ownerUserId) ||
          history.ownerUserId !== sync.ownerUserId
        )
          throw Object.assign(new Error('アカウントを再確認してください。'), {
            status: 401,
          });
        const ownerChanged = Boolean(
          account.current && account.current !== sync.ownerUserId,
        );
        if (ownerChanged) {
          expanded.current = false;
          setTargetId('');
          setAgentId('');
          setPinnedSelection({ kind: 'invalid' });
          activeThread.current = '';
          setSelected('');
          setItem(null);
          setInput('');
          setConsentTarget('');
          operation.current = null;
          try {
            sessionStorage.removeItem('eve-device-request');
          } catch {
            /* the owner-scoped in-memory operation was cleared */
          }
        }
        account.current = sync.ownerUserId;
        setConnectionOwner(sync.ownerUserId);
        setOnline(true);
        setObservedAt(Date.now());
        setThreads((current) =>
          ownerChanged
            ? history.items
            : [
                ...history.items,
                ...current.filter(
                  (t) =>
                    !history.items.some((n) => n.session.id === t.session.id),
                ),
              ],
        );
        if (!expanded.current) setHistoryCursor(history.cursor);
        setJobs(sync.jobs);
        setDevices([...sync.devices, ...(runtime.data?.devices ?? [])]);
        setRuntimeJobs(runtime.data?.executions ?? []);
        setRuntimePending(runtime.data?.pending ?? []);
        setRuntimeNotice(
          runtime.error
            ? '追加した実行先を確認できません。接続を確認してください。'
            : '',
        );
        setSignedIn(true);
        const id = activeThread.current;
        if (id) {
          try {
            const t = await api<EveHistoryItem & { ownerUserId: string }>(
              '/api/eve/history?id=' + encodeURIComponent(id),
            );
            if (t.ownerUserId !== sync.ownerUserId)
              throw Object.assign(
                new Error('アカウントを再確認してください。'),
                { status: 401 },
              );
            if (live && activeThread.current === id) {
              setItem((old) =>
                old?.session.id === id
                  ? {
                      ...t,
                      before:
                        old.session.messages.length > t.session.messages.length
                          ? old.before
                          : t.before,
                      session: {
                        ...t.session,
                        messages: [
                          ...old.session.messages.filter(
                            (m) =>
                              !t.session.messages.some((n) => n.id === m.id),
                          ),
                          ...t.session.messages,
                        ],
                      },
                    }
                  : t,
              );
            }
          } catch (e) {
            if ((e as { status?: number }).status !== 404) throw e;
          }
        }
      } catch (e) {
        if (live) {
          setOnline(false);
          if ((e as { status?: number }).status === 401) {
            setSignedIn(false);
            setThreads([]);
            setJobs([]);
            setRuntimeJobs([]);
            setRuntimePending([]);
            setDevices([]);
            setItem(null);
          } else
            setMessage(e instanceof Error ? e.message : '同期できません。');
        }
      } finally {
        fetching = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 4000);
    const clock = setInterval(() => setObservedAt(Date.now()), 1000);
    const offline = () => setOnline(false);
    const resume = () => {
      setObservedAt(Date.now());
      void load();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    return () => {
      live = false;
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
    };
  }, []);
  const executionTargets = skyEveExecutionTargets(devices, targetId);
  const device = executionTargets.find(
      (d) => skyEveTargetKey(d) === (targetId || (executionTargets[0] ? skyEveTargetKey(executionTargets[0]) : '')),
    ),
    agent = device?.agents.find(
      (a) => a.id === (agentId || device.agents[0]?.id),
    );
  const baseModel = agent
    ? device?.models.find((model) => model.id === agent.modelId)
    : undefined;
  const selectionMatches = skyEveSelectionMatches(
    pinnedSelection,
    device,
    agent?.id,
  );
  const connectionState =
    device && agent ? skyEveDeviceState(device, agent.id, observedAt) : null;
  const ready = Boolean(
    online &&
    observedAt > 0 &&
    selectionMatches &&
    baseModel &&
    connectionState?.available,
  );
  const targetKey = skyEveConsentKey(connectionOwner, device, agent?.id);
  const consent = Boolean(targetKey && consentTarget === targetKey);
  const setConsent = (checked: boolean) =>
    setConsentTarget(checked ? targetKey : '');
  function conversationPath(thread: string) {
    return device && agent && baseModel
      ? skyEveDevicePath(
          {
            deviceId: device.deviceId,
            agentId: agent.id,
            agentSha256: agent.sha256,
            modelSha256: baseModel.sha256,
            ...(isEveRuntimePresence(device) && 'scheme' in baseModel
              ? { modelScheme: baseModel.scheme }
              : {}),
          },
          thread,
        )
      : '/os/eve?thread=' + encodeURIComponent(thread);
  }
  function choose(id: string) {
    const owner = account.current;
    activeThread.current = id;
    setSelected(id);
    setItem(null);
    setInput('');
    setConsent(false);
    operation.current = null;
    history.replaceState(null, '', conversationPath(id));
    void api<EveHistoryItem & { ownerUserId: string }>(
      '/api/eve/history?id=' + id,
    )
      .then((t) => {
        if (
          activeThread.current === id &&
          account.current === owner &&
          t.ownerUserId === owner
        ) {
          setItem(t);
        }
      })
      .catch(() => {});
  }
  function fresh() {
    choose(crypto.randomUUID());
  }
  async function stopRuntime(p: EveRuntimePending) {
    if (!p.canStop || stoppingRuntime) return;
    const owner = account.current;
    setStoppingRuntime(p.id);
    try {
      const r = await api<{ state: string; stopConfirmed: boolean }>('/api/eve/runtime', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', request: { id: p.id, confirm: 'stop-owner-local-text' } }),
      });
      if (account.current !== owner) return;
      setMessage(r.state === 'result-retained' ? 'すでに保存された成果を保持しました。' : r.stopConfirmed ? '停止を確認しました。依頼と保存済みの成果は残ります。' : '停止要求を保存しました。端末の実停止を確認しています。');
    } catch {
      if (account.current === owner) setMessage('停止結果を確認できません。同じ仕事を読み直してください。停止済みとは扱いません。');
    } finally { setStoppingRuntime(''); }
  }
  function runtimeStopControl(p?: EveRuntimePending) {
    if (!p) return null;
    const text = {
      'cancelled-before-start': '開始前に取り消しました。',
      'stop-requested': '停止要求を保存済み・実停止を確認中です。',
      'stop-confirmed': '端末が実停止を確認しました。',
      'stop-finished': '停止前に実行が終了しています。保存済みの成果は保持します。',
      'stop-unknown': '実停止は未確認です。接続が戻ると同じ仕事で照合します。',
      pending: '', received: '',
    }[p.state];
    return <div>{text && <output>{text}</output>}{p.canStop && <button disabled={Boolean(stoppingRuntime)} onClick={() => void stopRuntime(p)}>{stoppingRuntime === p.id ? '停止要求を送信中…' : p.state === 'pending' ? '開始前に取り消す' : 'この仕事を停止する'}</button>}</div>;
  }
  async function send() {
    if (
      !ready ||
      !device ||
      !agent ||
      !baseModel ||
      !consent ||
      !input.trim() ||
      busy
    )
      return;
    setBusy(true);
    setMessage('');
    const submittingOwner = account.current;
    try {
      let thread = selected;
      if (!thread) {
        thread = crypto.randomUUID();
        activeThread.current = thread;
        setSelected(thread);
        history.replaceState(null, '', conversationPath(thread));
      }
      const text = input.trim();
      const bytes = new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(
            JSON.stringify({
              owner: account.current,
              thread,
              device: device.deviceId,
              agent: agent.id,
              agentSha256: agent.sha256,
              modelSha256: baseModel.sha256,
              target: targetKey,
              text,
            }),
          ),
        ),
      );
      const key = Array.from(bytes, (x) =>
        x.toString(16).padStart(2, '0'),
      ).join('');
      if (!operation.current) {
        try {
          operation.current = JSON.parse(
            sessionStorage.getItem('eve-device-request') ?? 'null',
          );
        } catch {
          /* no saved operation */
        }
      }
      if (operation.current?.key !== key) {
        operation.current = { key, id: crypto.randomUUID() };
        sessionStorage.setItem(
          'eve-device-request',
          JSON.stringify(operation.current),
        );
      }
      const common = {
        id: operation.current.id,
        threadId: thread,
        deviceId: device.deviceId,
        agentId: agent.id,
        agentSha256: agent.sha256,
        modelSha256: baseModel.sha256,
        input: text,
      };
      const runtime = isEveRuntimePresence(device);
      if (runtime && !('scheme' in baseModel))
        throw new Error('モデルの版を選び直してください。');
      await api(runtime ? '/api/eve/runtime' : '/api/eve/device-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          runtime
            ? {
                ...common,
                modelScheme: 'scheme' in baseModel ? baseModel.scheme : null,
                maxOutputTokens: 256,
                confirm: 'run-owner-local-text',
              }
            : { ...common, confirm: 'run-on-pixel' },
        ),
      });
      if (account.current !== submittingOwner) return;
      setMessage(
        '依頼を保存しました。選んだ実行先が受領し、同じ会話へ成果を返します。',
      );
      setInput('');
      setConsent(false);
      operation.current = null;
      try {
        sessionStorage.removeItem('eve-device-request');
      } catch {
        /* saved request is already acknowledged */
      }
    } catch (e) {
      if (account.current === submittingOwner)
        setMessage(
          e instanceof Error
            ? e.message
            : '送信結果が不明です。同じ依頼IDで照合してください。',
        );
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!item?.before) return;
    const owner = account.current,
      id = selected;
    try {
      const t = await api<EveHistoryItem & { ownerUserId: string }>(
        `/api/eve/history?id=${selected}&before=${item.before}`,
      );
      if (
        account.current !== owner ||
        activeThread.current !== id ||
        t.ownerUserId !== owner
      )
        return;
      setItem({
        ...item,
        before: t.before,
        session: {
          ...item.session,
          messages: [...t.session.messages, ...item.session.messages],
        },
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '履歴を読めません。');
    }
  }
  async function moreThreads() {
    if (!historyCursor) return;
    const owner = account.current;
    try {
      const p = await api<{
        ownerUserId: string;
        items: EveHistoryItem[];
        cursor: string | null;
      }>('/api/eve/history?cursor=' + encodeURIComponent(historyCursor));
      if (account.current !== owner || p.ownerUserId !== owner) return;
      expanded.current = true;
      setThreads((current) => [
        ...current,
        ...p.items.filter(
          (t) => !current.some((n) => n.session.id === t.session.id),
        ),
      ]);
      setHistoryCursor(p.cursor);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '履歴を読めません。');
    }
  }
  function save(j: EveDeviceJob) {
    if (!j.exportText) return;
    const u = URL.createObjectURL(
      new Blob([j.exportText], { type: 'text/plain;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = u;
    a.download = `Eve-${j.run.job.id}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function saveRuntime(j: EveRuntimeExecution) {
    if (!j.report.text) return;
    const text = `# ${j.request.agent.name}\n\n下書きです。内容を確認してください。\n\n${j.report.text}\n\n基盤モデル: ${j.request.model.id}\n仕事ID: ${j.id}\n成果SHA256: ${j.report.outputSha256}\nクラウド使用料: 0円（本人の実行先で推論）\n${j.usage.resources}\n${j.usage.subscription}\n`;
    const u = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = u;
    a.download = `Eve-${j.id}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  return (
    <WorkspaceShell title="Eve" hideTopActions contentClassName="eve-sync-main">
      <div className={styles.app}>
        <aside className={styles.sidebar}>
          <Link href="/os" className={styles.brand}>
            RockstarOS
          </Link>
          <h1>Eve</h1>
          <p>いつでも、同じ続きから。</p>
          <button onClick={fresh}>＋ 新しい会話</button>
          <nav aria-label="Eveの会話">
            {threads.map((t) => (
              <button
                className={selected === t.session.id ? styles.current : ''}
                key={t.session.id}
                onClick={() => choose(t.session.id)}
              >
                {t.session.messages[0]?.text.slice(0, 55) || '保存した会話'}
              </button>
            ))}
            {historyCursor && (
              <button onClick={() => void moreThreads()}>
                以前の会話を読む
              </button>
            )}
          </nav>
          <Link href="/connect/device">端末を接続・解除</Link>
          <Link href="/os/eve?mode=tool-work">smisのToolを使う</Link>
          <Link href="/#sky-manage">担当とLLMを管理</Link>
          <Link href="/#sky">能力を追加</Link>
        </aside>
        <section className={styles.desk}>
          {signedIn===true && connectionOwner && <details open={toolOpen} onToggle={event=>setToolExpanded(event.currentTarget.open)}><summary>smisのToolで仕事を進める</summary>{toolOpen&&<EveToolWorkspace key={connectionOwner} threadId={selected} onThread={choose}/>}</details>}
          {signedIn===true && connectionOwner && <details open={newsWorkOpen} onToggle={event=>setNewsWorkOpen(event.currentTarget.open)}><summary>ニュースの草稿と資料を確認</summary>{newsWorkOpen&&<EveNewsWorkspace key={`${connectionOwner}:${selected}`} threadId={selected} onThread={choose}/>}</details>}
          {signedIn===true && connectionOwner && <SkyAgentEveProfile key={connectionOwner}/>}
          {signedIn===true && connectionOwner && !profileRequested && <details onToggle={event=>setCloudHistoryOpen(event.currentTarget.open)}><summary>Cloudの依頼・成果を開く</summary>{cloudHistoryOpen&&<SkyFreeCloudPanel key={connectionOwner}/>}</details>}
          <header>
            <div>
              <span className={styles.eyebrow}>YOUR CONTINUOUS WORKSPACE</span>
              <h2>
                {selected ? '会話の続きを、ここから。' : '何を進めますか？'}
              </h2>
            </div>
            <span className={styles.connection}>
              {signedIn
                ? 'アカウントの履歴'
                : signedIn === false
                  ? 'サインイン待ち'
                  : '接続を確認中'}
            </span>
          </header>
          {signedIn === false ? (
            <div className={styles.welcome}>
              <h3>Pixelでも、Webでも、同じEve。</h3>
              <p>
                会話・選んだ仕事・成果をアカウントへ保存します。サインインした後、接続する端末に表示されたコードを承認してください。
              </p>
              <Link
                className={styles.primary}
                prefetch={false}
                href="/account?returnTo=%2Fos%2Feve"
                target="_top"
              >
                サインインして始める
              </Link>
            </div>
          ) : (
            <>
              <div className={styles.messages} aria-live="polite">
                {item?.before && (
                  <button onClick={() => void more()}>以前の発言を読む</button>
                )}
                {item?.session.messages.map((m) => (
                  <article
                    key={m.id}
                    className={m.side === 'me' ? styles.me : styles.reply}
                  >
                    <span>{m.side === 'me' ? 'あなた' : 'Eve'}</span>
                    <p>{m.text}</p>
                  </article>
                ))}
                {!item && (
                  <div className={styles.welcome}>
                    <h3>画面を変えても、同じ続きから。</h3>
                    <p>
                      左の履歴を開くか、依頼を書いて始めます。接続した実行先から、同じ会話へ成果が届きます。画面を閉じた後の継続は実行先の状態によります。
                    </p>
                  </div>
                )}
              </div>
              <div className={styles.results}>
                {jobs
                  .filter((j) => !selected || j.threadId === selected)
                  .map((j) => (
                    <article key={j.run.job.id}>
                      <div>
                        <strong>{j.run.agent.name}</strong>
                        <span>{label(j.run.job.status)}</span>
                      </div>
                      <p>{j.run.input}</p>
                      <small>
                        Pixel内Linux · {j.run.modelName ?? j.run.agent.modelId}{' '}
                        · クラウド使用料0円
                      </small>
                      <small>
                        端末からの報告 ·{' '}
                        {new Date(j.updatedAt).toLocaleString()}
                      </small>
                      {j.exportText && (
                        <button onClick={() => save(j)}>
                          成果を文章で保存
                        </button>
                      )}
                      <button onClick={() => choose(j.threadId)}>
                        この会話を開く
                      </button>
                    </article>
                  ))}
              </div>
              <div className={styles.results}>
                {runtimeJobs
                  .filter((j) => !selected || j.threadId === selected)
                  .map((j) => (
                    <article key={j.id}>
                      <div>
                        <strong>{j.request.agent.name}</strong>
                        <span>
                          {j.report.state === 'review'
                            ? '下書き・確認待ち'
                            : '結果不明・照合待ち'}
                        </span>
                      </div>
                      <p>{j.input}</p>
                      <small>
                        {devices.find((d) => d.deviceId === j.deviceId)?.name ??
                          '接続した実行先'}{' '}
                        · {j.request.model.id} · クラウド使用料0円
                      </small>
                      <small>
                        端末からの報告 ·{' '}
                        {new Date(j.updatedAt).toLocaleString()}
                      </small>
                      <details>
                        <summary>仕事とモデルの版</summary>
                        <small>仕事ID: {j.id}</small>
                        <small>
                          {j.request.model.scheme}: {j.request.model.sha256}
                        </small>
                        <small>成果: {j.report.outputSha256 ?? '未確定'}</small>
                        <small>
                          {j.usage.resources} {j.usage.subscription}
                        </small>
                      </details>
                      {runtimeStopControl(runtimePending.find(p => p.id === j.id))}
                      {j.report.text && (
                        <button onClick={() => saveRuntime(j)}>
                          成果を文章で保存
                        </button>
                      )}
                      <button onClick={() => choose(j.threadId)}>
                        この会話を開く
                      </button>
                    </article>
                  ))}
                {runtimePending
                  .filter(
                    (p) =>
                      (!selected || p.threadId === selected) &&
                      !runtimeJobs.some((j) => j.id === p.id),
                  )
                  .map((p) => (
                    <article key={p.id}>
                      <div>
                        <strong>{p.agentName}</strong>
                        <span>
                          {!['pending', 'received'].includes(p.state) ? '停止の照合' : observedAt >= p.expiresAt
                            ? p.state === 'pending'
                              ? '受付期限切れ'
                              : '結果不明・照合待ち'
                            : p.state === 'pending'
                              ? '端末の受領待ち'
                              : '端末が受領・結果待ち'}
                        </span>
                      </div>
                      <p>{p.input}</p>
                      {runtimeStopControl(p)}
                      <small>仕事ID: {p.id}</small>
                      <small>
                        保存した依頼です。受領だけでは実行完了になりません。
                      </small>
                      <button onClick={() => choose(p.threadId)}>
                        この会話を開く
                      </button>
                    </article>
                  ))}
              </div>
              {runtimeNotice && (
                <output className={styles.notice}>{runtimeNotice}</output>
              )}
              <section hidden={profileRequested} className={styles.composer} aria-label="Eveへ依頼">
                <div className={styles.modelIdentity} aria-label="使用するLLM">
                  <div>
                    <span>使用するLLM</span>
                    <strong>Eve</strong>
                    <small>現在は既存モデルを基盤に動作</small>
                  </div>
                  <dl>
                    <dt>基盤モデル</dt>
                    <dd>
                      {baseModel?.name ??
                        agent?.modelId ??
                        '端末と担当を選ぶと表示されます'}
                    </dd>
                  </dl>
                  <details>
                    <summary>Eveと担当・基盤モデルについて</summary>
                    <p>
                      Eveは使うLLMの製品名です。担当はEveに任せる仕事の役割、基盤モデルは現在の応答を作るモデル、実行先は処理する端末です。Eve専用の学習重みはまだ作成していません。
                    </p>
                  </details>
                </div>
                <div className={styles.choices}>
                  <label>
                    実行先
                    <select
                      disabled={busy}
                      value={device ? skyEveTargetKey(device) : ''}
                      onChange={(e) => {
                        setTargetId(e.target.value);
                        setAgentId('');
                        setPinnedSelection({ kind: 'none' });
                        setConsent(false);
                      }}
                    >
                      {!device && (
                        <option value="">
                          {devices.length
                            ? '実行先を選び直してください'
                            : '実行先を接続してください'}
                        </option>
                      )}
                      {executionTargets.map((d) => (
                        <option key={skyEveTargetKey(d)} value={skyEveTargetKey(d)}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    担当
                    <select
                      disabled={busy}
                      value={agent?.id ?? ''}
                      onChange={(e) => {
                        setAgentId(e.target.value);
                        setPinnedSelection({ kind: 'none' });
                        setConsent(false);
                      }}
                    >
                      {!agent && <option value="">担当を選んでください</option>}
                      {device?.agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <textarea
                  disabled={busy}
                  aria-label="続きの依頼"
                  placeholder="続きに何を作りますか？"
                  value={input}
                  maxLength={2000}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setConsent(false);
                  }}
                  rows={3}
                />
                <label className={styles.consent}>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  この会話の一部と依頼を「{device?.name ?? '選んだ実行先'}
                  」へ渡し、本人のモデルで下書きを作る。クラウド使用料0円。
                  {device && isEveRuntimePresence(device)
                    ? '出力上限256トークン。'
                    : ''}
                </label>
                <footer>
                  <span>
                    {signedIn === null ? 'アカウントと実行先を確認しています…' : !selectionMatches
                      ? 'smisで選んだ担当かAIが変わったか、接続が解除されています。内容を確認して選び直してください。'
                      : ready
                        ? '選んだ実行先は接続・準備済みです'
                        : (connectionState?.label ??
                          '接続した実行先で、使う担当のモデルを準備してください。')}
                  </span>
                  {signedIn === true && !selectionMatches && (
                    <Link href="/sky/devices">smisで接続した担当を選び直す</Link>
                  )}
                  <button
                    className={styles.primary}
                    disabled={!ready || !consent || !input.trim() || busy}
                    onClick={() => void send()}
                  >
                    {busy ? '依頼を保存中…' : '選んだ実行先で下書きを作る'}
                  </button>
                </footer>
              </section>
            </>
          )}
          {message && <output className={styles.notice}>{message}</output>}
        </section>
      </div>
    </WorkspaceShell>
  );
}
