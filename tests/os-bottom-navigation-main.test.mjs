import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { skyAgentEvePath } from '../lib/sky-agent-library.ts';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const jsx = (type, props) => ({ type, props });
const icons = new Proxy({}, { get: (_target, name) => String(name) });
const css = { default: new Proxy({}, { get: (_target, name) => String(name) }) };
const staticReact = { useEffect() {}, useState: value => [typeof value === 'function' ? value() : value, () => {}] };
function compile(path, modules, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(source(path), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  runInNewContext(code, { exports, ...globals, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'next/link') return { default: 'a' };
    if (name === 'next/image') return { default: 'img' };
    if (name === 'lucide-react') return icons;
    if (name.endsWith('.css')) return css;
    assert.ok(name in modules, `unmapped ${path}: ${name}`); return modules[name];
  } });
  return exports;
}
function nodes(value, found = []) {
  if (Array.isArray(value)) value.forEach(v => nodes(v, found));
  else if (value && typeof value === 'object') { found.push(value); nodes(value.props?.children, found); }
  return found;
}
function text(value) {
  if (value == null || typeof value === 'boolean') return '';
  if (typeof value !== 'object') return String(value);
  return Array.isArray(value) ? value.map(text).join('') : text(value.props?.children);
}
async function navigation(react = staticReact, pathname = '/', globals = {}) {
  const contract = await import('../lib/os-navigation.ts');
  return compile('components/os-app-navigation.tsx', {
    react, 'next/navigation': { usePathname: () => pathname }, '@/lib/os-navigation': contract,
  }, globals).default;
}
void test('main navigation keeps three real routes in every runtime and leaves saved Agent queries intact', async () => {
  const { osNavigationItems, activeOsNavigation } = await import('../lib/os-navigation.ts');
  assert.deepEqual(osNavigationItems.map(i => [i.id, i.label, i.href]), [
    ['stream', 'Smith', '/#timeline'], ['eve', 'Eve', '/chat'], ['communities', 'コミュニティー', '/#communities'],
  ]);
  for (const path of ['/', '/os']) {
    assert.equal(activeOsNavigation(path, '#catalog'), 'stream');
    assert.equal(activeOsNavigation(path, '#communities'), 'communities');
    assert.equal(activeOsNavigation(path, '#community=fixture'), 'communities');
  }
  assert.equal(activeOsNavigation('/chat'), 'eve');
  assert.equal(activeOsNavigation('/os/eve/remix'), 'eve');
  assert.equal(activeOsNavigation('/sky/agents'), 'stream');
  assert.equal(activeOsNavigation('/os/sky/agents'), 'stream');
  assert.equal(activeOsNavigation('/settings'), null);
  const saved = skyAgentEvePath({ id: 'fixture.agent', revision: 7, sourceTool: 'rockstar-csv-cleanup' });
  const url = new URL(saved, 'https://avoado.si');
  assert.equal(url.pathname, '/chat'); assert.equal(url.searchParams.get('agent'), 'fixture.agent');
  assert.equal(url.searchParams.get('agentRevision'), '7'); assert.equal(url.searchParams.get('tool'), 'rockstar-csv-cleanup');
  assert.doesNotMatch(source('lib/os-navigation.ts'), /NODE_ENV|sky-manage|osRouteHref/);
});
void test('actual main Home replaces its mobile block once and preserves discovery, Agent and optional-feature menus', async () => {
  const Nav = await navigation();
  const Home = compile('components/home-screen.tsx', {
    react: staticReact,
    './os-app-navigation': { default: Nav },
    './sky-social-timeline': { default: 'timeline' }, './sky-discovery-feed': { default: 'discovery' },
    './sky-x-account': { default: 'x-timeline', SkyXAccountConnection: 'x-account' },
    './sky-public-x-timeline': { default: 'public-x' },
    './sky-timeline-connector': { useTimelineConnector: () => ({}), SkyTimelineConnector: 'connector', SkyMcpTimeline: 'mcp' },
    './sky-information-market': { SkyNewsConnections: 'news' },
    '@/lib/use-sky-features': { useSkyFeatures: () => ({ enabled: () => false }) },
  }).default;
  const tree = Home(), all = nodes(tree), mounted = all.filter(n => n.type === Nav);
  assert.equal(mounted.length, 1); assert.equal(tree.props['data-os-bottom-navigation-host'], 'home');
  assert.equal(all.filter(n => n.type === 'nav' && n.props['aria-label'] === 'モバイルメニュー').length, 0);
  assert.ok(all.some(n => n.type === 'timeline' && n.props.fullHome));
  for (const href of ['/#catalog', '/sky/agents', '/#bookmarks', '/#optional-features', '/settings', '/connect'])
    assert.ok(all.some(n => n.type === 'a' && n.props.href === href), href);
  assert.ok(!all.some(n => n.type === 'a' && ['/wallet', '/market'].includes(n.props.href)));
});
void test('actual shell mounts once inside its existing running guard without changing auth children', async () => {
  const Nav = await navigation(); class Element { closest() { return this; } }
  const Shell = compile('components/workspace-shell.tsx', {
    react: staticReact, '@/lib/device': { monitorDevice() {} }, '@/lib/product-identity': { PRODUCT_RELEASE_NAME: 'RockstarOS 1.0' },
    './os-app-navigation': { default: Nav },
  }, { Element }).default;
  const child = { type: 'private-fixture', props: { children: 'child supplied by existing auth boundary' } };
  for (const running of [false, true]) {
    const tree = Shell({ title: 'Fixture', children: child, running, hideTopActions: true });
    const all = nodes(tree), nav = all.filter(n => n.type === Nav);
    assert.equal(nav.length, 1); assert.equal(nav[0].props.running, running);
    assert.equal(tree.props['data-os-bottom-navigation-host'], 'workspace'); assert.ok(all.includes(child));
    assert.ok(all.some(n => n.type === 'a' && n.props.className === 'rock-home-link'));
    let prevented = false; tree.props.onClickCapture({ target: new Element(), preventDefault() { prevented = true; } });
    assert.equal(prevented, running);
  }
  // Hidden parent remains the existing admission mechanism; nav has no independent portal/global mount.
  assert.doesNotMatch(source('components/os-app-navigation.tsx'), /createPortal|fetch\(|Storage|ownerId|agentRevision/);
});
void test('root and pass-through layouts do not mount a second nav or change viewport/domain contracts', () => {
  const root = source('app/layout.tsx'); assert.match(root, /import '\.\/os-bottom-navigation\.css'/);
  assert.match(root, /viewportFit: 'cover'/); assert.match(root, /<CommunityOsRuntime \/>\{children\}/);
  for (const path of ['app/layout.tsx', 'app/os/layout.tsx', 'app/sky/layout.tsx'])
    assert.doesNotMatch(source(path), /<OsAppNavigation|<OsHeader/);
  assert.doesNotMatch(source('app/os-bottom-navigation.css'), /body\s*\{|\.home\s*\{|--os-bg\s*:/);
});
void test('real nav blocks running pointer and keyboard activation, with static no-prefetch destination labels', async () => {
  const Nav = await navigation();
  for (const running of [false, true]) {
    const tree = Nav({ running }), links = tree.props.children;
    assert.equal(links.length, 3); assert.equal(tree.props['aria-label'], 'RockstarOSの主要サービス');
    assert.deepEqual(Array.from(links, l => l.props.href), ['/#timeline', '/chat', '/#communities']);
    assert.deepEqual(Array.from(links, l => text(l)), ['Smith', 'Eve', 'コミュニティー']);
    for (const link of links) { assert.equal(link.props.prefetch, false); assert.equal(link.props['aria-disabled'], running || undefined); }
    for (const [handler, key] of [['onClickCapture', undefined], ['onKeyDownCapture', 'Enter'], ['onKeyDownCapture', ' ']]) {
      let prevented = false; tree.props[handler]({ key, preventDefault() { prevented = true; } }); assert.equal(prevented, running);
    }
  }
});
void test('nav synchronizes real hash/history events and releases listeners on route changes and unmount', async () => {
  let hash = '#communities', value = '', effect, cleanup, deps;
  const listeners = new Map();
  const window = { location: { get hash() { return hash; } }, addEventListener(n, fn) { listeners.set(n, fn); },
    removeEventListener(n, fn) { if (listeners.get(n) === fn) listeners.delete(n); } };
  const react = { useState: () => [value, next => { value = next; }], useEffect(fn, next) {
    if (!deps || next.some((v, i) => v !== deps[i])) { cleanup?.(); effect = fn; deps = next; }
  } };
  const Nav = await navigation(react, '/', { window });
  Nav({}); cleanup = effect(); assert.equal(value, '#communities'); assert.equal(listeners.size, 2);
  hash = '#timeline'; listeners.get('hashchange')(); assert.equal(value, '#timeline');
  hash = '#community=fixture'; listeners.get('popstate')(); assert.equal(value, '#community=fixture');
  const tree = Nav({}); assert.equal(tree.props.children[2].props['aria-current'], 'page');
  cleanup(); assert.equal(listeners.size, 0);
  const Other = await navigation(react, '/chat', { window }); Other({}); cleanup = effect();
  assert.equal(listeners.size, 2); assert.equal(Other({}).props.children[1].props['aria-current'], 'page');
  cleanup(); assert.equal(listeners.size, 0);
});
void test('mobile-only CSS shares the current 700px boundary, reserves space once, and suppresses nav while editing', () => {
  const css = source('app/os-bottom-navigation.css'), home = source('components/home-screen.module.css');
  assert.match(css, /\.os-app-navigation\s*\{\s*display: none/);
  assert.match(css, /@media \(max-width: 700px\)/); assert.doesNotMatch(css, /1279|1280|repeat\(5/);
  assert.match(css, /repeat\(3, minmax\(0, 1fr\)\)/); assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /\[data-os-bottom-navigation-host='workspace'\][^{]*\{[^}]*padding-bottom:/);
  assert.doesNotMatch(css, /\[data-os-bottom-navigation-host='home'\][^{]*\{[^}]*padding-bottom:/);
  assert.match(css, /scroll-margin-bottom:/); assert.match(css, /:has\(/); assert.match(css, /textarea:focus/);
  assert.match(css, /:focus-visible/); assert.match(css, /min-height: 44px/);
  assert.match(home, /padding-bottom: calc\(62px \+ env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(home, /\.mobileNav/);
  assert.doesNotMatch(css, /background:[^;]*rgba/);
});

void test('actual Home keeps nav current when client Link commits hash-only history without native events', async () => {
  let url = new URL('http://127.0.0.1:3124/#timeline'), cursor = 0;
  const slots = [], listeners = new Map();
  const react = { useState(initial) {
    const i = cursor++; if (!(i in slots)) slots[i] = initial;
    return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
  }, useEffect() {} };
  const window = { location: { get href() { return url.href; }, get origin() { return url.origin; }, get hash() { return url.hash; } },
    history: { pushState(_state, _title, href) { url = new URL(href, url); }, replaceState(_state, _title, href) { url = new URL(href, url); } },
    addEventListener(name, fn) { listeners.set(name, fn); } };
  const Nav = await navigation();
  const Home = compile('components/home-screen.tsx', {
    react, './os-app-navigation': { default: Nav },
    './sky-social-timeline': { default: 'timeline' }, './sky-discovery-feed': { default: 'discovery' },
    './sky-x-account': { default: 'x-timeline', SkyXAccountConnection: 'x-account' },
    './sky-public-x-timeline': { default: 'public-x' },
    './sky-timeline-connector': { useTimelineConnector: () => ({}), SkyTimelineConnector: 'connector', SkyMcpTimeline: 'mcp' },
    './sky-information-market': { SkyNewsConnections: 'news' },
    '@/lib/use-sky-features': { useSkyFeatures: () => ({ enabled: () => false }) },
  }, { window, URL }).default;
  const render = () => { cursor = 0; return Home(); };
  const selected = tree => {
    const mounted = nodes(tree).find(n => n.type === Nav);
    return Nav(mounted.props).props.children.find(l => l.props['aria-current'] === 'page')?.props.href;
  };
  let tree = render(); assert.equal(selected(tree), '/#timeline');
  for (const [href, method] of [['/#communities', 'pushState'], ['/#timeline', 'replaceState'], ['/#communities', 'replaceState']]) {
    const anchor = { getAttribute(name) { return name === 'href' ? href : null; } };
    tree.props.onClickCapture({ button: 0, target: { closest: () => anchor }, defaultPrevented: false });
    // Next/client routers may commit the URL without either native notification.
    window.history[method]({}, '', href);
    tree = render(); assert.equal(url.hash, new URL(href, url).hash);
    assert.equal(selected(tree), href, 'nav must consume the same Home selection as the clicked panel');
    assert.equal(nodes(tree).find(n => n.type === 'timeline').props.initialView, href.endsWith('communities') ? 'communities' : 'home');
  }
  assert.equal(listeners.size, 0, 'the regression deliberately emits no hashchange or popstate');
  const anchor = { getAttribute(name) { return name === 'href' ? '/#timeline' : null; } };
  tree.props.onClickCapture({ button: 0, target: { closest: () => anchor }, defaultPrevented: true });
  tree = render(); assert.equal(selected(tree), '/#communities');
  assert.equal(nodes(tree).find(n => n.type === 'timeline').props.initialView, 'communities', 'cancelled/pending navigation must keep the current panel');
  tree.props.onClickCapture({ button: 0, ctrlKey: true, target: { closest: () => anchor }, defaultPrevented: false });
  assert.equal(selected(render()), '/#communities');
  const newTab = { getAttribute(name) { return name === 'href' ? '/#timeline' : name === 'target' ? '_blank' : null; } };
  tree.props.onClickCapture({ button: 0, target: { closest: () => newTab }, defaultPrevented: false });
  assert.equal(selected(render()), '/#communities', 'opening a different tab must not change this Home panel');
});

void test('390px Home More menu preserves discovery and own saved-Agent entry after reducing bottom nav to three', async () => {
  const Nav = await navigation();
  const Home = compile('components/home-screen.tsx', {
    react: staticReact, './os-app-navigation': { default: Nav },
    './sky-social-timeline': { default: 'timeline' }, './sky-discovery-feed': { default: 'discovery' },
    './sky-x-account': { default: 'x-timeline', SkyXAccountConnection: 'x-account' },
    './sky-public-x-timeline': { default: 'public-x' },
    './sky-timeline-connector': { useTimelineConnector: () => ({}), SkyTimelineConnector: 'connector', SkyMcpTimeline: 'mcp' },
    './sky-information-market': { SkyNewsConnections: 'news' },
    '@/lib/use-sky-features': { useSkyFeatures: () => ({ enabled: () => false }) },
  }).default;
  const tree = Home();
  // Scope to the actual mobile header/More DOM, not the CSS-hidden desktop sidebar.
  const header = nodes(tree).find(n => n.type === 'header' && n.props.className === 'mobileHeader');
  const details = nodes(header).find(n => n.type === 'details');
  const menu = nodes(details).find(n => n.type === 'nav' && n.props['aria-label'] === '追加メニュー');
  assert.ok(menu); assert.ok(nodes(details).some(n => n.type === 'summary' && n.props['aria-label'] === 'その他のメニュー'));
  const counts = [['/#catalog', '見つける'], ['/sky/agents', '自分のSky']].map(([href, label]) =>
    nodes(menu).filter(n => n.type === 'a' && n.props.href === href && text(n) === label).length);
  assert.deepEqual(counts, [1, 1], '390px More must retain one discovery link and one own saved-Agent link');
  assert.equal(nodes(tree).filter(n => n.type === Nav).length, 1);
  assert.equal(Nav({}).props.children.length, 3);
  // Existing main breakpoint exposes this header at390px; it is unchanged by this fix.
  assert.match(source('components/home-screen.module.css'), /@media \(max-width: 700px\)[\s\S]*?\.mobileHeader\s*\{\s*display: flex/);
});
