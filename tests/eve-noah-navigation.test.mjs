import test from 'node:test';
import assert from 'node:assert/strict';
import { eveToolPath, accountReturnNavigation, newsSourceNavigation } from '../lib/eve-noah-navigation.ts';

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
