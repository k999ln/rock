import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skyHomePanelForHash, osNavigationItems, activeOsNavigation } from '../lib/os-navigation.ts';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

void test('Home combines Add and management while old links preserve their action', () => {
  for (const hash of ['#sky', '#catalog', '#optional-features']) assert.equal(skyHomePanelForHash(hash), 'discover');
  assert.equal(skyHomePanelForHash('#sky-manage'), 'manage');
  for (const hash of ['', '#timeline', '#communities', '#community=fixture', '#sky-manage-other']) assert.equal(skyHomePanelForHash(hash), null);
  assert.deepEqual(osNavigationItems.map(x => x.id), ['stream', 'eve', 'communities']);
  for (const hash of ['#sky', '#sky-manage', '#catalog']) assert.equal(activeOsNavigation('/', hash), 'stream');
  assert.match(read('app/sky/agents/page.tsx'), /redirect\('\/#sky-manage'\)/);
});

void test('embedded owner settings reuse the same store, revision, device connections and Eve links', () => {
  const library = read('components/sky-agent-library.tsx'), home = read('components/home-screen.tsx');
  assert.match(library, /embedded \? content : <WorkspaceShell/);
  assert.match(library, /fetch\('\/api\/sky\/agents'/);
  assert.match(library, /revision: selected\?\.revision \?\? 0/);
  assert.match(library, /skyAgentEvePath\(selected\)/);
  assert.match(library, /<SkyDeviceAgentConnections/);
  assert.match(home, /<SkyAgentLibrary embedded/);
  assert.match(home, /lazy\(\(\) => import\('\.\/sky-agent-library'\)\)/);
});

void test('panel switching and closing preserve the editor and timeline; keyboard navigation remains available', () => {
  const home = read('components/home-screen.tsx'), dialog = read('components/sky-discovery-dialog.tsx');
  assert.match(home, /panelVisited &&/);
  assert.match(home, /hidden=\{view\s*!==\s*'manage'\}/);
  assert.match(home, /hidden=\{view\s*!==\s*'discover'\}/);
  assert.doesNotMatch(dialog, /open\s*&&\s*children/);
  assert.match(home, /key=\{view\s*===\s*'discover'\s*\|\|\s*view\s*===\s*'manage'\s*\?\s*'home'\s*:\s*view\}/);
  assert.match(dialog, /onCancel=/);
  assert.match(dialog, /node\.showModal\(\)/);
  for (const text of ['role="tablist"', 'role="tab"', 'aria-selected', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.ok(dialog.includes(text), text);
  assert.match(read('components/home-screen.module.css'), /repeat\(\s*var\(--os-navigation-count, 3\),\s*minmax\(0, 1fr\)\s*\)/);
});
