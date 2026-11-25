import test from 'node:test';
import assert from 'node:assert/strict';
import { eveToolPath, eveWorkspaceNavigation, accountReturnNavigation, newsSourceNavigation } from '../lib/eve-noah-navigation.ts';
import { eveNoahProjectHref, noahProjectHandoffDraft } from '../lib/noah-project-view.ts';
import { screen } from './fixtures/noah/screen.mjs';

void test('Noah sends an existing project identity and Eve can draft a package with the official release and social sources', () => {
  const id = 'project-' + 'a'.repeat(64);
  const handoff = new URL(eveNoahProjectHref(id), 'https://avoado.si');
  assert.equal(handoff.pathname, '/os/eve');
  assert.equal(handoff.searchParams.get('noahProject'), id);
  assert.equal(handoff.hash, '#eve-compose');
  const release = 'https://github.com/sandbox-quantum/switch/releases/tag/switch-console-v0.41.1';
  const discovery = 'https://x.com/switch_ai_/status/123456789';
  const draft = noahProjectHandoffDraft({ card: { name: 'Switch Buddy', sources: [
    { source: 'github', sourceUrl: 'https://github.com/sandbox-quantum/switch' },
    { source: 'x', sourceUrl: discovery },
    { source: 'github', sourceUrl: release },
  ] } });
  assert.match(draft, /Switch Buddy/);
  assert.deepEqual(draft.split('\n').filter(line => line.startsWith('出典：')), [`出典：${release}`, `出典：${discovery}`]);
  assert.ok(draft.length <= 2000);
});

void test('Eve refreshes the public candidate and fills a draft only after the user clicks', async () => {
  const id = 'project-' + 'a'.repeat(64);
  const drafts = [];
  const official = 'https://github.com/sandbox-quantum/switch/releases/tag/switch-console-v0.41.1';
  const ui = screen({ fetch: async () => ({ body: { card: { name: 'Switch Console', sources: [{ source: 'github', sourceUrl: official }] } } }) });
  const view = ui.mount('components/eve-noah-project-handoff.tsx', { id, disabled: false, onDraft: text => drafts.push(text) });
  await view.flush();
  assert.match(view.text(), /Switch Console/);
  assert.deepEqual(drafts, []);
  await view.click('依頼文を入力する');
  assert.equal(drafts.length, 1);
  assert.ok(drafts[0].includes(official));
  assert.deepEqual(ui.calls.map(call => [call.method, call.url]), [['GET', `/api/noah/discover/project?id=${id}`]]);
});

void test('legacy Tool handoffs keep selected Tool, conversation, package and setup through canonical Eve navigation', () => {
  const query = new URLSearchParams({tool:'rockstar-spider',thread:crypto.randomUUID(),package:'fixture/package',view:'work',workJob:'job-1',setup:'passkey'});
  const before=query.toString();
  const url=new URL(eveToolPath(query),'https://fixture.test');
  assert.equal(url.pathname,'/os/eve');assert.equal(url.searchParams.get('mode'),'tools');
  for(const [key,value] of query)assert.equal(url.searchParams.get(key),value);
  assert.equal(query.toString(),before);
  assert.equal(eveToolPath(url.searchParams),url.pathname+url.search);
});
void test('account return labels agree with the actual destination and reject external or recursive returns', () => {
  assert.deepEqual(accountReturnNavigation(''),{href:'/#timeline',label:'Noahへ進む'});
  for(const [href,label] of [['/settings','設定へ戻る'],['/connect/service','接続に戻る'],['/os/eve?thread=one#eve-work-results','Eveの仕事と成果へ戻る'],['/os/eve?mode=tools&tool=rockstar-spider','Eveへ戻る']]) {
    assert.deepEqual(accountReturnNavigation(new URLSearchParams({returnTo:href}).toString()),{href,label});
  }
  for(const href of ['https://evil.example','//evil.example','/\\evil.example','/account?returnTo=/account','/ok\r\n//evil.example','x'.repeat(3000)]) {
    assert.equal(accountReturnNavigation(new URLSearchParams({returnTo:href}).toString()).href,'/#timeline');
  }
});
void test('news original links accept only credential-free HTTPS and bound display titles', () => {
  const query=new URLSearchParams({newsSource:'https://example.com/article?q=one',sourceTitle:'題'.repeat(300)}).toString();
  assert.deepEqual(newsSourceNavigation(query),{href:'https://example.com/article?q=one',title:'題'.repeat(240)});
  for(const href of ['javascript:alert(1)','data:text/html,test','http://example.com','https://user:secret@example.com','/relative','invalid']) {
    assert.equal(newsSourceNavigation(new URLSearchParams({newsSource:href}).toString()),null);
  }
});

void test('Tool workspace menu preserves Tool and thread while switching work and compose views', () => {
  const links = eveWorkspaceNavigation('mode=tools&tool=rockstar-spider&thread=fixture&view=work');
  assert.equal(links.workView, true);
  const results = new URL(links.results, 'https://avoado.si');
  assert.equal(results.pathname, '/os/eve');
  assert.equal(results.searchParams.get('tool'), 'rockstar-spider');
  assert.equal(results.searchParams.get('thread'), 'fixture');
  assert.equal(results.searchParams.get('view'), 'work');
  assert.equal(new URL(links.compose, 'https://avoado.si').searchParams.has('view'), false);
  assert.deepEqual(eveWorkspaceNavigation('thread=fixture'), { compose: '#eve-compose', results: '#eve-work-results', workView: false });
});
