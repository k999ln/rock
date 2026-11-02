'use client';
import {runtimeEveTextExport} from '@/lib/eve-runtime-export';
import EveRuntimeInteraction from './eve-runtime-interaction';
import EveRuntimeArchive from './eve-runtime-archive';
import EveAgentComposer from './eve-agent-composer';
import {eveAgentConversationPath} from '@/lib/eve-studio-navigation';
import {newsSourceNavigation} from '@/lib/eve-noah-navigation';
import {runtimeEvePendingKey,runtimeEveRestorableWork} from '@/lib/eve-runtime-work-port';
import {purposeEvePendingKey} from '@/lib/eve-purpose-runtime-work-port';
import Workbench from './workbench';
import EveNewsWorkspace from './eve-news-workspace';
import EveToolWorkspace from './eve-tool-workspace';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import SkyAgentEveProfile,{useSkyAgentProfileRequested,useSkyAgentProfileKey,type SkyAgentProfileSelection} from './sky-agent-eve-profile';
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
import {guardHistoryNavigation} from '@/lib/history-navigation-guard';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {useSearchParams} from 'next/navigation';
import SkyAgentLibrary from './sky-agent-library';
import {Bot, PanelLeft, Send, CheckCircle2} from 'lucide-react';

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
  } catch (error) {
    if (controller.signal.aborted) throw new Error('接続の確認に時間がかかっています。しばらくしてから確認してください。');
    throw error;
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
const subscribeWorkspaceView=(changed:()=>void)=>{window.addEventListener('hashchange',changed);window.addEventListener('popstate',changed);return()=>{window.removeEventListener('hashchange',changed);window.removeEventListener('popstate',changed);};};
export default function EveSyncWorkspace({
  initialThreadId = '',
  initialSelection = { kind: 'none' },
}: {
  initialThreadId?: string;
  initialSelection?: SkyEveSelection;
}) {
  const workspaceHash=useSyncExternalStore(subscribeWorkspaceView,()=>window.location.hash,()=>'');
  const resultsView=workspaceHash==='#eve-work-results';
  const composeRequested=['#eve-compose','#eve-cloud-results','#eve-tool-results','#eve-news-work'].includes(workspaceHash);
  const profileRequested=useSkyAgentProfileRequested();
  const profileKey=useSkyAgentProfileKey();
  const [toolAgentSelection,setToolAgentSelection]=useState<SkyAgentProfileSelection|null>(null);
  const search=useSearchParams();
  const workbenchQuery=search.toString();
  const [modeOverride,setModeOverrideValue]=useState<{query:string;mode:'work'|'build'}|null>(null);
  const setModeOverride=(mode:'work'|'build')=>setModeOverrideValue({query:workbenchQuery,mode});
  const workbenchMode=resultsView||composeRequested?'work':(modeOverride?.query===workbenchQuery?modeOverride.mode:null)??(search.get('view')==='build'?'build':'work');
  useEffect(()=>{if(resultsView){const frame=requestAnimationFrame(()=>document.getElementById('eve-work-results')?.scrollIntoView({block:'start'}));return()=>cancelAnimationFrame(frame);}},[resultsView,workbenchQuery]);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [buildVisited,setBuildVisited]=useState(search.get('view')==='build');
  useEffect(()=>{if(workbenchMode!=='build'||buildVisited)return;const frame=requestAnimationFrame(()=>setBuildVisited(true));return()=>cancelAnimationFrame(frame);},[workbenchMode,buildVisited]);
  const [cloudExpanded,setCloudHistoryOpen]=useState<boolean|null>(null);
  const cloudHistoryOpen=cloudExpanded??workspaceHash==='#eve-cloud-results';
  const [agentWorkOpen,setAgentWorkOpen]=useState(false);
  const newsSourceRequested=search.has('newsSource');
  const incomingNews=newsSourceNavigation(workbenchQuery);
  const [newsWorkExpanded,setNewsWorkOpen]=useState<boolean|null>(null);
  const newsWorkOpen=newsWorkExpanded??newsSourceRequested;
  const toolRequested=search.get('mode')==='tool-work'||workspaceHash==='#eve-tool-results';
  const [toolExpanded,setToolExpanded]=useState<boolean|null>(null);
  const toolOpen=toolExpanded??toolRequested;
  const [pinnedSelection, setPinnedSelection] = useState(initialSelection);
  const [threads, setThreads] = useState<EveHistoryItem[]>([]),
    [selected, setSelected] = useState(initialThreadId),
    [item, setItem] = useState<EveHistoryItem | null>(null),
    [jobs, setJobs] = useState<EveDeviceJob[]>([]),
    [devices, setDevices] = useState<EveExecutionPresence[]>([]);
  const [unavailableConversation, setUnavailableConversation] = useState('');
  const conversationRef = useRef<HTMLDivElement>(null);
  const conversationId = item?.session.id;
  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation && conversationId) conversation.scrollTop = conversation.scrollHeight;
  }, [selected, conversationId]);
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
  const [leaveTarget,setLeaveTarget]=useState<{href?:string;resume?:()=>void}|null>(null);
  const discardingDraft=useRef(false);
  const hasUnsentDraft=Boolean(input.trim());
  useEffect(()=>{
    if(!hasUnsentDraft)return;
    const warn=(event:BeforeUnloadEvent)=>{if(!discardingDraft.current)event.preventDefault();};
    const release=guardHistoryNavigation(window,resume=>{if(discardingDraft.current)return false;setLeaveTarget({resume});return true;});
    window.addEventListener('beforeunload',warn);
    return()=>{release();window.removeEventListener('beforeunload',warn);};
  },[hasUnsentDraft]);
  const [connectionOwner, setConnectionOwner] = useState('');
  const toolAgent=toolAgentSelection?.ownerUserId===connectionOwner&&toolAgentSelection.key===profileKey?toolAgentSelection.agent:undefined;
  const [observedAt, setObservedAt] = useState(0);
  const focusedDestination=useRef('');
  useEffect(()=>{
    const target=workspaceHash==='#eve-cloud-results'&&cloudHistoryOpen?'eve-cloud-results':workspaceHash==='#eve-tool-results'&&toolOpen?'eve-tool-results':workspaceHash==='#eve-news-work'&&newsWorkOpen?'eve-news-work':newsSourceRequested&&!resultsView&&workbenchMode==='work'?'eve-news-handoff':'';
    const key=target+':'+workbenchQuery;
    if(!target){focusedDestination.current='';return;}
    if(focusedDestination.current===key||target!=='eve-news-handoff'&&signedIn!==true)return;
    const frame=requestAnimationFrame(()=>{const element=document.getElementById(target);if(element){element.scrollIntoView({block:'start'});element.focus({preventScroll:true});focusedDestination.current=key;}});
    return()=>cancelAnimationFrame(frame);
  },[workspaceHash,workbenchQuery,newsSourceRequested,resultsView,workbenchMode,signedIn,cloudHistoryOpen,toolOpen,newsWorkOpen]);
  function openWorkSection(section:'cloud'|'tool'|'news') {
    if(section==='cloud')setCloudHistoryOpen(true);
    if(section==='tool')setToolExpanded(true);
    if(section==='news')setNewsWorkOpen(true);
    setHistoryOpen(false);setModeOverride('work');focusedDestination.current='';
    const hash=section==='news'?'#eve-news-work':`#eve-${section}-results`;
    if(window.location.hash!==hash)window.history.pushState(window.history.state,'',hash);
    window.dispatchEvent(new Event('hashchange'));
  }
  const activeThread = useRef(initialThreadId),
    operation = useRef<{ id: string; key: string } | null>(null);
  useEffect(() => {
    let live = true;
    let fetching = false;
    const load = async () => {
      if (fetching || document.hidden || !navigator.onLine) return;
      fetching = true;
      try {
        const runtimeThread = activeThread.current;
        const runtimeLoad = api<{
          ownerUserId: string;
          devices: EveRuntimePresence[];
          executions: EveRuntimeExecution[];
          pending: EveRuntimePending[];
          recovery?: {state:'paused'};
        }>('/api/eve/runtime' + (runtimeThread ? '?threadId=' + encodeURIComponent(runtimeThread) : '')).then(
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
        // A response for the previously selected conversation must not replace
        // this conversation's saved jobs. The next poll reads its own thread.
        if (activeThread.current === runtimeThread) {
          setRuntimeJobs(runtime.data?.executions ?? []);
          setRuntimePending(runtime.data?.pending ?? []);
        } else {
          setRuntimeJobs([]);
          setRuntimePending([]);
        }
        setRuntimeNotice(
          runtime.data?.recovery?.state==='paused' ? '端末実行は保存復旧の照合中です。配送と停止確認を保留しています。' : runtime.error
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
              setUnavailableConversation('');
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
            if (live && activeThread.current === id) setUnavailableConversation(id);
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
  const runtimeBinding: Parameters<typeof runtimeEvePendingKey>[0] | null = connectionOwner && selected && device && isEveRuntimePresence(device) && agent && baseModel && 'scheme' in baseModel && (baseModel.scheme === 'gguf-sha256' || baseModel.scheme === 'ollama-manifest-sha256')
    ? {owner: connectionOwner, threadId: selected, deviceId: device.deviceId, agentId: agent.id, agentSha256: agent.sha256, modelSha256: baseModel.sha256, modelScheme: baseModel.scheme}
    : null;
  const creationDevice=device&&isEveRuntimePresence(device)?device:null;
  const creationModel=creationDevice?.models.find(m=>m.scheme==='gguf-sha256'&&(agent?m.id===agent.modelId:creationDevice.preparedModels.includes(m.id)));
  const creationBinding: Parameters<typeof purposeEvePendingKey>[0]|null=connectionOwner&&selected&&creationDevice&&creationModel
    ?{owner:connectionOwner,threadId:selected,deviceId:creationDevice.deviceId,modelId:creationModel.id,modelSha256:creationModel.sha256,modelScheme:'gguf-sha256'}:null;
  const supportsPurpose=creationDevice?.host.capabilities['agent.prepare']===true;
  const creationReady=Boolean(creationBinding&&supportsPurpose&&online&&observedAt>0&&selectionMatches&&creationDevice?.phase==='ready'&&creationDevice.preparedModels.includes(creationBinding.modelId));
  const runtimeCurrent = useCallback(() => account.current === connectionOwner && activeThread.current === selected, [connectionOwner, selected]);
  const targetKey = skyEveConsentKey(connectionOwner, device, agent?.id);
  const consent = Boolean(targetKey && consentTarget === targetKey);
  const setConsent = (checked: boolean) =>
    setConsentTarget(checked ? targetKey : '');
  function conversationPath(thread: string) {
    if(profileRequested)return eveAgentConversationPath(search.toString(),thread,'work');
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
    setModeOverride('work');
    setHistoryOpen(false);
    const owner = account.current;
    activeThread.current = id;
    setRuntimeJobs([]);
    setRuntimePending([]);
    setSelected(id);
    setItem(null);
    setInput('');
    setConsent(false);
    operation.current = null;
    history.replaceState(null, '', conversationPath(id));
    window.dispatchEvent(new Event('hashchange'));
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
  function agentConversation() {
    const query=window.location.search,id=crypto.randomUUID();
    const mode=workbenchMode;
    choose(id);
    history.replaceState(null,'',eveAgentConversationPath(query,id,mode));
    setModeOverride(mode);
  }
  const composerProps={owner:connectionOwner,threadId:selected,observedAt,devices:devices.filter(isEveRuntimePresence),api,current:runtimeCurrent,onConversation:agentConversation};
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
  async function saveRuntime(j: EveRuntimeExecution) {
    const owner = account.current;
    if (!owner || owner !== connectionOwner) return;
    try {
      const value = await api<{ownerUserId:string;execution:EveRuntimeExecution|null}>('/api/eve/runtime?requestId='+encodeURIComponent(j.id), {headers:{'x-sky-owner':owner}});
      if (account.current !== owner || value.ownerUserId !== owner || !value.execution) throw Error('本人と保存済みの成果を確認してください。');
      const file = await runtimeEveTextExport(value.execution,j);
      if (account.current !== owner) return;
      const u = URL.createObjectURL(new Blob([file.text], {type:'text/plain;charset=utf-8'}));
      const a = document.createElement('a');
      a.href = u;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u),1000);
    } catch (error) {
      if (account.current === owner) setMessage(error instanceof Error ? error.message : '成果を保存できません。');
    }
  }
  return (
    <WorkspaceShell title="Eve" hideTopActions hideAccountAccess hideFlowNavigation running={busy} contentClassName="eve-sync-main" onClickCapture={event=>{
      if(busy||!hasUnsentDraft||discardingDraft.current||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
      const link=(event.target as Element).closest('a[href]');
      if(!link||link.getAttribute('target')==='_blank'||link.hasAttribute('download'))return;
      const target=new URL(link.getAttribute('href')!,window.location.href);
      if(target.pathname===window.location.pathname&&target.search===window.location.search&&target.origin===window.location.origin)return;
      event.preventDefault();setLeaveTarget({href:target.href});
    }}>
      <div className={styles.app}>
        <aside id="eve-menu" className={styles.sidebar} data-open={historyOpen || undefined}>
          <button className={styles.historyClose} type="button" onClick={()=>setHistoryOpen(false)}>メニューを閉じる</button>
          <Link href="/os" className={styles.brand}>
            RockstarOS
          </Link>
          <h2>Eve</h2>
          <button disabled={busy} onClick={()=>{if(hasUnsentDraft&&!discardingDraft.current)setLeaveTarget({resume:fresh});else fresh();}}>＋ 新しい会話</button>
          <div className={styles.sidebarLinks} aria-label="Eveのメニュー">
            <Link href="/os/eve?mode=tools">NoahのToolを使う</Link>
            <Link href="/#sky">Noahで探して追加</Link>
            <Link href="#eve-work-results" onClick={()=>setHistoryOpen(false)}>仕事と成果</Link>
            <details><summary>設定・管理</summary>
              <Link href="/connect/device">端末を接続・解除</Link>
              <Link href="/settings">設定</Link>
              <Link href="/#sky-manage">担当とLLMを管理</Link>
              <Link href="/#sky">能力を追加</Link>
            </details>
          </div>
          <p>会話の履歴</p>
          <nav aria-label="Eveの会話">
            {threads.map((t) => (
              <button
                className={selected === t.session.id ? styles.current : ''}
                key={t.session.id}
                title={t.session.messages[0]?.text || '保存した会話'}
                aria-current={selected === t.session.id ? 'page' : undefined}
                disabled={busy}
                onClick={() => {if(hasUnsentDraft&&!discardingDraft.current)setLeaveTarget({resume:()=>choose(t.session.id)});else choose(t.session.id);}}
              >
                <span className={styles.historyTitle}>{t.session.messages[0]?.text.slice(0, 55) || '保存した会話'}</span>
              </button>
            ))}
            {historyCursor && (
              <button onClick={() => void moreThreads()}>
                以前の会話を読む
              </button>
            )}
          </nav>
        </aside>
        <section className={styles.desk}>
          <div className={styles.studioHeader}>
            <div><h1>{resultsView?'仕事と成果':workbenchMode==='build'?'担当を作る':'Eve'}</h1></div>
            <div className={styles.headerActions}>
              <button className={styles.historyToggle} aria-controls="eve-menu" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(v=>!v)}><PanelLeft size={18}/>メニュー</button>
              {workbenchMode==='build'?<button type="button" onClick={()=>{setModeOverride('work');window.location.hash='eve-compose';}}>依頼に戻る</button>:<button type="button" onClick={()=>{if(resultsView||composeRequested){window.history.replaceState(null,'',window.location.pathname+window.location.search);window.dispatchEvent(new Event('hashchange'));}setBuildVisited(true);setModeOverride('build');}}>担当を作る</button>}
            </div>
          </div>

          <nav className={styles.quickNavigation} aria-label="Eveの主な操作"><Link href="#eve-work-results">仕事と成果</Link><Link href="/os/eve?mode=tools">Toolを使う</Link><Link href="/#sky">Noahで探す</Link></nav>
          {(resultsView||workbenchMode==='build')&&!online&&message&&<div className={styles.notice} role="alert"><p>接続を確認できません。入力中の依頼はこの画面に保持しています。</p><button type="button" onClick={()=>window.dispatchEvent(new Event('online'))}>接続を再確認</button><Link href="/connect/service">接続の設定を開く</Link></div>}
          <div hidden={workbenchMode!=='build'} className={styles.buildPane}>{(buildVisited||workbenchMode==='build')&&<><EveAgentComposer {...composerProps}/><details><summary>設定を編集して作る・保存済みの担当を管理する</summary><SkyAgentLibrary key={connectionOwner||'account-pending'} embedded creator/></details></>}</div>
          <div hidden={workbenchMode!=='work'} className={styles.workContent}>
          <div hidden={resultsView} id="eve-compose" className={styles.composeView}>
          {incomingNews&&<section id="eve-news-handoff" tabIndex={-1} className={styles.handoffNotice} aria-label="Noahから受け取った記事"><h2>Noahの記事を受け取りました</h2><p>{incomingNews.title}</p><p>この記事を資料メモに使えます。本文・利用権は次の画面で確認してください。</p><nav><button type="button" onClick={()=>openWorkSection('news')}>資料メモへ進む</button><a href={incomingNews.href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">原文を開く</a><Link href="/#timeline">Noahのニュースへ戻る</Link></nav></section>}
{signedIn !== false && <div ref={conversationRef} className={styles.messages} role="log" aria-label="会話" aria-live="polite">
  {item?.before && <button onClick={() => void more()}>以前の発言を読む</button>}
  {item?.session.messages.map((m) => <article key={m.id} className={m.side === 'me' ? styles.me : styles.reply}>
    <span>{m.side === 'me' ? 'あなた' : 'Eve'}</span>
    <p>{m.text}</p>
    {m.side !== 'me' && m.text.includes('Tool: mr-citations') && m.text.includes('端末内の固定処理') && <p className={styles.historyCorrection}>過去の表示の訂正：この固定引用処理はサイト側で実行されました。Pixel内での実行を示すものではありません。</p>}
  </article>)}
  {!item && <div className={styles.welcome}>{selected ? <><h3>{unavailableConversation === selected ? '会話を確認できません' : '会話を確認しています'}</h3><p>表示されない場合は、接続と会話の履歴を確認してください。</p></> : <h3>今日は何を進めますか？</h3>}</div>}
</div>}
{signedIn !== false && (
              <section hidden={profileRequested} className={styles.composer} aria-label="Eveへ依頼">
                <textarea
                  disabled={busy}
                  aria-label="続きの依頼"
                  placeholder="Eveに依頼する"
                  value={input}
                  maxLength={2000}
                  onChange={(e) => {
                    discardingDraft.current=false;
                    setInput(e.target.value);
                    setConsent(false);
                  }}
                  rows={4}
                />
                {!online&&message&&<div className={styles.notice} role="alert"><p>接続を確認できません。入力中の依頼はこの画面に保持しています。</p><button type="button" onClick={()=>window.dispatchEvent(new Event('online'))}>接続を再確認</button><Link href="/connect/service">接続の設定を開く</Link></div>}

                {signedIn===true&&(!device||!agent)&&<div className={styles.preparationHelp}><p>{!device?'実行先を接続すると、依頼を送れるようになります。依頼文は先に書いておけます。':'担当を選ぶと、使用するモデルと実行条件を確認できます。'}</p><Link href={!device?'/connect/service':'/#sky-manage'}>{!device?'実行先を接続する':'担当を管理する'} →</Link></div>}
                <details className={styles.executionSettings}><summary><span className={styles.connectionVisual} data-ready={ready}><Bot size={20}/><span>実行先・担当・基盤モデルを確認する<small>{device?.name??'接続が必要です'}{agent?` · ${agent.name}`:' · 担当を選ぶ'}</small></span>{ready&&<CheckCircle2 size={18}/>}</span></summary>
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
                </details>
                <label className={styles.consent}>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  会話の一部と依頼を「{device?.name ?? '選んだ実行先'}
                  」に送り、本人のモデルで下書きします。クラウド使用料0円。
                  {device && isEveRuntimePresence(device)
                    ? '出力上限256トークン。'
                    : ''}
                </label>
                <footer>
                  <span>
                    {signedIn === null ? 'アカウントと実行先を確認しています…' : !selectionMatches
                      ? 'Noahで選んだ担当かAIが変わったか、接続が解除されています。内容を確認して選び直してください。'
                      : ready
                        ? '選んだ実行先は接続・準備済みです'
                        : (connectionState?.label ??
                          '接続した実行先で、使う担当のモデルを準備してください。')}
                  </span>
                  {signedIn === true && !selectionMatches && (
                    <Link href="/sky/devices">Noahで接続した担当を選び直す</Link>
                  )}
                  {signedIn === true && selectionMatches && !ready && <Link href="/connect/service">接続状態を確認する</Link>}
                  <button
                    className={styles.primary}
                    disabled={!ready || !consent || !input.trim() || busy}
                    onClick={() => void send()}
                  >
                    <Send size={18} aria-hidden="true"/>{busy ? '依頼を保存中…' : '下書きを作る'}
                  </button>
                </footer>
              </section>
)}
          <details className={styles.extraWork} open={toolOpen||newsWorkOpen||agentWorkOpen||cloudHistoryOpen||profileRequested||undefined}><summary>Tool・ニュース・Cloudで仕事を進める</summary>          {signedIn===true && connectionOwner && <details id="eve-tool-results" tabIndex={-1} open={toolOpen} onToggle={event=>setToolExpanded(event.currentTarget.open)}><summary>NoahのToolで仕事を進める</summary>{toolOpen&&<EveToolWorkspace key={connectionOwner} threadId={selected} onThread={choose}/>}</details>}
          {signedIn===true && connectionOwner && <details id="eve-news-work" tabIndex={-1} open={newsWorkOpen} onToggle={event=>setNewsWorkOpen(event.currentTarget.open)}><summary>ニュースの草稿と資料を確認</summary>{newsWorkOpen&&<EveNewsWorkspace key={`${connectionOwner}:${selected}`} threadId={selected} onThread={choose}/>}</details>}
          {signedIn===true && connectionOwner && <SkyAgentEveProfile key={connectionOwner} ownerUserId={connectionOwner} onSelection={setToolAgentSelection}/>}
          {signedIn===true&&connectionOwner&&profileRequested&&toolAgent&&<EveAgentComposer key={connectionOwner+':'+profileKey} {...composerProps} agent={toolAgent}/>}
          {signedIn===true && connectionOwner && !profileRequested && <details onToggle={event=>setAgentWorkOpen(event.currentTarget.open)}><summary>Agentへ仕事を任せる</summary>{agentWorkOpen&&<Workbench key={connectionOwner} embedded/>}</details>}
          {signedIn===true && connectionOwner && (!profileRequested||workspaceHash==='#eve-cloud-results') && <details id="eve-cloud-results" tabIndex={-1} open={cloudHistoryOpen} onToggle={event=>setCloudHistoryOpen(event.currentTarget.open)}><summary>Cloudの依頼・成果を開く</summary>{cloudHistoryOpen&&<SkyFreeCloudPanel key={connectionOwner}/>}</details>}
</details>
          </div>
          {signedIn === false ? (
            <div className={styles.welcome}>
              <h3>Pixelでも、Webでも、同じEve。</h3>
              <p>
                会話・選んだ仕事・成果をアカウントへ保存します。サインインした後、接続する端末に表示されたコードを承認してください。
              </p>
              <Link
                className={styles.primary}
                prefetch={false}
                href={'/account?returnTo='+encodeURIComponent('/os/eve'+(workbenchQuery?'?'+workbenchQuery:'')+workspaceHash)}
                target="_top"
              >
                サインインして始める
              </Link>
            </div>
          ) : (
            <>
              <section hidden={!resultsView} id="eve-work-results" className={styles.resultsView} aria-labelledby="eve-results-title">
              <div className={styles.resultsHeader}><h2 id="eve-results-title">{selected?'この会話の仕事と成果':'保存した仕事と成果'}</h2><p>進捗を確認し、成果を開く・保存する。受領待ちや停止の照合もここで確認できます。</p><button type="button" onClick={()=>{window.location.hash='eve-compose';setModeOverride('work');}}>依頼画面に戻る</button><nav aria-label="ほかの実行先の仕事と成果"><button type="button" onClick={()=>openWorkSection('cloud')}>Cloudの仕事と成果</button><button type="button" onClick={()=>openWorkSection('tool')}>Toolの仕事と成果</button></nav></div>
              {signedIn===null?<output>{message&&!online?'仕事を取得できません。上の「接続を再確認」から再試行できます。':'仕事を確認しています…'}</output>:!jobs.some(j=>!selected||j.threadId===selected)&&!runtimeJobs.some(j=>!selected||j.threadId===selected)&&!runtimePending.some(j=>!selected||j.threadId===selected)?<div className={styles.resultsEmpty}><h3>{selected?'この会話の仕事はまだありません':'保存した仕事はまだありません'}</h3><p>依頼を準備し、担当と実行先を確認すると、同じ会話で進捗と成果を確認できます。</p><button type="button" onClick={()=>{window.location.hash='eve-compose';setModeOverride('work');}}>新しい依頼を準備する</button></div>:null}
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
              </section>
              {runtimeNotice && (
                <output className={styles.notice}>{runtimeNotice}</output>
              )}
              {signedIn===true&&connectionOwner&&selected&&<details className={styles.secondaryControls}><summary>過去の担当・モデルの成果</summary><EveRuntimeArchive key={connectionOwner+':'+selected} owner={connectionOwner} threadId={selected} api={api} current={runtimeCurrent}/></details>}
              {!profileRequested && signedIn === true && (runtimeBinding||creationBinding) && <details className={styles.secondaryControls}><summary>担当・音声操作と以前の端末実行</summary><EveRuntimeInteraction key={creationBinding?purposeEvePendingKey(creationBinding):runtimeEvePendingKey(runtimeBinding!)} savedWork={runtimeBinding?runtimeEveRestorableWork(runtimeBinding,{ownerUserId:connectionOwner,pending:runtimePending,executions:runtimeJobs}):[]} binding={runtimeBinding} creation={creationBinding} api={api} selectedConnected={ready&&!busy} creationConnected={creationReady&&!busy} supportsPurpose={supportsPurpose} current={runtimeCurrent} /></details>}
            </>
          )}
          {message && <output className={styles.notice}>{message}</output>}
          </div>
        </section>
      </div>
      <Dialog open={Boolean(leaveTarget)} onOpenChange={open=>{if(!open)setLeaveTarget(null);}}><DialogContent className="rock-tool-dialog"><DialogTitle>未送信の依頼があります</DialogTitle><DialogDescription>この画面を離れると、入力中の依頼文が失われます。依頼・成果画面の切り替えでは保持されます。接続や設定を確認したい場合は、元の画面を残して別タブで開けます。</DialogDescription><div className={styles.leaveActions}><button type="button" onClick={()=>setLeaveTarget(null)}>入力を残して戻る</button>{leaveTarget?.href&&<a href={leaveTarget.href} target="_blank" rel="noopener noreferrer" onClick={()=>setLeaveTarget(null)}>別タブで開く</a>}<button type="button" onClick={()=>{const target=leaveTarget;discardingDraft.current=true;setInput('');setConsent(false);setLeaveTarget(null);requestAnimationFrame(()=>{if(target?.href)window.location.assign(target.href);else target?.resume?.();});}}>未送信の依頼を破棄して移動</button></div></DialogContent></Dialog>
    </WorkspaceShell>
  );
}
