import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(
  readFileSync(
    new URL('../components/noah-discovery-feed.tsx', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const entry = (id = 'old', revision = 1) => ({
  id,
  revision,
  metadata: {
    name: id,
    author: 'maker',
    authorId: 'github:maker',
    summary: 'A public candidate',
    provider: 'github',
    license: 'MIT',
  },
  observedAt: 1000,
  checkedAt: 1000,
  reason: '公開ソースで新着・更新を確認',
});
const page = (entries = [entry()], extra = {}) => ({
  entries,
  sources: [],
  preferences: [],
  ownerScope: 'owner-a',
  nextCursor: null,
  snapshot: 1000,
  serverNow: 1000,
  retired: [],
  retiredOverflow: false,
  ...extra,
});
const reply = (data) => ({ ok: true, json: async () => data });
function harness(fetcher, props = {}) {
  const slots = [],
    effects = [],
    exports = {},
    polls = [];
  let cursor = 0,
    tree,
    alive = true;
  const react = {
    useCallback: (fn) => fn,
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: initial };
      return [
        slots[i].value,
        (v) => {
          slots[i].value = typeof v === 'function' ? v(slots[i].value) : v;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return (slots[i] ??= { current: initial });
    },
    useEffect(fn, deps) {
      const i = cursor++,
        old = slots[i];
      if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) {
        slots[i] = { deps };
        effects.push(() => {
          old?.cleanup?.();
          slots[i].cleanup = fn();
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  runInNewContext(code, {
    exports,
    Error,
    URLSearchParams,
    AbortSignal,
    fetch: fetcher,
    require(id) {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'next/link') return { default: 'a' };
      if (id === 'lucide-react') return { Bot: 'icon', ArrowRight: 'icon' };
      if (id.endsWith('.css')) return { default: {} };
      if (id === '@/lib/owner-intent')
        return { OWNER_SCOPE_HEADER: 'X-Rock-Owner-Scope' };
      if (id === '@/lib/noah-visible-polling')
        return {
          startNoahVisiblePolling(fn) {
            const controller = new AbortController();
            polls.push(() => fn(controller.signal));
            void fn(controller.signal);
            return () => controller.abort();
          },
        };
      throw Error(id);
    },
  });
  function render() {
    if (!alive) return;
    cursor = 0;
    tree = exports.DiscoveryContent(props);
    effects.splice(0).forEach((f) => f());
  }
  function walk(n) {
    return Array.isArray(n)
      ? n.flatMap(walk)
      : n && typeof n === 'object'
        ? [n, ...walk(n.props?.children)]
        : [];
  }
  const nodes = () => walk(tree),
    flush = async () => {
      for (let i = 0; i < 4; i++) {
        await new Promise(setImmediate);
        render();
      }
    };
  render();
  return {
    nodes,
    polls,
    flush,
    button: (text) =>
      nodes().find((n) => n.type === 'button' && n.props.children === text),
    titles: () =>
      nodes()
        .filter((n) => n.type === 'h2')
        .map((n) => n.props.children.props.children),
    unmount() {
      alive = false;
      slots.forEach((s) => s.cleanup?.());
    },
  };
}
void test('new arrivals wait for explicit refresh and renders/polls never start a provider sync or execution', async (t) => {
  const calls = [];
  let current = page();
  const h = harness(async (u, o) => {
    calls.push({ u, o });
    return reply(current);
  });
  t.after(() => h.unmount());
  await h.flush();
  assert.deepEqual(h.titles(), ['old']);
  current = page([entry('new'), entry()]);
  await h.polls.at(-1)();
  await h.flush();
  assert.deepEqual(h.titles(), ['old']);
  h.button('公開ソースの新着・更新を読み込む').props.onClick();
  await h.flush();
  assert.deepEqual(h.titles(), ['new', 'old']);
  assert.ok(calls.every((c) => !c.o.method));
});
void test('current withdrawals and expired checks remove old cards without moving in new arrivals', async (t) => {
  let current = page([entry('old'), entry('retire')]);
  const h = harness(async () => reply(current));
  t.after(() => h.unmount());
  await h.flush();
  current = page([entry('new')], { retired: ['retire'] });
  await h.polls.at(-1)();
  await h.flush();
  assert.deepEqual(h.titles(), ['old']);
  current = page([], { serverNow: 86402000 });
  await h.polls.at(-1)();
  await h.flush();
  assert.deepEqual(h.titles(), []);
});
void test('account change discards an old in-flight pagination response and preserves the new preferences', async (t) => {
  let current = page([entry('alice')], { nextCursor: 'next' }),
    release;
  const h = harness(async (u) =>
    u.includes('cursor=') ? new Promise((r) => (release = r)) : reply(current),
  );
  t.after(() => h.unmount());
  await h.flush();
  h.button('新着候補をさらに読み込む').props.onClick();
  await h.flush();
  current = page([entry('bob')], { ownerScope: 'owner-b' });
  await h.polls.at(-1)();
  await h.flush();
  release(reply(page([entry('private-old-filter')])));
  await h.flush();
  assert.deepEqual(h.titles(), ['bob']);
});
void test('hide uses existing owner-bound preferences, duplicated clicks submit once and the refreshed page removes it', async (t) => {
  let current = page(),
    release;
  const calls = [];
  const h = harness(async (u, o) => {
    if (o.method) {
      calls.push({ u, o });
      return new Promise((r) => (release = r));
    }
    return reply(current);
  });
  t.after(() => h.unmount());
  await h.flush();
  h.button('非表示').props.onClick();
  h.button('非表示').props.onClick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].u, '/api/noah/feed');
  assert.deepEqual(JSON.parse(calls[0].o.body), {
    kind: 'hide',
    subject: 'old',
    active: true,
  });
  assert.equal(calls[0].o.headers['X-Rock-Owner-Scope'], 'owner-a');
  current = page([]);
  release(reply({ ownerScope: 'owner-a' }));
  await h.flush();
  assert.deepEqual(h.titles(), []);
});
void test('settings sync is explicit, obeys host due checks and cannot report another owner response as saved', async (t) => {
  const h = harness(
    async (_u, o) => reply(o.method ? { ownerScope: 'other' } : page()),
    { settings: true },
  );
  t.after(() => h.unmount());
  await h.flush();
  h.button('新着の取得を確認').props.onClick();
  await h.flush();
  assert.ok(h.nodes().some((n) => n.props?.role === 'alert'));
  assert.equal(
    h.nodes().some((n) => n.props?.role === 'status'),
    false,
  );
});
