import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { catalog } from '../lib/catalog.ts';
import { skyToolUiState } from '../lib/sky-tool-ui.ts';
import { skyToolExecutionScope } from '../lib/sky-tool-execution-scope.ts';

// Render the real component with inert child runners. Mounting a runner is an
// observable boundary here; backend effects and auth are covered by UI/API tests.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../components/sky-tool-workspace.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

function render(toolId, workspace = false, { tools = catalog, hostMismatch = null } = {}) {
  const mounts = [];
  const inert = (name) => function RunnerProbe(props) {
    mounts.push({ name, tool: props.tool, workspace: props.workspace });
    return React.createElement('div', { 'data-child': name });
  };
  const modules = {
    'react': { ...React, useSyncExternalStore: () => 'mac' },
    '@/lib/catalog': { catalog: tools },
    '@/lib/sky-tool-ui': { skyToolUiState },
    '@/lib/sky-tool-execution-scope': { skyToolExecutionScope },
    '@/lib/use-sky-tool-context': { useSkyToolContext: () => ({}) },
    '@/lib/sky-tool-compatibility': { detectSkyHost: () => 'mac', catalogHostMismatch: () => hostMismatch },
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@/components/workspace-shell': ({ children }) => React.createElement('main', null, children),
    '@/components/ui/dialog': { Dialog: ({ open, children }) => open ? children : null },
    '@/components/tool-icon': { ToolIcon: () => null },
    '@/components/sky-tool-overview': inert('overview'),
    '@/components/zema-navigation': inert('zema-nav'),
    '@/components/sky-library-save': inert('bookmark'),
    '@/components/amc-workspace': inert('amc'),
    '@/components/coconala-team-workspace': inert('coconala'),
    '@/components/csv-business-workspace': inert('csv'),
    '@/components/mr-tool-runner': { MrToolRunner: inert('mr') },
    '@/components/sky-candidate-runner': { SkyCandidateRunner: inert('candidate') },
    '@/components/fashion-brand-ops-runner': { FashionBrandOpsRunner: inert('fashion') },
    '@/components/sky-connection-center': inert('voice-connection'),
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: (id) => {
      if (Object.hasOwn(modules, id)) return modules[id];
      if (id.endsWith('.module.css')) return {};
      if (id === 'lucide-react') return new Proxy({}, { get: () => () => null });
      if (id === 'react/jsx-runtime') return require(id);
      throw new Error(`Unexpected component dependency: ${id}`);
    },
  });
  const html = renderToStaticMarkup(React.createElement(exports.default, { toolId, workspace }));
  return { html, mounts };
}

const runnerNames = new Set(['amc', 'coconala', 'csv', 'mr', 'candidate', 'fashion', 'voice-connection']);
for (const tool of catalog) {
  void test(`Sky detail for ${tool.id} only describes, bookmarks and links to Zema`, () => {
    const { html, mounts } = render(tool.id);
    assert.deepEqual(mounts.filter((item) => runnerNames.has(item.name)), []);
    assert.equal(mounts.filter((item) => item.name === 'bookmark').length, 1);
    assert.ok(html.includes(`href="/zema/tools/${encodeURIComponent(tool.id)}"`));
    assert.ok(html.includes('Zemaで開く'));
    assert.ok(html.includes('料金・実費'));
    assert.ok(html.includes('利用環境'));
    assert.ok(html.includes('購入や実行の承認は行いません'));
    assert.ok(!html.includes('<form'));
  });
}

void test('browser citations does not require a PC and preserves its existing Zema runner', () => {
  const sky = render('mr-citations');
  assert.ok(sky.html.includes('PC接続は必須ではありません'));
  assert.ok(!sky.html.includes('href="/sky/network"'));
  const zema = render('mr-citations', true);
  assert.deepEqual(zema.mounts.filter((item) => item.name === 'mr').map((item) => item.tool), ['citations']);
  assert.ok(!zema.mounts.some((item) => item.name === 'bookmark'));
  assert.ok(zema.html.includes('href="/zema/library"'));
});

for (const [toolId, name] of [['rockstar-amc', 'amc'], ['coconala', 'coconala'], ['rockstar-csv-cleanup', 'csv']]) {
  void test(`Zema retains the dedicated ${toolId} workspace`, () => {
    const { mounts } = render(toolId, true);
    assert.equal(mounts.filter((item) => item.name === name).length, 1);
    if (name !== 'amc') assert.equal(mounts.find((item) => item.name === name).workspace, true);
  });
}

void test('Zema retains candidate and fashion runners', () => {
  const candidate = catalog.find((tool) => tool.runner === 'candidate-local' && !tool.launchPath);
  assert.ok(candidate);
  assert.ok(render(candidate.id, true).mounts.some((item) => item.name === 'candidate'));
  assert.ok(render('fashion-brand-ops', true).mounts.some((item) => item.name === 'fashion'));
});

void test('IP Studio retains its Zema PC boundary and voice setup while Sky only describes it', () => {
  const sky = render('rockstar-ip-studio');
  assert.ok(sky.html.includes('href="/sky/network"'));
  assert.ok(!sky.html.includes('音声・電話の接続設定'));
  const zema = render('rockstar-ip-studio', true);
  assert.ok(zema.html.includes('音声・電話の接続設定'));
  assert.ok(zema.html.includes('href="http://127.0.0.1:18767/"'));
  const incompatible = render('rockstar-ip-studio', true, { hostMismatch: 'PCで利用してください' });
  assert.ok(incompatible.html.includes('PCでIP Studioを開いてください'));
  assert.ok(!incompatible.html.includes('href="http://127.0.0.1:18767/"'));
});

void test('unknown products have neither bookmark nor handoff nor runner on either route', () => {
  for (const workspace of [false, true]) {
    const { html, mounts } = render('missing-tool', workspace);
    assert.ok(html.includes('このツールは見つかりません'));
    assert.deepEqual(mounts, []);
    assert.ok(!html.includes('/zema/tools/'));
  }
});

void test('handoff keeps an encoded product ID inside one Zema path segment', () => {
  const tool = { ...catalog.find((item) => item.id === 'mr-citations'), id: 'space / 日本語?x=1#hash' };
  const { html } = render(tool.id, false, { tools: [tool] });
  assert.ok(html.includes(`href="/zema/tools/${encodeURIComponent(tool.id)}"`));
});
