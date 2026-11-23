import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// 利用状況の「Noah全体」は運営だけの表示。運営でない人には、押すと 403 になるボタンを出さない。
function mount(report) {
  const code = ts.transpileModule(readFileSync(new URL('../components/noah-usage-dashboard.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const slots = [], exports = {}, effects = [];
  let cursor = 0;
  const react = {
    useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) { slots[i] = { deps }; effects.push(fn); } },
  };
  const jsx = (type, props) => ({ type, props });
  const pending = [];
  runInNewContext(code, {
    exports, Error, AbortController, URLSearchParams, Intl, Number, String, Math, Date,
    fetch: async () => { const p = Promise.resolve({ ok: true, json: async () => report }); pending.push(p); return p; },
    require(id) {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === 'next/link') return { default: 'a' };
      if (id === './workspace-shell') return { default: ({ children }) => children };
      if (id.endsWith('.module.css')) return { default: {} };
      throw Error(id);
    },
  });
  let tree;
  const draw = () => { cursor = 0; tree = exports.default({ initialScope: 'personal', agent: '' }); effects.splice(0).forEach(fn => fn()); };
  draw();
  return { async settle() { for (let i = 0; i < 5; i++) { await new Promise(setImmediate); draw(); } return tree; } };
}
const walk = n => Array.isArray(n) ? n.flatMap(walk) : n && typeof n === 'object' ? [n, ...walk(n.props?.children)] : [];
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' ? n : '';
const tabs = tree => walk(tree).filter(n => n.type === 'button').map(text);
const report = operatorAllowed => ({ scope: 'personal', days: 30, from: 0, to: 1, operatorAllowed, sources: [] });

void test('the Noah-wide tab appears only when the server says the viewer is an operator', async () => {
  assert.deepEqual(tabs(await mount(report(false)).settle()).filter(t => /自分の利用|提供したAgent|Noah全体/.test(t)), ['自分の利用', '提供したAgent']);
  assert.ok(tabs(await mount(report(true)).settle()).includes('Noah全体'));
});
