'use client';

import { SkyNotice, SkyWorkProgress } from '@/components/sky-feedback';

import { useEffect, useRef, useState } from 'react';
import type { WorkJob } from '@/lib/workflow';
import { SkyAppResultView } from '@/components/sky-app-result-view';
import styles from './sky-add-zoom-prototype.module.css';

/** Both applications use the same owner-authenticated endpoint. Never uploads client results. */
export function SkyAppServerPanel({ local }: { local: WorkJob }) {
  const [server, setServer] = useState<WorkJob | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const uncertain = useRef<{ action: string; body: string } | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [uncertainAction, setUncertainAction] = useState('');
  useEffect(() => () => { active.current?.abort(); }, []);
  async function send(action: 'create' | 'run' | 'confirm' | 'stop' | 'reload') {
    if (!local.skyApp || active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    const old = uncertain.current;
    if (old && old.action !== action && action !== 'reload') {
      active.current = null; setBusy(false); setError('前の操作の結果を再読込するか、同じ操作を再試行してください。'); return;
    }
    const body = old?.body ?? JSON.stringify(action === 'create'
      ? { action, jobId: local.id, request: local.skyApp.request, saveMaterial: true }
      : { action, jobId: local.id, revision: server?.revision, commandId: crypto.randomUUID() });
    if (action !== 'reload') uncertain.current = { action, body };
    try {
      const response = await fetch(action === 'reload' ? `/api/sky/app-work?jobId=${local.id}` : '/api/sky/app-work', {
        method: action === 'reload' ? 'GET' : 'POST', signal: controller.signal,
        ...(action === 'reload' ? {} : { headers: { 'Content-Type': 'application/json' }, body }),
      });
      if (!response.ok) {
        if (response.status < 500) { uncertain.current = null; setUnknown(false); }
        throw new Error(response.status === 404 ? '本人用APIは未設定、対象外、または仕事が見つかりません。' : response.status === 401 ? '本人のサインインが必要です。' : '操作できませんでした。仕事を再読込して状態を確認してください。');
      }
      const value = await response.json() as { job: WorkJob };
      if (active.current !== controller) return;
      if (value.job.id !== local.id || JSON.stringify(value.job.skyApp?.request) !== JSON.stringify(local.skyApp.request))
        throw new Error('連携元の仕事が一致しません。');
      setServer(value.job); uncertain.current = null; setUnknown(false);
    } catch (cause) {
      if (active.current === controller && !controller.signal.aborted) { setError((cause as Error).message); setUnknown(uncertain.current !== null); setUncertainAction(uncertain.current?.action ?? ''); }
    } finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  return <details><summary>同じSky基盤へ本人用に保存・実行</summary>
    <p>本人用APIと認証が設定済みの場合だけ利用できます。素材・設定を本人アカウントに保存し、サーバーで同じ制限付き処理を実行します。タブ内の成果を成功証拠として送信することはありません。</p>
    <div className={styles.labActions}>
      <button type="button" disabled={busy || !!server || (unknown && uncertainAction !== 'create')} onClick={() => void send('create')}>素材の保存に同意して仕事を作る</button>
      <button type="button" disabled={busy || !server || server.status !== 'active' || (unknown && uncertainAction !== 'run')} onClick={() => void send('run')}>Skyサーバーで実行</button>
      <button type="button" disabled={busy || server?.status !== 'review' || (unknown && uncertainAction !== 'confirm')} onClick={() => void send('confirm')}>サーバー成果を確認済みにする</button>
      <button type="button" disabled={busy || !server || !['active', 'review'].includes(server.status) || (unknown && uncertainAction !== 'stop')} onClick={() => void send('stop')}>サーバーの仕事を停止</button>
      <button type="button" disabled={busy} onClick={() => void send('reload')}>本人の仕事を再読込</button>
    </div>
    {unknown && <p>操作の結果を確定できませんでした。同じ操作の再試行か再読込で復旧できます。</p>}
    {error && <SkyNotice message={error} />}
    {server && <div><SkyWorkProgress job={server} />
      {server.skyApp?.result && <SkyAppResultView binding={server.skyApp} />}</div>}
  </details>;
}
