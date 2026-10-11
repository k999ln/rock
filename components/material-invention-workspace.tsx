'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import fixture from '@/contracts/material-invention-fixture.json';
import { generateMaterialCandidateGraph, validateMaterialInventionRequest, type MaterialCandidateGraph, type MaterialInventionRequest } from '@/lib/material-invention';
import { MATERIAL_STUDY_MAX_BYTES, readMaterialStudyInput, exportMaterialStudy } from '@/lib/material-study';
import type { WorkJob } from '@/lib/workflow';
import styles from './material-invention-workspace.module.css';

type SavedStudy = Pick<WorkJob, 'id' | 'title' | 'status' | 'revision' | 'updatedAt'>;
type Result = { job: WorkJob; graph: MaterialCandidateGraph };
type Pending = { url: string; method: 'POST' | 'PATCH'; body: unknown };
const safetyLabels = { BLOCKED: '情報不足・禁止条件あり', REVIEW_REQUIRED: '資格者の確認が必要', SANDBOX_ONLY: '机上候補のみ' };
const errorText = (error: unknown) => error instanceof Error ? error.message : '処理を確認できませんでした。';
class MaterialApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
async function fetchSavedStudies(signal?: AbortSignal) {
  const response = await fetch('/api/material-invention', { credentials: 'same-origin', cache: 'no-store', signal });
  const data = await response.json() as { jobs?: SavedStudy[]; error?: string };
  if (!response.ok || !Array.isArray(data.jobs)) throw new MaterialApiError(data.error || '保存済みの候補を確認できません。', response.status);
  return data.jobs;
}

export default function MaterialInventionWorkspace() {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [sample, setSample] = useState(false);
  const [graph, setGraph] = useState<MaterialCandidateGraph | null>(null);
  const [request, setRequest] = useState<MaterialInventionRequest | null>(null);
  const [job, setJob] = useState<WorkJob | null>(null);
  const [jobs, setJobs] = useState<SavedStudy[]>([]);
  const [message, setMessage] = useState('');
  const [storageMessage, setStorageMessage] = useState('保存済みの候補を確認しています。');
  const [busy, setBusy] = useState(false);
  const [previewRunning, setPreviewRunning] = useState(false);
  const [needsSignin, setNeedsSignin] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(30);
  const generation = useRef(0);
  const mounted = useRef(true);
  const active = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = busy || pending !== null;

  async function list(signal?: AbortSignal) {
    try {
      const saved = await fetchSavedStudies(signal);
      if (mounted.current && !signal?.aborted) { setJobs(saved); setNeedsSignin(false); setStorageMessage('サインイン中の本人が保存した候補です。'); }
    } catch (error) {
      if (mounted.current && !signal?.aborted) { setStorageMessage(errorText(error)); setNeedsSignin(error instanceof MaterialApiError && error.status === 401); }
    }
  }
  useEffect(() => {
    mounted.current = true;
    const mountedRef = mounted, generationRef = generation, activeRef = active;
    const controller = new AbortController();
    void fetchSavedStudies(controller.signal).then((saved) => {
      if (!controller.signal.aborted) { setJobs(saved); setNeedsSignin(false); setStorageMessage('サインイン中の本人が保存した候補です。'); }
    }).catch((error: unknown) => { if (!controller.signal.aborted) { setStorageMessage(errorText(error)); setNeedsSignin(error instanceof MaterialApiError && error.status === 401); } });
    return () => { mountedRef.current = false; generationRef.current++; controller.abort(); activeRef.current?.abort(); };
  }, []);

  function reset(value: string, isSample: boolean, nextTitle = title) {
    generation.current++;
    setSource(value); setSample(isSample); setTitle(nextTitle);
    setGraph(null); setRequest(null); setJob(null); setMessage(''); setLimit(30); setFilter('all');
  }
  async function preview() {
    const current = ++generation.current;
    setBusy(true); setPreviewRunning(true); setMessage(''); setGraph(null); setJob(null);
    try {
      if (new TextEncoder().encode(source).length > MATERIAL_STUDY_MAX_BYTES - 1000) throw new Error('入力JSONは47 KB以内にしてください。');
      const normalized = validateMaterialInventionRequest(JSON.parse(source));
      const next = await generateMaterialCandidateGraph(normalized);
      if (mounted.current && current === generation.current) { setGraph(next); setRequest(normalized); setLimit(30); }
    } catch (error) {
      if (mounted.current && current === generation.current) setMessage(errorText(error));
    } finally { if (mounted.current && current === generation.current) { setBusy(false); setPreviewRunning(false); } }
  }
  async function loadFile(file?: File) {
    if (!file) return;
    const current = ++generation.current;
    setBusy(true);
    try {
      if (file.size > 8_000_000) throw new Error('候補ファイルは8 MB以内にしてください。');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const imported = readMaterialStudyInput(JSON.parse(text));
      const normalized = JSON.stringify(imported.request, null, 2);
      if (new TextEncoder().encode(normalized).length > MATERIAL_STUDY_MAX_BYTES - 1000) throw new Error('入力JSONは47 KB以内にしてください。');
      if (mounted.current && generation.current === current) reset(normalized, imported.sample, '');
    } catch (error) { if (mounted.current && generation.current === current) setMessage(errorText(error)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function mutate(operation: Pending) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    active.current = controller;
    setPending(operation); setBusy(true); setMessage('');
    try {
      const response = await fetch(operation.url, { method: operation.method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation.body) });
      const data = await response.json() as Partial<Result> & { error?: string };
      if (!mounted.current) return;
      if (!response.ok || !data.job) {
        if (response.status === 401) setNeedsSignin(true);
        // Only a confirmed client rejection releases the retry identity.
        if (response.status < 500) setPending(null);
        throw new Error(data.error || '保存状態を確認できません。同じ操作を再試行してください。');
      }
      setJob(data.job);
      if (data.graph) setGraph(data.graph);
      setPending(null);
      setMessage(operation.method === 'POST' ? '入力と候補を本人の仕事として保存しました。' : '仕事の状態を保存しました。');
      void list();
    } catch (error) { if (mounted.current) setMessage(controller.signal.aborted ? '応答を確認できません。同じ記録IDで再試行してください。' : errorText(error)); }
    finally { clearTimeout(timeout); if (mounted.current) setBusy(false); }
  }
  async function open(id: string) {
    setBusy(true); setMessage('');
    const controller = new AbortController(); active.current = controller;
    try {
      const response = await fetch(`/api/material-invention?id=${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      const data = await response.json() as Partial<Result> & { error?: string };
      if (!response.ok || !data.job?.materialStudy || !data.graph) throw new Error(data.error || '保存候補を復元できません。');
      if (!mounted.current) return;
      const saved = data.job.materialStudy;
      reset(JSON.stringify(saved.request, null, 2), saved.sample, data.job.title);
      setRequest(saved.request); setGraph(data.graph); setJob(data.job);
      setMessage('保存した入力のdigestを照合し、同じ候補を再生成しました。');
    } catch (error) { if (mounted.current) setMessage(errorText(error)); }
    finally { if (mounted.current) setBusy(false); }
  }
  function command(action: 'complete' | 'cancel') {
    if (!job) return;
    void mutate({ url: '/api/work-jobs', method: 'PATCH', body: { jobId: job.id, revision: job.revision,
      command: { id: crypto.randomUUID(), action, ...(action === 'complete' ? { note: '机上の配合候補と不足条件を確認。実験・性能・安全・特許性の承認ではない。' } : {}) } } });
  }
  function download() {
    if (!request || !graph) return;
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
        <div className={styles.actions}><button className={styles.primary} disabled={locked || !source.trim()} onClick={() => void preview()}>この端末で候補を生成</button>{previewRunning && <button onClick={() => { generation.current++; setBusy(false); setPreviewRunning(false); setMessage('候補生成を停止しました。入力は保持しています。'); }}>候補生成を停止</button>}</div>
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
          <div className={styles.actions}><button onClick={download}>入力を含むJSONを保存</button>{!job && <button className={styles.primary} disabled={locked || !title.trim()} onClick={() => void mutate({ url: '/api/material-invention', method: 'POST', body: { id: crypto.randomUUID(), title, request, sample } })}>入力と候補を本人用に保存</button>}{job?.status === 'review' && <button disabled={locked} onClick={() => command('complete')}>結果・不足条件を確認済みにする</button>}{job && ['active', 'review'].includes(job.status) && <button disabled={locked} onClick={() => command('cancel')}>仕事を終了する</button>}</div>
          {job && <p className={styles.note}>保存済みの仕事：{job.status === 'completed' ? '確認済み' : job.status === 'cancelled' ? '終了' : job.status === 'review' ? '確認待ち' : 'サンプル確認中'} / revision {job.revision}。候補の安全状態は変わりません。</p>}
        </>}
      </section>
    </div>
    {message && <output className={styles.message}>{message}</output>}
    {pending && !busy && <div className={styles.boundary}><p>保存結果が不明です。入力を変えず、同じ記録IDで照合・再試行します。</p><button onClick={() => void mutate(pending)}>同じ操作を再試行</button></div>}
    {needsSignin && !pending && <p className={styles.note}><Link prefetch={false} href="/signin-with-chatgpt?return_to=%2Fzema%2Ftools%2Frockstar-material-invention" target="_top">サインインして保存を使う</Link>。画面を移る前に、入力を含むJSONを手元へ保存できます。読み込み時は候補と承認を引き継がず、入力から再生成します。</p>}
    <section className={styles.saved} aria-label="保存した物質候補"><h3>保存した仕事</h3><p className={styles.note}>{storageMessage}</p><button disabled={locked} onClick={() => void list()}>一覧を再読込</button>{jobs.length === 0 ? <p className={styles.note}>保存済みの候補はまだ表示されていません。</p> : <ul>{jobs.map((item) => <li key={item.id}><button disabled={locked} onClick={() => void open(item.id)}>{item.title}</button><span>{item.status} / {new Date(item.updatedAt).toLocaleString()}</span></li>)}</ul>}</section>
  </section>;
}
