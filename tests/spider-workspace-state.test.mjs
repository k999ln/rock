import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(`${root}/package.json`);
const ts = require('typescript');
const detector = await import(
  pathToFileURL(`${root}/toolkits/spider-guard/program-inspector.mjs`)
);
const workflow = await import(pathToFileURL(`${root}/lib/spider-workflow.ts`));
const compiled = ts.transpileModule(
  readFileSync(`${root}/components/spider-workspace.tsx`, 'utf8').replace(
    'import.meta.url',
    JSON.stringify(
      pathToFileURL(`${root}/components/spider-workspace.tsx`).href,
    ),
  ),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  },
).outputText;
function harness() {
  const slots = [],
    workers = [],
    effects = [],
    timers = new Map();
  let cursor = 0,
    first = true,
    tree;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (first) slots[i] = initial;
      return [
        slots[i],
        (v) => {
          slots[i] = typeof v === 'function' ? v(slots[i]) : v;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      if (first) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect(fn) {
      cursor++;
      if (first) effects.push(fn);
    },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  class Worker {
    constructor() {
      workers.push(this);
    }
    postMessage(data) {
      this.data = data;
    }
    terminate() {
      this.terminated = true;
    }
    deliver() {
      this.onmessage({
        data: {
          id: this.data.id,
          report: detector.inspectProgram(this.data.source, {
            language: this.data.language,
          }),
        },
      });
    }
  }
  runInNewContext(compiled, {
    exports,
    require: (id) => {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === '@/toolkits/spider-guard/program-inspector.mjs')
        return detector;
      if (id === '@/lib/spider-workflow') return workflow;
      if (id === 'lucide-react')
        return new Proxy({}, { get: () => () => null });
      if (id.endsWith('.module.css')) return {};
      throw Error(id);
    },
    Worker,
    TextEncoder,
    TextDecoder,
    URL,
    crypto,
    performance,
    setTimeout: (fn) => {
      const id = timers.size + 1;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  function render() {
    cursor = 0;
    tree = exports.default();
    if (first) {
      first = false;
      for (const fn of effects) fn();
    }
    return tree;
  }
  function nodes(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) {
      for (const n of node) nodes(n, out);
      return out;
    }
    out.push(node);
    nodes(node.props?.children, out);
    return out;
  }
  function text(node) {
    if (typeof node === 'string' || typeof node === 'number')
      return String(node);
    if (Array.isArray(node)) return node.map(text).join('');
    return node && typeof node === 'object' ? text(node.props?.children) : '';
  }
  function find(type, label) {
    return nodes(tree).find(
      (n) => n.type === type && (!label || text(n).includes(label)),
    );
  }
  function button(label) {
    const n = find('button', label);
    assert.ok(n, `button ${label}`);
    n.props.onClick();
    render();
  }
  function fill(value) {
    find('textarea').props.onChange({ target: { value } });
    render();
  }
  async function file(content, name = 'fixture.py') {
    const bytes = new TextEncoder().encode(content);
    find('input').props.onChange({
      target: {
        files: [
          { name, size: bytes.length, arrayBuffer: async () => bytes.buffer },
        ],
        value: name,
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    render();
  }
  render();
  return { render, find, button, fill, file, workers, text: () => text(tree) };
}
void test('SPIDER editing invalidates a running Worker and ignores its late result', () => {
  const h = harness();
  h.fill('eval(input)');
  h.button('検査する');
  const stale = h.workers[0];
  h.fill('const clean = 42');
  stale.deliver();
  h.render();
  assert.equal(h.find('button', '値を含まないレポート'), undefined);
  assert.equal(stale.terminated, true);
});

void test('SPIDER stopped Worker cannot restore a result or download', () => {
  const h = harness();
  h.fill('eval(input)');
  h.button('検査する');
  h.button('停止');
  h.workers[0].deliver();
  h.render();
  assert.match(h.text(), /検査を停止しました/);
  assert.equal(h.find('button', '値を含まないレポート'), undefined);
});

for (const [name, newline] of [
  ['LF', '\n'],
  ['CRLF', '\r\n'],
  ['CR', '\r'],
]) {
  void test(`SPIDER ${name} file findings select the correct textarea line`, async () => {
    const h = harness();
    await h.file(
      ['# synthetic', 'value = 1', 'eval(user_input)'].join(newline),
    );
    h.button('検査する');
    h.workers[0].deliver();
    h.render();
    let selection;
    // HTML textareas normalize CRLF and CR to LF, even when their assigned value does not.
    const browserValue = h.find('textarea').props.value.replace(/\r\n?/g, '\n');
    h.find('textarea').props.ref.current = {
      focus() {},
      setSelectionRange(start, end) {
        selection = browserValue.slice(start, end);
      },
    };
    h.button('3行目を見る');
    assert.equal(selection, 'eval(user_input)');
  });
}
