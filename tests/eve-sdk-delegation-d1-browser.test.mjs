import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRouteFixture } from './route-fixture.mjs';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { createAuthorWorkspace } from './fixtures/eve-smith-mii-browser/declared-tools.mjs';
import { syntheticA2A } from './fixtures/eve-sdk-delegation-d1/synthetic-a2a.mjs';
import { parseSkyToolPackage, skyToolPackageKey, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';
import { createConnector } from '../toolkits/sky-mcp-connector/server.mjs';
import { randomUUID, createHash } from 'node:crypto';

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
  return { open, close: () => socket.close(), onMessage: listener => {
    const handler = event => listener(JSON.parse(event.data)); socket.addEventListener('message', handler);
    return () => socket.removeEventListener('message', handler);
  }, async call(method, params = {}) {
    await open; const id = ++sequence; const promise = new Promise((resolve, reject) => requests.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params })); return promise;
  } };
}

const localAuthority = true;
void test('Eve and Smith SDK job is the same D1 parent accepted by delegation route',
  { timeout: 120000, skip: !existsSync(chrome) && 'ROCK_TEST_CHROME must point to an installed Chrome/Chromium' }, async t => {
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
    const owner = 'local-preview:eve-browser-fixture', scope = await ownerScopeFor(owner);
    const synthetic=syntheticA2A(owner);
    const workerSource=await build({entryPoints:['tests/fixtures/mii-worker-shared/workflow-wrapper.mjs'],bundle:true,write:false,
      format:'esm',platform:'neutral',external:['cloudflare:*','node:*'],logLevel:'silent'});
    const worker = new Miniflare(convertV4MiniflareOptions({ modules:true, host:'127.0.0.1', port:0,
      compatibilityDate:'2026-08-18',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],
      workflows:{A2A_DELEGATION_WORKFLOW:{name:'eve-same-job',className:'A2ADelegationWorkflow'}},
      bindings:{...synthetic.env,ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'false',A2A_TEST_OUTBOUND_REQUIRED:'true'},
      serviceBindings:{A2A_TEST_OUTBOUND:synthetic.remoteFetch},script:workerSource.outputFiles[0].text }));
    t.after(() => worker.dispose());
    const db = await worker.getD1Database('DB');
    for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql') && !n.startsWith('._')).sort()) {
      const contents=readFileSync(new URL(`../drizzle/${file}`, import.meta.url),'utf8');
      for (const statement of contents.split('--> statement-breakpoint')) if(statement.trim()) await db.prepare(statement.trim()).run();
    }
    let authenticatedOwner = owner;
    const env = { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false', ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID: localAuthority ? owner : 'local-preview:another-fixture' };
    const deps = new Map([['cloudflare:workers', { env }],
      ['@/lib/fund-store', { database: () => db, requestUser: async () => authenticatedOwner }]]);
    for (const name of ['sky-agent-requirements', 'request-auth', 'bounded-stream', 'owner-intent', 'operations', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library', 'sky-agent-library-store', 'sky-tool-package', 'sky-package-runtime'])
      deps.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
    for (const name of ['a2a-price-quote', 'a2a-usage-receipt', 'jennifer-execution-store', 'jennifer-amc-execution', 'a2a-agent-directory', 'sky-tool-package-store', 'sky-package-runtime-binding', 'sky-package-runtime-binding-store'])
      deps.set(`@/lib/${name}`, {});
    deps.set('@/lib/a2a-authorization', await import('../lib/a2a-authorization.ts'));
    for (const name of ['a2a-price-quote','a2a-usage-receipt','a2a-agent-directory','a2a-broker-authorization','a2a-broker-trust','a2a-input-crypto','a2a-price-quote-consent-store'])
      deps.set(`@/lib/${name}`,await import(new URL(`../lib/${name}.ts`,import.meta.url)));
    const acquisition=await import('../lib/a2a-price-quote-acquisition.ts');
    deps.set('@/lib/a2a-price-quote-acquisition',{...acquisition,acquireA2APriceQuote:input=>acquisition.acquireA2APriceQuote({...input,fetcher:synthetic.quoteFetch})});
    deps.set('@/lib/remote-ai-guard',{authorizeRemoteAiRequest:async()=>authenticatedOwner,RemoteAiGuardError:class extends Error {}});
    deps.set('@/lib/a2a-parent-controller', await import('../lib/a2a-parent-controller.ts'));
    deps.set('@/lib/rockstar-device-link', { requestRockstarUser: async () => authenticatedOwner });
    deps.set('@/lib/sky-owner-export', await import('../lib/sky-owner-export.ts'));
    deps.set('@/lib/sky-owner-export.server', await import('../lib/sky-owner-export.server.ts'));
    const exportRoute = loadRouteFixture(new URL('../app/api/sky/exports/[id]/route.ts', import.meta.url), deps);
    const authority = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/authority.ts', import.meta.url), deps);
    deps.set('@/app/api/work-jobs/tool-observations/authority', authority);
    const routes = {
      '/api/sky/agents': loadRouteFixture(new URL('../app/api/sky/agents/route.ts', import.meta.url), deps),
      '/api/work-jobs': loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), deps),
      '/api/sky/a2a-delegations': loadRouteFixture(new URL('../app/api/sky/a2a-delegations/route.ts', import.meta.url), deps),
      '/api/sky/a2a-agents': loadRouteFixture(new URL('../app/api/sky/a2a-agents/route.ts', import.meta.url), deps),
      '/api/sky/a2a-price-quotes': loadRouteFixture(new URL('../app/api/sky/a2a-price-quotes/route.ts', import.meta.url), deps),
      '/api/work-jobs/tool-observations': loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/route.ts', import.meta.url), deps),
      '/api/work-jobs/tool-observations/claim': loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/claim/route.ts', import.meta.url), deps),
    };
    const delegationDetail=loadRouteFixture(new URL('../app/api/sky/a2a-delegations/[id]/route.ts',import.meta.url),deps);
    const brokerRoute=loadRouteFixture(new URL('../app/api/sky/a2a-delegations/[id]/broker-authorization/route.ts',import.meta.url),deps);
    const { createLineCounter: createDeclaredFixtureTools, examplePermissions: fixturePermissions } = await createAuthorWorkspace(dir);
    const app = createDeclaredFixtureTools({ publicMcpUrl: 'https://example.invalid/mcp', skyUrl: 'https://example.invalid', localToolDirectory: path.join(dir, 'discovery'),
      developerToken: 'fixture-token-not-a-credential', fetch: async () => { throw new Error('EXTERNAL_NETWORK_FORBIDDEN'); }, logger: { warn() {} } });
    const packages = await Promise.all(app.manifests().map(async raw => {
      const manifest = parseSkyToolPackage(raw), packageKey = skyToolPackageKey(manifest), manifestSha256 = await skyToolPackageSha256(manifest);
      await db.prepare(`INSERT INTO sky_tool_packages (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(packageKey, manifest.id, manifest.version, 'fixture-author', JSON.stringify(manifest), manifestSha256, 'verified', Date.now(), Date.now(), Date.now()).run();
      await db.prepare(`INSERT INTO sky_tool_package_reviews (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(randomUUID(), packageKey, manifestSha256, 'fixture-reviewer', 'verified', '{}', '{}', '', Date.now(), null).run();
      return { packageKey, manifestSha256, manifest, status: 'verified', installable: true };
    }));
    assert.equal(packages.length, 2);
    const { packageKey } = packages[0];
    const registry = { packages };
    const entitlements = { ownerScope: scope, entitlements: [{ status: 'active', serviceProfile: { state: 'ready', activation: 'owner_choice_required', packages: packages.map(p => ({ packageKey: p.packageKey, state: 'ready' })) } }] };
    const requests = [], claimContracts = [], cancelBodies = [];
    const pausedReply = null;
    let pausedRegistry = null, pausedExactGet = null, failExactGetOnce = false,
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
        const exportId = url.pathname.match(/^\/api\/sky\/exports\/([^/]+)$/)?.[1];
        if (exportId && req.method === 'GET') {
          const headers = new Headers(req.headers); headers.set('oai-authenticated-user-id', authenticatedOwner);
          const result = await exportRoute.GET(new Request(url, { headers }), { params: Promise.resolve({ id: exportId }) });
          res.writeHead(result.status, Object.fromEntries(result.headers)); return res.end(await result.text());
        }
        const delegationPath=url.pathname.match(/^\/api\/sky\/a2a-delegations\/([^/]+)(\/broker-authorization)?$/);
        if(delegationPath){
          const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks), headers=new Headers(req.headers);
          const selected=delegationPath[2]?brokerRoute:delegationDetail;
          const output=await selected[req.method](new Request(url,{method:req.method,headers,...(body.length?{body}:{})}),{params:Promise.resolve({id:delegationPath[1]})});
          res.writeHead(output.status,Object.fromEntries(output.headers));return res.end(await output.text());
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
        if(url.pathname === '/api/work-jobs' && req.method === 'PATCH') cancelBodies.push(JSON.parse(body.toString('utf8')));
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
      } catch (e) { t.diagnostic(`fixture relay failed: ${String(e)}`); res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Fixture request failed' })); }
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
    let port; for (let i = 0; i < 300; i++) {
      try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (port > 0) break; } catch { /* Chrome has not published its port yet. */ }
      if (resources.child.exitCode !== null || resources.child.signalCode !== null) break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(port, 'isolated Chrome profile did not start');
    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`, { method: 'PUT' })).json();
    const devtools = cdp(tab.webSocketDebuggerUrl); t.after(() => devtools.close()); await devtools.open;
    await devtools.call('Runtime.enable');
    await devtools.call('Page.enable');
    await devtools.call('Page.setLifecycleEventsEnabled', { enabled: true });
    const navigateAndWait = async (method, params = {}) => {
      const bounded = async promise => {
        let timer;
        try { return await Promise.race([promise, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('browser navigation did not finish')), 15000);
        })]); } finally { clearTimeout(timer); }
      };
      const previous = (await bounded(devtools.call('Page.getFrameTree'))).frameTree.frame;
      let loader, unsubscribe;
      const loadedLoaders = new Set();
      const loaded = new Promise(resolve => {
        const complete = () => { if (loader && loadedLoaders.has(loader)) resolve(loader); };
        unsubscribe = devtools.onMessage(event => {
          if (event.method === 'Page.frameNavigated' && event.params.frame.id === previous.id &&
              event.params.frame.loaderId !== previous.loaderId) { loader = event.params.frame.loaderId; complete(); }
          if (event.method === 'Page.lifecycleEvent' && event.params.frameId === previous.id &&
              event.params.name === 'load' && event.params.loaderId !== previous.loaderId) {
            loadedLoaders.add(event.params.loaderId); complete();
          }
        });
      });
      try {
        const [response, loadedLoader] = await bounded(Promise.all([devtools.call(method, params), loaded]));
        if (response.errorText || (method === 'Page.navigate' &&
            (response.frameId !== previous.id || response.loaderId !== loadedLoader))) {
          throw new Error('browser navigation response did not match loaded frame');
        }
      }
      finally { unsubscribe(); }
    };
    const evaluate = async expression => { const result = await devtools.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
    async function wait(expression, label) { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; const errors = await evaluate('window.__fixtureErrors'); if (errors?.length) throw new Error(`browser error: ${JSON.stringify(errors)} lines ${JSON.stringify(bundleLines.slice(errors[0][2] - 4, errors[0][2] + 1))}`); await new Promise(r => setTimeout(r, 100)); } throw new Error(`browser timeout: ${label}; ${JSON.stringify(await evaluate('({href:location.href, ready:document.readyState, text:document.body?.innerText, errors:window.__fixtureErrors})'))}`); }
    const js = value => JSON.stringify(value);
    const click = async label => { const x = js(label); await wait(`!![...document.querySelectorAll('button,summary')].find(e=>e.textContent.trim().includes(${x})&&!e.disabled)`, label);
      await evaluate(`([...document.querySelectorAll('button,summary')].find(e=>e.textContent.trim().includes(${x})&&!e.disabled)).click()`); };
    const input = async (label, value) => { const a = js(label); await wait(`!![...document.querySelectorAll('label')].find(e=>e.textContent.includes(${a}))?.querySelector('input,textarea,select')`, label);
      const target = await devtools.call('Runtime.evaluate', { expression: 'window' });
      const result = await devtools.call('Runtime.callFunctionOn', { objectId: target.result.objectId,
        functionDeclaration: `function(label,value){const e=[...document.querySelectorAll('label')].find(x=>x.textContent.includes(label)).querySelector('input,textarea,select');const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}`,
        arguments: [{ value: label }, { value }], returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); };
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
    await wait('document.body.innerText.includes("仕事の名前")', 'real workbench');
    // Keep this a real Eve-created role and real Sky settings screen. Seed only
    // synthetic provider/model and attachment through the same owner-bound API.
    const workbenchUrl = await evaluate('location.href');
    const agentId = new URL(workbenchUrl).searchParams.get('agent');
    const readAgent = async () => {
      const response = await fetch(`${base}/api/sky/agents?id=${encodeURIComponent(agentId)}`);
      assert.equal(response.status, 200); return response.json();
    };
    const before = await readAgent(); assert.equal(before.ownerScope, scope);
    const { name, instructions, enabled, requirements } = before.agent;
    const attachment = { schema: 'sky.object-attachment/1', objectName: '合成対象', input: 'sensor', output: 'signal' };
    const seeded = await fetch(`${base}/api/sky/agents`, { method: 'PUT', headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agentId, revision: before.agent.revision,
        settings: { name, instructions, enabled, requirements, attachment, provider: 'openai', model: 'fixture-model-v2' } }) });
    assert.equal(seeded.status, 200); const seededAgent = (await seeded.json()).agent;
    await evaluate(`history.pushState({}, '', '/sky/agents'); dispatchEvent(new Event('fixture-navigation'))`);
    await wait('document.body.innerText.includes("追加したエージェント") && document.body.innerText.includes("fixture担当")', 'Sky role list');
    await click('fixture担当'); await input('名前', 'fixture編集担当'); await input('役割・指示', '名前と指示だけを編集');
    await click('設定を保存'); await wait('document.body.innerText.includes("設定を保存しました")', 'Sky settings saved');
    const after = await readAgent();
    assert.equal(after.ownerScope, scope); assert.equal(after.agent.id, agentId);
    assert.equal(after.agent.revision, seededAgent.revision + 1); assert.equal(after.agent.name, 'fixture編集担当');
    assert.equal(after.agent.instructions, '名前と指示だけを編集');
    assert.equal(after.agent.provider, 'openai'); assert.equal(after.agent.model, 'fixture-model-v2');
    assert.deepEqual(after.agent.requirements, requirements); assert.deepEqual(after.agent.attachment, attachment);
    await navigateAndWait('Page.reload');
    await wait('document.body.innerText.includes("fixture編集担当")', 'Sky list after reload');
    await click('fixture編集担当');
    await wait(`(()=>{const labels=[...document.querySelectorAll('label')];return labels.find(x=>x.textContent.includes('モデルの接続先'))?.querySelector('select')?.value==='openai' && labels.find(x=>x.textContent.includes('モデルID'))?.querySelector('input')?.value==='fixture-model-v2'})()`, 'saved provider and model after reload');
    const reloaded = await readAgent();
    assert.equal(reloaded.ownerScope, scope); assert.equal(reloaded.agent.id, agentId); assert.equal(reloaded.agent.revision, after.agent.revision);
    assert.equal(reloaded.agent.provider, 'openai'); assert.equal(reloaded.agent.model, 'fixture-model-v2');
    assert.deepEqual(reloaded.agent.requirements, requirements); assert.deepEqual(reloaded.agent.attachment, attachment);
    const resume = new URL(workbenchUrl); resume.searchParams.set('agentRevision', String(after.agent.revision));
    await evaluate(`history.pushState({}, '', ${JSON.stringify(resume.pathname + resume.search)}); dispatchEvent(new Event('fixture-navigation'))`);
    await wait('document.body.innerText.includes("仕事の名前")', 'same workbench after settings edit');
    await input('仕事の名前', 'fixture仕事');
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
    // A clock jump invalidates the observed Tool snapshot. Returning the
    // clock alone cannot revive it: re-observe through the real Sky UI before
    // any further creation confirmation.
    const restoreObservation = async (target = resume, requireStale = false) => {
      const requestsBefore = creationRequests.length, previousObservationId = resources.server?.passport?.observationId;
      assert.ok(previousObservationId);
      await evaluate('window.__fixtureClockOffset=0');
      await evaluate(`history.pushState({}, '', '/sky/agents'); dispatchEvent(new Event('fixture-navigation'))`);
      await wait('document.body.innerText.includes("fixture編集担当")', 'same role for explicit observation');
      await click('fixture編集担当');
      await wait(`(()=>{const e=document.querySelector('[aria-label="選択した実Toolの観測"]');return e?.textContent.includes('接続先: Example Line Counter') && e.textContent.includes('Package版: 1.0.0');})()`, 'owner and selected Tool readback loaded');
      if (requireStale) {
        await wait('document.body.innerText.includes("実Toolの観測が未確認または期限切れ")', 'old observation remains invalid after clock recovery');
        assert.equal(await evaluate(`(()=>{const checkbox=[...document.querySelectorAll('label')].find(e=>e.textContent.includes('入力と成果の宣言を'))?.querySelector('input[type="checkbox"]');return !checkbox || checkbox.disabled;})()`), true);
        assert.equal(creationRequests.length, requestsBefore);
      }
      await click('選択した実Toolを再確認');
      await wait('document.body.innerText.includes("宣言条件が一致しました")', 'explicit fresh Tool observation');
      const listed = await (await reqConnector('/servers', 'GET')).json();
      resources.server = listed.servers.find(server => server.id === sdk.localId);
      assert.ok(resources.server?.passport?.observationId);
      assert.notEqual(resources.server.passport.observationId, previousObservationId);
      assert.ok(resources.server.passport.observedAt <= Date.now() && resources.server.passport.observationExpiresAt > Date.now());
      assert.ok(resources.server.passport.observationExpiresAt - resources.server.passport.observedAt <= 30_000);
      assert.equal(creationRequests.length, requestsBefore);
      await evaluate(`window.__fixtureServers=${JSON.stringify([resources.server])}`);
      await evaluate(`history.pushState({}, '', ${JSON.stringify(target.pathname + target.search)}); dispatchEvent(new Event('fixture-navigation'))`);
      if (target.searchParams.has('workJob')) {
        await wait('document.body.innerText.includes("mii連携のソフト試用")', 'same saved job after explicit observation');
      } else {
        await wait('document.body.innerText.includes("仕事の名前")', 'workbench after explicit observation');
        await input('仕事の名前', 'fixture仕事');
      }
    };
    // Expiry during each asynchronous fence must leave zero create POSTs.
    await confirmDraft('行数確認',{text:'one\ntwo'});
    let releaseExpiry;
    const expiryPause={hit:false,promise:new Promise(resolve=>{releaseExpiry=resolve;})};pausedRegistry=expiryPause;
    await click('仕事を作成');
    for(let i=0;i<500&&!expiryPause.hit;i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(expiryPause.hit,true);await evaluate('window.__fixtureClockOffset=31000');
    pausedRegistry=null;releaseExpiry();
    await wait('document.body.innerText.includes("実行先・入力形式・料金申告が変わりました")','expired Tool observation rejects creation recheck');
    assert.equal(creationRequests.length,0); await restoreObservation(resume, true);
    await confirmDraft('行数確認',{text:'one\ntwo'});
    let releaseOwnerExpiry;
    const ownerExpiry={remaining:2,hit:false,promise:new Promise(resolve=>{releaseOwnerExpiry=resolve;})};pausedExactGet=ownerExpiry;
    await click('仕事を作成');
    for(let i=0;i<500&&!ownerExpiry.hit;i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(ownerExpiry.hit,true);await evaluate('window.__fixtureClockOffset=31000');
    pausedExactGet=null;releaseOwnerExpiry();
    await wait('document.body.innerText.includes("作成前確認が失効したか条件が変わりました")','expiry after final owner GET');
    assert.equal(creationRequests.length,0); await restoreObservation();
    // A failed pre-send identity read is not an uncertain-write exemption.
    await confirmDraft('行数確認',{text:'one\ntwo'});failExactGetOnce=true;
    await click('仕事を作成');await wait('document.body.innerText.includes("Synthetic pre-send identity GET failure")','failed pre-send GET');
    assert.equal(creationRequests.length,0);
    assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(e=>e.textContent.includes('同じ作成内容で結果を確認'))`),false);
    await evaluate('window.__fixtureClockOffset=31000');
    assert.equal(await evaluate(`([...document.querySelectorAll('button')].find(e=>e.textContent.includes('仕事を作成'))).disabled`),true);
    await restoreObservation();
    entitlements.ownerScope='changed-after-unsent-get';
    await input('互換runtime/toolを選択', '0');
    await input('このruntimeへ渡す依頼', '行数確認');
    await setArgs({text:'one\ntwo'});
    await click('仕事の作成前に条件を確認');await click('この条件を確認して仕事の作成へ進む');
    await wait('document.body.innerText.includes("本人・担当・利用権・Toolの版が変わりました")','retry after failed GET rechecks entitlement');
    assert.equal(creationRequests.length,0);entitlements.ownerScope=scope;
    await confirmDraft('行数確認',{text:'one\ntwo'});
    assert.equal(connectorExecuteCalls,0,'pre-creation review never executes a Tool');
    await click('仕事を作成');
    await wait('document.body.innerText.includes("Synthetic lost create acknowledgement")','lost create acknowledgement');
    assert.equal(creationRequests.length,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_jobs').first()).n,1);
    authenticatedOwner='local-preview:other-browser-owner';
    await click('同じ作成内容で結果を確認');
    await wait('document.body.innerText.includes("保存を始めたアカウントと異なります")','different owner readback rejected');
    assert.equal(creationRequests.length,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_jobs').first()).n,1);
    authenticatedOwner=owner;await evaluate('window.__fixtureClockOffset=31000');
    await click('同じ作成内容で結果を確認');
    await wait('document.body.innerText.includes("mii連携のソフト試用")','expired same-ID GET-only readback');
    assert.equal(creationRequests.length,1,'uncertain committed POST is recovered by GET, never resent');
    assert.equal(connectorExecuteCalls,0);
    const recoveredJobUrl = new URL(await evaluate('location.href'));
    assert.ok(recoveredJobUrl.searchParams.has('workJob'));
    await restoreObservation(recoveredJobUrl);
    assert.equal(creationRequests.length,1);
    await input('互換runtime/toolを選択', '0');
    await click('mii連携のソフト試用'); await click('miiから同じ仕事を確認');
    await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`, 'mii input readback');
    await input('miiへの合成テキスト', 'one\ntwo\nthree');
    await click('同じ仕事のTool確認へ渡す'); await click('実行内容を確認'); await click('内容を承認して実行');
    await wait('document.body.innerText.includes("Tool画面で受け取った内容を同じ仕事に保存しました")', 'SDK observation saved');
    assert.equal(connectorExecuteCalls, 1);
    const rows=await db.prepare('SELECT user_id,id,payload,revision FROM work_jobs').all(); assert.equal(rows.results.length,1);
    const row=rows.results[0], job=JSON.parse(row.payload), originalHash=createHash('sha256').update(job.toolObservations[0].text,'utf8').digest('hex');
    assert.equal(row.user_id,owner);assert.equal(row.id,job.id);assert.equal(row.revision,job.revision);
    assert.equal(job.status,'active');assert.ok(!job.skyApp?.result);
    assert.equal(job.agentBinding.agentId,new URL(await evaluate('location.href')).searchParams.get('agent'));
    assert.equal(job.agentBinding.agentRevision,Number(new URL(await evaluate('location.href')).searchParams.get('agentRevision')));
    assert.equal(job.toolObservations.length,1);assert.equal(job.toolObservations[0].verification,'client_observed_unverified');
    assert.equal(job.toolObservations[0].packageKey,packageKey);assert.match(job.toolObservations[0].text,/"lines"\s*:\s*3/);
    const draft={id:randomUUID(),parentJobId:job.id,idempotencyKey:`synthetic:${randomUUID()}`,messageId:randomUUID(),
      targetOrigin:'https://agent.example.test',targetAgentName:'Synthetic agent',targetAgentVersion:'1',message:'Synthetic draft only',
      budgetCurrency:'USD',budgetLimitMinor:5,parentBudgetLimitMinor:10,continueWhileDeviceOffline:true,deadlineAt:Date.now()+60000};
    authenticatedOwner='local-preview:other-browser-owner';
    try {const rejected=await fetch(`${base}/api/sky/a2a-delegations`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(draft)});assert.equal(rejected.status,404);}
    finally {authenticatedOwner=owner;}
    const created=await fetch(`${base}/api/sky/a2a-delegations`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(draft)});
    assert.equal(created.status,201,await created.clone().text());const createdBody=await created.json();
    assert.equal(createdBody.delegation.parentJobId,job.id);assert.equal(createdBody.delegation.state,'awaiting_approval');assert.equal(createdBody.approval.required,true);
    assert.equal(createdBody.delegation.remoteTaskId,null);
    const read=await fetch(`${base}/api/sky/a2a-delegations?parentJobId=${job.id}`);assert.equal(read.status,200);const result=await read.json();
    assert.equal(result.ownerScope,scope);assert.equal(result.parentJobId,job.id);assert.equal(result.delegations.length,1);assert.equal(result.delegations[0].id,draft.id);assert.equal(result.budget,null);
    const actual=await db.prepare('SELECT owner_user_id,parent_job_id,state FROM agent_delegations WHERE id=?').bind(draft.id).first();
    assert.deepEqual(actual,{owner_user_id:owner,parent_job_id:job.id,state:'awaiting_approval'});
    const savedAfter=await db.prepare('SELECT user_id,payload,revision FROM work_jobs WHERE id=?').bind(job.id).first();
    assert.equal(savedAfter.user_id,owner);assert.equal(savedAfter.revision,job.revision);assert.deepEqual(JSON.parse(savedAfter.payload),job);
    assert.equal(createHash('sha256').update(JSON.parse(savedAfter.payload).toolObservations[0].text,'utf8').digest('hex'),originalHash);
    assert.equal(connectorExecuteCalls,1);assert.equal((await db.prepare("SELECT COUNT(*) n FROM agent_delegation_events WHERE event_type='remote_send_claimed'").first()).n,0);

    // Synthetic test-only keys and discovered Agent Card, without a fabricated
    // authorization row. The actual routes verify both signatures.
    Object.assign(env,synthetic.env);
    const directory=await import('../lib/a2a-agent-directory.ts');
    const candidate=await directory.a2aAgentDirectory(db).upsert(owner,await synthetic.discover());
    assert.ok(candidate);assert.equal(candidate.agentName,'合成Agent');
    const agentsResponse=await fetch(`${base}/api/sky/a2a-agents`);assert.equal(agentsResponse.status,200,await agentsResponse.clone().text());
    assert.equal((await agentsResponse.json()).agents[0].id,candidate.id);
    const sameJobUrl=new URL(await evaluate('location.href'));sameJobUrl.searchParams.delete('package');
    await navigateAndWait('Page.navigate',{url:sameJobUrl.href});
    await click('fixture仕事');
    await wait('document.body.innerText.includes("合成Agent")','synthetic Agent candidate loaded');
    assert.equal(new URL(await evaluate('location.href')).searchParams.get('workJob'),job.id);
    await click('このAgentを選ぶ');await input('依頼内容','合成の依頼');
    await input('このAgentの最大支出額','0.50');await input('親job全体のAgent共通上限','0.80');
    await evaluate(`[...document.querySelectorAll('label')].find(e=>e.textContent.includes('実行を開始しない価格見積'))?.querySelector('input[type=checkbox]')?.click()`);
    await click('署名付き見積を取得');await wait('document.body.innerText.includes("Provider署名付き価格見積")','signed synthetic quote');
    await evaluate(`[...document.querySelectorAll('label')].find(e=>e.textContent.includes('圏外またはアプリ終了中'))?.querySelector('input[type=checkbox]')?.click()`);
    await click('条件を確認する');await wait('document.body.innerText.includes("委任内容を確認")','delegation review');
    const candidates=await db.prepare('SELECT id FROM agent_delegations WHERE owner_user_id=? AND parent_job_id=? AND id<>?').bind(owner,job.id,draft.id).all();
    assert.equal(candidates.results.length,1);const uiId=candidates.results[0].id;
    const store=deps.get('@/lib/a2a-delegation-store').a2aDelegationStore(db), awaiting=await store.get(owner,uiId);
    assert.equal(awaiting.state,'awaiting_approval');assert.equal(awaiting.parentJobId,job.id);assert.ok(awaiting.priceQuoteDigest);
    assert.equal(await store.getBudgetReservation(owner,uiId),null);
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('この見積・上限・送信内容で承認してdispatch'))?.disabled`),true);
    const proof=synthetic.proof(awaiting);
    await input('RockstarOS Brokerの署名済み証明JSON',JSON.stringify({...proof,signature:(proof.signature[0]==='A'?'B':'A')+proof.signature.slice(1)}));
    await click('Broker証明を検証して登録');await wait('document.body.innerText.includes("署名、鍵の信頼")','forged broker signature refused');
    assert.equal(await store.getBrokerAuthorization(owner,uiId),null);assert.equal(await store.getBudgetReservation(owner,uiId),null);
    await input('RockstarOS Brokerの署名済み証明JSON',JSON.stringify(proof));await click('Broker証明を検証して登録');
    await wait('document.body.innerText.includes("Broker証明を検証済み")','synthetic signed broker proof accepted');
    assert.equal((await store.get(owner,uiId)).state,'awaiting_approval');assert.equal(await store.getBudgetReservation(owner,uiId),null);
    await click('この見積・上限・送信内容で承認してdispatch');
    await wait('document.body.innerText.includes("担当siへのdispatchを承認")','explicit owner approval recorded');
    const approved=await store.get(owner,uiId), reservation=await store.getBudgetReservation(owner,uiId), pool=await store.getBudget(owner,job.id);
    assert.equal(approved.state,'prepared');assert.equal(approved.parentJobId,job.id);assert.equal(approved.remoteTaskId,null);
    assert.equal(reservation.state,'held');assert.equal(reservation.reservedMinor,50);assert.equal(pool.reservedMinor,50);assert.equal(pool.budgetLimitMinor,80);
    const finalJob=await db.prepare('SELECT user_id,payload,revision FROM work_jobs WHERE id=?').bind(job.id).first();
    assert.equal(finalJob.user_id,owner);assert.equal(finalJob.revision,job.revision);assert.deepEqual(JSON.parse(finalJob.payload),job);
    assert.equal(createHash('sha256').update(JSON.parse(finalJob.payload).toolObservations[0].text,'utf8').digest('hex'),originalHash);
    assert.equal((await db.prepare("SELECT COUNT(*) n FROM agent_delegation_events WHERE event_type='remote_send_claimed'").first()).n,0);
    synthetic.bindDelegation(approved);
    const binding=(await worker.getBindings()).A2A_DELEGATION_WORKFLOW;
    async function runWorkflow(operation) {
      const instance=await binding.create({id:`same-job-${randomUUID()}`,params:{ownerUserId:owner,delegationId:uiId,operation}});
      let state;for(let i=0;i<200;i++){state=await instance.status();if(['complete','errored'].includes(state.status))break;await new Promise(resolve=>setTimeout(resolve,50));}
      return state;
    }
    const dispatch=await runWorkflow('dispatch');assert.equal(dispatch.status,'complete',JSON.stringify(dispatch));
    assert.deepEqual(dispatch.output,{outcome:'task_received',state:'working',usageOutcome:'missing'});
    const dispatched=await store.get(owner,uiId);
    assert.equal(dispatched.parentJobId,job.id);assert.equal(dispatched.remoteTaskId,synthetic.remoteState().remoteTask);
    assert.equal(synthetic.remoteState().sends,1);assert.equal((await store.getBudgetReservation(owner,uiId)).state,'held');
    assert.deepEqual(JSON.parse((await db.prepare('SELECT payload FROM work_jobs WHERE id=?').bind(job.id).first()).payload),job);

    // Two real tabs share the same origin and strict IndexedDB journal. The
    // consumer is made to lose the already-committed local PATCH response.
    const otherTab=await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(sameJobUrl.href)}`,{method:'PUT'})).json();
    const other=cdp(otherTab.webSocketDebuggerUrl);t.after(()=>other.close());await other.open;
    const otherEval=async expression=>{const answer=await other.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(answer.exceptionDetails)throw Error(answer.exceptionDetails.text);return answer.result.value;};
    const waitOther=async (expression,label)=>{for(let i=0;i<120;i++){if(await otherEval(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(`other tab timeout: ${label}`);};
    await waitOther('document.body?.innerText.includes("mii連携のソフト試用")','same mii job');
    for(const evalPage of [evaluate,otherEval]) await evalPage(`(()=>{const original=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await original(...args);if(args[1]?.method==='PATCH'&&String(args[0])==='/api/work-jobs'&&response.ok)throw new TypeError('synthetic lost response after commit');return response;};})()`);
    await click('mii連携のソフト試用');await click('miiから同じ仕事を確認');
    await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`,'first mii same job');
    await otherEval(`[...document.querySelectorAll('summary')].find(e=>e.textContent.includes('mii連携のソフト試用')).click()`);
    await otherEval(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('miiから同じ仕事を確認')).click()`);
    await waitOther(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`,'second mii same job');
    for(const evalPage of [evaluate,otherEval])await evalPage(`[...document.querySelectorAll('label')].find(e=>e.textContent.includes('この仕事の計画取消を確認')).querySelector('input').click()`);
    await Promise.all([evaluate,otherEval].map(evalPage=>evalPage(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('計画取消を依頼')).click()`)));
    await wait('document.body.innerText.includes("停止要求の結果は未確認")','first local ACK unknown');
    await waitOther('document.body.innerText.includes("停止要求の結果は未確認")','second local ACK unknown');
    const localCancels=cancelBodies.filter(body=>body.command?.action==='cancel');assert.equal(localCancels.length,1);
    const stopped=JSON.parse((await db.prepare('SELECT payload FROM work_jobs WHERE id=?').bind(job.id).first()).payload);
    assert.equal(stopped.id,job.id);assert.equal(stopped.status,'cancelled');assert.equal(stopped.revision,job.revision+1);
    assert.equal(stopped.events.filter(event=>event.command?.action==='cancel').length,1);
    assert.deepEqual(stopped.agentBinding,job.agentBinding);
    assert.equal(createHash('sha256').update(stopped.toolObservations[0].text,'utf8').digest('hex'),originalHash);
    assert.equal((await store.getBudgetReservation(owner,uiId)).state,'held');
    const journal=await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('rockstaros-mii-cancel-journal-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const q=db.transaction('pending').objectStore('pending').getAll();q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>reject(q.error)}})`);
    assert.equal(journal.length,1);assert.equal(journal[0].ownerScope,scope);assert.equal(journal[0].jobId,job.id);assert.equal(journal[0].commandId,localCancels[0].command.id);
    await click('miiから同じ仕事を確認');await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('計画取消（実行先の停止は未確認）')`,'first mii readback');
    await otherEval(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('miiから同じ仕事を確認')).click()`);
    await waitOther(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('計画取消（実行先の停止は未確認）')`,'second mii readback');
    for(const evalPage of [evaluate,otherEval]) {
      const shown=await evalPage(`([...document.querySelector('[aria-label="miiから見た同じ仕事"]').querySelectorAll('div')].find(e=>e.querySelector('p')?.textContent.includes('保存された観測'))?.querySelector('pre')?.textContent)`);
      assert.equal(typeof shown,'string');assert.equal(createHash('sha256').update(shown,'utf8').digest('hex'),originalHash);
    }
    assert.equal(cancelBodies.filter(body=>body.command?.action==='cancel').length,1);

    // Remote cancellation is a separate, explicit Workbench action. Local
    // plan cancellation does not claim that the remote task has stopped.
    await wait(`[...document.querySelectorAll('article')].some(e=>e.textContent.includes('合成Agent')&&[...e.querySelectorAll('button')].some(b=>b.textContent.includes('停止を要求')&&!b.disabled))`,'remote stop action');
    await evaluate(`window.confirm=()=>true;[...([...document.querySelectorAll('article')].find(e=>e.textContent.includes('合成Agent')&&[...e.querySelectorAll('button')].some(b=>b.textContent.includes('停止を要求')))).querySelectorAll('button')].find(b=>b.textContent.includes('停止を要求')).click()`);
    let remoteRequested;for(let i=0;i<100;i++){remoteRequested=await store.get(owner,uiId);if(remoteRequested.state==='cancel_requested')break;await new Promise(resolve=>setTimeout(resolve,50));}
    assert.equal(remoteRequested.state,'cancel_requested');assert.equal(remoteRequested.parentJobId,job.id);
    const lostRemote=await runWorkflow('reconcile');assert.equal(lostRemote.status,'errored',JSON.stringify(lostRemote));
    assert.equal((await store.get(owner,uiId)).state,'cancel_unconfirmed');assert.equal((await store.getBudgetReservation(owner,uiId)).state,'held');
    assert.equal(synthetic.remoteState().cancels,1);
    assert.equal(createHash('sha256').update(JSON.parse((await db.prepare('SELECT payload FROM work_jobs WHERE id=?').bind(job.id).first()).payload).toolObservations[0].text,'utf8').digest('hex'),originalHash);
    let recovered=await runWorkflow('reconcile');assert.equal(recovered.status,'complete',JSON.stringify(recovered));
    assert.deepEqual(recovered.output,{outcome:'task_reconciled',state:'remote_cancelled',usageOutcome:'rejected'});
    assert.equal((await store.getBudgetReservation(owner,uiId)).state,'held');assert.equal(await store.getUsageReceipt(owner,uiId),null);
    assert.equal(createHash('sha256').update(JSON.parse((await db.prepare('SELECT payload FROM work_jobs WHERE id=?').bind(job.id).first()).payload).toolObservations[0].text,'utf8').digest('hex'),originalHash);
    recovered=await runWorkflow('reconcile');assert.equal(recovered.status,'complete',JSON.stringify(recovered));
    assert.deepEqual(recovered.output,{outcome:'task_reconciled',state:'remote_cancelled',usageOutcome:'settled'});
    const usage=await store.getUsageReceipt(owner,uiId);assert.equal(usage.providerReference,'synthetic-receipt-1');
    assert.equal((await store.getBudget(owner,job.id)).settledMinor,11);assert.equal((await store.getBudget(owner,job.id)).reservedMinor,0);
    const replay=await store.settleUsageReceipt(owner,uiId,JSON.parse(usage.receiptJson));assert.equal(replay.reservation.settledMinor,11);
    recovered=await runWorkflow('reconcile');assert.equal(recovered.status,'complete',JSON.stringify(recovered));assert.deepEqual(recovered.output,{outcome:'not_dispatchable'});
    assert.equal(synthetic.remoteState().sends,1);assert.equal(synthetic.remoteState().cancels,1);assert.equal(synthetic.remoteState().reads,2);
    const events=await db.prepare("SELECT event_type AS type,COUNT(*) AS n FROM agent_delegation_events WHERE owner_user_id=? AND delegation_id=? AND event_type IN ('remote_send_claimed','remote_cancel_claimed') GROUP BY event_type").bind(owner,uiId).all();
    assert.deepEqual(events.results.sort((a,b)=>a.type.localeCompare(b.type)),[{type:'remote_cancel_claimed',n:1},{type:'remote_send_claimed',n:1}]);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM a2a_usage_receipts WHERE owner_user_id=? AND delegation_id=?').bind(owner,uiId).first()).n,1);
    assert.deepEqual(JSON.parse((await db.prepare('SELECT payload FROM work_jobs WHERE id=?').bind(job.id).first()).payload),stopped);
    await otherEval(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('委任予算を読み直す')).click()`);
    await waitOther(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('利用量確定記録 '+new Intl.NumberFormat('ja-JP',{style:'currency',currency:'USD'}).format(0.11))`,'mii settled usage');
    assert.equal(createHash('sha256').update(JSON.parse((await db.prepare('SELECT payload FROM work_jobs WHERE id=?').bind(job.id).first()).payload).toolObservations[0].text,'utf8').digest('hex'),originalHash);
});
