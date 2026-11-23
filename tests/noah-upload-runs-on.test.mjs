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
      if (id === './noah-cover-picker') return { default: 'cover-picker', coverReady: ({ kind }) => kind === 'later' };
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


// 使い勝手の確かめ 3 章の 11・9 章の Q1: コードを保存した Agent は「このMacの隔離環境」でしか動かないのに、
// 「自分のAgentを追加」の画面にそれが書かれておらず、スマホの人がテンプレートのまま追加すると、動かせない Agent ができた。
// 決め（2026-11-23、本人「好きにしていいよ」）: 作りは変えない。コードの時に、Mac で動く事と、スマホから使う道（MCP・Web）を書く。
void test('コードを保存する Agent を選んでいる時だけ、Mac で動く事と、スマホから使う道を書く', async t => {
  const h = harness(async url => url === '/api/noah/agents' ? reply(200, { ownerScope: 'owner-a' }) : reply(200, { ownerScope: 'owner-a', drafts: [] }));
  t.after(() => h.unmount()); await h.flush();
  const note = h.nodes().find(n => n.type === 'p' && n.props?.role === 'note');
  assert.ok(note, 'コードの時は、動く場所の注記がある');
  assert.match(h.text(), /コードを保存したAgentは、自分のMacのNoahで動きます（Noahの専用環境で動かせるのは、運営が確認したパッケージだけです）。/);
  assert.match(h.text(), /スマホやブラウザだけでは、まだ動かせません。/);
  assert.match(h.text(), /「MCPサーバーに接続する」か「専用のWeb画面を開く」/);
  const select = h.nodes().find(n => n.type === 'select' && [n.props.children].flat().some(o => o?.props?.value === 'mcp_http'));
  assert.ok(select);
  select.props.onChange({ target: { value: 'mcp_http' } });
  await h.flush();
  assert.equal(h.nodes().some(n => n.type === 'p' && n.props?.role === 'note'), false, '接続先の Agent には出さない');
  assert.doesNotMatch(h.text(), /スマホやブラウザだけでは、まだ動かせません/);
});
