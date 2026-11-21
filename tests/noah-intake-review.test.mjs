import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../components/noah-intake-review.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const snapshot = () => ({ sources: [], mouths: { remote: 3, remoteReady: 2, terminal: 1, terminalReady: 0 }, reasons: { not_checked: 3 }, unsupported: {}, listed: 0, warnings: [], ownerScope: 'reviewer-scope', families: [{ id: 'mcp-registry:provider/name', name: 'Test Agent', members: 1, mouth: 'mcp-remote', level: 0, revision: 2, withdrawn: false }], nextOffset: null });
function harness(fetcher) {
  const slots = [], effects = [], exports = {}, calls = []; let cursor = 0, tree;
  const jsx = (type, props) => ({ type, props });
  runInNewContext(code, { exports, AbortController, URLSearchParams, Error, Date,
    fetch: async (url, init) => { calls.push({ url, init }); return fetcher(url, init); },
    require(id) {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      // 見た目（CSS）は、ここでは確かめない。class の名前だけを返す。
      if (id.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, name) => String(name) }) };
      if (id === 'react') return {
        useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
        useEffect(fn, deps) { const i = cursor++, previous = slots[i]; if (!previous || deps.some((v, n) => v !== previous.deps[n])) { slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
      };
      throw Error(id);
    },
  });
  const render = () => { cursor = 0; tree = exports.default({ ownerScope: 'reviewer-scope' }); effects.splice(0).forEach(fn => fn()); };
  const walk = value => Array.isArray(value) ? value.flatMap(walk) : value && typeof value === 'object' ? [value, ...walk(value.props?.children)] : [];
  const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
  render();
  return { calls, text: () => text(tree), nodes: () => walk(tree), async flush() { for (let n = 0; n < 4; n++) { await new Promise(setImmediate); render(); } }, click(label) { const node = walk(tree).find(n => n.type === 'button' && text(n) === label); assert.ok(node); assert.equal(!!node.props.disabled, false); node.props.onClick(); render(); }, close() { slots.forEach(slot => slot.cleanup?.()); } };
}
void test('review shows actual intake counts and moderates by query-safe ID, revision and owner scope', async t => {
  const h = harness(async (_url, init) => Response.json(init.method === 'POST' ? { ownerScope: 'reviewer-scope' } : snapshot())); t.after(() => h.close()); await h.flush();
  assert.match(h.text(), /取り込み/); assert.match(h.text(), /相手のサーバー/); assert.match(h.text(), /端末で動かす/); assert.match(h.text(), /まだ確かめていない/);
  h.click('取り下げる'); await h.flush();
  const post = h.calls.find(c => c.init.method === 'POST'); assert.equal(post.url, '/api/noah/intake'); assert.equal(post.init.headers['X-Rock-Owner-Scope'], 'reviewer-scope');
  assert.deepEqual(JSON.parse(post.init.body), { action: 'withdraw', id: 'mcp-registry:provider/name', revision: 2 });
  const select = h.nodes().find(n => n.type === 'select'); select.props.onChange({ target: { value: 'mcp-package' } }); await h.flush();
  assert.ok(h.calls.some(c => c.url.includes('mouth=mcp-package')));
});
void test('closed intake stays invisible and an account mismatch cannot expose or moderate rows', async t => {
  for (const mode of ['closed', 'changed']) {
    const h = harness(async () => mode === 'closed' ? new Response(null, { status: 404 }) : Response.json({ ...snapshot(), ownerScope: 'different-owner' })); t.after(() => h.close()); await h.flush();
    assert.doesNotMatch(h.text(), /Test Agent/); assert.equal(h.calls.some(c => c.init.method === 'POST'), false);
    if (mode === 'closed') assert.equal(h.text(), ''); else assert.match(h.text(), /アカウントが変わりました/);
  }
});
void test('the confirmed counts are their own rows, apart from the registry counts; an older answer without them still renders', async t => {
  // つながると確かめた数（spec-88 の 9.6）: 動いた・握手まで・固定の物を、台帳の件数とは別の行に出す。
  const h = harness(async () => Response.json({ ...snapshot(), listed: 12, confirmed: { ran: 5, handshake: 7, fixed: 13 } })); t.after(() => h.close()); await h.flush();
  assert.match(h.text(), /一覧に載せている数：12/);
  assert.deepEqual(h.nodes().filter(n => n.type === 'h3').map(n => n.props.children), ['つながると確かめた数', '取り込みの結果を入れる']);
  for (const row of ['動いた（人が動かして、成果が出た）：5', '握手まで確かめた（まだ誰も動かしていない）：7', '本人の Mac で動かす（台帳とは別の、固定の物）：13']) assert.ok(h.text().includes(row), row);
  // 数の無い応答（古い版）でも、画面は出る。
  const old = harness(async () => Response.json(snapshot())); t.after(() => old.close()); await old.flush();
  assert.match(old.text(), /一覧に載せている数：0/); assert.doesNotMatch(old.text(), /つながると確かめた数/);
});
