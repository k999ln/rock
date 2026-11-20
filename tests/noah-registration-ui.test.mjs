import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../components/noah-registration.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const provider = { id: 'example', name: 'Example', agentIds: ['agent'], revision: 1, providerOrigin: 'https://provider.example.com', executorOrigin: 'https://executor.example.com', executorName: 'Registration Agent', termsUrl: 'https://provider.example.com/terms', termsVersion: '1', fields: [{ key: 'email', label: 'メール', type: 'email', required: true, maxLength: 100 }, { key: 'password', label: 'パスワード', type: 'password', required: true, maxLength: 100 }] };
const job = state => ({ id: 'job', providerName: 'Example', providerOrigin: provider.providerOrigin, state, expiresAt: Date.now() + 86400000, verificationUrl: provider.providerOrigin + '/verify', returnTo: '/noah/launch?agent=agent#library' });
function harness(fetcher, initial = []) {
  const slots = [], effects = [], exports = {}, calls = [], storage = new Map(initial); let cursor = 0, tree;
  const jsx = (type, props) => ({ type, props });
  runInNewContext(code, { exports, URLSearchParams, Error, Date, crypto, Uint8Array, AbortController, queueMicrotask,
    sessionStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    fetch: async (url, options) => { calls.push({ url, options }); return fetcher(url, options); },
    require(id) {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'react') return {
        useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
        useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
        useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => v !== old.deps[n])) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
      };
      if (id === 'next/link') return { default: 'a' };
      if (id === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      if (id.endsWith('.module.css')) return { default: {} };
      throw Error(id);
    },
  });
  const render = () => { cursor = 0; tree = exports.default({ agentId: 'agent' }); effects.splice(0).forEach(fn => fn()); };
  const walk = value => Array.isArray(value) ? value.flatMap(walk) : value && typeof value === 'object' ? [value, ...walk(value.props?.children)] : [];
  const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
  const button = label => { const n = walk(tree).find(n => n.type === 'button' && text(n).includes(label)); assert.ok(n, label); return n; };
  render();
  return { calls, storage, nodes: () => walk(tree), text: () => text(tree), button,
    async flush() { for (let n=0;n<4;n++) { await new Promise(setImmediate); render(); } },
    input(name,value) { const n = walk(tree).find(n => n.type === 'input' && n.props.name === name); assert.ok(n); n.props.onChange({ target:{value} }); render(); },
    check(label) { const n = walk(tree).find(n => n.type === 'label' && text(n).includes(label)); const input = walk(n).find(n => n.type === 'input'); input.props.onChange({target:{checked:true}}); render(); },
    submit() { walk(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); render(); },
    click(label) { const n = button(label); assert.ok(!n.props.disabled); n.props.onClick(); render(); },
    close() { slots.forEach(s => s.cleanup?.()); },
  };
}
const config = () => Response.json({providers:[provider]});
function fill(h) { h.input('email','synthetic@example.com'); h.input('password','synthetic-private-value'); h.submit(); }
void test('registration UI requires recipient and terms consent, submits actual values, and stores only the capability', async t => {
  const h = harness(async (_u,o) => o.method === 'POST' ? Response.json({job:job('needs_user')}) : config()); t.after(() => h.close()); await h.flush(); fill(h);
  assert.match(h.text(), /https:\/\/executor.example.com/); assert.doesNotMatch(h.text(), /synthetic-private-value/);
  assert.equal(h.button('この情報で登録Agentを実行').props.disabled,true); h.submit(); await h.flush(); assert.equal(h.calls.filter(c => c.options.method==='POST').length,0);
  h.check('送信先と内容を確認'); assert.equal(h.button('この情報で登録Agentを実行').props.disabled,true); h.check('利用規約'); h.submit(); await h.flush();
  const post = h.calls.find(c => c.options.method==='POST'), body = JSON.parse(post.options.body);
  assert.equal(body.values.email,'synthetic@example.com'); assert.equal(body.values.password,'synthetic-private-value'); assert.equal(body.termsAccepted,true); assert.equal(body.agentId,'agent');
  assert.match(post.options.headers['X-Noah-Registration-Key'],/^[a-f0-9]{64}$/); assert.doesNotMatch(post.url,/synthetic|key=/);
  const saved = JSON.parse([...h.storage.values()][0]); assert.deepEqual(Object.keys(saved).sort(),['id','key']); assert.doesNotMatch(JSON.stringify([...h.storage]),/synthetic/);
  assert.match(h.text(),/本人による確認を待っています/); assert.ok(h.nodes().some(n=>n.props?.href === job('needs_user').verificationUrl)); assert.equal(h.nodes().filter(n=>n.type==='input').length,0);
});
void test('lost submission response offers status-only recovery and never resends credentials', async t => {
  const h = harness(async (u,o) => { if(o.method==='POST') throw Error('Connection lost'); return u.includes('?job=') ? Response.json({job:job('completed')}) : config(); }); t.after(()=>h.close()); await h.flush(); fill(h); h.check('送信先と内容を確認'); h.check('利用規約'); h.submit(); await h.flush();
  assert.equal(h.nodes().filter(n=>n.type==='input').length,0); h.click('登録の状況を確認'); await h.flush();
  assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1); assert.equal(h.calls.at(-1).options.body,undefined); assert.match(h.text(),/完了報告/); assert.ok(h.nodes().some(n=>n.props?.href===job('completed').returnTo));
});
void test('restored browser capability only checks an existing job; an empty registry collects no information', async t => {
  const capability = {id:crypto.randomUUID(),key:'b'.repeat(64)};
  const h = harness(async u => u.includes('?job=') ? Response.json({job:job('running')}) : Response.json({providers:[]}), [['noah-registration-work-v1',JSON.stringify(capability)]]); t.after(()=>h.close()); await h.flush();
  h.click('登録の状況を確認'); await h.flush(); assert.equal(h.calls.at(-1).options.headers['X-Noah-Registration-Key'],capability.key); assert.equal(h.calls.some(c=>c.options.method==='POST'),false);
  h.click('ブラウザの確認情報を消す'); await h.flush(); assert.equal(h.storage.size,0); assert.match(h.text(),/準備中/); assert.equal(h.nodes().filter(n=>n.type==='input').length,0);
});
void test('editing reviewed values clears both approvals before another registration can start', async t => {
  const h = harness(async()=>config()); t.after(()=>h.close()); await h.flush(); fill(h); h.check('送信先と内容を確認'); h.check('利用規約'); h.click('入力内容を修正する'); h.input('email','changed@example.com'); h.submit();
  assert.equal(h.button('この情報で登録Agentを実行').props.disabled,true); assert.equal(h.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.checked).length,0);
});
