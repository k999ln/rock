import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProLocalExport } from '../sites/avocado-mini/src/pro-local-import.mjs';
import { createProImportHandler } from '../lib/pro-account-import.server.ts';
import { inspectProFile, proArchiveId, proDecode, PRO_FILE_LIMIT, PRO_ARCHIVE_CONSENT } from '../lib/pro-account-import.ts';
import { eveHistoryStore, eveHistoryKeys } from '../lib/eve-history.ts';

const keys = { current: 'fixture1', keys: { fixture1: '12'.repeat(32) } };
function dbAdapter(sqlite) {
  const prepare = (sql, args = []) => ({ bind(...values) { return prepare(sql, values); },
    first() { return sqlite.prepare(sql).get(...args) ?? null; },
    all() { return { results: sqlite.prepare(sql).all(...args) }; },
    run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; } });
  return { prepare, batch(statements) { sqlite.exec('BEGIN'); try { const result = statements.map(s => s.run()); sqlite.exec('COMMIT'); return Promise.resolve(result); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
}
function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'pro-import-')); const path = join(folder, 'fixture.sqlite');
  const sqlite = new DatabaseSync(path); sqlite.exec(readFileSync(new URL('../drizzle/0032_eve_durable_history.sql', import.meta.url), 'utf8'));
  const second = new DatabaseSync(path); t.after(() => { second.close(); sqlite.close(); rmSync(folder, { recursive: true, force: true }); });
  const db = dbAdapter(sqlite), other = dbAdapter(second);
  const authenticate = async request => { const token = request.headers.get('authorization');
    if (token === 'Bearer alpha') return 'owner-a'; if (token === 'Bearer beta') return 'owner-b'; throw new Error('UNAUTHORIZED'); };
  const handle = createProImportHandler({ authenticate, database: () => db, keys: () => keys });
  return { sqlite, db, other, handle, handler: overrides => createProImportHandler({ authenticate, database: () => db, keys: () => keys, ...overrides }) };
}
async function file({ padded = false, bom = false, name = 'original.json' } = {}) {
  const raw = { 'avocadoProOS:draft:v1': padded ? 'draft' : 'private こんにちは\r\nkeep  spaces',
    'avocadoProOS:tasks:v1': JSON.stringify([{ id: 'old-one', text: 'x'.repeat(160), done: true }], null, 2) };
  const envelope = await createProLocalExport({ getItem: k => raw[k] });
  let text = JSON.stringify(envelope, null, 2).replaceAll('\n', '\r\n');
  if (padded) text = text.padEnd(PRO_FILE_LIMIT, ' ');
  if (bom) text = '\uFEFF' + text;
  const bytes = new TextEncoder().encode(text), inspected = await inspectProFile(name, bytes);
  return { raw, bytes, ...inspected };
}
async function context(handle, token = 'alpha') {
  const response = await handle(new Request('https://avoado.si/api/account/pro-import', { headers: { authorization: `Bearer ${token}` } }));
  assert.equal(response.status, 200); return response.json();
}
function req(ctx, token = 'alpha', body, id) {
  return new Request(`https://avoado.si/api/account/pro-import${id ? '?id=' + id : ''}`, {
    method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, origin: 'https://avoado.si', 'content-type': 'application/json',
      'X-Rock-Owner-Scope': ctx.ownerScope, 'X-Rock-Eve-Owner': ctx.binding }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const body = (f, expectedRevision = 0) => ({ filename: f.filename, fileBase64: f.fileBase64, operationId: f.operationId, expectedRevision, consent: PRO_ARCHIVE_CONSENT });
async function finish(handle, ctx, f, revision = 0) {
  let value;
  for (let batch = 0; batch < 8; batch++) { const response = await handle(req(ctx, 'alpha', body(f, revision))); assert.equal(response.status, 200); value = await response.json();
    revision = value.revision; if (value.state === 'complete') return value; assert.equal(value.state, 'partial'); }
  assert.fail('archive did not complete');
}

void test('BOM/CRLF/Unicode original bytes and filename survive encrypted owner archive; legacy checked never starts work', async t => {
  const { handle, sqlite, db } = fixture(t), f = await file({ bom: true, name: '原本.json' }), before = JSON.stringify(f.raw), ctx = await context(handle);
  const saved = await finish(handle, ctx, f); assert.deepEqual(proDecode(saved.fileBase64), f.bytes); assert.equal(saved.manifest.filename, f.filename);
  const id = await proArchiveId(ctx.ownerScope, f.operationId); assert.equal(saved.id, id); assert.equal(saved.manifest.fileSha256, f.fileSha256);
  assert.equal(JSON.stringify(f.raw), before); assert.equal(f.items[0].legacyChecked, true); assert.equal(f.items[0].proposedState, 'draft');
  const disk = JSON.stringify(sqlite.prepare('SELECT * FROM eve_messages').all()) + JSON.stringify(sqlite.prepare('SELECT * FROM eve_conversations').all());
  assert.doesNotMatch(disk, /こんにちは|原本|archive-private-original|pro-account-original/);
  assert.equal((await eveHistoryStore(db, 'owner-a', keys).recall('private こんにちは')).length, 0);
  const header = await eveHistoryStore(db, 'owner-a', keys).get(id); assert.equal(header.remember, false); assert.equal(header.session.activeRequest, null); assert.equal(header.session.workflowStatus, 'ready');
});
void test('max file requires eight bounded CAS saves and readback beyond100 messages, without a new table', async t => {
  const { handle, sqlite } = fixture(t), f = await file({ padded: true }), ctx = await context(handle);
  assert.equal(f.byteLength, PRO_FILE_LIMIT); const saved = await finish(handle, ctx, f);
  assert.equal(saved.revision, 8); assert.equal(saved.savedChunks, 117); assert.deepEqual(proDecode(saved.fileBase64), f.bytes);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_messages').get().n, 118);
  const readback = await handle(req(ctx, 'alpha', undefined, saved.id)); assert.equal((await readback.json()).state, 'complete');
});
void test('same request replays preserve ID/revision and reject filename/bytes changes for same logical operation', async t => {
  const { handle } = fixture(t), f = await file(), ctx = await context(handle), first = await finish(handle, ctx, f);
  const replay = await handle(req(ctx, 'alpha', body(f, 0))); const second = await replay.json(); assert.equal(second.id, first.id); assert.equal(second.revision, first.revision);
  const renamed = { ...body(f), filename: 'renamed.json' }; assert.equal((await handle(req(ctx, 'alpha', renamed))).status, 409);
  const differentBytes = await inspectProFile(f.filename, new TextEncoder().encode(new TextDecoder().decode(f.bytes) + ' '));
  assert.equal(differentBytes.operationId, f.operationId); assert.notEqual(differentBytes.fileSha256, f.fileSha256);
  assert.equal((await handle(req(ctx, 'alpha', body(differentBytes)))).status, 409);
});
void test('owner change, forged body authority, missing binding, wrong origin and no consent refuse all writes', async t => {
  const { handle, sqlite } = fixture(t), f = await file(), ctx = await context(handle), b = body(f);
  assert.equal((await handle(req(ctx, 'beta', b))).status, 409);
  for (const value of [{ ...b, owner: 'owner-b' }, { ...b, trusted: true }, { ...b, consent: false }, { ...b, expectedRevision: -1 }]) assert.ok((await handle(req(ctx, 'alpha', value))).status >= 400);
  const foreign = req(ctx, 'alpha', b); foreign.headers.set('origin', 'https://avocadopro.si'); assert.equal((await handle(foreign)).status, 403);
  const missing = req(ctx, 'alpha', b); missing.headers.delete('X-Rock-Owner-Scope'); assert.equal((await handle(missing)).status, 409);
  const unauthorized = req(ctx, 'wrong', b); unauthorized.headers.set('oai-authenticated-user-id', 'owner-a'); assert.equal((await handle(unauthorized)).status, 401);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_conversations').get().n, 0);
  const saved = await finish(handle, ctx, f), other = await context(handle, 'beta'); const hidden = await handle(req(other, 'beta', undefined, saved.id)); assert.equal((await hidden.json()).state, 'not_found');
});
void test('independent SQLite connections compete at revision0; partial requires explicit current CAS revision', async t => {
  const { handle, handler, other, sqlite } = fixture(t), f = await file({ padded: true }), ctx = await context(handle), second = handler({ database: () => other });
  const results = await Promise.all([handle(req(ctx, 'alpha', body(f))), second(req(ctx, 'alpha', body(f)))]);
  assert.deepEqual(results.map(r => r.status).sort((a, b) => a - b), [200, 409]);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_messages').get().n, 16);
  assert.equal((await handle(req(ctx, 'alpha', body(f, 0)))).status, 409);
  const id = await proArchiveId(ctx.ownerScope, f.operationId), read = await (await handle(req(ctx, 'alpha', undefined, id))).json();
  assert.equal(read.state, 'partial'); assert.equal(read.revision, 1);
  const complete = await finish(second, ctx, f, read.revision); assert.equal(complete.savedChunks, 117);
});
void test('committed save with lost acknowledgment remains partial; same-ID readback and explicit continuation recover', async t => {
  const { handle, handler, db, sqlite } = fixture(t), f = await file({ padded: true }), ctx = await context(handle); let dropped = false;
  const uncertain = handler({ database: () => ({ ...db, async batch(statements) { const value = await db.batch(statements); if (!dropped) { dropped = true; throw new Error('lost acknowledgment'); } return value; } }) });
  assert.equal((await uncertain(req(ctx, 'alpha', body(f)))).status, 503);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_messages').get().n, 16);
  const id = await proArchiveId(ctx.ownerScope, f.operationId), read = await (await handle(req(ctx, 'alpha', undefined, id))).json();
  assert.equal(read.revision, 1); assert.equal((await handle(req(ctx, 'alpha', body(f, 0)))).status, 409);
  assert.equal((await finish(handle, ctx, f, read.revision)).state, 'complete');
});
void test('cancel means no later requests; restart/reselect keeps same ID and tombstone forbids resurrection', async t => {
  const { handle, db } = fixture(t), f = await file({ padded: true }), ctx = await context(handle);
  const first = await (await handle(req(ctx, 'alpha', body(f)))).json(); assert.equal(first.state, 'partial');
  const reselected = await inspectProFile(f.filename, f.bytes); assert.equal(await proArchiveId(ctx.ownerScope, reselected.operationId), first.id);
  const read = await (await handle(req(ctx, 'alpha', undefined, first.id))).json(); assert.equal(read.revision, 1);
  await eveHistoryStore(db, 'owner-a', keys).remove(first.id, 1);
  assert.equal((await handle(req(ctx, 'alpha', body(f, 0)))).status, 410);
});
void test('editing a partial chunk through another history client never permits overwrite or fake completion', async t => {
  const { handle, db } = fixture(t), f = await file({ padded: true }), ctx = await context(handle);
  const first = await (await handle(req(ctx, 'alpha', body(f)))).json(), store = eveHistoryStore(db, 'owner-a', keys), old = await store.get(first.id);
  await store.save({ session: { ...old.session, messages: [{ id: 'pro-part-0000', side: 'me', text: 'A'.repeat(3000) }] }, revision: old.revision, remember: false });
  assert.equal((await handle(req(ctx, 'alpha', body(f, 2)))).status, 409);
});
void test('strict file/HTTP parser rejects invalid UTF8, paths, controls, unknown fields/version/digest and oversize before persistence', async t => {
  const { handle, sqlite } = fixture(t), f = await file(), ctx = await context(handle);
  for (const name of ['../x.json', 'a/b.json', 'a\\b.json', 'a\0.json', '..', 'x.']) await assert.rejects(inspectProFile(name, f.bytes));
  await assert.rejects(inspectProFile('x.json', Uint8Array.from([0xff, 0xfe])));
  await assert.rejects(inspectProFile('x.json', new Uint8Array(PRO_FILE_LIMIT + 1)));
  for (const mutate of [v => v.owner = 'bad', v => v.schema = 'pro-local-import/2', v => v.contentSha256 = '0'.repeat(64), v => v.originals['avocadoProOS:draft:v1'] = 'x\0']) {
    const v = JSON.parse(new TextDecoder().decode(f.bytes)); mutate(v); await assert.rejects(inspectProFile('x.json', new TextEncoder().encode(JSON.stringify(v))));
  }
  assert.equal((await handle(req(ctx, 'alpha', { ...body(f), fileBase64: '!!!!' }))).status, 400);
  const excessive = req(ctx, 'alpha', body(f)); const giant = new Request(excessive.url, { method: 'POST', headers: excessive.headers, body: ' '.repeat(400001) }); assert.equal((await handle(giant)).status, 413);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_messages').get().n, 0);
});
void test('keyring unavailable fails closed and existing owner history survives new import unchanged', async t => {
  const { handle, handler, db, sqlite } = fixture(t), f = await file(), ctx = await context(handle);
  const missingKeys = handler({ keys: () => eveHistoryKeys(undefined) }); assert.equal((await missingKeys(req(ctx, 'alpha', body(f)))).status, 503);
  const id = '11111111-1111-4111-8111-111111111111';
  await eveHistoryStore(db, 'owner-a', keys).save({ session: { version: 1, id, toolId: 'sky-auto', createdAt: 1, messages: [{ id: 'm1', side: 'me', text: 'old private history' }], activeRequest: null, workflowStatus: 'ready', outcome: null }, revision: 0, remember: false });
  const before = sqlite.prepare('SELECT * FROM eve_conversations WHERE id=?').get(id);
  await finish(handle, ctx, f); assert.deepEqual(sqlite.prepare('SELECT * FROM eve_conversations WHERE id=?').get(id), before);
});

// Component event harness: real codec and HTTP/SQLite handler; DOM/download are synthetic.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';
import * as codec from '../lib/pro-account-import.ts';
function ui(handle, options = {}) {
  const slots = [], cleanups = [], calls = [], blobs = new Map(); let cursor = 0, tree, ownerEvent, download;
  const events = () => { const listeners = new Map(); return {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    dispatch(name) { for (const fn of listeners.get(name) ?? []) fn(); },
  }; };
  const windowSurface = events(), documentSurface = { ...events(), visibilityState: 'visible',
    createElement() { return { href: '', download: '', click() { download = { filename: this.download, blob: blobs.get(this.href) }; } }; } };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useEffect(effect) { if (!cleanups.length) { const cleanup = effect(); if (options.strictEffects) { cleanup?.(); cleanups.push(effect()); } else cleanups.push(cleanup); } },
  };
  const modules = { react, 'react/jsx-runtime': jsxRuntime, 'next/link': 'a', '@/lib/pro-account-import': codec,
    '@/lib/zema-private-storage': { subscribeZemaPrivateStorage(fn) { ownerEvent = fn; return () => {}; } } };
  const exports = {};
  class UiURL extends URL {
    static createObjectURL(blob) { const key = `blob:${blobs.size}`; blobs.set(key, blob); return key; }
    static revokeObjectURL() {}
  }
  const source = readFileSync(new URL('../components/pro-account-import.tsx', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require(name) { assert.ok(name in modules, name); return modules[name]; },
    URL: UiURL, URLSearchParams, AbortController, Blob, Uint8Array,
    setTimeout: fn => fn(),
    window: windowSurface, document: documentSurface,
    async fetch(path, init = {}) { calls.push({ path, init }); const headers = new Headers(init.headers); const owner = options.owner ? options.owner() : 'alpha'; if (owner) headers.set('authorization', `Bearer ${owner}`); headers.set('origin', 'https://avoado.si');
      const response = await handle(new Request(new URL(path, 'https://avoado.si'), { ...init, headers }));
      return options.intercept ? options.intercept(response, init) : response;
    },
  });
  function render() { cursor = 0; tree = exports.default(); for (const n of nodes(tree)) if (n.props?.ref && typeof n.props.ref === 'object') n.props.ref.current = { hidden: n.props.hidden, value: '' }; return tree; }
  function nodes(value, found = []) { if (Array.isArray(value)) value.forEach(v => nodes(v, found)); else if (value && typeof value === 'object') { found.push(value); nodes(value.props?.children, found); } return found; }
  function text(value) { if (value == null || typeof value === 'boolean') return ''; if (typeof value !== 'object') return String(value); return Array.isArray(value) ? value.map(text).join('') : text(value.props?.children); }
  const button = name => nodes(render()).find(n => n.type === 'button' && text(n) === name);
  async function until(check) { for (let i = 0; i < 150; i++) { render(); if (check()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail(`UI did not settle: ${text(render())}`); }
  async function chooseFile(f) { const input = nodes(render()).find(n => n.type === 'input' && n.props.type === 'file'); input.props.onChange({ currentTarget: { files: [{ name: f.filename, size: f.bytes.length, arrayBuffer: async () => Uint8Array.from(f.bytes).buffer }] } }); await until(() => text(tree).includes('Local preview ready.')); }
  render();
  return { calls, button, chooseFile, until, text: () => text(render()), status: () => text(nodes(render()).find(n => n.type === 'output')),
    consent() { const checkbox = nodes(render()).find(n => n.type === 'input' && n.props.type === 'checkbox'); assert.equal(checkbox.props.disabled, false); checkbox.props.onChange({ target: { checked: true } }); },
    accountChange: () => ownerEvent(), input: () => nodes(render()).find(n => n.type === 'input' && n.props.type === 'file'),
    focus: () => windowSurface.dispatch('focus'), blur: () => windowSurface.dispatch('blur'),
    visibility(state) { documentSurface.visibilityState = state; documentSurface.dispatch('visibilitychange'); },
    privatePanel: () => nodes(tree).find(n => n.type === 'div' && n.props.ref)?.props.ref.current,
    download: () => download, cleanup: () => cleanups.forEach(fn => fn?.()) };
}
void test('component requires local preview, account and separate consent; verifies actual bytes before download', async t => {
  const { handle } = fixture(t), f = await file({ bom: true, name: '私有.json' }), view = ui(handle); t.after(view.cleanup);
  await view.chooseFile(f); assert.equal(view.calls.length, 0); assert.equal(view.button('Save / continue private archive').props.disabled, true);
  view.button('Confirm signed-in account').props.onClick(); await view.until(() => view.status().startsWith('Destination confirmed:'));
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 0);
  view.consent(); view.button('Save / continue private archive').props.onClick(); await view.until(() => view.status().startsWith('Original file archived privately'));
  assert.equal(view.button('Download verified original bytes').props.disabled, false); view.button('Download verified original bytes').props.onClick();
  assert.equal(view.download().filename, f.filename); assert.deepEqual(new Uint8Array(await view.download().blob.arrayBuffer()), f.bytes);
  assert.ok(view.calls.every(c => c.path.startsWith('/api/account/pro-import'))); assert.ok(view.calls.every(c => !c.path.includes(f.filename)));
});
void test('component cancel during lost response stops later batches; same archive readback remains partial', async t => {
  const { handle, sqlite } = fixture(t), f = await file({ padded: true }); let release;
  const view = ui(handle, { intercept(response, init) { return init.method === 'POST' ? new Promise(resolve => { release = () => resolve(response); }) : response; } }); t.after(view.cleanup);
  await view.chooseFile(f); view.button('Confirm signed-in account').props.onClick(); await view.until(() => view.status().startsWith('Destination confirmed:'));
  view.consent(); view.button('Save / continue private archive').props.onClick(); await view.until(() => Boolean(release));
  view.button('Cancel preview / stop later saves').props.onClick(); release();
  await view.until(() => view.status().startsWith('Later requests stopped.'));
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 1); assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_messages').get().n, 16);
  view.button('Read back same archive').props.onClick(); await view.until(() => view.status().startsWith('Partial archive found.'));
  assert.equal(view.button('Download verified original bytes').props.disabled, true);
});
void test('component owner/logout event clears selected bytes and consent without uploading to the next owner', async t => {
  const { handle } = fixture(t), view = ui(handle); t.after(view.cleanup); await view.chooseFile(await file());
  view.button('Confirm signed-in account').props.onClick(); await view.until(() => view.status().startsWith('Destination confirmed:')); view.consent();
  view.accountChange(); assert.equal(view.button('Save / continue private archive').props.disabled, true); assert.doesNotMatch(view.text(), /Local file preview|こんにちは/);
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 0);
});

void test('component lost acknowledgement requires successful readback before any further write', async t => {
  const { handle, sqlite } = fixture(t); let drop = true;
  const view = ui(handle, { intercept(response, init) {
    if (init.method === 'POST' && drop) { drop = false; throw new Error('lost acknowledgement'); }
    return response;
  } }); t.after(view.cleanup);
  await view.chooseFile(await file({ padded: true }));
  view.button('Confirm signed-in account').props.onClick(); await view.until(() => view.status().startsWith('Destination confirmed:'));
  view.consent(); const capturedSave = view.button('Save / continue private archive').props.onClick; capturedSave(); await view.until(() => view.status().startsWith('Outcome unknown'));
  capturedSave();
  view.consent(); assert.equal(view.button('Save / continue private archive').props.disabled, true);
  view.button('Save / continue private archive').props.onClick();
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_messages').get().n, 16);
  view.button('Read back same archive').props.onClick(); await view.until(() => view.status().startsWith('Partial archive found.'));
  // Reconciliation requires fresh explicit consent, even if a checkbox was clicked while UNKNOWN.
  assert.equal(view.button('Save / continue private archive').props.disabled, true);
  view.consent(); view.button('Save / continue private archive').props.onClick(); await view.until(() => view.status().startsWith('Original file archived privately'));
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_conversations').get().n, 1);
});

async function ready(view, f) {
  await view.chooseFile(f); view.button('Confirm signed-in account').props.onClick();
  await view.until(() => view.status().startsWith('Destination confirmed:')); view.consent();
}
async function archived(view, f) {
  await ready(view, f); view.button('Save / continue private archive').props.onClick();
  await view.until(() => view.status().startsWith('Original file archived privately'));
}
const tick = () => new Promise(resolve => setTimeout(resolve, 40));
void test('returning other-tab owner masks DOM and stale handlers before recheck, then requires new selection and consent', async t => {
  const { handle, sqlite } = fixture(t); let owner = 'alpha', hold = false, release;
  const view = ui(handle, { owner: () => owner, intercept(response, init) {
    return hold && !init.method ? new Promise(resolve => { release = () => resolve(response); }) : response;
  } }); t.after(view.cleanup);
  await ready(view, await file({ name: 'owner-a-original.json' }));
  const oldSave = view.button('Save / continue private archive').props.onClick; oldSave();
  await view.until(() => view.status().startsWith('Original file archived privately'));
  const oldDownload = view.button('Download verified original bytes').props.onClick;
  owner = 'beta'; hold = true; view.focus();
  assert.equal(view.privatePanel().hidden, true, 'existing DOM must be masked synchronously'); oldSave(); oldDownload();
  assert.equal(view.download(), undefined); assert.doesNotMatch(view.text(), /owner-a-original|こんにちは|Destination: /);
  await view.until(() => Boolean(release)); assert.equal(view.button('Download verified original bytes').props.disabled, true);
  release(); await view.until(() => view.status().startsWith('Account changed.')); hold = false;
  oldSave(); oldDownload(); assert.equal(view.download(), undefined);
  assert.doesNotMatch(view.text(), /owner-a-original|こんにちは|Destination: /);
  await view.chooseFile(await file({ name: 'owner-b-new.json' }));
  assert.equal(view.button('Save / continue private archive').props.disabled, true);
  view.button('Confirm signed-in account').props.onClick(); await view.until(() => view.status().startsWith('Destination confirmed:'));
  assert.equal(view.button('Save / continue private archive').props.disabled, true); view.consent();
  view.button('Save / continue private archive').props.onClick(); await view.until(() => view.status().startsWith('Original file archived privately'));
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_conversations').get().n, 2);
});
void test('same-owner hidden/visible return restores verified bytes only after recheck and fences old callbacks', async t => {
  const { handle } = fixture(t); let hold = false, release;
  const view = ui(handle, { intercept(response, init) { return hold && !init.method ? new Promise(resolve => { release = () => resolve(response); }) : response; } }); t.after(view.cleanup);
  const f = await file({ name: 'same-owner.json' }); await archived(view, f);
  const oldDownload = view.button('Download verified original bytes').props.onClick, oldSave = view.button('Save / continue private archive').props.onClick;
  const callsBefore = view.calls.length; view.visibility('hidden'); assert.equal(view.privatePanel().hidden, true);
  oldDownload(); oldSave(); assert.equal(view.calls.length, callsBefore); assert.equal(view.download(), undefined);
  assert.doesNotMatch(view.text(), /same-owner.json|こんにちは/); hold = true; view.visibility('visible');
  await view.until(() => Boolean(release)); assert.doesNotMatch(view.text(), /same-owner.json|こんにちは/);
  release(); await view.until(() => view.status().startsWith('Account rechecked.'));
  assert.match(view.text(), /same-owner.json/); assert.equal(view.button('Save / continue private archive').props.disabled, true);
  oldDownload(); assert.equal(view.download(), undefined, 'old render token remains invalid after same-owner return');
  view.button('Download verified original bytes').props.onClick();
  assert.deepEqual(new Uint8Array(await view.download().blob.arrayBuffer()), f.bytes);
});
void test('transient offline recheck quarantines content until successful same-owner recovery', async t => {
  const { handle } = fixture(t); let offline = false;
  const view = ui(handle, { intercept(response, init) { if (offline && !init.method) throw Error('offline'); return response; } }); t.after(view.cleanup);
  await archived(view, await file({ name: 'offline-kept.json' })); offline = true; view.blur(); view.focus();
  await view.until(() => view.status().startsWith('Sign in on this host'));
  assert.doesNotMatch(view.text(), /offline-kept.json|こんにちは/); assert.equal(view.button('Download verified original bytes').props.disabled, true);
  offline = false; view.button('Confirm signed-in account').props.onClick(); await view.until(() => view.status().startsWith('Destination confirmed:'));
  assert.match(view.text(), /offline-kept.json/); assert.equal(view.button('Download verified original bytes').props.disabled, false);
});
void test('current unauthorized return clears previous owner private bytes and download', async t => {
  const { handle } = fixture(t); let owner = 'alpha'; const view = ui(handle, { owner: () => owner }); t.after(view.cleanup);
  await archived(view, await file({ name: 'logged-out.json' })); owner = null; view.focus();
  await view.until(() => view.status().startsWith('Account changed.'));
  assert.doesNotMatch(view.text(), /logged-out.json|こんにちは|Destination: /); assert.equal(view.button('Download verified original bytes').props.disabled, true);
});
for (const late of ['200', '401', 'OWNER_CHANGED']) void test(`obsolete ${late} after cancel/new selection cannot erase or replace newer owner intent`, async t => {
  const { handle, sqlite } = fixture(t); let owner = 'alpha', count = 0, release;
  const view = ui(handle, { owner: () => owner, intercept(response, init) {
    if (!init.method && ++count === 1) return new Promise(resolve => { release = () => resolve(late === '200' ? response
      : Response.json({ error: late === '401' ? 'UNAUTHORIZED' : 'OWNER_CHANGED' }, { status: late === '401' ? 401 : 409 })); });
    return response;
  } }); t.after(view.cleanup);
  view.button('Confirm signed-in account').props.onClick(); await view.until(() => Boolean(release));
  view.button('Cancel preview / stop later saves').props.onClick(); owner = 'beta';
  await ready(view, await file({ name: `fresh-${late}.json` })); const before = view.text(); release(); await tick();
  assert.equal(view.text(), before); assert.equal(view.button('Save / continue private archive').props.disabled, false);
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 0);
  view.button('Save / continue private archive').props.onClick(); await view.until(() => view.status().startsWith('Original file archived privately'));
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_conversations').get().n, 1);
});
void test('cancel synchronously fences an already rendered save callback', async t => {
  const { handle, sqlite } = fixture(t), view = ui(handle); t.after(view.cleanup);
  await ready(view, await file()); const oldSave = view.button('Save / continue private archive').props.onClick;
  view.button('Cancel preview / stop later saves').props.onClick(); oldSave(); await tick();
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 0); assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_conversations').get().n, 0);
});
void test('hidden in-flight commit stops batches; late old 200 cannot restore bytes over new owner intent', async t => {
  const { handle, sqlite } = fixture(t); let owner = 'alpha', release, held = false;
  const view = ui(handle, { owner: () => owner, intercept(response, init) {
    if (init.method === 'POST' && !held) { held = true; return new Promise(resolve => { release = () => resolve(response); }); } return response;
  } }); t.after(view.cleanup);
  await ready(view, await file({ padded: true, name: 'old-inflight.json' }));
  const oldSave = view.button('Save / continue private archive').props.onClick; oldSave(); await view.until(() => Boolean(release));
  view.visibility('hidden'); oldSave(); assert.equal(view.privatePanel().hidden, true);
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 1);
  owner = 'beta'; view.visibility('visible'); await view.until(() => view.status().startsWith('Account changed.'));
  await archived(view, await file({ name: 'new-after-hidden.json' })); const before = view.text(); release(); await tick();
  assert.equal(view.text(), before); assert.doesNotMatch(view.text(), /old-inflight.json/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_conversations').get().n, 2);
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 2);
});
void test('late file read, context and unmounted responses cannot revive an invalidated intent', async t => {
  const { handle } = fixture(t), f = await file(); let releaseFile, releaseAuth;
  const view = ui(handle, { intercept(response, init) { return !init.method ? new Promise(resolve => { releaseAuth = () => resolve(response); }) : response; } });
  view.input().props.onChange({ currentTarget: { files: [{ name: f.filename, size: f.bytes.length,
    arrayBuffer: () => new Promise(resolve => { releaseFile = () => resolve(Uint8Array.from(f.bytes).buffer); }) }] } });
  view.button('Confirm signed-in account').props.onClick(); await view.until(() => Boolean(releaseAuth));
  view.accountChange(); releaseFile(); releaseAuth(); await tick();
  assert.doesNotMatch(view.text(), /Local file preview|こんにちは|Destination: /);
  releaseAuth = undefined; view.button('Confirm signed-in account').props.onClick(); await view.until(() => Boolean(releaseAuth)); view.cleanup(); releaseAuth(); await tick();
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 0);
});

void test('same-owner hidden in-flight archive requires same-ID GET and fresh consent before remaining batches', async t => {
  const { handle, sqlite } = fixture(t); let held = false, release;
  const view = ui(handle, { intercept(response, init) {
    if (init.method === 'POST' && !held) { held = true; return new Promise(resolve => { release = () => resolve(response); }); } return response;
  } }); t.after(view.cleanup);
  await ready(view, await file({ padded: true, name: 'same-owner-pending.json' }));
  view.button('Save / continue private archive').props.onClick(); await view.until(() => Boolean(release));
  view.visibility('hidden'); view.visibility('visible'); await view.until(() => view.status().startsWith('Account rechecked.'));
  release(); await tick(); assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 1);
  view.consent(); assert.equal(view.button('Save / continue private archive').props.disabled, true);
  view.button('Read back same archive').props.onClick(); await view.until(() => view.status().startsWith('Partial archive found.'));
  assert.equal(view.button('Save / continue private archive').props.disabled, true); view.consent();
  view.button('Save / continue private archive').props.onClick(); await view.until(() => view.status().startsWith('Original file archived privately'));
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 8);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_conversations').get().n, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_messages').get().n, 118);
});
void test('effect setup-cleanup-setup keeps current callbacks usable and unmounted callbacks fenced', async t => {
  const { handle } = fixture(t), view = ui(handle, { strictEffects: true });
  await archived(view, await file({ name: 'strict-effects.json' }));
  const oldDownload = view.button('Download verified original bytes').props.onClick;
  view.cleanup(); oldDownload(); await tick(); assert.equal(view.download(), undefined);
});
void test('explicit new file selection supersedes pending reauthentication without reviving old owner state', async t => {
  const { handle } = fixture(t); let held = false, release;
  const view = ui(handle, { intercept(response, init) {
    if (!init.method && !held) { held = true; return new Promise(resolve => { release = () => resolve(Response.json({ error: 'UNAUTHORIZED' }, { status: 401 })); }); } return response;
  } }); t.after(view.cleanup);
  await view.chooseFile(await file({ name: 'old-selected.json' }));
  view.button('Confirm signed-in account').props.onClick(); await view.until(() => Boolean(release));
  await view.chooseFile(await file({ name: 'new-explicit.json' })); release(); await tick();
  assert.match(view.text(), /new-explicit.json/); assert.doesNotMatch(view.text(), /old-selected.json|Destination: /);
  assert.equal(view.button('Save / continue private archive').props.disabled, true);
  view.button('Confirm signed-in account').props.onClick(); await view.until(() => view.status().startsWith('Destination confirmed:')); view.consent();
  assert.equal(view.button('Save / continue private archive').props.disabled, false);
});

function selectWithoutWaiting(view, f) {
  view.input().props.onChange({ currentTarget: { files: [{ name: f.filename, size: f.bytes.length,
    arrayBuffer: async () => Uint8Array.from(f.bytes).buffer }] } });
}

void test('unresolved archive cannot be replaced by another file before same-ID readback', async t => {
  const { handle, sqlite } = fixture(t); let drop = true;
  const view = ui(handle, { intercept(response, init) {
    if (init.method === 'POST' && drop) { drop = false; throw Error('lost acknowledgement'); }
    return response;
  } }); t.after(view.cleanup);
  const original = await file({ padded: true, name: 'unresolved-original.json' });
  const replacement = await file({ name: 'replacement.json' });
  assert.notEqual(original.operationId, replacement.operationId);
  const ctx = await context(handle), id = await proArchiveId(ctx.ownerScope, original.operationId);
  await ready(view, original);
  view.button('Save / continue private archive').props.onClick();
  await view.until(() => view.status().startsWith('Outcome unknown'));
  // Invoke the handler directly as well as inspecting disabled: a stale event must not bypass the gate.
  selectWithoutWaiting(view, replacement); await tick();
  assert.doesNotMatch(view.text(), /replacement.json/);
  assert.equal(view.input().props.disabled, true);
  view.button('Read back same archive').props.onClick();
  await view.until(() => view.status().startsWith('Partial archive found.'));
  assert.equal(new URL(view.calls.at(-1).path, 'https://avoado.si').searchParams.get('id'), id);
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_conversations').get().n, 1);
  assert.equal(view.input().props.disabled, false);
  view.consent(); view.button('Save / continue private archive').props.onClick();
  await view.until(() => view.status().startsWith('Original file archived privately'));
  assert.equal(JSON.parse(view.calls.filter(c => c.init.method === 'POST')[1].init.body).expectedRevision, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_messages').get().n, 118);
  await view.chooseFile(replacement);
  assert.match(view.text(), /replacement.json/);
});

void test('cancel while identity is quarantined preserves unresolved same-owner archive for readback', async t => {
  const { handle, sqlite } = fixture(t); let release, held = false;
  const view = ui(handle, { intercept(response, init) {
    if (init.method === 'POST' && !held) { held = true; return new Promise(resolve => { release = () => resolve(response); }); }
    return response;
  } }); t.after(view.cleanup);
  const original = await file({ padded: true, name: 'pending-hidden.json' });
  const ctx = await context(handle), id = await proArchiveId(ctx.ownerScope, original.operationId);
  await ready(view, original); view.button('Save / continue private archive').props.onClick();
  await view.until(() => Boolean(release));
  view.visibility('hidden'); view.button('Cancel preview / stop later saves').props.onClick();
  assert.equal(view.privatePanel().hidden, true);
  view.visibility('visible'); await view.until(() => view.status().startsWith('Account rechecked.'));
  assert.doesNotMatch(view.text(), /pending-hidden.json|Local file preview/);
  release(); await tick();
  assert.equal(view.button('Read back same archive').props.disabled, false);
  assert.equal(view.input().props.disabled, true);
  view.button('Read back same archive').props.onClick();
  await view.until(() => view.status().startsWith('Partial archive found.'));
  assert.equal(new URL(view.calls.at(-1).path, 'https://avoado.si').searchParams.get('id'), id);
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_messages').get().n, 16);
});

void test('queued selection cannot abandon an in-flight save before UNKNOWN is set', async t => {
  const { handle, sqlite } = fixture(t); let release, held = false;
  const view = ui(handle, { intercept(response, init) {
    if (init.method === 'POST' && !held) { held = true; return new Promise(resolve => { release = () => resolve(response); }); }
    return response;
  } }); t.after(view.cleanup);
  const original = await file({ padded: true }), replacement = await file({ name: 'queued-replacement.json' });
  await ready(view, original); view.button('Save / continue private archive').props.onClick();
  await view.until(() => Boolean(release));
  selectWithoutWaiting(view, replacement); await tick();
  assert.doesNotMatch(view.text(), /queued-replacement.json/);
  assert.equal(view.input().props.disabled, true);
  release(); await view.until(() => view.status().startsWith('Original file archived privately'));
  const writes = view.calls.filter(c => c.init.method === 'POST').map(c => JSON.parse(c.init.body));
  assert.equal(writes.length, 8);
  assert.ok(writes.every(b => b.operationId === original.operationId));
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_conversations').get().n, 1);
});

void test('failed same-ID readback keeps file replacement locked; owner change clears private pending state', async t => {
  const { handle, sqlite } = fixture(t); let owner = 'alpha', drop = true, offline = false;
  const view = ui(handle, { owner: () => owner, intercept(response, init) {
    if (init.method === 'POST' && drop) { drop = false; throw Error('lost acknowledgement'); }
    if (!init.method && offline) throw Error('offline');
    return response;
  } }); t.after(view.cleanup);
  await ready(view, await file({ padded: true, name: 'private-pending.json' }));
  view.button('Save / continue private archive').props.onClick();
  await view.until(() => view.status().startsWith('Outcome unknown'));
  offline = true; view.button('Read back same archive').props.onClick();
  await view.until(() => view.status().startsWith('Readback unresolved'));
  selectWithoutWaiting(view, await file({ name: 'not-yet.json' })); await tick();
  assert.equal(view.input().props.disabled, true); assert.doesNotMatch(view.text(), /not-yet.json/);
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 1);
  view.blur(); view.button('Cancel preview / stop later saves').props.onClick();
  offline = false; owner = 'beta'; view.focus();
  await view.until(() => view.status().startsWith('Account changed.'));
  assert.doesNotMatch(view.text(), /private-pending.json|Destination: /);
  assert.equal(view.button('Read back same archive').props.disabled, true);
  assert.equal(view.input().props.disabled, false);
  await ready(view, await file({ name: 'new-owner-selected.json' }));
  assert.equal(view.calls.filter(c => c.init.method === 'POST').length, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM eve_messages').get().n, 16);
});
