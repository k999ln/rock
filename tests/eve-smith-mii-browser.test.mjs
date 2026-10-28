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
import { createLineCounter } from '../toolkits/sky-tool-sdk/examples/line-counter.mjs';
import { parseSkyToolPackage, skyToolPackageKey, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';
import { skyPackageSchemaSha256 } from '../lib/sky-package-runtime.ts';
import { createConnector } from '../toolkits/sky-mcp-connector/server.mjs';
import { randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = path.join(root, 'tests/fixtures/eve-smith-mii-browser');
const chrome = process.env.ROCK_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function compile() {
  const result = await build({ entryPoints: [path.join(fixture, 'entry.tsx')], bundle: true, write: false,
    platform: 'browser', jsx: 'automatic', logLevel: 'silent', plugins: [{ name: 'fixture-adapters', setup(build) {
      build.onResolve({ filter: /^@\/lib\/device$/ }, args => args.importer.endsWith('/lib/mcp-hub.ts') ? { path: path.join(fixture, 'device.ts') } : undefined);
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
      await rm(dir, { recursive: true, force: true });
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
    const env = { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false', ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID: localAuthority ? owner : 'local-preview:another-fixture' };
    const deps = new Map([['cloudflare:workers', { env }],
      ['@/lib/fund-store', { database: () => db, requestUser: async () => owner }]]);
    for (const name of ['request-auth', 'bounded-stream', 'owner-intent', 'operations', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library', 'sky-agent-library-store', 'sky-tool-package', 'sky-package-runtime'])
      deps.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
    const authority = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/authority.ts', import.meta.url), deps);
    deps.set('@/app/api/work-jobs/tool-observations/authority', authority);
    const routes = {
      '/api/sky/agents': loadRouteFixture(new URL('../app/api/sky/agents/route.ts', import.meta.url), deps),
      '/api/work-jobs': loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), deps),
      '/api/work-jobs/tool-observations': loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/route.ts', import.meta.url), deps),
      '/api/work-jobs/tool-observations/claim': loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/claim/route.ts', import.meta.url), deps),
    };
    const app = createLineCounter({ publicMcpUrl: 'https://example.invalid/mcp', skyUrl: 'https://example.invalid', localToolDirectory: path.join(dir, 'discovery'),
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
    const http = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`); requests.push({ path: url.pathname, method: req.method });
        if (url.pathname === '/bundle.js') { res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' }); return res.end(bundle); }
        if (!url.pathname.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(`<div id="root"></div><script>window.__fixtureErrors=[];window.onerror=(...args)=>window.__fixtureErrors.push(args.slice(0,4));window.__fixtureServers=${JSON.stringify([resources.server])};window.__fixtureConnectorUrl=${JSON.stringify(resources.connectorUrl)};window.__fixtureConnectorToken=${JSON.stringify(resources.connectorToken)}</script><script src="/bundle.js"></script>`); }
        if (url.pathname === '/api/sky/tool-registry' || url.pathname === '/api/rockstar/entitlements') {
          res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(url.pathname.endsWith('tool-registry') ? registry : entitlements));
        }
        if (!routes[url.pathname]?.[req.method]) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{}'); }
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks), headers = new Headers(req.headers); headers.set('oai-authenticated-user-id', owner);
        if (url.pathname.endsWith('/tool-observations/claim')) {
          const claim = JSON.parse(body.toString('utf8'));
          claimContracts.push({ inputSchemaSha256: claim.inputSchemaSha256, outputSchemaSha256: claim.outputSchemaSha256, transport: claim.transport });
        }
        const input = new Request(url, { method: req.method, headers, ...(body.length ? { body } : {}) });
        const output = await routes[url.pathname][req.method](input); res.writeHead(output.status, { 'Content-Type': 'application/json' }); res.end(await output.text());
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
    await wait('document.body.innerText.includes("自分の担当を作る")', 'Eve'); await click('自分の担当を作る');
    await input('担当の名前', 'fixture担当'); await input('何を手伝う担当ですか', '文章の行数を確認'); await input('受け取るもの', 'text'); await input('期待する成果', 'lines');
    await click('内容を確認'); await click('確認して保存');
    await wait('document.body.innerText.includes("この担当に必要な入力・成果・Tool")', 'Smith');
    await input('必要な入力項目', 'text'); await input('必要な成果項目', 'lines'); await input('Tool', packageKey); await input('実行先', 'pc');
    await click('必要な能力を保存'); await wait('document.body.innerText.includes("必要な能力を保存しました")', 'saved requirements');
    await click('同じ担当で仕事の確認へ進む');
    await wait('document.body.innerText.includes("仕事の名前")', 'real workbench'); await input('仕事の名前', 'fixture仕事'); await click('仕事を作成');
    await input('互換runtime/toolを選択', '0'); await input('このruntimeへ渡す依頼', 'one\ntwo');
    await click('実行内容を確認'); await click('内容を承認して実行');
    if (localAuthority) {
      await wait('document.body.innerText.includes("Tool画面で受け取った内容を同じ仕事に保存しました")', 'saved Tool observation');
    } else {
      await wait('document.body.innerText.includes("実行権限を確認できないため開始できません")', 'authority unavailable');
      assert.equal(connectorExecuteCalls, 0);
      t.diagnostic('Production dispatch authority is unavailable: the Tool was not called and no result acceptance is claimed.');
    }
    await wait('document.body.innerText.includes("mii連携のソフト試用")', 'mii'); await click('mii連携のソフト試用'); await click('miiから同じ仕事を確認');
    await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`, 'same job');
    if (localAuthority) assert.match(await evaluate(`document.querySelector('[aria-label="miiから見た同じ仕事"]').textContent`), /"lines"\s*:\s*2/);
    const address = await evaluate('location.href'), query = new URL(address).searchParams;
    const saved = sqlite.prepare('SELECT id, payload FROM work_jobs').all(); assert.equal(saved.length, 1);
    const job = JSON.parse(saved[0].payload);
    assert.equal(query.get('workJob'), saved[0].id); assert.equal(job.agentBinding.agentId, query.get('agent'));
    assert.equal(job.agentBinding.agentRevision, Number(query.get('agentRevision')));
    if (localAuthority) {
      assert.equal(job.toolAttempts.length, 1); assert.equal(job.toolObservations.length, 1);
      assert.equal(job.toolObservations[0].verification, 'client_observed_unverified');
      assert.match(job.toolObservations[0].text, /"lines"\s*:\s*2/);
      assert.deepEqual(claimContracts, [{ inputSchemaSha256: await skyPackageSchemaSha256(manifest.io.inputSchema),
        outputSchemaSha256: await skyPackageSchemaSha256(manifest.io.outputSchema), transport: 'local_http' }]);
    }
    await devtools.call('Page.reload');
    await wait('document.body.innerText.includes("mii連携のソフト試用")', 'mii after reload');
    await click('mii連携のソフト試用'); await click('miiから同じ仕事を確認');
    await wait(`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('確認済み')`, 'same job after reload');
    if (localAuthority) assert.match(await evaluate(`document.querySelector('[aria-label="miiから見た同じ仕事"]').textContent`), /"lines"\s*:\s*2/);
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
      await input('必要な入力項目', 'left\nright'); await input('必要な成果項目', 'sum');
      await input('Tool', packages[1].packageKey); await input('実行先', 'pc');
      await click('必要な能力を保存'); await wait('document.body.innerText.includes("必要な能力を保存しました")', 'second requirements saved');
      await click('同じ担当で仕事の確認へ進む');
      await wait('document.body.innerText.includes("仕事の名前")', 'second workbench');
      await input('仕事の名前', '合計fixture仕事'); await click('仕事を作成');
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
    // The registry approval and account identity are synthetic. This does not
    // establish physical mii, real provider billing, or independent Tool safety.
  });
