import test from 'node:test';
import assert from 'node:assert/strict';
import { newsReviewModelAdvice } from '../lib/eve-news-model-advice.ts';
const name='qwen2.5:1.5b',digest='65ec06548149b04c096a120e4a6da9d4017ea809c91734ea5631e89f96ddc57b',now=Date.parse('2026-10-22T20:00:00Z');
void test('News advice requires exact measured name/digest and shows failed scoped result without authorization',()=>{
  assert.equal(newsReviewModelAdvice('','',now).status,'not_selected');
  assert.equal(newsReviewModelAdvice(name,'',now).status,'digest_required');
  assert.equal(newsReviewModelAdvice(name,'a'.repeat(64),now).status,'different_digest');
  assert.equal(newsReviewModelAdvice('other-model',digest,now).status,'unmeasured');
  const result=newsReviewModelAdvice(name,digest,now);
  assert.equal(result.status,'failed');assert.equal(result.criteriaPassed,2);assert.equal(result.cases,8);assert.equal(result.automaticReviewerAccepted,false);
  assert.equal(newsReviewModelAdvice(name,digest,now+31*86400000).status,'stale');
});
void test('Old suite, invalid/future timestamp and incomplete measurement do not inherit a candidate score',()=>{
  const profile={name,digest,cases:8,criteriaPassed:8,fixtureCriteriaPassed:true};
  const evaluation={suite:'eve.news-evidence-fixtures/1',fixtureSha256:'a'.repeat(64),recordedAt:'2026-10-22T19:00:00Z',profiles:[profile]};
  for(const change of [{suite:'old'},{recordedAt:undefined},{recordedAt:'invalid'},{recordedAt:'2026-10-23T00:00:00Z'}])assert.equal(newsReviewModelAdvice(name,digest,now,{...evaluation,...change}).status,'stale');
  for(const change of [{cases:7},{criteriaPassed:9},{criteriaPassed:NaN}])assert.equal(newsReviewModelAdvice(name,digest,now,{...evaluation,profiles:[{...profile,...change}]}).status,'incomplete');
  const passing=newsReviewModelAdvice(name,digest,now,evaluation);assert.equal(passing.status,'fixture_only');assert.equal(passing.automaticReviewerAccepted,false);
});
