'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { NoahLocalConnection, NoahTestRun } from '@/lib/noah-local-connection';
import styles from './noah-local-connection.module.css';
import NoahCloudConnection from './noah-cloud-connection';

const labels = { disconnected: '未接続', connecting: '接続を準備中', ready: '接続済み', failed: '接続を確認できません' };
const operationLabels = { running: '運用中', stopped: '停止済み', blocked: '要確認・運用停止', interrupted: 'ホスト停止で中断' };
const timeLabel = (time: number) => new Date(time).toLocaleTimeString('ja-JP');
export default function NoahLocalConnectionPanel({ id, ownerScope }: { id: string; ownerScope: string }) {
  const [connection, setConnection] = useState<NoahLocalConnection | null>(null);
  const [text, setText] = useState('資料を確認する\n連絡する\n資料を確認する');
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [run, setRun] = useState<NoahTestRun | null>(null);
  const [needsRetry, setNeedsRetry] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(10), [needsStartRetry, setNeedsStartRetry] = useState(false);
  const pendingRun = useRef<{ requestId: string; text: string } | null>(null);
  const pendingStart = useRef<{ requestId: string; text: string; intervalSeconds: number } | null>(null), settingsLoaded = useRef(false);
  const locked = useRef(false), alive = useRef(true), revision = useRef(0);
  const endpoint = `/__noah/connections/${id}`;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const observedRevision = revision.current;
    const response = await fetch(endpoint, { cache: 'no-store', signal });
    const data = await response.json().catch(() => null) as NoahLocalConnection | null;
    if (!response.ok || !data?.supported) throw new Error('このテスト接続は、このMacで起動したNoahから利用できます。');
    if (alive.current && !signal?.aborted && observedRevision === revision.current) {
      setConnection(data); setRun(data.runs.at(-1) || null);
      if (!settingsLoaded.current) {
        if (data.operation) { setText(data.operation.text); setIntervalSeconds(data.operation.intervalSeconds); }
        settingsLoaded.current = true;
      }
      if (pendingStart.current && data.operation?.id === pendingStart.current.requestId) { pendingStart.current = null; setNeedsStartRetry(false); }
    }
  }, [endpoint]);
  useEffect(() => {
    alive.current = true; const controller = new AbortController();
    const check = () => { if (!locked.current) void refresh(controller.signal).catch(e => { if (!controller.signal.aborted) { setConnection(null); setError(e.message); } }); };
    check(); const timer = setInterval(check, 5000);
    return () => { alive.current = false; controller.abort(); clearInterval(timer); };
  }, [refresh]);
  async function act(action: 'connect' | 'disconnect' | 'run' | 'startOperation' | 'stopOperation') {
    if (locked.current) return;
    locked.current = true; revision.current++; setBusy(action); setError('');
    if (action === 'connect') setConnection(current => current && { ...current, state: 'connecting', error: null });
    let payload: object = {};
    if (action === 'run') {
      pendingRun.current ??= { requestId: crypto.randomUUID(), text };
      payload = pendingRun.current;
    }
    if (action === 'startOperation') {
      pendingStart.current ??= { requestId: crypto.randomUUID(), text, intervalSeconds };
      payload = pendingStart.current;
    }
    try {
      const route = action === 'startOperation' ? 'operation/start' : action === 'stopOperation' ? 'operation/stop' : action;
      const response = await fetch(`${endpoint}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: ownerScope }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
      const data = await response.json() as NoahLocalConnection & { run?: NoahTestRun };
      if (!response.ok) {
        if (action === 'run' && response.status < 500) pendingRun.current = null;
        if (action === 'startOperation' && response.status < 500) pendingStart.current = null;
        throw new Error(data.error || '接続を確認してから再試行してください。');
      }
      if (!data.supported) throw new Error('このAgentには対応する接続処理がありません。');
      if (alive.current) {
        setConnection(data); setRun(data.run || data.runs.at(-1) || null);
        if (action === 'run') pendingRun.current = null;
        if (action === 'startOperation') pendingStart.current = null;
      }
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message + (action === 'run' && pendingRun.current ? '「同じ処理の結果を確認」で重複実行せずに再確認できます。' : ''));
        try { await refresh(); } catch { setConnection(null); }
      }
    } finally { locked.current = false; if (alive.current) { setNeedsRetry(!!pendingRun.current); setNeedsStartRetry(!!pendingStart.current); setBusy(''); } }
  }
  const ready = connection?.state === 'ready', operation = connection?.operation, operating = operation?.state === 'running';
  return <><NoahCloudConnection id={id} ownerScope={ownerScope} /><section className={styles.panel} aria-label="ローカル接続テスト">
    <div className={styles.heading}><div><span className={styles.tag}>このMacで試す · 無料</span><h2>接続して、処理を試す</h2></div><output className={ready ? styles.ready : styles.status}>{connection ? labels[connection.state] : '接続状態を確認中'}</output></div>
    <p>行の前後の空白と重複を取り除き、件数を返すテストAgentです。入力はこのMacで処理します。</p>
    <div className={styles.steps} aria-label="接続の進行"><span>{ready ? '✓' : '1'} Agentを準備</span><span>{ready ? '✓' : '2'} 応答を確認</span><span>{ready ? '✓ 利用できます' : '3 処理を試す'}</span></div>
    <div className={styles.actions}>
      <button className={styles.primary} disabled={!!busy || !ownerScope || ready} onClick={() => void act('connect')}>{busy === 'connect' ? '起動・接続を確認しています…' : ready ? '接続済み' : connection?.state === 'failed' ? '再接続する' : '接続する'}</button>
      {ready && <button disabled={!!busy} onClick={() => void act('disconnect')}>接続を解除</button>}
    </div>
    {(error || operation?.error || connection?.error) && <p className={styles.error} role="alert">{error || operation?.error || connection?.error}</p>}
    <label className={styles.input}>処理するテキスト<textarea rows={4} maxLength={4000} value={operating ? operation.text : text} disabled={!!busy || needsRetry || needsStartRetry || operating} onChange={e => setText(e.target.value)} /></label>
    <section className={styles.operation} aria-label="継続運用">
      <div className={styles.heading}><h3>画面を閉じても、処理を続ける</h3><output className={operating ? styles.ready : styles.status}>{busy === 'stopOperation' || (busy === 'disconnect' && operating) ? '停止を確認中' : operation ? operationLabels[operation.state] : '未開始'}</output></div>
      <label className={styles.interval}>処理の間隔<select value={operating ? operation.intervalSeconds : intervalSeconds} disabled={!!busy || operating || needsStartRetry} onChange={e => setIntervalSeconds(Number(e.target.value))}><option value={10}>10秒ごと</option><option value={30}>30秒ごと</option><option value={60}>60秒ごと</option></select></label>
      <div className={styles.actions}>
        <button className={styles.primary} disabled={!!busy || operating || !ownerScope || !text.trim() || needsRetry} onClick={() => void act('startOperation')}>{busy === 'startOperation' ? '運用を開始しています…' : needsStartRetry ? '運用開始の結果を確認' : '運用開始'}</button>
        <button disabled={!!busy || !operating} onClick={() => void act('stopOperation')}>{busy === 'stopOperation' ? '停止を確認しています…' : '運用停止'}</button>
      </div>
      {operation && <><div className={styles.metrics}><span>この運用の成功 <strong>{operation.succeededCount}回</strong></span><span>次回 <strong>{operating && operation.nextRunAt ? timeLabel(operation.nextRunAt) : operating ? '処理中' : '予定なし'}</strong></span></div><small>運用ID：{operation.id}</small></>}
      <p className={styles.note}>Noahの画面を閉じても、このMac側で処理を続けます。Macのスリープ・Noahサーバー終了中は動きません。サーバー再起動後は「運用開始」で再開します。</p>
    </section>
    <div className={styles.actions}><button disabled={!!busy || operating || needsStartRetry || (!ready && !needsRetry) || !text.trim()} onClick={() => void act('run')}>{busy === 'run' ? '処理しています…' : needsRetry ? '同じ処理の結果を確認' : '1回だけテスト処理を実行'}</button><small>{text.length} / 4000文字</small></div>
    {run && <div className={styles.result}><h3>{run.state === 'succeeded' ? '直近の処理結果 · 完了' : run.state === 'unknown' ? '直近の処理結果 · 確認できません' : '処理中'}</h3>
      {run.result && <><p>{run.result.inputLines}行 → {run.result.uniqueLines}行（重複 {run.result.removedLines}行を除去）</p><pre>{run.result.text}</pre></>}
      <small>実行ID：{run.requestId}</small>
    </div>}
    {!!connection?.runs.length && <section aria-label="実行履歴" className={styles.history}><h3>実行履歴</h3><ol>{connection.runs.slice(-10).toReversed().map(item => <li key={item.requestId}><time dateTime={new Date(item.createdAt).toISOString()}>{timeLabel(item.createdAt)}</time><span>{item.trigger === 'scheduled' ? `定期実行 #${item.sequence}` : '手動実行'}</span><strong>{item.state === 'succeeded' ? '完了' : item.state === 'unknown' ? '結果不明' : item.state === 'skipped' ? '未実行' : '処理中'}</strong></li>)}</ol><small>直近10件を表示（結果は20件保存）。</small></section>}
    <p className={styles.note}>登録済みファイルに紐付けた接続テストです。保存したZIPや外部のWebサイトは実行しません。</p>
  </section></>;
}
