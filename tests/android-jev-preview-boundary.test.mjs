import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

void test('Jev network access exists only in the standalone debug preview variant', () => {
  const shellManifest = read('android/shell/src/main/AndroidManifest.xml');
  const shellAospManifest = read('android/shell/src/aosp/AndroidManifest.xml');
  const previewManifest = read('android/jev-preview/src/main/AndroidManifest.xml');
  const debugManifest = read('android/jev-preview/src/debug/AndroidManifest.xml');
  assert.equal(shellManifest.includes('android.permission.INTERNET'), false);
  assert.equal(shellAospManifest.includes('android.permission.INTERNET'), false);
  assert.equal(previewManifest.includes('android.permission.INTERNET'), false);
  assert.equal(shellManifest.includes('networkSecurityConfig'), false);
  assert.equal(shellAospManifest.includes('networkSecurityConfig'), false);
  assert.equal(previewManifest.includes('networkSecurityConfig'), false);
  assert.equal(previewManifest.includes('android.intent.action.MAIN'), false);
  assert.equal(previewManifest.includes('android.intent.category.LAUNCHER'), false);
  assert.match(previewManifest, /android:name="\.MainActivity"\s*\/>/u);
  assert.match(shellManifest, /android:usesCleartextTraffic="false"/u);
  assert.match(shellAospManifest, /android:usesCleartextTraffic="false"/u);
  assert.match(previewManifest, /android:usesCleartextTraffic="false"/u);
  assert.match(debugManifest, /android\.permission\.INTERNET/u);
  assert.match(debugManifest, /pixel_jev_preview_network_security/u);
  assert.match(debugManifest, /android\.intent\.action\.MAIN/u);
  assert.match(debugManifest, /android\.intent\.category\.LAUNCHER/u);
  assert.match(debugManifest, /android:name="\.MainActivity" android:exported="true"/u);
  const networkConfig = read(
    'android/jev-preview/src/debug/res/xml/pixel_jev_preview_network_security.xml',
  );
  assert.match(networkConfig, /127\.0\.0\.1/u);
  assert.match(networkConfig, /localhost/u);
  assert.match(networkConfig, /cleartextTrafficPermitted="false"/u);
  assert.match(networkConfig, /cleartextTrafficPermitted="true"/u);
});

void test('Standalone preview source has no credential or action input path', () => {
  const java = read(
    'android/jev-preview/src/debug/java/dev/rock/jevpreview/PixelJevPreviewDebug.java',
  );
  assert.match(java, /127\.0\.0\.1:49211/u);
  assert.match(java, /public-choice-v1/u);
  assert.doesNotMatch(
    java,
    /TYPESAFE_API_KEY|Authorization|Bearer|startActivity|ACTION|ShellConnection|dev\.rock\.shell/u,
  );
});
