'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { pendingOwnerStatus, isDefinitivePendingSaveFailure } from '@/lib/pending-owner-intent';
import { readOwnerScope, OWNER_SCOPE_HEADER, OWNER_CHANGED, OWNER_CHECK_REQUIRED, OWNER_CHANGED_MESSAGE } from '@/lib/owner-intent';
import { usePendingSaveNavigation } from '@/components/use-pending-save-navigation';
import fixture from '@/contracts/material-invention-fixture.json';
import { canonicalMaterialJson, generateMaterialCandidateGraph, validateMaterialInventionRequest, type MaterialCandidateGraph, type MaterialInventionRequest } from '@/lib/material-invention';
import { MATERIAL_STUDY_MAX_BYTES, readMaterialStudyInput, exportMaterialStudy, restoreMaterialStudy } from '@/lib/material-study';
import type { WorkJob } from '@/lib/workflow';
import styles from './material-invention-workspace.module.css';

type SavedStudy = Pick<WorkJob, 'id' | 'title' | 'status' | 'revision' | 'updatedAt'>;
type Result = { job: WorkJob; graph: MaterialCandidateGraph };
type Pending = { ownerScope: string; url: string; method: 'POST' | 'PATCH'; body: unknown };
const safetyLabels = { BLOCKED: '情報不足・禁止条件あり', REVIEW_REQUIRED: '資格者の確認が必要', SANDBOX_ONLY: '机上候補のみ' };
const errorText = (error: unknown) => error instanceof Error ? error.message : '処理を確認できませんでした。';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function isSavedStudy(value: unknown): value is SavedStudy {
  return record(value) && typeof value.id === 'string' && !!value.id && typeof value.title === 'string' && !!value.title.trim() &&
    Number.isSafeInteger(value.revision) && (value.revision as number) >= 0 &&
    ['active', 'review', 'completed', 'cancelled'].includes(value.status as string) &&
    typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt));
}
async function readStudyResult(value: unknown, id: string, requireGraph: boolean): Promise<Result> {
  if (!record(value) || !isSavedStudy(value.job) || value.job.id !== id)
    throw new Error('保存した候補との対応を確認できません。同じ記録IDを保持しています。');
  const job = value.job as WorkJob;
  // Reuse the saved-input contract and digest check. Only the deterministic
  // local result becomes display state; remote safety labels are never trusted.
  const graph = await restoreMaterialStudy(job);
  if ((requireGraph || value.graph !== undefined) && canonicalMaterialJson(value.graph) !== canonicalMaterialJson(graph))
    throw new Error('候補の応答と保存された入力が一致しません。同じ記録IDで再確認してください。');
  return { job, graph };
}

class MaterialApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
async function fetchSavedStudies(signal?: AbortSignal) {
  const response = await fetch('/api/material-invention', { credentials: 'same-origin', cache: 'no-store', redirect: 'manual', signal });
  if (response.status === 401 || response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) throw new MaterialApiError('保存済みの候補の確認にはサインインが必要です。', 401);
  const data: unknown = await response.json();
  if (!record(data) || !response.ok || !Array.isArray(data.jobs) || !data.jobs.every(isSavedStudy))
    throw new MaterialApiError(record(data) && typeof data.error === 'string' ? data.error : '保存済みの候補を確認できません。', response.status);
  return { jobs: data.jobs, ownerScope: readOwnerScope(data.ownerScope) };
}

type InputBaseline = { title: string; source: string; sample: boolean };
type StudyWorkspace = {
  inputBaseline: InputBaseline;
  owner: string | null; title: string; source: string; sample: boolean;
  graph: MaterialCandidateGraph | null; request: MaterialInventionRequest | null;
  job: WorkJob | null; pending: Pending | null; filter: string; limit: number;
};
const emptyWorkspace = (owner: string | null): StudyWorkspace => ({ owner, title: '', source: '', sample: false,
  inputBaseline: { title: '', source: '', sample: false },
  graph: null, request: null, job: null, pending: null, filter: 'all', limit: 30 });
const dirtyInput = (value: StudyWorkspace) => !!(value.title.trim() || value.source.trim()) &&
  (value.title.trim() !== value.inputBaseline.title.trim() || value.source.trim() !== value.inputBaseline.source.trim() ||
    value.sample !== value.inputBaseline.sample);

export default function MaterialInventionWorkspace() {
  const [workspace, setWorkspace] = useState<StudyWorkspace>(emptyWorkspace(null));
  const { title, source, sample, graph, request, job, pending, filter, limit } = workspace;
  const currentWorkspace = useRef(workspace);
  const workspaces = useRef(new Map<string | null, StudyWorkspace>());
  const currentOwner = useRef<string | null>(null);
  const [jobs, setJobs] = useState<SavedStudy[]>([]);
  const [message, setMessage] = useState('');
  const [storageMessage, setStorageMessage] = useState('保存済みの候補を確認しています。');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [previewRunning, setPreviewRunning] = useState(false);
  const [needsSignin, setNeedsSignin] = useState(false);
  const [ownerScope, setOwnerScope] = useState<string | null>(null);
  const [parkedPending, setParkedPending] = useState(false);
  const [parkedDirty, setParkedDirty] = useState(false);
  const generation = useRef(0);
  const storageGeneration = useRef(0);
  const mounted = useRef(true);
  const active = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = busy || pending !== null;
  const dirty = dirtyInput(workspace);
  usePendingSaveNavigation(pending !== null || parkedPending || dirty || parkedDirty);

  function updateWorkspace(patch: Partial<StudyWorkspace>) {
    const next = { ...currentWorkspace.current, ...patch };
    currentWorkspace.current = next; setWorkspace(next);
  }
  function sameWorkspace() {
    return mounted.current && currentWorkspace.current.owner === workspace.owner && currentOwner.current === workspace.owner;
  }
  function showIdentity(scope: string | null, saved: SavedStudy[] = []) {
    if (currentOwner.current !== scope) {
      const previous = currentWorkspace.current;
      workspaces.current.set(previous.owner, previous);
      // A browser-only draft may join its first confirmed account. A draft
      // already bound to an account is never copied to another account.
      const saved = workspaces.current.get(scope);
      const adoptAnonymous = previous.owner === null && scope !== null &&
        (!saved || (!saved.source && !saved.title && !saved.job && !saved.pending));
      const next = adoptAnonymous ? { ...previous, owner: scope } : saved ?? emptyWorkspace(scope);
      if (adoptAnonymous) workspaces.current.delete(null);
      currentWorkspace.current = next; setWorkspace(next);
      currentOwner.current = scope;
      storageGeneration.current++; generation.current++; active.current?.abort(); active.current = null;
      busyRef.current = false; setBusy(false); setPreviewRunning(false); setMessage('');
      setParkedPending([...workspaces.current.entries()].some(([owner, draft]) => owner !== scope && draft.pending !== null));
      setParkedDirty([...workspaces.current.entries()].some(([owner, draft]) => owner !== scope && dirtyInput(draft)));
    }
    setOwnerScope(scope); setJobs(scope ? saved : []);
  }
  function loseStorageAccess() {
    storageGeneration.current++;
    showIdentity(null); setNeedsSignin(true);
  }
  async function list(signal?: AbortSignal) {
    const version = ++storageGeneration.current;
    try {
      const saved = await fetchSavedStudies(signal);
      if (mounted.current && !signal?.aborted && version === storageGeneration.current) {
        showIdentity(saved.ownerScope, saved.jobs); setNeedsSignin(false);
        setStorageMessage(saved.ownerScope ? 'サインイン中の本人が保存した候補です。' : OWNER_CHECK_REQUIRED);
      }
    } catch (error) {
      if (mounted.current && !signal?.aborted && version === storageGeneration.current) {
        showIdentity(null); setStorageMessage(errorText(error));
        if (error instanceof MaterialApiError && error.status === 401) loseStorageAccess();
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    const mountedRef = mounted, generationRef = generation, activeRef = active;
    const controller = new AbortController();
    const version = ++storageGeneration.current;
    void fetchSavedStudies(controller.signal).then((saved) => {
      if (!controller.signal.aborted && version === storageGeneration.current) {
        showIdentity(saved.ownerScope, saved.jobs); setNeedsSignin(false);
        setStorageMessage(saved.ownerScope ? 'サインイン中の本人が保存した候補です。' : OWNER_CHECK_REQUIRED);
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && version === storageGeneration.current) {
        showIdentity(null); setStorageMessage(errorText(error));
        if (error instanceof MaterialApiError && error.status === 401) loseStorageAccess();
      }
    });
    return () => { mountedRef.current = false; generationRef.current++; controller.abort(); activeRef.current?.abort(); };
  }, []);

  function begin(allowPending = false) {
    if (!sameWorkspace() || busyRef.current || (!allowPending && currentWorkspace.current.pending)) return null;
    busyRef.current = true; setBusy(true); setMessage('');
    return ++generation.current;
  }
  function isCurrent(version: number) {
    return sameWorkspace() && version === generation.current;
  }
  function finish(version: number) {
    if (isCurrent(version)) { busyRef.current = false; setBusy(false); setPreviewRunning(false); active.current = null; }
  }
  function setTitle(value: string) { if (sameWorkspace() && !busyRef.current && !currentWorkspace.current.pending) updateWorkspace({ title: value }); }
  function discardInput() {
    if (!sameWorkspace() || currentWorkspace.current !== workspace || busyRef.current || currentWorkspace.current.pending) return;
    generation.current++;
    updateWorkspace(emptyWorkspace(workspace.owner));
    setMessage('この画面の未保存入力を破棄しました。保存済みの仕事は履歴に残っています。');
  }
  function setFilter(value: string) { if (sameWorkspace()) updateWorkspace({ filter: value }); }
  function setLimit(value: number) { if (sameWorkspace()) updateWorkspace({ limit: value }); }
  function reset(value: string, isSample: boolean, nextTitle = title) {
    if (!sameWorkspace() || busyRef.current || currentWorkspace.current.pending) return;
    generation.current++;
    updateWorkspace({ source: value, sample: isSample, title: nextTitle, graph: null, request: null, job: null, limit: 30, filter: 'all' });
    setMessage('');
  }
  async function preview() {
    const version = begin(); if (version === null) return;
    setPreviewRunning(true); updateWorkspace({ graph: null, job: null });
    try {
      if (new TextEncoder().encode(source).length > MATERIAL_STUDY_MAX_BYTES - 1000) throw new Error('入力JSONは47 KB以内にしてください。');
      const normalized = validateMaterialInventionRequest(JSON.parse(source));
      const next = await generateMaterialCandidateGraph(normalized);
      if (isCurrent(version)) updateWorkspace({ graph: next, request: normalized, limit: 30 });
    } catch (error) { if (isCurrent(version)) setMessage(errorText(error)); }
    finally { finish(version); }
  }
  function stopPreview() {
    if (!sameWorkspace() || !previewRunning) return;
    generation.current++; busyRef.current = false; setBusy(false); setPreviewRunning(false);
    setMessage('候補生成を停止しました。入力は保持しています。');
  }
  async function loadFile(file?: File) {
    if (!file) return;
    const version = begin(); if (version === null) return;
    try {
      if (file.size > 8_000_000) throw new Error('候補ファイルは8 MB以内にしてください。');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const imported = readMaterialStudyInput(JSON.parse(text));
      const normalized = JSON.stringify(imported.request, null, 2);
      if (new TextEncoder().encode(normalized).length > MATERIAL_STUDY_MAX_BYTES - 1000) throw new Error('入力JSONは47 KB以内にしてください。');
      if (isCurrent(version)) updateWorkspace({ source: normalized, sample: imported.sample, title: '', graph: null, request: null, job: null, limit: 30, filter: 'all' });
    } catch (error) { if (isCurrent(version)) setMessage(errorText(error)); }
    finally { finish(version); }
  }
  async function mutate(operation: Pending, retry = false) {
    if (retry ? currentWorkspace.current.pending !== operation : currentWorkspace.current.pending !== null) return;
    if (!sameWorkspace() || currentOwner.current !== operation.ownerScope || !readOwnerScope(operation.ownerScope)) return;
    const version = begin(true); if (version === null) return;
    // Capture the original intent synchronously: two handlers in the same frame
    // cannot install different IDs, and account changes park this exact payload.
    updateWorkspace({ pending: operation });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    active.current = controller; storageGeneration.current++;
    try {
      const identity = await fetchSavedStudies(controller.signal);
      if (!isCurrent(version)) return;
      const ownerStatus = pendingOwnerStatus(operation.ownerScope, identity.ownerScope);
      if (ownerStatus !== 'matching') {
        showIdentity(identity.ownerScope, identity.jobs);
        setStorageMessage(ownerStatus === 'unknown' ? OWNER_CHECK_REQUIRED : OWNER_CHANGED_MESSAGE); return;
      }
      const response = await fetch(operation.url, { method: operation.method, credentials: 'same-origin', cache: 'no-store', redirect: 'manual', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: operation.ownerScope }, body: JSON.stringify(operation.body) });
      if (!isCurrent(version)) return;
      if (response.status === 401 || response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        loseStorageAccess(); setStorageMessage('保存の確認にはサインインが必要です。元のアカウントの記録IDを保持しています。'); return;
      }
      const raw: unknown = await response.json();
      const data = record(raw) ? raw : {};
      if (!isCurrent(version)) return;
      if (!response.ok || !data.job) {
        if (data.code === OWNER_CHANGED) { showIdentity(null); setStorageMessage(OWNER_CHANGED_MESSAGE); return; }
        // Only a complete refusal can end an uncertain write. A truncated error
        // envelope may have represented an account change or a committed write.
        if (typeof data.error === 'string' && data.error.trim() && (data.code === undefined || typeof data.code === 'string') &&
          isDefinitivePendingSaveFailure(response.status, data.code)) updateWorkspace({ pending: null });
        throw new Error(typeof data.error === 'string' ? data.error : '保存状態を確認できません。同じ操作を再試行してください。');
      }
      const target = operation.body as { id: string; jobId: string; title: string; sample: boolean; request: MaterialInventionRequest;
        revision: number; command: { id: string; action: string } };
      const result = await readStudyResult(data, operation.method === 'POST' ? target.id : target.jobId, operation.method === 'POST');
      if (!isCurrent(version)) return;
      const previous = currentWorkspace.current;
      const expectedRequest = operation.method === 'POST' ? target.request : previous.request;
      if (result.job.title !== (operation.method === 'POST' ? target.title.trim() : previous.job?.title) ||
        result.job.materialStudy?.sample !== (operation.method === 'POST' ? target.sample : previous.sample) ||
        canonicalMaterialJson(result.job.materialStudy?.request) !== canonicalMaterialJson(expectedRequest))
        throw new Error('保存した入力との対応を確認できません。同じ記録IDを保持しています。');
      if (operation.method === 'PATCH' && (result.job.revision <= target.revision || !Array.isArray(result.job.events) ||
        !result.job.events.some(event => record(event) && canonicalMaterialJson(event.command) === canonicalMaterialJson(target.command))))
        throw new Error('操作の保存を確認できません。同じ操作IDで再試行してください。');
      updateWorkspace({ job: result.job, graph: result.graph, pending: null,
        inputBaseline: { title: previous.title, source: previous.source, sample: previous.sample } });
      setNeedsSignin(false);
      setMessage(operation.method === 'POST' ? '入力と候補を本人の仕事として保存しました。' : '仕事の状態を保存しました。');
      void list();
    } catch (error) {
      if (isCurrent(version)) {
        if (error instanceof MaterialApiError && error.status === 401) { loseStorageAccess(); setStorageMessage(errorText(error)); }
        else setMessage(controller.signal.aborted ? '応答を確認できません。同じ記録IDで再試行してください。' : errorText(error));
      }
    } finally { clearTimeout(timeout); finish(version); }
  }
  async function open(id: string) {
    if (!ownerScope || currentOwner.current !== ownerScope) return;
    const version = begin(); if (version === null) return;
    const controller = new AbortController(); active.current = controller;
    try {
      const response = await fetch(`/api/material-invention?id=${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store', redirect: 'manual', signal: controller.signal });
      if (!isCurrent(version)) return;
      if (response.status === 401 || response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        loseStorageAccess(); setStorageMessage('保存候補の確認にはサインインが必要です。'); return;
      }
      const data: unknown = await response.json();
      if (!isCurrent(version)) return;
      if (!response.ok) throw new Error(record(data) && typeof data.error === 'string' ? data.error : '保存候補を復元できません。');
      const result = await readStudyResult(data, id, true);
      if (!isCurrent(version)) return;
      const saved = result.job.materialStudy!;
      updateWorkspace({ source: JSON.stringify(saved.request, null, 2), sample: saved.sample, title: result.job.title,
        request: saved.request, graph: result.graph, job: result.job, limit: 30, filter: 'all',
        inputBaseline: { source: JSON.stringify(saved.request, null, 2), title: result.job.title, sample: saved.sample } });
      setMessage('保存した入力のdigestを照合し、同じ候補を再生成しました。');
    } catch (error) { if (isCurrent(version)) setMessage(errorText(error)); }
    finally { finish(version); }
  }
  function command(action: 'complete' | 'cancel') {
    if (!sameWorkspace() || !job || !ownerScope) return;
    void mutate({ ownerScope, url: '/api/work-jobs', method: 'PATCH', body: { jobId: job.id, revision: job.revision,
      command: { id: crypto.randomUUID(), action, ...(action === 'complete' ? { note: '机上の配合候補と不足条件を確認。実験・性能・安全・特許性の承認ではない。' } : {}) } } });
  }
  function releasePending() {
    if (!sameWorkspace() || busyRef.current || !pending || pending !== currentWorkspace.current.pending || pending.ownerScope !== currentOwner.current) return;
    updateWorkspace({ pending: null, job: null });
    setMessage('保留を解除しました。以前の保存が完了している可能性があります。履歴で結果を確認してから新しく保存してください。');
  }
  function download() {
    if (!sameWorkspace() || !request || !graph) return;
    const content = exportMaterialStudy(request, graph, sample, job);
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'material-study.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filtered = graph?.candidates.filter((candidate) => filter === 'all' || candidate.safety.status === filter) ?? [];
  const names = new Map(request?.materials.map((material) => [material.id, material.name]));
  return <section className={styles.panel} aria-label="物質候補の机上比較">
    <header><p className={styles.eyebrow}>MATERIAL INVENTION / SANDBOX</p><h2>組合せを比べ、根拠を残す。</h2><p>物質の由来・lot・配合比・工程から候補を作ります。すべて未検証の仮説です。実験、化学simulation、装置操作は行いません。</p></header>
    <div className={styles.layout}>
      <section className={styles.editor} aria-label="候補の入力">
        <div className={styles.actions}><button disabled={locked} onClick={() => reset(JSON.stringify(fixture, null, 2), true, '合成データの机上比較')}>合成サンプルを開く</button><button disabled={locked} onClick={() => fileInput.current?.click()}>入力JSONを読み込む</button><button disabled={locked} onClick={() => reset('', false, '')}>新しい入力</button></div>
        <input className={styles.hidden} ref={fileInput} type="file" accept=".json,application/json" aria-label="物質入力JSONファイル" onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = ''; }} />
        <label>仕事の名前<input value={title} maxLength={120} disabled={locked || !!job} onChange={(event) => setTitle(event.target.value)} placeholder="例：シート用の配合候補" /></label>
        <label>物質・比率・工程のJSON<textarea value={source} disabled={locked} spellCheck={false} autoComplete="off" onChange={(event) => reset(event.target.value, sample)} placeholder="入力JSONを貼り付けるか、合成サンプルを開いてください" /></label>
        <p className={styles.note}>2〜16物質・比率1〜19件。由来、lot、SDS参照、危険分類を含めます。欠損・禁止条件は候補の警告に残ります。</p>
        {sample && <p className={styles.boundary}>合成サンプルです。編集後も実材料の検証記録にはなりません。</p>}
        <div className={styles.actions}><button className={styles.primary} disabled={locked || !source.trim()} onClick={() => void preview()}>この端末で候補を生成</button>{previewRunning && <button onClick={stopPreview}>候補生成を停止</button>}</div>
        <p className={styles.note}>候補生成はブラウザ内で行います。「入力と候補を保存」を押すと、入力本文を本人用のサーバー保存へ送信します。外部AI・ラボへは送りません。</p>
      </section>
      <section aria-label="候補の結果" className={styles.results}>
        <div className={styles.actions}><h3>比較結果</h3>{graph && <span>{graph.candidates.length}候補 / HYPOTHESIS</span>}</div>
        {!graph ? <p className={styles.empty}>{busy ? '処理を確認しています…' : '入力を検査して候補を生成すると、比率と不足条件がここに並びます。'}</p> : <>
          <p className={styles.boundary}>全候補で物理実行は禁止です。「机上候補のみ」も安全性や性能の証明ではありません。</p>
          <label>安全条件で絞り込む<select value={filter} onChange={(event) => { setFilter(event.target.value); setLimit(30); }}><option value="all">すべて</option>{Object.entries(safetyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className={styles.candidates}>{filtered.slice(0, limit).map((candidate) => <article key={candidate.id} className={styles.candidate}>
            <strong>{candidate.components.map((part) => `${names.get(part.materialId) ?? part.materialId} ${part.percent}%`).join(' + ')}</strong>
            <p>{safetyLabels[candidate.safety.status]} <code>{candidate.safety.status}</code></p>
            <p className={styles.note}>基準：{candidate.components[0].unit} / 工程 v{candidate.processVersion}</p>
            {[...candidate.safety.blockers, ...candidate.safety.reviewRequired].map((finding, index) => <p className={styles.finding} key={`${finding.code}-${index}`}>{finding.message}（{finding.subjectId}）</p>)}
            <details><summary>候補ID・由来</summary><code>{candidate.id}</code>{candidate.components.map((part) => <p key={part.materialId}>{names.get(part.materialId)} / lot: {part.sourceLot}</p>)}<p>生成：決定的sandbox / 証拠：仮説</p></details>
          </article>)}</div>
          {filtered.length === 0 && <p>この条件の候補はありません。</p>}
          {filtered.length > limit && <button onClick={() => setLimit(limit + 30)}>次の30候補を表示</button>}
          <details className={styles.provenance}><summary>入力・版・再現情報</summary><p>{request?.goal.title}</p><code>{graph.contract}</code><p>入力SHA-256</p><code>{graph.requestDigest}</code>{request?.materials.map((material) => <p key={material.id}>{material.name}：{material.source} / lot {material.lot} / SDS {material.sdsRef || 'なし'}</p>)}<p>工程：{request?.process.id} / v{request?.process.version}</p></details>
          <div className={styles.actions}><button onClick={download}>入力を含むJSONを保存</button>{!job && <button className={styles.primary} disabled={locked || !title.trim() || !ownerScope} onClick={() => ownerScope && void mutate({ ownerScope, url: '/api/material-invention', method: 'POST', body: { id: crypto.randomUUID(), title, request, sample } })}>入力と候補を本人用に保存</button>}{job?.status === 'review' && <button disabled={locked || !ownerScope} onClick={() => command('complete')}>結果・不足条件を確認済みにする</button>}{job && ['active', 'review'].includes(job.status) && <button disabled={locked || !ownerScope} onClick={() => command('cancel')}>仕事を終了する</button>}</div>
          {job && <p className={styles.note}>保存済みの仕事：{job.status === 'completed' ? '確認済み' : job.status === 'cancelled' ? '終了' : job.status === 'review' ? '確認待ち' : 'サンプル確認中'} / revision {job.revision}。候補の安全状態は変わりません。</p>}
        </>}
      </section>
    </div>
    {!ownerScope && !needsSignin && <output>{OWNER_CHECK_REQUIRED}</output>}
    {message && <output className={styles.message}>{message}</output>}
    {pending && !busy && <div className={styles.boundary}><p>保存結果が不明です。最初のアカウントで同じ記録IDを確認します。別アカウントには再送しません。</p><p>{pendingOwnerStatus(pending.ownerScope, ownerScope) === 'changed' ? OWNER_CHANGED_MESSAGE : '元のアカウントで接続を確認してください。'}</p><p>保留を解除しても保存済み記録は削除されません。元のアカウントで保存結果を確認してから新しく保存してください。入力本文は残ります。</p><button disabled={!ownerScope || pending.ownerScope !== ownerScope} onClick={releasePending}>保留を解除（入力は保持）</button><button disabled={pendingOwnerStatus(pending.ownerScope, ownerScope) === 'changed'} onClick={() => void mutate(pending, true)}>同じ操作を再試行</button></div>}
    {dirty && !pending && <div className={styles.boundary}><p>未保存の入力があります。画面を離れる前に本人用の保存を確認するか、入力を明示的に破棄してください。</p><button disabled={locked} onClick={discardInput}>未保存の入力を破棄</button></div>}
    {parkedDirty && <p className={styles.boundary}>別のアカウントの未保存入力を失わないよう、画面移動を止めています。元のアカウントでサインインし、一覧を再読込して保存または破棄してください。</p>}
    {parkedPending && <p className={styles.boundary}>別のアカウントで保存結果が不明な候補を保持しています。元のアカウントでサインインし、一覧を再読込すると同じ記録IDで確認できます。このアカウントには入力や候補を引き継ぎません。</p>}
    {(needsSignin || pending || parkedPending) && <p className={styles.note}><Link prefetch={false} href="/signin-with-chatgpt?return_to=%2Fzema%2Ftools%2Frockstar-material-invention" target="_blank" rel="noopener noreferrer">サインインして保存を使う</Link>。別タブでサインイン後、この画面で再確認してください。入力を含むJSONは手元へ保存できます。読み込み時は候補と承認を引き継がず、入力から再生成します。</p>}
    <section className={styles.saved} aria-label="保存した物質候補"><h3>保存した仕事</h3><p className={styles.note}>{storageMessage}</p><button disabled={busy} onClick={() => void list()}>一覧を再読込</button>{jobs.length === 0 ? <p className={styles.note}>保存済みの候補はまだ表示されていません。</p> : <ul>{jobs.map((item) => <li key={item.id}><button disabled={locked} onClick={() => void open(item.id)}>{item.title}</button><span>{item.status} / {new Date(item.updatedAt).toLocaleString()}</span></li>)}</ul>}</section>
  </section>;
}
