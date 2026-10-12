import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { catalog } from '../lib/catalog.ts';

void test('every Sky catalog tool has its own visible icon', () => {
  const source = readFileSync(new URL('../components/tool-icon.tsx', import.meta.url), 'utf8');
  const mapping = source.split('export const toolIcons: Record<string, LucideIcon> = {')[1]?.split('\n};')[0];
  assert.ok(mapping, 'tool icon mapping must exist');
  const entries = [...mapping.matchAll(/^\s*(?:'([^']+)'|([a-z][\w-]*)):\s*([A-Za-z][\w]*),?$/gm)]
    .map((match) => ({ id: match[1] ?? match[2], icon: match[3] }));
  const ids = catalog.map((tool) => tool.id);
  assert.equal(entries.length, ids.length);
  assert.deepEqual(entries.map((entry) => entry.id).sort(), [...ids].sort());
  assert.equal(new Set(entries.map((entry) => entry.icon)).size, entries.length);
});
