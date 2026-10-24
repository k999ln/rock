'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Check, Download, Play, Plus, RefreshCw } from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import { ExecutionSignin, useExecutionAccess } from '@/components/execution-access';
import { useOwnerMemoryState } from '@/components/use-owner-memory-state';
import { usePendingSaveNavigation } from '@/components/use-pending-save-navigation';
import { operationRequest, OperationRequestError, OperationResponseError } from '@/lib/operations-client';
import { isDefinitivePendingSaveFailure } from '@/lib/pending-owner-intent';
import { OWNER_CHANGED, OWNER_CHANGED_MESSAGE, OWNER_SCOPE_HEADER, readOwnerScope } from '@/lib/owner-intent';
import { readWorkJobResponse, readWorkJobs } from '@/lib/work-job-view';
import type { WorkJob } from '@/lib/workflow';
import { readCompositionRecipes as readRecipes, compositionPayloadFingerprint, compositionResponseConfirms, compositionSaveMessage, readCompositionToolEntry, type CompositionRecipeView as Recipe } from '@/lib/work-composition-view';
import {
  capabilityFor, compositionCapabilities, defaultCompositionConfig, parseCompositionPlan,
  runnableCompositionNodes, suggestComposition, COMPOSITION_TEXT_LIMIT,
  type CompositionPlan, type MaterialKind,
} from '@/lib/work-composition';
import { prepareEveTextJob, decodeEveTextMaterial, isEveTextPlan, type EveTextMaterial } from '@/lib/eve-text-job';
import styles from './work-composition-workspace.module.css';

type EditableNode = { id: string; tool: string; inputs: string[]; configText: string };
type Draft = {
  objective: string; acceptance: string; inputKind: MaterialKind; source: string; deadline: string;
  budgetMinor: number; currency: 'JPY' | 'USD'; dirty: boolean;
  nodes: EditableNode[]; consent: boolean; recipeName: string; completeNote: string;
  recipeRef: { id: string; revision: number } | null;
  originJobId?: string;
};
type ArtifactEditor = {
  original: string; text: string; kind: MaterialKind; objective: string; acceptance: string;
  minChars: string; requiredText: string; originalRevision: number; dirty: boolean;
};
type WorkspaceMemory = { selected: string; drafts: Record<string, Draft>; editors: Record<string, ArtifactEditor>; openedEditor: string };
type Pending = { owner: string; path: string; method: string; payload: Record<string, unknown>; selected: string; transfer?: Draft; editorKey?: string };
const draftKey = (id: string) => id || 'new';
const subscribeLocation = (listener: () => void) => { window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); };
const browserLocation = () => window.location.search;
const serverLocation = () => '';
function editableNodes(plan: CompositionPlan): EditableNode[] {
  return plan.nodes.map((node) => ({ ...node, inputs: [...node.inputs], configText: JSON.stringify(node.config, null, 2) }));
}
function blankDraft(): Draft {
  return { objective: '', acceptance: '', inputKind: 'text', source: '', deadline: '',
    nodes: editableNodes(suggestComposition('出典を整理する', 'text')), consent: false,
    recipeName: '', completeNote: '', recipeRef: null, budgetMinor: 0, currency: 'JPY', dirty: false };
}
function jobDraft(job: WorkJob): Draft {
  const plan = job.composition!.plan;
  return { ...blankDraft(), objective: plan.objective, acceptance: plan.acceptance,
    inputKind: plan.inputKind, deadline: plan.deadline, budgetMinor: plan.budgetMinor, currency: plan.currency, source: job.composition!.source ?? '', nodes: editableNodes(plan) };
}
function planFromDraft(draft: Draft): CompositionPlan {
  return parseCompositionPlan({ version: 1, objective: draft.objective, acceptance: draft.acceptance,
    inputKind: draft.inputKind, budgetMinor: draft.budgetMinor, currency: draft.currency, deadline: draft.deadline,
    nodes: draft.nodes.map(({ configText, ...node }) => ({ ...node, config: JSON.parse(configText) as unknown })) });
}

function StepConfiguration({ node, update }: { node: EditableNode; update: (change: Partial<EditableNode>) => void }) {
  let config: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(node.configText);
    config = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { config = {}; }
  const change = (values: Record<string, unknown>) => update({ configText: JSON.stringify({ ...config, ...values }, null, 2) });
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const lines = (value: string) => value ? value.split('\n') : [];
  return <>
    {node.tool === 'compose-check' && <>
      <label htmlFor={`check-min-${node.id}`}>最低文字数</label><input id={`check-min-${node.id}`} type="number" min={1} max={COMPOSITION_TEXT_LIMIT} value={typeof config.minChars === 'number' ? config.minChars : 1} onChange={(event) => change({ minChars: Number(event.target.value) })} />
      <label htmlFor={`check-required-${node.id}`}>成果に必要な文言（1行に1つ、任意）</label><textarea id={`check-required-${node.id}`} rows={2} value={strings(config.requiredText).join('\n')} onChange={(event) => change({ requiredText: lines(event.target.value) })} />
    </>}
    {node.tool === 'mr-free-article' && <>
      <div className={styles.columns}><div><label htmlFor={`article-length-${node.id}`}>無料で見せる文字数</label><input id={`article-length-${node.id}`} type="number" min={1} value={typeof config.afterChars === 'number' ? config.afterChars : 100} onChange={(event) => change({ afterChars: Number(event.target.value) })} /></div>
        <div><label htmlFor={`article-price-${node.id}`}>記事に記載する価格（円）</label><input id={`article-price-${node.id}`} type="number" min={1} value={typeof config.price === 'number' ? config.price : 500} onChange={(event) => change({ price: Number(event.target.value) })} /></div></div>
      <p className={styles.note}>本文の紹介用表記です。この処理では販売・課金しません。</p>
      {([['summary', '紹介の要点'], ['paidContents', '続きの内容'], ['noteUrl', '販売先URL']] as const).map(([key, label]) => <div key={key}><label htmlFor={`article-${key}-${node.id}`}>{label}</label>{key === 'noteUrl' ? <input id={`article-${key}-${node.id}`} type="url" value={typeof config[key] === 'string' ? config[key] : ''} onChange={(event) => change({ [key]: event.target.value })} /> : <textarea id={`article-${key}-${node.id}`} rows={key === 'summary' ? 4 : 2} value={typeof config[key] === 'string' ? config[key] : ''} onChange={(event) => change({ [key]: event.target.value })} />}</div>)}
      <p className={styles.note}>紹介の要点は「- 」で始まる箇条書き3〜5行。続きの内容と、https://note.com/作者/n/記事 の販売先URLが必要です。無料範囲より後に本文が残る文字数を選び、表記価格は1円以上にしてください。</p>
    </>}
    {node.tool === 'rockstar-csv-cleanup' && <>
      <label htmlFor={`csv-trim-${node.id}`}>前後の空白を除く列名（1行に1つ、任意）</label><textarea id={`csv-trim-${node.id}`} rows={2} value={strings(config.trim).join('\n')} onChange={(event) => change({ trim: lines(event.target.value) })} />
      <label htmlFor={`csv-dedupe-${node.id}`}>重複を調べる列名（1行に1つ、任意）</label><textarea id={`csv-dedupe-${node.id}`} rows={2} value={strings((config.dedupe as { keys?: unknown } | undefined)?.keys).join('\n')} onChange={(event) => change({ dedupe: { ...(config.dedupe as object | undefined), keys: lines(event.target.value) } })} />
      <label htmlFor={`csv-mode-${node.id}`}>重複があるとき</label><select id={`csv-mode-${node.id}`} value={typeof (config.dedupe as { mode?: unknown } | undefined)?.mode === 'string' ? (config.dedupe as { mode: string }).mode : 'report_only'} onChange={(event) => change({ dedupe: { ...(config.dedupe as object | undefined), mode: event.target.value } })}><option value="report_only">件数を報告して元の行を保持</option><option value="first">最初の行を保持</option><option value="last">最後の行を保持</option></select>
    </>}
    <details className={styles.artifact}><summary>詳しい処理設定</summary><label htmlFor={`composition-config-${node.id}`}>処理設定（JSON）</label><textarea id={`composition-config-${node.id}`} className={styles.config} rows={Math.min(8, node.configText.split('\n').length + 1)} maxLength={3000} value={node.configText} onChange={(event) => update({ configText: event.target.value })} /></details>
  </>;
}

async function exactCompositionJob(id: string, owner: string): Promise<WorkJob> {
  if (id.length !== 36) throw new OperationResponseError('INVALID_RESPONSE');
  const response = await operationRequest<unknown>(`/api/work-jobs/composition?jobId=${encodeURIComponent(id)}`);
  if (readOwnerScope((response as { ownerScope?: unknown }).ownerScope) !== owner) throw new OperationResponseError('INVALID_RESPONSE');
  const job = readWorkJobResponse(response);
  if (job.id !== id || !job.composition) throw new OperationResponseError('INVALID_RESPONSE');
  return job;
}

export default function WorkCompositionWorkspace({ mode = 'compose' }: { mode?: 'compose' | 'eve-text' } = {}) {
  const { accessState, setNeedsSignin } = useExecutionAccess();
  const [owner, setOwnerValue] = useState<string | null>(null);
  const currentOwner = useRef<string | null>(null);
  const [memory, setMemory, memories, currentMemory] = useOwnerMemoryState<WorkspaceMemory>(owner, currentOwner, { selected: '', drafts: {}, editors: {}, openedEditor: '' });
  const [eveInput, setEveInput, eveInputs, currentEveInput] = useOwnerMemoryState<{ materials: EveTextMaterial[]; goal: string }>(owner, currentOwner,
    { materials: [{ name: '', text: '' }, { name: '', text: '' }], goal: '' });
  const [readingEve, setReadingEve] = useState(false);
  const fileGeneration = useRef(0);
  useEffect(() => () => { fileGeneration.current++; }, []);
  const [error, setError] = useOwnerMemoryState(owner, currentOwner, '');
  const [message, setMessage] = useOwnerMemoryState(owner, currentOwner, '');
  const [jobs, setJobs] = useState<WorkJob[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const locationSearch = useSyncExternalStore(subscribeLocation, browserLocation, serverLocation);
  const toolEntry = readCompositionToolEntry(new URLSearchParams(locationSearch));
  const [busy, setBusy] = useState(false);
  const [pendingOperations, setPendingOperations] = useState<Record<string, Pending>>({});
  const pendingOwners = Object.keys(pendingOperations);
  const pending = useRef(new Map<string, Pending>());
  const inFlight = useRef(false);
  const generation = useRef(0);
  const selectedRef = useRef('');
  useEffect(() => { selectedRef.current = memory.selected; }, [memory.selected]);
  const initializedOwners = useRef(new Set<string>());
  const setOwner = useCallback((scope: string | null) => {
    if (scope !== currentOwner.current) { selectedRef.current = ''; setJobs([]); setRecipes([]); fileGeneration.current++; setReadingEve(false); }
    currentOwner.current = scope; setOwnerValue(scope);
  }, []);
  const selected = jobs.find((job) => job.id === memory.selected && job.composition);
  const draft = memory.drafts[draftKey(memory.selected)] ?? (selected ? jobDraft(selected) : blankDraft());
  const ownPending = owner ? pendingOperations[owner] : undefined;
  const locked = busy || loading || readingEve || !owner || Boolean(ownPending);
  const retainedInput = Object.values(memories).some((state) => Object.values(state.drafts).some((item) => item.dirty) || Object.values(state.editors).some((item) => item.dirty));
  usePendingSaveNavigation(busy || readingEve || pendingOwners.length > 0 || retainedInput || Object.values(eveInputs).some((input) => input.goal || input.materials.some((material) => material.name || material.text)));

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const token = ++generation.current; setLoading(true);
    try {
      const list = readWorkJobs(await operationRequest<unknown>('/api/work-jobs'));
      const saved = readRecipes(await operationRequest<unknown>('/api/work-jobs/composition'));
      if (token !== generation.current) return;
      if (!list.ownerScope || list.ownerScope !== saved.ownerScope) {
        setOwner(null); setNeedsSignin(true); return;
      }
      if (mode === 'eve-text') setOwner(list.ownerScope);
      const known = pending.current.get(list.ownerScope)?.payload.jobId ?? new URL(window.location.href).searchParams.get('job');
      const knownId = typeof known === 'string' ? known : '';
      if (mode === 'eve-text' && knownId) {
        try {
          const exact = await exactCompositionJob(knownId, list.ownerScope);
          list.jobs = [exact, ...list.jobs.filter((job) => job.id !== knownId)];
        } catch (cause) {
          if (!(cause instanceof OperationRequestError && cause.status === 404)) throw cause;
          list.jobs = list.jobs.filter((job) => job.id !== knownId);
        }
        const current = readRecipes(await operationRequest<unknown>('/api/work-jobs/composition'));
        if (current.ownerScope !== list.ownerScope) { setOwner(current.ownerScope); return; }
      }
      if (token !== generation.current) return;
      list.jobs = list.jobs.filter((job) => job.composition && (mode !== 'eve-text' || isEveTextPlan(job.composition.plan)));
      setOwner(list.ownerScope); setJobs(list.jobs); setRecipes(saved.recipes);
      setNeedsSignin(false);
      if (!initializedOwners.current.has(list.ownerScope)) {
        initializedOwners.current.add(list.ownerScope);
        const parameters = new URL(window.location.href).searchParams;
        const id = parameters.get('job') ?? '';
        if (id && list.jobs.some((job) => job.id === id && job.composition)) {
          selectedRef.current = id;
          setMemory((state) => ({ ...state, selected: id }), list.ownerScope);
        } else if (!id) {
          const entry = readCompositionToolEntry(parameters);
          if (entry.state === 'ready') setMemory((state) => {
            if (state.selected || state.drafts.new || state.openedEditor || Object.keys(state.editors).length) return state;
            return { ...state, drafts: { ...state.drafts, new: { ...blankDraft(), inputKind: entry.plan.inputKind,
              nodes: editableNodes(entry.plan) } } };
          }, list.ownerScope);
        }

      }
    } catch (cause) {
      if (token !== generation.current) return;
      if (cause instanceof OperationRequestError && cause.status === 401) {
        setOwner(null); setNeedsSignin(true);
      } else if (currentOwner.current) {
        setError('仕事の保存先を確認できません。通信を確認して再読込してください。', currentOwner.current);
        if (mode === 'eve-text') setOwner(null);
      }
    } finally { if (token === generation.current) setLoading(false); }
  }, [setNeedsSignin, setError, setMemory, setOwner, mode]);
  // Owner-dependent setters change identity as the owner changes. Keep one mount/focus listener.
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    const versionRef = generation;
    void refreshRef.current();
    const check = () => { void refreshRef.current(); };
    window.addEventListener('focus', check);
    return () => { versionRef.current++; window.removeEventListener('focus', check); };
  }, []);
  useEffect(() => { if (accessState === 'ready' && !currentOwner.current) void refreshRef.current(); }, [accessState]);

  function canEditNow() {
    return !locked && !inFlight.current && Boolean(owner && owner === currentOwner.current &&
      !pending.current.has(owner) && memory.selected === selectedRef.current);
  }
  function invalidateEveFiles() {
    if (!owner || currentOwner.current !== owner) return;
    fileGeneration.current++; setReadingEve(false);
  }
  function edit(next: Partial<Draft>) {
    if (!canEditNow()) return;
    invalidateEveFiles();
    const id = memory.selected;
    setMemory((state) => ({ ...state, drafts: { ...state.drafts, [draftKey(id)]: { ...(state.drafts[draftKey(id)] ?? draft), ...next, dirty: true } } }));
    setError(''); setMessage('');
  }
  function chooseJob(id: string) {
    if (!canEditNow()) return;
    invalidateEveFiles();
    selectedRef.current = id;
    setMemory((state) => ({ ...state, selected: id }));
    setError(''); setMessage('');
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('job', id); else url.searchParams.delete('job');
    window.history.replaceState(window.history.state, '', url);
  }
  async function submit(operation: Pending, recover = false) {
    if (inFlight.current || currentOwner.current !== operation.owner) return;
    inFlight.current = true; const token = ++generation.current; setBusy(true); setError(''); setMessage('');
    pending.current.set(operation.owner, operation);
    setPendingOperations(Object.fromEntries(pending.current));
    let confirmed = false, verifyingWrite = false;
    try {
      const fingerprint = await compositionPayloadFingerprint(operation.payload);
      const identity = readRecipes(await operationRequest<unknown>('/api/work-jobs/composition'));
      if (identity.ownerScope !== operation.owner) {
        setOwner(identity.ownerScope); setRecipes(identity.recipes);
        throw new OperationRequestError(OWNER_CHANGED_MESSAGE, 409, OWNER_CHANGED);
      }
      if (token !== generation.current || currentOwner.current !== operation.owner) return;
      let result: unknown;
      if (mode === 'eve-text' && recover) {
        try {
          const saved = await exactCompositionJob(String(operation.payload.jobId), operation.owner);
          if (compositionResponseConfirms(saved, operation.payload, fingerprint)) result = { job: saved, ownerScope: operation.owner };
        } catch (cause) { if (!(cause instanceof OperationRequestError && cause.status === 404)) throw cause; }
      }
      if (!result) {
        if (mode === 'eve-text' && operation.payload.action === 'create') {
          const url = new URL(window.location.href); url.searchParams.set('job', String(operation.payload.jobId));
          window.history.replaceState(window.history.state, '', url);
        }
        result = await operationRequest<unknown>(operation.path, operation.method, operation.payload,
          { [OWNER_SCOPE_HEADER]: operation.owner });
      }
      const acknowledged = readWorkJobResponse(result);
      verifyingWrite = mode === 'eve-text';
      const job = mode === 'eve-text' ? await exactCompositionJob(String(operation.payload.jobId), operation.owner) : acknowledged;
      if (mode === 'eve-text' && operation.payload.action === 'run' && !job.composition?.materialCleared &&
        (job.composition?.source !== operation.payload.source ||
          job.composition?.artifacts[String(operation.payload.stepId)]?.text !== operation.payload.source)) throw new OperationResponseError('INVALID_RESPONSE');
      const responseOwner = readOwnerScope((result as { ownerScope?: unknown }).ownerScope);
      if (operation.path.endsWith('/composition') && responseOwner !== operation.owner)
        throw new OperationResponseError('INVALID_RESPONSE');
      // Confirm the current identity too: authentication may change while the POST is in flight.
      const after = readRecipes(await operationRequest<unknown>('/api/work-jobs/composition'));
      if (after.ownerScope !== operation.owner) {
        setOwner(after.ownerScope); throw new OperationRequestError(OWNER_CHANGED_MESSAGE, 409, OWNER_CHANGED);
      }
      if (token !== generation.current || currentOwner.current !== operation.owner) return;
      if (!compositionResponseConfirms(job, operation.payload, fingerprint)) throw new OperationResponseError('INVALID_RESPONSE');
      confirmed = true;
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      if (selectedRef.current === operation.selected) {
        setMemory((state) => {
          const previous = operation.transfer ?? state.drafts[draftKey(operation.selected)];
          const source = job.composition!.materialCleared ? '' : job.composition!.source ?? previous?.source ?? '';
          const drafts = { ...state.drafts, [job.id]: { ...jobDraft(job), source,
            consent: job.composition!.materialCleared ? false : previous?.consent ?? false,
            dirty: job.composition!.source === null && Boolean(source), originJobId: previous?.originJobId } };
          if (!operation.selected) delete drafts.new;
          const editors = { ...state.editors };
          if (operation.editorKey && editors[operation.editorKey]) editors[operation.editorKey] = { ...editors[operation.editorKey], dirty: false };
          if (operation.payload.action === 'clear') {
            for (const key of Object.keys(editors)) if (key.startsWith(`${job.id}/`)) delete editors[key];
          }
          return { ...state, selected: job.id, drafts, editors };
        }, operation.owner);
        const url = new URL(window.location.href); url.searchParams.set('job', job.id);
        window.history.replaceState(window.history.state, '', url);
      }
      setMessage(mode === 'eve-text' && job.composition?.materialCleared ? 'この仕事の素材・成果は削除済みです。再実行しません。' :
        mode === 'eve-text' && operation.payload.action === 'run' ? '資料付き依頼の保存を同じ仕事から確認しました。生成した草稿ではありません。' : compositionSaveMessage(job, operation.payload), operation.owner);
    } catch (cause) {
      if (cause instanceof OperationRequestError && cause.status === 401) { setOwner(null); setNeedsSignin(true); }
      if (!verifyingWrite && cause instanceof OperationRequestError && isDefinitivePendingSaveFailure(cause.status, cause.code)) confirmed = true;
      if (currentOwner.current === operation.owner)
        setError(cause instanceof OperationRequestError ? cause.message : '応答を確認できません。同じ操作で結果を確認してください。入力と操作IDは保持しています。', operation.owner);
    } finally {
      if (confirmed && pending.current.get(operation.owner) === operation) pending.current.delete(operation.owner);
      setPendingOperations(Object.fromEntries(pending.current));
      inFlight.current = false; setBusy(false);
      if (currentOwner.current) void refreshRef.current();
    }
  }
  function mutate(payload: Record<string, unknown>, path = '/api/work-jobs/composition', method = 'POST') {
    if (!canEditNow() || !owner) return;
    invalidateEveFiles();
    void submit({ owner, path, method, payload, selected: memory.selected });
  }
  function withPlan(action: 'create' | 'revise') {
    try {
      const plan = planFromDraft(draft);
      if (action === 'create') mutate(draft.recipeRef
        ? { action: 'reuse_recipe', recipeJobId: draft.recipeRef.id, recipeRevision: draft.recipeRef.revision, jobId: crypto.randomUUID(), plan }
        : { action, jobId: crypto.randomUUID(), plan });
      else if (selected) mutate({ action, jobId: selected.id, revision: selected.revision, commandId: crypto.randomUUID(), plan });
    } catch (cause) { setError(cause instanceof SyntaxError ? '処理設定のJSONを確認してください。' : cause instanceof Error ? cause.message : '手順を確認してください。'); }
  }
  function changeEveMaterial(index: number, field: 'name' | 'text', value: string) {
    if (!canEditNow() || selected) return;
    invalidateEveFiles();
    setEveInput((input) => ({ ...input, materials: input.materials.map((material, i) => i === index ? { ...material, [field]: value } : material) }));
  }
  function changeEveGoal(goal: string) {
    if (!canEditNow() || selected) return;
    invalidateEveFiles();
    setEveInput((input) => ({ ...input, goal }));
  }
  async function loadEveFiles(files: FileList | null) {
    // A queued replacement/cancel selection may arrive while readingEve from a
    // newer render is true. Check synchronous owner/job/write fences, then give
    // every accepted selection its own generation, including an empty cancel.
    if (!owner || currentOwner.current !== owner || busy || loading || selected || inFlight.current ||
      pending.current.has(owner) || memory.selected !== selectedRef.current || !currentEveInput() || !currentMemory()) return;
    const author = owner, version = ++fileGeneration.current;
    if (!files?.length) { setReadingEve(false); return; }
    setReadingEve(true); setError('');
    try {
      if (files.length !== 2) throw new Error('UTF-8文章を2つ選んでください。');
      const materials: EveTextMaterial[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 48_000) throw new Error('1ファイル48 KB以内にしてください。');
        materials.push(decodeEveTextMaterial(file.name, new Uint8Array(await file.arrayBuffer())));
      }
      // Validate names and combined limits without requiring a goal to be entered first.
      prepareEveTextJob(materials, '取込内容を確認');
      if (version === fileGeneration.current && currentOwner.current === author) setEveInput((input) => ({ ...input, materials }), author);
    } catch (cause) {
      if (version === fileGeneration.current && currentOwner.current === author) setError(cause instanceof Error ? cause.message : 'UTF-8文章を確認してください。', author);
    } finally { if (version === fileGeneration.current) setReadingEve(false); }
  }
  function prepareEve() {
    if (!canEditNow() || selected || !currentEveInput()) return;
    invalidateEveFiles();
    try {
      const prepared = prepareEveTextJob(eveInput.materials, eveInput.goal);
      edit({ ...prepared.plan, source: prepared.source, nodes: editableNodes(prepared.plan), consent: false, recipeRef: null });
      setEveInput({ materials: [{ name: '', text: '' }, { name: '', text: '' }], goal: '' });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '資料と依頼を確認してください。'); }
  }
  function openEditor(nodeId: string) {
    if (!canEditNow() || !selected?.composition || !currentMemory()) return;
    const artifact = selected.composition.artifacts[nodeId];
    if (!artifact) return;
    const key = `${selected.id}/${nodeId}`;
    setMemory((state) => ({ ...state, openedEditor: key, editors: { ...state.editors,
      [key]: state.editors[key] ?? { original: artifact.text, text: artifact.text, kind: artifact.kind,
        objective: `${selected.composition!.plan.objective.slice(0, 970)}・編集版を検査`, acceptance: '',
        minChars: '1', requiredText: '', originalRevision: selected.revision, dirty: false } } }));
  }
  function editArtifact(key: string, change: Partial<ArtifactEditor>) {
    if (!canEditNow() || memory.openedEditor !== key || !currentMemory()) return;
    setMemory((state) => ({ ...state, editors: { ...state.editors, [key]: { ...state.editors[key], ...change, dirty: true } } }));
    setError(''); setMessage('');
  }
  function createEditedWork(key: string) {
    if (!canEditNow() || !owner || !selected || !currentMemory()) return;
    const editor = memory.editors[key];
    if (!editor || !editor.text.trim() || editor.text.length > COMPOSITION_TEXT_LIMIT) {
      setError('編集した素材を1〜12000文字で入力してください。'); return;
    }
    try {
      const plan = parseCompositionPlan({ version: 1, objective: editor.objective, acceptance: editor.acceptance,
        inputKind: editor.kind, budgetMinor: 0, currency: 'JPY', deadline: '',
        nodes: [{ id: 's1', tool: 'compose-check', inputs: ['source'], config: {
          minChars: Number(editor.minChars), requiredText: editor.requiredText ? editor.requiredText.split('\n') : [],
        } }] });
      if (!Number.isInteger(Number(editor.minChars)) || Number(editor.minChars) < 1 || Number(editor.minChars) > COMPOSITION_TEXT_LIMIT ||
          (editor.requiredText && (editor.requiredText.split('\n').length > 20 || editor.requiredText.split('\n').some((item) => !item.trim() || item.length > 200)))) {
        setError('最低文字数は1〜12000、必須文言は最大20行、1行に1つ200文字以内で入力してください。'); return;
      }
      const transfer = { ...blankDraft(), objective: plan.objective, acceptance: plan.acceptance, inputKind: editor.kind,
        source: editor.text, nodes: editableNodes(plan), dirty: true, originJobId: selected.id };
      void submit({ owner, path: '/api/work-jobs/composition', method: 'POST', selected: selected.id,
        payload: { action: 'create', jobId: crypto.randomUUID(), plan }, transfer, editorKey: key });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '新しい仕事の目的と完成条件を確認してください。'); }
  }
  let planChanged = false;
  if (selected?.composition) {
    try { planChanged = JSON.stringify(planFromDraft(draft)) !== JSON.stringify(selected.composition.plan); }
    catch { planChanged = true; }
  }
  const runnable = selected?.composition ? runnableCompositionNodes(selected.composition) : [];
  const hasOutput = Boolean(selected?.composition && Object.keys(selected.composition.artifacts).length);
  const materialSaved = selected?.composition?.source !== null && selected?.composition?.source !== undefined;
  const canRun = selected?.status === 'active' && draft.consent && Boolean((selected.composition?.source ?? draft.source).trim()) && !planChanged;
  const canSaveRecipe = mode !== 'eve-text' && Boolean(selected && ['review', 'completed'].includes(selected.status) && selected.steps.every((step) => step.passed));
  const privateVisible = Boolean(owner);
  const signinState = owner ? 'ready' : loading ? 'checking' : accessState === 'signin' ? 'signin' : 'unavailable';

  return <WorkspaceShell title={mode === 'eve-text' ? 'Eve · 資料付き依頼を保存' : 'Zema · 仕事を組み立てる'} running={busy}>
    <div className={styles.workspace}>
      <div className={styles.intro}><div><h1>{mode === 'eve-text' ? '2つの資料と依頼を、ひとつの仕事へ。' : '目的から、仕事を組み立てる。'}</h1>
        <p>素材を整え、完成条件を検査し、成果を保存。使った手順はレシピにして、次の素材でも使えます。</p>
        <p className={styles.note}>接続済みの文章・CSV処理を使います。提案はキーワードによる手順の下書きです。外部siの自律実行や事実確認は行いません。</p>
      </div><Link href="/chat?view=work">Zemaの仕事へ</Link></div>
      {toolEntry.state === 'unavailable' && <div className={`${styles.notice} ${styles.error}`} role="alert">{toolEntry.message}</div>}
      {toolEntry.state === 'ready' && !memory.selected && !draft.recipeRef && (!owner || draft.nodes[0]?.tool === toolEntry.toolId) && <p className={styles.notice}>Skyで選んだTool：{toolEntry.name}。目的・素材・完成条件を入力し、処理と検査の手順を確認してください。選択だけでは実行しません。</p>}
      {mode === 'eve-text' && <p className={styles.notice}>ここでは資料付き依頼を保存します。モデル生成・完成草稿はまだ利用できません。原文は変更せず、未保存の入力はタブを閉じると失われます。</p>}
      {mode === 'eve-text' && readingEve && <button type="button" onClick={invalidateEveFiles}>ファイル読込を取り消す</button>}
      <ExecutionSignin state={signinState} />
      {owner && loading && <output className={styles.notice}>保存した仕事とレシピを更新しています…成果はこの画面に残っています。</output>}
      {!privateVisible && pendingOwners.length > 0 && <p className={styles.notice}>保存結果が未確認の操作を保持しています。入力したアカウントで接続を確認してください。</p>}
      {owner && pendingOwners.some((scope) => scope !== owner) && <p className={styles.notice}>別のアカウントの未保存入力・操作は非表示で保持しています。</p>}
      {privateVisible && <>
        {error && <div className={`${styles.notice} ${styles.error}`} role="alert">{error}</div>}
        {message && <output className={`${styles.notice} ${styles.success}`}>{message}</output>}
        {ownPending && <section className={styles.notice} aria-label="保存結果の確認"><strong>保存結果を確認してください。</strong>
          <p>新しい操作は保留中です。同じ操作IDで確認するので、仕事を二重に作りません。</p>
          <button disabled={busy || loading} onClick={() => void submit(ownPending, true)}>{busy ? '確認中…' : '同じ操作で結果を確認'}</button>
        </section>}
      </>}
      <div className={styles.grid}>
        <aside className={styles.sidebar} aria-label="仕事とレシピ">
          <button disabled={locked} onClick={() => chooseJob('')}><Plus size={16} /> 新しい仕事</button>
          <div className={styles.actions}><button disabled={busy || loading} onClick={() => void refreshRef.current()}><RefreshCw size={15} /> {loading ? '読込中…' : '再読込'}</button></div>
          <h2>保存した仕事</h2>
          <ul>{privateVisible && jobs.map((job) => <li key={job.id}><button aria-current={memory.selected === job.id ? 'true' : undefined} disabled={busy || Boolean(ownPending)} onClick={() => chooseJob(job.id)}><span>{job.composition?.plan.objective}<small>{({ active: '作業中', review: '本人確認待ち', completed: '完了', cancelled: '中止' })[job.status]} · {job.steps.filter((step) => step.passed).length}/{job.steps.length}</small></span></button></li>)}</ul>
          {privateVisible && jobs.length === 0 && <p className={styles.empty}>仕事を保存すると、ここから再開できます。</p>}
          {mode !== 'eve-text' && <><h2>仕事のレシピ</h2>
          <p className={styles.note}>手順だけを再利用。過去の素材・成果・承認は含みません。</p>
          <ul>{privateVisible && recipes.map((recipe) => <li key={recipe.id}><button disabled={locked} onClick={() => {
            if (!canEditNow()) return;
            if (memory.drafts.new?.dirty && !window.confirm('新しい仕事の未保存入力を置き換えて、レシピを開きますか？')) return;
            selectedRef.current = '';
            setMemory((state) => ({ ...state, selected: '', drafts: { ...state.drafts, new: { ...blankDraft(),
              inputKind: recipe.recipe.inputKind, nodes: editableNodes(recipe.recipe), recipeRef: { id: recipe.id, revision: recipe.jobRevision }, dirty: true } } }));
            setError(''); setMessage('新しい目的・素材・完成条件を入力してください。旧仕事は変更しません。');
          }}>{recipe.name}<small>{recipe.recipe.nodes.length}手順 · {recipe.recipe.inputKind === 'csv' ? 'CSV' : '文章'}</small></button></li>)}</ul>
          {privateVisible && recipes.length === 0 && <p className={styles.empty}>成果の検査が終わった仕事から保存できます。</p>}</>}
        </aside>
        <section className={styles.panel} aria-label="仕事の組み立て">
          <h2>{selected ? '保存した仕事' : draft.recipeRef ? 'レシピから新しい仕事' : '新しい仕事'}</h2>
          {!privateVisible ? <p className={styles.empty}>サインインすると、目的・素材を入力して仕事とレシピを保存できます。</p> : <>
            {mode === 'eve-text' && !selected && <fieldset disabled={locked}><legend>資料付き依頼の準備</legend>
              <label htmlFor="eve-text-files">UTF-8文章を2つ選ぶ（各48 KB以内・本文合計8,000文字）</label>
              <input id="eve-text-files" type="file" multiple disabled={locked} onChange={(event) => { void loadEveFiles(event.target.files); event.target.value = ''; }} />
              {eveInput.materials.map((material, index) => <div key={index}>
                <label htmlFor={`eve-name-${index}`}>資料{index + 1}の名前</label><input id={`eve-name-${index}`} maxLength={160} value={material.name} disabled={locked} onChange={(event) => changeEveMaterial(index, 'name', event.target.value)} />
                <label htmlFor={`eve-text-${index}`}>資料{index + 1}の原文</label><textarea id={`eve-text-${index}`} rows={3} maxLength={8000} value={material.text} disabled={locked} onChange={(event) => changeEveMaterial(index, 'text', event.target.value)} />
              </div>)}
              <label htmlFor="eve-text-goal">依頼（500文字以内）</label><textarea id="eve-text-goal" rows={2} maxLength={500} value={eveInput.goal} disabled={locked} onChange={(event) => changeEveGoal(event.target.value)} />
              <button type="button" disabled={locked} onClick={prepareEve}>原文と依頼を固定して確認</button>
              <p>下の内容を確認して仕事を保存し、素材の保存に同意して手順を実行してください。計画だけの保存では原文はまだ保存されません。</p>
            </fieldset>}
            {selected && <p className={styles.note}>保存済み · revision {selected.revision} · {selected.id}</p>}
            {draft.originJobId && jobs.some((job) => job.id === draft.originJobId) && <div className={styles.actions}><button disabled={locked} onClick={() => chooseJob(draft.originJobId!)}>元の仕事を表示</button><p className={styles.note}>編集版は別の仕事です。元の成果と検査記録は変更していません。</p></div>}
            {draft.dirty && <div className={styles.actions}><p className={styles.note}>未保存の入力があります。このタブで保持しています。</p><button disabled={locked} onClick={() => { if (canEditNow() && window.confirm('この画面の未保存入力を破棄します。保存済みの仕事は残ります。')) { invalidateEveFiles(); setMemory((state) => ({ ...state, drafts: { ...state.drafts, [draftKey(memory.selected)]: selected ? jobDraft(selected) : blankDraft() } })); } }}>未保存の入力を破棄</button></div>}
            <label htmlFor="composition-objective">目的</label><textarea id="composition-objective" rows={2} maxLength={1000} disabled={locked || mode === 'eve-text' || selected?.status === 'cancelled' || selected?.status === 'completed'} value={draft.objective} onChange={(event) => edit({ objective: event.target.value })} placeholder="例：記事の出典を整理して、公開前の確認をしたい" />
            <label htmlFor="composition-acceptance">完成条件</label><textarea id="composition-acceptance" rows={2} maxLength={1000} disabled={locked || mode === 'eve-text' || selected?.status === 'cancelled' || selected?.status === 'completed'} value={draft.acceptance} onChange={(event) => edit({ acceptance: event.target.value })} placeholder="例：出典一覧があり、300文字以上。本人が内容を確認する" />
            <p className={styles.note}>下の検査設定で文字数・必須文言を指定できます。意味や正しさの最終確認は本人が行います。</p>
            <div className={styles.columns}><div><label htmlFor="composition-format">素材の形式</label><select id="composition-format" value={draft.inputKind} disabled={locked || mode === 'eve-text' || Boolean(selected) || Boolean(draft.recipeRef)} onChange={(event) => edit({ inputKind: event.target.value as MaterialKind, nodes: editableNodes(suggestComposition(draft.objective, event.target.value as MaterialKind)) })}><option value="text">文章（UTF-8）</option><option value="csv">CSV（UTF-8）</option></select></div>
              <div><label htmlFor="composition-deadline">期限（任意）</label><input id="composition-deadline" type="date" value={draft.deadline} disabled={locked || mode === 'eve-text' || selected?.status === 'completed' || selected?.status === 'cancelled'} onChange={(event) => edit({ deadline: event.target.value })} /></div></div>
            <label htmlFor="composition-source">{materialSaved ? '保存した元素材' : '今回の素材'}</label><textarea id="composition-source" rows={6} maxLength={COMPOSITION_TEXT_LIMIT} value={materialSaved ? selected!.composition!.source! : draft.source} readOnly={materialSaved || mode === 'eve-text'} disabled={locked || selected?.status === 'cancelled' || selected?.status === 'completed'} onChange={(event) => edit({ source: event.target.value })} placeholder={draft.inputKind === 'csv' ? 'name,amount\nAlice,100' : '処理する文章を貼り付けてください'} />
            <p className={styles.note}>{materialSaved ? '元素材は固定しています。別の素材は「新しい仕事」またはレシピから作成してください。' : `${draft.source.length}/${COMPOSITION_TEXT_LIMIT}文字。入力は未保存です。実行時に本人用の素材・成果として保存します。`}</p>
            {!selected && mode !== 'eve-text' && <div className={styles.actions}>
              <button disabled={locked || Boolean(draft.recipeRef) || !draft.objective.trim()} onClick={() => edit({ nodes: editableNodes(suggestComposition(draft.objective, draft.inputKind)) })}>手順を提案</button>
              <button disabled={locked || Boolean(draft.recipeRef)} onClick={() => edit({ inputKind: 'text', objective: '記事の出典を整理する', acceptance: '出典一覧があり、本文と出典を本人が確認できる',
                source: 'RockstarOSでは、依頼から成果の確認までを一つの仕事で管理します。（出典: [RockstarOS](https://example.com/rockstaros)）\n仕事の手順を保存し、次の素材で再利用できます。',
                nodes: editableNodes(suggestComposition('記事の出典を整理する', 'text')) })}>文章サンプルを入力</button>
            </div>}
            <fieldset disabled={locked || mode === 'eve-text' || selected?.status === 'completed' || selected?.status === 'cancelled'}><legend>処理と検査の手順</legend>
              <ol className={styles.steps}>{draft.nodes.map((node, index) => {
                const capability = capabilityFor(node.tool);
                const update = (change: Partial<EditableNode>) => edit({ nodes: draft.nodes.map((item, i) => i === index ? { ...item, ...change } : item) });
                return <li key={node.id}><div className={styles.stepHeading}><h3>{index + 1}. {capability?.name ?? node.tool}</h3><span>{capability?.available ? '接続済み' : 'この経路では利用不可'}</span></div>
                  <label htmlFor={`composition-tool-${node.id}`}>処理</label><select id={`composition-tool-${node.id}`} value={node.tool} disabled={Boolean(draft.recipeRef)} onChange={(event) => update({ tool: event.target.value, configText: JSON.stringify(defaultCompositionConfig(event.target.value), null, 2) })}><optgroup label="接続済みの処理">{compositionCapabilities.filter((tool) => tool.available).map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}</optgroup><optgroup label="この経路では未接続">{compositionCapabilities.filter((tool) => !tool.available).map((tool) => <option key={tool.id} value={tool.id} disabled>{tool.name}（未接続）</option>)}</optgroup></select>
                  <p className={styles.note}>{capability?.limitation}</p>
                  <label htmlFor={`composition-input-${node.id}`}>入力元</label><select id={`composition-input-${node.id}`} value={node.inputs[0] ?? 'source'} disabled={Boolean(draft.recipeRef) || node.tool === 'compose-join'} onChange={(event) => update({ inputs: [event.target.value] })}><option value="source">今回の素材 → {draft.inputKind === 'csv' ? 'CSV' : '文章'}</option>{draft.nodes.slice(0, index).map((previous) => <option key={previous.id} value={previous.id}>{previous.id} · {capabilityFor(previous.tool)?.name}</option>)}</select>
                  {node.tool === 'compose-join' && <div>{['source', ...draft.nodes.slice(0, index).map((item) => item.id)].map((input) => <label className={styles.checkLabel} key={input}><input type="checkbox" checked={node.inputs.includes(input)} disabled={Boolean(draft.recipeRef)} onChange={(event) => update({ inputs: event.target.checked ? [...node.inputs, input] : node.inputs.filter((id) => id !== input) })} />{input === 'source' ? '今回の素材' : input}</label>)}</div>}
                  <StepConfiguration node={node} update={update} />
                  {!draft.recipeRef && <button type="button" onClick={() => edit({ nodes: draft.nodes.filter((item) => item.id !== node.id) })}>この手順を外す</button>}
                </li>;
              })}</ol>
              {!draft.recipeRef && <button type="button" disabled={draft.nodes.length >= 12} onClick={() => {
                let id = 1; while (draft.nodes.some((item) => item.id === `s${id}`)) id++;
                edit({ nodes: [...draft.nodes, { id: `s${id}`, tool: 'compose-check', inputs: [draft.nodes.at(-1)?.id ?? 'source'], configText: JSON.stringify(defaultCompositionConfig('compose-check'), null, 2) }] });
              }}><Plus size={15} /> 手順を追加</button>}
            </fieldset>
            <p className={styles.note}>この経路の処理料金は0円です。有料Cloud Agentや外部への公開処理は含みません。各成果の最後に完成条件の検査を接続してください。</p>
            {!selected ? <div className={styles.actions}><button className={styles.primary} disabled={locked || !draft.objective.trim() || !draft.acceptance.trim()} onClick={() => withPlan('create')}><Check size={16} /> 確認して仕事を保存</button></div> : <>
              {planChanged && <div className={styles.notice}><p>手順の変更後は、影響する成果の検査をやり直します。保存前に、残したい旧成果をダウンロードしてください。</p><button disabled={locked || selected.status === 'completed' || selected.status === 'cancelled'} onClick={() => withPlan('revise')}>変更した計画を保存</button></div>}
              <label className={styles.checkLabel}><input type="checkbox" checked={draft.consent} disabled={locked} onChange={(event) => edit({ consent: event.target.checked })} />この素材と処理成果を本人用の仕事に保存することを確認しました。</label>
              <h2>実行と成果</h2><ol className={styles.steps}>{selected.composition!.plan.nodes.map((node, index) => {
                const artifact = selected.composition!.artifacts[node.id];
                const ready = runnable.some((item) => item.id === node.id);
                const editorKey = `${selected.id}/${node.id}`;
                const editor = memory.openedEditor === editorKey ? memory.editors[editorKey] : undefined;
                return <li key={node.id}><div className={styles.stepHeading}><h3>{index + 1}. {capabilityFor(node.tool)?.name}</h3><span>{artifact ? artifact.status === 'passed' ? node.tool === 'compose-check' ? '登録条件に合格' : '処理済み' : '条件の確認が必要' : ready ? '実行できます' : '入力元の成果待ち'}</span></div>
                  {(ready || artifact?.status === 'needs_review') && <div className={styles.actions}><button className={styles.primary} disabled={locked || !canRun || !ready} onClick={() => mutate({ action: 'run', jobId: selected.id, revision: selected.revision, commandId: crypto.randomUUID(), stepId: node.id, source: selected.composition!.source ?? draft.source, saveMaterial: true })}><Play size={15} /> {artifact ? '同じ条件で再検査' : 'この手順を実行'}</button></div>}
                  {artifact && <details className={styles.artifact} open><summary>{node.tool === 'compose-check' ? '検査した成果' : '途中成果'}を表示</summary><pre>{artifact.text}</pre><ul>{artifact.checks.map((check, i) => <li key={i}>{check.passed ? '✓' : '要確認'} {check.name}：{check.detail}</li>)}</ul><a className={styles.downloadLink} href={`/api/work-jobs/composition/artifact?jobId=${encodeURIComponent(selected.id)}&nodeId=${encodeURIComponent(node.id)}&revision=${selected.revision}`} download={`zema-step-${node.id}-r${selected.revision}.${artifact.kind === 'csv' ? 'csv' : 'txt'}`} referrerPolicy="no-referrer"><Download size={15} /> 成果をダウンロード</a>{mode !== 'eve-text' && <div className={styles.actions}><button disabled={locked} onClick={() => openEditor(node.id)}>編集して検査する</button></div>}</details>}
                  {artifact && editor && <fieldset disabled={locked} className={styles.editor}><legend>成果の編集版</legend>
                      <p className={styles.note}>編集開始時の成果（revision {editor.originalRevision}）を保持しています。編集版は新しい仕事に保存し、新しい条件で検査します。元の合格・承認は引き継ぎません。</p>
                      <div className={styles.columns}><div><label htmlFor={`original-artifact-${node.id}`}>編集開始時の原文</label><textarea id={`original-artifact-${node.id}`} rows={8} value={editor.original} readOnly /></div><div><label htmlFor={`edited-artifact-${node.id}`}>編集する内容</label><textarea id={`edited-artifact-${node.id}`} rows={8} maxLength={COMPOSITION_TEXT_LIMIT} value={editor.text} onChange={(event) => editArtifact(editorKey, { text: event.target.value })} /></div></div>
                      <p className={styles.note}>{editor.text.length}/{COMPOSITION_TEXT_LIMIT}文字 · {editor.kind === 'csv' ? 'CSV構造も検査します。' : '文章として検査します。'}</p>
                      <label htmlFor={`edit-objective-${node.id}`}>新しい仕事の目的</label><textarea id={`edit-objective-${node.id}`} rows={2} maxLength={1000} value={editor.objective} onChange={(event) => editArtifact(editorKey, { objective: event.target.value })} />
                      <label htmlFor={`edit-acceptance-${node.id}`}>新しい完成条件</label><textarea id={`edit-acceptance-${node.id}`} rows={2} maxLength={1000} value={editor.acceptance} onChange={(event) => editArtifact(editorKey, { acceptance: event.target.value })} />
                      <label htmlFor={`edit-min-${node.id}`}>新しく検査する最低文字数</label><input id={`edit-min-${node.id}`} type="number" min={1} max={COMPOSITION_TEXT_LIMIT} value={editor.minChars} onChange={(event) => editArtifact(editorKey, { minChars: event.target.value })} />
                      <label htmlFor={`edit-required-${node.id}`}>新しく検査する必須文言（1行に1つ、最大20行、任意）</label><textarea id={`edit-required-${node.id}`} rows={2} value={editor.requiredText} onChange={(event) => editArtifact(editorKey, { requiredText: event.target.value })} />
                      <p className={styles.note}>次のボタンは計画を別の仕事へ保存します。内容はこのタブに保持され、新しい仕事で保存を確認して実行した時に、素材と検査成果が保存されます。</p>
                      <div className={styles.actions}><button className={styles.primary} disabled={!editor.text.trim() || !editor.objective.trim() || !editor.acceptance.trim()} onClick={() => createEditedWork(editorKey)}>編集版を新しい仕事へ</button><button onClick={() => { if (canEditNow() && currentMemory() && window.confirm('この成果の未保存編集を破棄します。保存済みの元成果は残ります。')) setMemory((state) => { const editors = { ...state.editors }; delete editors[editorKey]; return { ...state, editors, openedEditor: '' }; }); }}>この編集を破棄</button></div>
                    </fieldset>}
                </li>;
              })}</ol>
              {selected.status === 'review' && <><p className={styles.notice}>登録した検査が終わりました。成果を読み、完成条件を満たすことを本人が確認してください。</p><label htmlFor="composition-review">本人の確認メモ</label><textarea id="composition-review" rows={2} maxLength={1000} value={draft.completeNote} disabled={locked} onChange={(event) => edit({ completeNote: event.target.value })} /><button className={styles.primary} disabled={locked || !draft.completeNote.trim()} onClick={() => mutate({ jobId: selected.id, revision: selected.revision, command: { id: crypto.randomUUID(), action: 'complete', note: draft.completeNote } }, '/api/work-jobs', 'PATCH')}>確認して仕事を完了</button></>}
              {canSaveRecipe && <fieldset disabled={locked}><legend>次の仕事にも使う</legend><label htmlFor="composition-recipe-name">レシピ名</label><input id="composition-recipe-name" maxLength={100} value={draft.recipeName} onChange={(event) => edit({ recipeName: event.target.value })} placeholder="例：記事の出典整理と検査" /><p className={styles.note}>素材・目的・成果・顧客情報・過去の設定・承認は保存しません。新しい仕事で目的と設定を確認します。</p><div className={styles.actions}><button disabled={!draft.recipeName.trim()} onClick={() => mutate({ action: 'save_recipe', jobId: selected.id, revision: selected.revision, commandId: crypto.randomUUID(), name: draft.recipeName })}>手順をレシピとして保存</button></div></fieldset>}
              {recipes.some((recipe) => recipe.id === selected.id) && <div className={styles.actions}><button className={styles.danger} disabled={locked} onClick={() => { if (window.confirm('レシピを削除します。保存済みの仕事は変更しません。')) mutate({ action: 'delete_recipe', jobId: selected.id, revision: selected.revision, commandId: crypto.randomUUID() }); }}>このレシピを削除</button></div>}
              {selected.composition!.materialCleared && <p className={styles.notice}>この仕事の素材と成果は削除済みです。新しい素材で作業する場合は、新しい仕事またはレシピから作成してください。</p>}
              {(hasOutput || materialSaved) && <details className={styles.artifact}><summary>保存した素材・成果の削除</summary><p className={styles.note}>この仕事の元素材とすべての成果を削除します。レシピを保存している場合は手順だけが残ります。必要な成果を先にダウンロードしてください。</p><button className={styles.danger} disabled={locked} onClick={() => { if (window.confirm('この仕事の保存素材・成果と、このタブの未保存編集を削除します。この操作は取り消せません。')) mutate({ action: 'clear', jobId: selected.id, revision: selected.revision, commandId: crypto.randomUUID() }); }}>素材と成果を削除</button></details>}
              {selected.status === 'active' && <div className={styles.actions}><button disabled={locked} onClick={() => { if (window.confirm('この仕事を中止します。保存済み成果は残ります。')) mutate({ jobId: selected.id, revision: selected.revision, command: { id: crypto.randomUUID(), action: 'cancel' } }, '/api/work-jobs', 'PATCH'); }}>仕事を中止</button></div>}
            </>}
          </>}
        </section>
      </div>
    </div>
  </WorkspaceShell>;
}
