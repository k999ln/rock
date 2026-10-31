import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function harness(initialView, communities = []) {
  const state = [], refs = [];
  let cursor = 0, refCursor = 0;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const mockReact = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = index === 0
        ? { profile: { id: 'fixture', name: 'Fixture' }, communities, posts: initialView === 'communities' ? [{ id: 'global-post-must-not-render', community: null }] : [], cursor: null }
        : typeof initial === 'function' ? initial() : initial;
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
    },
    useRef(initial) { return refs[refCursor++] ??= { current: initial }; },
    useEffect() {}, useCallback: fn => fn,
  };
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const exports = {};
    cache.set(path, exports);
    const code = ts.transpileModule(read(path), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    runInNewContext(code, { exports, URL, URLSearchParams, crypto, require(name) {
      if (name === 'react') return mockReact;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'next/link') return { default: 'a' };
      if (name === 'next/navigation') return { useRouter: () => ({ push() {} }) };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      if (name.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name === './sky-community-directory') return load('components/sky-community-directory.tsx');
      if (name === '@/lib/use-sky-hub') return { useSkyHub: () => ({ plugins: [], async save() {} }) };
      if (name === './use-sky-continuous-feed') return { useSkyContinuousFeed: () => ({ items: [], hasMore: false, topic: 'all', restart() {}, chooseTopic() {} }) };
      if (name === './use-sky-feed-reveal') return { useSkyFeedReveal() {} };
      return new Proxy({ default: () => null }, { get: (target, key) => target[key] ?? (() => null) });
    } });
    return exports;
  }
  const Component = load('components/sky-social-timeline.tsx').default;
  function expand(node) {
    if (Array.isArray(node)) return node.flatMap(expand);
    if (!node || typeof node !== 'object') return [node];
    if (node.props?.hidden) return [];
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return [{ ...node, props: { ...node.props, children: expand(node.props.children) } }];
  }
  function render() {
    cursor = refCursor = 0;
    return expand(Component({ initialView, fullHome: true, externalFeed: jsx('external-feed', {}) }));
  }
  return { render };
}
function nodes(tree) {
  return tree.flatMap(node => node && typeof node === 'object' ? [node, ...nodes(node.props.children ?? [])] : []);
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  return node && typeof node === 'object' ? text(node.props.children) : node == null || typeof node === 'boolean' ? '' : String(node);
}
const community = { id: 'community-fixture', name: '工房', description: '仲間の場所', members: 2, owned: true, unlocked: true, member: true, visibility: 'members' };

void test('community tab starts with the directory and never renders the global timeline or external feed', () => {
  const view = harness('communities', [community]).render();
  assert.ok(nodes(view).some(node => node.props['aria-label'] === 'コミュニティーの一覧'));
  assert.match(text(view), /あなたのコミュニティー/);
  assert.match(text(view), /招待鍵で参加する/);
  assert.equal(nodes(view).some(node => node.props.role === 'feed' || node.type === 'external-feed'), false);
  assert.equal(nodes(view).some(node => node.props['aria-label'] === 'タイムラインの切替'), false);
});
void test('selecting a community opens its own feed and the back button restores the directory', () => {
  const app = harness('communities', [community]);
  const card = nodes(app.render()).find(node => node.props['aria-label'] === '工房を開く');
  card.props.onClick();
  let view = app.render();
  assert.ok(nodes(view).some(node => node.props.role === 'feed' && node.props['aria-label'] === '工房の投稿'));
  assert.equal(nodes(view).some(node => node.type === 'external-feed'), false);
  nodes(view).find(node => node.props['aria-label'] === 'コミュニティーの一覧に戻る').props.onClick();
  view = app.render();
  assert.ok(nodes(view).some(node => node.props['aria-label'] === 'コミュニティーの一覧'));
  assert.equal(nodes(view).some(node => node.props.role === 'feed'), false);
});
void test('directory creation and invitation controls open existing forms without submitting anything', () => {
  const app = harness('communities');
  nodes(app.render()).find(node => node.type === 'button' && text(node) === 'コミュニティーを作る').props.onClick();
  assert.ok(nodes(app.render()).some(node => node.type === 'form' && text(node).includes('新しいコミュニティー')));
  nodes(app.render()).find(node => node.type === 'button' && text(node) === '招待鍵で参加する').props.onClick();
  assert.ok(nodes(app.render()).some(node => node.type === 'details' && node.props.open && text(node).includes('受け取った招待鍵')));
});
void test('OS home preserves the timeline and shared header while adding environment shortcuts', () => {
  const view = harness('home').render();
  assert.ok(nodes(view).some(node => node.props['aria-label'] === 'タイムラインの切替'));
  assert.equal(nodes(view).some(node => node.props['aria-label'] === 'コミュニティーの一覧'), false);
  const home = read('components/home-screen.tsx'), css = read('app/os-shell.css');
  assert.doesNotMatch(home, /<OsAccountAccess|fetch\('\/api\/work-jobs'/);
  assert.match(home, /<OSHeader title="smis"/);
  assert.match(home, /aria-label="自分の環境"/);
  assert.match(home, /aria-label="仕事の主な操作"/);
  assert.match(css, /\.os-header-row\s*\{\s*display:\s*flex/);
  assert.match(css, /\.os-header-actions\s*\{\s*display:\s*flex/);
  assert.match(read('components/home-screen.module.css'), /\.home \.layout\s*\{\s*display:\s*block/);
});
void test('returning from bookmarks restores the timeline without discarding a draft', () => {
  const app = harness('bookmarks');
  let view = app.render();
  const input = nodes(view).find(node => node.type === 'textarea' && node.props.id === 'sky-post');
  assert.ok(input);
  input.props.onChange({ target: { value: '未送信の下書き' } });
  view = app.render();
  const back = nodes(view).find(node => node.type === 'button' && text(node).includes('タイムラインに戻る'));
  assert.ok(back);
  back.props.onClick();
  view = app.render();
  assert.equal(nodes(view).find(node => node.type === 'textarea' && node.props.id === 'sky-post').props.value, '未送信の下書き');
  assert.equal(nodes(view).find(node => node.props.role === 'tab' && text(node) === 'あなたへ').props['aria-selected'], true);
});
void test('the all posts option exits bookmarks as well as the settings panel', () => {
  const app = harness('home');
  let view = app.render();
  nodes(view).find(node => node.props['aria-label'] === 'タイムラインの設定とコミュニティー').props.onClick();
  view = app.render();
  nodes(view).find(node => node.type === 'button' && text(node).trim() === 'ブックマーク').props.onClick();
  view = app.render();
  assert.ok(nodes(view).some(node => node.type === 'button' && text(node).includes('タイムラインに戻る')));
  nodes(view).find(node => node.props['aria-label'] === 'タイムラインの設定とコミュニティー').props.onClick();
  view = app.render();
  nodes(view).find(node => node.type === 'button' && text(node).trim() === 'すべての投稿').props.onClick();
  view = app.render();
  assert.equal(nodes(view).find(node => node.props.role === 'tab' && text(node) === 'あなたへ').props['aria-selected'], true);
  assert.equal(nodes(view).some(node => node.props['aria-label'] === '設定を閉じる'), false);
});
