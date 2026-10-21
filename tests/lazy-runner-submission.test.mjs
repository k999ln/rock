import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadRouteFixture } from './route-fixture.mjs';
const root = new URL('../', import.meta.url);
const event = { preventDefault() {} };
async function setup(kind, { remote = true } = {}) {
  const slots = [], calls = [], listeners = [], effects = [];
  let cursor = 0, tree, props = {};
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useMemo(fn) { return fn(); },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useLayoutEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((value, index) => value !== old.deps[index])) { old?.cleanup?.(); const slot = { deps }; slots[i] = slot; effects.push(() => { slot.cleanup = fn(); }); } },
  };
  const gate = Promise.withResolvers(), jsx = (type, props) => ({ type, props });
  const modules = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/lib/local-guide-history': loadRouteFixture(new URL('lib/local-guide-history.ts', root), new Map([['./operations-client', { executeTracked() { throw Error('No history opt-in in this fixture'); }, OperationRequestError: class extends Error {}, operationFailureCode: () => 'CLIENT_ERROR' }]])), '@/lib/operations-client': { processedBytes() { return 1; } } };
  for (const name of ['legal-intake', 'legal-ai', 'patent-assistant']) modules[`@/lib/${name}`] = await import(new URL(`lib/${name}.ts`, root));
  const exports = {};
  const source = readFileSync(new URL(`components/${kind}-runner.tsx`, root), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require(name) { return modules[name] ?? new Proxy({}, { get: (_, key) => String(key) }); }, fetch: async (url, options) => { calls.push({ url, ...options }); await gate.promise; return Response.json({ error: 'Synthetic remote unavailable' }, { status: 503 }); }, window: { addEventListener(...args) { listeners.push(args); }, removeEventListener() {} } });
  const Component = Object.values(exports)[0];
  const visit = (value, out = []) => { if (Array.isArray(value)) value.forEach(x => visit(x, out)); else if (value && typeof value === 'object') { out.push(value); visit(value.props?.children, out); } return out; }; const nodes = (value = tree) => visit(value);
  const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : '';
  const render = () => { cursor = 0; tree = Component(props); while (effects.length) effects.shift()(); };
  const input = (predicate, value) => { const node = nodes().find(predicate); assert.ok(node); node.props.onChange({ target: { value, checked: value } }); render(); };
  const checkbox = label => { const node = nodes().find(n => n.type === 'label' && text(n).includes(label)); assert.ok(node); const box = nodes(node).find(n => n.type === 'input' && n.props.type === 'checkbox'); box.props.onChange({ target: { checked: true } }); render(); };
  render();
  if (kind === 'legal-intake') {
    input(n => n.type === 'textarea' && n.props.maxLength === 2000, 'Synthetic legal question with enough characters for valid review');
    checkbox('一般情報であること'); if (remote) checkbox('通信を許可して');
  } else if (kind === 'patent-assistant') {
    input(n => n.type === 'input' && n.props.maxLength === 200, 'Synthetic invention title');
    nodes().find(n => n.type === 'form').props.onSubmit(event); render(); input(n => n.type === 'textarea' && n.props.placeholder?.includes('複数システム'), 'Synthetic original technical problem'); if (remote) checkbox('この入力をOpenAI');
  } else { input(n => n.type === 'textarea', 'Synthetic public evaluation input'); checkbox('TypeSafe AI'); }
  return { render, nodes, calls, gate, listeners, text: () => text(tree), textOf: text, unmount() { slots.forEach((slot) => slot?.cleanup?.()); }, setProps(next) { props = next; render(); }, submit() { return nodes().find(n => n.type === 'form').props.onSubmit(event); } };
}
for (const kind of ['legal-intake', 'patent-assistant', 'jev-evaluation']) {
  await test(`${kind}: repeated same-frame submit should dispatch only once`, async () => {
    const h = await setup(kind), a = h.submit(), b = h.submit();
    const count = h.calls.length; h.gate.resolve(); await Promise.all([a, b]);
    assert.equal(count, 1, 'one explicit form submission must not overlap another');
  });
}
await test('Jev disabled execution must disable the submit button and handler', async () => {
  const h = await setup('jev-evaluation'); h.setProps({ executionDisabled: true });
  const button = h.nodes().find(n => n.type === 'button' && n.props.type === 'submit');
  const pending = h.submit(); h.gate.resolve(); await pending;
  assert.equal(h.calls.length, 0, 'executionDisabled cannot dispatch a remote request');
  assert.equal(button.props.disabled, true);
});

for (const kind of ['legal-intake', 'patent-assistant', 'jev-evaluation']) {
  await test(`${kind}: captured handler respects later execution disablement and unmount`, async () => {
    const h = await setup(kind), submit = h.nodes().find((node) => node.type === 'form').props.onSubmit;
    h.setProps({ executionDisabled: true }); await submit(event);
    assert.equal(h.calls.length, 0, 'captured handler reads current execution permission');
    h.setProps({ executionDisabled: false }); h.unmount(); await submit(event);
    assert.equal(h.calls.length, 0, 'unmounted form never starts a new remote operation');
  });
  await test(`${kind}: failed request releases the lock and retains input for explicit retry`, async () => {
    const h = await setup(kind), before = h.nodes().filter((node) => node.type === 'textarea' || node.type === 'input').map((node) => node.props.value);
    const first = h.submit(); h.gate.resolve(); await first; h.render();
    assert.equal(h.calls.length, 1);
    const after = h.nodes().filter((node) => node.type === 'textarea' || node.type === 'input').map((node) => node.props.value);
    if (kind !== 'patent-assistant') assert.deepEqual(after, before, 'failed send does not delete raw input');
    if (kind === 'patent-assistant') {
      const edit = h.nodes().find((node) => node.type === 'button' && h.textOf(node).trim() === '修正');
      assert.ok(edit, 'existing edit action returns to the retained technical details');
      edit.props.onClick(); h.render();
      assert.deepEqual(h.nodes().filter((node) => node.type === 'textarea' || node.type === 'input').map((node) => node.props.value), before);
    }
    await h.submit(); h.render();
    assert.equal(h.calls.length, 2, 'only a new explicit submit creates the retry request');
    if (kind !== 'jev-evaluation') assert.equal(h.calls[1].body, h.calls[0].body, 'explicit retry uses the exact retained input');
    else assert.equal(JSON.parse(h.calls[1].body).state, JSON.parse(h.calls[0].body).state);
  });
}
for (const kind of ['legal-intake', 'patent-assistant']) await test(`${kind}: unauthenticated local guide still works without any remote request`, async () => {
  const h = await setup(kind, { remote: false }); await h.submit(); h.render();
  assert.equal(h.calls.length, 0); assert.ok(h.text().includes('端末内')); assert.ok(h.text().includes('通信は行っていません'));
});
