import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadRouteFixture } from './route-fixture.mjs';
import * as auth from '../lib/request-auth.ts';
import * as claims from '../lib/rockstar-entitlement-claim.ts';
import test from 'node:test';
import { createSkyToolPackageDraft } from '../lib/sky-tool-package.ts';
const root = new URL('../', import.meta.url);
async function setup(t, { onFetch, onWorkResponse, actualRunner = false, actualDelivery = false, actualTracking = false, actualAccess = false, trackingFetch, deviceFixture, actualNavigation = false, componentProps = {} } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('drizzle/', root))
    .filter((n) => n.endsWith('.sql') && !n.startsWith('._'))
    .sort())
    sqlite.exec(readFileSync(new URL(`drizzle/${name}`, root), 'utf8'));
  class Statement {
    constructor(sql, args = []) {
      Object.assign(this, { sql, args });
    }
    bind(...args) {
      return new Statement(this.sql, args);
    }
    first() {
      return sqlite.prepare(this.sql).get(...this.args) ?? null;
    }
    all() {
      return { results: sqlite.prepare(this.sql).all(...this.args) };
    }
    run() {
      return {
        meta: {
          changes: Number(sqlite.prepare(this.sql).run(...this.args).changes),
        },
      };
    }
  }
  const db = {
    prepare(sql) {
      return new Statement(sql);
    },
    batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map((s) => s.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const env = { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'true' };
  const deps = new Map([
    ['cloudflare:workers', { env }],
    ['@/lib/fund-store', { database: () => db, requestUser: auth.requestUser }],
  ]);
  for (const name of [
    'bounded-stream',
    'owner-intent',
    'a2a-delegation-store',
    'work-store',
    'workflow', 'work-job-view',
    'pending-owner-intent',
    'rockstar-service-access',
  ])
    deps.set(`@/lib/${name}`, await import(new URL(`lib/${name}.ts`, root)));
  const route = loadRouteFixture(
    new URL('app/api/work-jobs/route.ts', root),
    deps,
  );
  const pair = generateKeyPairSync('ed25519');
  const publicKey = Buffer.from(
    pair.publicKey.export({ format: 'jwk' }).x,
    'base64url',
  );
  async function grant(owner) {
    const code = `rsk_${randomUUID().replaceAll('-', '').padEnd(43, 'a')}`,
      now = Date.now();
    const value = {
      schema: claims.ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA,
      issuerId: 'synthetic-issuer',
      issuerKeyId: 'fixture-key',
      claimId: randomUUID(),
      offerId: 'synthetic-zema',
      purchaseReferenceSha256: await claims.sha256Hex(randomUUID()),
      claimCodeSha256: await claims.sha256Hex(code),
      formFactor: 'service_only',
      scopes: ['zema'],
      issuedAt: now - 1000,
      expiresAt: now + 60000,
      signature: '',
    };
    value.signature = sign(
      null,
      claims.rockstarEntitlementClaimSigningBytes(value),
      pair.privateKey,
    ).toString('base64url');
    const verified = await claims.verifyRockstarEntitlementClaim(
      value,
      code,
      async () => publicKey,
      now,
    );
    assert.ok(verified);
    await claims.rockstarEntitlementStore(db).claim(verified, code, owner, now);
  }
  const rejectNext = new Map();
  let owner = 'alice',
    afterGet = null,
    omitScope = false,
    delayedList = null,
    losePost = false;
  const requests = [],
    pending = new Set();
  async function routeCall(method, value, user = owner, headers = {}) {
    const response = await route[method](
      new Request('https://local.test/api/work-jobs', {
        method,
        headers: {
          ...headers,
          Origin: 'https://local.test',
          'Content-Type': 'application/json',
          ...(user ? { 'oai-authenticated-user-id': user } : {}),
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      }),
    );
    return { response, data: await response.clone().json() };
  }
  async function fetch(url, options = {}, tracking) {
    const method = options.method ?? 'GET';
    if (new URL(url, 'https://local.test').pathname !== '/api/work-jobs') {
      const response = onFetch?.(url, options);
      if (response !== undefined) return response;
      assert.equal(method, 'GET');
      return Response.json({
        agents: [],
        delegations: [],
        executions: [],
        executionAvailable: false,
      });
    }
    const value = options.body ? JSON.parse(options.body) : undefined;
    if (rejectNext.has(method)) {
      const status = rejectNext.get(method); rejectNext.delete(method);
      requests.push({ method, user: owner, value, status, headers: options.headers });
      return Response.json({ error: 'Synthetic persistence unavailable' }, { status });
    }
    const gate = method === 'GET' ? delayedList : null;
    if (gate) { delayedList = null; tracking.held = true; }
    const requestOwner = owner;
    const result = await routeCall(
      method,
      value,
      requestOwner,
      options.headers,
    );
    requests.push({
      method,
      user: requestOwner,
      value,
      status: result.response.status,
      headers: options.headers,
    });
    const override = onWorkResponse?.(method, result);
    if (override !== undefined) return override;
    if (method === 'POST' && losePost && result.response.ok) {
      losePost = false;
      throw new Error('synthetic response lost after commit');
    }
    if (method === 'GET' && result.response.ok) {
      if (omitScope) delete result.data.ownerScope;
      if (afterGet) {
        const next = afterGet;
        afterGet = null;
        next();
      }
      if (gate) {
        gate.prepared.resolve();
        if (gate.prepare) await gate.prepare;
        return new Promise((resolve) => {
          gate.release = () => { tracking.held = false; resolve(Response.json(result.data)); };
          gate.snapshotReady.resolve(result.data);
        });
      }
      return Response.json(result.data);
    }
    return result.response;
  }
  function trackedFetch(url, options) {
    const tracking = { held: false, promise: null };
    const promise = fetch(url, options, tracking).then((response) => {
      // fetch completion alone does not include the component's JSON read.
      const json = response.json.bind(response);
      response.json = (...args) => {
        const reading = { held: false, promise: json(...args) };
        pending.add(reading);
        void reading.promise.then(() => pending.delete(reading), () => pending.delete(reading));
        return reading.promise;
      };
      return response;
    });
    tracking.promise = promise;
    pending.add(tracking);
    void promise.then(
      () => pending.delete(tracking),
      () => pending.delete(tracking),
    );
    return promise;
  }
  const slots = [],
    effects = [];
  let cursor = 0,
    tree;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (value) => {
          slots[index] =
            typeof value === 'function' ? value(slots[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(fn, deps) {
      const index = cursor++,
        old = slots[index];
      if (!old || deps.some((x, i) => x !== old.deps[i]))
        slots[index] = { deps, value: fn() };
      return slots[index].value;
    },
    useCallback(fn, deps) {
      return this.useMemo(() => fn, deps);
    },
    useEffect(fn, deps) {
      const index = cursor++,
        old = slots[index];
      if (!old || deps.some((x, i) => x !== old.deps[i])) {
        old?.cleanup?.();
        slots[index] = { deps };
        effects.push(() => {
          slots[index].cleanup = fn();
        });
      }
    },
  };
  // Named imports call without a receiver.
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps);
  react.useLayoutEffect = (fn, deps) => react.useEffect(fn, deps);
  const jsx = (type, props, key) => ({ type, props, key }),
    inert = () => null;
  const client = loadRouteFixture(
    new URL('lib/operations-client.ts', root),
    new Map([
      ['./device', {}],
      ['./sky-zema-handoff', {}],
    ]),
  );
  const navigationGuards = new Set();
  const modules = {
    '@/components/use-pending-save-navigation': { usePendingSaveNavigation(pending) { const id = react.useRef(Symbol()); react.useEffect(() => { if (pending) navigationGuards.add(id.current); return () => navigationGuards.delete(id.current); }, [pending]); } },
    '@/lib/operations-client': client,
    '@/lib/owner-intent': deps.get('@/lib/owner-intent'),
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/link': 'a',
    'lucide-react': {
      Check: inert,
      Play: inert,
      Plus: inert,
      RefreshCw: inert,
    },
    '@/components/mr-tool-runner': { MrToolRunner: inert },
    '@/components/device-connection': { DeviceConnection: inert },
    '@/components/ui/select': Object.fromEntries(
      [
        'Select',
        'SelectTrigger',
        'SelectValue',
        'SelectContent',
        'SelectItem',
      ].map((x) => [x, x]),
    ),
    '@/components/ui/dialog': Object.fromEntries(
      ['Dialog', 'DialogContent', 'DialogTitle', 'DialogDescription'].map(
        (x) => [x, x],
      ),
    ),
    '@/components/ui/textarea': { Textarea: 'textarea' },
    '@/components/workspace-shell': inert,
    '@/components/mcp-bot-runner': { McpBotRunner: inert },
    '@/lib/remote-ai-text-client': {
      remoteAiTextRequest: async () => ({
        executions: [],
        executionAvailable: false,
      }),
      RemoteAiTextClientError: class extends Error {},
    },
  };
  for (const name of [
    'workflow', 'work-job-view',
    'pending-owner-intent',
    'a2a-delegation-recovery',
    'currency-format',
    'remote-ai-text-request',
    'rockstar-service-package-access',
    'rockstar-package-handoff',
    'a2a-result-handoff',
    'sky-package-runtime',
    'jennifer-execution-reports',
  ])
    modules[`@/lib/${name}`] = await import(new URL(`lib/${name}.ts`, root));
  const compiled = ts.transpileModule(
    readFileSync(new URL('components/workbench.tsx', root), 'utf8'),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const exports = {};
  let href = 'https://local.test/work';
  const storage = new Map(); let storageWrites = 0;
  const windowListeners = new Map(), documentListeners = new Map();
  const addListener = (map, type, listener) => { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(listener); };
  class Element {
    constructor(attributes) { this.attributes = attributes; }
    closest() { return this; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    hasAttribute(name) { return name in this.attributes; }
  }
  const document = { addEventListener(type, listener) { addListener(documentListeners, type, listener); }, removeEventListener(type, listener) { documentListeners.get(type)?.delete(listener); } };
  const window = {
    localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storageWrites++; storage.set(key, value); }, removeItem(key) { storageWrites++; storage.delete(key); } },
    get location() {
      return new URL(href);
    },
    history: {
      state: null,
      replaceState(_state, _title, url) {
        href = String(url);
      },
    },
    addEventListener(type, listener) { addListener(windowListeners, type, listener); },
    removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
    setInterval() {
      return 1;
    },
    clearInterval() {},
    dispatchEvent(event) { windowListeners.get(event.type)?.forEach(listener => listener(event)); },
  };
  const context = {
    window, document, Element, Error, crypto, performance, URL, AbortSignal, AbortController, TextEncoder, fetch: trackedFetch,
    require(name) { assert.ok(name in modules, name); return modules[name]; },
  };
  if (actualNavigation) {
    modules['@/lib/history-navigation-guard'] = await import(new URL('lib/history-navigation-guard.ts', root));
    const navigationExports = {};
    runInNewContext(ts.transpileModule(readFileSync(new URL('components/use-pending-save-navigation.ts', root), 'utf8'),
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
      { ...context, exports: navigationExports });
    Object.assign(modules['@/components/use-pending-save-navigation'], navigationExports);
  }
  const cloudExports = {};
  runInNewContext(ts.transpileModule(
    readFileSync(new URL('components/workbench-cloud-text.tsx', root), 'utf8'),
    { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
  ).outputText, { ...context, exports: cloudExports }, { filename: 'components/workbench-cloud-text.tsx' });
  modules['@/components/workbench-cloud-text'] = cloudExports;
  const ownerMemoryExports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('components/use-owner-memory-state.ts', root), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
    { ...context, exports: ownerMemoryExports }, { filename: 'components/use-owner-memory-state.ts' });
  modules['@/components/use-owner-memory-state'] = ownerMemoryExports;
  runInNewContext(compiled, { ...context, exports }, { filename: 'components/workbench.tsx' });
  let runnerInstance = null, deliveryInstance = null, runnerExports, deliveryExports;
  if (actualRunner) {
    const runnerReact = {
      useState(initial) { const i = runnerInstance.cursor++; if (!(i in runnerInstance.slots)) runnerInstance.slots[i] = typeof initial === 'function' ? initial() : initial;
        const instance = runnerInstance; return [instance.slots[i], (value) => { instance.slots[i] = typeof value === 'function' ? value(instance.slots[i]) : value; }]; },
      useEffect(fn, deps) { const i = runnerInstance.cursor++, old = runnerInstance.slots[i];
        if (!old || deps.some((v, j) => v !== old.deps[j])) { old?.cleanup?.(); const slot = { deps }; runnerInstance.slots[i] = slot; runnerInstance.effects.push(() => { slot.cleanup = fn(); }); } },
      useRef(value) { const i = runnerInstance.cursor++; if (!(i in runnerInstance.slots)) runnerInstance.slots[i] = { current: value }; return runnerInstance.slots[i]; },
      useLayoutEffect(fn, deps) { return runnerReact.useEffect(fn, deps); },
      useCallback(fn) { return fn; },
      useMemo(fn) { return fn(); },
      useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
      lazy(loader) { return actualDelivery && String(loader).includes('delivery-runner') ? deliveryExports.DeliveryRunner : inert; }, Suspense: 'suspense',
    };
    const runnerModules = { ...modules, react: runnerReact,
      '@/components/english-citations-runner': inert,
      '@/components/english-patent-assistant': inert,
      'lucide-react': Object.fromEntries(['Play','FolderOpen','Download','Copy','Check','CircleHelp','RotateCcw'].map((key) => [key, inert])),
      '@/components/execution-access': { ExecutionSignin: inert, useExecutionAccess: () => ({ executionBlocked: false, accessState: 'ready', setNeedsSignin() {} }) },
      '@/lib/operations-client': { ...client, processedBytes: (value) => new TextEncoder().encode(JSON.stringify(value)).length,
        executeTracked: async ({ task }) => ({ result: await task(), warning: '' }) },
      '@/lib/device': deviceFixture ?? { deviceToken: () => '', runDevice() { throw Error('No external device in fixture'); } },
    };
    for (const name of ['mr-tools','sky-result-library','sky-result-download','delivery-runner-state']) runnerModules[`@/lib/${name}`] = await import(new URL(`lib/${name}.ts`, root));
    if (actualTracking) {
      const trackingExports = {};
      runInNewContext(ts.transpileModule(readFileSync(new URL('lib/operations-client.ts', root), 'utf8'),
        { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
        { ...context, exports: trackingExports, Event, CustomEvent, setTimeout,
          window: { ...window, dispatchEvent() {} }, fetch: trackingFetch,
          require(name) { if (name === './device') return { captureDeviceSession: () => ({ id: 'same-device', isCurrent: () => true }), verifyDevice: async () => {} };
            if (name === './sky-zema-handoff') return { announceSkyZemaJob() {} }; throw new Error(name); } });
      runnerModules['@/lib/operations-client'] = trackingExports;
    }
    if (actualAccess) {
      const accessExports={};
      runInNewContext(ts.transpileModule(readFileSync(new URL('components/execution-access.tsx',root),'utf8'),
        {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
        {...context,exports:accessExports,Event,require(name){if(name==='next/navigation')return{usePathname:()=>'/work'};assert.ok(name in runnerModules,name);return runnerModules[name];}});
      runnerModules['@/components/execution-access']=accessExports;
    }
    if (actualDelivery) {
      deliveryExports = {};
      runInNewContext(ts.transpileModule(readFileSync(new URL('components/delivery-runner.tsx', root), 'utf8'),
        { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText,
        { ...context, btoa, Uint8Array, exports: deliveryExports, require(name) { assert.ok(name in runnerModules, name); return runnerModules[name]; } });
    }
    runnerExports = {};
    runInNewContext(ts.transpileModule(readFileSync(new URL('components/mr-tool-runner.tsx', root), 'utf8'),
      { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText,
      { ...context, exports: runnerExports, require(name) { assert.ok(name in runnerModules, name); return runnerModules[name]; } }, { filename: 'components/mr-tool-runner.tsx' });
    Object.assign(modules['@/components/mr-tool-runner'], runnerExports);
  }
  function renderRunner() {
    if (!actualRunner) return;
    const node = nodes(tree).find((item) => item.type === runnerExports.MrToolRunner);
    if (!node || runnerInstance?.key !== node.key) {
      runnerInstance?.slots.forEach((slot) => slot?.cleanup?.()); runnerInstance = null;
      deliveryInstance?.slots.forEach((slot) => slot?.cleanup?.()); deliveryInstance = null;
    }
    if (!node) return;
    runnerInstance ??= { key: node.key, cursor: 0, slots: [], effects: [] };
    runnerInstance.cursor = 0;
    node.rendered = runnerExports.MrToolRunner(node.props);
    // The language dispatcher has no hooks; render the real Japanese core that
    // still owns the state and callbacks exercised by this recovery fixture.
    if (node.rendered?.type?.name === 'MrToolRunnerCore')
      node.rendered = node.rendered.type(node.rendered.props);
    while (runnerInstance.effects.length) runnerInstance.effects.shift()();
    if (actualDelivery) {
      const child = nodes(node.rendered).find((item) => item.type === deliveryExports.DeliveryRunner);
      if (!child) { deliveryInstance?.slots.forEach((slot) => slot?.cleanup?.()); deliveryInstance = null; return; }
      const parentInstance = runnerInstance;
      deliveryInstance ??= { cursor: 0, slots: [], effects: [] };
      runnerInstance = deliveryInstance; runnerInstance.cursor = 0;
      child.rendered = deliveryExports.DeliveryRunner(child.props);
      while (runnerInstance.effects.length) runnerInstance.effects.shift()();
      runnerInstance = parentInstance;
    }
  }
  function render() {
    cursor = 0;
    tree = exports.default(componentProps);
    while (effects.length) effects.shift()();
    renderRunner();
  }
  function nodes(value, out = []) {
    if (Array.isArray(value)) value.forEach((x) => nodes(x, out));
    else if (value && typeof value === 'object') {
      out.push(value);
      nodes(value.rendered ?? value.props?.children, out);
    }
    return out;
  }
  function text(node) {
    return typeof node === 'string'
      ? node
      : Array.isArray(node)
        ? node.map(text).join('')
        : node && typeof node === 'object'
          ? text(node.rendered ?? node.props?.children)
          : '';
  }
  function find(type, label) {
    return nodes(tree).find(
      (n) => n.type === type && (!label || text(n).includes(label)),
    );
  }
  async function flush() {
    // Wait for actual route/crypto work, not a fixed number of event-loop turns.
    // Only the explicitly deferred old-list response remains pending on purpose.
    let quiet = 0;
    while (quiet < 2) {
      const active = [...pending].filter((entry) => !entry.held);
      await Promise.allSettled(active.map((entry) => entry.promise));
      await new Promise((r) => setImmediate(r));
      render();
      quiet = [...pending].some((entry) => !entry.held) ? 0 : quiet + 1;
    }
  }
  async function waitFor(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate()) { assert.ok(Date.now() < deadline, 'bounded component transition'); await flush(); }
  }
  async function click(label) {
    const button = find('button', label);
    assert.ok(button && !button.props.disabled, label);
    button.props.onClick();
    render();
    await flush();
  }
  await grant('alice');
  return {
    checkExecutionAccess() { window.dispatchEvent(new Event('sky-execution-access-check')); },
    rejectNext(method, status = 503) { rejectNext.set(method, status); },
    sqlite,
    db,
    requests,
    render,
    flush,
    click,
    waitFor,
    find,
    get navigationBlocked() { return actualNavigation ? Boolean(windowListeners.get('beforeunload')?.size) : navigationGuards.size > 0; },
    navigateLink(attributes = { href: '/library' }) {
      let prevented = false;
      const event = { button: 0, target: new Element(attributes), preventDefault() { prevented = true; } };
      documentListeners.get('click')?.forEach((listener) => listener(event));
      return { prevented };
    },
    get storageWrites() { return storageWrites; },
    nodes: () => nodes(tree),
    text: () => text(tree),
    owner(value) {
      owner = value;
    },
    grant,
    routeCall,
    loseNextPost() {
      losePost = true;
    },
    beforePost(next) {
      afterGet = () => {
        owner = next;
      };
    },
    omitScope(value) {
      omitScope = value;
    },
    delayList({ prepare } = {}) {
      const snapshotReady = Promise.withResolvers(), prepared = Promise.withResolvers();
      const gate = { snapshotReady, prepared, ready: snapshotReady.promise, prepare };
      delayedList = gate;
      return gate;
    },
    input(value) {
      const input = nodes(tree).find(
        (n) =>
          n.type === 'input' &&
          n.props.placeholder === '例: 自動化についての記事',
      );
      assert.ok(input);
      input.props.onChange({ target: { value } });
      render();
    },
    insertFailure(on) {
      sqlite.exec(
        on
          ? "CREATE TRIGGER fail_before_save BEFORE INSERT ON work_jobs BEGIN SELECT RAISE(ABORT,'synthetic precommit failure'); END"
          : 'DROP TRIGGER fail_before_save',
      );
    },
    count() {
      return sqlite.prepare('SELECT COUNT(*) n FROM work_jobs').get().n;
    },
  };
}

void test('Workbench keeps A creation through precommit failure, 401 and B switch, then resumes A once', async (t) => {
  const h = await setup(t);
  h.render();
  await h.flush();
  h.input('Synthetic original owner draft');
  h.insertFailure(true);
  await h.click('仕事を作成');
  h.insertFailure(false);
  assert.equal(
    h.requests.filter((r) => r.method === 'POST').at(-1).status,
    503,
  );
  assert.equal(h.count(), 0);
  assert.equal(h.navigationBlocked, true);
  const original = h.requests.find((r) => r.method === 'POST');
  h.owner(null);
  await h.click('同じ作成内容で結果を確認');
  assert.equal(h.requests.at(-1).status, 401);
  assert.ok(h.find('button', '仕事を作成').props.disabled);
  assert.equal(h.find('a', 'サインイン').props.target, '_blank');
  h.owner('bob');
  // Existing service gate still denies a legitimate B request without zema.
  assert.equal(
    (await h.routeCall('POST', { ...original.value, id: randomUUID() }, 'bob'))
      .response.status,
    403,
  );
  await h.grant('bob');
  await h.click('同じ作成内容で結果を確認');
  assert.equal(h.requests.filter((r) => r.method === 'POST').length, 1);
  assert.equal(h.count(), 0);
  assert.ok(h.find('button', '同じ作成内容で結果を確認'));
  h.owner('alice');
  await h.click('保存先の接続を確認');
  const retry = h.find('button', '同じ作成内容で結果を確認');
  retry.props.onClick();
  retry.props.onClick();
  h.render();
  await h.flush();
  const posts = h.requests.filter((r) => r.method === 'POST');
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[1].value, original.value);
  assert.equal(
    posts[1].headers['X-Rock-Owner-Scope'],
    original.headers['X-Rock-Owner-Scope'],
  );
  assert.equal(h.count(), 1);
  assert.equal(h.navigationBlocked, false);
  assert.equal(
    h.sqlite.prepare('SELECT user_id FROM work_jobs').get().user_id,
    'alice',
  );
  assert.equal(
    (await h.routeCall('GET', undefined, 'bob')).data.jobs.length,
    0,
  );
  assert.equal(
    (
      await h.routeCall(
        'PATCH',
        {
          jobId: original.value.id,
          revision: 0,
          command: { id: randomUUID(), action: 'cancel' },
        },
        'bob',
      )
    ).response.status,
    404,
  );
  assert.equal(
    (await h.routeCall('POST', original.value, 'bob')).response.status,
    409,
  );
  const tables = h.sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('work_jobs','rockstar_service_entitlements')",
    )
    .all();
  for (const { name } of tables)
    assert.equal(
      h.sqlite.prepare(`SELECT COUNT(*) n FROM "${String(name)}"`).get().n,
      0,
      name,
    );
});

void test('Workbench API rejects the owner switch after preflight before save and owner intent never authenticates', async (t) => {
  const h = await setup(t);
  await h.grant('bob');
  h.render();
  await h.flush();
  h.input('Synthetic request');
  h.beforePost('bob');
  await h.click('仕事を作成');
  const post = h.requests.find((r) => r.method === 'POST');
  assert.equal(post.status, 409);
  assert.equal(h.count(), 0);
  assert.ok(h.find('button', '同じ作成内容で結果を確認'));
  h.owner('alice');
  await h.click('同じ作成内容で結果を確認');
  assert.equal(h.count(), 1);
  assert.deepEqual(
    h.requests.filter((r) => r.method === 'POST')[1].value,
    post.value,
  );
  // The route remains compatible with callers omitting the optional intent.
  const legacy = { id: randomUUID(), title: 'Legacy B', templateId: 'article' };
  assert.equal((await h.routeCall('POST', legacy, 'bob')).response.status, 201);
  assert.equal(
    (
      await h.routeCall(
        'POST',
        { ...legacy, id: randomUUID() },
        null,
        post.headers,
      )
    ).response.status,
    401,
  );
  assert.equal(
    (
      await h.routeCall(
        'POST',
        { ...legacy, id: randomUUID() },
        'bob',
        post.headers,
      )
    ).response.status,
    409,
  );
  assert.equal(
    (
      await h.routeCall('POST', { ...legacy, id: randomUUID() }, 'alice', {
        'X-Rock-Owner-Scope': '',
      })
    ).response.status,
    409,
  );
});

void test('Workbench unknown identity blocks input; only original owner can release and discard a retained creation', async (t) => {
  const h = await setup(t);
  h.omitScope(true);
  h.render();
  await h.flush();
  h.input('Unknown owner ignored');
  assert.ok(h.find('button', '仕事を作成').props.disabled);
  h.omitScope(false);
  await h.click('再読込');
  assert.equal(h.nodes().find(n => n.type === 'input' && n.props.placeholder === '例: 自動化についての記事').props.value, '');
  h.input('Synthetic retained input');
  h.insertFailure(true);
  await h.click('仕事を作成');
  h.insertFailure(false);
  const original = h.requests.find((r) => r.method === 'POST');
  h.omitScope(true);
  await h.click('同じ作成内容で結果を確認');
  assert.equal(h.requests.filter((r) => r.method === 'POST').length, 1);
  h.omitScope(false);
  h.owner('bob');
  await h.grant('bob');
  await h.click('保存先の接続を確認');
  assert.ok(h.find('button', '同じ作成内容で結果を確認').props.disabled);
  const releaseAsBob = h.find('button', '保留を解除（入力は保持）');
  assert.equal(releaseAsBob.props.disabled, true);
  releaseAsBob.props.onClick(); h.render();
  assert.ok(h.find('button', '同じ作成内容で結果を確認'));
  assert.equal(h.navigationBlocked, true);
  assert.equal(h.nodes().find(n => n.type === 'input' && n.props.placeholder === '例: 自動化についての記事').props.value, '');
  h.owner('alice');
  await h.click('保存先の接続を確認');
  assert.equal(h.nodes().find(n => n.type === 'input' && n.props.placeholder === '例: 自動化についての記事').props.value, original.value.title);
  await h.click('保留を解除（入力は保持）');
  assert.equal(h.navigationBlocked, true);
  await h.click('未保存の入力を破棄');
  assert.equal(h.navigationBlocked, false);
  h.owner('bob'); await h.click('再読込'); h.input('Bob own new input');
  await h.click('仕事を作成');
  const next = h.requests.filter((r) => r.method === 'POST').at(-1);
  assert.equal(next.status, 201);
  assert.notEqual(next.value.id, original.value.id);
  assert.equal(next.value.title, 'Bob own new input');
  assert.equal(h.sqlite.prepare('SELECT user_id FROM work_jobs').get().user_id, 'bob');
});

void test('Workbench ignores a list snapshot superseded by a confirmed creation', async (t) => {
  const h = await setup(t);
  h.render();
  await h.flush();
  h.input('Confirmed after old list');
  // Capture both handlers from one rendered frame, then defer its older GET.
  const create = h.find('button', '仕事を作成').props.onClick;
  const refresh = h.find('button', '再読込').props.onClick;
  const delayed = h.delayList();
  refresh();
  await h.flush();
  const oldSnapshot = await delayed.ready;
  assert.equal(oldSnapshot.jobs.length, 0, 'older snapshot is captured before the confirmed creation');
  create();
  h.render();
  await h.flush();
  assert.equal(h.count(), 1);
  delayed.release();
  await h.flush();
  assert.ok(h.find('strong', 'Confirmed after old list'));
  assert.equal(h.find('button', '同じ作成内容で結果を確認'), undefined);
});

void test('Workbench lost committed response is reconciled with the same A ID without creating a second job', async (t) => {
  const h = await setup(t);
  h.render();
  await h.flush();
  h.input('Synthetic uncertain committed job');
  h.loseNextPost();
  await h.click('仕事を作成');
  assert.equal(h.count(), 1);
  const original = h.requests.find((r) => r.method === 'POST');
  h.owner(null);
  await h.click('同じ作成内容で結果を確認');
  assert.equal(h.count(), 1);
  h.owner('alice');
  await h.click('保存先の接続を確認');
  await h.click('同じ作成内容で結果を確認');
  const posts = h.requests.filter((r) => r.method === 'POST');
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[1].value, original.value);
  assert.equal(h.count(), 1);
  assert.equal(h.find('button', '同じ作成内容で結果を確認'), undefined);
});


void test('Workbench unsent title remains private across owners and stale input/create/discard handlers cannot act', async (t) => {
  const h = await setup(t); await h.grant('bob'); h.render(); await h.flush();
  const title = () => h.nodes().find(n => n.type === 'input' && n.props.placeholder === '例: 自動化についての記事');
  assert.equal(h.navigationBlocked, false);
  h.input('Alice private title');
  const oldInput = title().props.onChange;
  const oldCreate = h.find('button', '仕事を作成').props.onClick;
  const oldDiscard = h.find('button', '未保存の入力を破棄').props.onClick;
  assert.equal(h.navigationBlocked, true);
  h.owner('bob'); await h.click('再読込');
  assert.equal(title().props.value, '');
  assert.equal(h.find('button', '仕事を作成').props.disabled, true);
  oldInput({ target: { value: 'stale Alice edit' } }); oldCreate(); oldDiscard(); h.render(); await h.flush();
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 0);
  assert.equal(title().props.value, '');
  h.input('Bob private title');
  h.owner('alice'); await h.click('再読込');
  assert.equal(title().props.value, 'Alice private title');
  await h.click('未保存の入力を破棄');
  assert.equal(h.navigationBlocked, true, 'another owner retained input still needs protection');
  h.owner('bob'); await h.click('再読込');
  assert.equal(title().props.value, 'Bob private title');
  await h.click('未保存の入力を破棄');
  assert.equal(h.navigationBlocked, false);
});

void test('Workbench Agent private prompt, caps and offline consent restore only for their author', async (t) => {
  const h = await setup(t); await h.grant('bob');
  await h.routeCall('POST', { id: randomUUID(), title: 'Alice saved job', templateId: 'article' }, 'alice');
  await h.routeCall('POST', { id: randomUUID(), title: 'Bob saved job', templateId: 'article' }, 'bob');
  h.render(); await h.flush(); await h.click('Alice saved job');
  const input = (placeholder) => h.nodes().find(n => n.type === 'input' && n.props.placeholder === placeholder);
  const message = () => h.nodes().find(n => n.type === 'textarea' && n.props.maxLength === 8000);
  const consent = () => h.find('label', '受付・承認後、この仕事').props.children[0];
  message().props.onChange({ target: { value: 'Alice confidential request' } });
  input('例: 10.00').props.onChange({ target: { value: '12.34' } });
  input('例: 25.00').props.onChange({ target: { value: '56.78' } });
  consent().props.onChange({ target: { checked: true } }); h.render();
  const staleMessage = message().props.onChange;
  const staleConsent = consent().props.onChange;
  h.owner('bob'); await h.click('再読込'); await h.click('Bob saved job');
  assert.equal(message().props.value, ''); assert.equal(input('例: 10.00').props.value, '');
  assert.equal(input('例: 25.00').props.value, ''); assert.equal(consent().props.checked, false);
  staleMessage({ target: { value: 'stale edit' } }); staleConsent({ target: { checked: true } }); h.render();
  assert.equal(message().props.value, ''); assert.equal(consent().props.checked, false);
  h.owner('alice'); await h.click('再読込'); await h.click('Alice saved job');
  assert.equal(message().props.value, 'Alice confidential request');
  assert.equal(input('例: 10.00').props.value, '12.34'); assert.equal(input('例: 25.00').props.value, '56.78');
  assert.equal(consent().props.checked, true);
});

for (const packageKey of ['', 'fixture.package@1.0.0']) void test(`Workbench signed quote becomes actionable and unknown Agent draft preserves exact ID through owner roundtrip (${packageKey || 'no Package'})`, async (t) => {
  const posts = []; let quoteCount = 0; let manifestSha256 = 'c'.repeat(64);
  const manifest = { ...createSkyToolPackageDraft({ sourceKind: 'github', sourceUrl: 'https://github.com/example/tool', developerName: 'Fixture', developerId: 'fixture', license: 'MIT' }), name: 'Fixture Package', summary: 'Synthetic existing Package' };
  const agent = { id: 'fixture-agent', origin: 'https://agent.example', agentName: 'Fixture Agent', agentVersion: '1.0', cardSha256: 'a'.repeat(64), cardJson: '{"skills":[]}' };
  const h = await setup(t, { componentProps: { initialPackageKey: packageKey }, onFetch(path, options) {
    const method = options.method ?? 'GET'; const body = options.body ? JSON.parse(options.body) : null;
    if (path === '/api/sky/tool-registry') return Response.json({ packages: [{ packageKey, manifest, manifestSha256, status: 'verified', installable: true }] });
    if (path === '/api/rockstar/entitlements') return Response.json({ entitlements: [{ status: 'active', serviceProfile: { state: 'ready', activation: 'owner_choice_required', packages: [{ packageKey, state: 'ready' }] } }] });
    if (path === '/api/sky/a2a-agents' && method === 'GET') return Response.json({ agents: [agent] });
    if (path === '/api/sky/a2a-price-quotes' && method === 'POST') {
      quoteCount++;
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.message)).then(bytes => Response.json({
        quote: { quoteId: 'fixture-quote', providerId: 'fixture-provider', pricingVersion: 'fixture-price', currency: 'USD', estimateMinor: 100, maxAmountMinor: 200, usage: [], expiresAt: Date.now() + 600000 },
        ...(packageKey ? { packageRuntimeBinding: { packageKey, manifestSha256 }, packageRuntimeBindingId: 'binding-1', packageRuntimeBindingDigest: 'd'.repeat(64) } : {}),
        quoteDigest: 'b'.repeat(64), requestSha256: Buffer.from(bytes).toString('hex'), quoteOnly: true, executionAuthorized: false,
      }));
    }
    if (path === '/api/sky/a2a-delegations' && method === 'POST') { posts.push(body); throw new Error('synthetic unknown saved draft reply'); }
    if (path.includes('idempotencyKey=')) return Response.json({ delegation: null });
  } });
  await h.grant('bob');
  await h.routeCall('POST', { id: randomUUID(), title: 'Alice saved job', templateId: 'article' }, 'alice');
  await h.routeCall('POST', { id: randomUUID(), title: 'Bob saved job', templateId: 'article' }, 'bob');
  h.render(); await h.flush(); await h.click('Alice saved job'); await h.click('このAgentを選ぶ');
  const input = (placeholder) => h.nodes().find(n => n.type === 'input' && n.props.placeholder === placeholder);
  h.nodes().find(n => n.type === 'textarea' && n.props.maxLength === 8000).props.onChange({ target: { value: 'Alice immutable Agent input' } });
  input('例: 10.00').props.onChange({ target: { value: '2.00' } }); input('例: 25.00').props.onChange({ target: { value: '10.00' } });
  h.find('label', '依頼文全体をこのAgentのProviderへ').props.children[0].props.onChange({ target: { checked: true } }); h.render();
  await h.click('署名付き見積を取得');
  await h.waitFor(() => !h.find('button', 'このAgentを選ぶ').props.disabled);
  assert.equal(quoteCount, 1); assert.ok(h.text().includes('Provider署名付き価格見積'));
  h.find('label', '受付・承認後、この仕事').props.children[0].props.onChange({ target: { checked: true } }); h.render();
  assert.equal(h.find('button', '条件を確認する').props.disabled, false);
  const form = () => h.nodes().find(n => n.type === 'form' && n.props.id === 'work-a2a-delegation-form');
  const oldSubmit = form().props.onSubmit;
  const staleDiscard = h.find('button', '未保存の入力を破棄').props.onClick;
  oldSubmit({ preventDefault() {} }); h.render(); await h.flush();
  await h.waitFor(() => !h.find('button', '条件を確認する').props.disabled);
  assert.equal(posts.length, 1);
  const discard = h.find('button', '未保存の入力を破棄');
  assert.equal(discard.props.disabled, true);
  discard.props.onClick(); staleDiscard(); h.render();
  assert.ok(h.text().includes('Alice immutable Agent input'));
  assert.equal(h.navigationBlocked, true);
  h.owner('bob'); await h.click('再読込'); await h.click('Bob saved job');
  oldSubmit({ preventDefault() {} }); h.render(); await h.flush(); assert.equal(posts.length, 1);
  h.owner('alice'); await h.click('再読込'); await h.click('Alice saved job');
  assert.equal(h.find('button', '条件を確認する').props.disabled, false);
  form().props.onSubmit({ preventDefault() {} }); h.render(); await h.flush();
  await h.waitFor(() => !h.find('button', '条件を確認する').props.disabled);
  assert.equal(posts.length, 2); assert.deepEqual(posts[1], posts[0]); assert.equal(quoteCount, 1);
  if (packageKey) {
    assert.ok(posts[0].message.includes(packageKey)); assert.ok(posts[0].message.includes(manifestSha256));
    assert.equal(posts[0].packageRuntimeBindingDigest, 'd'.repeat(64));
    manifestSha256 = 'e'.repeat(64);
    h.owner('bob'); await h.click('再読込'); h.owner('alice'); await h.click('再読込'); await h.click('Alice saved job');
    assert.equal(h.find('button', '条件を確認する').props.disabled, true, 'changed reviewed manifest cannot reuse old quote');
    assert.equal(posts.length, 2);
  }
});


void test('Workbench rejects malformed list and committed creation projections without losing the original ID', async (t) => {
  let mode = 'bad-list';
  const h = await setup(t, { onWorkResponse(method, result) {
    if (method === 'GET' && mode === 'bad-list') return Response.json({ ...result.data, jobs: {} });
    if (method === 'POST' && mode === 'bad-create') return Response.json({ ...result.data, job: { ...result.data.job, steps: null } }, { status: 201 });
  } });
  h.render(); await assert.doesNotReject(h.flush()); assert.equal(h.count(), 0);
  mode = 'normal'; await h.click('再読込'); h.input('Synthetic projection recovery');
  mode = 'bad-create'; await assert.doesNotReject(h.click('仕事を作成'));
  assert.equal(h.count(), 1); assert.equal(h.navigationBlocked, true);
  assert.ok(h.find('button', '同じ作成内容で結果を確認'));
  mode = 'normal'; await h.click('同じ作成内容で結果を確認');
  const posts = h.requests.filter((r) => r.method === 'POST');
  assert.equal(posts.length, 2); assert.deepEqual(posts[1].value, posts[0].value);
  assert.equal(h.count(), 1); assert.equal(h.find('button', '同じ作成内容で結果を確認'), undefined);
});

async function recordFixture(t, options) {
  const h = await setup(t, options); const id = randomUUID();
  const { data } = await h.routeCall('POST', { id, title: 'Saved execution job', templateId: 'article' }, 'alice');
  h.render(); await h.flush(); await h.click('Saved execution job'); await h.click(data.job.steps[0].title);
  const runner = h.nodes().find((n) => typeof n.props?.onRecord === 'function'); assert.ok(runner);
  const record = () => runner.props.onRecord(data.job.steps[0].tool, 'browser', 'completed', performance.now(), false, 'passed');
  return { h, id, record };
}

void test('pending tool success blocks navigation and survives failed latest-state reads with an immutable command', async (t) => {
  const { h, id, record } = await recordFixture(t);
  h.rejectNext('PATCH'); await assert.rejects(record()); h.render(); await h.flush();
  assert.equal(h.navigationBlocked, true);
  const original = h.requests.find((r) => r.method === 'PATCH').value;
  h.rejectNext('GET'); await h.click('最新状態を読み直す');
  assert.ok(h.find('button', '記録の保存を再試行')); assert.equal(h.navigationBlocked, true);
  await h.click('記録の保存を再試行');
  assert.deepEqual(h.requests.filter((r) => r.method === 'PATCH')[1].value, original);
  const saved = (await h.routeCall('GET', undefined, 'alice')).data.jobs.find((j) => j.id === id);
  assert.equal(saved.steps[0].passed, true); assert.equal(saved.events.length, 1);
  assert.equal(h.find('button', '記録の保存を再試行'), undefined);
});

void test('pending tool record stays bound to Alice across unknown owner, Bob, and captured retry handlers', async (t) => {
  const { h, id, record } = await recordFixture(t); await h.grant('bob');
  h.rejectNext('PATCH'); await assert.rejects(record()); h.render(); await h.flush();
  const oldRetry = h.find('button', '記録の保存を再試行').props.onClick;
  h.owner(null); await h.click('最新状態を読み直す');
  oldRetry(); await h.flush(); assert.equal(h.requests.filter((r) => r.method === 'PATCH').length, 1);
  h.owner('bob'); await h.click('最新状態を読み直す');
  assert.equal(h.find('button', '記録の保存を再試行').props.disabled, true);
  oldRetry(); await h.flush(); assert.equal(h.requests.filter((r) => r.method === 'PATCH').length, 1);
  h.owner('alice'); await h.click('最新状態を読み直す'); await h.click('記録の保存を再試行');
  const patches = h.requests.filter((r) => r.method === 'PATCH'); assert.equal(patches.length, 2);
  assert.deepEqual(patches[1].value, patches[0].value); assert.ok(patches.every((r) => r.user === 'alice'));
  const saved = (await h.routeCall('GET', undefined, 'alice')).data.jobs.find((j) => j.id === id);
  assert.equal(saved.events.length, 1); assert.equal(h.find('button', '記録の保存を再試行'), undefined);
});

void test('committed malformed tool response reconciles only the same command via validated GET and never resends', async (t) => {
  const { h, id, record } = await recordFixture(t, { onWorkResponse(method, result) {
    if (method === 'PATCH') return Response.json({ ...result.data, job: { ...result.data.job, events: {} } });
  } });
  await assert.rejects(record()); h.render(); await h.flush();
  assert.ok(h.find('button', '記録の保存を再試行')); assert.equal(h.navigationBlocked, true);
  await h.click('最新状態を読み直す');
  assert.equal(h.find('button', '記録の保存を再試行'), undefined);
  assert.equal(h.requests.filter((r) => r.method === 'PATCH').length, 1);
  assert.equal((await h.routeCall('GET', undefined, 'alice')).data.jobs.find((j) => j.id === id).events.length, 1);
});

void test('two same-frame tool records send one command and no second approval or state mutation', async (t) => {
  const { h, id, record } = await recordFixture(t);
  const first = record(), second = record(); const result = await Promise.allSettled([first, second]);
  h.render(); await h.flush(); assert.deepEqual(result.map((r) => r.status), ['fulfilled', 'rejected']);
  assert.equal(h.requests.filter((r) => r.method === 'PATCH').length, 1);
  assert.equal((await h.routeCall('GET', undefined, 'alice')).data.jobs.find((j) => j.id === id).events.length, 1);
});


void test('captured Workbench discard cannot erase later private fields, including edits before the next render', async (t) => {
  const h = await setup(t); h.render(); await h.flush(); h.input('Earlier title');
  const oldDiscard = h.find('button', '未保存の入力を破棄').props.onClick;
  const title = () => h.nodes().find((n) => n.type === 'input' && n.props.placeholder === '例: 自動化についての記事');
  title().props.onChange({ target: { value: 'Later private title' } });
  oldDiscard(); h.render(); await h.flush();
  assert.equal(title().props.value, 'Later private title'); assert.equal(h.navigationBlocked, true);
  await h.click('未保存の入力を破棄'); assert.equal(title().props.value, ''); assert.equal(h.navigationBlocked, false);
});


void test('a captured release for the first unknown creation cannot retire a later unknown creation', async (t) => {
  const h = await setup(t); h.render(); await h.flush(); h.input('First uncertain job');
  h.loseNextPost(); await h.click('仕事を作成'); await h.click('保存先の接続を確認');
  const oldRelease = h.find('button', '保留を解除（入力は保持）').props.onClick;
  await h.click('保留を解除（入力は保持）'); h.input('Second uncertain job');
  h.loseNextPost(); await h.click('仕事を作成'); await h.click('保存先の接続を確認');
  const original = h.requests.filter((r) => r.method === 'POST')[1].value;
  oldRelease(); h.render(); await h.flush();
  assert.ok(h.find('button', '同じ作成内容で結果を確認')); assert.equal(h.navigationBlocked, true);
  await h.click('同じ作成内容で結果を確認');
  const posts = h.requests.filter((r) => r.method === 'POST'); assert.equal(posts.length, 3);
  assert.deepEqual(posts[2].value, original); assert.equal(h.count(), 2);
});


void test('committed Tool record restores the same selected detail after a failed latest-state read', async (t) => {
  const { h, id, record } = await recordFixture(t, { onWorkResponse(method) {
    if (method === 'PATCH') return Response.json({ error: 'Synthetic reply lost after commit' }, { status: 503 });
  } });
  await assert.rejects(record()); h.render(); await h.flush();
  h.rejectNext('GET'); await h.click('最新状態を読み直す');
  assert.ok(h.find('h2', '仕事を選んで開始')); assert.ok(h.find('button', '記録の保存を再試行'));
  await h.click('最新状態を読み直す');
  assert.equal(h.find('button', '記録の保存を再試行'), undefined);
  assert.ok(h.find('h2', 'Saved execution job'), 'confirmed original job detail is restored without a second click');
  assert.equal(h.find('h2', '仕事を選んで開始'), undefined);
  assert.equal(h.requests.filter((r) => r.method === 'PATCH').length, 1);
  assert.equal((await h.routeCall('GET', undefined, 'alice')).data.jobs.find((j) => j.id === id).events.length, 1);
});

void test('pending record readback never restores Alice detail in Bob scope', async (t) => {
  const { h, record } = await recordFixture(t, { onWorkResponse(method) {
    if (method === 'PATCH') return Response.json({ error: 'Synthetic reply lost after commit' }, { status: 503 });
  } });
  await h.grant('bob'); await assert.rejects(record()); h.render(); await h.flush();
  h.owner('bob'); await h.click('最新状態を読み直す');
  assert.equal(h.find('h2', 'Saved execution job'), undefined);
  assert.ok(h.find('h2', '仕事を選んで開始'));
  assert.equal(h.find('button', '記録の保存を再試行').props.disabled, true);
  assert.equal(h.requests.filter((r) => r.method === 'PATCH').length, 1);
});

void test('a pending record readback does not replace a newer same-owner selection', async (t) => {
  const h = await setup(t, { onWorkResponse(method) {
    if (method === 'PATCH') return Response.json({ error: 'Synthetic reply lost after commit' }, { status: 503 });
  } });
  const { data } = await h.routeCall('POST', { id: randomUUID(), title: 'Original selected job', templateId: 'article' });
  await h.routeCall('POST', { id: randomUUID(), title: 'Newer selected job', templateId: 'article' });
  h.render(); await h.flush(); await h.click('Original selected job'); await h.click(data.job.steps[0].title);
  const chooseOther = h.find('button', 'Newer selected job').props.onClick;
  const runner = h.nodes().find((n) => typeof n.props?.onRecord === 'function');
  await assert.rejects(runner.props.onRecord(data.job.steps[0].tool, 'browser', 'completed', performance.now(), false, 'passed'));
  h.render(); await h.flush();
  const delayed = h.delayList(); await h.click('最新状態を読み直す');
  await delayed.ready;
  chooseOther(); h.render(); delayed.release(); await h.flush();
  assert.ok(h.find('h2', 'Newer selected job'));
  assert.equal(h.find('h2', 'Original selected job'), undefined);
  assert.equal(h.find('button', '記録の保存を再試行'), undefined);
  assert.equal(h.requests.filter((r) => r.method === 'PATCH').length, 1);
});


void test('real MrToolRunner retains input and generated output across committed-record uncertainty and failed GET remount', async (t) => {
  const h = await setup(t, { actualRunner: true, onWorkResponse(method) {
    if (method === 'PATCH') return Response.json({ error: 'Synthetic reply lost after commit' }, { status: 503 });
  } });
  const { data } = await h.routeCall('POST', { id: randomUUID(), title: 'Runner recovery job', templateId: 'article' });
  h.render(); await h.flush(); await h.click('Runner recovery job'); await h.click(data.job.steps[0].title);
  const source = 'Private original text（出典: [Synthetic source](https://example.com/reference)）';
  const input = () => h.nodes().find((n) => n.type === 'textarea' && n.props.placeholder?.includes('本文（出典:'));
  const result = () => h.nodes().find((n) => n.type === 'textarea' && n.props['aria-label'] === '生成結果');
  assert.ok(input(), 'actual runner input mounted'); input().props.onChange({ target: { value: source } }); h.render();
  await h.click('作成する'); await h.waitFor(() => Boolean(result()));
  const output = result().props.value; assert.ok(output.includes('Private original text')); assert.notEqual(output, source);
  assert.ok(h.find('button', 'この端末に保存')); assert.equal(h.storageWrites, 0);
  assert.ok(h.text().includes('Synthetic reply lost after commit'), 'unresolved record failure remains visible');
  h.rejectNext('GET'); await h.click('最新状態を読み直す');
  assert.equal(input(), undefined); assert.equal(result(), undefined);
  await h.click('最新状態を読み直す');
  assert.equal(input()?.props.value, source); assert.equal(result()?.props.value, output);
  assert.ok(!h.text().includes('Synthetic reply lost after commit'), 'confirmed recording does not leave a stale Tool error');
  assert.ok(h.find('button', 'この端末に保存')); assert.equal(h.storageWrites, 0);
  assert.equal(h.requests.filter((r) => r.method === 'PATCH').length, 1);
});

void test('real runner sessions hide private text/output for Bob, reject stale actions, and restore Alice without storage writes', async (t) => {
  const h = await setup(t, { actualRunner: true }); await h.grant('bob');
  const alice = (await h.routeCall('POST', { id: randomUUID(), title: 'Alice runner job', templateId: 'article' }, 'alice')).data.job;
  const bob = (await h.routeCall('POST', { id: randomUUID(), title: 'Bob runner job', templateId: 'article' }, 'bob')).data.job;
  h.render(); await h.flush(); await h.click('Alice runner job'); await h.click(alice.steps[0].title);
  const input = () => h.nodes().find((n) => n.type === 'textarea' && n.props.placeholder?.includes('本文（出典:'));
  input().props.onChange({ target: { value: 'Alice private manuscript' } }); h.render();
  const oldInput = input().props.onChange; await h.click('作成する');
  const originalOutput = h.nodes().find((n) => n.props?.['aria-label'] === '生成結果').props.value;
  const oldSave = h.find('button', 'この端末に保存').props.onClick;
  h.owner('bob'); await h.click('再読込'); await h.click('Bob runner job'); await h.click(bob.steps[0].title);
  assert.equal(input().props.value, ''); assert.ok(!h.text().includes('Alice private manuscript'));
  oldInput({ target: { value: 'Stale overwritten manuscript' } }); oldSave(); h.render(); await h.flush();
  assert.equal(input().props.value, ''); assert.equal(h.storageWrites, 0);
  h.owner('alice'); await h.click('再読込'); await h.click('Alice runner job');
  assert.equal(input().props.value, 'Alice private manuscript');
  assert.equal(h.nodes().find((n) => n.props?.['aria-label'] === '生成結果').props.value, originalOutput);
  assert.equal(h.storageWrites, 0);
});


void test('real Tool validation error remains visible after workflow record and latest-state refresh', async (t) => {
  const h = await setup(t, { actualRunner: true });
  const job = (await h.routeCall('POST', { id: randomUUID(), title: 'Tool validation recovery', templateId: 'article' })).data.job;
  h.render(); await h.flush(); await h.click('Tool validation recovery'); await h.click(job.steps[0].title);
  await h.click('作成する');
  assert.ok(h.text().includes('本文を入力してください。'));
  assert.equal(h.nodes().find((n) => n.props?.['aria-label'] === '生成結果'), undefined);
  await h.click('再読込');
  assert.ok(h.text().includes('本文を入力してください。'), 'successful metadata refresh must not clear an actual Tool input error');
  assert.equal(h.requests.filter((r) => r.method === 'PATCH').length, 1);
  assert.equal(h.requests.find((r) => r.method === 'PATCH').value.command.outcome, 'failed');
});


void test('runner session Maps isolate prototype-like authenticated identities and preserve immutable snapshots and subscriptions', async (t) => {
  const h = await setup(t, { actualRunner: true });
  const identities = ['__proto__', 'constructor', 'toString'];
  const saved = new Map();
  const input = () => h.nodes().find((n) => n.type === 'textarea' && n.props.placeholder?.includes('本文（出典:'));
  const runner = () => h.nodes().find((n) => n.props?.session && n.props?.tool);
  for (const owner of identities) {
    await h.grant(owner);
    const { response, data } = await h.routeCall('POST', { id: randomUUID(), title: `${owner} runner job`, templateId: 'article' }, owner);
    assert.equal(response.status, 201, 'identity accepted by actual authenticated route');
    h.owner(owner); h.render(); await h.flush(); await h.click('再読込');
    await h.click(`${owner} runner job`); await h.click(data.job.steps[0].title);
    assert.equal(input().props.value, '', 'another identity never inherits an existing session');
    const session = runner().props.session;
    let notifications = 0;
    const unsubscribe = session.subscribe(() => { notifications++; });
    input().props.onChange({ target: { value: `${owner} private manuscript` } }); h.render();
    const before = session.getSnapshot();
    assert.equal(session.getSnapshot(), before, 'unchanged snapshots stay referentially stable');
    assert.ok(notifications > 0, 'live subscriber receives input transitions');
    const firstNotifications = notifications;
    input().props.onChange({ target: { value: `${owner} revised private manuscript` } }); h.render();
    assert.notEqual(session.getSnapshot(), before);
    assert.equal(before.text, `${owner} private manuscript`, 'previous snapshot is immutable');
    assert.ok(notifications > firstNotifications, 'subsequent input notifies the same subscriber');
    unsubscribe(); const finalNotifications = notifications;
    const staleInput = input().props.onChange;
    await h.click('作成する');
    assert.equal(notifications, finalNotifications, 'unsubscribed listener stays detached');
    saved.set(owner, { input: `${owner} revised private manuscript`, output: h.nodes().find((n) => n.props?.['aria-label'] === '生成結果').props.value, staleInput });
  }
  for (const owner of identities) {
    h.owner(owner); await h.click('再読込'); await h.click(`${owner} runner job`);
    for (const [other, state] of saved) if (other !== owner) state.staleInput({ target: { value: 'cross-owner overwrite' } });
    h.render();
    assert.equal(input().props.value, saved.get(owner).input);
    assert.equal(h.nodes().find((n) => n.props?.['aria-label'] === '生成結果').props.value, saved.get(owner).output);
  }
  assert.equal(h.storageWrites, 0);
});


void test('runner-only input and generated result block real same-tab navigation until current owner explicitly discards', async (t) => {
  const h = await setup(t, { actualRunner: true, actualNavigation: true });
  const job = (await h.routeCall('POST', { id: randomUUID(), title: 'Guarded runner draft', templateId: 'article' })).data.job;
  h.render(); await h.flush(); await h.click(job.title); await h.click(job.steps[0].title);
  const input = () => h.nodes().find((n) => n.type === 'textarea' && n.props.placeholder?.includes('本文（出典:'));
  assert.equal(h.navigateLink().prevented, false, 'unchanged initial Tool does not trap navigation');
  input().props.onChange({ target: { value: 'Private unsaved runner manuscript' } }); h.render();
  assert.equal(h.navigateLink().prevented, true, 'actual same-tab link is prevented before Workbench unmount');
  await h.click('作成する');
  assert.equal(h.navigateLink().prevented, true, 'confirmed workflow record does not persist its generated result');
  await h.click('この端末に保存');
  const writes = h.storageWrites;
  await h.click('このToolの入力・結果を破棄');
  assert.equal(input().props.value, '');
  assert.equal(h.nodes().find((n) => n.props?.['aria-label'] === '生成結果'), undefined);
  assert.equal(h.storageWrites, writes, 'discard never changes the explicitly saved library');
  assert.ok(h.text().includes('保存した成果'));
  assert.equal(h.navigateLink().prevented, false, 'explicit discard releases same-tab navigation');
  assert.equal((await h.routeCall('GET')).data.jobs.length, 1, 'discard leaves durable workflow intact');
});


void test('hidden and cancelled runner drafts have an owner-only escape without clearing other job or saved records', async (t) => {
  const h = await setup(t, { actualRunner: true, actualNavigation: true });
  const jobs = [];
  for (const title of ['Hidden retained draft', 'Second retained draft']) jobs.push((await h.routeCall('POST', { id: randomUUID(), title, templateId: 'article' })).data.job);
  const input = () => h.nodes().find((n) => n.type === 'textarea' && n.props.placeholder?.includes('本文（出典:'));
  h.render(); await h.flush();
  for (const job of jobs) {
    await h.click(job.title); await h.click(job.steps[0].title);
    input().props.onChange({ target: { value: `${job.title} private text` } }); h.render();
  }
  const discardFirst = () => h.nodes().find((n) => n.type === 'button' && n.props['aria-label'] === `${jobs[0].title} / ${jobs[0].steps[0].title} の入力・結果を破棄`);
  assert.ok(discardFirst(), 'a retained draft is reachable even while a different job is selected');
  discardFirst().props.onClick(); h.render();
  assert.equal(input().props.value, `${jobs[1].title} private text`, 'individual discard preserves another scope');
  assert.equal(h.navigateLink().prevented, true);
  await h.click('この仕事を中止');
  assert.equal(input(), undefined, 'cancelled workflow hides the runner');
  assert.ok(h.find('button', 'このToolの入力・結果を破棄'), 'cancelled job cannot trap the user');
  await h.click('このToolの入力・結果を破棄');
  assert.equal(h.navigateLink().prevented, false);
  const stored = (await h.routeCall('GET')).data.jobs;
  assert.equal(stored.length, 2); assert.equal(stored.find((job) => job.id === jobs[1].id).status, 'cancelled');
  assert.equal(h.storageWrites, 0);
});

void test('runner discard rejects different owners and captured callbacks after later input even before rerender', async (t) => {
  const h = await setup(t, { actualRunner: true, actualNavigation: true }); await h.grant('bob');
  const job = (await h.routeCall('POST', { id: randomUUID(), title: 'Alice confidential Tool draft', templateId: 'article' })).data.job;
  h.render(); await h.flush(); await h.click(job.title); await h.click(job.steps[0].title);
  const input = () => h.nodes().find((n) => n.type === 'textarea' && n.props.placeholder?.includes('本文（出典:'));
  input().props.onChange({ target: { value: 'Earlier private text' } }); h.render();
  const oldDiscard = h.find('button', 'このToolの入力・結果を破棄').props.onClick;
  input().props.onChange({ target: { value: 'Latest private text' } }); oldDiscard(); h.render();
  assert.equal(input().props.value, 'Latest private text');
  const confirmedDiscard = h.find('button', 'このToolの入力・結果を破棄').props.onClick;
  h.rejectNext('GET', 401); await h.click('再読込'); confirmedDiscard(); h.render();
  assert.equal(h.find('button', 'このToolの入力・結果を破棄'), undefined);
  assert.ok(!h.text().includes(job.title), 'unknown owner cannot inspect retained Tool scope');
  assert.equal(h.navigateLink().prevented, true);
  h.owner('bob'); await h.click('再読込'); oldDiscard(); h.render();
  assert.equal(h.find('button', 'このToolの入力・結果を破棄'), undefined);
  assert.ok(!h.text().includes(job.title)); assert.ok(!h.text().includes('Latest private text'));
  assert.equal(h.navigateLink().prevented, true, 'hidden owner draft remains protected');
  h.owner('alice'); await h.click('再読込');
  await h.click('このToolの入力・結果を破棄');
  assert.equal(h.navigateLink().prevented, false, 'original confirmed owner can discard without reopening the Tool');
  await h.click(job.title); assert.equal(input().props.value, '');
  assert.equal(h.storageWrites, 0);
});

void test('runner discard cannot erase a running or unknown recorded result and validation-only errors never trap navigation', async (t) => {
  const h = await setup(t, { actualRunner: true, actualNavigation: true, onWorkResponse(method) {
    if (method === 'PATCH') return Response.json({ error: 'Synthetic record response lost' }, { status: 503 });
  } });
  const job = (await h.routeCall('POST', { id: randomUUID(), title: 'Unconfirmed Tool result', templateId: 'article' })).data.job;
  h.render(); await h.flush(); await h.click(job.title); await h.click(job.steps[0].title);
  const input = () => h.nodes().find((n) => n.type === 'textarea' && n.props.placeholder?.includes('本文（出典:'));
  input().props.onChange({ target: { value: 'Tool result waiting for record confirmation' } }); h.render();
  const oldDiscard = h.find('button', 'このToolの入力・結果を破棄').props.onClick;
  h.find('button', '作成する').props.onClick(); oldDiscard(); h.render();
  assert.equal(input().props.value, 'Tool result waiting for record confirmation');
  assert.equal(h.find('button', 'このToolの入力・結果を破棄').props.disabled, true);
  await h.flush();
  const blockedDiscard = h.find('button', 'このToolの入力・結果を破棄');
  assert.equal(blockedDiscard.props.disabled, true); blockedDiscard.props.onClick(); h.render();
  assert.ok(h.nodes().find((n) => n.props?.['aria-label'] === '生成結果'));
  assert.equal(h.navigateLink().prevented, true);
  await h.click('最新状態を読み直す');
  await h.click('このToolの入力・結果を破棄');
  assert.equal(h.navigateLink().prevented, false);
  assert.equal(h.requests.filter((entry) => entry.method === 'PATCH').length, 1);
  assert.equal(h.storageWrites, 0);

  const clean = await setup(t, { actualRunner: true, actualNavigation: true });
  const empty = (await clean.routeCall('POST', { id: randomUUID(), title: 'Validation only', templateId: 'article' })).data.job;
  clean.render(); await clean.flush(); await clean.click(empty.title); await clean.click(empty.steps[0].title);
  await clean.click('作成する');
  assert.ok(clean.text().includes('本文を入力してください。'));
  clean.nodes().find((n) => n.props?.session && n.props?.tool).props.session.patch({ copied: true, editing: true }); clean.render();
  assert.equal(clean.find('button', 'このToolの入力・結果を破棄'), undefined);
  assert.equal(clean.navigateLink().prevented, false, 'error and default values alone do not lock navigation');
});


void test('delayed Workbench lists signal snapshot readiness before callers release them', async (t) => {
  const h = await setup(t); h.render(); await h.flush();
  const prepare = Promise.withResolvers();
  const delayed = h.delayList({ prepare: prepare.promise });
  let ready = false;
  const readiness = delayed.ready.then(() => { ready = true; });
  await h.click('再読込');
  await delayed.prepared.promise;
  assert.equal(ready, false, 'held transport is not proof that snapshot preparation finished');
  assert.equal(delayed.release, undefined, 'the actual delayed response does not yet exist');
  prepare.resolve();
  await readiness;
  assert.equal(typeof delayed.release, 'function', 'ready guarantees a releasable captured response');
  delayed.release(); await h.flush();
  assert.equal(h.find('button', '再読込').props.disabled, false, 'released response is read and the component leaves loading');
});


async function deliveryFixture(t, options = {}) {
  const h = await setup(t, { actualRunner: true, actualDelivery: true, actualNavigation: true, ...options });
  const job = (await h.routeCall('POST', { id: randomUUID(), title: 'Private delivery check', templateId: 'coconala' })).data.job;
  const recorded = await h.routeCall('PATCH', { jobId: job.id, revision: job.revision, command: { id: randomUUID(), action: 'record', stepId: job.steps[0].id, tool: job.steps[0].tool, transport: 'browser', outcome: 'passed', sample: false, durationMs: 1 } });
  assert.equal(recorded.response.status, 200, JSON.stringify(recorded.data));
  h.render(); await h.flush(); await h.click(job.title); await h.click(job.steps[1].title);
  const review = () => h.nodes().find((node) => node.props?.id === 'delivery-review');
  const files = () => h.nodes().find((node) => node.type === 'input' && node.props.type === 'file');
  const output = () => h.nodes().find((node) => node.props?.['aria-label'] === '納品記録の照合結果');
  assert.ok(review(), 'actual lazy DeliveryRunner is mounted');
  return { h, job, review, files, output };
}

void test('lazy Delivery input and selected Files block navigation and survive failed owner readback without automatic storage', async (t) => {
  const { h, job, review, files } = await deliveryFixture(t);
  assert.equal(h.navigateLink().prevented, false);
  const source = '{"review":"Alice private review"}', file = new File(['private artifact'], 'proof.txt');
  review().props.onChange({ target: { value: source } }); files().props.onChange({ target: { files: [file] } }); h.render();
  assert.equal(h.navigateLink().prevented, true, 'lazy input alone must protect Workbench from unmount');
  h.rejectNext('GET', 401); await h.click('再読込');
  assert.equal(review(), undefined); assert.ok(!h.text().includes(job.title));
  assert.equal(h.find('button', 'このToolの入力・結果を破棄'), undefined, 'unconfirmed owner cannot discard');
  await h.click('再読込'); await h.click(job.title);
  assert.equal(review().props.value, source); assert.ok(h.text().includes('1ファイルを選択'));
  await h.click('このToolの入力・結果を破棄');
  assert.equal(review().props.value, ''); assert.ok(!h.text().includes('1ファイルを選択'));
  assert.equal(h.navigateLink().prevented, false); assert.equal(h.storageWrites, 0);
});

void test('lazy Delivery restores the exact original File after owner change and rejects stale input and run callbacks', async (t) => {
  const calls = [];
  const { h, job, review, files, output } = await deliveryFixture(t, { deviceFixture: { deviceToken: () => 'fixture-token', async runDevice(name, args) { calls.push({ name, args }); return { status: 'PASS', output: 'Synthetic private delivery result' }; } } });
  await h.grant('bob');
  const source = '{"review":"Alice private review"}', file = new File(['private artifact'], 'proof.txt');
  review().props.onChange({ target: { value: source } }); files().props.onChange({ target: { files: [file] } }); h.render();
  const staleReview = review().props.onChange, staleRun = h.find('button', 'PCで実行する').props.onClick;
  h.owner('bob'); await h.click('再読込');
  staleReview({ target: { value: 'Stale overwrite' } }); staleRun(); h.render(); await h.flush();
  assert.equal(calls.length, 0, 'old owner cannot dispatch a Tool run'); assert.equal(review(), undefined);
  assert.ok(!h.text().includes('Alice private review')); assert.equal(h.navigateLink().prevented, true);
  h.owner('alice'); await h.click('再読込'); await h.click(job.title);
  assert.equal(review().props.value, source); assert.ok(h.text().includes('1ファイルを選択'));
  await h.click('PCで実行する'); await h.waitFor(() => Boolean(output()));
  assert.equal(calls.length, 1); assert.equal(calls[0].name, 'verify_delivery');
  assert.equal(calls[0].args.files[0].path, file.name); assert.equal(Buffer.from(calls[0].args.files[0].base64, 'base64').toString(), 'private artifact');
  assert.equal(output().props.value, 'Synthetic private delivery result'); assert.equal(h.storageWrites, 0);
});

void test('lazy Delivery result and input survive committed-record response loss and failed GET, without duplicate Tool execution', async (t) => {
  const calls = [];
  const { h, job, review, files, output } = await deliveryFixture(t, {
    deviceFixture: { deviceToken: () => 'fixture-token', async runDevice(name, args) { calls.push({ name, args }); return { status: 'PASS', output: 'Delivery verification retained output' }; } },
    onWorkResponse(method) { if (method === 'PATCH') return Response.json({ error: 'Synthetic delivery record response lost' }, { status: 503 }); },
  });
  const source = '{"review":"Original synthetic review"}';
  review().props.onChange({ target: { value: source } }); files().props.onChange({ target: { files: [new File(['proof'], 'proof.txt')] } }); h.render();
  const discardBeforeRun = h.find('button', 'このToolの入力・結果を破棄').props.onClick;
  const run = h.find('button', 'PCで実行する').props.onClick;
  run(); run(); discardBeforeRun(); h.render();
  assert.equal(h.find('button', 'このToolの入力・結果を破棄').props.disabled, true, 'in-flight work cannot be discarded');
  await h.waitFor(() => Boolean(output())); await h.flush();
  assert.equal(calls.length, 1, 'same-frame double click dispatches one local Tool execution');
  const expected = output().props.value;
  assert.equal(h.find('button', 'このToolの入力・結果を破棄').props.disabled, true, 'unknown workflow record keeps its result');
  h.rejectNext('GET'); await h.click('最新状態を読み直す'); assert.equal(review(), undefined); assert.equal(output(), undefined);
  await h.click('最新状態を読み直す');
  assert.equal(review().props.value, source); assert.equal(output().props.value, expected);
  assert.ok(h.text().includes('1ファイルを選択')); assert.ok(!h.text().includes('Synthetic delivery record response lost'));
  assert.equal(h.requests.filter((entry) => entry.method === 'PATCH').length, 1); assert.equal(h.storageWrites, 0);
  await h.click('このToolの入力・結果を破棄'); assert.equal(h.navigateLink().prevented, false);
  assert.equal((await h.routeCall('GET')).data.jobs.find((item) => item.id === job.id).steps[1].passed, true);
});

void test('lazy Delivery stops dispatch if its owner changes during File preparation and preserves the original draft', async (t) => {
  const gate = Promise.withResolvers(), calls = [];
  const { h, job, review, files } = await deliveryFixture(t, { deviceFixture: { deviceToken: () => 'fixture-token', async runDevice(...args) { calls.push(args); return { status: 'PASS', output: 'unexpected' }; } } });
  await h.grant('bob');
  const file = new File(['delayed private proof'], 'proof.txt');
  const readFile = file.arrayBuffer.bind(file); file.arrayBuffer = async () => { await gate.promise; return readFile(); };
  review().props.onChange({ target: { value: '{"review":"Retained original owner"}' } }); files().props.onChange({ target: { files: [file] } }); h.render();
  const refresh = h.find('button', '再読込').props.onClick;
  h.find('button', 'PCで実行する').props.onClick(); h.render();
  h.owner('bob'); refresh(); h.render(); await h.flush();
  assert.equal(review(), undefined); assert.ok(!h.text().includes('Retained original owner'));
  gate.resolve();
  await h.waitFor(() => h.find('button', '再読込').props.disabled === false);
  assert.equal(calls.length, 0, 'file preparation never grants permission to send under a new identity');
  h.owner('alice'); await h.click('再読込'); await h.click(job.title);
  assert.equal(review().props.value, '{"review":"Retained original owner"}'); assert.ok(h.text().includes('1ファイルを選択'));
  assert.equal(h.find('button', 'PCで実行する').props.disabled, false); assert.equal(h.storageWrites, 0);
});


void test('lazy Delivery preserves review JSON across a failed list read and same-owner reauthentication', async (t) => {
  const { h, job, review } = await deliveryFixture(t);
  const source = '{"review":"Original review before transport failure"}';
  review().props.onChange({ target: { value: source } }); h.render();
  h.rejectNext('GET'); await h.click('再読込'); assert.equal(review(), undefined);
  await h.click('再読込'); await h.click(job.title);
  assert.equal(review().props.value, source, 'same-owner remount must restore the exact unsaved JSON');
  assert.equal(h.storageWrites, 0);
});

void test('lazy Delivery fences dispatch after real tracked-start owner transition', async (t) => {
  const waiting = Promise.withResolvers(), release = Promise.withResolvers(), calls = [];
  const { h, job, review, files } = await deliveryFixture(t, {
    actualTracking: true,
    async trackingFetch(_url, options) {
      const body = JSON.parse(options.body);
      if (body.action === 'start') { waiting.resolve(); await release.promise; }
      return Response.json({ id: 'tracking-job', status: body.action === 'finish' ? 'completed' : 'running' });
    },
    deviceFixture: { deviceToken: () => 'fixture-token', async runDevice(...args) { calls.push(args); return { status: 'PASS', output: 'Alice private output' }; } },
  });
  await h.grant('bob');
  review().props.onChange({ target: { value: '{"review":"Alice private review"}' } });
  files().props.onChange({ target: { files: [new File(['private proof'], 'proof.txt')] } }); h.render();
  const refresh = h.find('button', '再読込').props.onClick;
  const session = h.nodes().find((node) => node.props?.session && node.props?.tool).props.session;
  h.find('button', 'PCで実行する').props.onClick(); h.render();
  await waiting.promise;
  h.owner('bob'); refresh(); h.render(); await h.flush();
  assert.equal(review(), undefined, 'Bob is confirmed and Alice runner is hidden');
  release.resolve(); await h.waitFor(() => session.getSnapshot()?.running !== true);
  assert.equal(calls.length, 0, 'real tracked start completion must not dispatch Alice payload after Bob is confirmed');
  h.owner('alice'); await h.click('再読込'); await h.click(job.title);
  assert.equal(review().props.value, '{"review":"Alice private review"}');
  assert.equal(h.storageWrites, 0);
});

void test('lazy Delivery late result belongs only to its original owner session', async (t) => {
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  const { h, job, review, files } = await deliveryFixture(t, {
    deviceFixture: { deviceToken: () => 'fixture-token', async runDevice() { started.resolve(); await release.promise; return { status: 'PASS', output: 'Late Alice private output' }; } },
  });
  await h.grant('bob');
  review().props.onChange({ target: { value: '{"review":"Late Alice review"}' } });
  files().props.onChange({ target: { files: [new File(['late proof'], 'proof.txt')] } }); h.render();
  const refresh = h.find('button', '再読込').props.onClick;
  const session = h.nodes().find((node) => node.props?.session && node.props?.tool).props.session;
  h.find('button', 'PCで実行する').props.onClick(); h.render(); await started.promise;
  const before = h.requests.filter((entry) => entry.method === 'PATCH').length;
  h.owner('bob'); refresh(); h.render(); await h.flush();
  release.resolve(); await h.waitFor(() => session.getSnapshot()?.running !== true);
  assert.equal(review(), undefined); assert.ok(!h.text().includes('Late Alice private output'));
  assert.equal(h.requests.filter((entry) => entry.method === 'PATCH').length,before,'late original result must not be recorded into another owner');
  h.owner('alice'); await h.click('再読込'); await h.click(job.title);
  const output = h.nodes().find((node) => node.props?.['aria-label'] === '納品記録の照合結果');
  assert.equal(review().props.value, '{"review":"Late Alice review"}');
  assert.equal(output.props.value, 'Late Alice private output'); assert.equal(h.storageWrites,0);
});
void test('lazy Delivery stale run cannot replace a result with an unresolved workflow record', async (t) => {
  let calls=0;
  const { h, review, files, output }=await deliveryFixture(t,{
    deviceFixture:{deviceToken:()=> 'fixture-token',async runDevice(){calls++;return{status:'PASS',output:'Original protected output '+calls};}},
    onWorkResponse(method){if(method==='PATCH')return Response.json({error:'record reply lost'},{status:503});}
  });
  review().props.onChange({target:{value:'{"review":"Pending original"}'}});
  files().props.onChange({target:{files:[new File(['proof'],'proof.txt')]}});h.render();
  const staleRun=h.find('button','PCで実行する').props.onClick;
  const session=h.nodes().find(n=>n.props?.session&&n.props?.tool).props.session;
  staleRun();await h.waitFor(()=>Boolean(output()));await h.flush();
  assert.equal(h.find('button','このToolの入力・結果を破棄').props.disabled,true,'first record remains unresolved');
  assert.equal(calls,1);staleRun();await h.waitFor(()=>session.getSnapshot()?.running!==true);h.render();
  assert.equal(calls,1,'captured pre-pending run cannot re-execute or erase the unresolved result');
  assert.equal(output().props.value,'Original protected output 1');
});

void test('lazy Delivery reauthentication masks private input and requires parent owner confirmation before execution', async (t) => {
  let account = 'alice', rejectPost = true; const calls = [];
  const { h, job, review, files } = await deliveryFixture(t, {
    actualTracking: true, actualAccess: true,
    async trackingFetch(_url, options = {}) {
      if (options.method === 'GET') return Response.json([]);
      if (options.method === 'POST' && rejectPost) { rejectPost = false; return Response.json({ error: 'Sign in required' }, { status: 401 }); }
      return Response.json({ id: 'tracking-' + account, status: 'running' });
    },
    deviceFixture: { deviceToken: () => 'same-pc-token', async runDevice(...args) { calls.push({ account, args }); return { status: 'PASS', output: 'Original owner delivery result' }; } },
  });
  await h.grant('bob');
  await h.waitFor(() => h.nodes().some((node) => node.type === 'fieldset' && !node.props.disabled));
  const source = '{"review":"Alice retained private review"}';
  review().props.onChange({ target: { value: source } });
  files().props.onChange({ target: { files: [new File(['Alice private bytes'], 'proof.txt')] } }); h.render();
  const oldRun = h.find('button', 'PCで実行する').props.onClick;
  const oldDiscard = h.find('button', 'このToolの入力・結果を破棄').props.onClick;
  const oldSession = h.nodes().find((node) => node.props?.session && node.props?.tool).props.session;
  oldRun(); h.render();
  await h.waitFor(() => oldSession.getSnapshot()?.running !== true); h.render();
  assert.equal(calls.length, 0, '401 refuses first run');
  assert.equal(review(), undefined, 'known authentication failure immediately masks private input');
  assert.equal(h.find('button', 'このToolの入力・結果を破棄'), undefined, 'unconfirmed owner cannot discard');
  assert.ok(!h.text().includes(job.title));
  account = 'bob'; h.owner('bob'); h.checkExecutionAccess(); oldRun(); oldDiscard(); await h.flush();
  assert.equal(calls.length, 0, 'child access refresh and captured callbacks cannot reopen an old owner draft');
  await h.click('再読込'); assert.equal(review(), undefined); assert.ok(!h.text().includes(job.title));
  account = 'alice'; h.owner('alice'); await h.click('再読込'); await h.click(job.title);
  await h.waitFor(() => h.nodes().some((node) => node.type === 'fieldset' && !node.props.disabled));
  assert.equal(review().props.value, source); assert.ok(h.text().includes('1ファイルを選択'));
  const session = h.nodes().find((node) => node.props?.session && node.props?.tool).props.session;
  await h.click('PCで実行する'); await h.waitFor(() => session.getSnapshot()?.running !== true);
  assert.equal(calls.length, 1); assert.equal(calls[0].account, 'alice'); assert.equal(h.storageWrites, 0);
});

void test('lazy Delivery parent access401 cannot be hidden by child access200',async(t)=>{
 let rejecting=false,reads=0;
 const {h,review,files}=await deliveryFixture(t,{actualTracking:true,actualAccess:true,
  async trackingFetch(_url,options={}){
   if(options.method==='GET') { if(rejecting&&reads++===0)return Response.json({error:'signin'}, {status:401});return Response.json([]); }
   return Response.json({id:'tracking',status:'running'});
  },deviceFixture:{deviceToken:()=> 'fixture',async runDevice(){return{status:'PASS',output:'unused'};}}
 });
 await h.waitFor(()=>h.nodes().some(n=>n.type==='fieldset'&&!n.props.disabled));
 review().props.onChange({target:{value:'{"review":"Alice private parent auth"}'}});files().props.onChange({target:{files:[new File(['secret proof'],'proof.txt')]}});h.render();
 rejecting=true;h.checkExecutionAccess();await h.flush();
 assert.ok(reads>=2,'both actual execution access hooks read the auth endpoint');
 assert.equal(review(),undefined,'known401 from parent hook must mask private draft even if child200 completes');
});
void test('lazy Delivery auth loss invalidates a parent read captured before401',async(t)=>{
 const entry=Promise.withResolvers(),releaseAuth=Promise.withResolvers();
 const {h,review,files}=await deliveryFixture(t,{actualTracking:true,
  async trackingFetch(_url,options={}){
   if(options.method==='POST'){entry.resolve();await releaseAuth.promise;return Response.json({error:'signin'},{status:401});}
   return Response.json({id:'tracking',status:'running'});
  },deviceFixture:{deviceToken:()=> 'fixture',async runDevice(){return{status:'PASS',output:'unused'};}}
 });
 review().props.onChange({target:{value:'{"review":"Alice private stale read"}'}});files().props.onChange({target:{files:[new File(['secret proof'],'proof.txt')]}});h.render();
 const refresh=h.find('button','再読込').props.onClick;
 const session=h.nodes().find(n=>n.props?.session&&n.props?.tool).props.session;
 h.find('button','PCで実行する').props.onClick();h.render();await entry.promise;
 const delayed=h.delayList();refresh();h.render();await delayed.ready;
 releaseAuth.resolve();await h.waitFor(()=>session.getSnapshot()?.running!==true);h.render();assert.equal(review(),undefined);
 delayed.release();await h.flush();
 assert.ok(!h.text().includes('Private delivery check'),'older authenticated read cannot reintroduce private job after known401');
 assert.equal(h.find('button','このToolの入力・結果を破棄'),undefined,'older read cannot make private draft discardable after auth loss');
});
