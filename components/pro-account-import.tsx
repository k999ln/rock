'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { inspectProFile, proArchiveId, proDecode, PRO_FILE_LIMIT, PRO_ARCHIVE_CONSENT, type ProFile } from '@/lib/pro-account-import';
import { subscribeZemaPrivateStorage } from '@/lib/zema-private-storage';

type Context = { ownerScope: string; binding: string; destination: string; accountHint: string };
type Receipt = { id: string; state: string; revision: number; savedChunks: number;
  manifest?: { filename: string; fileSha256: string; byteLength: number; operationId: string; requestDigest: string; chunkCount: number };
  fileBase64?: string };
type View = { intent: number; file: ProFile | null; context: Context | null; receipt: Receipt | null;
  verified: ProFile | null; consent: boolean; target: string; written: boolean; needsReadback: boolean;
  identity: 'unchecked' | 'checking' | 'confirmed'; busy: boolean; status: string };
const endpoint = '/api/account/pro-import';
const initial: View = { intent: 0, file: null, context: null, receipt: null, verified: null, consent: false,
  target: '', written: false, needsReadback: false, identity: 'unchecked', busy: false,
  status: 'Choose a file to preview locally. No original notes are changed.' };
class ImportResponseError extends Error {
  readonly invalidIdentity: boolean;
  constructor(code: string, status: number) { super(code); this.invalidIdentity = status === 401 || code === 'OWNER_CHANGED'; }
}
export default function ProAccountImport() {
  const [view, setView] = useState<View>(initial);
  // Every callback and async completion reads this synchronous intent fence, not captured render state.
  const live = useRef<View>(initial), alive = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null), privatePanel = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  function current(intent: number) { return alive.current && live.current.intent === intent; }
  function update(patch: Partial<View>) {
    if (!alive.current) return;
    live.current = { ...live.current, ...patch }; setView(live.current);
  }
  function invalidate() { abort.current?.abort(); update({ intent: live.current.intent + 1, busy: false, consent: false }); }
  function clearOwner() {
    invalidate();
    update({ ...initial, intent: live.current.intent, status: 'Account changed. Select the file and confirm the destination again.' });
    if (privatePanel.current) privatePanel.current.hidden = true;
    if (fileInput.current) fileInput.current.value = '';
  }
  function quarantine() {
    const previous = live.current;
    invalidate();
    // Hide the existing DOM synchronously as well as fencing stale callbacks before React paints.
    if (fileInput.current) fileInput.current.value = '';
    if (privatePanel.current) privatePanel.current.hidden = true;
    update({ identity: 'checking', needsReadback: previous.needsReadback || previous.written && previous.busy,
      status: 'Account identity unconfirmed. Private content is hidden until this account is rechecked.' });
  }
  async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, { ...init, cache: 'no-store', credentials: 'same-origin' });
    const value = await response.json().catch(() => null) as (T & { error?: string }) | null;
    // Parsing has no owner-state side effects. Only the initiating current intent may invalidate state.
    if (!response.ok) throw new ImportResponseError(value?.error || 'UNAVAILABLE', response.status);
    if (!value) throw new Error('INVALID_RESPONSE');
    return value;
  }
  function fail(intent: number, error: unknown, patch: Partial<View>) {
    if (!current(intent)) return;
    if (error instanceof ImportResponseError && error.invalidIdentity) clearOwner();
    else update(patch);
  }
  function permitted(intent: number) {
    return current(intent) && document.visibilityState !== 'hidden' && live.current.identity === 'confirmed';
  }
  function headers(c: Context) { return { 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': c.ownerScope, 'X-Rock-Eve-Owner': c.binding }; }
  async function checkReceipt(r: Receipt, id: string, expected: ProFile | null) {
    if (r.id !== id) throw new Error('IMPORT_CONFLICT');
    if (expected && r.manifest && (r.manifest.requestDigest !== expected.requestDigest || r.manifest.operationId !== expected.operationId)) throw new Error('IMPORT_CONFLICT');
    if (r.state !== 'complete') return null;
    if (!r.fileBase64 || !r.manifest) throw new Error('INCOMPLETE');
    const checked = await inspectProFile(r.manifest.filename, proDecode(r.fileBase64));
    if (checked.fileSha256 !== r.manifest.fileSha256 || checked.byteLength !== r.manifest.byteLength
      || checked.requestDigest !== r.manifest.requestDigest || expected && checked.fileSha256 !== expected.fileSha256) throw new Error('IMPORT_CONFLICT');
    return checked;
  }
  async function choose(selected: File | undefined) {
    if (!alive.current || document.visibilityState === 'hidden') return;
    invalidate(); const generation = live.current.intent;
    // A deliberate new selection is a new unbound intent. Earlier auth/archive responses cannot own it.
    update({ ...initial, intent: generation, needsReadback: live.current.needsReadback });
    if (!selected) return;
    try {
      if (selected.size > PRO_FILE_LIMIT) throw new Error('File exceeds 256 KiB.');
      const checked = await inspectProFile(selected.name, new Uint8Array(await selected.arrayBuffer()));
      if (!current(generation)) return;
      update({ file: checked, status: 'Local preview ready. Confirm the account and give separate save consent.' });
    } catch { if (current(generation)) update({ status: 'File rejected. No upload or storage change occurred.' }); }
  }
  const confirmAccount = async (intent: number, returning = false) => {
    if (!current(intent)) return;
    quarantine(); const generation = live.current.intent, previous = live.current.context;
    if (document.visibilityState === 'hidden') return;
    update({ busy: true });
    try {
      const next = await request<Context>(endpoint);
      if (!current(generation)) return;
      if (previous && next.ownerScope !== previous.ownerScope) { clearOwner(); return; }
      update({ context: next, identity: 'confirmed', consent: false,
        status: returning ? 'Account rechecked. Review the original and give fresh consent before saving.'
          : `Destination confirmed: private account ${next.accountHint}. No file uploaded.` });
    } catch (error) { fail(generation, error, { identity: 'checking', status: 'Sign in on this host and check account storage readiness. Private content remains hidden; original file is retained.' }); }
    finally { if (current(generation)) update({ busy: false }); }
  };
  async function readback(intent: number) {
    const state = live.current;
    if (!permitted(intent) || !state.context || state.busy) return;
    const context = state.context, file = state.file;
    update({ busy: true, verified: null, consent: false });
    try {
      const id = state.target || (file ? await proArchiveId(context.ownerScope, file.operationId) : '');
      if (!id || !permitted(intent)) return;
      update({ target: id });
      const r = await request<Receipt>(`${endpoint}?${new URLSearchParams({ id })}`, { headers: headers(context) });
      if (!permitted(intent)) return;
      const checked = await checkReceipt(r, id, file);
      if (!permitted(intent)) return;
      update({ receipt: r, verified: checked, needsReadback: false,
        status: checked ? 'Original file read back and byte/hash verified. Jobs and native migration have not started.' : r.state === 'partial'
          ? 'Partial archive found. Original retained. Confirm consent to continue at this revision.' : 'No archive found. Original retained.' });
    } catch (error) { fail(intent, error, { status: 'Readback unresolved or conflicted. Keep the original file; do not create a second archive.' }); }
    finally { if (current(intent)) update({ busy: false }); }
  }
  async function save(intent: number) {
    const state = live.current;
    if (!permitted(intent) || !state.file || !state.context || !state.consent || state.busy || state.needsReadback) return;
    const file = state.file, context = state.context, controller = new AbortController(); abort.current = controller;
    update({ busy: true, verified: null });
    try {
      const id = await proArchiveId(context.ownerScope, file.operationId);
      if (!permitted(intent)) return;
      update({ target: id });
      let revision = state.receipt?.id === id ? state.receipt.revision : 0;
      for (let batch = 0; batch < 8; batch++) {
        if (!permitted(intent)) return;
        update({ written: true });
        const r = await request<Receipt>(endpoint, { method: 'POST', headers: headers(context), signal: controller.signal,
          body: JSON.stringify({ filename: file.filename, fileBase64: file.fileBase64, operationId: file.operationId,
            expectedRevision: revision, consent: PRO_ARCHIVE_CONSENT }) });
        if (!permitted(intent)) return;
        const checked = await checkReceipt(r, id, file);
        if (!permitted(intent)) return;
        update({ receipt: r }); revision = r.revision;
        if (checked) { update({ verified: checked, consent: false, status: 'Original file archived privately and byte/hash verified. No jobs, AI or native migration started.' }); return; }
        update({ status: 'Saving original parts. Cancel stops later requests; an in-flight result needs readback.' });
      }
      throw new Error('INCOMPLETE');
    } catch (error) { fail(intent, error, { consent: false, needsReadback: true, status: 'Outcome unknown or conflicted. Read back the same archive before continuing. Original file is retained.' }); }
    finally { if (current(intent)) update({ busy: false }); }
  }
  function cancel(intent: number) {
    if (!current(intent)) return;
    const was = live.current; invalidate();
    update({ file: null, verified: null, needsReadback: was.needsReadback || was.written,
      ...(was.identity !== 'confirmed' ? { context: null, receipt: null, target: '', written: false, identity: 'unchecked' as const } : {}),
      status: was.written ? 'Later requests stopped. In-flight storage is unknown until same-ID readback. Original file is retained.' : 'Preview cancelled. No file was uploaded.' });
    if (fileInput.current) fileInput.current.value = '';
  }
  function download(intent: number) {
    if (!permitted(intent) || live.current.busy || !live.current.verified) return;
    const original = live.current.verified;
    const url = URL.createObjectURL(new Blob([Uint8Array.from(proDecode(original.fileBase64)).buffer], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = original.filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => {
    alive.current = true; update({});
    const panel = privatePanel.current;
    const unsubscribe = subscribeZemaPrivateStorage(clearOwner);
    const recheck = () => {
      if (document.visibilityState === 'hidden') quarantine();
      else void confirmAccount(live.current.intent, true);
    };
    window.addEventListener('focus', recheck);
    window.addEventListener('blur', quarantine);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      unsubscribe(); window.removeEventListener('focus', recheck); window.removeEventListener('blur', quarantine);
      document.removeEventListener('visibilitychange', recheck); alive.current = false; abort.current?.abort();
      live.current = { ...live.current, intent: live.current.intent + 1 };
      if (panel) panel.hidden = true;
    };
  }, []);
  const exposed = view.identity !== 'checking', authorized = view.identity === 'confirmed';
  return <section aria-label="Pro private original archive">
    <p>Move an explicitly selected export from avocadoPro into this account’s private encrypted history. Keep your original file and browser notes.</p>
    <p>avocadopro.si is Pro; avocadomini.si is Mini; avoado.si is the general and Smith/Sky account entry. This page copies no cookies or other-origin storage.</p>
    <label htmlFor="pro-original-file">Choose Pro export file (up to 256 KiB)</label>
    <input ref={fileInput} id="pro-original-file" type="file" accept=".json,application/json" disabled={view.busy} onChange={e => void choose(e.currentTarget.files?.[0])} />
    <div ref={privatePanel} hidden={!exposed}>
      {exposed && view.file && <details open><summary>Local file preview</summary><p>{view.file.filename} · {view.file.byteLength} bytes</p>
        <p>Full file SHA-256: {view.file.fileSha256}</p><p>Logical notes SHA-256: {view.file.contentSha256}</p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{view.file.draft}</pre>
        <ul>{view.file.items.map(item => <li key={item.sourceItemId}>{item.objective} {item.legacyChecked ? '(checked in old local board; still a draft)' : '(draft)'}</li>)}</ul></details>}
      {exposed && view.context && <p>Destination: {view.context.destination} · {view.context.accountHint}</p>}
    </div>
    <button type="button" disabled={view.busy} onClick={() => void confirmAccount(view.intent)}>Confirm signed-in account</button>
    <label><input type="checkbox" checked={view.consent} disabled={view.busy || !view.file || !authorized} onChange={e => {
      if (permitted(view.intent) && !live.current.busy) update({ consent: e.target.checked });
    }} />Save this exact original file privately to this account. Keep it out of memory search; do not start jobs or delete the source.</label>
    <button type="button" disabled={view.busy || !view.file || !authorized || !view.consent || view.needsReadback} onClick={() => void save(view.intent)}>Save / continue private archive</button>
    <button type="button" disabled={view.busy || !authorized || !view.file && !view.target} onClick={() => void readback(view.intent)}>Read back same archive</button>
    <button type="button" onClick={() => cancel(view.intent)}>Cancel preview / stop later saves</button>
    <button type="button" disabled={!view.verified || view.busy || !authorized} onClick={() => download(view.intent)}>Download verified original bytes</button>
    <output aria-live="polite">{view.status}</output>
    <p>Saving an original is separate from converting notes to jobs or installing a native Pro OS. <Link href="/connect">Account connection</Link></p>
  </section>;
}
