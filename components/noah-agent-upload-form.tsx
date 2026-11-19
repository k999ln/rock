'use client';
import { noahTerminalTemplate } from '@/lib/noah-terminal-template';
import { noahUploadPath } from '@/lib/noah-surface';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NOAH_MANIFEST_LIMIT, NOAH_SOURCE_LIMIT, NOAH_PERMISSIONS, noahAgentTemplate, noahSha256, parseNoahAgentManifest, type NoahAgentManifest } from '@/lib/noah-agent-upload';
import NoahDraftStoragePanel from './noah-draft-storage';
import type { NoahDraft, NoahDraftContent } from '@/lib/noah-drafts';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { NOAH_CODE_LIMIT } from '@/lib/noah-agent-upload';
import { bundleUploadTest, processUpload } from '@/lib/noah-upload-processing-client';
import styles from './noah-agent-catalog.module.css';
const permissionLabels = { read_input: '入力を読む', write_files: 'ファイルを書き込む', network: '外部通信', external_account: '外部アカウントを使う', external_write: '投稿・外部データの変更', financial: '決済・金融操作' };
export { permissionLabels };
export default function NoahAgentUploadForm() {
  const router = useRouter();
  const [manifest, setManifest] = useState<NoahAgentManifest>({ ...noahAgentTemplate, name: '', summary: '', author: '', adapter: 'source', endpointUrl: null, priceNote: '' });
  const [source, setSource] = useState<File | null>(null), [scope, setScope] = useState('');
  const [id, setId] = useState(''), [rights, setRights] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [accountChecking, setAccountChecking] = useState(true), [signedOut, setSignedOut] = useState(false);
  const [returnPath, setReturnPath] = useState('/noah/agents/new?launch=1');
  const [drafts, setDrafts] = useState<Array<{id:string;name:string;revision:number;updatedAt:number}>>([]);
  const [storageTick,setStorageTick] = useState(0);
  const [draftMessage, setDraftMessage] = useState(''), [draftError, setDraftError] = useState('');
  const [draftRevision, setDraftRevision] = useState(0), [draftLoading, setDraftLoading] = useState(true);
  const draft = useRef({ id: '', revision: 0, saved: '', busy: false });
  const draftRetry = useRef<{ signature: string; commandId: string } | null>(null);
  const restoreStarted = useRef(false);
  const [restoreFailed, setRestoreFailed] = useState(false), [restoreAttempt, setRestoreAttempt] = useState(0);
  const [sourceDigest, setSourceDigest] = useState<{ file: File; hash: string } | null>(null);
  const [codeMode, setCodeMode] = useState<'file' | 'paste'>('file');
  const [codeName, setCodeName] = useState('agent.ts'), [code, setCode] = useState('');
  const [importRevision, setImportRevision] = useState(''), [importMessage, setImportMessage] = useState('');
  const [verifiedRefactor, setVerifiedRefactor] = useState(true), [processorAvailable, setProcessorAvailable] = useState<boolean | null>(null);
  const [testName, setTestName] = useState('agent.test.mjs'), [testCode, setTestCode] = useState(''), [processingMessage, setProcessingMessage] = useState('');
  const processingController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/__noah/upload-refactor', { signal: controller.signal, cache: 'no-store' }).then(async r => { const data = r.ok ? await r.json() as { available?: boolean } : null; if (!controller.signal.aborted) setProcessorAvailable(data?.available === true); }).catch(() => { if (!controller.signal.aborted) setProcessorAvailable(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/noah/agents', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }).then(async r => {
      if (controller.signal.aborted) return;
      if (r.status === 401) { setScope(''); setSignedOut(true); return; }
      const data = await r.json() as { ownerScope: string; error?: string }; if (!r.ok || !data.ownerScope) throw new Error(data.error || 'アカウントを確認できません。');
      if (!controller.signal.aborted) { setScope(data.ownerScope); setError(''); }
    }).catch(e => { if (!controller.signal.aborted) { setScope(''); setError(e instanceof Error && e.name === 'TimeoutError' ? 'アカウントの確認が時間切れになりました。再確認してください。' : 'アカウントを確認できません。通信を確認して再試行してください。'); } })
      .finally(() => { if (!controller.signal.aborted) { setReturnPath(noahUploadPath(window.location.search)); setAccountChecking(false); } });
    return () => controller.abort();
  }, [attempt]);
  const draftContent = JSON.stringify({ manifest, codeMode, codeName, code: rights ? code : '', rights, validation: { enabled: verifiedRefactor, testName, testCode: rights ? testCode : '' } });
  useEffect(() => {
    if (!source || !rights) return;
    if (source.size > NOAH_SOURCE_LIMIT) return;
    let active = true;
    void source.arrayBuffer().then(b => noahSha256(new Uint8Array(b))).then(hash => { if (active) setSourceDigest({ file: source, hash }); }).catch(() => { if (active) setDraftError('ファイルを読み取れません。選び直してください。'); });
    return () => { active = false; };
  }, [source, rights]);
  const hashing = Boolean(source && rights && sourceDigest?.file !== source);
  const sourceSignature = source && rights ? JSON.stringify([source.name, sourceDigest?.file === source ? sourceDigest.hash : null]) : '';
  const draftSignature = draftContent + sourceSignature;
  const hasInput = Boolean(manifest.name || manifest.summary || code || source || testCode);
  const saveDraft = useCallback(async () => {
    if (!scope || draftLoading || restoreFailed || hashing || draft.current.busy) return false;
    if (!hasInput || draft.current.saved === draftSignature) return true;
    draft.current.busy = true; setDraftError(''); setDraftMessage('下書きを保存中…');
    try {
      draft.current.id ||= crypto.randomUUID();
      if (draftRetry.current?.signature !== draftSignature) draftRetry.current = { signature: draftSignature, commandId: crypto.randomUUID() };
      const payload = { revision: draft.current.revision, commandId: draftRetry.current.commandId, content: JSON.parse(draftContent), clearSource: !(source && rights) };
      const headers: Record<string,string> = { [OWNER_SCOPE_HEADER]: scope };
      let body: BodyInit = JSON.stringify(payload);
      if (source && rights) { const form = new FormData(); form.set('draft', body); form.set('source', source); body = form; }
      else headers['Content-Type'] = 'application/json';
      const response = await fetch(`/api/noah/drafts/${draft.current.id}`, { method: 'PUT', headers, body });
      const data = await response.json() as { draft: NoahDraft; error?: string };
      if (response.status === 410) draftRetry.current = null;
      if (!response.ok) throw new Error(data.error || '下書きを保存できません。');
      draft.current.revision = data.draft.revision; draft.current.saved = draftSignature; draftRetry.current = null;
      setDrafts(rows => [{ id: data.draft.id, name: typeof data.draft.content.manifest.name === 'string' && data.draft.content.manifest.name || '名前未設定', revision: data.draft.revision, updatedAt: data.draft.updatedAt }, ...rows.filter(d => d.id !== data.draft.id)]);
      setStorageTick(n=>n+1); setDraftRevision(data.draft.revision); setDraftMessage(`下書き保存済み · ${new Date(data.draft.updatedAt).toLocaleTimeString('ja-JP')}`);
      window.history.replaceState(window.history.state, '', noahUploadPath(window.location.search, draft.current.id));
      return true;
    } catch (e) { setDraftError(e instanceof Error ? e.message : '下書きを保存できません。'); setDraftMessage('未保存の変更があります'); return false; }
    finally { draft.current.busy = false; }
  }, [scope, draftLoading, restoreFailed, hashing, hasInput, draftSignature, draftContent, source, rights]);
  useEffect(() => {
    if (!scope || restoreStarted.current) return;
    restoreStarted.current = true;
    const controller = new AbortController();
    const restore = async () => {
      try {
        const list = await fetch('/api/noah/drafts', { cache: 'no-store', signal: controller.signal });
        const available = await list.json() as { drafts: Array<{id:string;name:string;revision:number;updatedAt:number}>; ownerScope: string; error?: string }; if (!list.ok) throw new Error(available.error || '下書きを取得できません。');
        if (available.ownerScope !== scope) throw new Error('アカウントが変わりました。画面を再読込してください。');
        setDrafts(available.drafts);
        const savedId = new URLSearchParams(window.location.search).get('draft');
        if (!savedId) {
          const params=new URLSearchParams(window.location.search),sourceUrl=params.get('sourceUrl'),revision=params.get('revision');
          if(sourceUrl&&sourceUrl.length<=500&&revision&&/^[a-f0-9]{40}$/.test(revision)) {
            const url=new URL(sourceUrl);
            if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&['github.com','huggingface.co'].includes(url.hostname)) {
              setManifest(current=>({...current,sourceUrl,adapter:'source',endpointUrl:null}));setImportRevision(revision);setCodeMode('file');setRights(false);setImportMessage('公開候補のURLと固定commitを引き継ぎました。利用条件を確認してから取得してください。');
            }
          }
          return;
        }
        const response = await fetch(`/api/noah/drafts/${encodeURIComponent(savedId)}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json() as { draft: NoahDraft; ownerScope: string; error?: string };
        if (!response.ok) throw new Error(data.error || '下書きを復元できません。');
        if (data.ownerScope !== scope) throw new Error('アカウントが変わりました。画面を再読込してください。');
        const saved = data.draft, value = saved.content as NoahDraftContent;
        let file: File | null = null;
        if (saved.source) {
          const res = await fetch(`/api/noah/drafts/${saved.id}/source`, { cache: 'no-store', signal: controller.signal });
          if (!res.ok) throw new Error('下書きのファイルを復元できません。再読込してください。');
          const bytes = await res.arrayBuffer();
          if (bytes.byteLength !== saved.source.bytes || await noahSha256(new Uint8Array(bytes)) !== saved.source.sha256) throw new Error('下書きのファイルが保存記録と一致しません。再読込してください。');
          file = new File([bytes], saved.source.name);
        }
        if (controller.signal.aborted) return;
        setManifest({ ...noahAgentTemplate, ...value.manifest } as NoahAgentManifest); setCodeMode(value.codeMode); setCodeName(value.codeName); setCode(value.code); setRights(value.rights); setSource(file);
        setVerifiedRefactor(value.validation?.enabled ?? true); setTestName(value.validation?.testName ?? 'agent.test.mjs'); setTestCode(value.validation?.testCode ?? '');
        if (file && saved.source) setSourceDigest({ file, hash: saved.source.sha256 });
        draft.current = { id: saved.id, revision: saved.revision, saved: JSON.stringify(value) + (file && value.rights ? JSON.stringify([file.name, saved.source!.sha256]) : ''), busy: false };
        setDraftRevision(saved.revision); setDraftMessage('保存した下書きを復元しました。');
      } catch (e) { if (!controller.signal.aborted) { setRestoreFailed(true); setDraftError(e instanceof Error ? e.message : '下書きを復元できません。'); } }
      finally { if (!controller.signal.aborted) setDraftLoading(false); }
    };
    void restore(); return () => { controller.abort(); restoreStarted.current = false; };
  }, [scope, restoreAttempt]);
  useEffect(() => {
    if (draftError || pending || draftLoading || !hasInput) return;
    const timer = setTimeout(() => { void saveDraft(); }, 1200);
    return () => clearTimeout(timer);
  }, [saveDraft, draftRevision, draftError, pending, draftLoading, hasInput]);
  useEffect(() => {
    if (!hasInput || (!hashing && draft.current.saved === draftSignature)) return;
    const warn = (e: BeforeUnloadEvent) => { if (hashing || draft.current.saved !== draftSignature) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasInput, hashing, draftSignature, draftRevision]);
  async function openDraft(savedId: string) {
    if (pending || draft.current.busy || draftLoading || hashing) return;
    if ((code || source || testCode) && !rights) { setDraftError('保存権利を確認すると、入力中のコードを保存して別の下書きを開けます。'); return; }
    if (await saveDraft()) window.location.assign(noahUploadPath(window.location.search, savedId));
  }
  async function removeDraft(savedId: string, revision: number) {
    if (draft.current.busy || pending) return;
    draft.current.busy = true;
    try {
      const response = await fetch(`/api/noah/drafts/${savedId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope }, body: JSON.stringify({ revision: savedId === draft.current.id ? draft.current.revision : revision }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || '下書きを削除できません。');
      setDrafts(rows => rows.filter(d => d.id !== savedId));
      setStorageTick(n=>n+1);
      if (draft.current.id === savedId) {
        draft.current = { id:'', revision:0, saved:'', busy:true }; draftRetry.current = null;
        setManifest({ ...noahAgentTemplate, name:'', summary:'', author:'', adapter:'source', endpointUrl:null, priceNote:'' });
        setCode(''); setSource(null); setRights(false); setId(''); setDraftRevision(0);
        window.history.replaceState(window.history.state, '', noahUploadPath(window.location.search, ''));
      }
      setDraftError(''); setDraftMessage('下書きを削除しました。');
    } catch (e) { setDraftError(e instanceof Error ? e.message : '削除できません。'); }
    finally { draft.current.busy = false; }
  }
  function change(patch: Partial<NoahAgentManifest>) { setManifest(m => ({ ...m, ...patch })); setId(''); }
  async function importSource() {
    if (!scope || pending || !rights) return;
    setPending(true); setError(''); setImportMessage('公開リポジトリの版とコードを取得中…');
    try {
      const response = await fetch('/api/noah/import', { method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope }, body: JSON.stringify({ url: manifest.sourceUrl, revision: importRevision || undefined, rightsConfirmed: true }) });
      if (!response.ok) { const data = await response.json() as { error?: string }; throw new Error(data.error || 'コードを取得できません。'); }
      const filename = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'source.zip';
      const file = new File([await response.blob()], filename, { type: 'application/zip' });
      setSource(file); setCodeMode('file'); setId('');
      setImportMessage(`${response.headers.get('x-noah-source-files')}ファイルを取得しました。版: ${response.headers.get('x-noah-source-commit')?.slice(0, 12)}。対象外: ${response.headers.get('x-noah-source-omitted')}ファイル。下の「自分のNoahに保存」で整理して登録します。`);
    } catch (e) { setError(e instanceof Error ? e.message : 'コードを取得できません。'); setImportMessage('取得を完了できませんでした。入力と選択済みファイルは残っています。'); }
    finally { setPending(false); }
  }
  async function importDefinition(file?: File) {
    if (!file) return;
    try {
      if (file.size > NOAH_MANIFEST_LIMIT) throw new Error('定義JSONは32KiBまでです。');
      setManifest(parseNoahAgentManifest(JSON.parse(await file.text()))); setId(''); setRights(false); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : '定義ファイルを確認してください。'); }
  }
  function template() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(noahAgentTemplate, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'noah-agent.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || !scope || !rights) return;
    setError(''); setPending(true); setProcessingMessage('');
    const controller = new AbortController(); processingController.current = controller;
    try {
      if (!await saveDraft() || !draft.current.id || draft.current.revision < 1) throw new Error('最新の入力を下書きへ保存してから登録します。保存・再試行を確認してください。');
      const draftReference = { id: draft.current.id, revision: draft.current.revision };
      const parsed = parseNoahAgentManifest(manifest), uploadId = id || crypto.randomUUID(); setId(uploadId);
      const headers = { [OWNER_SCOPE_HEADER]: scope };
      let body: BodyInit;
      let inputFile = source;
      if (codeMode === 'paste') {
        if (!code.trim()) throw new Error('保存するコードを貼り付けてください。');
        if (new TextEncoder().encode(code).length > NOAH_CODE_LIMIT) throw new Error('貼り付けコードは64KiBまでです。');
        inputFile = new File([code], codeName);
      }
      if (inputFile) {
        if (inputFile.size > NOAH_SOURCE_LIMIT) throw new Error('ファイルは10MiBまでです。');
        inputFile = await bundleUploadTest(inputFile, testName, testCode);
        const form = new FormData(); form.set('id', uploadId); form.set('manifest', JSON.stringify(parsed)); form.set('rightsConfirmed', 'true'); form.set('source', inputFile); form.set('draft', JSON.stringify(draftReference));
        if (verifiedRefactor) {
          if (!processorAvailable) throw new Error('固定テストで整理する実行先に接続できません。接続を確認するか、「固定テストで確認して整理する」を外して原本・構文整理だけで保存してください。');
          const receipt = await processUpload(inputFile, uploadId, scope, setProcessingMessage, controller.signal);
          form.set('processingReceipt', JSON.stringify(receipt));
        }
        body = form;
      } else { body = JSON.stringify({ id: uploadId, manifest: parsed, rightsConfirmed: true, draft: draftReference }); Object.assign(headers, { 'Content-Type': 'application/json' }); }
      controller.signal.throwIfAborted(); setProcessingMessage('原本と確認済みの結果を保存中…');
      const response = await fetch('/api/noah/agents', { method: 'POST', headers, body, signal: controller.signal });
      const data = await response.json() as { agent: { id: string }; error?: string }; if (!response.ok) throw new Error(data.error || '保存できませんでした。');
      draft.current.saved = draftSignature;
      router.push(`/noah/agents/${data.agent.id}`);
    } catch (e) { setError(controller.signal.aborted ? '整理を停止しました。入力は残っています。' : e instanceof Error ? e.message : '保存先に接続できません。再試行してください。'); if (controller.signal.aborted) setId(''); }
    finally { setPending(false); processingController.current = null; }
  }
  return <div className={`${styles.page} ${styles.formPage}`}>
    <nav className={styles.nav}><Link href="/noah/agents">← Agent一覧</Link></nav>
    <header className={styles.hero}><div><span className={styles.eyebrow}>YOUR AGENT</span><h1>自分のAgentを追加</h1><p>コードを選ぶ、または貼り付ける。対応するコードは整理して保存します。<br />元コードも残し、追加したAgentは自分だけの一覧に入ります。</p></div></header>
    {!scope && <section className={styles.notice} aria-label="アカウントの確認">
      {accountChecking ? <output>アカウントを確認中…</output> : <>
        <p>{signedOut ? 'サインインすると、自分のAgentの登録と下書きの保存ができます。' : 'アカウントの確認後に登録できます。'}</p>
        <Link className={styles.primary} href={`/account?mode=login&returnTo=${encodeURIComponent(returnPath)}`}>サインインして登録を続ける</Link>
        <button type="button" onClick={() => { setAccountChecking(true); setSignedOut(false); setError(''); setAttempt(n => n + 1); }}>アカウントを再確認</button>
      </>}
    </section>}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    <section className={styles.notice} aria-label="下書き">
      <h2>非公開の下書き</h2><p>入力途中でも保存し、後から再開できます。コードとファイルは保存権利の確認後に保管します。</p>
      <output aria-live="polite">{!scope ? 'サインイン後に保存した下書きを確認します。' : draftLoading ? '保存した下書きを確認中…' : draftMessage || '入力すると自動保存します。'}</output>
      {(draftError || (source && source.size > NOAH_SOURCE_LIMIT)) && <p role="alert" className={styles.error}>{source && source.size > NOAH_SOURCE_LIMIT ? 'ファイルは10MiBまでです。選び直してください。' : draftError}</p>}
      {restoreFailed ? <button type="button" disabled={draftLoading} onClick={() => { setDraftLoading(true); setRestoreFailed(false); setDraftError(''); restoreStarted.current = false; setRestoreAttempt(n => n + 1); }}>保存した下書きを読み直す</button> : <button type="button" disabled={!scope || draftLoading || pending || hashing} onClick={() => { void saveDraft(); }}>下書きを保存・再試行</button>}
      {!!drafts.length && <details><summary>保存した下書きから再開</summary>{drafts.map(d => <p key={d.id}><button type="button" disabled={pending || draftLoading || hashing || restoreFailed} onClick={() => { void openDraft(d.id); }}>{d.name} · {new Date(d.updatedAt).toLocaleString('ja-JP')}</button> <button type="button" disabled={pending} onClick={() => { void removeDraft(d.id, d.revision); }}>削除</button></p>)}</details>}
    </section>
    {scope && <NoahDraftStoragePanel key={scope} scope={scope} refresh={storageTick} disabled={pending || draftLoading || hashing} onRestored={(restoredId)=>{ void openDraft(restoredId); }} />}
    <form onSubmit={save}><fieldset disabled={!scope || accountChecking || pending || draftLoading || restoreFailed} className={styles.fields}>
      <section className={styles.notice} aria-labelledby="source-heading"><h2 id="source-heading">Agentのコード</h2><p>登録時に自動リファクタ · 元コードを保管</p>
        <p>専用画面を作らずに始められます。ターミナル用テンプレートには処理コードと固定テストが入っています。</p>
        <div className={styles.actions}>{(['node', 'python'] as const).map(language => <button key={language} type="button" onClick={() => {
          const t = noahTerminalTemplate(language); setManifest(t.manifest); setSource(new File([new Uint8Array(t.bytes)], t.name, { type: 'application/zip' })); setCodeMode('file'); setId(''); setRights(false);
        }}>{language === 'node' ? 'Nodeのテンプレートを使う' : 'Pythonのテンプレートを使う'}</button>)}</div>
        <label className={styles.check}><input type="checkbox" required checked={rights} onChange={e => setRights(e.target.checked)} />このAgentの内容・利用条件を確認し、登録するファイルを保存する権利があります。</label>
        <div className={styles.actions}><button type="button" aria-pressed={codeMode === 'file'} onClick={() => { setCodeMode('file'); setId(''); }}>ファイルを選ぶ</button><button type="button" aria-pressed={codeMode === 'paste'} onClick={() => { setCodeMode('paste'); setId(''); }}>コードを貼り付ける</button></div>
        {codeMode === 'file' ? <label>コード・配布ファイル（任意・10MiBまで）{source && <span>{source.name}（{source.size.toLocaleString()}バイト）</span>}<input type="file" onChange={e => { setSource(e.target.files?.[0] || null); setId(''); }} /></label> : <div className={styles.fields}>
          <label>コードのファイル名<input required maxLength={120} value={codeName} onChange={e => { setCodeName(e.target.value); setId(''); }} placeholder="agent.ts" /></label>
          <label>コード（UTF-8・64KiBまで）<textarea required rows={12} spellCheck={false} value={code} onChange={e => { setCode(e.target.value); setId(''); }} placeholder="ここにAgentのコードを貼り付けてください" /></label>
        </div>}
        <details open={!!importRevision}><summary>GitHub・Hugging Faceからコードを取得</summary><div className={styles.fields}>
          <label>公開リポジトリのURL<input type="url" value={manifest.sourceUrl || ''} onChange={e => change({ sourceUrl: e.target.value || null })} placeholder="https://huggingface.co/spaces/作者/Agent" /></label>
          <label>取得するブランチ・commit（任意）<input value={importRevision} maxLength={100} onChange={e => setImportRevision(e.target.value)} placeholder="未指定なら既定の版" /></label>
          <button type="button" disabled={!scope || !rights || pending || !manifest.sourceUrl} onClick={() => { void importSource(); }}>コードを取得する</button>
          <p>公開コード・設定・ライセンスを32ファイルまで取得します。モデルの重み、非公開・利用条件付きの配布物は含みません。取得記録をZIPに残します。</p>
          {importMessage && <output aria-live="polite">{importMessage}</output>}
        </div></details>
        <label className={styles.check}><input type="checkbox" checked={verifiedRefactor} onChange={e => { setVerifiedRefactor(e.target.checked); setId(''); }} />固定テストで確認して整理する（JS・TS・Python）</label>
        <p>{processorAvailable === null ? '検証する実行先を確認中…' : processorAvailable ? 'このMacの隔離環境で変更前後を検証します。コードを外部モデルへ送りません。' : '固定テストを実行する接続先がありません。構文整理のみの保存も選べます。'}</p>
        <details><summary>単一ファイル・貼り付けコードに固定テストを添付</summary><div className={styles.fields}>
          <label>テストのファイル名<input maxLength={120} value={testName} onChange={e => { setTestName(e.target.value); setId(''); }} placeholder="agent.test.mjs または test_agent.py" /></label>
          <label>元コードに対するテスト（32KiBまで）<textarea rows={7} value={testCode} spellCheck={false} onChange={e => { setTestCode(e.target.value); setId(''); }} /></label>
          <small>テストは原本と一緒に保存し、整理担当Agentによる書き換えを拒否します。ZIPの場合は .test.mjs または test_名前.py を中に入れてください。</small>
        </div></details>
        <small>固定テストがない、依存が未対応、または検証が失敗した場合は原本を保ち、理由を表示します。検証は64ファイル・合計1MiBまで、整理Agentの入力は12KBまでです。構文整理のみの場合はJS/TSの限定ルールを適用し、型・動作は検証しません。秘密情報は含めないでください。</small>
      </section>
      <div className={styles.import}><label>定義JSONを読み込む<input type="file" accept=".json,application/json" onChange={e => { void importDefinition(e.target.files?.[0]); e.target.value = ''; }} /></label><button type="button" onClick={template}>テンプレートをダウンロード</button></div>
      <label>Agentの名前<input required maxLength={100} value={manifest.name} onChange={e => change({ name: e.target.value })} placeholder="例：毎朝のニュース担当" /></label>
      <label>何をしてくれるAgent？<textarea required rows={4} maxLength={2000} value={manifest.summary} onChange={e => change({ summary: e.target.value })} placeholder="できる仕事、必要な入力、受け取れる成果を書いてください。" /></label>
      <div className={styles.columns}><label>作者<input required maxLength={100} value={manifest.author} onChange={e => change({ author: e.target.value })} /></label><label>版<input required value={manifest.version} onChange={e => change({ version: e.target.value })} placeholder="1.0.0" /></label></div>
      <label>どう使うAgent？<select value={manifest.adapter} onChange={e => { const { runtime: _runtime, ...base } = manifest; setManifest({ ...base, adapter: e.target.value as NoahAgentManifest['adapter'], endpointUrl: e.target.value === 'source' ? null : '' }); setId(''); }}>
        <option value="source">コードを保存して実行先を準備する</option><option value="web">専用のWeb画面を開く</option><option value="mcp_http">MCPサーバーに接続する</option><option value="a2a">A2A対応Agentに接続する</option>{manifest.adapter === 'local_app' && <option value="local_app">対応済みローカルアプリ</option>}
      </select></label>
      {manifest.adapter === 'source' && <section className={styles.notice}><h2>画面を使わない実行</h2>
        <label><input type="checkbox" checked={Boolean(manifest.runtime)} onChange={e => {
          if (e.target.checked) change({ runtime: { schema: 'noah-terminal/1', language: 'node', entrypoint: 'main.mjs', model: 'none' }, permissions: ['read_input', 'write_files'] });
          else { const { runtime: _runtime, ...base } = manifest; setManifest(base); setId(''); }
        }} />ターミナル用コードとして接続・実行する</label>
        {manifest.runtime && <div className={styles.fields}>
          <label>実行する言語<select value={manifest.runtime.language} onChange={e => change({ runtime: { ...manifest.runtime!, language: e.target.value, entrypoint: e.target.value === 'python' ? 'main.py' : 'main.mjs' } })}><option value="node">Node（JavaScript・TypeScript）</option><option value="python">Python</option></select></label>
          <label>起動するファイル<input required value={manifest.runtime.entrypoint} maxLength={160} onChange={e => change({ runtime: { ...manifest.runtime!, entrypoint: e.target.value } })} /></label>
          <label>使うローカルモデル<select value={manifest.runtime.model} onChange={e => change({ runtime: { ...manifest.runtime!, model: e.target.value } })}><option value="none">モデルを使わない処理</option><option value="qwen3:4b">qwen3:4b</option><option value="qwen2.5:1.5b">qwen2.5:1.5b</option></select></label>
          <p>標準ライブラリと同梱コードに対応します。本人の画面・マウス・キーボード・ブラウザには接続しません。外部通信や追加依存が必要なAgentは、その実行環境の対応が必要です。</p>
        </div>}
      </section>}
      {!['local_app','source'].includes(manifest.adapter) && <label>{manifest.adapter === 'a2a' ? 'AgentのHTTPS origin' : '接続先URL'}<input required type="url" value={manifest.endpointUrl || ''} onChange={e => change({ endpointUrl: e.target.value })} placeholder={manifest.adapter === 'mcp_http' ? 'https://your-agent.com/mcp' : 'https://your-agent.com'} /><small>APIキーやパスワードは含めないでください。</small></label>}
      <p>必要な権限</p><div className={styles.checks}>{NOAH_PERMISSIONS.map(p => <label key={p}><input type="checkbox" checked={manifest.permissions.includes(p)} onChange={e => change({ permissions: e.target.checked ? [...manifest.permissions, p] : manifest.permissions.filter(v => v !== p) })} />{permissionLabels[p]}</label>)}</div>
      <label>料金・利用条件<textarea required rows={2} value={manifest.priceNote} maxLength={500} onChange={e => change({ priceNote: e.target.value })} placeholder="例：Agentは無料。モデルAPIの料金は利用者負担。" /></label>
      <details className={styles.notice}><summary>ソースURL・識別名・ライセンス</summary><div className={styles.fields}>
        <label>GitHubなどのソースURL（任意）<input type="url" value={manifest.sourceUrl || ''} onChange={e => change({ sourceUrl: e.target.value || null })} /></label>
        <small>取得する場合は上の「GitHub・Hugging Faceからコードを取得」を使います。参照URLの入力だけでは取得しません。</small>
        <div className={styles.columns}><label>識別名<input required value={manifest.id} onChange={e => change({ id: e.target.value })} /></label><label>ライセンス<input required value={manifest.license} onChange={e => change({ license: e.target.value })} /></label></div>
      </div></details>
      <button className={styles.primary} disabled={!scope || !rights || pending || processorAvailable === null} type="submit">{pending ? '原本の確認・コードの整理・保存中…' : '自分のNoahに保存'}</button>
    </fieldset></form>
    {processingMessage && <output aria-live="polite">{processingMessage}</output>}
    {pending && processingMessage && <button type="button" onClick={() => processingController.current?.abort()}>整理・保存を中止</button>}
  </div>;
}
