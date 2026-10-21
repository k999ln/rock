import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const patch = await readFile(new URL('../toolkits/sky-linux-local/android-entry.patch', import.meta.url), 'utf8');
const installer = await readFile(new URL('../toolkits/sky-linux-local/install-startup.py', import.meta.url), 'utf8');
void test('Pixel native entry keeps fixed private endpoint, owner notifications and explicit SAF readback', () => {
  assert.match(patch, /http:\/\/127\.0\.0\.1:5199\/__sky\/linux/);
  assert.match(patch, /SkyLinuxActivity.*android:exported="false"/);
  assert.match(patch, /ACTION_CREATE_DOCUMENT/);
  assert.match(patch, /openInputStream\(uri\)/);
  assert.match(patch, /Arrays\.equals\(bytes,check\.toByteArray\(\)\)/);
  assert.match(patch, /POST_NOTIFICATIONS/);
  assert.match(patch, /shell\/src\/debug\/AndroidManifest.xml/);
  assert.match(patch, /FLAG_DEBUGGABLE/);
  assert.match(patch, /PendingIntent\.FLAG_IMMUTABLE/);
  assert.doesNotMatch(patch, /addJavascriptInterface|Runtime\.getRuntime|ProcessBuilder|SYSTEM_ALERT_WINDOW/);
  assert.match(patch, /料金と実行先/);
  assert.match(patch, /下書きです。内容を確認してください/);
});
void test('Pixel startup unit runs only the fixed owner service with bounded resources', () => {
  for (const fragment of ['User={user}', 'ExecStart={node} {root}/app/server.mjs', 'Restart=always', 'StartLimitBurst=3', 'MemoryMax=2G', 'CPUQuota=200%', 'TasksMax=64', 'NoNewPrivileges=true', 'ProtectSystem=strict']) assert.ok(installer.includes(fragment), fragment);
  assert.doesNotMatch(installer, /shell=True|chmod.*777/);
});

void test('download guidance explains purpose capacity private storage reuse and explicit exports',async()=>{
  const web=await readFile(new URL('../components/sky-linux-local-lab.tsx',import.meta.url),'utf8');
  for(const source of [patch,web])for(const phrase of ['文章を作る','初回','Sky内部','再利用','取得時は通信','保存を選んだとき'])assert.ok(source.includes(phrase),phrase);
  const suite=await readFile(new URL('../toolkits/sky-linux-local/owner-tests/dev/rock/shell/PixelMultiModelAcceptanceTest.java',import.meta.url),'utf8');
  assert.match(suite,/@After public void collectTemporaryExports/);
  assert.match(suite,/temporaryExport\("txt"\)/);
  assert.match(suite,/temporaryExport\("json"\)/);
  assert.match(suite,/java\.util\.UUID\.randomUUID/);
});
