import test from 'node:test';
import assert from 'node:assert/strict';
import * as engineering from '../lib/noah-engineering.ts';
import * as navigation from '../lib/noah-navigation.ts';
import { screen } from './fixtures/noah/screen.mjs';

const id = 'df212ad4-2048-41b7-b203-86b4d6727c21';
const agent = { id, manifest: { name: '研修の準備', version: '1.0.0' }, uploadState: 'ready' };
const scope = 'engineering-test-owner';
function browse(stage, selected, fetch) {
  const ui = screen({ fetch, modules: {
    '@/lib/noah-engineering': engineering, '@/lib/noah-navigation': navigation,
    './noah-engineering-eve': { default: ({stage}) => 'Eve-' + stage },
    './noah-agent-upload-form': { default: ({ engineeringMode }) => 'upload-' + engineeringMode },
    './noah-agent-detail': { default: ({ id, remote, engineering }) => remote && engineering ? 'trial-' + id : 'wrong' },
    './noah-publisher': { default: ({ engineeringAgentId }) => 'publish-' + engineeringAgentId },
  }});
  return { ui, page: ui.mount('components/noah-engineering.tsx', { step: stage, agent: selected }) };
}

void test('the single entrance presents four actions and Eve without loading or running any private agent', async () => {
  assert.deepEqual(engineering.noahEngineeringSelection({step: ['test'], agent: 'untrusted'}), {step:null,agent:null});
  const { ui, page } = browse(null, null, () => { throw Error('landing must not request owner data'); });
  assert.deepEqual(page.find('a').filter(a => a.props.href.includes('?step=')).map(a => a.props.href),
    engineering.noahEngineeringSteps.map(s => engineering.noahEngineeringHref(s) + '#engineering-work'));
  assert.match(page.text(), /Eve-create/);
  for (const step of ['create','connect']) {
    const { page: selected } = browse(step, null, () => { throw Error('unexpected'); });
    assert.ok(selected.text().includes('upload-' + step));
  }
  assert.equal(ui.calls.length, 0);
});

void test('trying and listing retain precisely the owned version, also when it is older than the list page', async () => {
  for (const step of ['test','publish']) {
    const { page, ui } = browse(step, id, ({ url, method }) => {
      assert.equal(method, 'GET');
      if (url === '/api/noah/agents') return { body: { agents: [], ownerScope: scope } };
      assert.equal(url, '/api/noah/agents/' + id);
      return { body: { agent, ownerScope: scope } };
    });
    await page.flush();
    assert.ok(page.text().includes((step === 'test' ? 'trial-' : 'publish-') + id));
    assert.equal(page.find('select')[0].props.value, id);
    if (step === 'test') assert.equal(page.find('a', 'このAgentをストアに載せる')[0].props.href, engineering.noahEngineeringHref('publish', id) + '#engineering-work');
    assert.equal(ui.calls.length, 2);
  }
});

void test('unavailable and changed-owner selections cannot open the runner or a different publication', async () => {
  for (const detail of [{status:404}, {body:{agent, ownerScope:'another-owner'}}, {body:{agent:{...agent,uploadState:'pending'},ownerScope:scope}}]) {
    const { page, ui } = browse('publish', id, ({url}) => url.endsWith('/agents') ? {body:{agents:[],ownerScope:scope}} : detail);
    await page.flush();
    assert.doesNotMatch(page.text(), /publish-df212|trial-df212/);
    assert.ok(ui.calls.every(call => call.method === 'GET'));
    assert.match(page.text(), /読み込めません|開けません/);
  }
  const { page } = browse('test', id, () => ({status:401}));
  await page.flush();
  const login = new URL(page.find('a', 'サインインして続ける')[0].props.href, 'https://avoado.si');
  assert.equal(login.searchParams.get('returnTo'), engineering.noahEngineeringHref('test', id));
});
