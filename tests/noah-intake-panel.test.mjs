// 運営の画面の「取り込み」の節: 審査者でない人には何も出さない。件数と理由を文で出す。取り下げと戻しは、明示の操作でだけ送る。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../components/noah-intake-panel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
const status = (change = {}) => ({
  sources: [{ id: 'mcp-registry', label: 'Official MCP Registry', lastSuccessAt: 1_795_170_000_000, nextRunAt: 1_795_173_600_000, sweepStartedAt: null, sweepMode: null, checkpointAt: 1, lastFullAt: 1, errorCode: null, failureCount: 0, observed: 67703, withdrawn: 0 }],
  table: [{ mouth: 'mcp-remote', label: '相手のサーバー', candidates: 44640, noInput: 40503, setup: 4137 }, { mouth: 'mcp-package', label: '端末で動かす', candidates: 18158, noInput: 14132, setup: 4026 }],
  unsupported: [{ reason: 'unsupported_registry', label: '型紙の無い配布', count: 1654 }, { reason: 'no_endpoint', label: '接続先が無い', count: 962 }],
  listing: { listed: 0, families: { ran: 3, new: 25 }, reasons: [{ reason: 'not_checked', label: 'まだ握手していない', count: 31433 }] },
  withdrawn: [], warnings: [], ownerScope: 'owner-a', ...change,
});
const agent = (change = {}) => ({
  id: 'mcp-registry:ac.mizan/registry', name: 'Mizan', provider: 'ac.mizan', summary: '', host: 'mizan.ac', section: 'new', members: 1,
  review: { revision: 4, withdrawnAt: null, hiddenAt: null, mouth: 'mcp-remote', level: 1, listing: { listed: true } }, ...change,
});
const reply = (data, statusCode = 200) => ({ ok: statusCode >= 200 && statusCode < 300, status: statusCode, json: async () => data });

function harness(fetcher) {
  const slots = [], effects = [], exports = {};
  let cursor = 0, tree;
  const react = {
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: initial };
      return [slots[i].value, (v) => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }];
    },
    useRef(initial) {
      const i = cursor++;
      return (slots[i] ??= { current: initial });
    },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) {
        slots[i] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  runInNewContext(code, {
    exports, Error, AbortController, Date, encodeURIComponent, JSON, fetch: fetcher,
    require(id) {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === '@/lib/owner-intent') return { OWNER_SCOPE_HEADER: 'X-Rock-Owner-Scope' };
      if (id.endsWith('.css')) return { default: {} };
      throw Error(id);
    },
  });
  function render() { cursor = 0; tree = exports.default(); effects.splice(0).forEach((f) => f()); }
  const walk = (n) => (Array.isArray(n) ? n.flatMap(walk) : n && typeof n === 'object' ? [n, ...walk(n.props?.children)] : []);
  const flat = (n) => (Array.isArray(n) ? n.map(flat).join('') : n && typeof n === 'object' ? flat(n.props?.children) : typeof n === 'string' || typeof n === 'number' ? String(n) : '');
  const flush = async () => { for (let i = 0; i < 4; i++) { await new Promise(setImmediate); render(); } };
  render();
  return {
    flush, tree: () => tree, text: () => flat(tree), nodes: () => walk(tree),
    button: (label) => walk(tree).find((n) => n.type === 'button' && flat(n) === label),
    input: () => walk(tree).find((n) => n.type === 'input'),
    form: () => walk(tree).find((n) => n.type === 'form'),
    unmount() { slots.forEach((s) => s.cleanup?.()); },
  };
}
const type = async (h, value) => { h.input().props.onChange({ target: { value } }); await h.flush(); };
const submit = async (h) => { h.form().props.onSubmit({ preventDefault() {} }); await h.flush(); };

void test('審査者でない人には、この節を出さない。読み込みは、何も変えない要求 1 回だけ', async (t) => {
  for (const code404 of [404, 401]) {
    const calls = [];
    const h = harness(async (url, options) => { calls.push({ url, options }); return reply({ error: '見つかりません。' }, code404); });
    t.after(() => h.unmount());
    await h.flush();
    assert.equal(h.tree(), null);
    assert.deepEqual(calls.map((call) => [call.url, call.options.method]), [['/api/noah/intake?state=1', undefined]]);
  }
});

void test('件数の表・つなげない内訳・載せている数・載せていない理由を、文字で出す', async (t) => {
  const h = harness(async () => reply(status({ warnings: ['NOAH_INTAKE_PUBLIC は true か false です。閉じた物として扱います。'] })));
  t.after(() => h.unmount());
  await h.flush();
  const text = h.text();
  for (const part of ['取り込み', 'Official MCP Registry', '相手のサーバー', '44,640', '40,503', '4,137', '端末で動かす', '18,158', '14,132', '4,026',
    'つなげない 2,616: 型紙の無い配布 1,654 ／ 接続先が無い 962', '一覧に載せている系列: 動いた 3 ／ 握手まで 25', '載せていない候補: まだ握手していない 31,433',
    '切り替えの値: NOAH_INTAKE_PUBLIC は true か false です。閉じた物として扱います。', '前の巡回で読んだ記録 67,703 件'])
    assert.ok(text.includes(part), part);
  assert.equal(h.nodes().filter((n) => n.type === 'th' && n.props.scope).length, 6, '表の見出しに scope がある');
  // 台帳を読めなかった時は、色ではなく文で出す。
  const failed = harness(async () => reply(status({ sources: [{ ...status().sources[0], errorCode: 'rate_limited', failureCount: 2, sweepMode: 'full' }] })));
  t.after(() => failed.unmount());
  await failed.flush();
  assert.ok(failed.text().includes('全件を読んでいます'));
  assert.ok(failed.text().includes('台帳が混んでいます（続けて 2 回）'));
  const empty = harness(async () => reply(status({ sources: [], unsupported: [], listing: { listed: 0, families: { ran: 0, new: 0 }, reasons: [] } })));
  t.after(() => empty.unmount());
  await empty.flush();
  assert.ok(empty.text().includes('まだ、台帳を読んでいません'));
  assert.ok(empty.text().includes('つなげない 0'));
});

void test('系列は、語・台帳の名前・ID で探す。ID は query で渡す。取り下げと戻しは、押した時にだけ送る', async (t) => {
  const calls = [];
  let current = agent();
  let state = status();
  const h = harness(async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      current = agent({ review: { ...current.review, revision: body.revision + 1, withdrawnAt: body.action === 'withdraw' ? 9 : null } });
      state = status({ withdrawn: body.action === 'withdraw' ? [{ id: current.id, name: 'Mizan', revision: body.revision + 1, withdrawnAt: 1_795_170_000_000 }] : [] });
      return reply({ family: { id: body.id, revision: body.revision + 1 } });
    }
    if (url.includes('?state=1')) return reply(state);
    if (url.includes('?q=')) return reply({ items: [{ id: current.id, name: 'Mizan', provider: 'ac.mizan', section: 'new' }] });
    if (url.includes('?id=')) return url.includes(encodeURIComponent('mcp-registry:ac.mizan/registry')) ? reply({ agent: current }) : reply({ error: '見つかりません。' }, 404);
    throw Error(url);
  });
  t.after(() => h.unmount());
  await h.flush();
  assert.equal(h.button('探す').props.disabled, true, '何も入れていない時は探せない');
  // 語で探す → 開く
  await type(h, 'ban');
  await submit(h);
  assert.equal(calls.at(-1).url, '/api/noah/intake?q=ban');
  h.button('開く').props.onClick();
  await h.flush();
  assert.equal(calls.at(-1).url, '/api/noah/intake?id=mcp-registry%3Aac.mizan%2Fregistry');
  assert.ok(h.text().includes('提供: ac.mizan・相手のサーバー・握手まで・一覧に載せています'));
  assert.equal(calls.filter((call) => call.options.method === 'POST').length, 0, '読むだけでは、何も送らない');
  // 取り下げる
  h.button('取り下げる').props.onClick();
  await h.flush();
  const post = calls.find((call) => call.options.method === 'POST');
  assert.deepEqual([post.url, JSON.parse(post.options.body), post.options.headers['X-Rock-Owner-Scope'], post.options.headers['Content-Type']],
    ['/api/noah/intake', { action: 'withdraw', id: 'mcp-registry:ac.mizan/registry', revision: 4 }, 'owner-a', 'application/json']);
  assert.ok(h.text().includes('取り下げている系列'));
  // 取り下げた一覧から戻す
  h.button('戻す').props.onClick();
  await h.flush();
  assert.deepEqual(JSON.parse(calls.filter((call) => call.options.method === 'POST')[1].options.body), { action: 'restore', id: 'mcp-registry:ac.mizan/registry', revision: 5 });
  assert.equal(h.text().includes('取り下げている系列'), false);
  // 台帳の名前は、公式台帳の ID に直して開く。ID はそのまま開く。
  await type(h, 'ac.mizan/registry');
  await submit(h);
  assert.equal(calls.at(-1).url, '/api/noah/intake?id=mcp-registry%3Aac.mizan%2Fregistry');
  await type(h, 'bulk:io.github.maker@gateway.example.com');
  await submit(h);
  assert.equal(calls.at(-1).url, `/api/noah/intake?id=${encodeURIComponent('bulk:io.github.maker@gateway.example.com')}`);
  assert.ok(h.text().includes('その ID の系列は、取り込みの記録にありません。'));
  // 量産の系列は、まとめた数で出す。
  current = agent({ id: 'mcp-registry:ac.mizan/registry', members: 1936, provider: 'io.github.pipeworx-io', review: { ...agent().review, listing: { listed: false, reason: 'bulk', label: '量産の系列' } } });
  await type(h, 'ac.mizan/registry');
  await submit(h);
  assert.ok(h.text().includes('io.github.pipeworx-io の道具 1,936 個'));
  assert.ok(h.text().includes('一覧に載せていません（量産の系列）'));
});

void test('保存に失敗した時は、理由を出して、そのままにする。送っている間は、もう 1 回送らない', async (t) => {
  let release;
  let posts = 0;
  const h = harness(async (url, options = {}) => {
    if (options.method === 'POST') { posts++; return new Promise((resolve) => { release = resolve; }); }
    if (url.includes('?state=1')) return reply(status());
    return reply({ agent: agent() });
  });
  t.after(() => h.unmount());
  await h.flush();
  await type(h, 'mcp-registry:ac.mizan/registry');
  await submit(h);
  h.button('取り下げる').props.onClick();
  h.button('取り下げる').props.onClick();
  await h.flush();
  assert.equal(posts, 1);
  assert.equal(h.button('取り下げる').props.disabled, true);
  release(reply({ error: '他の操作で変わっています。読み直してください。' }, 409));
  await h.flush();
  assert.ok(h.nodes().some((n) => n.props?.role === 'alert' && n.props.children === '他の操作で変わっています。読み直してください。'));
  assert.equal(h.button('取り下げる').props.disabled, false);
});
