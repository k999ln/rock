import test from 'node:test';
import assert from 'node:assert/strict';
import * as navigation from '../lib/noah-navigation.ts';
import * as accountNavigation from '../lib/eve-noah-navigation.ts';
import * as askView from '../lib/noah-ask-view.ts';
import * as formLib from '../lib/noah-form.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { screen } from './fixtures/noah/screen.mjs';

void test('Noah return paths stay within the service, preserve an agent handoff and refuse login loops', () => {
  const detail = '/noah/ready/agent?id=family-1#work';
  const engineering = '/noah/engineering?step=test&agent=a2c933c4-6b40-4340-9268-0903f1bd0417';
  assert.equal(new URL(navigation.noahAccountHref(engineering), 'https://avoado.si').searchParams.get('returnTo'), engineering);
  assert.equal(navigation.noahReturnPath(detail), detail);
  assert.equal(new URL(navigation.noahAccountHref(detail), 'https://avoado.si').searchParams.get('returnTo'), detail);
  const signIn = new URL(navigation.noahSignInHref(detail), 'https://avoado.si');
  assert.equal(signIn.pathname, '/signin-with-chatgpt');
  assert.equal(signIn.searchParams.get('return_to'), detail);
  for (const invalid of [undefined, '', '//evil.test/noah', '/os', '/noahish', '/noah/../../os', '/noah/account?returnTo=/noah', '/noah/account/other', '/noah\\evil', '/noah\n']) {
    assert.equal(navigation.noahReturnPath(invalid), '/noah', String(invalid));
    assert.equal(navigation.noahSignInHref(invalid), '/signin-with-chatgpt?return_to=%2Fnoah', String(invalid));
  }
});

void test('OS runtime stays unmounted throughout Noah navigation and remains available outside Noah', async () => {
  let pathname = '/noah', mounts = 0;
  const ui = screen({ modules: {
    'next/navigation': { usePathname: () => pathname },
    'next/dynamic': { default: () => () => { mounts++; return 'OS runtime'; } },
  } });
  const page = ui.mount('components/application-runtime.tsx');
  for (const route of ['/noah', '/noah/explore', '/noah/account', '/noah/ready/agent', '/noah/data']) {
    pathname = route; page.render(); await page.flush();
    assert.equal(page.text(), ''); assert.equal(mounts, 0);
  }
  pathname = '/os/eve'; page.render();
  assert.equal(page.text(), 'OS runtime'); assert(mounts > 0);
  pathname = '/noah'; page.render(); assert.equal(page.text(), '');
});

const accountModules = (query) => ({
  'next/navigation': { useSearchParams: () => new URLSearchParams(query) },
  '@/lib/eve-noah-navigation': accountNavigation, '@/lib/noah-navigation': navigation,
  '@/lib/passkey-browser': {}, '@/lib/account-handoff': { resetAccountHandoffs() {} },
});
void test('Noah account uses the shared identity service without OS navigation, and logout returns to Noah', async () => {
  for (const gatewaySignout of [false, true]) {
    const ui = screen({ modules: accountModules({ returnTo: '/noah/ready/agent?id=family-1' }), fetch: async ({ method }) => ({ body: method === 'DELETE' ? { gatewaySignout } : { signedIn: true, passwordLogin: { handle: 'reader' }, credentials: [] } }) });
    const page = ui.mount('components/rockstar-account.tsx', { service: 'noah' });
    await page.tick(0);
    assert.doesNotMatch(page.text(), /RockstarOS|Pixel|Eve|接続済みの端末/);
    assert.equal(page.find('a', '戻る')[0].props.href, '/noah/ready/agent?id=family-1');
    await page.click('ログアウト');
    assert.equal(ui.calls.at(-1).url, '/api/os/access');
    assert.equal(ui.calls.at(-1).method, 'DELETE');
    const returned = new URL(ui.visits[0], 'https://avoado.si');
    const account = gatewaySignout ? new URL(returned.searchParams.get('return_to'), returned.origin) : returned;
    assert.equal(account.pathname, '/noah/account');
    assert.equal(account.searchParams.get('returnTo'), '/noah/ready/agent?id=family-1');
  }
});

const workModules = { '@/lib/noah-ask-view': askView, '@/lib/noah-form': formLib, '@/lib/owner-intent': ownerIntent };
void test('standalone work distinguishes signed out, empty and failed reads, with working retry', async () => {
  let reply = { status: 503 };
  const ui = screen({ modules: workModules, fetch: async () => reply });
  const page = ui.mount('components/noah-work-list.tsx', { ownerScope: null, refresh: 0, showEmpty: true });
  assert.match(page.text(), /読み込んでいます/);
  await page.flush(); assert.match(page.text(), /仕事を読み込めませんでした/);
  reply = { status: 200, body: { asks: [], ownerScope: 'a' } };
  await page.click('読み直す'); assert.match(page.text(), /まだ仕事を頼んでいません/);
  assert.equal(page.find('a', 'Agentを探す')[0].props.href, '/noah/explore');
  reply = { status: 401 };
  const signedOut = ui.mount('components/noah-work-list.tsx', { ownerScope: null, refresh: 0, only: 'succeeded', showEmpty: true });
  await signedOut.flush();
  assert.match(signedOut.text(), /接続を確認すると/);
  const signIn = new URL(signedOut.find('a', '接続を確認して続ける')[0].props.href, 'https://avoado.si');
  assert.equal(signIn.pathname, '/signin-with-chatgpt');
  assert.equal(signIn.searchParams.get('return_to'), '/noah/saved?tab=results');
  assert.doesNotMatch(signedOut.text(), /成果はまだ/);
});

void test('old in-flight results are discarded when the signed-in owner changes', async () => {
  let resolveDetail, owner = 'a';
  const props = { ownerScope: 'a', refresh: 0, showEmpty: true, only: 'succeeded' };
  const ui = screen({ modules: workModules, fetch: async ({ url }) => url === '/api/noah/ask' ? { body: { ownerScope: owner, asks: owner === 'a' ? [{ id: 'job', state: 'succeeded', finishedAt: 1 }] : [] } } : new Promise(resolve => { resolveDetail = resolve; }) });
  const page = ui.mount('components/noah-work-list.tsx', props);
  for (let n = 0; n < 5; n++) { await new Promise(resolve => setImmediate(resolve)); page.render(); }
  assert.equal(typeof resolveDetail, 'function');
  owner = 'b'; props.ownerScope = 'b'; props.refresh++; page.render();
  resolveDetail({ body: { result: { text: 'previous owner private result' } } });
  await page.flush();
  assert.doesNotMatch(page.text(), /previous owner/);
  assert.match(page.text(), /成果はまだ届いていません/);
});

void test('the primary activity route shows remote jobs without reopening retired Mac screens', async () => {
  const jsx = (type, props) => ({ type, props });
  const modules = { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'a' }, 'next/navigation': { redirect: (url) => { throw Error(url); } }, '@/components/noah-my': { default: 'my-agent' }, '@/components/noah-service.module.css': { default: {} } };
  const code = ts.transpileModule(readFileSync(new URL('../app/noah/activity/page.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const unit = { exports: {} };
  runInNewContext(`(function(exports, require, module){${code}\n})`, { URLSearchParams })(unit.exports, name => { assert(name in modules, name); return modules[name]; }, unit);
  const tree = await unit.exports.default({ searchParams: Promise.resolve({}) });
  assert.equal(tree.type, 'my-agent'); assert.equal(tree.props.legacy, 'activity');
  const linked = await unit.exports.default({ searchParams: Promise.resolve({ agent: 'anicca' }) });
  assert.equal(linked.props.legacy, 'activity');
  assert.equal(linked.props.params.agent, 'anicca');
});

void test('a known owner change hides cached results before the next network reply', async () => {
  let nextList;
  const props = { ownerScope: 'a', refresh: 0, showEmpty: true, only: 'succeeded' };
  const ui = screen({ modules: workModules, fetch: async ({ url }) => url === '/api/noah/ask'
    ? props.ownerScope === 'a' ? { body: { ownerScope: 'a', asks: [{ id: 'job', state: 'succeeded', finishedAt: 1 }] } } : new Promise(resolve => { nextList = resolve; })
    : { body: { result: { text: 'owner a private result' } } } });
  const page = ui.mount('components/noah-work-list.tsx', props); await page.flush();
  assert.match(page.text(), /owner a private result/);
  props.ownerScope = 'b'; page.render();
  assert.doesNotMatch(page.text(), /owner a private result/);
  assert.match(page.text(), /読み込んでいます/);
  nextList({ body: { ownerScope: 'b', asks: [] } }); await page.flush();
  assert.match(page.text(), /成果はまだ届いていません/);
});
