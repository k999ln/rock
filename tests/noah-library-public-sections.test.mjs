import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// 公開版（スマホ・ブラウザだけの人）の「保存したもの → Agent」に、Mac の実行ホストだけの節（版の管理・取り寄せ）を出さない。
// 前は、ブラウザだけの人に「サインインしてください。」、/__noah の無い所に「本体の取り寄せは、実行ホストのNoahで利用できます。」が出ていた。
function render(file, name, replies) {
  const code = ts.transpileModule(readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const slots = [], exports = {}, pending = [], calls = [];
  let cursor = 0;
  const react = {
    useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect(fn) { const i = cursor++; if (!slots[i]) { slots[i] = {}; pending.push(fn); } },
  };
  const jsx = (type, props) => ({ type, props });
  const delays = [];
  runInNewContext(code, {
    exports, Error, AbortController, URL, URLSearchParams, crypto, Array,
    fetch: async url => { calls.push(url); const [status, body] = replies(url); return { status, ok: status < 400, json: async () => { if (body === undefined) throw Error('not json'); return body; } }; },
    require(id) {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'next/link') return { default: 'a' };
      if (id === '@/lib/noah-visible-polling') return { startNoahVisiblePolling: (read) => { pending.push(async () => { delays.push(await read(new AbortController().signal)); }); return () => {}; } };
      if (id === '@/lib/owner-intent') return { OWNER_SCOPE_HEADER: 'X-Rock-Owner-Scope' };
      if (id.endsWith('.module.css')) return { default: {} };
      if (id === './noah-instances') return { NoahInstanceAdd: () => null };
      if (id === './noah-agent-pin') return { NoahAgentPin: 'agent-pin', NoahAgentPinGrid: 'agent-pin-grid' };
      if (id === './noah-execution-panel') return { default: () => null };
      if (['@/lib/noah-execution-contract.mjs', '@/lib/noah-agent-requirements.mjs'].includes(id)) return { recipeFor: () => null, requirementsFor: () => null };
      throw Error(id);
    },
  });
  const draw = () => { cursor = 0; return exports[name](); };
  return {
    calls, delays,
    async settle() { let tree = draw(); while (pending.length) { const fn = pending.shift(); const out = fn(); if (out && typeof out.then === 'function') await out; tree = draw(); } return tree; },
  };
}
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' ? n : '';

void test('the version list is hidden for browser-only people (401) and where the library is absent (404)', async () => {
  for (const status of [401, 404]) {
    const h = render('noah-instances.tsx', 'NoahInstancesList', () => [status, { error: 'サインインしてください。' }]);
    assert.equal(await h.settle(), null, String(status));
    assert.ok(h.delays.every(d => d >= 600_000), 'polls rarely once hidden');
  }
  const signedIn = render('noah-instances.tsx', 'NoahInstancesList', () => [200, { instances: [] }]);
  assert.match(text(await signedIn.settle()), /使用するAgentと版/);
  const failing = render('noah-instances.tsx', 'NoahInstancesList', () => [503, { error: '一時的に読めません。' }]);
  assert.match(text(await failing.settle()), /一時的に読めません/);
});

void test('the Mac acquisition list is hidden where /__noah does not exist', async () => {
  const h = render('noah-managed-installation.tsx', 'NoahInstallationsList', () => [404, undefined]);
  assert.equal(await h.settle(), null);
  assert.deepEqual(h.calls, ['/__noah/installations']);
  const mac = render('noah-managed-installation.tsx', 'NoahInstallationsList', () => [200, { installations: [] }]);
  assert.match(text(await mac.settle()), /このMacに取り寄せたAgent/);
});
