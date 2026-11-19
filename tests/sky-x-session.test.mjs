import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
void test('X account viewer is a separate app with explicit Internet only, fixed destination and dedicated profile',()=>{
 const manifest=read('android/x-session/src/main/AndroidManifest.xml');
 assert.deepEqual([...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map(match=>match[1]),['android.permission.INTERNET']);
 assert.match(manifest,/android:allowBackup="false"/);assert.match(manifest,/android:usesCleartextTraffic="false"/);
 assert.match(manifest,/android:scheme="rockstarx" android:host="home"/);
 assert.match(read('android/x-session/build.gradle'),/applicationId 'dev.rock.xsession'/);
 assert.match(read('android/x-session/src/main/java/dev/rock/xsession/XSessionApplication.java'),/setDataDirectorySuffix\("x-account"\)/);
 const activity=read('android/x-session/src/main/java/dev/rock/xsession/XSessionActivity.java');
 assert.match(activity,/HOME = "https:\/\/x.com\/home"/);assert.match(activity,/web.loadUrl\(HOME\)/);
 assert.match(activity,/setAllowFileAccess\(false\)/);assert.match(activity,/setAllowContentAccess\(false\)/);assert.match(activity,/MIXED_CONTENT_NEVER_ALLOW/);
 assert.match(activity,/setAcceptThirdPartyCookies\(web,false\)/);assert.match(activity,/request.deny\(\)/);
 assert.doesNotMatch(activity,/addJavascriptInterface|evaluateJavascript|getCookie\(|setCookie\(|\.proceed\(|getIntent\(/);
});
void test('Home offers the official account view before optional public widgets, without asserting authentication',()=>{
 const component=read('components/sky-x-timeline.tsx');
 assert.match(component,/useState\(false\)/);assert.match(component,/if\(!showPublic\)return/);
 assert.match(component,/href="https:\/\/x.com\/home"/);assert.match(component,/package=dev.rock.xsession/);
 assert.match(component,/ブラウザは別画面/);assert.doesNotMatch(component,/接続済み|ログイン済み/);
});
