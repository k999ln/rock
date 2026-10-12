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
async function setup(t, { onFetch, onWorkResponse, actualRunner = false, componentProps = {} } = {}) {
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
        return new Promise((resolve) => {
          gate.release = () => resolve(Response.json(result.data));
        });
      }
      return Response.json(result.data);
    }
    return result.response;
  }
  function trackedFetch(url, options) {
    const tracking = { held: false, promise: null };
    const promise = fetch(url, options, tracking);
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
    addEventListener() {},
    removeEventListener() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
  };
  const context = {
    window, crypto, performance, URL, AbortSignal, AbortController, TextEncoder, fetch: trackedFetch,
    require(name) { assert.ok(name in modules, name); return modules[name]; },
  };
  const cloudExports = {};
  runInNewContext(ts.transpileModule(
    readFileSync(new URL('components/workbench-cloud-text.tsx', root), 'utf8'),
    { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
  ).outputText, { ...context, exports: cloudExports }, { filename: 'components/workbench-cloud-text.tsx' });
  modules['@/components/workbench-cloud-text'] = cloudExports;
  runInNewContext(compiled, { ...context, exports }, { filename: 'components/workbench.tsx' });
  let runnerInstance = null, runnerExports;
  if (actualRunner) {
    const runnerReact = {
      useState(initial) { const i = runnerInstance.cursor++; if (!(i in runnerInstance.slots)) runnerInstance.slots[i] = typeof initial === 'function' ? initial() : initial;
        const instance = runnerInstance; return [instance.slots[i], (value) => { instance.slots[i] = typeof value === 'function' ? value(instance.slots[i]) : value; }]; },
      useEffect(fn, deps) { const i = runnerInstance.cursor++, old = runnerInstance.slots[i];
        if (!old || deps.some((v, j) => v !== old.deps[j])) { old?.cleanup?.(); const slot = { deps }; runnerInstance.slots[i] = slot; runnerInstance.effects.push(() => { slot.cleanup = fn(); }); } },
      useCallback(fn) { return fn; },
      useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
      lazy() { return inert; }, Suspense: 'suspense',
    };
    const runnerModules = { ...modules, react: runnerReact,
      'lucide-react': Object.fromEntries(['Play','Download','Copy','Check','CircleHelp','RotateCcw'].map((key) => [key, inert])),
      '@/components/execution-access': { ExecutionSignin: inert, useExecutionAccess: () => ({ executionBlocked: false, accessState: 'ready', setNeedsSignin() {} }) },
      '@/lib/operations-client': { ...client, processedBytes: (value) => new TextEncoder().encode(JSON.stringify(value)).length,
        executeTracked: async ({ task }) => ({ result: await task(), warning: '' }) },
      '@/lib/device': { deviceToken: () => '', runDevice() { throw Error('No external device in fixture'); } },
    };
    for (const name of ['mr-tools','sky-result-library','sky-result-download']) runnerModules[`@/lib/${name}`] = await import(new URL(`lib/${name}.ts`, root));
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
    }
    if (!node) return;
    runnerInstance ??= { key: node.key, cursor: 0, slots: [], effects: [] };
    runnerInstance.cursor = 0; node.rendered = runnerExports.MrToolRunner(node.props);
    while (runnerInstance.effects.length) runnerInstance.effects.shift()();
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
    rejectNext(method, status = 503) { rejectNext.set(method, status); },
    sqlite,
    db,
    requests,
    render,
    flush,
    click,
    waitFor,
    find,
    get navigationBlocked() { return navigationGuards.size > 0; },
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
    delayList() {
      const gate = {};
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
  h.rejectNext('GET'); await h.click('最新状態を読み直す');
  assert.equal(input(), undefined); assert.equal(result(), undefined);
  await h.click('最新状態を読み直す');
  assert.equal(input()?.props.value, source); assert.equal(result()?.props.value, output);
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
