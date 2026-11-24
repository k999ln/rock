import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
import { NOAH_LOCALES, noahTranslate } from '../lib/noah-i18n.ts';
import { noahEngineeringSteps } from '../lib/noah-engineering.ts';
import * as guidance from '../lib/noah-engineering-eve.ts';
import { withMiniSite } from '../services/sky-web/domain-router.mjs';
import * as cloud from '../lib/noah-cloud-contract.ts';
import * as intent from '../lib/owner-intent.ts';

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

void test('Eve sends the edited question only after confirmation and shows the returned Hermes text in the page', async () => {
  let connection = null, job = null, starts = 0;
  const question = '読書メモから次に読む本を提案するAgentを作りたい。';
  const reply = 'fixture-reply: 読書メモの入力例と、次の本を選ぶ基準を決めましょう。';
  const projectId = cloud.NOAH_EVE_HERMES_PROJECT;
  const ui = screen({
    modules: { '@/lib/noah-cloud-contract': cloud, '@/lib/owner-intent': intent, './noah-ready-detail': { default: () => null } },
    fetch({ method, url, body, headers }) {
      if (method === 'GET') {
        const params = new URL(url, 'https://noah.test').searchParams;
        assert.equal(params.get('projectId'), projectId);
        assert.equal(params.get('purpose'), 'eve-engineering');
        if (params.has('jobId')) {
          assert.equal(params.get('jobId'), job.id);
          job = { ...job, state: 'returned', result: { text: reply }, calls: 2 };
          return { body: { ownerScope: 'owner', job } };
        }
        return { body: { ownerScope: 'owner', connection, jobs: job ? [job] : [] } };
      }
      assert.equal(headers[intent.OWNER_SCOPE_HEADER], 'owner');
      assert.equal(body.purpose, 'eve-engineering');
      assert.equal(body.projectId, projectId);
      if (!body.confirm) return { status: 409, body: { confirmationRequired: true, error: '確認してください' } };
      if (body.action === 'connect') connection = { id: 'connection-1', state: 'connected' };
      else {
        assert.equal(body.action, 'start');
        assert.equal(body.prompt, question);
        starts++;
        job = { id: body.jobId, state: 'running', prompt: body.prompt };
      }
      return { status: 202 };
    },
  });
  const props = { projectId, profile: 'hermes', providerFamilyId: null, eveDraft: guidance.engineeringAdvice.create.question };
  const view = ui.mount('components/noah-cloud-agent.tsx', props);
  await view.tick(0);
  assert.equal(view.find('textarea')[0].props.value, props.eveDraft);
  await view.change(view.find('textarea')[0], question);
  assert.equal(ui.calls.filter(call => call.method === 'POST').length, 0);
  await view.click('接続して使う');
  await view.click('確認して接続');
  await view.submit(view.find('form')[0]);
  assert.equal(starts, 0);
  assert.equal(view.find('pre').length, 0);
  await view.click('確認して依頼');
  assert.equal(starts, 1);
  assert.equal(view.text(view.find('pre')[0]), reply);
  assert.match(view.text(), /Eveの返答（Hermesで実行）/);
  const reread = ui.mount('components/noah-cloud-agent.tsx', props);
  await reread.tick(0);
  assert.equal(reread.text(reread.find('pre')[0]), reply);
  assert.equal(starts, 1);
});
