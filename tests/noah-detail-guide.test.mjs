import assert from 'node:assert/strict';
import test from 'node:test';
import { NOAH_LOCALES } from '../lib/noah-i18n.ts';
import { noahDetailGuide } from '../lib/noah-detail-guide.ts';

void test('CallMCP editorial claims attach only to the canonical provider family', () => {
  for (const id of ['CallMCP', 'mcp-registry:example/callmcp', 'mcp-registry:ai.callmcp/server-copy']) {
    assert.equal(noahDetailGuide(id), null);
  }
  const guide = noahDetailGuide('mcp-registry:ai.callmcp/server');
  assert.match(guide.priceLabel, /有料/);
  assert.match(guide.requirements.find(row => row.label === '提供元の料金').text, /無料プレビュー.*有料プラン/);
  assert.match(guide.requirements.find(row => row.label === '送信先').text, /callmcp\.ai/);
  assert.match(guide.requirements.find(row => row.label === 'ほかの連絡手段').text, /SMS.*承認.*WhatsApp.*24時間.*メール/);
  assert.match(guide.examples[1].output, /文字起こしがあれば/);
  assert.match(guide.examples[0].output, /16時.*通話ID.*応答なし/);
});

void test('every Noah language presents sample inputs and outcomes with the same official references', () => {
  const guides = NOAH_LOCALES.map(locale => noahDetailGuide('mcp-registry:ai.callmcp/server', locale));
  assert.equal(new Set(guides.map(guide => guide.headline)).size, NOAH_LOCALES.length);
  assert.equal(new Set(guides.map(guide => guide.priceLabel)).size, NOAH_LOCALES.length);
  for (const guide of guides) {
    assert.equal(guide.name, 'CallMCP');
    assert.equal(guide.examples.length, 2);
    assert.ok(guide.examples.every(example => example.title && example.input && example.output));
    assert.deepEqual(guide.sources.map(source => source.href), [
      'https://callmcp.ai/mcp-server-for-phone-calls', 'https://www.kaicalls.com/docs/api/connectors', 'https://callmcp.ai/pricing',
    ]);
  }
});
