import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../components/noah-developer-maintenance.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const jsx = (type, props) => ({ type, props });
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
function harness(fetcher) {
  const slots = [], effects = [], events = new Map(), exports = {}, calls = [];
  let cursor = 0, tree;
  runInNewContext(code, { exports, AbortController, crypto, encodeURIComponent, Error, Date, setTimeout, clearTimeout,
    fetch: async (url, options) => { calls.push({url, options}); return fetcher(url, options); },
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'next/link') return { default: 'a' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      if (name === '@/lib/owner-intent') return { OWNER_SCOPE_HEADER: 'X-Rockstar-Owner-Scope' };
      if (name.endsWith('.module.css')) return { default: new Proxy({}, {get: (_, key) => String(key)}) };
      if (name === 'react') return {
        useState(value) { const i = cursor++; slots[i] ??= {value}; return [slots[i].value, v => {slots[i].value = typeof v === 'function' ? v(slots[i].value) : v;}]; },
        useRef(value) { return slots[cursor++] ??= {current: value}; },
        useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => v !== old.deps[n])) {slots[i] = {deps}; effects.push(() => {old?.cleanup?.(); slots[i].cleanup = fn();});} },
      };
      throw Error(name);
    },
  });
  const render = () => { cursor = 0; tree = exports.default({ initialAgent: 'anicca' }); effects.splice(0).forEach(fn => fn()); };
  render();
  return {
    calls, events, render,
    node: predicate => nodes(tree).find(predicate),
    async flush() { for (let i = 0; i < 4; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } },
    fill() {
      nodes(tree).find(n => n.type === 'input' && n.props.type === 'url').props.onChange({ target: { value: 'https://github.com/example/synthetic' } });
      nodes(tree).find(n => n.type === 'textarea').props.onChange({ target: { value: 'Synthetic improvement request' } });
      nodes(tree).find(n => n.props?.type === 'checkbox').props.onChange({ target: { checked: true } });
      render();
    },
    submit() { nodes(tree).find(n => n.type === 'form').props.onSubmit({preventDefault(){}}); render(); },
    close() { slots.forEach(s => s?.cleanup?.()); },
  };
}
const history = () => Response.json({ownerScope: 'scope-a', requests: []});
void test('maintenance UI preserves draft and request identity after an ambiguous save failure', async t => {
  let sends = 0;
  const h = harness(async (_, options) => options?.method === 'POST' ? (++sends === 1 ? Response.json({error:'offline'}, {status:503}) : Response.json({id:'receipt', message:'Saved'})) : history());
  t.after(() => h.close()); await h.flush(); h.fill(); h.submit(); await h.flush();
  assert.equal(h.node(n => n.type === 'textarea').props.value, 'Synthetic improvement request');
  h.submit(); await h.flush();
  const writes = h.calls.filter(c => c.options?.method === 'POST');
  assert.equal(writes.length, 2);
  assert.equal(JSON.parse(writes[0].options.body).id, JSON.parse(writes[1].options.body).id);
  assert.equal(writes[0].options.headers['X-Rockstar-Owner-Scope'], 'scope-a');
  assert.equal(h.node(n => n.type === 'textarea').props.value, '');
  assert.ok(h.node(n => n.type === 'output'));
});
void test('maintenance UI clears private draft on account change and ignores late save receipt', async t => {
  let finish;
  const h = harness((_, options) => options?.method === 'POST' ? new Promise(resolve => {finish = resolve;}) : history());
  t.after(() => h.close()); await h.flush(); h.fill(); h.submit();
  h.events.get('rockstar-community-changed')(); await h.flush();
  finish(Response.json({id:'old-owner-receipt', message:'Saved'})); await h.flush();
  assert.equal(h.node(n => n.type === 'textarea').props.value, '');
  assert.equal(h.node(n => n.props?.type === 'checkbox').props.checked, false);
  assert.equal(h.node(n => n.type === 'output'), undefined);
});
void test('maintenance UI cannot submit before authenticated owner scope is loaded', async t => {
  const h = harness(() => Response.json({error:'本人確認が必要です。'}, {status:401}));
  t.after(() => h.close()); await h.flush(); h.fill(); h.submit(); await h.flush();
  assert.equal(h.calls.filter(c => c.options?.method === 'POST').length, 0);
  assert.ok(h.node(n => n.props?.href?.startsWith('/account?returnTo=')));
  assert.equal(h.node(n => n.props?.className === 'submit').props.disabled, true);
});
