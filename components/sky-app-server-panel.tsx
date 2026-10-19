'use client';

import { SkyNotice, SkyWorkProgress } from '@/components/sky-feedback';

import { useEffect, useRef, useState } from 'react';
import type { WorkJob } from '@/lib/workflow';
import type { SkyAppRequest } from '@/lib/sky-app-contract';
import type { SkyPrivateAgentAdd, SkyPrivateAgentRecord } from '@/lib/sky-private-agent';
import { SkyAppResultView } from '@/components/sky-app-result-view';
import styles from './sky-add-zoom-prototype.module.css';

/** Both applications use the same owner-authenticated endpoint. Never uploads client results. */
export function SkyAppServerPanel({ request }: { request: SkyAppRequest }) {
  const [server, setServer] = useState<WorkJob | null>(null);
  const [agent, setAgent] = useState<SkyPrivateAgentRecord | null>(null);
  const [add, setAdd] = useState<SkyPrivateAgentAdd | null>(null);
  const pendingAgentId = useRef<string | null>(null), pendingAddId = useRef<string | null>(null);
  const serverJobId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const uncertain = useRef<{ action: string; body: string } | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [uncertainAction, setUncertainAction] = useState('');
  useEffect(() => () => { active.current?.abort(); }, []);
  async function postAgent(body: unknown, signal: AbortSignal) {
    const response = await fetch('/api/sky/private-agents', { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(response.status === 401 ? '本人のサインインが必要です。'
      : response.status === 404 ? '本人用Agent保存は設定されていません。'
        : 'Agentの版か追加条件を確認してください。再読込後にやり直してください。');
    return response.json() as Promise<{ agent?: SkyPrivateAgentRecord; add?: SkyPrivateAgentAdd; removed?: boolean }>;
  }
  async function setupAgent() {
    if (active.current || add) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      const agentId = pendingAgentId.current ??= crypto.randomUUID();
      const addId = pendingAddId.current ??= crypto.randomUUID();
      const fit = { surface: 'browser.preview', inputSource: 'manual.text', returnSlot: 'embedded.private' } as const;
      const spec = { schema: 'sky.private-agent/1', appId: request.appId,
        ...(request.recipe ? { recipe: request.recipe } : {}),
        fits: [fit], execution: 'bounded-text-adapter', declaredChargeMinor: 0, externalSend: false };
      const created = await postAgent({ action: 'create', agentId, spec, saveSettings: true }, controller.signal);
      if (!created.agent) throw new Error('Agentの保存結果を確認できません。');
      setAgent(created.agent);
      const installed = await postAgent({ action: 'add', agentId, addId, fit }, controller.signal);
      if (!installed.add || installed.add.agentDigest !== created.agent.digest) throw new Error('Agent追加の版を確認できません。');
      setAdd(installed.add);
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  async function removeAdd() {
    if (!add || active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      const removed = await postAgent({ action: 'remove', addId: add.id }, controller.signal);
      if (!removed.removed) throw new Error('追加解除の結果を確認できません。');
      setAdd(null);
      pendingAddId.current = null;
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  async function send(action: 'create' | 'run' | 'confirm' | 'stop' | 'reload') {
    if (active.current || (action === 'create' && !add)) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    const old = uncertain.current;
    if (old && old.action !== action && action !== 'reload') {
      active.current = null; setBusy(false); setError('前の操作の結果を再読込するか、同じ操作を再試行してください。'); return;
    }
    const id = serverJobId.current ??= crypto.randomUUID();
    const body = old?.body ?? JSON.stringify(action === 'create'
      ? { action, jobId: id, request, saveMaterial: true, addId: add!.id }
      : { action, jobId: id, revision: server?.revision, commandId: crypto.randomUUID() });
    if (action !== 'reload') uncertain.current = { action, body };
    try {
      const response = await fetch(action === 'reload' ? `/api/sky/app-work?jobId=${id}` : '/api/sky/app-work', {
        method: action === 'reload' ? 'GET' : 'POST', signal: controller.signal,
        ...(action === 'reload' ? {} : { headers: { 'Content-Type': 'application/json' }, body }),
      });
      if (!response.ok) {
        if (response.status < 500) { uncertain.current = null; setUnknown(false); }
        throw new Error(response.status === 404 ? '本人用APIは未設定、対象外、または仕事が見つかりません。' : response.status === 401 ? '本人のサインインが必要です。' : '操作できませんでした。仕事を再読込して状態を確認してください。');
      }
      const value = await response.json() as { job: WorkJob };
      if (active.current !== controller) return;
      if (value.job.id !== id || JSON.stringify(value.job.skyApp?.request) !== JSON.stringify(request))
        throw new Error('連携元の仕事が一致しません。');
      setServer(value.job); uncertain.current = null; setUnknown(false);
    } catch (cause) {
      if (active.current === controller && !controller.signal.aborted) { setError((cause as Error).message); setUnknown(uncertain.current !== null); setUncertainAction(uncertain.current?.action ?? ''); }
    } finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  return <details><summary>本人アカウントへ別の仕事として保存・実行</summary>
    <p>本人用APIと認証が設定済みの場合だけ利用できます。タブ内の試験仕事とは別IDで素材・設定を本人アカウントへ保存し、サーバーで制限付き処理を実行します。タブ内の成果を成功証拠として送信することはありません。</p>
    <div className={styles.labActions}>
      <button type="button" disabled={busy || !!add} onClick={() => void setupAgent()}>{add ? '自分用Agentを追加済み' : '自分用Agentを保存して追加'}</button>
      {add && <button type="button" disabled={busy} onClick={() => void removeAdd()}>Agentの追加を解除</button>}
      <small>{agent ? `Agent版 ${agent.revision} / 外部送信なし / 宣言費用0円` : '保存は本人の明示操作で開始します。'}</small>
    </div>
    <div className={styles.labActions}>
      <button type="button" disabled={busy || !!server || !add || (unknown && uncertainAction !== 'create')} onClick={() => void send('create')}>素材の保存に同意して仕事を作る</button>
      <button type="button" disabled={busy || !server || server.status !== 'active' ||
        (!add || server.skyApp?.privateAgent?.id !== add.id) ||
        (unknown && uncertainAction !== 'run')} onClick={() => void send('run')}>Skyサーバーで実行</button>
      <button type="button" disabled={busy || server?.status !== 'review' || (unknown && uncertainAction !== 'confirm')} onClick={() => void send('confirm')}>サーバー成果を確認済みにする</button>
      <button type="button" disabled={busy || !server || !['active', 'review'].includes(server.status) || (unknown && uncertainAction !== 'stop')} onClick={() => void send('stop')}>サーバーの仕事を停止</button>
      <button type="button" disabled={busy} onClick={() => void send('reload')}>本人の仕事を再読込</button>
    </div>
    {unknown && <p>操作の結果を確定できませんでした。同じ操作の再試行か再読込で復旧できます。</p>}
    {error && <SkyNotice message={error} />}
    {server && <div><p>保存した仕事ID: {server.id} / 更新番号: {server.revision}</p><SkyWorkProgress job={server} />
      {server.skyApp?.result && <SkyAppResultView binding={server.skyApp} />}</div>}
  </details>;
}
