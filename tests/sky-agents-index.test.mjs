import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

void test('Sky Agents index has one implemented first-party destination', () => {
  const source = readFileSync('app/sky/agents/page.tsx', 'utf8');
  assert.match(source, /permanentRedirect\('\/sky\/agents\/citations'\)/u);
});
