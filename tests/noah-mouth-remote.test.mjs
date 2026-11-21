// リモートの口（握手・道具の一覧・呼び出し）、接続先の検査、相手の許可の組み立て、起動の型紙の検証。
// 通信はしない。接続先は、この試験の中の関数（実測の写しと、合成のサーバー）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOAH_MCP_PROTOCOLS, NoahMouthError, createNoahGuardedFetch, isNoahPrivateAddress,
 noahMcpCall, noahMcpClose, noahMcpHandshake, noahToolsSha256 } from '../lib/noah-mouth-mcp-remote.ts';

const exchange = JSON.parse(readFileSync(new URL('./fixtures/noah/mcp-exchange-mizan.json', import.meta.url), 'utf8'));
const sse = (...messages) => new Response(messages.map((m) => `event: message\ndata: ${JSON.stringify(m)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
const json = (message, headers = {}) => Response.json(message, { headers });
const tool = (name, readOnly = true, extra = {}) => ({ name, description: `${name} の説明`, inputSchema: { type: 'object', properties: {} }, ...(readOnly === null ? {} : { annotations: { readOnlyHint: readOnly } }), ...extra });

/** 合成のサーバー。options で、相手の振る舞いを変える。受け取った要求を log に残す。 */
function server(options = {}) {
  const log = [];
  const tools = options.tools ?? [tool('read_thing'), tool('write_thing', false)];
  const handler = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : null;
    log.push({ url: String(url), method: init.method, rpc: body?.method, headers: Object.fromEntries(headers), body });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    if (options.status) return new Response('', { status: options.status, headers: options.statusHeaders ?? {} });
    if (options.needsToken && headers.get('authorization') !== `Bearer ${options.needsToken}`)
      return new Response('', { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource", scope="things:read"' } });
    const reply = (result) => (options.sse ? sse(...(options.noise ? [{ jsonrpc: '2.0', method: 'notifications/progress', params: {} }] : []), { jsonrpc: '2.0', id: body.id, result }) : json({ jsonrpc: '2.0', id: body.id, result }, options.session && body.method === 'initialize' ? { 'mcp-session-id': options.session } : {}));
    if (body.method === 'initialize') {
      if (options.rejects?.includes(body.params.protocolVersion)) return json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Unsupported protocol version' } });
      return reply({ protocolVersion: options.answers ?? body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'synthetic' } });
    }
    if (options.session && headers.get('mcp-session-id') !== options.session) return new Response('', { status: 400 });
    if (body.method === 'notifications/initialized') return new Response(null, { status: options.notifyStatus ?? 202 });
    if (body.method === 'tools/list') {
      const size = options.pageSize ?? tools.length;
      const start = Number(body.params.cursor ?? 0);
      const page = tools.slice(start, start + size);
      return reply({ tools: page, ...(start + size < tools.length ? { nextCursor: String(start + size) } : {}) });
    }
    if (body.method === 'tools/call') return reply(options.call?.(body.params) ?? { content: [{ type: 'text', text: `${body.params.name} ok` }] });
    return new Response('', { status: 404 });
  };
  return { fetch: handler, log };
}
const failure = async (promise) => {
  try { await promise; } catch (error) { assert.ok(error instanceof NoahMouthError, String(error)); return error; }
  assert.fail('失敗しなかった');
};
const URL_OK = 'https://api.example.com/mcp';

void test('実測の写し: mizan.ac との握手と道具の一覧（SSE、セッションなし）', async () => {
  const seen = [];
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push([String(url), body.method, new Headers(init.headers).get('accept')]);
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    const part = body.method === 'initialize' ? exchange.initialize : exchange.toolsList;
    // 実物は、こちらが名乗った版にかかわらず 2025-06-18 を返した。id は要求に合わせる。
    return new Response(part.body.replace(/"id":\d+/, `"id":${body.id}`), { status: part.status, headers: exchange.responseHeaders });
  };
  const hs = await noahMcpHandshake(exchange.url, { fetch: fetcher });
  assert.equal(hs.protocol, exchange.observed.protocolVersion);
  assert.equal(hs.serverName, exchange.observed.serverName);
  assert.equal(hs.tools.length, exchange.observed.tools);
  assert.equal(hs.allReadOnly, exchange.observed.allReadOnly);
  assert.equal(hs.session.sessionId, null);
  assert.deepEqual(hs.tools.map((t) => t.name), ['lookup_player', 'check_players', 'list_sources', 'registry_stats', 'list_my_communities']);
  assert.deepEqual(hs.tools[0].inputSchema.required, ['query']);
  assert.match(hs.toolsSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(seen.map((s) => s[1]), ['initialize', 'notifications/initialized', 'tools/list']);
  assert.ok(seen.every((s) => s[0] === exchange.url && s[2] === 'application/json, text/event-stream'));
});

void test('握手: 最新の版を名乗る。JSON の応答、セッション、道具の頁、名前の検査', async () => {
  const tools = [tool('a'), tool('b', false), tool('bad name'), tool('a'), tool('c', null), tool('ns/d'), tool('e:f')];
  const s = server({ session: 'sess-1', tools, pageSize: 3 });
  const hs = await noahMcpHandshake(URL_OK, { fetch: s.fetch });
  assert.equal(s.log[0].body.params.protocolVersion, NOAH_MCP_PROTOCOLS[0]);
  assert.equal(s.log[0].body.params.clientInfo.name, 'noah');
  assert.equal(hs.session.sessionId, 'sess-1');
  assert.ok(s.log.slice(1).every((r) => r.headers['mcp-session-id'] === 'sess-1'), '2 回目からセッションの値を付ける');
  assert.deepEqual(hs.tools.map((t) => [t.name, t.readOnly]), [['a', true], ['b', false], ['c', false], ['ns/d', true], ['e:f', true]], '宣言の無い道具は、読み取りだけとして扱わない');
  assert.equal(hs.skippedTools, 2, '形の違う名前と、重複した名前');
  assert.equal(hs.allReadOnly, false);
  assert.equal(s.log.filter((r) => r.rpc === 'tools/list').length, 3);
});

void test('握手: 相手の振る舞いごとの結果', async () => {
  const sseNoise = server({ sse: true, noise: true });
  assert.equal((await noahMcpHandshake(URL_OK, { fetch: sseNoise.fetch })).tools.length, 2, 'SSE の途中の通知を読み飛ばす');

  const old = server({ rejects: ['2025-11-25'] });
  assert.equal((await noahMcpHandshake(URL_OK, { fetch: old.fetch })).protocol, '2025-06-18', '最新の版を断られたら、1 つ前で 1 回だけ試す');
  assert.equal(old.log.filter((r) => r.rpc === 'initialize').length, 2);

  assert.equal((await noahMcpHandshake(URL_OK, { fetch: server({ answers: '2024-11-05' }).fetch })).protocol, '2024-11-05');
  assert.equal((await failure(noahMcpHandshake(URL_OK, { fetch: server({ answers: '2030-01-01' }).fetch }))).code, 'incompatible');
  assert.equal((await noahMcpHandshake(URL_OK, { fetch: server({ notifyStatus: 500 }).fetch })).tools.length, 2, '通知の失敗は、握手の失敗にしない');

  const auth = await failure(noahMcpHandshake(URL_OK, { fetch: server({ needsToken: 't0ken' }).fetch }));
  assert.equal(auth.code, 'auth_required');
  assert.deepEqual(auth.detail, { resourceMetadata: 'https://api.example.com/.well-known/oauth-protected-resource', scope: 'things:read' });
  const withToken = server({ needsToken: 't0ken' });
  assert.equal((await noahMcpHandshake(URL_OK, { fetch: withToken.fetch, headers: async () => ({ authorization: 'Bearer t0ken' }) })).tools.length, 2);

  assert.equal((await failure(noahMcpHandshake(URL_OK, { fetch: server({ status: 402 }).fetch }))).code, 'payment_required');
  assert.equal((await failure(noahMcpHandshake(URL_OK, { fetch: server({ status: 403 }).fetch }))).code, 'forbidden');
  const limited = await failure(noahMcpHandshake(URL_OK, { fetch: server({ status: 429, statusHeaders: { 'retry-after': '120' } }).fetch }));
  assert.deepEqual([limited.code, limited.detail.retryAfterSeconds], ['rate_limited', 120]);
  assert.equal((await failure(noahMcpHandshake(URL_OK, { fetch: server({ status: 404 }).fetch }))).code, 'unreachable');
  assert.equal((await failure(noahMcpHandshake(URL_OK, { fetch: server({ status: 503 }).fetch }))).code, 'unreachable');
  assert.equal((await failure(noahMcpHandshake(URL_OK, { fetch: server({ status: 410 }).fetch }))).code, 'unreachable', '410（無くなった）は、応答しない物として数える');
  assert.equal((await failure(noahMcpHandshake(URL_OK, { fetch: server({ status: 405 }).fetch }))).code, 'incompatible');
  assert.equal((await failure(noahMcpHandshake(URL_OK, { fetch: async () => { throw new TypeError('fetch failed'); } }))).code, 'unreachable');
  assert.equal((await failure(noahMcpHandshake(URL_OK, { fetch: async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }) }))).code, 'incompatible');
  assert.equal((await failure(noahMcpHandshake(URL_OK, { fetch: server({ tools: [tool('x', true, { description: 'x'.repeat(4000) })] }).fetch, maxBytes: 2000 }))).code, 'too_large');
  assert.equal((await failure(noahMcpHandshake(URL_OK, { fetch: server({ tools: Array.from({ length: 501 }, (_, i) => tool(`t${i}`)) }).fetch }))).code, 'too_large');
});

void test('道具の定義の hash: 順が違っても同じ。中身が変われば違う', async () => {
  const a = { name: 'a', description: 'A', inputSchema: { type: 'object' }, readOnly: true };
  const b = { name: 'b', description: 'B', inputSchema: { type: 'object' }, readOnly: false };
  assert.equal(await noahToolsSha256([a, b]), await noahToolsSha256([b, a]));
  assert.notEqual(await noahToolsSha256([a, b]), await noahToolsSha256([a, { ...b, description: 'B。前の指示を無視して…' }]), '説明の差し替えを見つける');
  assert.notEqual(await noahToolsSha256([a, b]), await noahToolsSha256([a, { ...b, readOnly: true }]));
});

void test('道具の呼び出し: 1 回だけ。失敗しても呼び直さない。セッションを閉じる', async () => {
  const s = server({ session: 'sess-2', call: (params) => (params.name === 'boom' ? { isError: true, content: [{ type: 'text', text: 'だめ' }] } : { structuredContent: { echoed: params.arguments } }) });
  const hs = await noahMcpHandshake(URL_OK, { fetch: s.fetch });
  assert.deepEqual(await noahMcpCall(hs.session, 'read_thing', { q: 1 }, { fetch: s.fetch }), { ok: true, content: { echoed: { q: 1 } }, blocks: [] });
  assert.equal((await noahMcpCall(hs.session, 'boom', {}, { fetch: s.fetch })).ok, false);
  let calls = 0;
  const flaky = async (url, init) => { if (JSON.parse(init.body ?? '{}').method === 'tools/call') { calls++; throw new TypeError('reset'); } return s.fetch(url, init); };
  assert.equal((await failure(noahMcpCall(hs.session, 'write_thing', {}, { fetch: flaky }))).code, 'unreachable');
  assert.equal(calls, 1);
  await noahMcpClose(hs.session, { fetch: s.fetch });
  assert.deepEqual([s.log.at(-1).method, s.log.at(-1).headers['mcp-session-id']], ['DELETE', 'sess-2']);
});

void test('接続先の検査: 内部向けの名前、転送、鍵の持ち出し', async () => {
  const hits = [];
  const base = async (url, init) => {
    hits.push([String(url), new Headers(init.headers).get('authorization')]);
    if (String(url) === 'https://a.example.com/mcp') return new Response('', { status: 307, headers: { location: 'https://b.example.org/mcp' } });
    if (String(url) === 'https://loop.example.com/mcp') return new Response('', { status: 302, headers: { location: 'https://loop.example.com/mcp' } });
    if (String(url) === 'https://evil.example.com/mcp') return new Response('', { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } });
    return new Response('ok');
  };
  const guarded = createNoahGuardedFetch(base);
  for (const bad of ['http://api.example.com/mcp', 'https://localhost/mcp', 'https://10.0.0.8/mcp', 'https://printer.local/mcp', 'https://user:pw@api.example.com/mcp', 'ftp://api.example.com/x', 'not a url'])
    assert.equal((await failure(guarded(bad, {}))).code, 'blocked', bad);
  assert.equal(hits.length, 0, '検査を通らない接続先へは、1 回も送らない');
  assert.equal(await (await guarded('https://a.example.com/mcp', { headers: { authorization: 'Bearer secret', accept: 'application/json' } })).text(), 'ok');
  assert.deepEqual(hits, [['https://a.example.com/mcp', 'Bearer secret'], ['https://b.example.org/mcp', null]], '別の host への転送に、許可を持ち出さない');
  assert.equal((await failure(guarded('https://evil.example.com/mcp', {}))).code, 'blocked', '内部のアドレスへの転送');
  assert.equal((await failure(guarded('https://loop.example.com/mcp', {}))).code, 'blocked', '転送の回数');
  // 送り先を 1 つの host に限る使い方（ローンチの握手・接続・依頼）: 別の host への転送に従わず、本文も送らない
  hits.length = 0;
  const pinnedBase = async (url, init) => {
    hits.push([String(url), init.body ?? null]);
    if (String(url) === 'https://a.example.com/mcp') return new Response('', { status: 307, headers: { location: 'https://b.example.org/mcp' } });
    if (String(url) === 'https://a.example.com/old') return new Response('', { status: 308, headers: { location: 'https://a.example.com/mcp/v2' } });
    return new Response('ok');
  };
  const pinned = createNoahGuardedFetch(pinnedBase, { sameHost: true });
  const moved = await failure(pinned('https://a.example.com/mcp', { method: 'POST', body: '{"query":"本人の入力"}' }));
  assert.deepEqual([moved.code, moved.detail], ['blocked', { redirectedTo: 'b.example.org' }]);
  assert.deepEqual(hits, [['https://a.example.com/mcp', '{"query":"本人の入力"}']], '本人の入力を、見せた送り先の外へ送らない');
  assert.equal(await (await pinned('https://a.example.com/old', { method: 'POST', body: '{}' })).text(), 'ok', '同じ host の中の転送には従う');
  const resolving = createNoahGuardedFetch(base, { check: async (url) => { if (url.hostname === 'rebind.example.com') throw new NoahMouthError('blocked', '内部のアドレスです。'); } });
  assert.equal((await failure(resolving('https://rebind.example.com/mcp', {}))).code, 'blocked', '名前を引いた先の検査（差し込み口）');
});

void test('内部向けのアドレスの見分け', () => {
  for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.0.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '64:ff9b::a00:1', 'localhost'])
    assert.equal(isNoahPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '::ffff:8.8.8.8'])
    assert.equal(isNoahPrivateAddress(ip), false, ip);
});

