import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const studio = readFileSync(new URL('../components/rock-studio.tsx', import.meta.url), 'utf8');

void test('Rock Studio exposes one chat intake for pasted code or a file', () => {
  assert.match(studio, /ここにコードを貼り付ける/);
  assert.match(studio, /type="file"/);
  assert.match(studio, /analyzeSkyCodeIntake/);
  assert.match(studio, /\/api\/sky\/tool-packages/);
  assert.doesNotMatch(studio, /name="developerName"/);
  assert.doesNotMatch(studio, /name="sourceUrl"/);
});

void test('Rock Studio sends only the generated manifest to the registry', () => {
  const requestBody = studio.slice(
    studio.indexOf("fetch('/api/sky/tool-packages'"),
    studio.indexOf("if (response.ok)"),
  );
  assert.match(requestBody, /manifest: intake\.manifest/);
  assert.doesNotMatch(requestBody, /code:/);
  assert.doesNotMatch(requestBody, /source,/);
});
