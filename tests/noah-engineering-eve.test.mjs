import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
import { NOAH_LOCALES, noahTranslate } from '../lib/noah-i18n.ts';
import * as navigation from '../lib/eve-engineering-navigation.ts';
import { noahEngineeringSteps } from '../lib/noah-engineering.ts';
import * as guidance from '../lib/noah-engineering-eve.ts';
import { withMiniSite } from '../services/sky-web/domain-router.mjs';
import * as cloud from '../lib/noah-cloud-contract.ts';
import * as intent from '../lib/owner-intent.ts';

void test('every author stage embeds the editable Eve consultation, keeping the device and catalog reachable', () => {
  for (const locale of NOAH_LOCALES) {
    const ui = screen({ locale, modules: {
      '@/lib/noah-engineering-eve': guidance, '@/lib/eve-engineering-navigation': navigation,
      '@/lib/noah-cloud-contract': cloud, '@/lib/owner-intent': intent, './noah-ready-detail': { default: () => null },
    } });
    for (const stage of noahEngineeringSteps) {
      const page = ui.mount('components/noah-engineering-eve.tsx', { stage });
      const links = navigation.eveEngineeringNavigation(stage, locale);
      assert.equal(page.find('textarea')[0].props.value, noahTranslate(locale, guidance.engineeringAdvice[stage].question));
      assert.equal(page.find('a').length, 0, 'Eve is embedded in this page');
      assert.equal(links.consultation, `/noah/engineering?step=${stage}&lang=${locale}#eve-compose`);
      assert.equal(links.catalog, `/noah/engineering/combinations?engineering=${stage}&lang=${locale}`);
      assert.equal(links.device, `/os/eve?engineering=${stage}&lang=${locale}&mode=device#eve-compose`);
    }
    const initial = ui.mount('components/noah-engineering-eve.tsx', { emptyDraft: true });
    assert.equal(initial.find('textarea')[0].props.value, '');
    assert.deepEqual(ui.calls.filter(call => call.method === 'POST'), []);
    assert.equal(ui.storage.size, 0);
  }
  for (const stage of [undefined, null, '', 'constructor', '__proto__', 'custom request', ['test']]) {
    assert.equal(guidance.engineeringEveDraft(stage, 'ja'), '');
    assert.equal(navigation.eveEngineeringNavigation(stage, ['ar']).consultation, '/noah/engineering?step=create&lang=ja#eve-compose');
  }
});

void test('the site router preserves the engineering composer on the public and local hosts', async () => {
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

void test('Eve displays a returned chain with exact handoffs and proposed roles without making a new call', async () => {
  const steps = [
    { profile: 'memory', role: '質問を分類', input: '参加者の質問', output: 'テーマごとの質問集' },
    { profile: null, role: '研修計画を組むAgent', input: 'テーマごとの質問集', output: '研修の時間割' },
  ];
  const ui = screen({ modules: { '@/lib/noah-cloud-contract': cloud, '@/lib/owner-intent': intent, './noah-ready-detail': { default: () => null } },
    fetch: () => ({ body: { ownerScope: 'a', connection: null, jobs: [
      { id: 'owned', prompt: '研修を開きたい', state: 'returned', result: { text: 'original' }, files: [], proposal: { steps, deliverable: '研修の時間割' } },
    ] } }) });
  const view = ui.mount('components/noah-cloud-agent.tsx', { projectId: cloud.NOAH_EVE_HERMES_PROJECT, profile: 'hermes', providerFamilyId: null, eveDraft: '', proposeCombination: true });
  await view.tick(0);
  assert.deepEqual(view.find('dd').map(n => view.text(n)), ['参加者の質問','テーマごとの質問集','テーマごとの質問集','研修の時間割']);
  assert.match(view.text(), /Memory/);
  assert.match(view.text(), /新しく作る役割の候補/);
  assert.equal(ui.calls.filter(call => call.method === 'POST').length, 0);
});
