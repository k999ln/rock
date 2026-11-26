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
import * as chat from '../lib/eve-chat.ts';
import * as local from '../lib/eve-chat-local.ts';

void test('every author stage embeds the editable Eve consultation, keeping the device and catalog reachable', () => {
  for (const locale of NOAH_LOCALES) {
    const ui = screen({ locale, modules: {
      '@/lib/eve-chat': chat, '@/lib/eve-chat-local': local, '@/lib/noah-engineering-eve': guidance, '@/lib/eve-engineering-navigation': navigation,
      '@/lib/noah-cloud-contract': cloud, '@/lib/owner-intent': intent, './noah-ready-detail': { default: () => null },
    } });
    for (const stage of noahEngineeringSteps) {
      const page = ui.mount('components/noah-engineering-eve.tsx', { stage });
      const links = navigation.eveEngineeringNavigation(stage, locale);
      assert.equal(page.find('textarea')[0].props.value, noahTranslate(locale, guidance.engineeringAdvice[stage].question));
      assert.equal(page.find('a').filter(a => a.props.href.startsWith('/os/eve')).length, 0, 'Eve is embedded in this page');
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
  const conversion = { kind: 'conversion', recipient: '営業チーム', outcome: '相談の希望を受け取る', acceptance: '相談予約が承認される', evidence: '予約承認記録' };
  const scheme = { kind: 'user_goal', recipient: '研修参加者', outcome: '必要なテーマを学べる', acceptance: '全質問を時間割の各回に割り当てる', evidence: '質問一覧と参加者の受領記録' };
  const ui = screen({ modules: { '@/lib/noah-cloud-contract': cloud, '@/lib/owner-intent': intent, './noah-ready-detail': { default: () => null } },
    fetch: () => ({ body: { ownerScope: 'a', connection: null, jobs: [
      { id: 'owned', prompt: '研修を開きたい', runtimePurpose: 'eve-combination-advice', state: 'returned', result: { text: 'original' }, files: [], proposal: { steps, deliverable: '研修の時間割', scheme } },
      { id: 'legacy-proposal', prompt: '以前の設計', state: 'returned', result: { text: 'previous design' }, files: [], proposal: { steps, deliverable: '研修の時間割' } },
      { id: 'previous', prompt: '過去の相談', state: 'returned', result: { text: 'Hermesの以前の回答' }, files: [] },
      { id: 'commercial', prompt: '相談予約を取りたい', runtimePurpose: 'eve-combination-advice', state: 'returned', result: { text: 'submitted' }, files: [], proposal: { steps, deliverable: '予約の提案', scheme: conversion } },
    ] } }) });
  const view = ui.mount('components/noah-cloud-agent.tsx', { projectId: cloud.NOAH_EVE_HERMES_PROJECT, profile: 'hermes', providerFamilyId: null, eveDraft: '', proposeCombination: true });
  await view.tick(0);
  const handoffs = ['参加者の質問','テーマごとの質問集','テーマごとの質問集','研修の時間割'];
  assert.deepEqual(view.find('dd').map(n => view.text(n)), [scheme.recipient, scheme.outcome, scheme.acceptance, scheme.evidence, ...handoffs, ...handoffs, conversion.recipient, conversion.outcome, conversion.acceptance, conversion.evidence, ...handoffs]);
  assert.deepEqual(view.find('dt').slice(0, 4).map(n => view.text(n)), ['届ける相手','相手が受け取る価値','ユーザーの目的','確かめる記録']);
  assert.match(view.text(), /Memory/);
  assert.match(view.text(), /新しく作る役割の候補/);
  assert.match(view.text(), /Cloudflare Workers AIのgpt-oss-20b/);
  const articles = view.find('article');
  assert.equal(view.find('h5', 'スキームの成立条件').length, 2);
  assert.match(view.text(articles[0]), /本人が目的を決めるとスキームが成立/);
  assert.match(view.text(articles[0]), /目的の達成は未検証/);
  assert.match(view.text(articles[3]), /成果地点に到達するとスキームが成立/);
  assert.match(view.text(articles[3]), /相談予約が承認される/);
  assert.match(view.text(articles[3]), /到達は未検証/);
  assert.doesNotMatch(view.text(articles[3]), /入金済み|成立済み/);
  assert.doesNotMatch(view.text(articles[0]), /成立済み|検証済み|完成しました/);
  assert.doesNotMatch(view.text(articles[1]), /スキームの成立条件|未検証|質問一覧と参加者の受領記録/);
  assert.doesNotMatch(view.text(articles[2]), /スキームの成立条件|未検証/);
  assert.match(view.text(articles[0]), /Eveの返答（設計相談用モデル）/);
  assert.doesNotMatch(view.text(articles[0]), /Hermesで実行/);
  assert.match(view.text(articles[1]), /Eveの返答（Hermesで実行）/);
  assert.doesNotMatch(view.text(articles[1]), /設計相談用モデル/);
  assert.equal(ui.calls.filter(call => call.method === 'POST').length, 0);
});
