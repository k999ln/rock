import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRouteFixture } from './route-fixture.mjs';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { createDeclaredFixtureTools, fixturePermissions } from './fixtures/eve-smith-mii-browser/declared-tools.mjs';
import { parseSkyToolPackage, skyToolPackageKey, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';
import { skyPackageSchemaSha256 } from '../lib/sky-package-runtime.ts';
import { createConnector } from '../toolkits/sky-mcp-connector/server.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { workToolExecutionReviewDigest } from '../lib/workflow.ts';
import { buildSkyOwnerExport } from '../lib/sky-owner-export.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = path.join(root, 'tests/fixtures/eve-smith-mii-browser');
const chromeCandidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const chrome = process.env.ROCK_TEST_CHROME || chromeCandidates.find(existsSync) || chromeCandidates[0];

async function compile() {
  const result = await build({ entryPoints: [path.join(fixture, 'entry.tsx')], bundle: true, write: false,
    platform: 'browser', jsx: 'automatic', logLevel: 'silent', plugins: [{ name: 'fixture-adapters', setup(build) {
      build.onResolve({ filter: /^@\/lib\/device$/ }, args => args.importer.endsWith('/lib/mcp-hub.ts') ? { path: path.join(fixture, 'device.ts') } : undefined);
      build.onResolve({ filter: /^@\/lib\/mii-preview-descriptors$/ }, () => ({ path: path.join(fixture, 'mii-preview-descriptors.ts') }));
      build.onResolve({ filter: /^@\// }, args => build.resolve('./' + args.path.slice(2), { resolveDir: root, kind: args.kind }));
      build.onResolve({ filter: /^next\/link$/ }, () => ({ path: path.join(fixture, 'next-link.tsx') }));
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: path.join(fixture, 'navigation.ts') }));
      build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const env={}', loader: 'js' }));
      build.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' }));
    } }] });
  return result.outputFiles[0].contents;
}

function cdp(url) {
  const socket = new WebSocket(url), requests = new Map(); let sequence = 0;
  const open = new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => { const item = JSON.parse(event.data); if (item.id && requests.has(item.id)) {
    const { resolve, reject } = requests.get(item.id); requests.delete(item.id);
    if (item.error) reject(new Error(item.error.message)); else resolve(item.result);
  } });
  return { open, close: () => socket.close(), async call(method, params = {}) {
    await open; const id = ++sequence; const promise = new Promise((resolve, reject) => requests.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params })); return promise;
  } };
}

for (const localAuthority of [true, false]) void test(`isolated browser: Eve, Smith, real Connector and ${localAuthority ? 'local preview authority' : 'unavailable authority'}`,
  { timeout: 60000, skip: !existsSync(chrome) && 'ROCK_TEST_CHROME must point to an installed Chrome/Chromium' }, async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rock-browser-fixture-'));
    const resources = { child: null, server: null, connectorUrl: '', connectorToken: '' };
    t.after(async () => {
      if (resources.child && resources.child.exitCode === null && resources.child.signalCode === null) {
        const exited = new Promise(resolve => resources.child.once('exit', resolve)); resources.child.kill('SIGTERM'); await exited;
      }
      // Retry transient ENOTEMPTY during cleanup of the isolated Chromium profile.
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    });
    const bundle = await compile();
    const bundleLines = new TextDecoder().decode(bundle).split('\n');
    const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
    for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql') && !n.startsWith('._')).sort())
      sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
    const db = { prepare(sql) { return { bind(...args) { return {
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
    }; } }; } };
    const owner = 'local-preview:eve-browser-fixture', scope = await ownerScopeFor(owner);
    let authenticatedOwner = owner;
    const env = { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false', ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID: localAuthority ? owner : 'local-preview:another-fixture' };
    const deps = new Map([['cloudflare:workers', { env }],
      ['@/lib/fund-store', { database: () => db, requestUser: async () => authenticatedOwner }]]);
    for (const name of ['sky-agent-requirements', 'request-auth', 'bounded-stream', 'owner-intent', 'operations', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library', 'sky-agent-library-store', 'sky-tool-package', 'sky-package-runtime'])
      deps.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
    for (const name of ['a2a-authorization', 'a2a-price-quote', 'a2a-usage-receipt', 'jennifer-execution-store', 'jennifer-amc-execution', 'a2a-agent-directory', 'sky-tool-package-store', 'sky-package-runtime-binding', 'sky-package-runtime-binding-store'])
      deps.set(`@/lib/${name}`, {});
    deps.set('@/lib/a2a-parent-controller', await import('../lib/a2a-parent-controller.ts'));
    deps.set('@/lib/rockstar-device-link', { requestRockstarUser: async () => owner });
    const authority = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/authority.ts', import.meta.url), deps);
    deps.set('@/app/api/work-jobs/tool-observations/authority', authority);
    const routes = {
      '/api/sky/agents': loadRouteFixture(new URL('../app/api/sky/agents/route.ts', import.meta.url), deps),
      '/api/work-jobs': loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), deps),
      '/api/sky/a2a-delegations': loadRouteFixture(new URL('../app/api/sky/a2a-delegations/route.ts', import.meta.url), deps),
      '/api/work-jobs/tool-observations': loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/route.ts', import.meta.url), deps),
      '/api/work-jobs/tool-observations/claim': loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/claim/route.ts', import.meta.url), deps),
    };
    const app = createDeclaredFixtureTools({ publicMcpUrl: 'https://example.invalid/mcp', skyUrl: 'https://example.invalid', localToolDirectory: path.join(dir, 'discovery'),
      developerToken: 'fixture-token-not-a-credential', fetch: async () => { throw new Error('EXTERNAL_NETWORK_FORBIDDEN'); }, logger: { warn() {} } });
    const packages = await Promise.all(app.manifests().map(async raw => {
      const manifest = parseSkyToolPackage(raw), packageKey = skyToolPackageKey(manifest), manifestSha256 = await skyToolPackageSha256(manifest);
      sqlite.prepare(`INSERT INTO sky_tool_packages (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(packageKey, manifest.id, manifest.version, 'fixture-author', JSON.stringify(manifest), manifestSha256, 'verified', Date.now(), Date.now(), Date.now());
      sqlite.prepare(`INSERT INTO sky_tool_package_reviews (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), packageKey, manifestSha256, 'fixture-reviewer', 'verified', '{}', '{}', '', Date.now(), null);
      return { packageKey, manifestSha256, manifest, status: 'verified', installable: true };
    }));
    assert.equal(packages.length, 2);
    const { manifest, packageKey } = packages[0];
    const registry = { packages };
    const entitlements = { ownerScope: scope, entitlements: [{ status: 'active', serviceProfile: { state: 'ready', activation: 'owner_choice_required', packages: packages.map(p => ({ packageKey: p.packageKey, state: 'ready' })) } }] };
    const requests = [], claimContracts = [];
    let pausedReply = null, pausedRegistry = null, pausedExactGet = null, failExactGetOnce = false,
      dropCreateBeforeCommit = false, loseCreateReply = true;
    const creationRequests = [];
    const http = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`); requests.push({ path: url.pathname, method: req.method });
        if (url.pathname === '/bundle.js') { res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' }); return res.end(bundle); }
        if (!url.pathname.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(`<div id="root"></div><script>window.__fixtureErrors=[];window.__fixtureClockOffset=0;const fixtureNow=Date.now.bind(Date);Date.now=()=>fixtureNow()+window.__fixtureClockOffset;window.onerror=(...args)=>window.__fixtureErrors.push(args.slice(0,4));window.__fixtureServers=${JSON.stringify([resources.server])};window.__fixtureConnectorUrl=${JSON.stringify(resources.connectorUrl)};window.__fixtureConnectorToken=${JSON.stringify(resources.connectorToken)}</script><script src="/bundle.js"></script>`); }
        if (url.pathname === '/api/sky/tool-registry' && pausedRegistry) {
          const pause = pausedRegistry; pause.hit = true; await pause.promise;
        }
        if (url.pathname === '/api/sky/tool-registry' || url.pathname === '/api/rockstar/entitlements') {
          res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(url.pathname.endsWith('tool-registry') ? registry : entitlements));
        }
        if (!routes[url.pathname]?.[req.method]) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{}'); }
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks), headers = new Headers(req.headers); headers.set('oai-authenticated-user-id', authenticatedOwner);
        if (url.pathname.endsWith('/tool-observations/claim')) {
          const claim = JSON.parse(body.toString('utf8'));
          claimContracts.push({ inputSchemaSha256: claim.inputSchemaSha256, outputSchemaSha256: claim.outputSchemaSha256, transport: claim.transport });
        }
        if (url.pathname === '/api/work-jobs' && req.method === 'POST') creationRequests.push(JSON.parse(body.toString('utf8')));
        if (url.pathname === '/api/work-jobs' && req.method === 'GET' && url.searchParams.has('id') && failExactGetOnce) {
          failExactGetOnce=false;res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Synthetic pre-send identity GET failure'}));
        }
        if (url.pathname === '/api/work-jobs' && req.method === 'POST' && dropCreateBeforeCommit) {
          dropCreateBeforeCommit=false;res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Synthetic uncertain POST without commit'}));
        }
        const input = new Request(url, { method: req.method, headers, ...(body.length ? { body } : {}) });
        const output = await routes[url.pathname][req.method](input);
        if(url.pathname === '/api/work-jobs' && req.method === 'GET' && url.searchParams.has('id') && pausedExactGet) {
          const pause=pausedExactGet;
          if(--pause.remaining===0){pause.hit=true;await pause.promise;}
        }
        if (url.pathname === '/api/work-jobs' && req.method === 'POST' && output.status === 201 && loseCreateReply) {
          loseCreateReply = false; res.writeHead(503, { 'Content-Type':'application/json' });
          return res.end(JSON.stringify({error:'Synthetic lost create acknowledgement; reconcile same ID'}));
        }
        const pause = pausedReply;
        if (pause && url.pathname.endsWith(pause.route) && JSON.parse(body.toString('utf8')).action !== 'observe') {
          pause.hit = true; await pause.promise;
        }
        res.writeHead(output.status, { 'Content-Type': 'application/json' }); res.end(await output.text());
      } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e) })); }
    });
    await new Promise((resolve, reject) => { http.once('error', reject); http.listen(0, '127.0.0.1', resolve); });
    t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
    const base = `http://127.0.0.1:${http.address().port}`;
    const sdk = await app.start(); t.after(() => { sdk.server.closeAllConnections(); return sdk.close(); });
    const registryPath = path.join(dir, 'registry.json'); await writeFile(registryPath, JSON.stringify({ schema: 'rockstaros-mcp-registry/1', servers: [] }));
    const connector = await createConnector({ registryPath, port: 0, localToolDirectory: path.join(dir, 'discovery'), allowedOrigins: new Set([base]) });
    t.after(() => new Promise(resolve => { connector.server.close(resolve); connector.server.closeAllConnections(); }));
    let connectorExecuteCalls = 0;
    const originalExecute = connector.hub.execute.bind(connector.hub);
    connector.hub.execute = async (...args) => { connectorExecuteCalls++; return originalExecute(...args); };
    resources.connectorUrl = `http://127.0.0.1:${connector.port}`;
    const connectorHeaders = { Origin: base, Host: `127.0.0.1:${connector.port}`, 'Content-Type': 'application/json' };
    const connected = await fetch(`${resources.connectorUrl}/connect`, { method: 'POST', headers: connectorHeaders, body: '{}' });
    assert.equal(connected.status, 200); resources.connectorToken = (await connected.json()).token;
    const reqConnector = (route, method, value) => fetch(`${resources.connectorUrl}${route}`, { method, headers: { ...connectorHeaders, Authorization: `Bearer ${resources.connectorToken}` },
      ...(value ? { body: JSON.stringify(value) } : {}) });
    await reqConnector('/servers', 'GET');
    assert.equal((await reqConnector(`/servers/${sdk.localId}/connect`, 'POST', {})).status, 200);
    resources.server = (await (await reqConnector('/servers', 'GET')).json()).servers.find(item => item.id === sdk.localId);
    assert.ok(resources.server && resources.server.state === 'connected');
    const profile = path.join(dir, 'chrome');
    resources.child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
    let port; for (let i = 0; i < 100; i++) {
      try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (port > 0) break; } catch { /* Chrome has not published its port yet. */ }
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(port, 'isolated Chrome profile did not start');
    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`, { method: 'PUT' })).json();
    const devtools = cdp(tab.webSocketDebuggerUrl); t.after(() => devtools.close()); await devtools.open;
    await devtools.call('Runtime.enable');
    const evaluate = async expression => { const result = await devtools.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
    async function wait(expression, label) { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; const errors = await evaluate('window.__fixtureErrors'); if (errors?.length) throw new Error(`browser error: ${JSON.stringify(errors)} lines ${JSON.stringify(bundleLines.slice(errors[0][2] - 4, errors[0][2] + 1))}`); await new Promise(r => setTimeout(r, 100)); } throw new Error(`browser timeout: ${label}; ${JSON.stringify(await evaluate('({href:location.href, ready:document.readyState, text:document.body?.innerText, errors:window.__fixtureErrors})'))}`); }
    const js = value => JSON.stringify(value);
    const click = async label => { const x = js(label); await wait(`!![...document.querySelectorAll('button,summary')].find(e=>e.textContent.trim().includes(${x})&&!e.disabled)`, label);
      await evaluate(`([...document.querySelectorAll('button,summary')].find(e=>e.textContent.trim().includes(${x})&&!e.disabled)).click()`); };
    const input = async (label, value) => { const a = js(label), v = js(value); await wait(`!![...document.querySelectorAll('label')].find(e=>e.textContent.includes(${a}))?.querySelector('input,textarea,select')`, label);
      await evaluate(`(()=>{const e=[...document.querySelectorAll('label')].find(x=>x.textContent.includes(${a})).querySelector('input,textarea,select');const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${v});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
    const confirmSchema = async () => {
      await wait(`!![...document.querySelectorAll('button')].find(e=>e.textContent.includes('同じ担当で仕事の確認へ進む'))`, 'fresh Smith review');
      await evaluate(`document.querySelector('section[aria-label="担当の必要な能力"] input[type="checkbox"]').click()`);
    };
    const setArgs = async args => {
      await wait(`!!document.querySelector('[aria-label="MCP toolのJSON引数"]')`, 'creation arguments');
      await evaluate(`(()=>{const e=document.querySelector('[aria-label="MCP toolのJSON引数"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(JSON.stringify(args))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    };
    const confirmDraft = async (task, args) => {
      await input('互換runtime/toolを選択','0'); await input('このruntimeへ渡す依頼',task);
      await setArgs(args);
      await click('仕事の作成前に条件を確認'); await click('この条件を確認して仕事の作成へ進む');
      await wait('document.body.innerText.includes("仕事の作成前確認済み")','creation disclosure saved');
    };
    const createAndWait = async () => {
      const previous = new URL(await evaluate('location.href')).searchParams.get('workJob');
      await click('仕事を作成');
      await wait(`new URL(location.href).searchParams.get('workJob') !== ${JSON.stringify(previous)} &&
        !!document.querySelector('[aria-label="同じ仕事でToolを使う"]') && !document.body.innerText.includes('作成結果が未確認')`,
        'new job persisted before editing execution arguments');
    };
    await wait('document.body?.innerText.includes("自分の担当を作る")', 'Eve');
    // This permission is confined to the disposable test origin/profile. Product
    // code never requests it and must reject input when its journal is unavailable.
    await devtools.call('Browser.grantPermissions', { origin: base, permissions: ['durableStorage'] });
    assert.equal(await evaluate('navigator.storage.persist()'), true);
    assert.equal(await evaluate('navigator.storage.persisted()'), true);
    await click('自分の担当を作る');
    await input('担当の名前', 'fixture担当'); await input('何を手伝う担当ですか', '文章の行数を確認'); await input('受け取るもの', 'text'); await input('期待する成果', 'lines');
    await click('内容を確認'); await click('確認して保存');
    await wait('document.body.innerText.includes("この担当に必要な入力・成果・Tool")', 'Smith');
    await wait(`(()=>{const l=[...document.querySelectorAll('label')].find(e=>e.textContent.includes('使用する接続と操作'));const id=window.__fixtureServers?.[0]?.id;return !!l && !!id && [...l.querySelectorAll('option')].some(o=>o.value===JSON.stringify([id,'count_lines']));})()`, 'Smith connection loaded');
    await input('必要な入力項目', 'text'); await input('必要な成果項目', 'lines'); await input('Tool', packageKey); await input('実行先', 'pc');
    await input('期待する入力型',JSON.stringify({text:'string'}));await input('期待する成果型',JSON.stringify({lines:'integer'}));
    await input('必要な処理能力ID',JSON.stringify(['example.count-lines']));await input('許容permissionとscope',JSON.stringify(fixturePermissions));
    await input('使用する接続と操作',JSON.stringify([sdk.localId,'count_lines']));
    // Exercise explicit user intent in real UI before any capability save/dispatch.
    await input('期待する入力型',JSON.stringify({text:'integer'}));
    await wait('document.body.innerText.includes("型が一致しません")','explicit input type contradiction');
    await input('期待する入力型',JSON.stringify({text:'string'}));
    await input('許容permissionとscope','');
    await wait('document.body.innerText.includes("permission・scopeが未指定")','unspecified permission remains unconfirmed');
    await input('許容permissionとscope','[]');
    await wait('document.body.innerText.includes("許容されていません")','explicit empty permission rejects provider use');
    await input('許容permissionとscope',JSON.stringify(fixturePermissions));
    await input('使用する接続と操作',JSON.stringify([sdk.localId,'add_integers']));
    await wait('document.body.innerText.includes("実Toolに処理能力ID")','different actual Tool is not a candidate');
    await input('使用する接続と操作',JSON.stringify([sdk.localId,'count_lines']));
    await wait('document.body.innerText.includes("宣言条件が一致しました")','explicit selected Tool matches');
    assert.equal(requests.filter(r=>r.path.endsWith('/tool-observations')).length,0);

    await click('必要な能力を保存'); await wait('document.body.innerText.includes("必要な能力を保存しました")', 'saved requirements');
    await confirmSchema();
    await click('同じ担当で仕事の確認へ進む');
    await wait('document.body.innerText.includes("仕事の名前")', 'real workbench'); await input('仕事の名前', 'fixture仕事');
    assert.equal(await evaluate(`([...document.querySelectorAll('button')].find(e=>e.textContent.includes('仕事を作成'))).disabled`),true);
    assert.equal(creationRequests.length,0);
    await confirmDraft('行数確認',{text:'one\ntwo'});
    await input('仕事の名前','changed creation title');
    await wait(`([...document.querySelectorAll('button')].find(e=>e.textContent.includes('仕事を作成'))).disabled`,'committed condition change revokes disclosure');
    await input('仕事の名前','fixture仕事');
    await wait(`([...document.querySelectorAll('button')].find(e=>e.textContent.includes('仕事を作成'))).disabled`,'A-B-A must not revive prior disclosure');
    assert.equal(creationRequests.length,0);
    await confirmDraft('行数確認',{text:'one\ntwo'});
    await setArgs({text:'changed before creation'});
    await wait(`([...document.querySelectorAll('button')].find(e=>e.textContent.includes('仕事を作成'))).disabled`,'edit requires new disclosure');
    // Edit exact JSON while the fresh Package response is in flight. A late
    // success must not restore the revoked creation confirmation.
    await click('仕事の作成前に条件を確認');
    let releaseRegistry;
    const reviewPause = { hit:false, promise:new Promise(resolve=>{releaseRegistry=resolve;}) };
    pausedRegistry=reviewPause;
    await click('この条件を確認して仕事の作成へ進む');
    for(let i=0;i<500&&!reviewPause.hit;i++) await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(reviewPause.hit,true);
    await setArgs({text:'edited while confirmation waits'});
    pausedRegistry=null;releaseRegistry();
    await wait('document.body.innerText.includes("入力または本人が変わりました")','late confirmation denied after edit');
    assert.equal(creationRequests.length,0);
    assert.equal(await evaluate(`([...document.querySelectorAll('button')].find(e=>e.textContent.includes('仕事を作成'))).disabled`),true);
    entitlements.ownerScope='wrong-owner';
    await click('仕事の作成前に条件を確認');await click('この条件を確認して仕事の作成へ進む');
    await wait('document.body.innerText.includes("本人・担当・利用権・Toolの版が変わりました")','wrong owner disclosure denied');
    assert.equal(creationRequests.length,0);entitlements.ownerScope=scope;
    // Expiry during each asynchronous fence must leave zero create POSTs.
    await confirmDraft('行数確認',{text:'one\ntwo'});
    let releaseExpiry;
    const expiryPause={hit:false,promise:new Promise(resolve=>{releaseExpiry=resolve;})};pausedRegistry=expiryPause;
    await click('仕事を作成');
    for(let i=0;i<500&&!expiryPause.hit;i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(expiryPause.hit,true);await evaluate('window.__fixtureClockOffset=31000');
    pausedRegistry=null;releaseExpiry();
    await wait('document.body.innerText.includes("作成前確認が失効したか条件が変わりました")','expiry during runtime/entitlement recheck');
    assert.equal(creationRequests.length,0);await evaluate('window.__fixtureClockOffset=0');
    await confirmDraft('行数確認',{text:'one\ntwo'});
    let releaseOwnerExpiry;
    const ownerExpiry={remaining:2,hit:false,promise:new Promise(resolve=>{releaseOwnerExpiry=resolve;})};pausedExactGet=ownerExpiry;
    await click('仕事を作成');
    for(let i=0;i<500&&!ownerExpiry.hit;i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(ownerExpiry.hit,true);await evaluate('window.__fixtureClockOffset=31000');
    pausedExactGet=null;releaseOwnerExpiry();
    await wait('document.body.innerText.includes("作成前確認が失効したか条件が変わりました")','expiry after final owner GET');
    assert.equal(creationRequests.length,0);await evaluate('window.__fixtureClockOffset=0');
    // A failed pre-send identity read is not an uncertain-write exemption.
    await confirmDraft('行数確認',{text:'one\ntwo'});failExactGetOnce=true;
    await click('仕事を作成');await wait('document.body.innerText.includes("Synthetic pre-send identity GET failure")','failed pre-send GET');
    assert.equal(creationRequests.length,0);
    assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(e=>e.textContent.includes('同じ作成内容で結果を確認'))`),false);
    await evaluate('window.__fixtureClockOffset=31000');
    assert.equal(await evaluate(`([...document.querySelectorAll('button')].find(e=>e.textContent.includes('仕事を作成'))).disabled`),true);
    await evaluate('window.__fixtureClockOffset=0');
    entitlements.ownerScope='changed-after-unsent-get';
    await click('仕事の作成前に条件を確認');await click('この条件を確認して仕事の作成へ進む');
    await wait('document.body.innerText.includes("本人・担当・利用権・Toolの版が変わりました")','retry after failed GET rechecks entitlement');
    assert.equal(creationRequests.length,0);entitlements.ownerScope=scope;
    await confirmDraft('行数確認',{text:'one\ntwo'});
    assert.equal(connectorExecuteCalls,0,'pre-creation review never executes a Tool');
    await click('仕事を作成');
    await wait('document.body.innerText.includes("Synthetic lost create acknowledgement")','lost create acknowledgement');
    assert.equal(creationRequests.length,1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,1);
    authenticatedOwner='local-preview:other-browser-owner';
    await click('同じ作成内容で結果を確認');
    await wait('document.body.innerText.includes("保存を始めたアカウントと異なります")','different owner readback rejected');
    assert.equal(creationRequests.length,1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,1);
    authenticatedOwner=owner;await evaluate('window.__fixtureClockOffset=31000');
    await click('同じ作成内容で結果を確認');
    await wait('document.body.innerText.includes("mii連携のソフト試用")','expired same-ID GET-only readback');
    assert.equal(creationRequests.length,1,'uncertain committed POST is recovered by GET, never resent');
    assert.equal(connectorExecuteCalls,0);await evaluate('window.__fixtureClockOffset=0');
    await click('mii連携のソフト試用'); await click('miiから同じ仕事を確認');
    await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`, 'mii input readback');
    const firstJobId = sqlite.prepare('SELECT id FROM work_jobs WHERE user_id = ?').get(owner).id;
    sqlite.prepare('INSERT INTO agent_delegation_budget_pools (owner_user_id,parent_job_id,currency,budget_limit_minor,reserved_minor,settled_minor,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(owner, firstJobId, 'USD', 1000, 200, 300, 1, Date.now(), Date.now());
    await click('委任予算を読み直す');
    await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('取得時点の委任予算')`, 'same-job budget');
    assert.match(await evaluate(`document.querySelector('[aria-label="miiから見た同じ仕事"]').textContent`), /MCP Toolの料金や請求確定額ではありません/);

    await input('miiへの合成テキスト', 'one\ntwo\nthree'); await click('同じ仕事のTool確認へ渡す');
    await click('実行内容を確認'); await click('追跡喪失を模擬');
    assert.equal(await evaluate(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('取得時点の委任予算') ?? false`), false);
    await click('内容を承認して実行');
    await wait('document.body.innerText.includes("同じ仕事と実行先を確認してください")', 'stale mii input rejected');
    assert.equal(connectorExecuteCalls, 0); assert.equal(requests.filter(r => r.path.endsWith('/tool-observations')).length, 0);
    await click('miiから同じ仕事を確認');
    await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`, 'mii reconnect readback');
    await click('同じ仕事のTool確認へ渡す'); await click('実行内容を確認'); await click('内容を承認して実行');
    if (localAuthority) {
      await wait('document.body.innerText.includes("Tool画面で受け取った内容を同じ仕事に保存しました")', 'saved Tool observation');
    } else {
      await wait('document.body.innerText.includes("実行権限を確認できないため開始できません")', 'authority unavailable');
      assert.equal(connectorExecuteCalls, 0);
      t.diagnostic('Production dispatch authority is unavailable: the Tool was not called and no result acceptance is claimed.');
    }
    await wait('document.body.innerText.includes("mii連携のソフト試用")', 'mii'); await click('miiから同じ仕事を確認');
    await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`, 'same job');
    if (localAuthority) assert.match(await evaluate(`document.querySelector('[aria-label="miiから見た同じ仕事"]').textContent`), /"lines"\s*:\s*3/);
    const address = await evaluate('location.href'), query = new URL(address).searchParams;
    const saved = sqlite.prepare('SELECT id, payload FROM work_jobs').all(); assert.equal(saved.length, 1);
    const job = JSON.parse(saved[0].payload);
    let originalObservationHash;
    assert.equal(query.get('workJob'), saved[0].id); assert.equal(job.agentBinding.agentId, query.get('agent'));
    assert.equal(job.agentBinding.agentRevision, Number(query.get('agentRevision')));
    if (localAuthority) {
      assert.equal(job.toolAttempts.length, 1); assert.equal(job.toolObservations.length, 1);
      const attempt = job.toolAttempts[0], review = attempt.executionReview;
      const digest = args => createHash('sha256').update(JSON.stringify(args)).digest('hex');
      assert.equal(job.agentBinding.creationReview.inputSha256, digest({text:'one\ntwo'}));
      assert.equal(attempt.inputSha256, digest({text:'one\ntwo\nthree'}));
      assert.notEqual(job.agentBinding.creationReview.inputSha256, attempt.inputSha256);
      assert.equal(review.approvalContext.inputSha256, attempt.inputSha256);
      assert.equal(review.ownerScope, await ownerScopeFor(owner)); assert.equal(review.jobId, job.id);
      assert.equal(review.agentId, job.agentBinding.agentId); assert.equal(review.packageKey, packageKey);
      assert.equal(attempt.executionReviewDigest, await workToolExecutionReviewDigest(review));
      assert.equal(attempt.creationRelation.state, 'changed'); assert.deepEqual(attempt.creationRelation.changedFields, ['input']);
      const exported = await buildSkyOwnerExport({ job, budget:null, reservations:[],cloud:[],agents:[] });
      assert.ok(exported.manifest.files.some(file => file.name === 'tool-execution-reviews.json'));
      assert.ok(exported.html.includes(attempt.executionReviewDigest));
      assert.ok(!exported.html.includes(attempt.capabilityHash));
      originalObservationHash = createHash('sha256').update(job.toolObservations[0].text, 'utf8').digest('hex');
      const marker = '<pre data-export-file="tool-observations.json">', start = exported.html.indexOf(marker);
      assert.ok(start >= 0);
      const escaped = exported.html.slice(start + marker.length).split('</pre>')[0];
      const raw = escaped.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
      const entry = exported.manifest.files.find(file => file.name === 'tool-observations.json');
      assert.equal(createHash('sha256').update(JSON.parse(raw)[0].text, 'utf8').digest('hex'), originalObservationHash);
      assert.equal(createHash('sha256').update(raw, 'utf8').digest('hex'), entry.sha256);

      assert.equal(job.toolObservations[0].verification, 'client_observed_unverified');
      assert.match(job.toolObservations[0].text, /"lines"\s*:\s*3/);
      assert.deepEqual(claimContracts, [{ inputSchemaSha256: await skyPackageSchemaSha256(manifest.io.inputSchema),
        outputSchemaSha256: await skyPackageSchemaSha256(manifest.io.outputSchema), transport: 'local_http' }]);
      await evaluate('window.__fixtureClockOffset=31000');
      await wait(`!document.querySelector('[aria-label="miiから見た同じ仕事"]') && document.body.innerText.includes('観測期限が切れたか時計が変わりました')`, 'expired mii output hidden');
      await evaluate('window.__fixtureClockOffset=0');
      assert.equal(await evaluate(`!!document.querySelector('[aria-label="miiから見た同じ仕事"]')`), false);
      assert.equal(JSON.parse(sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(job.id).payload).toolObservations[0].text, job.toolObservations[0].text);
      await click('miiから同じ仕事を確認');
      await wait(`/"lines"\\s*:\\s*3/.test(document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent ?? '')`, 'explicit reread restores saved result');
      // Real component + real adapter receive a shorter host descriptor. The
      // saved job remains intact when its output lease expires.
      await evaluate('window.__fixtureMiiTtl=1000');
      const readsBeforeShort = requests.filter(r => r.path === '/api/work-jobs' && r.method === 'GET').length;
      await click('miiから同じ仕事を確認');
      for (let i=0; i<200 && requests.filter(r => r.path === '/api/work-jobs' && r.method === 'GET').length === readsBeforeShort; i++)
        await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(requests.filter(r => r.path === '/api/work-jobs' && r.method === 'GET').length, readsBeforeShort + 1);
      await wait(`document.body.innerText.includes('同じ担当と仕事を読み直しました') && ![...document.querySelectorAll('button')].find(e=>e.textContent.includes('miiから同じ仕事を確認'))?.disabled`, 'short descriptor fresh read completes');
      await wait(`/"lines"\\s*:\\s*3/.test(document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent ?? '')`, 'short descriptor read');
      await evaluate('window.__fixtureClockOffset=1500;document.dispatchEvent(new Event("visibilitychange"))');
      await wait(`!document.querySelector('[aria-label="miiから見た同じ仕事"]')`, 'short descriptor expiry hides output');
      assert.equal(JSON.parse(sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(job.id).payload).toolObservations[0].text, job.toolObservations[0].text);
      await evaluate('window.__fixtureClockOffset=0;delete window.__fixtureMiiTtl');
      await click('miiから同じ仕事を確認');
      await wait(`/"lines"\\s*:\\s*3/.test(document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent ?? '')`, 'reread after short lease');
    }
    await devtools.call('Page.reload');
    await wait('document.body.innerText.includes("mii連携のソフト試用")', 'mii after reload');
    await click('mii連携のソフト試用'); await click('miiから同じ仕事を確認');
    await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`, 'same job after reload');
    if (localAuthority) assert.match(await evaluate(`document.querySelector('[aria-label="miiから見た同じ仕事"]').textContent`), /"lines"\s*:\s*3/);
    if (localAuthority) {
      const reloaded = JSON.parse(sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(job.id).payload);
      assert.equal(createHash('sha256').update(reloaded.toolObservations[0].text, 'utf8').digest('hex'), originalObservationHash);
      const miiText = await evaluate(`([...document.querySelector('[aria-label="miiから見た同じ仕事"]').querySelectorAll('div')].find(e=>e.querySelector('p')?.textContent.includes('保存された観測'))?.querySelector('pre')?.textContent)`);
      assert.equal(typeof miiText, 'string');
      assert.equal(createHash('sha256').update(miiText, 'utf8').digest('hex'), originalObservationHash);
      await wait(`document.querySelector('[aria-label="保存されたToolの応答"]')?.textContent.includes('lines')`, 'same persisted result in Eve workbench');
      assert.match(await evaluate(`document.querySelector('[aria-label="保存されたToolの応答"]').textContent`), /"lines"\s*:\s*3/);
      await wait(`document.querySelector('[aria-label="作成時と実行時の確認履歴"]')?.textContent.includes('作成時からの変更: 入力')`, 'persisted input-change history after reload');
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 1);
    assert.equal(requests.filter(r => r.path.endsWith('/tool-observations/claim')).length, localAuthority ? 1 : 0);
    assert.equal(requests.filter(r => r.path.endsWith('/tool-observations')).length, localAuthority ? 2 : 1);
    assert.equal(connectorExecuteCalls, localAuthority ? 1 : 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 1);
    if (localAuthority) {
      // The second role has a different purpose, Package, input/output schema
      // and Tool, but uses the same real UI, routes, Connector and mii adapter.
      await devtools.call('Page.navigate', { url: base });
      await wait('document.body.innerText.includes("自分の担当を作る")', 'second Eve role'); await click('自分の担当を作る');
      await input('担当の名前', '合計担当'); await input('何を手伝う担当ですか', '二つの整数を合計');
      await input('受け取るもの', 'left と right'); await input('期待する成果', 'sum');
      await click('内容を確認'); await click('確認して保存');
      await wait('document.body.innerText.includes("この担当に必要な入力・成果・Tool")', 'second Smith review');
      await wait(`(()=>{const l=[...document.querySelectorAll('label')].find(e=>e.textContent.includes('使用する接続と操作'));const id=window.__fixtureServers?.[0]?.id;return !!l && !!id && [...l.querySelectorAll('option')].some(o=>o.value===JSON.stringify([id,'add_integers']));})()`, 'second Smith connection loaded');
      await input('必要な入力項目', 'left\nright'); await input('必要な成果項目', 'sum');
      await input('Tool', packages[1].packageKey); await input('実行先', 'pc');
      await input('期待する入力型',JSON.stringify({left:'integer',right:'integer'}));await input('期待する成果型',JSON.stringify({sum:'integer'}));
      await input('必要な処理能力ID',JSON.stringify(['example.add-integers']));await input('許容permissionとscope',JSON.stringify(fixturePermissions));
      await input('使用する接続と操作',JSON.stringify([sdk.localId,'add_integers']));
      await click('必要な能力を保存'); await wait('document.body.innerText.includes("必要な能力を保存しました")', 'second requirements saved');
      await confirmSchema();
      await click('同じ担当で仕事の確認へ進む');
      await wait('document.body.innerText.includes("仕事の名前")', 'second workbench');
      await input('仕事の名前', '合計fixture仕事'); await confirmDraft('二つの整数を合計',{left:4,right:7}); await createAndWait();
      await input('互換runtime/toolを選択', '0'); await input('このruntimeへ渡す依頼', '二つの整数を合計');
      await wait(`!!document.querySelector('[aria-label="MCP toolのJSON引数"]')`, 'second Tool arguments');
      await evaluate(`(()=>{const e=document.querySelector('[aria-label="MCP toolのJSON引数"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'{"left":4,"right":7}');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await click('実行内容を確認'); await click('内容を承認して実行');
      await wait('document.body.innerText.includes("Tool画面で受け取った内容を同じ仕事に保存しました")', 'second saved Tool observation');
      await click('mii連携のソフト試用'); await click('miiから同じ仕事を確認');
      await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`, 'second same job');
      assert.match(await evaluate(`document.querySelector('[aria-label="miiから見た同じ仕事"]').textContent`), /"sum"\s*:\s*11/);
      const secondQuery = new URL(await evaluate('location.href')).searchParams;
      assert.notEqual(secondQuery.get('agent'), query.get('agent')); assert.notEqual(secondQuery.get('workJob'), query.get('workJob'));
      const jobs = sqlite.prepare('SELECT id, payload FROM work_jobs').all(); assert.equal(jobs.length, 2);
      const second = JSON.parse(jobs.find(row => row.id === secondQuery.get('workJob')).payload);
      assert.equal(second.agentBinding.agentId, secondQuery.get('agent')); assert.equal(second.agentBinding.agentRevision, Number(secondQuery.get('agentRevision')));
      assert.equal(second.toolAttempts[0].toolName, 'add_integers');
      assert.equal(second.toolObservations[0].verification, 'client_observed_unverified'); assert.match(second.toolObservations[0].text, /"sum"\s*:\s*11/);
      assert.deepEqual(claimContracts[1], { inputSchemaSha256: await skyPackageSchemaSha256(packages[1].manifest.io.inputSchema),
        outputSchemaSha256: await skyPackageSchemaSha256(packages[1].manifest.io.outputSchema), transport: 'local_http' });
      assert.equal(requests.filter(r => r.path.endsWith('/tool-observations/claim')).length, 2); assert.equal(connectorExecuteCalls, 2);
      await devtools.call('Page.reload');
      await wait('document.body.innerText.includes("mii連携のソフト試用")', 'second mii after reload');
      await click('mii連携のソフト試用'); await click('miiから同じ仕事を確認');
      await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`, 'second same job after reload');
      assert.match(await evaluate(`document.querySelector('[aria-label="miiから見た同じ仕事"]').textContent`), /"sum"\s*:\s*11/);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 2); assert.equal(connectorExecuteCalls, 2);
    }
    if (localAuthority) {
      // Delay the real API response after commit. A lost observation cannot undo
      // an already claimed operation; it can fence a begin before dispatch.
      for (const mode of ['edit-during-begin', 'lost-during-begin', 'lost-after-claim']) {
        await input('仕事の名前', mode); await confirmDraft('二つの整数を合計',{left:4,right:7}); await createAndWait();
        await input('互換runtime/toolを選択', '0');
        await click('mii連携のソフト試用'); await click('miiから同じ仕事を確認');
        await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`, mode + ' read');
        await input('miiへの合成テキスト', 'synthetic addition'); await click('同じ仕事のTool確認へ渡す');
        await click('実行内容を確認');
        let release;
        const pause = { route: mode === 'lost-after-claim' ? '/tool-observations/claim' : '/tool-observations',
          hit: false, promise: new Promise(resolve => { release = resolve; }) };
        pausedReply = pause;
        const callsBefore = connectorExecuteCalls;
        await click('内容を承認して実行');
        for (let i = 0; i < 500 && !pause.hit; i++) await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(pause.hit, true, mode + ' API paused');
        if (mode === 'edit-during-begin') await input('このruntimeへ渡す依頼', 'replacement');
        else await click('追跡喪失を模擬');
        pausedReply = null; release();
        // Workbench's running state clears only when the original async runner
        // settles, even if an input edit remounted its UI.
        await wait(`!![...document.querySelectorAll('label')].find(e=>e.textContent.includes('仕事の名前'))?.querySelector('input:not(:disabled)')`, mode + ' execution settled');
        await click('miiから同じ仕事を確認');
        await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('${mode === 'lost-after-claim' ? '画面で応答を観測しました' : '試行を記録済み'}')`, mode + ' reconciliation');
        const id = new URL(await evaluate('location.href')).searchParams.get('workJob');
        const current = JSON.parse(sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(id).payload);
        assert.equal(current.toolAttempts.length, 1);
        assert.equal(connectorExecuteCalls, callsBefore + (mode === 'lost-after-claim' ? 1 : 0));
        assert.equal(current.toolAttempts[0].state, mode === 'lost-after-claim' ? 'observed_unverified' : 'pending');
        assert.equal(current.toolObservations?.length ?? 0, mode === 'lost-after-claim' ? 1 : 0);
        const disabled = await evaluate(`([...document.querySelectorAll('button')].find(e=>e.textContent.includes('同じ仕事のTool確認へ渡す'))).disabled`);
        assert.equal(disabled, true, 'unresolved attempt cannot be resubmitted');
      }
    }
    if(localAuthority) {
      const before=creationRequests.length,calls=connectorExecuteCalls;
      await input('仕事の名前','unknown missing row');await confirmDraft('二つの整数を合計',{left:4,right:7});
      dropCreateBeforeCommit=true;await click('仕事を作成');
      await wait('document.body.innerText.includes("Synthetic uncertain POST without commit")','uncommitted uncertain POST');
      const sent=creationRequests.at(-1);assert.equal(creationRequests.length,before+1);
      await click('同じ作成内容で結果を確認');
      await wait('document.body.innerText.includes("同じ作成条件を新しく確認")','missing ID requires new confirmation');
      assert.equal(creationRequests.length,before+1);
      await confirmDraft('二つの整数を合計',{left:8,right:7});
      await click('同じ作成内容で結果を確認');
      await wait('document.body.innerText.includes("作成前確認が失効したか条件が変わりました")','changed intent cannot replace uncertain write');
      assert.equal(creationRequests.length,before+1);
      await confirmDraft('二つの整数を合計',{left:4,right:7});
      await click('同じ作成内容で結果を確認');
      await wait('document.body.innerText.includes("mii連携のソフト試用") && !document.body.innerText.includes("作成結果が未確認")','same-intent new confirmation');
      assert.equal(creationRequests.length,before+2);assert.equal(creationRequests.at(-1).id,sent.id);
      assert.deepEqual(creationRequests.at(-1).creationReview,sent.creationReview);
      assert.deepEqual(creationRequests.at(-1).creationInput,sent.creationInput);
      const row=JSON.parse(sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(sent.id).payload);
      assert.equal(row.agentBinding.creationReview.inputSha256,sent.creationReview.inputSha256);
      assert.equal(row.toolAttempts,undefined);assert.equal(connectorExecuteCalls,calls);
    }
    if (localAuthority) {
      // A third, user-authored purpose requests capabilities not declared by
      // either synthetic Tool. Saving the role must not make or run a job.
      const jobsBefore = sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n;
      const createsBefore = creationRequests.length, callsBefore = connectorExecuteCalls;
      const claimsBefore = requests.filter(r => r.path.endsWith('/tool-observations/claim')).length;
      await devtools.call('Page.navigate', { url: base });
      await wait('document.body?.innerText.includes("自分の担当を作る")', 'unsupported Eve role');
      await click('自分の担当を作る');
      await input('担当の名前', '画像説明担当'); await input('何を手伝う担当ですか', '画像の内容を説明する');
      await input('受け取るもの', 'image'); await input('期待する成果', 'caption');
      await click('内容を確認'); await click('確認して保存');
      await wait('document.body.innerText.includes("この担当に必要な入力・成果・Tool")', 'unsupported Smith review');
      await input('必要な入力項目', 'image'); await input('必要な成果項目', 'caption');
      await input('Tool', packageKey); await input('実行先', 'pc');
      await click('必要な能力を保存'); await wait('document.body.innerText.includes("必要な能力を保存しました")', 'unsupported requirements saved');
      await wait('document.body.innerText.includes("入力「image」は宣言で確認できません") && document.body.innerText.includes("成果「caption」は宣言で確認できません")', 'unsupported abilities reported');
      assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(e=>e.textContent.includes('同じ担当で仕事の確認へ進む'))`), false);
      const rows = sqlite.prepare('SELECT id, settings FROM sky_agent_settings WHERE owner_user_id=?').all(owner);
      const saved = rows.map(row => ({ id: row.id, settings: JSON.parse(row.settings) })).find(row => row.settings.name === '画像説明担当');
      assert.ok(saved); assert.match(saved.settings.instructions, /画像の内容を説明する/);
      assert.deepEqual(saved.settings.requirements.inputFields, ['image']); assert.deepEqual(saved.settings.requirements.outputFields, ['caption']);
      const reread = await fetch(`${base}/api/sky/agents?id=${encodeURIComponent(saved.id)}`);
      const rereadBody = await reread.json(); assert.equal(reread.status, 200); assert.equal(rereadBody.ownerScope, scope);
      assert.equal(rereadBody.agent.id, saved.id); assert.match(rereadBody.agent.instructions, /画像の内容を説明する/);
      assert.deepEqual(rereadBody.agent.requirements.inputFields, ['image']);
      assert.deepEqual(rereadBody.agent.requirements.outputFields, ['caption']);
      assert.equal(rereadBody.agent.requirements.packageKey, packageKey); assert.equal(rereadBody.agent.requirements.executionTarget, 'pc');
      assert.ok(Number.isSafeInteger(rereadBody.agent.revision) && rereadBody.agent.revision > 0);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, jobsBefore);
      assert.equal(creationRequests.length, createsBefore); assert.equal(connectorExecuteCalls, callsBefore);
      assert.equal(requests.filter(r => r.path.endsWith('/tool-observations/claim')).length, claimsBefore);
    }
    // The registry approval and account identity are synthetic. This does not
    // establish physical mii, real provider billing, or independent Tool safety.
  });
