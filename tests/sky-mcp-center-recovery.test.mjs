import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../components/sky-mcp-center.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const passport = { tools: [{ name: 'synthetic-read' }] };
const server = (id) => ({ id, name: `Fixture ${id}`, description: 'Synthetic server', transport: 'stdio', state: 'available', toolCount: null, passport: null });

function harness() {
  const slots = [], effects = [], lists = [], connects = [], intervals = new Set();
  const window = new EventTarget(), document = new EventTarget();
  document.visibilityState = 'visible';
  window.setInterval = (fn) => { intervals.add(fn); return fn; };
  window.clearInterval = (fn) => intervals.delete(fn);
  let cursor = 0, tree, connected = true, mounted = true;
  const changed = (old, next) => !old || old.length !== next.length || old.some((v, i) => !Object.is(v, next[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  runInNewContext(compiled, { exports, Error, Event, queueMicrotask, window, document, require(id) {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (id === 'lucide-react' || id === '@/components/ui/dialog' || id.endsWith('.css')) return {};
    if (id === '@/lib/mcp-hub') return {
      listMcpConnections() { const request = Promise.withResolvers(); lists.push(request); return request.promise; },
      connectMcp(id) { const request = { ...Promise.withResolvers(), id }; connects.push(request); return request.promise; },
    };
    throw Error(`Unexpected module ${id}`);
  } });
  function render() {
    cursor = 0;
    tree = exports.default({ connected, open: true, onOpenChange() {}, onOpenDevice() {} });
    effects.splice(0).forEach((effect) => effect());
  }
  function nodes(node, out = []) { if (Array.isArray(node)) node.forEach((x) => nodes(x, out)); else if (node && typeof node === 'object') { out.push(node); nodes(node.props?.children, out); } return out; }
  function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : ''; }
  function buttons() { return nodes(tree).filter((x) => x.type === 'article').map((article) => nodes(article).find((x) => x.type === 'button')); }
  async function flush() { for (let i = 0; i < 3; i++) { await new Promise((resolve) => setImmediate(resolve)); if (mounted) render(); } }
  render();
  return {
    lists, connects, buttons, flush, text: () => text(tree),
    poll() { intervals.forEach((fn) => fn()); },
    event() { window.dispatchEvent(new Event('sky-mcp-servers')); },
    setConnected(value) { connected = value; render(); },
    unmount() { mounted = false; slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

for (const stale of ['success', 'error']) void test(`an old poll ${stale} cannot replace a newer event list`, async () => {
  const h = harness();
  h.poll();
  h.event();
  h.lists[2].resolve([server('new')]);
  await h.flush();
  if (stale === 'success') h.lists[1].resolve([server('old')]);
  else h.lists[1].reject(new Error('old lookup failure'));
  h.lists[0].resolve([server('initial')]);
  await h.flush();
  assert.ok(h.text().includes('Fixture new'));
  assert.ok(!h.text().includes('Fixture old'));
  assert.ok(!h.text().includes('old lookup failure'));
});

for (const late of ['success', 'error']) void test(`a disconnected connection ${late} cannot update a reconnected session`, async () => {
  const h = harness();
  h.lists[0].resolve([server('old')]); await h.flush();
  h.buttons()[0].props.onClick(); await h.flush();
  h.setConnected(false); await h.flush();
  h.setConnected(true); await h.flush();
  h.lists.at(-1).resolve([server('new')]); await h.flush();
  const reads = h.lists.length;
  if (late === 'success') h.connects[0].resolve(passport);
  else h.connects[0].reject(new Error('old connect failure'));
  await h.flush();
  assert.equal(h.lists.length, reads, 'discarded connect must not trigger a refresh in the new session');
  assert.ok(!h.text().includes('Fixture oldへ接続しました'));
  assert.ok(!h.text().includes('old connect failure'));
  assert.ok(h.text().includes('Fixture new'));
});

void test('connection success after unmount cannot dispatch a list refresh', async () => {
  const h = harness();
  h.lists[0].resolve([server('old')]); await h.flush();
  h.buttons()[0].props.onClick(); await h.flush();
  h.unmount();
  const reads = h.lists.length;
  h.connects[0].resolve(passport); await h.flush();
  assert.equal(h.lists.length, reads);
});

void test('one pending connection blocks another server including a same-render double click', async () => {
  const h = harness();
  h.lists[0].resolve([server('first'), server('second')]); await h.flush();
  const buttons = h.buttons();
  buttons[0].props.onClick(); buttons[1].props.onClick();
  await h.flush();
  assert.equal(h.connects.length, 1);
  assert.ok(h.buttons().every((button) => button.props.disabled));
  h.connects[0].reject(new Error('current connection failed')); await h.flush();
  assert.ok(h.text().includes('current connection failed'));
  assert.ok(h.buttons().every((button) => !button.props.disabled));
  h.buttons()[1].props.onClick(); await h.flush();
  assert.equal(h.connects.length, 2);
});

void test('current connection reports success and refreshes once without accepting an older list', async () => {
  const h = harness();
  h.lists[0].resolve([server('first')]); await h.flush();
  h.poll();
  h.buttons()[0].props.onClick(); await h.flush();
  h.connects[0].resolve(passport); await h.flush();
  assert.equal(h.lists.length, 3, 'connection completion must request one current readback');
  h.lists[2].resolve([{ ...server('verified'), state: 'connected', toolCount: 1, passport }]); await h.flush();
  h.lists[1].resolve([server('old')]); await h.flush();
  assert.ok(h.text().includes('Fixture firstへ接続しました'));
  assert.ok(h.text().includes('Fixture verified'));
  assert.ok(!h.text().includes('Fixture old'));
  assert.ok(h.buttons().every((button) => !button.props.disabled));
});

void test('the latest lookup error remains visible until an explicit newer read succeeds', async () => {
  const h = harness();
  h.event();
  h.lists[1].reject(new Error('current lookup failure')); await h.flush();
  h.lists[0].resolve([server('stale')]); await h.flush();
  assert.ok(h.text().includes('current lookup failure'));
  assert.ok(!h.text().includes('Fixture stale'));
  h.event(); h.lists[2].resolve([server('recovered')]); await h.flush();
  assert.ok(h.text().includes('Fixture recovered'));
  assert.ok(!h.text().includes('current lookup failure'));
});

for (const stale of ['success', 'error']) void test(`an old connection ${stale} cannot clear a new session's busy state`, async () => {
  const h = harness();
  h.lists[0].resolve([server('old')]); await h.flush();
  h.buttons()[0].props.onClick(); await h.flush();
  h.setConnected(false); await h.flush(); h.setConnected(true); await h.flush();
  h.lists.at(-1).resolve([server('new')]); await h.flush();
  h.buttons()[0].props.onClick(); await h.flush();
  const reads = h.lists.length;
  if (stale === 'success') h.connects[0].resolve(passport);
  else h.connects[0].reject(new Error('stale connect failure'));
  await h.flush();
  assert.equal(h.lists.length, reads);
  assert.ok(h.buttons().every((button) => button.props.disabled));
  assert.ok(!h.text().includes('Fixture oldへ接続しました'));
  assert.ok(!h.text().includes('stale connect failure'));
  h.connects[1].resolve(passport); await h.flush();
  assert.ok(h.text().includes('Fixture newへ接続しました'));
  assert.ok(h.buttons().every((button) => !button.props.disabled));
});
