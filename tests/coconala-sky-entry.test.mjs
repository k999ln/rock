import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { catalog } from '../lib/catalog.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

void test('Sky exposes one Coconala Tool with both the order workflow and pre-application check', () => {
  const coconala = catalog.filter((tool) => tool.id === 'coconala');
  assert.equal(coconala.length, 1);
  assert.equal(catalog.some((tool) => tool.id === 'coconala-team-ops'), false);
  assert.equal(coconala[0].launchPath, '/sky/tools/coconala');
  assert.equal(coconala[0].runner, 'coconala');

  const sky = source('components/sky-workspace.tsx');
  assert.match(sky, /if \(tool\.id === 'coconala'\) \{[\s\S]*?router\.push\('\/sky\/tools\/coconala'\)/);

  const toolPage = source('components/sky-tool-workspace.tsx');
  assert.match(toolPage, /if \(toolId === 'coconala'\) return <CoconalaTeamWorkspace/);

  const workspace = source('components/coconala-team-workspace.tsx');
  assert.match(workspace, /案件管理/);
  assert.match(workspace, /応募前チェック/);
  assert.match(workspace, /<MrToolRunner tool="coconala"/);
  assert.match(workspace, /\/api\/coconala-team/);
  assert.match(workspace, /aria-label="ココナラの機能と利用方法を見る"/);
  assert.match(workspace, /<SkyToolOverview tool=\{coconalaTool\}/);
  assert.match(source('app/coconala-team/page.tsx'), /redirect\('\/sky\/tools\/coconala'\)/);
});
