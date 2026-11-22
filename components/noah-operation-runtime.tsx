'use client';
import { useEffect, useRef, useState } from 'react';
import type { WorkJob } from '@/lib/workflow';
import type { NoahOperationBinding } from '@/lib/noah-operations';
import { canonicalOperationValue, operationRuntimeEditable, OPERATION_RUNTIME_CONFIRMATION } from '@/lib/noah-operation-contract.mjs';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';

type Job = WorkJob & { noahOperation: NonNullable<WorkJob['noahOperation']> };
type Preview = { revision: number; current: NoahOperationBinding; candidate: NoahOperationBinding; candidateDigest: string; changed: boolean };
type Intent = { preview: Preview; commandId: string };
const labels: Record<keyof NoahOperationBinding, string> = { agentId: 'Agent', recipe: '実行方式', version: 'Agentの版', image: '実行環境', model: 'モデル', modelSha256: 'モデルの固定版', provider: '外部モデルの接続', source: '登録コード', release: '配布版・利用権', invite: '招待・実行許可' };
const display = (value: unknown) => value === undefined ? '未記録' : typeof value === 'string' ? value : JSON.stringify(value);

export default function NoahOperationRuntime({ job, scope, connected, disabled, onUpdated }: { job: Job; scope: string; connected: boolean; disabled: boolean; onUpdated: () => void }) {
  const [intent, setIntent] = useState<Intent | null>(null), [confirmed, setConfirmed] = useState(false), [pending, setPending] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [uncertain, setUncertain] = useState(false);
  const guard = useRef({ generation: 0, busy: false });
  useEffect(() => { const current = guard.current; current.generation++; return () => { current.generation++; }; }, [scope, job.id]);
  const editable = operationRuntimeEditable(job.noahOperation);
  async function act(save: boolean) {
    if (guard.current.busy || disabled || !scope || (save ? !intent || !confirmed || (!uncertain && (!editable || !connected || intent.preview.revision !== job.revision)) : !editable || !connected)) return;
    guard.current.busy = true; const generation = guard.current.generation;
    const valid = () => guard.current.generation === generation;
    setPending(true); setError(''); setMessage('');
    try {
      if (save) setUncertain(true);
      const r = await fetch(`/__noah/operations/${job.id}/runtime`, { method: save ? 'POST' : 'GET', cache: 'no-store',
        ...(save ? { headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope }, body: JSON.stringify({ revision: intent!.preview.revision, commandId: intent!.commandId, candidateDigest: intent!.preview.candidateDigest, confirmation: OPERATION_RUNTIME_CONFIRMATION }) } : {}) });
      const data = await r.json() as { ownerScope?: string; job?: Job; runtime?: Preview; error?: string };
      if (!valid()) return;
      if (save && !r.ok && [400, 403, 404, 409, 429].includes(r.status)) setUncertain(false);
      if (!r.ok || data.ownerScope !== scope || data.job?.id !== job.id) throw new Error(data.error || '実行環境を確認できません。');
      if (save) {
        const receipt = data.job.noahOperation.bindings?.find(b => b.commandId === intent!.commandId);
        if (!receipt || receipt.candidateDigest !== intent!.preview.candidateDigest || receipt.previousRevision !== intent!.preview.revision) throw new Error('保存結果を照合できません。同じ操作の結果を再確認してください。');
        setMessage(`実行環境${receipt.version}を保存しました。保存時に運用は再開していません。現在の状態を確認して再開できます。`);
        setIntent(null); setConfirmed(false); setUncertain(false); onUpdated();
      } else {
        if (!data.runtime || data.runtime.revision !== data.job.revision || !/^[a-f0-9]{64}$/.test(data.runtime.candidateDigest)) throw new Error('変更内容を確認できません。');
        setIntent({ preview: data.runtime, commandId: crypto.randomUUID() }); setConfirmed(false); setUncertain(false);
      }
    } catch (e) { if (valid()) setError(e instanceof Error ? e.message : '実行環境を確認できません。'); }
    finally { if (valid()) { guard.current.busy = false; setPending(false); } }
  }
  const changes = intent ? (Object.keys(labels) as (keyof NoahOperationBinding)[]).filter(k => canonicalOperationValue(intent.preview.current[k]) !== canonicalOperationValue(intent.preview.candidate[k])) : [];
  return <section aria-label="運用の実行環境">
    <p>実行環境{job.noahOperation.bindingVersion ?? 1}{job.noahOperation.binding.model && job.noahOperation.binding.model !== 'none' && !job.noahOperation.binding.modelSha256 && !job.noahOperation.binding.provider ? ' · モデルの固定版が未記録です' : ''}</p>
    {editable && <button disabled={disabled || pending || !connected || !scope || uncertain} onClick={() => void act(false)}>実行環境の変更を確認</button>}
    {intent && <div>
      {changes.length ? <><p>次回から使う実行環境の変更です。過去の仕事・成果・累計回数・運用条件は残ります。保存後も停止を維持します。</p>
        <table><thead><tr><th>変更する項目</th><th>保存済み</th><th>接続中の候補</th></tr></thead><tbody>{changes.map(k => <tr key={k}><th>{labels[k]}</th><td style={{ overflowWrap: 'anywhere' }}>{display(intent.preview.current[k])}</td><td style={{ overflowWrap: 'anywhere' }}>{display(intent.preview.candidate[k])}</td></tr>)}</tbody></table>
        {intent.preview.revision !== job.revision && !uncertain && <p role="alert">運用が更新されました。変更内容を再確認してください。</p>}
        <label><input type="checkbox" checked={confirmed} disabled={pending || uncertain} onChange={e => setConfirmed(e.target.checked)} />変更内容を確認し、この実行環境を使う</label>
        <button disabled={disabled || pending || !confirmed || (!uncertain && (!editable || !connected || intent.preview.revision !== job.revision))} onClick={() => void act(true)}>{uncertain ? '同じ操作の保存結果を確認' : '実行環境を保存（停止を維持）'}</button>
      </> : <p>接続中の実行環境は保存済みの内容と同じです。</p>}
    </div>}
    {error && <p role="alert">{error}</p>}{message && <output>{message}</output>}
    {!!job.noahOperation.bindings?.length && <details><summary>実行環境の履歴</summary>{job.noahOperation.bindings.map(b => <p key={b.version}>実行環境{b.version} · {b.binding.recipe} {b.binding.version} · {b.binding.model || 'モデルなし'} · {new Date(b.changedAt).toLocaleString('ja-JP')}</p>)}</details>}
  </section>;
}
