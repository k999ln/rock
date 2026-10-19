'use client';

import { useRef, useState } from 'react';
import type { WorkJob } from '@/lib/workflow';
import type { SkyPrivateAgentAddDecision } from '@/lib/sky-private-agent';
import { SkyAppResultView } from '@/components/sky-app-result-view';
import { SkyNotice, SkyWorkProgress } from '@/components/sky-feedback';
import { SkyPortableExport } from '@/components/sky-portable-export';
import styles from './sky-add-zoom-prototype.module.css';

type JobSummary = Pick<WorkJob, 'id' | 'title' | 'revision' | 'status' | 'updatedAt'>;

/** The server chooses the owner. A saved ID is never an authorization token. */
export function SkySavedAppJobs() {
  const [jobs, setJobs] = useState<JobSummary[]>([]), [selected, setSelected] = useState<WorkJob | null>(null);
  const [addDecision, setAddDecision] = useState<SkyPrivateAgentAddDecision | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [unknown, setUnknown] = useState(false);
  const [success, setSuccess] = useState('');
  const active = useRef(false);
  async function call<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: 'no-store', ...init });
    if (!response.ok) throw new Error(response.status === 401 ? '本人のサインインが必要です。'
      : response.status === 404 ? '本人用の保存先または仕事が見つかりません。'
        : response.status === 409 ? '仕事かAgentの版が変わりました。再読込してください。'
          : '保存先へ接続できません。後で再読込してください。');
    return response.json() as Promise<T>;
  }
  async function loadList() {
    if (active.current) return;
    active.current = true; setBusy(true); setError(''); setSuccess('');
    try { const value = await call<{ jobs: JobSummary[] }>('/api/sky/app-work'); setJobs(value.jobs); }
    catch (cause) { setError((cause as Error).message); }
    finally { active.current = false; setBusy(false); }
  }
  async function load(id: string) {
    if (active.current) return;
    active.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      const value = await call<{ job: WorkJob; addDecision: SkyPrivateAgentAddDecision | null }>(`/api/sky/app-work?${new URLSearchParams({ jobId: id })}`);
      if (value.job.id !== id || !value.job.skyApp) throw new Error('保存したSky仕事を確認できません。');
      setSelected(value.job); setAddDecision(value.addDecision); setUnknown(false);
    } catch (cause) { setError((cause as Error).message); }
    finally { active.current = false; setBusy(false); }
  }
  async function command(action: 'run' | 'confirm' | 'stop') {
    const current = selected;
    if (!current || active.current || unknown) return;
    active.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      const value = await call<{ job: WorkJob }>('/api/sky/app-work', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, jobId: current.id, revision: current.revision, commandId: crypto.randomUUID() }),
      });
      if (value.job.id !== current.id || value.job.revision <= current.revision) throw new Error('仕事の更新結果を確認できません。');
      setSelected(value.job);
    } catch (cause) { setError((cause as Error).message); setUnknown(true); }
    finally { active.current = false; setBusy(false); }
  }
  async function removeAdd() {
    const current = selected;
    if (!current?.skyApp?.privateAgent || active.current || unknown || addDecision !== 'candidate-only') return;
    active.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      const value = await call<{ removed: boolean }>('/api/sky/private-agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', addId: current.skyApp.privateAgent.id }),
      });
      if (!value.removed) throw new Error('Add解除の結果を確認できません。');
      setAddDecision('add-removed'); setSuccess('Agentの追加を解除しました。保存済みの成果は残ります。');
    } catch (cause) { setError((cause as Error).message); setUnknown(true); }
    finally { active.current = false; setBusy(false); }
  }
  return <section className={styles.work}>
    <h2>保存済みのSky仕事を読戻す</h2>
    <p>本人アカウントの仕事一覧から選びます。タブを閉じても、保存した成果と更新番号を読み直して持ち出せます。</p>
    <button type="button" disabled={busy} onClick={() => void loadList()}>本人の仕事一覧を読む</button>
    {jobs.length > 0 && <ul>{jobs.map((job) => <li key={job.id}>
      <button type="button" disabled={busy} onClick={() => void load(job.id)}>{job.title} — {job.status} — {job.updatedAt}</button>
    </li>)}</ul>}
    {error && <SkyNotice message={error} />}
    {success && <output>{success}</output>}
    {unknown && <p>操作の結果は不明です。同じ操作を重ねず、仕事を読戻してください。</p>}
    {selected && <div className={styles.result} aria-live="polite">
      <SkyWorkProgress job={selected} />
      <p>仕事ID: {selected.id} / 更新番号: {selected.revision}</p>
      {selected.skyApp?.result && <SkyAppResultView binding={selected.skyApp} />}
      <div className={styles.labActions}>
        <button type="button" disabled={busy} onClick={() => void load(selected.id)}>最新状態を読戻す</button>
        <button type="button" disabled={busy || unknown || selected.status !== 'active' || (!!selected.skyApp?.privateAgent && addDecision !== 'candidate-only')} onClick={() => void command('run')}>保存した仕事を実行</button>
        <button type="button" disabled={busy || unknown || selected.status !== 'review'} onClick={() => void command('confirm')}>成果を確認済みにする</button>
        <button type="button" disabled={busy || unknown || !['active', 'review'].includes(selected.status)} onClick={() => void command('stop')}>仕事を停止</button>
        <button type="button" disabled={busy || unknown || !selected.skyApp?.privateAgent || addDecision !== 'candidate-only'}
          onClick={() => void removeAdd()}>Agentの追加を解除</button>
      </div>
      {selected.skyApp?.privateAgent && addDecision !== 'candidate-only' && <p>このAgentの追加は現在使えません。保存済みの成果は読めます。</p>}
      {selected.skyApp?.result && <SkyPortableExport key={`${selected.id}/${selected.revision}`} job={selected} />}
    </div>}
  </section>;
}
