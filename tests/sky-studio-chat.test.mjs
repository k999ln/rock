import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const studio = readFileSync(new URL('../components/rock-studio.tsx', import.meta.url), 'utf8');

void test('Rock Studio exposes copy-first SDK integration for an existing tool', () => {
  assert.match(studio, /このコードを、/);
  assert.match(studio, /createSkyToolApp/);
  assert.match(studio, /rockstaros-sky-tool-sdk-0\.1\.2\.tgz/);
  assert.match(studio, /\/api\/sky\/developer-tokens/);
  assert.match(studio, /開発者キー（公開時のみ）/);
  assert.doesNotMatch(studio, /type="file"/);
});

void test('Rock Studio does not upload source code from the browser', () => {
  assert.doesNotMatch(studio, /\/api\/sky\/tool-packages/);
  assert.doesNotMatch(studio, /analyzeSkyCodeIntake/);
  assert.match(studio, /ソースコードの送信なし/);
});
