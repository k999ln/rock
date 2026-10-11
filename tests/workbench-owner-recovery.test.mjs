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
const root = new URL('../', import.meta.url);
async function setup(t) {
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
    'workflow',
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
      assert.equal(method, 'GET');
      return Response.json({
        agents: [],
        delegations: [],
        executions: [],
        executionAvailable: false,
      });
    }
    const value = options.body ? JSON.parse(options.body) : undefined;
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
  const jsx = (type, props) => ({ type, props }),
    inert = () => null;
  const client = loadRouteFixture(
    new URL('lib/operations-client.ts', root),
    new Map([
      ['./device', {}],
      ['./sky-zema-handoff', {}],
    ]),
  );
  let navigationBlocked = false;
  const modules = {
    '@/components/use-pending-save-navigation': { usePendingSaveNavigation(pending) { navigationBlocked = pending; } },
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
    'workflow',
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
  const window = {
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
  runInNewContext(
    compiled,
    {
      exports,
      window,
      crypto,
      URL,
      AbortSignal,
      TextEncoder,
      fetch: trackedFetch,
      require(name) {
        assert.ok(name in modules, name);
        return modules[name];
      },
    },
    { filename: 'components/workbench.tsx' },
  );
  function render() {
    cursor = 0;
    tree = exports.default({});
    while (effects.length) effects.shift()();
  }
  function nodes(value, out = []) {
    if (Array.isArray(value)) value.forEach((x) => nodes(x, out));
    else if (value && typeof value === 'object') {
      out.push(value);
      nodes(value.props?.children, out);
    }
    return out;
  }
  function text(node) {
    return typeof node === 'string'
      ? node
      : Array.isArray(node)
        ? node.map(text).join('')
        : node && typeof node === 'object'
          ? text(node.props?.children)
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
  async function click(label) {
    const button = find('button', label);
    assert.ok(button && !button.props.disabled, label);
    button.props.onClick();
    render();
    await flush();
  }
  await grant('alice');
  return {
    sqlite,
    db,
    requests,
    render,
    flush,
    click,
    find,
    get navigationBlocked() { return navigationBlocked; },
    nodes: () => nodes(tree),
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

void test('Workbench unknown identity blocks creation and retry; explicit release retains input and obtains a fresh B ID', async (t) => {
  const h = await setup(t);
  h.omitScope(true);
  h.render();
  await h.flush();
  h.input('Synthetic retained input');
  assert.ok(h.find('button', '仕事を作成').props.disabled);
  h.omitScope(false);
  await h.click('再読込');
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
  await h.click('保留を解除（入力は保持）');
  assert.equal(h.navigationBlocked, false);
  await h.click('仕事を作成');
  const next = h.requests.filter((r) => r.method === 'POST').at(-1);
  assert.equal(next.status, 201);
  assert.notEqual(next.value.id, original.value.id);
  assert.equal(next.value.title, original.value.title);
  assert.equal(next.value.templateId, original.value.templateId);
  assert.equal(
    h.sqlite.prepare('SELECT user_id FROM work_jobs').get().user_id,
    'bob',
  );
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
