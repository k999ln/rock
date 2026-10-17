import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await test('native test UI cannot expose a remote bypass into the Broker', async () => {
  for (const variant of ['main', 'aosp']) {
    const manifest = await readFile(new URL(`../android/shell/src/${variant}/AndroidManifest.xml`, import.meta.url), 'utf8');
    assert.match(manifest, /android:name="\.TestModeActivity" android:exported="false"/);
    assert.doesNotMatch(manifest, /android\.permission\.INTERNET/);
  }
  const ui = await readFile(new URL('../android/shell/src/main/java/dev/rock/shell/TestModeActivity.java', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /new ShellConnection|ACTION_VIEW|loadUrl\(|getSharedPreferences|SQLiteDatabase|openOrCreateDatabase|\.submit\(/);
  const engine = await readFile(new URL('../android/core/src/main/java/dev/rock/core/OutputTestTools.java', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /import java\.(net|io)\.|ProcessBuilder|Runtime\.getRuntime|PlatformStore|HttpClient|Socket|PlatformApi/);
});
