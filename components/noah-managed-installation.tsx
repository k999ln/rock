'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { startNoahVisiblePolling } from '@/lib/noah-visible-polling';
import { NoahAgentPin, NoahAgentPinGrid } from './noah-agent-pin';
import styles from './noah-agent-catalog.module.css';
import NoahExecutionPanel from './noah-execution-panel';
import { NoahInstanceAdd } from './noah-instances';
import { recipeFor } from '@/lib/noah-execution-contract.mjs';
import { requirementsFor } from '@/lib/noah-agent-requirements.mjs';

type Installation = { id: string; name: string; state: string; message: string; busy: boolean; canAcquire?: boolean; automaticRuntime?: boolean; requirements?: { executable: boolean; requirements: string; note: string; reference: string; checkedAt: string } | null; url?: string; updatedAt?: string; execution?: { model: string; capability: string; limits: { seconds: number; modelCalls: number } }; runtimeInfo?: { name: string; version: string; reused: boolean };
  source?: { url: string; commit: string; sha256: string; bytes: number; detected: string[] } };
const labels: Record<string, string> = { idle: '未接続', resolving: '配布元を確認中', fetching: '本体を取り寄せ中', preparing: '実行環境を準備中', checking: '接続を確認中', connected: '接続済み', setup_required: '本体準備済み・本人の設定待ち', adapter_required: '本体取得済み・起動対応待ち', unavailable: '本体の配布・接続条件の確認が必要', failed: '準備に失敗しました', disconnected: '未接続・再接続できます' };
async function result(response: Response) {
  const data = await response.json().catch(() => ({ error: '本体の取り寄せは、実行ホストのNoahで利用できます。' })) as { installation?: Installation; installations?: Installation[]; ownerScope?: string; error?: string };
  if (!response.ok) throw new Error(data.error || '接続状態を確認できませんでした。');
  return data;
}

export default function NoahManagedInstallation({ id, terminal = false }: { id: string; terminal?: boolean }) {
  const [record, setRecord] = useState<Installation | null>(null), [scope, setScope] = useState('');
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [confirmRemove, setConfirmRemove] = useState(false), [retry, setRetry] = useState(0);
  const revision = useRef(0), busyRequest = useRef(false);
  const requirements = requirementsFor(id);
  useEffect(() => {
    return startNoahVisiblePolling(async signal => {
      const before = revision.current;
      try {
        const data = await result(await fetch(`/__noah/installations/${id}`, { cache: 'no-store', signal }));
        if (!data.installation || !data.ownerScope) throw new Error('実行ホストの接続情報を確認できません。');
        if (!signal.aborted && before === revision.current && !busyRequest.current) { setRecord(data.installation); setScope(data.ownerScope); setError(''); }
        return data.installation.busy ? 1200 : 10000;
      } catch (e) { if (!signal.aborted) setError(e instanceof Error ? e.message : '接続を確認できません。'); }
    }, 10000);
  }, [id, retry]);
  async function act(action: 'connect' | 'disconnect' | 'remove') {
    if (!scope || busyRequest.current) return;
    busyRequest.current = true; revision.current++; setPending(true); setError('');
    try {
      const data = await result(await fetch(`/__noah/installations/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope }, body: '{}' }));
      if (!data.installation || data.ownerScope !== scope) throw new Error('アカウントが変わりました。画面を開き直してください。');
      setRecord(data.installation); setConfirmRemove(false);
    } catch (e) { setError(e instanceof Error ? e.message : '接続できませんでした。'); }
    finally { busyRequest.current = false; revision.current++; setPending(false); setRetry(n => n + 1); }
  }
  return <><section className={styles.notice} aria-label="Agentの取り寄せと接続">
    <h2>このAgentに接続</h2>
    <p>{requirements?.executable || terminal ? '「接続する」で裏側の実行環境を準備し、依頼を待ちます。ターミナルを前に出さず、本人の画面・マウス・キーボードを使わずに処理します。' : 'このAgentの利用条件と、Noahの接続対応状況です。'}</p>
    {requirements && <div><p><strong>必要なもの：</strong>{requirements.requirements}</p><p>{requirements.note}</p><a href={requirements.reference} target="_blank" rel="noopener noreferrer">提供元の説明を確認 ↗</a></div>}
    <div aria-live="polite"><strong>{record ? labels[record.state] || record.state : '接続先を確認しています…'}</strong><p>{record?.message}</p></div>
    {error && <p className={styles.error} role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>再確認</button></p>}
    <div className={styles.actions}>
      {record?.canAcquire !== false && <button className={styles.primary} disabled={!scope || pending || record?.busy} onClick={() => void act('connect')}>{record?.busy ? '取り寄せ・接続中…' : record?.state === 'connected' ? '接続を再確認' : record?.automaticRuntime === false ? '本体を取得（実行は未対応）' : record?.source ? '再接続する' : '接続する'}</button>}
      {(record?.busy || ['connected', 'setup_required'].includes(record?.state || '')) && <button disabled={pending} onClick={() => void act('disconnect')}>{record?.busy ? '取り寄せを中止' : '接続を停止'}</button>}
      {record?.url === 'http://127.0.0.1:18791' && <a className={styles.primary} href={record.url} target="_blank" rel="noopener noreferrer">Aniccaの設定画面を開く ↗</a>}
      {!terminal && record && record.state !== 'idle' && !record.busy && !confirmRemove && <button disabled={pending} onClick={() => setConfirmRemove(true)}>取り寄せた本体を削除</button>}
    </div>
    {confirmRemove && <div className={styles.actions}><p>Noahの接続を停止し、このMacに取り寄せた本体を削除します。</p><button disabled={pending} onClick={() => void act('remove')}>削除する</button><button disabled={pending} onClick={() => setConfirmRemove(false)}>戻る</button></div>}
    {record?.busy && <p>準備は裏側で続きます。他の画面で作業して大丈夫です。MacとNoahの実行ホストを起動しておいてください。</p>}
    {(requirements?.executable || terminal) && <p><Link href="/noah/models">必要なモデルの準備状況を見る →</Link></p>}
    {id === "research-ce4e58553bea6313acf7" && <p><Link href="/noah/code">VS Codeの保存時リファクタを設定 →</Link></p>}
    {record?.runtimeInfo && <p>実行器：{record.runtimeInfo.name} / {record.runtimeInfo.version}{record.runtimeInfo.reused ? '（このMacの導入済み版を使用）' : '（Noahが準備した版）'}</p>}
    {record?.source && <details><summary>取得した本体・照合情報</summary><p>{record.source.url}</p><p>取得容量：{(record.source.bytes / 1024 / 1024).toFixed(1)} MiB</p><p>版：<code className={styles.digest}>{record.source.commit}</code></p><p>SHA-256：<code className={styles.digest}>{record.source.sha256}</code></p><p>依存定義：{record.source.detected.join('、') || '自動判定できませんでした'}</p></details>}
    <p className={styles.muted}>保存・実行先はこのMacです。モデルや外部業務の実行は接続確認に含みません。</p>
    {(recipeFor(id)||terminal)&&<NoahInstanceAdd agentId={id} scope={scope}/>}
  </section>{(recipeFor(id) || terminal) && <NoahExecutionPanel key={`${id}/${scope}`} id={id} scope={scope} execution={record?.state === 'connected' ? record.execution : undefined} />}</>;
}

export function NoahInstallationsList() {
  const [rows, setRows] = useState<Installation[]>([]), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [hidden, setHidden] = useState(false);
  useEffect(() => {
    return startNoahVisiblePolling(async signal => {
      try {
        const response = await fetch('/__noah/installations', { cache: 'no-store', signal });
        // 取り寄せは Mac の実行ホストだけの機能。公開版（/__noah が無い所）では、節ごと出さない。
        if (response.status === 404) { if (!signal.aborted) { setHidden(true); setLoading(false); } return 600_000; }
        const data = await result(response);
        if (!Array.isArray(data.installations)) throw new Error('取り寄せ一覧を確認できません。');
        if (!signal.aborted) { setRows(data.installations); setError(''); }
      } catch (e) { if (!signal.aborted) { setRows([]); setError(e instanceof Error ? e.message : '取得できませんでした。'); } }
      if (!signal.aborted) setLoading(false);
    }, 10000);
  }, []);
  if (hidden) return null;
  return <section className={styles.notice}><h2>このMacに取り寄せたAgent</h2><p>本体・接続状態・停止と削除を管理できます。</p>
    {error && <output>{error}</output>}
    {loading && <output>このMacの接続状態を確認中…</output>}
    {!loading && !rows.length && !error && <p>タイムラインの詳細で「接続する」を押すと、ここに追加されます。</p>}
    <NoahAgentPinGrid>{rows.map(installation => <NoahAgentPin key={installation.id} id={installation.id}
      name={installation.name} href={`/noah/agents/${installation.id}`} meta={labels[installation.state] || installation.state} />)}</NoahAgentPinGrid>
    <Link href="/noah/explore">Agentを探す →</Link>
  </section>;
}
