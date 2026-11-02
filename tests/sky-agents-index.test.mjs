import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

void test('Saved Sky Agents index opens owner management inside Home', () => {
  const source = readFileSync('app/sky/agents/page.tsx', 'utf8');
  assert.match(source, /redirect\('\/#sky-manage'\)/);
  assert.doesNotMatch(source, /citations/);
  assert.match(readFileSync('components/home-screen.tsx', 'utf8'), /<SkyAgentLibrary embedded/);
  const library = readFileSync('components/sky-agent-library.tsx', 'utf8');
  assert.match(library, /fetch\('\/api\/sky\/agents', \{ method: 'PUT'/);
  assert.match(library, /revision: selected\?\.revision \?\? 0/);
  assert.match(library, /parseSkyAgentSettings\(settings\)/);
  assert.match(library, /settings\.provider/);
  assert.match(library, /settings\.model/);
  assert.match(library, /href="\/os\/eve#eve-work-results"/);
  assert.match(library, /この担当の新しい依頼は停止中です/);
  assert.match(library, /保存できませんでした。入力は残っています/);
});
