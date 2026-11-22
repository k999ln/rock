import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createNoahBrowserSessionApi, createNoahBrowserSessions, NOAH_BROWSER_COOKIE, NOAH_BROWSER_SESSION_SECONDS, noahBrowserRequestAllowed } from '../lib/noah-browser-session.ts';
import { startNoahBrowser } from '../lib/noah-browser-start.ts';
import { createNoahProfileStore } from '../lib/noah-profile-store.ts';
import { createNoahProfileApi } from '../lib/noah-profile-api.ts';
import { PROFILE_CONSENT_VERSION } from '../lib/noah-profile-contract.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
const ORIGIN = 'https://avoado.si';
const keyset = () => ({ active: 'a', keys: { a: randomBytes(32).toString('hex') } });
const request = (path = '/api/noah/session', { cookie, method = 'GET', origin = ORIGIN, ...headers } = {}) => new Request(`${ORIGIN}${path}`, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...headers } });
const cookieOf = response => response.headers.get('set-cookie')?.split(';')[0];

void test('no membership: first same-origin POST issues browser ownership, GET never creates it', async () => {
  const sessions = createNoahBrowserSessions(keyset()), api = createNoahBrowserSessionApi({ sessions, authenticate: sessions.authenticate });
  const before = await api(request()); assert.equal(before.status, 401); assert.equal(before.headers.get('set-cookie'), null);
  const created = await api(request(undefined, { method: 'POST' })); assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), { connected: true, created: true });
  assert.match(created.headers.get('set-cookie'), /Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=15552000$/);
  assert.equal(created.headers.get('cache-control'), 'private, no-store');
  const cookie = cookieOf(created), first = await sessions.authenticate(request(undefined, { cookie }));
  assert.match(first, /^noah-browser:[a-f0-9]{64}$/);
  const seen = await api(request(undefined, { cookie })); assert.deepEqual(await seen.json(), { connected: true, created: false });
  const revisit = await api(request(undefined, { cookie, method: 'POST' }));
  assert.equal(await sessions.authenticate(request(undefined, { cookie: cookieOf(revisit) })), first);
  assert.doesNotMatch(JSON.stringify(await revisit.json()), /noah-browser|v1\./);
});

void test('separate browsers have separate owners; forged, duplicate and other-origin cookies fail closed', async () => {
  const sessions = createNoahBrowserSessions(keyset()), api = createNoahBrowserSessionApi({ sessions, authenticate: sessions.authenticate });
  const a = cookieOf(await api(request(undefined, { method: 'POST' }))), b = cookieOf(await api(request(undefined, { method: 'POST' })));
  assert.notEqual(await sessions.authenticate(request(undefined, { cookie: a })), await sessions.authenticate(request(undefined, { cookie: b })));
  const forged = a.slice(0, -1) + (a.endsWith('a') ? 'b' : 'a');
  for (const cookie of [forged, `${a}; ${b}`, `${NOAH_BROWSER_COOKIE}=bogus`]) {
    await assert.rejects(() => sessions.authenticate(request(undefined, { cookie })), /UNAUTHORIZED/);
    const response = await api(request(undefined, { cookie, method: 'POST' })); assert.ok(response.status >= 400); assert.equal(response.headers.get('set-cookie'), null);
  }
  await assert.rejects(() => sessions.authenticate(new Request('https://other.test/api/noah/profile', { headers: { Cookie: a } })), /UNAUTHORIZED/);
  for (const origin of ['https://attacker.test', 'null', '']) {
    const response = await api(request(undefined, { method: 'POST', origin })); assert.equal(response.status, 403); assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal((await api(request(undefined, { method: 'POST', 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
});

void test('browser capability never grants admin, account, payment, local runner or alternate methods', async () => {
  const sessions = createNoahBrowserSessions(keyset()), cookie = (await sessions.issue(request())).split(';')[0];
  for (const [path, methods] of [
    ['/api/noah/profile', ['GET', 'POST']], ['/api/noah/ask/id', ['GET', 'POST']],
    ['/api/noah/intake', ['GET']], ['/api/noah/boards', ['GET', 'POST']],
    ['/api/noah/connect/id/tools', ['GET']], ['/api/noah/registration', ['GET', 'POST']],
  ]) for (const method of methods) assert.ok(await sessions.authenticate(request(path, { method, cookie })));
  for (const path of ['/api/noah/intake/import', '/api/noah/intake/tick', '/api/noah/review', '/api/noah/publisher', '/api/noah/runner', '/api/noah/profile/other', '/api/noah/registration/worker', '/api/account', '/api/work-jobs', '/api/esim/orders', '/api/billing']) {
    for (const method of ['GET', 'POST', 'DELETE']) {
      assert.equal(noahBrowserRequestAllowed(request(path, { method })), false);
      await assert.rejects(() => sessions.authenticate(request(path, { method, cookie })), /UNAUTHORIZED/);
    }
  }
  await assert.rejects(() => sessions.authenticate(request('/api/noah/profile', { method: 'POST', cookie, origin: 'https://attacker.test' })), /ORIGIN/);
  await assert.rejects(() => sessions.authenticate(request('/api/noah/profile', { cookie, Authorization: 'Bearer broken' })), /UNAUTHORIZED/);
  assert.equal(noahBrowserRequestAllowed(request('/api/noah/intake', { method: 'POST' })), false);
});

void test('existing identities and auth outages never mint replacement owners', async () => {
  const sessions = createNoahBrowserSessions(keyset());
  const existing = createNoahBrowserSessionApi({ sessions, authenticate: async () => 'existing-owner' });
  const response = await existing(request(undefined, { method: 'POST' })); assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
  for (const message of ['AUTH_UNAVAILABLE', 'database private failure']) {
    const api = createNoahBrowserSessionApi({ sessions, authenticate: async () => { throw Error(message); } });
    const failed = await api(request(undefined, { method: 'POST' })); assert.equal(failed.status, 503); assert.equal(failed.headers.get('set-cookie'), null); assert.doesNotMatch(await failed.text(), /database|private failure/);
  }
  const missing = createNoahBrowserSessionApi({ sessions: createNoahBrowserSessions(null), authenticate: async () => { throw Error('UNAUTHORIZED'); } });
  assert.equal((await missing(request(undefined, { method: 'POST' }))).status, 503);
});

void test('expiry and signing-key rotation preserve boundaries and renew the same owner', async () => {
  const keys = keyset(); let now = Date.now();
  const sessions = createNoahBrowserSessions(keys, () => now), initial = (await sessions.issue(request())).split(';')[0];
  const owner = await sessions.authenticate(request(undefined, { cookie: initial }));
  const next = createNoahBrowserSessions({ active: 'b', keys: { ...keys.keys, b: randomBytes(32).toString('hex') } }, () => now);
  assert.equal(await next.authenticate(request(undefined, { cookie: initial })), owner);
  now += 120 * 86400 * 1000;
  const renewed = (await next.issue(request(), owner)).split(';')[0]; assert.match(renewed, /=v1\.b\./);
  now += 61 * 86400 * 1000;
  await assert.rejects(() => sessions.authenticate(request(undefined, { cookie: initial })), /UNAUTHORIZED/);
  assert.equal(await next.authenticate(request(undefined, { cookie: renewed })), owner);
  const removed = createNoahBrowserSessions({ active: 'b', keys: { b: randomBytes(32).toString('hex') } }, () => now);
  await assert.rejects(() => removed.authenticate(request(undefined, { cookie: renewed })), /UNAUTHORIZED/);
  assert.ok(NOAH_BROWSER_SESSION_SECONDS > 0);
});

void test('bootstrap confirms new cookies, rejects disabled storage, and reuses existing sessions', async () => {
  const calls = [], fetcher = async (_url, init) => { calls.push(init.method ?? 'GET'); return Response.json({ connected: true, created: init.method === 'POST' }); };
  await startNoahBrowser(fetcher); assert.deepEqual(calls, ['POST', 'GET']);
  const seen = []; await startNoahBrowser(async (_url, init) => { seen.push(init.method); return Response.json({ connected: true, created: false }); }); assert.deepEqual(seen, ['POST']);
  await assert.rejects(() => startNoahBrowser(async (_url, init) => init.method === 'POST' ? Response.json({ connected: true, created: true }) : Response.json({ connected: false }, { status: 401 })), /COOKIE_UNAVAILABLE/);
  await assert.rejects(() => startNoahBrowser(async () => Response.json({ error: 'down' }, { status: 503 })), /ACCESS_UNAVAILABLE/);
});

void test('cookie ownership reaches encrypted profile APIs and cannot read or alter another browser', async () => {
  const keys = keyset(), sessions = createNoahBrowserSessions(keys), objects = new Map(); let etag = 0;
  const bucket = { async get(key) { const item = objects.get(key); return item ? { ...item, size: item.body.length, text: async () => item.body } : null; }, async put(key, body, opts) { const old = objects.get(key); if (opts.onlyIf?.etagDoesNotMatch === '*' && old || opts.onlyIf?.etagMatches && old?.etag !== opts.onlyIf.etagMatches) return null; const item = { body, etag: String(++etag) }; objects.set(key, item); return item; }, async delete(key) { objects.delete(key); } };
  const api = createNoahProfileApi({ store: createNoahProfileStore(bucket, keys), authenticate: sessions.authenticate });
  const a = (await sessions.issue(request())).split(';')[0], b = (await sessions.issue(request())).split(';')[0];
  const ar = request('/api/noah/profile', { cookie: a }), br = request('/api/noah/profile', { cookie: b });
  const av = await (await api.collection(ar)).json(); const bv = await (await api.collection(br)).json(); assert.notEqual(av.ownerScope, bv.ownerScope); assert.equal(av.browserOwned, true); assert.equal(bv.browserOwned, true);
  const write = cookie => new Request(`${ORIGIN}/api/noah/profile`, { method: 'POST', headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': av.ownerScope }, body: JSON.stringify({ action: 'fields', revision: 0, consentVersion: PROFILE_CONSENT_VERSION, reuse: true, fields: { name: 'Synthetic browser owner' } }) });
  assert.equal((await api.collection(write(a))).status, 200);
  assert.equal((await (await api.collection(ar)).json()).fields.name, 'Synthetic browser owner');
  assert.deepEqual((await (await api.collection(br)).json()).fields, {});
  assert.equal((await api.collection(write(b))).status, 409);
  assert.doesNotMatch(JSON.stringify([...objects.values()]), /Synthetic browser owner/);
  assert.equal(av.ownerScope, await ownerScopeFor(await sessions.authenticate(ar)));
});

void test('anonymous browser can connect, ask, reopen a result, while another browser cannot read it', async t => {
  const { world, familyId, hostOf, uuid, ORIGIN: origin } = await import('./fixtures/noah/connect-world.mjs');
  const { mcpServer, tool } = await import('./fixtures/noah/mcp-server.mjs');
  const { createNoahConnectApi } = await import('../lib/noah-connect.ts');
  const { createNoahConnectPlanApi } = await import('../lib/noah-connect-plan-api.ts');
  const { createNoahAskApi } = await import('../lib/noah-ask.ts');
  const { noahToolSha256 } = await import('../lib/noah-form.ts');
  const definition = tool('lookup', true, { description: 'Find a result', inputSchema: { type: 'object', properties: {}, required: [] } });
  const server = mcpServer({ tools: [definition], call: () => ({ content: [{ type: 'text', text: 'Browser result fixture' }] }) });
  const w = await world(t, { [hostOf(1)]: server }), waiting = [];
  const sessions = createNoahBrowserSessions(keyset()), seed = new Request(`${origin}/api/noah/session`);
  const cookie = (await sessions.issue(seed)).split(';')[0], other = (await sessions.issue(seed)).split(';')[0];
  const owner = await sessions.authenticate(new Request(seed, { headers: { Cookie: cookie } })), scope = await ownerScopeFor(owner);
  const deps = { ...w.as(null).deps, authenticate: sessions.authenticate, waitUntil: job => waiting.push(job) };
  const connect = createNoahConnectApi(deps), plan = createNoahConnectPlanApi(deps), ask = createNoahAskApi(deps);
  const send = async (fn, path, body, credential = cookie) => {
    const r = await fn(new Request(`${origin}${path}`, { method: body ? 'POST' : 'GET', headers: { Cookie: credential, Origin: origin, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': scope }, ...(body ? { body: JSON.stringify(body) } : {}) }));
    return { status: r.status, body: await r.json() };
  };
  const planned = await send(plan, `/api/noah/connect-plan?agent=${encodeURIComponent(familyId(1))}`);
  assert.equal(planned.status, 200); assert.equal(planned.body.cost.taps, 0);
  const connected = await send(connect.collection, '/api/noah/connect', { id: uuid(1), agentId: familyId(1), planSha256: planned.body.planSha256 });
  assert.equal(connected.status, 200); assert.equal(connected.body.state, 'connected');
  const toolSha256 = await noahToolSha256({ name: definition.name, description: definition.description, inputSchema: definition.inputSchema, readOnly: true });
  const accepted = await send(ask.collection, '/api/noah/ask', { id: uuid(2), connectionId: uuid(1), form: { tool: definition.name, toolSha256, input: {} }, screen: 'narrow' });
  assert.equal(accepted.status, 202);
  for (let seen = -1; seen !== waiting.length;) { seen = waiting.length; await Promise.all(waiting); }
  const detail = request => ask.item(request, uuid(2));
  for (let reopen = 0; reopen < 2; reopen++) {
    const result = await send(detail, `/api/noah/ask/${uuid(2)}`); assert.equal(result.status, 200); assert.equal(result.body.state, 'succeeded'); assert.equal(result.body.result.text, 'Browser result fixture');
  }
  assert.equal((await send(detail, `/api/noah/ask/${uuid(2)}`, undefined, other)).status, 404);
  assert.deepEqual((await send(ask.collection, '/api/noah/ask', undefined, other)).body.asks, []);
  assert.equal(w.asked()[0].owner_id, owner);
});

void test('real Workers requestUser accepts only the signed Noah cookie and retains admin denial', { timeout: 30000 }, async t => {
  const { build } = await import('esbuild'), { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const { outputFiles } = await build({ stdin: { contents: `import {requestUser} from './lib/request-auth.ts'; import {noahSessionApi} from './lib/noah-session-server.ts'; export default {async fetch(request){if(new URL(request.url).pathname==='/api/noah/session')return noahSessionApi()(request);try{const owner=await requestUser(request);return Response.json({browser:owner.startsWith('noah-browser:')});}catch{return Response.json({denied:true},{status:401});}}};`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['cloudflare:workers', 'node:*'] });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-04-01', compatibilityFlags: ['nodejs_compat'], script: outputFiles[0].text, bindings: { NOAH_PROFILE_KEYS: JSON.stringify(keyset()) } })); t.after(() => mf.dispose());
  const created = await mf.dispatchFetch(`${ORIGIN}/api/noah/session`, { method: 'POST', headers: { Origin: ORIGIN } });
  assert.equal(created.status, 200); const cookie = cookieOf(created);
  const read = await mf.dispatchFetch(`${ORIGIN}/api/noah/profile`, { headers: { Cookie: cookie } }); assert.equal(read.status, 200); assert.deepEqual(await read.json(), { browser: true });
  for (const path of ['/api/noah/review', '/api/account', '/api/esim/orders']) assert.equal((await mf.dispatchFetch(`${ORIGIN}${path}`, { headers: { Cookie: cookie } })).status, 401);
  assert.equal((await mf.dispatchFetch(`${ORIGIN}/api/noah/profile`, { headers: { Cookie: `${NOAH_BROWSER_COOKIE}=tampered` } })).status, 401);
});

void test('access gate waits for persisted ownership and retries outages without a login form', async () => {
  const { screen } = await import('./fixtures/noah/screen.mjs');
  let failed = true;
  const s = screen({ fetch: async () => failed ? { status: 503, body: { error: 'unavailable' } } : { body: { connected: true, created: false } }, modules: { '@/lib/noah-browser-start': { startNoahBrowser } } });
  const page = s.mount('components/noah-browser-access.tsx', { children: 'Private tasks' });
  assert.doesNotMatch(page.text(), /Private tasks/); await page.flush();
  assert.match(page.text(), /保存先を開けませんでした/); assert.equal(page.find('form').length, 0);
  failed = false; await page.click('再試行'); assert.equal(page.text(), 'Private tasks');
  assert.deepEqual(s.calls.map(c => c.method), ['POST', 'POST']);
});

void test('browser private intake allows only its exact customer methods and UUID resources',async()=>{
  const sessions=createNoahBrowserSessions(keyset()),cookie=(await sessions.issue(request())).split(';')[0],id=crypto.randomUUID();
  for(const [path,methods] of [
    ['/api/noah/drafts',['GET']],['/api/noah/import',['POST']],['/api/noah/agents',['GET','POST']],
    ['/api/noah/drafts/storage',['GET','POST']],[`/api/noah/drafts/${id}`,['GET','PUT','DELETE']],
    [`/api/noah/drafts/${id}/restore`,['POST']],[`/api/noah/agents/${id}`,['GET','DELETE']],
    [`/api/noah/agents/${id}/source`,['GET']],[`/api/noah/drafts/${id}/source`,['GET']],
  ])for(const method of methods)assert.ok((await sessions.authenticate(request(path,{method,cookie}))).startsWith('noah-browser:'));
  for(const path of ['/api/noah/agents/publish','/api/noah/drafts/not-a-uuid',`/api/noah/agents/${id}/publish`,'/api/noah/intake/import','/api/noah/publisher','/api/noah/runner','/api/billing']){
    for(const method of ['GET','POST','PUT','DELETE'])await assert.rejects(()=>sessions.authenticate(request(path,{method,cookie})),/UNAUTHORIZED/);
  }
  for(const method of ['PUT','DELETE','PATCH'])await assert.rejects(()=>sessions.authenticate(request('/api/noah/agents',{method,cookie})),/UNAUTHORIZED/);
  await assert.rejects(()=>sessions.authenticate(request(`/api/noah/drafts/${id}`,{method:'PUT',cookie,origin:'https://other.test'})),/ORIGIN/);
});
