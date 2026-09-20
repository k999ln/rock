import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

void test('optional Jev provider owns network permission and is disabled by default', () => {
  const provider = read('android/jev-provider/src/main/AndroidManifest.xml');
  const providerAosp = read('android/jev-provider/src/aosp/AndroidManifest.xml');
  const broker = read('android/automation/src/main/AndroidManifest.xml');
  const shell = read('android/shell/src/main/AndroidManifest.xml');
  const localAi = read('android/local-ai-api/src/main/AndroidManifest.xml');
  const tool = read('android/article-tool/src/main/AndroidManifest.xml');
  assert.match(provider, /android\.permission\.INTERNET/u);
  assert.match(providerAosp, /android\.permission\.INTERNET/u);
  assert.match(provider, /android:enabled="false"/u);
  assert.match(providerAosp, /android:enabled="false"/u);
  assert.doesNotMatch(provider, /android\.intent\.action\.MAIN/u);
  assert.doesNotMatch(provider, /android:exported="true"/u);
  assert.doesNotMatch(provider, /sharedUserId/u);
  for (const manifest of [broker, shell, localAi, tool])
    assert.doesNotMatch(manifest, /android\.permission\.INTERNET/u);
});

void test('provider source is fixed endpoint, public-only, bounded, and advisory-only', () => {
  const source = read('android/jev-provider/src/main/java/dev/rock/jev/provider/TypeSafeJevProvider.java');
  const product = read('os/physical/rockstaros.mk');
  const blueprint = read('android/Android.bp');
  const seapp = read('android/sepolicy/private/seapp_contexts');
  const policy = read('android/sepolicy/private/rockstar_platform.te');
  assert.match(source, /https:\/\/api\.typesafe\.ai\/v1\/systemone/u);
  assert.match(source, /\.put\("state"/u);
  assert.match(source, /\.put\("model"/u);
  assert.match(source, /\.put\("questions"/u);
  assert.match(source, /MAX_REQUEST_BYTES/u);
  assert.match(source, /MAX_RESPONSE_BYTES/u);
  assert.match(source, /SECRET_DATA_PROHIBITED/u);
  assert.match(source, /externalActionAllowed = false/u);
  assert.match(source, /advisory-only/u);
  assert.doesNotMatch(source, /Log\.|System\.out|System\.err/u);
  assert.doesNotMatch(source, /TYPESAFE_API_KEY\s*=|api[_-]?key\s*[:=]\s*["'][^"']+/iu);
  assert.match(blueprint, /name: "RockJevProvider"/u);
  assert.match(seapp, /name=dev\.rock\.jev\.provider domain=rock_jev_provider_app/u);
  assert.match(policy, /net_domain\(rock_jev_provider_app\)/u);
  assert.match(product, /ROCK_JEV_PROVIDER_MODE\),optional/u);
  assert.match(product, /ROCK_JEV_PROVIDER_PACKAGES :=/u);
  assert.match(product, /ro\.rockstaros\.jev_provider\.stage=/u);
  assert.doesNotMatch(product, /PRODUCT_PACKAGES \+= [^\n]*RockJevProvider[^\n]*\n/u);
});
