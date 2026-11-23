import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as modelCatalog from '../lib/noah-model-catalog.mjs';
import { screen } from './fixtures/noah/screen.mjs';

void test('signed-out help and device settings lead to the optional Mac runner, checksum and supported models', async () => {
  const modules = {
    './workspace-shell': { default: ({ children }) => children },
    './noah-navigation': { default: () => null },
    './sky-device-agent-connections': { default: () => null },
    '@/lib/use-sky-service-status': { useSkyServiceStatus: () => ({}) },
    '@/lib/noah-bot-notice': { noahBotNotice: () => ({ shown: false, paragraphs: [] }) },
    '@/lib/noah-model-catalog.mjs': modelCatalog,
    '@/components/noah-interaction': { NoahHapticsSetting: () => null },
    '@/components/noah-locale': { NoahLanguageSetting: () => null, useNoahLocale: () => ({ t: x => x }) },
  };
  const ui = screen({ modules, fetch: () => ({ status: 401, body: {} }) });
  const href = (view, label) => {
    const matches = view.find('a', label);
    assert.equal(matches.length, 1, label);
    return matches[0].props.href;
  };
  assert.equal(href(ui.mount('app/noah/preferences/page.tsx'), '端末・実行先'), '/noah/devices');
  const devices = ui.mount('components/sky-connected-runtime.tsx');
  await devices.flush();
  assert.match(devices.text(), /サインインして自分の担当を見る/);
  assert.equal(href(devices, '自分のMacでAgentを動かす'), '#mac');
  assert.ok(devices.find('section').some(node => node.props.id === 'mac'));
  assert.equal(href(ui.mount('components/sky-service-help.tsx'), 'Mac用Noahと導入手順を見る'), '/noah/devices#mac');
  const guide = devices;
  assert.equal(href(guide, 'Agentを使う'), '/noah/my?view=agents');
  const selected = ui.mount('components/noah-mac-handoff.tsx', { initialAgent: 'memory' });
  assert.equal(href(selected, 'Agentを使う'), '/noah/agents/memory');
  const zip = href(guide, 'Mac用Noahをダウンロード');
  const checksum = href(guide, 'ZIPのSHA-256を確認');
  assert.equal(zip, '/noah-downloads/Noah-Mac.zip');
  assert.equal(checksum, zip + '.sha256');
  for (const model of modelCatalog.NOAH_MODELS.filter(model => !model.derivedFrom)) {
    assert.ok(guide.text().includes(model.name), model.id);
  }
  const bytes = await readFile(new URL('../public' + zip, import.meta.url));
  const signature = await readFile(new URL('../public' + checksum, import.meta.url), 'utf8');
  assert.equal(signature.trim(), createHash('sha256').update(bytes).digest('hex') + '  Noah-Mac.zip');
});
