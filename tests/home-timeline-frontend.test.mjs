import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
void test('Home is the native timeline frontend with preserved optional navigation and no stacked embedding', () => {
  const home = read('components/home-screen.tsx');
  assert.match(home, /data-sky-home/);
  assert.match(home, /<SkySocialTimeline/);
  assert.match(home, /fullHome/);
  assert.match(home, /<SkyDiscoveryDialog/);
  assert.doesNotMatch(home, /discovery=\{<SkyDiscoveryFeed/);
  assert.doesNotMatch(
    home,
    /<SkyHomeTimeline|<SkyInformationMarket|<SkyWorkspace|<SkyOptionalFeatures|styles\.hero|iframe/,
  );
  assert.match(
    home,
    /enabled\('wallet'\)\s*&&[\s\S]*?href=\{route\('\/wallet'\)\}/,
  );
  assert.match(home, /enabled\('market'\)\s*&&[\s\S]*?href=\{route\('\/market'\)\}/,
  );
  for (const hash of [
    'optional-features',
    'news-plugins',
    'bookmarks',
    'communities',
  ])
    assert.ok(home.includes(hash), hash);
  assert.match(read('lib/os-navigation.ts'), /'#catalog'/);
  assert.match(home, /onClickCapture/);
  assert.match(home, /addEventListener\('popstate'/);
  assert.match(home, /<OSHeader title="Smith"/);
  assert.match(read('components/os-header.tsx'), /src="\/company-mark.png"/);
  assert.match(home, /<OsAppNavigation/);
  assert.match(read('lib/os-navigation.ts'), /id: 'eve', href: '\/chat'/);
  assert.match(read('components/sky-chat-workspace.tsx'), /<Workbench embedded/);
  assert.match(read('components/workbench.tsx'), /\/api\/work-jobs/);
});
void test('discovery posts reuse actual owner Add APIs and never imply Tool execution', () => {
  const source = read('components/sky-discovery-feed.tsx');
  for (const api of ['/api/sky/huggingface', '/api/sky/connections'])
    assert.ok(source.includes(api));
  assert.match(source, /hub\.save\(/);
  assert.match(source, /SkyOptionalFeatures/);
  assert.match(source, /queueSkyZemaHandoff\(/);
  assert.match(source, /thread=\$\{encodeURIComponent\(handoff.id\)\}/);
  assert.match(source, /writeHomeIntent\(/);
  assert.match(source, /v.tool !== tool.id/);
  assert.match(source, /Array.isArray\(v\)/);
  assert.doesNotMatch(
    source,
    /\/api\/llm\/text|\/api\/work-jobs.*method: 'POST'|iframe|Math.random/,
  );
  assert.match(source, /配布元DL/);
  assert.match(source, /公開カタログ/);
  assert.match(source, /料金・利用条件を見る/);
});
void test('optional feature posts expose setup on selection and preserve CAS and actual saved state', () => {
  const source = read('components/sky-optional-features.tsx');
  assert.match(source, /hidden=\{timeline && !settingsOpen\}/);
  assert.match(source, /addition\?\.revision \?\? 0/);
  assert.match(source, /この設定で追加/);
  assert.match(source, /sky-features-changed/);
  assert.match(source, /\/api\/sky\/features/);
  assert.match(source, /記録・資産・契約は消えません/);
});
void test('following private communities and threads do not acquire catalog recommendations', () => {
  const source = read('components/sky-social-timeline.tsx');
  assert.match(
    source,
    /!threadId\s*&&\s*!communityId\s*&&\s*mode === 'recommended'\s*&&\s*discovery/,
  );
  assert.match(source, /data-full-home=\{fullHome \|\| undefined\}/);
  assert.match(source, /attachmentAdded/);
  assert.match(source, /Eveで使う準備/);
  const css = read('components/home-screen.module.css');
  assert.match(css, /min-height: 100dvh/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
});
