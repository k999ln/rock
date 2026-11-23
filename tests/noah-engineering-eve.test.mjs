import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
import { NOAH_LOCALES, noahTranslate } from '../lib/noah-i18n.ts';
import { noahEngineeringSteps } from '../lib/noah-engineering.ts';
import * as guidance from '../lib/noah-engineering-eve.ts';
import { withMiniSite } from '../services/sky-web/domain-router.mjs';

void test('each engineering step opens a localized editable Eve draft in another tab, with only a fixed step and language in the URL', () => {
  for (const locale of NOAH_LOCALES) {
    const ui = screen({ locale, modules: { '@/lib/noah-engineering-eve': guidance } });
    for (const stage of noahEngineeringSteps) {
      const page = ui.mount('components/noah-engineering-eve.tsx', { stage, agentName: 'private-agent' });
      const [link] = page.find('a');
      const url = new URL(link.props.href, 'https://avoado.si');
      assert.equal(url.pathname, '/os/eve');
      assert.equal(url.hash, '#eve-compose');
      assert.deepEqual([...url.searchParams], [['engineering', stage], ['lang', locale]]);
      assert.equal(link.props.target, '_blank');
      assert.match(link.props.rel, /noopener/);
      const { question, tip } = guidance.engineeringAdvice[stage];
      assert.ok(page.text().includes(noahTranslate(locale, tip)));
      const draft = guidance.engineeringEveDraft(url.searchParams.get('engineering'), url.searchParams.get('lang'));
      assert.equal(draft, noahTranslate(locale, question));
      if (locale !== 'ja') {
        assert.notEqual(draft, question);
        assert.notEqual(noahTranslate(locale, tip), tip);
      }
    }
    assert.deepEqual(ui.calls, []);
    assert.equal(ui.storage.size, 0);
  }
  for (const stage of [undefined, null, '', 'constructor', '__proto__', 'custom request', ['test']]) {
    assert.equal(guidance.engineeringEveDraft(stage, 'ja'), '');
  }
});

void test('the existing site router passes engineering handoffs to Eve on the public and local hosts', async () => {
  const seen = [];
  const router = withMiniSite({ fetch(request) { seen.push(request.url); return new Response('Eve'); } });
  for (const origin of ['https://avoado.si', 'http://127.0.0.1:48623']) {
    const href = new URL(guidance.engineeringEveHref('test', 'ja'), origin);
    href.hash = '';
    assert.equal((await router.fetch(new Request(href), {}, {})).status, 200);
    assert.equal(seen.at(-1), href.href);
  }
});
