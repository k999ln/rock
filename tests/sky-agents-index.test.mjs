import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

void test('Sky Agents index has an implemented owner library and retains the citations destination', () => {
  const source = readFileSync('app/sky/agents/page.tsx', 'utf8');
  assert.match(source, /SkyAgentLibrary/u);
  assert.ok(readFileSync('app/sky/agents/citations/page.tsx', 'utf8').length > 0);
});
