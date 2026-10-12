import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { operations, OperationError } from '../lib/operations.ts';
import { requestUser } from '../lib/request-auth.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as pendingIntent from '../lib/pending-owner-intent.ts';
import * as walletSnapshot from '../lib/wallet-snapshot.ts';
import * as boundedStream from '../lib/bounded-stream.ts';

function harness(t, componentFile = 'wallet-workspace.tsx') {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle', import.meta.url))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'),
    );
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              return sqlite.prepare(sql).get(...args) ?? null;
            },
            async all() {
              return { results: sqlite.prepare(sql).all(...args) };
            },
            async run() {
              return {
                meta: {
                  changes: Number(sqlite.prepare(sql).run(...args).changes),
                },
              };
            },
          };
        },
      };
    },
  };
  let owner = 'alice',
    dropPost = false,
    malformedPost = false,
    malformedResponseGate = null,
    malformedGet = null,
    corruptPost = null,
    rejectPost = null,
    delayedGet = null,
    mounted = true;
  const requests = [],
    tasks = new Set(),
    effects = [],
    slots = [];
  let cursor = 0,
    tree,
    ledger,
    navigationBlocked = false;
  const changed = (old, next) =>
    !old || old.length !== next.length || old.some((v, i) => v !== next[i]);
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots))
        slots[i] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[i],
        (value) => {
          slots[i] = typeof value === 'function' ? value(slots[i]) : value;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps))
        slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) {
      return react.useMemo(() => fn, deps);
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) {
        const old = slots[i];
        slots[i] = { deps };
        effects.push(() => {
          old?.cleanup?.();
          slots[i].cleanup = fn();
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/link': { default: 'a' },
    '@/components/workspace-shell': { default: 'Shell' },
    '@/components/rock-settlement-wallet': { default: 'Settlement' },
    '@/components/ui/tabs': Object.fromEntries(
      ['Tabs', 'TabsContent', 'TabsList', 'TabsTrigger'].map((s) => [s, s]),
    ),
    '@/components/use-pending-save-navigation': {
      usePendingSaveNavigation(value) {
        navigationBlocked = value;
      },
    },
    '@/lib/wallet-snapshot': walletSnapshot,
    '@/lib/owner-intent': ownerIntent,
    './owner-intent': ownerIntent,
    '@/lib/pending-owner-intent': pendingIntent,
    './bounded-stream': boundedStream,
    './fund-store': { database: () => db, requestUser },
    './operations': { operations, OperationError },
    './device': {},
    './sky-zema-handoff': {},
  };
  const window = {
    setTimeout,
    clearTimeout,
    addEventListener() {},
    removeEventListener() {},
  };
  function compile(file) {
    const exports = {};
    const source = ts.transpileModule(
      readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      },
    ).outputText;
    runInNewContext(
      source,
      {
        exports,
        Error,
        TypeError,
        SyntaxError,
        crypto,
        TextEncoder,
        TextDecoder,
        Uint8Array,
        Response,
        Request,
        URL,
        AbortSignal,
        AbortController,
        setTimeout,
        clearTimeout,
        window,
        process: { env: { NODE_ENV: 'test' } },
        fetch: trackedFetch,
        require(name) {
          name = name.replace(/\.ts$/, '');
          if (name === 'lucide-react') return {};
          assert.ok(modules[name], `unmapped ${name}`);
          return { __esModule: true, ...modules[name] };
        },
      },
      { filename: file },
    );
    return exports;
  }
  modules['@/lib/operations-api'] = compile('lib/operations-api.ts');
  const operationClient = compile('lib/operations-client.ts');
  modules['@/lib/operations-client'] = { ...operationClient,
    operationRequest(...args) {
      const held = (args[1] ?? 'GET') === 'GET' && delayedGet !== null;
      return track(operationClient.operationRequest(...args), held);
    },
  };
  const route = compile('app/api/wallet/route.ts');
  if (
    existsSync(new URL('../components/use-wallet-ledger.tsx', import.meta.url))
  ) {
    const walletModule = compile('components/use-wallet-ledger.tsx');
    modules['@/components/use-wallet-ledger'] = {
      ...walletModule,
      useWalletLedger(...args) {
        const value = walletModule.useWalletLedger(...args);
        // Views often discard handler return values with `void`. Track the full
        // operation here so tests wait through response parsing and finally.
        ledger = { ...value };
        for (const name of ['save', 'retry', 'reverse', 'refresh']) {
          ledger[name] = (...inputs) => {
            const held = name === 'refresh' && delayedGet !== null;
            return track(value[name](...inputs), held);
          };
        }
        return ledger;
      },
    };
  }
  const Component = compile(`components/${componentFile}`).default;
  async function routeCall(method, input, user = owner, headers = {}) {
    return route[method](
      new Request('https://local.test/api/wallet', {
        method,
        headers: {
          Origin: 'https://local.test',
          'Content-Type': 'application/json',
          ...headers,
          ...(user ? { 'oai-authenticated-user-id': user } : {}),
        },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      }),
    );
  }
  async function fetchWallet(path, options = {}) {
    assert.equal(path, '/api/wallet');
    const method = options.method ?? 'GET',
      input = options.body ? JSON.parse(options.body) : undefined;
    const entry = { method, input, owner, headers: options.headers };
    requests.push(entry);
    if (method === 'POST' && rejectPost) {
      const status = rejectPost;
      rejectPost = null;
      return Response.json({ error: 'fixture refusal' }, { status });
    }
    const response = await routeCall(method, input, owner, options.headers);
    entry.status = response.status;
    if (method === 'POST' && malformedPost && response.ok) {
      malformedPost = false;
      const gate = malformedResponseGate; malformedResponseGate = null;
      if (gate?.stage === 'response') { gate.started.resolve(); await gate.promise; }
      const malformed = Response.json({ ownerScope: await ownerIntent.ownerScopeFor(owner) });
      if (gate?.stage === 'json') {
        const readJson = malformed.json.bind(malformed);
        malformed.json = async () => { gate.started.resolve(); await gate.promise; return readJson(); };
      }
      return malformed;
    }
    if (method === 'GET' && malformedGet !== null && response.ok) { const body = malformedGet; malformedGet = null; return Response.json(body); }
    if (method === 'POST' && corruptPost && !response.ok) {
      const body = corruptPost === 'truncated' ? '{"error":' : '{}';
      corruptPost = null;
      return new Response(body, { status: response.status });
    }
    if (method === 'POST' && dropPost && response.ok) {
      dropPost = false;
      throw Error('synthetic response lost after commit');
    }
    if (method === 'GET' && delayedGet) {
      const gate = delayedGet;
      delayedGet = null;
      await gate.promise;
    }
    return response;
  }
  function track(promise, held = false) {
    if (!promise?.then) return promise;
    const task = { promise, held };
    tasks.add(task);
    void promise.then(() => tasks.delete(task), () => tasks.delete(task));
    return promise;
  }
  function trackedFetch(...args) {
    const held = (args[1]?.method ?? 'GET') === 'GET' && delayedGet !== null;
    return track(fetchWallet(...args), held);
  }
  function render() {
    cursor = 0;
    tree = Component();
    effects.splice(0).forEach((f) => f());
  }
  function nodes(node, out = []) {
    if (Array.isArray(node)) node.forEach((v) => nodes(v, out));
    else if (node && typeof node === 'object') {
      out.push(node);
      if (typeof node.type === 'function') nodes(node.type(node.props), out);
      else nodes(node.props?.children, out);
    }
    return out;
  }
  function text(n) {
    return typeof n === 'string' || typeof n === 'number'
      ? String(n)
      : Array.isArray(n)
        ? n.map(text).join('')
        : n && typeof n === 'object'
          ? text(
              typeof n.type === 'function'
                ? n.type(n.props)
                : n.props?.children,
            )
          : '';
  }
  const button = (label) =>
    nodes(tree).find((n) => n.type === 'button' && text(n) === label);
  async function flush({ settle = true } = {}) {
    const deadline = Date.now() + 10000;
    let quiet = 0;
    do {
      // Let the initial effect timer enqueue its actual request. Intentionally
      // deferred GETs remain held so stale-read concurrency tests can advance.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const active = [...tasks].filter((task) => !task.held);
      if (settle && active.length) {
        let timer;
        try {
          await Promise.race([
            Promise.allSettled(active.map((task) => task.promise)),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Wallet operations did not settle')), Math.max(1, deadline - Date.now())); }),
          ]);
        } finally { clearTimeout(timer); }
      }
      if (mounted) render();
      quiet = [...tasks].some((task) => !task.held) ? 0 : quiet + 1;
      assert.ok(Date.now() < deadline, 'Wallet operations settle within the bounded test deadline');
    } while (settle && quiet < 2);
  }
  async function click(label) {
    const b = button(label);
    assert.ok(b, label);
    assert.ok(!b.props.disabled, `${label} enabled`);
    b.props.onClick?.();
    render();
    await flush();
  }
  function input(value) {
    const n = nodes(tree).find(
      (n) => n.type === 'input' && n.props.type === 'number',
    );
    assert.ok(n);
    n.props.onChange({ target: { value } });
    render();
  }
  function submit() {
    const form = nodes(tree).find((n) => n.type === 'form');
    assert.ok(form);
    void form.props.onSubmit({ preventDefault() {} });
  }
  t.after(() => {
    mounted = false;
    slots.forEach((slot) => slot?.cleanup?.());
  });
  render();
  return {
    flush,
    click,
    input,
    submit,
    render,
    requests,
    button,
    routeCall,
    ledger: () => ledger,
    nodes: () => nodes(tree),
    text: () => text(tree),
    incompletePost() { malformedPost = true; },
    holdMalformedResponse(stage) {
      const gate = { ...Promise.withResolvers(), started: Promise.withResolvers(), stage };
      malformedResponseGate = gate;
      return gate;
    },
    incompleteGet(value) { malformedGet = value; },
    drop() {
      dropPost = true;
    },
    reject(status) {
      rejectPost = status;
    },
    corruptNextPostError(format = 'truncated') { corruptPost = format; },
    setOwner(value) {
      owner = value;
    },
    delayGet() {
      const gate = Promise.withResolvers();
      delayedGet = gate;
      return gate;
    },
    blocked: () => navigationBlocked,
    wallet: (user = 'alice') => operations(db, user).wallet(),
    async retry() {
      const b = button('同じ保存内容で結果を確認');
      if (b) await click('同じ保存内容で結果を確認');
      else {
        submit();
        render();
        await flush();
      }
    },
  };
}

for (const view of ['wallet-workspace.tsx', 'revenue-wallet-workspace.tsx']) {
  void test(`${view}: lost committed response retries the same frozen entry once`, async (t) => {
    const h = harness(t, view);
    await h.flush();
    await h.click('売上を記録');
    h.input('24000');
    h.drop();
    h.submit();
    h.render();
    await h.flush();
    assert.equal((await h.wallet()).balance, 24000);
    // Even a stale input event cannot change the already submitted operation.
    h.input('38000');
    assert.equal(h.ledger().amount, '24000');
    await h.retry();
    const posts = h.requests.filter((r) => r.method === 'POST');
    assert.deepEqual(posts[1].input, posts[0].input);
    assert.equal((await h.wallet()).balance, 24000);
    assert.equal((await h.wallet()).records.length, 1);
    assert.ok(!h.blocked());
    assert.equal(h.ledger().pendingSave, null);
  });
  void test(`${view}: same-frame submit sends only one entry`, async (t) => {
    const h = harness(t, view);
    await h.flush();
    await h.click('売上を記録');
    h.input('24000');
    h.submit();
    h.submit();
    h.render();
    await h.flush();
    assert.equal(h.requests.filter((r) => r.method === 'POST').length, 1);
    assert.equal((await h.wallet()).balance, 24000);
  });
}

for (const view of ['wallet-workspace.tsx', 'revenue-wallet-workspace.tsx']) {
  void test(`${view}: a lost reversal response and same-frame reverse remain one reversal`, async (t) => {
    const h = harness(t, view);
    await h.flush();
    await h.click('売上を記録');
    h.input('24000');
    h.submit();
    h.render();
    await h.flush();
    const reverse = h.button('取消');
    assert.ok(reverse && !reverse.props.disabled);
    h.drop();
    reverse.props.onClick();
    reverse.props.onClick();
    h.render();
    await h.flush();
    assert.equal((await h.wallet()).balance, 0);
    assert.equal(h.requests.filter((r) => r.method === 'POST').length, 2);
    assert.ok(h.blocked());
    await h.retry();
    const posts = h.requests.filter((r) => r.method === 'POST');
    assert.deepEqual(posts[2].input, posts[1].input);
    assert.equal((await h.wallet()).records.length, 2);
    assert.equal((await h.wallet()).balance, 0);
    assert.ok(!h.blocked());
    assert.ok(!h.button('取消'));
  });
  void test(`${view}: 401 clears old rows, retains the exact save and rejects another owner`, async (t) => {
    const h = harness(t, view);
    await h.flush();
    await h.click('売上を記録');
    h.input('24000');
    h.drop();
    h.submit();
    h.render();
    await h.flush();
    const original = h.requests.find((r) => r.method === 'POST').input;
    h.reject(401);
    await h.retry();
    assert.equal(h.ledger().snapshot, null);
    assert.equal(h.ledger().ownerScope, null);
    assert.equal(h.ledger().needsSignin, true);
    assert.ok(h.blocked());
    h.setOwner('bob');
    await h.click('サインイン後に接続を確認');
    assert.equal(h.ledger().snapshot.balance, 0);
    assert.equal(h.ledger().snapshot.records.length, 0);
    assert.equal(h.button('同じ保存内容で結果を確認').props.disabled, true);
    const count = h.requests.length;
    await h.ledger().retry();
    h.render();
    assert.equal(
      h.requests.length,
      count,
      'even a stale retry event cannot post to a different owner',
    );
    assert.equal((await h.wallet('bob')).balance, 0);
    assert.match(h.text(), /元のアカウント/);
    h.setOwner('alice');
    await h.click('保存先の接続を確認');
    await h.retry();
    const posts = h.requests.filter((r) => r.method === 'POST');
    assert.deepEqual(posts.at(-1).input, original);
    assert.equal((await h.wallet()).balance, 24000);
    assert.equal((await h.wallet()).records.length, 1);
    assert.ok(!h.blocked());
  });
  void test(`${view}: an old GET cannot erase a newly saved entry`, async (t) => {
    const h = harness(t, view);
    await h.flush();
    await h.click('売上を記録');
    h.input('24000');
    const old = h.delayGet();
    const read = h.ledger().refresh();
    await h.flush();
    h.submit();
    h.render();
    await h.flush();
    assert.equal(h.ledger().snapshot.balance, 24000);
    old.resolve();
    await read;
    await h.flush();
    assert.equal(h.ledger().snapshot.balance, 24000);
    assert.equal(h.ledger().snapshot.records.length, 1);
  });
  void test(`${view}: a stale successful GET cannot restore rows after newer authentication loss`, async (t) => {
    const h = harness(t, view);
    await h.flush();
    await h.click('売上を記録');
    h.input('24000');
    h.submit();
    h.render();
    await h.flush();
    const old = h.delayGet();
    const read = h.ledger().refresh();
    await h.flush();
    h.setOwner(null);
    await h.ledger().refresh();
    await h.flush();
    assert.equal(h.ledger().snapshot, null);
    old.resolve();
    await read;
    await h.flush();
    assert.equal(h.ledger().snapshot, null);
    assert.equal(h.ledger().ownerScope, null);
    assert.ok(h.ledger().needsSignin);
  });
  for (const refusalStatus of [400, 409]) void test(`${view}: parsed ${refusalStatus} refusal keeps editable input without unknown commit`, async (t) => {
    const h = harness(t, view);
    await h.flush();
    await h.click('売上を記録');
    h.input('24000');
    h.reject(refusalStatus);
    h.submit();
    h.render();
    await h.flush();
    assert.equal(h.ledger().amount, '24000');
    assert.equal(h.ledger().formOpen, true);
    assert.equal(h.ledger().pendingSave, null);
    assert.ok(!h.ledger().locked);
    assert.ok(h.blocked(), 'correctable unsent input still needs navigation protection');
    assert.equal((await h.wallet()).balance, 0);
  });
}

void test('Wallet POST owner intent binds the authenticated account before bookkeeping', async (t) => {
  const h = harness(t);
  await h.flush();
  const scope = h.ledger().ownerScope;
  const input = {
    id: crypto.randomUUID(),
    kind: 'revenue',
    amount: 24000,
    source: 'coconala',
    occurredOn: '2026-09-13',
  };
  const changed = await h.routeCall('POST', input, 'bob', {
    [ownerIntent.OWNER_SCOPE_HEADER]: scope,
  });
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).code, ownerIntent.OWNER_CHANGED);
  assert.equal((await h.wallet('bob')).balance, 0);
  const missing = await h.routeCall('POST', input, null, {
    [ownerIntent.OWNER_SCOPE_HEADER]: scope,
  });
  assert.equal(missing.status, 401);
  const malformed = await h.routeCall('POST', input, 'alice', {
    [ownerIntent.OWNER_SCOPE_HEADER]: '',
  });
  assert.equal(malformed.status, 409);
  const saved = await h.routeCall('POST', input, 'alice', {
    [ownerIntent.OWNER_SCOPE_HEADER]: scope,
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).ownerScope, scope);
  const replay = await h.routeCall('POST', input, 'alice');
  assert.equal(replay.status, 200, 'legacy clients remain compatible');
  assert.equal((await h.wallet()).balance, 24000);
  assert.equal((await h.wallet()).records.length, 1);
});

for (const view of ['wallet-workspace.tsx', 'revenue-wallet-workspace.tsx']) {
  for (const format of ['truncated', 'incomplete-envelope']) void test(`${view}: ${format} owner-change response retains the unresolved original operation`, async (t) => {
    const h = harness(t, view);
    await h.flush();
    await h.click('売上を記録');
    h.input('24000');
    h.drop();
    h.submit();
    h.render();
    await h.flush();
    const original = h.requests.find((request) => request.method === 'POST').input;
    h.setOwner('bob');
    h.corruptNextPostError(format);
    await h.retry();
    assert.equal(h.requests.at(-1).status, 409, 'the actual route rejected changed owner before writing');
    assert.ok(h.ledger().pendingSave, 'a truncated response cannot prove the pending operation is resolved');
    assert.ok(h.blocked());
    assert.equal((await h.wallet('alice')).balance, 24000);
    assert.equal((await h.wallet('bob')).balance, 0);
    await h.click('保存先の接続を確認');
    assert.equal(h.button('同じ保存内容で結果を確認').props.disabled, true);
    h.setOwner('alice');
    await h.click('保存先の接続を確認');
    await h.retry();
    assert.deepEqual(h.requests.filter((request) => request.method === 'POST').at(-1).input, original);
    assert.equal((await h.wallet('alice')).records.length, 1);
    assert.equal((await h.wallet('bob')).records.length, 0);
    assert.equal(h.ledger().pendingSave, null);
  });
}

for (const view of ['wallet-workspace.tsx', 'revenue-wallet-workspace.tsx']) {
  for (const uncertain of [false, true]) {
    void test(`${view}: ${uncertain ? 'pending' : 'unsent'} draft is hidden from another owner and restored only for its author`, async (t) => {
      const h = harness(t, view);
      await h.flush();
      await h.click('売上を記録');
      h.input('24000');
      const fields = h.nodes();
      fields.find((node) => node.type === 'select').props.onChange({ target: { value: 'note' } });
      fields.find((node) => node.type === 'input' && node.props.type === 'date').props.onChange({ target: { value: '2026-09-12' } });
      h.render();
      const staleSubmit = h.nodes().find((node) => node.type === 'form').props.onSubmit;
      const staleInput = h.nodes().find((node) => node.type === 'input' && node.props.type === 'number').props.onChange;
      const staleOpen = h.button('売上を記録').props.onClick;
      if (uncertain) {
        h.drop(); h.submit(); h.render(); await h.flush();
        h.reject(401); await h.retry();
        assert.equal(h.nodes().filter((node) => node.type === 'form').length, 0);
      }
      h.setOwner('bob');
      await h.ledger().refresh(); await h.flush();
      assert.equal(h.ledger().snapshot.balance, 0);
      assert.equal(h.nodes().filter((node) => node.type === 'form').length, 0, 'another owner must not receive the old draft form');
      assert.equal(h.nodes().filter((node) => ['input', 'select'].includes(node.type) && ['24000', 'note', '2026-09-12'].includes(node.props.value)).length, 0);
      assert.equal(h.ledger().amount, '', 'raw draft values should not be exposed to either Wallet view');
      if (uncertain) assert.deepEqual(Object.keys(h.ledger().pendingSave), ['ownerScope']);
      const beforePosts = h.requests.filter((request) => request.method === 'POST').length;
      staleInput({ target: { value: '38000' } });
      staleOpen();
      await staleSubmit({ preventDefault() {} });
      h.render(); await h.flush();
      assert.equal(h.requests.filter((request) => request.method === 'POST').length, beforePosts);
      assert.equal((await h.wallet('bob')).records.length, 0);
      h.setOwner('alice');
      await h.ledger().refresh(); await h.flush();
      assert.equal(h.ledger().amount, '24000');
      assert.equal(h.ledger().source, 'note');
      assert.equal(h.ledger().occurredOn, '2026-09-12');
      assert.equal(h.nodes().filter((node) => node.type === 'form').length, 1);
      if (uncertain) await h.retry();
      else { h.submit(); h.render(); await h.flush(); }
      assert.equal((await h.wallet('alice')).records.length, 1);
      assert.equal((await h.wallet('alice')).balance, 24000);
      assert.equal((await h.wallet('bob')).records.length, 0);
    });
  }
}

for (const view of ['wallet-workspace.tsx', 'revenue-wallet-workspace.tsx']) {
  void test(`${view}: unsent draft protects navigation and explicit discard preserves saved records`, async (t) => {
    const h = harness(t, view); await h.flush(); await h.click('売上を記録');
    assert.equal(h.blocked(), false, 'initial form values alone must not trap navigation');
    h.input('24000'); assert.equal(h.blocked(), true);
    h.ledger().setFormOpen(false); h.render();
    assert.equal(h.blocked(), true, 'closing the form keeps a meaningful draft');
    assert.match(h.text(), /未保存の入力があります/);
    await h.click('入力を続ける'); assert.equal(h.ledger().amount, '24000');
    await h.click('未保存の入力を破棄'); assert.equal(h.blocked(), false);
    assert.equal(h.ledger().amount, ''); assert.equal((await h.wallet()).records.length, 0);
    assert.equal(h.requests.filter(request => request.method === 'POST').length, 0);
  });
  void test(`${view}: source/date edits count as meaningful input and reopening retains them`, async (t) => {
    const h = harness(t, view); await h.flush(); await h.click('売上を記録');
    h.ledger().setSource('note'); h.ledger().setOccurredOn('2026-09-12'); h.render();
    assert.equal(h.blocked(), true);
    h.ledger().setFormOpen(false); h.render(); await h.click('売上を記録');
    assert.equal(h.ledger().source, 'note'); assert.equal(h.ledger().occurredOn, '2026-09-12');
    await h.click('未保存の入力を破棄'); assert.equal(h.blocked(), false);
  });
  void test(`${view}: hidden or unresolved input cannot be discarded by stale actions`, async (t) => {
    const h = harness(t, view); await h.flush(); await h.click('売上を記録'); h.input('24000');
    const staleDiscard = h.ledger().discardDraft;
    h.setOwner('bob'); await h.ledger().refresh(); await h.flush();
    staleDiscard(); h.render(); assert.equal(h.blocked(), true); assert.equal(h.ledger().hasHiddenDraft, true);
    assert.equal(h.button('未保存の入力を破棄'), undefined);
    h.setOwner('alice'); await h.ledger().refresh(); await h.flush();
    assert.equal(h.ledger().amount, '24000');
    h.drop(); h.submit(); h.render(); await h.flush();
    staleDiscard(); h.render(); assert.ok(h.ledger().pendingSave); assert.equal(h.ledger().amount, '24000');
    assert.equal(h.button('未保存の入力を破棄'), undefined);
    await h.retry(); assert.equal((await h.wallet()).records.length, 1); assert.equal(h.blocked(), false);
  });
  void test(`${view}: incomplete successful save keeps the original ID and prevents a view crash`, async (t) => {
    const h = harness(t, view); await h.flush(); await h.click('売上を記録'); h.input('24000');
    h.incompletePost(); h.submit(); h.render();
    await assert.doesNotReject(() => h.flush());
    assert.ok(h.ledger().pendingSave); assert.equal(h.ledger().amount, '24000'); assert.equal(h.blocked(), true);
    const first = h.requests.find(request => request.method === 'POST').input;
    await h.retry(); assert.deepEqual(h.requests.filter(request => request.method === 'POST').at(-1).input, first);
    assert.equal((await h.wallet()).records.length, 1); assert.equal(h.ledger().pendingSave, null);
  });
  void test(`${view}: malformed reads hide unconfirmed private data; legacy ownerless reads cannot authorize writes`, async (t) => {
    const h = harness(t, view); await h.flush();
    const original = h.ledger().snapshot;
    h.incompleteGet({ ownerScope: original.ownerScope }); await h.ledger().refresh(); await h.flush();
    assert.equal(h.ledger().snapshot, null); assert.equal(h.ledger().ownerScope, null);
    assert.match(h.text(), /応答を確認できませんでした/);
    h.setOwner('bob'); h.incompleteGet({ ownerScope: await ownerIntent.ownerScopeFor('bob') });
    await h.ledger().refresh(); await h.flush();
    assert.equal(h.ledger().snapshot, null, 'an incomplete changed-owner read cannot keep prior private rows visible');
    assert.equal(h.ledger().ownerScope, null);
    h.setOwner('alice'); await h.ledger().refresh(); await h.flush();
    const { ownerScope: _ownerScope, ...legacy } = original;
    h.incompleteGet(legacy); await h.ledger().refresh(); await h.flush();
    assert.equal(h.ledger().ownerScope, null); assert.equal(h.ledger().locked, true);
    assert.equal(h.button('売上を記録').props.disabled, true);
  });
  void test(`${view}: ownerless malformed read hides prior records and retains draft only for its author`, async (t) => {
    const h = harness(t, view); await h.flush(); await h.click('売上を記録');
    h.input('24000'); h.submit(); h.render(); await h.flush();
    await h.click('売上を記録'); h.input('800');
    h.setOwner('bob'); h.incompleteGet({}); await h.ledger().refresh(); await h.flush();
    assert.equal(h.ledger().snapshot, null); assert.equal(h.ledger().ownerScope, null);
    assert.equal(h.ledger().amount, ''); assert.equal(h.ledger().hasHiddenDraft, true);
    assert.equal(h.blocked(), true); assert.equal(h.button('未保存の入力を破棄'), undefined);
    await h.ledger().refresh(); await h.flush();
    assert.equal(h.ledger().snapshot.records.length, 0); assert.equal(h.ledger().amount, '');
    h.setOwner('alice'); await h.ledger().refresh(); await h.flush();
    assert.equal(h.ledger().snapshot.records.length, 1); assert.equal(h.ledger().amount, '800');
  });
  void test(`${view}: stale setters cannot change a submitted draft before or after response loss`, async (t) => {
    const h = harness(t, view); await h.flush(); await h.click('売上を記録'); h.input('24000');
    h.ledger().setSource('note'); h.ledger().setOccurredOn('2026-09-12'); h.render();
    const stale = h.ledger(); h.drop(); h.submit();
    stale.setAmount('38000'); stale.setSource('other'); stale.setOccurredOn('2026-09-13');
    h.render(); assert.equal(h.ledger().amount, '24000'); await h.flush();
    stale.setAmount('48000'); stale.setSource('other'); stale.setOccurredOn('2026-09-14'); h.render();
    assert.equal(h.ledger().amount, '24000'); assert.equal(h.ledger().source, 'note');
    assert.equal(h.ledger().occurredOn, '2026-09-12');
    await h.retry();
    const records = (await h.wallet()).records;
    assert.equal(records.length, 1); assert.equal(records[0].amount, 24000);
    assert.equal(records[0].source, 'note'); assert.equal(records[0].occurredOn, '2026-09-12');
  });
  void test(`${view}: empty old-owner form does not block new owner, but stale old handlers cannot edit its draft`, async (t) => {
    const h = harness(t, view); await h.flush(); await h.click('売上を記録');
    const old = h.ledger(); assert.equal(h.blocked(), false);
    h.setOwner('bob'); await h.ledger().refresh(); await h.flush();
    assert.equal(h.ledger().locked, false); await h.click('経費を記録'); h.input('800');
    old.setAmount('24000'); old.setSource('note'); old.openForm('revenue'); old.discardDraft(); h.render();
    assert.equal(h.ledger().amount, '800'); assert.equal(h.ledger().kind, 'expense'); assert.equal(h.ledger().source, 'api');
    h.submit(); h.render(); await h.flush(); assert.equal((await h.wallet('bob')).balance, -800);
    assert.equal((await h.wallet('alice')).records.length, 0);
  });
}


for (const stage of ['response', 'json']) void test(`Wallet flush waits for ${stage} completion and the full save finalizer, not timer turns`, async (t) => {
  const h = harness(t, 'revenue-wallet-workspace.tsx');
  await h.flush(); await h.click('売上を記録'); h.input('24000');
  const gate = h.holdMalformedResponse(stage);
  h.incompletePost(); h.submit(); h.render();
  await gate.started.promise;
  assert.equal((await h.wallet()).records.length, 1, 'actual SQLite write committed before the response gate');
  let flushed = false;
  const flushing = h.flush().then(() => { flushed = true; });
  try {
    // Deliberately advance beyond the previous eight-turn flush without
    // completing the response: busy must remain true and flush must wait.
    for (let turn = 0; turn < 12; turn++) await h.flush({ settle: false });
    assert.equal(h.button('同じ保存内容で結果を確認').props.disabled, true);
    assert.equal(flushed, false, 'flush must not report completion while the actual save promise is pending');
  } finally { gate.resolve(); await flushing; }
  assert.equal(h.button('同じ保存内容で結果を確認').props.disabled, false, 'full response validation and finally have finished');
  const original = h.requests.find((request) => request.method === 'POST').input;
  await h.retry();
  assert.deepEqual(h.requests.filter((request) => request.method === 'POST').at(-1).input, original);
  assert.equal((await h.wallet()).records.length, 1);
  assert.equal(h.ledger().pendingSave, null);
});
