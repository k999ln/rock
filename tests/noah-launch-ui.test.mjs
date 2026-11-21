import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(
  readFileSync(
    new URL('../components/noah-launch.tsx', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const jsx = (type, props) => ({ type, props });
function nodes(tree) {
  return Array.isArray(tree)
    ? tree.flatMap(nodes)
    : tree && typeof tree === 'object'
      ? [tree, ...nodes(tree.props?.children)]
      : [];
}
function text(tree) {
  return Array.isArray(tree)
    ? tree.map(text).join('')
    : tree && typeof tree === 'object'
      ? text(tree.props?.children)
      : typeof tree === 'string'
        ? tree
        : '';
}
function harness(reply, activity = false, props) {
  const calls = [],
    slots = [],
    effects = [],
    exports = {};
  let cursor = 0,
    tree,
    tick;
  runInNewContext(code, {
    exports,
    Error,
    AbortController,
    URLSearchParams,
    encodeURIComponent,
    document: {
      hidden: false,
      addEventListener() {},
      removeEventListener() {},
    },
    setInterval(fn) {
      tick = fn;
      return 1;
    },
    clearInterval() {},
    fetch: async (url, options) => {
      calls.push({ url, options });
      return url.includes('public=1')
        ? Response.json({ agents: [] })
        : reply(url, options);
    },
    require(id) {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'next/link') return { default: 'a' };
      if (id === 'next/navigation')
        return {
          useSearchParams: () =>
            new URLSearchParams(activity ? '' : 'agent=anicca'),
        };
      if (id.endsWith('.module.css')) return { default: {} };
      if (id === 'react')
        return {
          useCallback: (fn) => fn,
          useState(initial) {
            const i = cursor++;
            slots[i] ??= { value: initial };
            return [
              slots[i].value,
              (v) => {
                slots[i].value =
                  typeof v === 'function' ? v(slots[i].value) : v;
              },
            ];
          },
          useEffect(fn) {
            const i = cursor++;
            if (!slots[i]) {
              slots[i] = {};
              effects.push(() => {
                slots[i].cleanup = fn();
              });
            }
          },
        };
      throw Error(id);
    },
  });
  const render = () => {
    cursor = 0;
    tree = exports.default(props);
    effects.splice(0).forEach((fn) => fn());
  };
  render();
  return {
    calls,
    get tree() {
      return tree;
    },
    get nodes() {
      return nodes(tree);
    },
    async flush() {
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setImmediate(r));
        render();
      }
    },
    async poll() {
      tick();
      await this.flush();
    },
    close() {
      slots.forEach((s) => s.cleanup?.());
    },
  };
}
const empty = {
  ownerScope: 'fixture',
  devices: [],
  commands: [],
  uploadedAgents: [],
  jobs: [],
};
void test('failed refresh clears stale connection state, distinguishes failure from empty, and retry recovers', async (t) => {
  let response = Response.json(empty);
  const h = harness(() => response.clone());
  t.after(() => h.close());
  await h.flush();
  assert.match(text(h.tree), /まだ登録していません/);
  assert.match(text(h.tree), /まだ仕事はありません/);
  response = Response.json({ error: 'Synthetic offline' }, { status: 503 });
  await h.poll();
  assert.match(text(h.tree), /接続情報を読み込めませんでした/);
  assert.doesNotMatch(
    text(h.tree),
    /まだ登録していません|まだ仕事はありません/,
  );
  assert.equal(
    h.nodes.find((n) => n.type === 'button' && text(n) === 'このAgentをつなぐ')
      .props.disabled,
    true,
  );
  response = Response.json(empty);
  h.nodes
    .find((n) => n.type === 'button' && text(n) === '接続情報を再読み込み')
    .props.onClick();
  await h.flush();
  assert.doesNotMatch(
    text(h.tree),
    /Synthetic offline|接続情報を読み込めませんでした/,
  );
  assert.match(text(h.tree), /まだ仕事はありません/);
});
void test('initial load and signed-out state are not empty results and sign-in preserves the Agent', async (t) => {
  const h = harness(() =>
    Response.json({ error: 'unauthorized' }, { status: 401 }),
  );
  t.after(() => h.close());
  assert.match(text(h.tree), /接続情報を読み込んでいます/);
  assert.doesNotMatch(
    text(h.tree),
    /まだ登録していません|まだ仕事はありません/,
  );
  await h.flush();
  const link = h.nodes.find((n) => n.type === 'a' && text(n) === 'サインイン');
  assert.equal(
    new URL(link.props.href, 'https://example.test').searchParams.get(
      'returnTo',
    ),
    '/noah/activity?agent=anicca#library',
  );
  assert.doesNotMatch(
    text(h.tree),
    /まだ登録していません|まだ仕事はありません|読み込んでいます/,
  );
});

void test('connection steps follow the user action order and Mac setup preserves the selected Agent', async (t) => {
  const h = harness(() => Response.json(empty));
  t.after(() => h.close());
  await h.flush();
  const value = text(h.tree);
  assert.ok(value.indexOf('1. Agentを選ぶ') < value.indexOf('2. Macをつなぐ'));
  const link = h.nodes.find((n) => n.type === 'a' && text(n) === 'Macをつなぐ');
  assert.equal(link.props.href, '/noah/mac?agent=anicca');
});

void test('activity view polls actual execution, shares owner-scoped stop, and shows the returned result without HTML execution', async (t) => {
  const command = {
    id: 'run-fixture',
    deviceId: 'mac-fixture',
    kind: 'run',
    state: 'claimed',
    stopRequested: false,
    currentBoot: true,
    agent: { agentId: 'anicca', name: 'Test Agent' },
  };
  let data = { ...empty, commands: [command] };
  const h = harness((_url, options) => {
    if (options?.method === 'POST') return Response.json({});
    return Response.json(data);
  }, true);
  t.after(() => h.close());
  await h.flush();
  assert.match(text(h.tree), /実行中のAgent/);

  assert.ok(!h.nodes.some((n) => n.type === 'select'));
  h.nodes
    .find((n) => n.type === 'button' && text(n) === '仕事を停止')
    .props.onClick();
  await h.flush();
  const request = h.calls.find((c) => c.options?.method === 'POST');
  assert.equal(request.options.headers['X-Rock-Owner-Scope'], 'fixture');
  assert.deepEqual(JSON.parse(request.options.body), {
    action: 'stop',
    id: 'run-fixture',
  });
  data = {
    ...empty,
    commands: [{ ...command, state: 'succeeded' }],
    jobs: [
      {
        id: 'run-fixture',
        noahExecution: {
          state: 'returned',
          result: {
            text: '<script>window.location="https://example.test"</script>',
            files: [],
          },
        },
      },
    ],
  };
  await h.poll();
  assert.match(text(h.tree), /届いた成果/);
  assert.ok(
    h.nodes.some((n) => n.type === 'pre' && text(n).startsWith('<script>')),
  );
  assert.ok(
    !h.nodes.some(
      (n) =>
        n.type === 'script' ||
        n.type === 'iframe' ||
        n.props?.dangerouslySetInnerHTML,
    ),
  );
  assert.ok(
    !h.nodes.some((n) => n.type === 'button' && text(n) === '仕事を停止'),
  );
});
void test('activity sign-in returns to the execution page', async (t) => {
  const h = harness(() => Response.json({}, { status: 401 }), true);
  t.after(() => h.close());
  await h.flush();
  const link = h.nodes.find((n) => n.type === 'a' && text(n) === 'サインイン');
  assert.equal(
    new URL(link.props.href, 'https://example.test').searchParams.get(
      'returnTo',
    ),
    '/noah/activity',
  );
});

void test('request form opens inside activity and can be closed without leaving results', async (t) => {
  const h = harness(() => Response.json(empty), true);
  t.after(() => h.close());
  await h.flush();
  assert.ok(!h.nodes.some((n) => n.type === 'select'));
  h.nodes
    .find((n) => n.type === 'button' && text(n) === '仕事を頼む')
    .props.onClick();
  await h.flush();
  assert.ok(h.nodes.some((n) => n.type === 'select'));
  assert.match(text(h.tree), /仕事と成果/);
  h.nodes
    .find((n) => n.type === 'button' && text(n) === '依頼入力を閉じる')
    .props.onClick();
  await h.flush();
  assert.ok(!h.nodes.some((n) => n.type === 'select'));
});

void test('retired launch page redirects valid Agent selection into the unified page', async () => {
  const source = ts.transpileModule(
    readFileSync(
      new URL('../app/noah/launch/page.tsx', import.meta.url),
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  for (const [agent, expected] of [
    ['anicca', '/noah/activity?agent=anicca'],
    [undefined, '/noah/activity?compose=1'],
    ['https://example.test', '/noah/activity?compose=1'],
  ]) {
    const exports = {};
    let destination;
    runInNewContext(source, {
      exports,
      URLSearchParams,
      require: (id) => {
        assert.equal(id, 'next/navigation');
        return {
          redirect: (value) => {
            destination = value;
          },
        };
      },
    });
    await exports.default({ searchParams: Promise.resolve({ agent }) });
    assert.equal(destination, expected);
  }
});

void test('a saved Mac work link reads and stops only the selected run', async () => {
  const id = '8f0e3ada-2339-40d0-acde-de6f674477d3';
  const command = {
    id,
    kind: 'run',
    state: 'claimed',
    agent: { name: '試験Agent' },
  };
  const ui = harness(
    (url, options) => {
      if (options?.method === 'POST') {
        assert.equal(url, '/api/noah/launch');
        assert.deepEqual(JSON.parse(options.body), { action: 'stop', id });
        assert.equal(options.headers['X-Rock-Owner-Scope'], 'fixture');
        command.stopRequested = true;
        return Response.json({});
      }
      assert.equal(url, '/api/noah/launch?work=' + id);
      return Response.json({
        ownerScope: 'fixture',
        commands: [command],
        jobs: [],
      });
    },
    true,
    { workId: id },
  );
  try {
    await ui.flush();
    assert.match(text(ui.tree), /仕事の詳細/);
    assert.doesNotMatch(text(ui.tree), /仕事を頼む/);
    const stop = ui.nodes.find(
      (n) => n.type === 'button' && text(n) === '仕事を停止',
    );
    assert.ok(stop);
    await stop.props.onClick();
    await ui.flush();
    assert.match(text(ui.tree), /停止要求を送信済み/);
    assert.equal(
      ui.calls.some((c) => c.url.includes('public=1')),
      false,
    );
  } finally {
    ui.close();
  }
});

void test('a work detail clears the previous result on sign-out and returns to that job after login', async () => {
  const id = 'c39b709f-0f41-4c6c-be71-2ed81a9ddfa7';
  let signedIn = true;
  const ui = harness(
    () =>
      signedIn
        ? Response.json({
            ownerScope: 'fixture',
            commands: [
              {
                id,
                kind: 'run',
                state: 'succeeded',
                agent: { name: '試験Agent' },
              },
            ],
            jobs: [
              {
                id,
                noahExecution: {
                  result: { text: '本人の試験成果', files: [] },
                },
              },
            ],
          })
        : Response.json({}, { status: 401 }),
    true,
    { workId: id },
  );
  try {
    await ui.flush();
    assert.match(text(ui.tree), /本人の試験成果/);
    signedIn = false;
    await ui.poll();
    assert.doesNotMatch(text(ui.tree), /本人の試験成果/);
    const signIn = ui.nodes.find(
      (n) => n.type === 'a' && n.props.href.startsWith('/noah/account?'),
    );
    assert.equal(
      new URL(signIn.props.href, 'https://example.test').searchParams.get(
        'returnTo',
      ),
      '/noah/work/' + id,
    );
  } finally {
    ui.close();
  }
});
