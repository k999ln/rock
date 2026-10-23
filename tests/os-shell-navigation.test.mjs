import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { osNavigationItems, osRouteHref, activeOsNavigation } from '../lib/os-navigation.ts';

void test('Home and Eve retain the same three destinations independent of optional features', () => {
  assert.deepEqual(osNavigationItems.map(x => x.id), ['stream','eve','communities']);
  const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  for (const path of ['components/home-screen.tsx','components/os-header.tsx']) assert.match(read(path), /<OsAppNavigation/);
  assert.match(read('components/home-screen.tsx'), /<OSHeader title="smis" hideNavigation>/);
  assert.match(read('components/eve-sync-workspace.tsx'), /<WorkspaceShell title="Eve"/);
  assert.doesNotMatch(read('components/os-app-navigation.tsx'), /useSkyFeatures|WalletCards|ChartNoAxesCombined/);
});

void test('public OS navigation uses the main domain and localhost preserves existing routes', () => {
  for (const path of ['/','/chat','/os','/os/eve','/os/sky/agents']) {
    assert.equal(osRouteHref(path,'/'),'/');
    assert.equal(osRouteHref(path,'/#timeline'),'/#timeline');
    assert.equal(osRouteHref(path,'/#communities'),'/#communities');
    assert.equal(osRouteHref(path,'/chat'),'/os/eve');
    assert.equal(osRouteHref(path,'/chat?agent=example'),'/os/eve?mode=tools&agent=example');
    assert.equal(osRouteHref(path,'/sky/agents'),'/#sky-manage');
    assert.equal(osRouteHref(path,'/wallet'),'/wallet');
    assert.equal(osRouteHref(path,'/#timeline',true),'/#timeline');
  }
  assert.equal(osRouteHref('/chat','/#catalog'),'/#catalog');
  assert.equal(osRouteHref('/os-other','/chat'),'/chat');
});

void test('selected tab follows both the route and Home subview', () => {
  assert.equal(activeOsNavigation('/chat'),'eve');
  assert.equal(activeOsNavigation('/os/eve'),'eve');
  assert.equal(activeOsNavigation('/os/sky/agents'),'stream');
  assert.equal(activeOsNavigation('/os','#catalog'),'stream');
  assert.equal(activeOsNavigation('/','#community=example'),'communities');
  assert.equal(activeOsNavigation('/','#timeline'),'stream');
  assert.equal(activeOsNavigation('/wallet'),null);
});
