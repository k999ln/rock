import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { osNavigationItems, osRouteHref, activeOsNavigation } from '../lib/os-navigation.ts';
import { GET as legacyHubEntry } from '../app/sky/route.ts';
import securityPolicy from '../data/web-security-policy.json' with { type: 'json' };
import { skyAgentEvePath } from '../lib/sky-agent-library.ts';

void test('legacy smis entry keeps canonical and campus destinations with every security header', () => {
  for (const [query, destination] of [['', '/'], ['?campus=columbia', '/sky/campus/columbia/hub'], ['?campus=https://untrusted.invalid', '/']]) {
    const response = legacyHubEntry(new Request(`http://127.0.0.1:8787/sky${query}`));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('Location'), destination);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    for (const [key, value] of Object.entries(securityPolicy.universalHeaders)) assert.equal(response.headers.get(key), value);
  }
});

void test('Home and Eve retain the same three destinations independent of optional features', () => {
  assert.deepEqual(osNavigationItems.map(x => x.id), ['stream','eve','communities']);
  const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  for (const path of ['components/home-screen.tsx','components/os-header.tsx']) assert.match(read(path), /<OsAppNavigation/);
  assert.match(read('components/home-screen.tsx'), /<OSHeader title="Smith" hideNavigation>/);
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

void test('Smith navigation preserves saved agent references through legacy routes without upgrading their revision', () => {
  assert.deepEqual(osNavigationItems.map(({ label }) => label), ['Smith', 'Eve', 'コミュニティー']);
  // These are link transformations only. Authentication and stale-reference rejection
  // remain the responsibility of the existing owner-bound library/runtime stores.
  for (const reference of [
    { id: 'tool:mr-citations', revision: 0, sourceTool: 'mr-citations' },
    { id: '11111111-1111-4111-8111-111111111111', revision: 7 },
  ]) {
    const before = structuredClone(reference);
    const canonical = new URL(skyAgentEvePath(reference), 'https://fixture.invalid');
    const legacy = `/chat?${canonical.searchParams}#saved-result`;
    for (const entry of ['/', '/sky', '/sky/agents', '/os', '/os/eve']) {
      const result = new URL(osRouteHref(entry, legacy), canonical.origin);
      assert.equal(result.pathname, '/os/eve');
      assert.equal(result.searchParams.get('mode'), 'tools');
      assert.equal(result.searchParams.get('agent'), reference.id);
      assert.equal(result.searchParams.get('agentRevision'), String(reference.revision));
      assert.equal(result.searchParams.get('tool'), reference.sourceTool ?? null);
      assert.equal(result.hash, '#saved-result');
      assert.equal(osRouteHref(entry, legacy, true), legacy);
    }
    assert.deepEqual(reference, before);
  }
  const oldLink = '/sky/tools/mr-citations?agent=tool%3Amr-citations&agentRevision=0&tag=a&tag=b#result';
  assert.equal(osRouteHref('/sky', oldLink), `/os${oldLink}`);
  assert.equal(osRouteHref('/sky', '/api/sky/agents?revision=0'), '/api/sky/agents?revision=0');
});
