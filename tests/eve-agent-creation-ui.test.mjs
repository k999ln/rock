import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as origin from '../lib/eve-agent-origin.ts';
import * as proposal from '../lib/eve-agent-proposal.ts';
import * as library from '../lib/sky-agent-library.ts';
import * as owner from '../lib/owner-intent.ts';
import * as providers from '../lib/llm-providers.ts';
import * as creation from '../lib/eve-agent-creation.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../components/eve-object-agent-creator.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const scope = 'owner-v1:' + 'a'.repeat(64);
const originalReplies = [{ id: 'reply', text: 'Imported role text' }];
function harness() {
  let replies = originalReplies, tree, cursor = 0, account = scope, held = false, hold, activeAsync = 0;
  const observed = fn => async (...args) => { activeAsync++; try { return await fn(...args); } finally { activeAsync--; } };
  const slots = [], layouts = [], effects = [], puts = [], rows = new Map();
  const storage = { getItem: k => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, v), removeItem: k => rows.delete(k) };
  const same = (a, b) => a?.length === b?.length && a.every((v, i) => v === b[i]);
  function effect(fn, deps, queue) {
    const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) {
      const previous = slots[i]; slots[i] = { deps };
      queue.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
    }
  }
  const react = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) { effect(fn, deps, effects); }, useLayoutEffect(fn, deps) { effect(fn, deps, layouts); },
  };
  function json(value) {
    const response = Response.json(value);
    response.json = observed(response.json.bind(response));
    return response;
  }
  const fetch = observed(async (_url, init = {}) => {
    if (init.method === 'PUT') { const body = JSON.parse(init.body); puts.push(body);
      return json({ agent: { ...body.settings, id: body.id, revision: 1, source: 'personal', sourceTool: null, updatedAt: 0 } }); }
    if (held) { hold = Promise.withResolvers(); await hold.promise; }
    return json({ ownerScope: account });
  });
  const jsx = (type, props) => ({ type, props });
  const modules = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'a' },
    '@/lib/eve-agent-origin': { ...origin, makeEveAgentOrigin: observed(origin.makeEveAgentOrigin) }, '@/lib/eve-agent-proposal': proposal, '@/lib/sky-agent-library': library,
    '@/components/sky-agent-capability-review': { default: 'Smith' }, '@/lib/owner-intent': owner,
    '@/lib/llm-providers': providers, '@/lib/eve-agent-creation': { ...creation,
      prepareEveAgentPending: observed(creation.prepareEveAgentPending), createEveAgent: observed(creation.createEveAgent),
      reconcileEveAgentCreation: observed(creation.reconcileEveAgentCreation) } };
  const exports = {};
  const window = new EventTarget();
  runInNewContext(compiled, { exports, fetch, crypto, AbortController, sessionStorage: storage, window,
    require: name => { assert.ok(modules[name], name); return { __esModule: true, ...modules[name] }; } });
  function render() { cursor = 0; tree = exports.default({ replies }); layouts.splice(0).forEach(fn => fn()); effects.splice(0).forEach(fn => fn()); }
  function nodes(n, out = []) { if (Array.isArray(n)) n.forEach(x => nodes(x, out)); else if (n && typeof n === 'object') { out.push(n); nodes(n.props?.children, out); } return out; }
  const text = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join('') : n?.props ? text(n.props.children) : '';
  const button = label => nodes(tree).find(n => n.type === 'button' && text(n) === label);
  function input(label, value) { const field = nodes(nodes(tree).find(n => n.type === 'label' && text(n).startsWith(label))).find(n => ['input', 'textarea', 'select'].includes(n.type)); assert.ok(field, label); field.props.onChange({ target: { value } }); render(); }
  const draftText = () => nodes(tree).find(n => n.type === 'textarea' && n.props.maxLength === 1200)?.props.value;
  async function until(predicate, label) {
    const deadline = performance.now() + 5000;
    do {
      await new Promise(r => setImmediate(r)); render();
      if (predicate()) return;
    } while (performance.now() < deadline);
    assert.fail(`${label}: activeAsync=${activeAsync}; UI=${text(tree)}`);
  }
  async function flush() {
    // Held owner reads are intentional race staging. Other asynchronous
    // work, including actual WebCrypto origin and pending digests, must finish.
    await until(() => (held && hold) || activeAsync === 0, 'creator did not settle');
  }
  function saveButton() {
    assert.notEqual(draftText(), undefined, `confirmed draft must be ready: ${text(tree)}`);
    const node = button('確認して保存'); assert.ok(node, `save confirmation must exist: ${text(tree)}`); return node;
  }
  render();
  return { flush, until, render, button, saveButton, input, puts, rows, text: () => text(tree),
    async import() {
      input('下書きに使う回答', 'reply');
      const action = button('回答から下書きを作る'); assert.ok(action && !action.props.disabled, 'reply import must be ready');
      action.props.onClick(); await flush();
      assert.notEqual(draftText(), undefined, `reply import must produce a draft, not a terminal error: ${text(tree)}`);
    },
    beginImport() { input('下書きに使う回答', 'reply'); button('回答から下書きを作る').props.onClick(); render(); },
    changeReplies(value) { replies = value; render(); },
    changeOwner() { account = 'owner-v1:' + 'b'.repeat(64); },
    changeAccess() { window.dispatchEvent(new Event('rockstar-community-changed')); render(); },
    pause() { held = true; hold = undefined; }, release() { held = false; assert.ok(hold); hold.resolve(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
    manual() { input('担当の名前', 'Manual role'); input('何を手伝う担当ですか', 'Manual purpose'); input('受け取るもの', 'Manual input'); input('期待する成果', 'Manual output'); },
    submitManual() { nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); render(); },
    draftText,
  };
}

void test('selected reply becomes editable draft without save or execution, then confirmed save', async () => {
  const h = harness(); await h.flush(); await h.import();
  assert.equal(h.draftText(), 'Imported role text'); assert.equal(h.puts.length, 0); assert.equal(h.rows.size, 0);
  h.input('役割・入力・期待する成果', 'Owner-edited role'); h.saveButton().props.onClick(); await h.flush();
  assert.equal(h.puts.length, 1); assert.equal(h.puts[0].settings.instructions, 'Owner-edited role');
  assert.equal(Object.keys(h.puts[0].settings).length, 6); assert.match(h.text(), /保存しました/);
  assert.equal(h.puts[0].settings.origin.replyId,'reply');
  assert.equal(h.puts[0].settings.origin.replySha256, (await origin.makeEveAgentOrigin('new','reply','Imported role text')).replySha256);
});
void test('owner change during import cannot produce a draft', async () => {
  const h = harness(); await h.flush(); h.pause(); h.beginImport(); await h.flush(); h.changeOwner(); h.release(); await h.flush();
  assert.equal(h.draftText(), undefined); assert.equal(h.puts.length, 0); assert.match(h.text(), /本人または元の回答が変わりました/);
});
void test('removed, replaced, or removed-then-restored reply cannot revive pending import', async () => {
  for (const action of ['removed', 'changed', 'restored']) {
    const h = harness(); await h.flush(); h.pause(); h.beginImport(); await h.flush();
    h.changeReplies(action === 'changed' ? [{ id: 'reply', text: 'Different reply' }] : []);
    if (action === 'restored') h.changeReplies(originalReplies);
    h.release(); await h.flush(); assert.equal(h.draftText(), undefined, action); assert.equal(h.puts.length, 0);
  }
});
void test('new unrelated reply does not invalidate selected current reply', async () => {
  const h = harness(); await h.flush(); h.pause(); h.beginImport(); await h.flush();
  h.changeReplies([...originalReplies, { id: 'other', text: 'New reply' }]); h.release(); await h.flush();
  assert.equal(h.draftText(), 'Imported role text');
});
void test('manual preparation is blocked while selected reply import is pending', async () => {
  const h = harness(); await h.flush(); h.manual(); h.pause(); h.beginImport(); await h.flush(); h.submitManual();
  assert.equal(h.draftText(), undefined); h.release(); await h.flush(); assert.equal(h.draftText(), 'Imported role text');
});
void test('owner changes before save never dispatch a write', async () => {
  const h = harness(); await h.flush(); await h.import(); h.changeOwner(); h.saveButton().props.onClick(); await h.flush();
  assert.equal(h.puts.length, 0); assert.equal(h.rows.size, 0); assert.match(h.text(), /本人が変わりました/);
});
void test('removed source disables saving; restored source still cannot dispatch', async () => {
  const h = harness(); await h.flush(); await h.import(); h.changeReplies([]); h.render();
  assert.equal(h.saveButton().props.disabled, true);
  h.changeReplies(originalReplies); h.render(); h.saveButton().props.onClick(); await h.flush();
  assert.equal(h.puts.length, 0); assert.equal(h.rows.size, 0);
});
void test('source change or unmount during final digest prevents PUT and pending reservation', async t => {
  const original = crypto.subtle.digest.bind(crypto.subtle);
  for (const action of ['source', 'unmount', 'manual-unmount']) {
    const h = harness(); await h.flush();
    if (action === 'manual-unmount') { h.manual(); h.submitManual(); } else await h.import();
    let count = 0, pause;
    const mock = t.mock.method(crypto.subtle, 'digest', async (...args) => {
      if (++count === 2) { pause = Promise.withResolvers(); await pause.promise; }
      return original(...args);
    });
    h.saveButton().props.onClick();
    await h.until(() => Boolean(pause), 'final helper digest did not reach its deliberate hold');
    assert.ok(pause, 'final helper digest reached');
    if (action === 'source') h.changeReplies([]); else h.unmount();
    pause.resolve(); await h.flush(); mock.mock.restore();
    assert.equal(h.puts.length, 0, action); assert.equal(h.rows.size, 0, action);
  }
});
const postReply = { id:'reply',text:'Imported post role',source:{schema:'rockstaros.eve-post-source/1',key:'post:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',metadataSha256:'a'.repeat(64),post:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',authorId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',communityId:null,replyTo:null,createdAt:100}} };
void test('post access change invalidates imported draft but keeps text for explicit reimport; legacy replies stay usable',async()=>{
 const h=harness();await h.flush();h.changeReplies([postReply]);await h.import();const text=h.draftText();
 h.changeAccess();h.changeAccess();assert.equal(h.draftText(),text);assert.equal(h.saveButton().props.disabled,true);
 h.saveButton().props.onClick();await h.flush();assert.equal(h.puts.length,0);assert.equal(h.rows.size,0);
 h.button('入力へ戻る').props.onClick();h.render();await h.import();assert.equal(h.saveButton().props.disabled,false);
 const legacy=harness();await legacy.flush();await legacy.import();legacy.changeAccess();assert.equal(legacy.saveButton().props.disabled,false);
});
void test('post key/profile change during import owner read never revives an old reply draft',async()=>{
 const h=harness();await h.flush();h.changeReplies([postReply]);h.pause();h.beginImport();await h.flush();h.changeAccess();h.release();await h.flush();
 assert.equal(h.draftText(),undefined);assert.equal(h.puts.length,0);assert.equal(h.rows.size,0);
});
void test('post access ABA during final pending digest fences PUT and journal reservation',async t=>{
 const h=harness();await h.flush();h.changeReplies([postReply]);await h.import();const original=crypto.subtle.digest.bind(crypto.subtle);let count=0,pause;
 const mock=t.mock.method(crypto.subtle,'digest',async(...args)=>{if(++count===2){pause=Promise.withResolvers();await pause.promise;}return original(...args);});
 h.saveButton().props.onClick();await h.until(()=>Boolean(pause),'final digest hold');h.changeAccess();h.changeAccess();pause.resolve();await h.flush();mock.mock.restore();
 assert.equal(h.puts.length,0);assert.equal(h.rows.size,0);
});
