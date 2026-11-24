import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as manifestApi from '../lib/noah-agent-upload.ts';
import { noahUploadPath } from '../lib/noah-surface.ts';

const code = ts.transpileModule(readFileSync(new URL('../components/noah-agent-upload-form.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
function harness(fetcher, search = '?launch=1', props) {
  const slots = [], effects = [], exports = {}, calls = [], timers = new Set();
  let cursor = 0, tree;
  const react = {
    useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useCallback(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) slots[i] = { deps, value: fn }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const paths = [];
  const jsx = (type, props, key) => ({ type, props, key });
  runInNewContext(code, {
    exports, Error, AbortController, AbortSignal, URL, URLSearchParams, crypto, TextEncoder,
    window: { history:{state:{}, replaceState(_state,_title,href){paths.push(href);}}, location: { search }, addEventListener() {}, removeEventListener() {} },
    setTimeout(fn, ms) { const id = setTimeout(() => fn(), ms); timers.add(id); return id; }, clearTimeout,
    fetch: async (url, options) => { calls.push({ url, options }); return url === '/__noah/upload-refactor' ? reply(404, {}) : fetcher(url, options); },
    require(id) {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'next/link') return { default: 'a' };
      if (id === 'next/navigation') return { useRouter: () => ({ push() {} }) };
      if (id === '@/lib/noah-surface') return { noahUploadPath };
      if (id === '@/lib/noah-agent-upload') return manifestApi;
      if (id === '@/lib/owner-intent') return { OWNER_SCOPE_HEADER: 'X-Rock-Owner-Scope' };
      if (['@/lib/noah-terminal-template', '@/lib/noah-upload-processing-client'].includes(id)) return {};
      if (id === './noah-cover-picker') return { default:'cover-picker', coverReady:()=>true };
      if (id === './noah-draft-storage') return { default: 'draft-storage' };
      if (id === './noah-guide-editor') return { default: 'guide-editor' };
      if (id.endsWith('.module.css')) return { default: {} };
      throw Error(id);
    },
  });
  function render() { cursor = 0; tree = exports.default(props); effects.splice(0).forEach(fn => fn()); }
  function walk(n, disabled = false) {
    if (Array.isArray(n)) return n.flatMap(v => walk(v, disabled));
    if (!n || typeof n !== 'object') return [];
    return [{ ...n, disabled: disabled || !!n.props?.disabled }, ...walk(n.props?.children, disabled || (n.type === 'fieldset' && !!n.props.disabled))];
  }
  const nodes = () => walk(tree);
  const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' ? n : '';
  render();
  return {
    calls, paths, nodes, text: () => text(tree),
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

void test('cover and guide retain distinct identities when the owner session opens', async t => {
  const h = harness(async url => reply(200, url === '/api/noah/agents'
    ? { ownerScope: 'owner-a' }
    : { ownerScope: 'owner-a', drafts: [] }));
  t.after(() => h.unmount());
  function editorKeys() {
    return ['cover-picker', 'guide-editor'].map(type => {
      const editors = h.nodes().filter(node => node.type === type);
      assert.equal(editors.length, 1);
      return editors[0].key;
    });
  }
  const before = editorKeys();
  await h.flush();
  const after = editorKeys();
  assert.notEqual(before[0], before[1]);
  assert.notEqual(after[0], after[1]);
  assert.ok(after.every((key, index) => key !== before[index]));
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

void test('without a test runner the fixed-test refactor starts off and cannot be turned on, so the template saves', async t => {
  // 公開版（スマホ）には検証の実行先が無い（/__noah/upload-refactor は 404）。付けたままだと、テンプレートのまま保存した時に必ず失敗していた。
  const h = harness(async url => url === '/api/noah/agents' ? reply(200, { ownerScope: 'owner-a' }) : reply(200, { ownerScope: 'owner-a', drafts: [] }));
  t.after(() => h.unmount()); await h.flush();
  const label = h.nodes().find(n => n.type === 'label' && /固定テストで確認して整理する/.test(JSON.stringify(n.props.children)));
  assert.ok(label);
  const box = [label.props.children].flat().find(n => n && n.type === 'input' && n.props.type === 'checkbox');
  assert.equal(box.props.checked, false);
  assert.equal(box.props.disabled, true);
  assert.match(h.text(), /固定テストを実行する接続先がありません/);
});


void test('engineering keeps the create/connect step across login and saves an external endpoint before continuing with its exact id', async t => {
  const draftId = '00000000-0000-4000-8000-000000000050';
  const login = harness(async () => reply(401, {}), '?step=create&draft=' + draftId, {engineeringMode:'create'});
  t.after(() => login.unmount()); await login.flush();
  const signIn = login.nodes().find(n => n.type === 'a' && n.props.href.includes('returnTo'));
  assert.equal(new URL(signIn.props.href,'https://noah.test').searchParams.get('returnTo'), '/noah/engineering?step=create&draft=' + draftId);
  let saved, continued;
  const h = harness(async (url, options) => {
    if (url === '/api/noah/agents' && options?.method === 'POST') {
      saved = JSON.parse(options.body);
      assert.equal(options.headers['X-Rock-Owner-Scope'], 'owner-a');
      return reply(201, {agent:{id:saved.id}});
    }
    if (url === '/api/noah/agents') return reply(200,{ownerScope:'owner-a'});
    if (url === '/api/noah/drafts') return reply(200,{ownerScope:'owner-a',drafts:[]});
    if (url.startsWith('/api/noah/drafts/') && options.method === 'PUT') {
      const payload = JSON.parse(options.body);
      return reply(200,{draft:{id:url.split('/').at(-1), revision:1, content:payload.content, updatedAt:Date.now()}});
    }
    throw Error('Unexpected request ' + url);
  }, '?step=connect', {engineeringMode:'connect', onRegistered:id => {continued = id;}});
  t.after(() => h.unmount()); await h.flush();
  assert.equal(h.nodes().filter(n=>n.type==='h1').length,0);
  assert.equal(h.nodes().some(n=>n.type==='select' && n.props.value==='mcp_http'),true);
  assert.equal(saved,undefined);
  const field = (predicate, change) => h.nodes().find(n=>predicate(n)).props.onChange({target:change});
  field(n=>n.type==='input' && n.props.placeholder==='例：毎朝のニュース担当',{value:'準備票の整理'});
  field(n=>n.type==='textarea' && n.props.rows===4,{value:'入力したメモを整理して準備票の文章として返します。'});
  field(n=>n.type==='input' && n.props.required && n.props.maxLength===100 && !n.props.placeholder,{value:'作者'});
  field(n=>n.type==='input' && n.props.placeholder==='https://your-agent.com/mcp',{value:'https://my-agent.example.com/mcp'});
  field(n=>n.type==='textarea' && n.props.maxLength===500,{value:'無料'});
  field(n=>n.type==='input' && n.props.required && n.props.type==='checkbox',{checked:true});
  await h.flush();
  await h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  await h.flush();
  assert.ok(saved,h.text());
  assert.equal(saved.manifest.endpointUrl, 'https://my-agent.example.com/mcp');
  assert.equal(continued,saved.id);
  assert.ok(h.paths.some(path => path.startsWith('/noah/engineering?step=connect&draft=')));
});
