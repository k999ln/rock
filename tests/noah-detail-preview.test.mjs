import test from 'node:test';
import assert from 'node:assert/strict';
import { noahDetailPreviewRecord, readNoahDetailPreview, NOAH_DETAIL_PREVIEW_KEY } from '../lib/noah-detail-preview.ts';
import { noahRegistrationReport } from '../lib/noah-registration-report.ts';
import { screen } from './fixtures/noah/screen.mjs';
const id = 'project-' + 'a'.repeat(64), href = `/noah/discover/agent?id=${id}`;
const card = { id, name: 'Immediate Agent', summary: 'Already read from the catalog', provider: 'Example', ownerScope: 'must-not-copy', connection: { id: 'private' } };
void test('card handoff is display-only, target-bound and expires', () => {
  const raw = noahDetailPreviewRecord(href, card, 1000);
  assert.equal(readNoahDetailPreview(raw, href, 1001).name, card.name);
  assert.doesNotMatch(raw, /ownerScope|connection|must-not-copy/);
  assert.equal(readNoahDetailPreview(raw, href + 'b', 1001), null);
  assert.equal(readNoahDetailPreview(raw, href, 301001), null);
  assert.equal(readNoahDetailPreview(raw, href, 999), null);
  assert.equal(noahDetailPreviewRecord('https://other.test' + href, card), null);
  assert.equal(noahDetailPreviewRecord(href + '&firstJob=memory', card), null);
});
void test('detail renders selected card while the authoritative request is unresolved', () => {
  const quiet = { default: () => null };
  const ui = screen({ modules: { './noah-agent-feedback': quiet, './noah-ready-detail': quiet, './noah-training-plugin': quiet, './noah-cloud-agent': quiet, './noah-provider-runner': quiet }, storage: { [NOAH_DETAIL_PREVIEW_KEY]: noahDetailPreviewRecord(href, card, Date.UTC(2026,10,21,3)) }, fetch: () => new Promise(() => {}) });
  const page = ui.mount('components/noah-project-detail.tsx', { id });
  assert.match(page.text(), /Immediate Agent/);
  assert.match(page.text(), /Already read from the catalog/);
  assert.doesNotMatch(page.text(), /Agentを確認しています|スケボー|読み込み中/);
  assert.equal(page.find('button').find(x => x.props.children === '接続')?.props.disabled, true);
});
void test('home defaults to all sources, while explicit connectable selection remains', async () => {
  for (const [search, expected] of [['', ''], ['?collectionSource=noah', 'noah']]) {
    const ui = screen({ search, modules: { './noah-pin-grid': { default: () => null } }, fetch: async () => ({ body: { items: [], total: 0, nextCursor: null, ownerScope: null } }) });
    const page = ui.mount('components/noah-home.tsx', { mode: 'public' }); await page.flush();
    assert.equal(new URL(ui.calls[0].url, 'https://avoado.si').searchParams.get('source'), expected);
  }
});
void test('registration report distinguishes absent definitions, authentication, malformed definitions and network failure', async () => {
  const entry = { card: { ...card, href: 'https://github.com/example/agent' }, families: [], observedAt: 0 };
  const missing = await noahRegistrationReport(entry, async () => new Response('', { status: 404 }));
  assert.equal(missing.state, 'needs-information'); assert.match(missing.items[0].field, /接続先/);
  const malformed = await noahRegistrationReport(entry, async () => new Response('invalid json'));
  assert.equal(malformed.state, 'needs-information'); assert.match(malformed.items[0].detail, /JSON/);
  const network = await noahRegistrationReport(entry, async () => { throw new TypeError('offline'); });
  assert.equal(network.state, 'unavailable'); assert.match(network.items[0].detail, /未判定/);
  const auth = await noahRegistrationReport(entry, async () => Response.json({ name: 'example/agent', remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp', headers: [{ name: 'Authorization', isRequired: true, isSecret: true }] }] }));
  assert.equal(auth.state, 'needs-information'); assert.match(auth.items[0].field, /認証/);
});
