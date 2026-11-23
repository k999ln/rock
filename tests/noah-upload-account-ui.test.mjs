import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { noahUploadPath } from '../lib/noah-surface.ts';

const code = ts.transpileModule(readFileSync(new URL('../components/noah-agent-upload-form.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
function harness(fetcher, search = '?launch=1') {
  const slots = [], effects = [], exports = {}, calls = [], timers = new Set();
  let cursor = 0, tree;
  const react = {
    useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useCallback(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) slots[i] = { deps, value: fn }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  runInNewContext(code, {
    exports, Error, AbortController, AbortSignal, URL, URLSearchParams, crypto, TextEncoder,
    window: { location: { search }, addEventListener() {}, removeEventListener() {} },
    setTimeout(fn, ms) { const id = setTimeout(() => fn(), ms); timers.add(id); return id; }, clearTimeout,
    fetch: async (url, options) => { calls.push({ url, options }); return url === '/__noah/upload-refactor' ? reply(404, {}) : fetcher(url, options); },
    require(id) {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'next/link') return { default: 'a' };
      if (id === 'next/navigation') return { useRouter: () => ({ push() {} }) };
      if (id === '@/lib/noah-surface') return { noahUploadPath };
      if (id === '@/lib/noah-agent-upload') return { NOAH_PERMISSIONS: [], noahAgentTemplate: { permissions: [] } };
      if (id === '@/lib/owner-intent') return { OWNER_SCOPE_HEADER: 'X-Rock-Owner-Scope' };
      if (['@/lib/noah-terminal-template', '@/lib/noah-upload-processing-client'].includes(id)) return {};
      if (id === './noah-cover-picker') return { default:'cover-picker', coverReady:()=>true };
      if (id === './noah-draft-storage') return { default: 'draft-storage' };
      if (id.endsWith('.module.css')) return { default: {} };
      throw Error(id);
    },
  });
  function render() { cursor = 0; tree = exports.default(); effects.splice(0).forEach(fn => fn()); }
  function walk(n, disabled = false) {
    if (Array.isArray(n)) return n.flatMap(v => walk(v, disabled));
    if (!n || typeof n !== 'object') return [];
    return [{ ...n, disabled: disabled || !!n.props?.disabled }, ...walk(n.props?.children, disabled || (n.type === 'fieldset' && !!n.props.disabled))];
  }
  const nodes = () => walk(tree);
  const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' ? n : '';
  render();
  return {
    calls, nodes, text: () => text(tree),
    async flush() { for (let i = 0; i < 4; i++) { await new Promise(setImmediate); render(); } },
    click(label) { const b = nodes().find(n => n.type === 'button' && text(n) === label); assert.ok(b, label); assert.equal(b.disabled, false, label); b.props.onClick(); render(); },
    unmount() { slots.forEach(s => s.cleanup?.()); timers.forEach(clearTimeout); },
  };
}

void test('signed-out registration offers usable sign-in and retry, then loads drafts after authentication', async t => {
  let authenticated = false;
  const h = harness(async url => url === '/api/noah/agents'
    ? authenticated ? reply(200, { ownerScope: 'owner-a' }) : reply(401, { error: 'sign in' })
    : reply(200, { ownerScope: 'owner-a', drafts: [] }));
  t.after(() => h.unmount()); await h.flush();
  assert.match(h.text(), /サインインすると、自分のAgent/);
  assert.doesNotMatch(h.text(), /保存した下書きを確認中/);
  assert.ok(h.nodes().some(n => n.type === 'a' && n.props.href === '/noah/account?mode=login&returnTo=%2Fnoah%2Fagents%2Fnew%3Flaunch%3D1'));
  assert.equal(h.calls.some(c => c.url === '/api/noah/drafts'), false);
  assert.equal(h.nodes().find(n => n.type === 'fieldset').disabled, true);
  authenticated = true; h.click('アカウントを再確認'); await h.flush();
  assert.equal(h.nodes().find(n => n.type === 'fieldset').disabled, false);
  assert.match(h.text(), /入力すると自動保存します/);
  assert.equal(h.calls.filter(c => c.url === '/api/noah/drafts').length, 1);
  assert.ok(h.calls.every(c => !c.options?.method || c.options.method === 'GET'));
});

void test('network failures, invalid replies and timeouts leave an enabled retry outside the disabled form', async t => {
  for (const mode of ['network', 'invalid', 'timeout']) {
    let fail = true;
    const h = harness(async url => {
      if (!fail) return reply(200, url === '/api/noah/agents' ? { ownerScope: 'owner-a' } : { ownerScope: 'owner-a', drafts: [] });
      if (mode === 'invalid') return reply(200, {});
      const error = new Error('network'); if (mode === 'timeout') error.name = 'TimeoutError'; throw error;
    });
    t.after(() => h.unmount()); await h.flush();
    assert.ok(h.nodes().some(n => n.props?.role === 'alert'));
    assert.doesNotMatch(h.text(), /保存した下書きを確認中/);
    fail = false; h.click('アカウントを再確認'); await h.flush();
    assert.equal(h.nodes().find(n => n.type === 'fieldset').disabled, false, mode);
  }
});

void test('registration return and draft changes preserve public mode without accepting another destination', () => {
  const id = '7cb31446-8023-4ee4-92fd-e88760e55970';
  assert.equal(noahUploadPath('?launch=1', id), `/noah/agents/new?launch=1&draft=${id}`);
  assert.equal(noahUploadPath(`?launch=1&draft=${id}`), `/noah/agents/new?launch=1&draft=${id}`);
  assert.equal(noahUploadPath(`?launch=1&draft=${id}`, ''), '/noah/agents/new?launch=1');
  assert.equal(noahUploadPath('', id), `/noah/agents/new?draft=${id}`);
  assert.equal(noahUploadPath('?launch=1&return_to=https://evil.test&draft=../../secret'), '/noah/agents/new?launch=1');
});

void test('collected repository handoff opens the internal import fields after owner restoration',async t=>{
  const sourceUrl='https://github.com/maker/agent';
  const h=harness(async url=>url==='/api/noah/agents'?reply(200,{ownerScope:'owner-a'}):reply(200,{ownerScope:'owner-a',drafts:[]}),`?${new URLSearchParams({sourceUrl,name:'Collected Agent'})}`);
  t.after(()=>h.unmount());await h.flush();
  assert.ok(h.nodes().some(n=>n.type==='input'&&n.props.type==='url'&&n.props.value===sourceUrl));
  assert.ok(h.nodes().some(n=>n.type==='details'&&n.props.open===true));
  assert.ok(h.nodes().some(n=>n.type==='input'&&n.props.value==='Collected Agent'));
  assert.match(h.text(),/固定commitを記録/);
});
