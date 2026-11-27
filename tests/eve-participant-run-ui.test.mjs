import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
import { OWNER_SCOPE_HEADER } from '../lib/owner-intent.ts';

const owner = 'owner-v1:' + 'a'.repeat(64);
const requestId = '44444444-4444-4444-8444-444444444444';
const citation = 'market:tool:mr-citations', article = 'market:tool:mr-free-article', csv = 'market:tool:rockstar-csv-cleanup';
const privateText = '設計内だけの会話';
function setup(ids = [citation], options = {}) {
  const plan = { name: privateText, steps: ids.map(agentId => ({ agentId, role: privateText, output: privateText })) };
  const candidates = (options.catalog ?? ids).filter(Boolean).map(id => ({ id, name: id, summary: privateText }));
  let job = options.job;
  const ui = screen({ fetch({ method, headers, url, body }) {
    assert.equal(headers[OWNER_SCOPE_HEADER], owner);
    if (method === 'GET') {
      assert.equal(url, '/api/noah/shared-compute?requestId=' + requestId);
      return {body: { ownerScope: options.owner ?? owner, canSubmitChain: options.canSubmit !== false, pilot: {active: true,jobLimit: 5}, chainConsentVersion:'eve-participant-v1', jobs: job ? [job] : [] }};
    }
    if (body.action === 'submitChain') {
      job = { id: requestId, requestId, inputKind: 'eve-chain', status:'queued', result:null, receiptId:null };
      return {body:{ jobId: job.id }};
    }
    if (body.action === 'cancel') { job.status = 'cancelled'; return {body:{}}; }
    throw Error('unexpected operation');
  } });
  const page = ui.mount('components/eve-participant-run.tsx', { plan, candidates, owner, requestId, onNewRun() {} });
  return {ui, page, setJob: value => { job = value; }};
}

void test('Eve sends only reviewed publication data and ordered IDs, edits invalidate sharing consent', async () => {
  const {ui,page,setJob} = setup([citation, article]);
  assert.equal(ui.calls.length,0);
  await page.click('参加端末で実行・結果を確認');
  const [source,summary] = page.find('textarea');
  await page.change(source, '# 公開用原稿');
  await page.change(summary, '- red\n- blue\n- green');
  for (const [i,value] of ['20','500','付録','https://note.com/test/n/abcd'].entries()) await page.change(page.find('input')[i], value);
  await page.click('送信内容を確認');
  assert.ok(page.find('button','同意して依頼する')[0].props.disabled);
  const consent = () => page.find('input').find(node => node.props.type === 'checkbox');
  consent().props.onChange({target:{checked:true}}); await page.flush();
  await page.change(source, '# 次の原稿');
  assert.equal(page.find('button','同意して依頼する').length,0);
  await page.click('送信内容を確認'); assert.ok(page.find('button','同意して依頼する')[0].props.disabled);
  consent().props.onChange({target:{checked:true}}); await page.flush();
  await page.click('同意して依頼する');
  const sent = ui.calls.find(call => call.method === 'POST').body;
  assert.equal(JSON.stringify(sent).includes(privateText),false);
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), { action:'submitChain',requestId,funding:'pilot',consentVersion:'eve-participant-v1',acceptThirdParty:true, recipe:{agents:[citation,article],source:'# 次の原稿',options:{afterChars:20,price:500,summary:'- red\n- blue\n- green',paidContents:'付録',noteUrl:'https://note.com/test/n/abcd'}} });
  assert.match(page.text(), /参加端末を待っています/);
  setJob({id:requestId, requestId, inputKind:'eve-chain', status:'leased'}); await page.tick(6000); assert.match(page.text(), /参加端末で実行中/);
  setJob({id:requestId, requestId, inputKind:'eve-chain', status:'completed', result:{text:'検収済みの本文',steps:[citation,article]},receiptId:'proof-01'});
  await page.tick(6000); assert.match(page.text(), /検収済みの本文/); assert.match(page.text(), /proof-01/);
});
void test('Eve refuses unbuilt, unknown, uncatalogued and type-incompatible plans without requesting input', () => {
  for (const [ids,catalog,reason] of [[[null],[],/開発/],[['nope'],['nope'],/未対応/],[[citation],[],/候補/],[[csv,citation],[csv,citation],/入力形式/]]) {
    const {page,ui} = setup(ids,{catalog}); assert.match(page.text(),reason); assert.equal(ui.calls.length,0);
    assert.equal(page.find('textarea').length,0);
  }
});
void test('restored plan finds its original request, allows cancellation and reports expiry; owner or entitlement changes close the form', async () => {
  const job = { id:requestId,requestId,inputKind:'eve-chain',status:'queued',result:null,receiptId:null };
  const {ui,page} = setup([csv],{job});
  await page.click('参加端末で実行・結果を確認'); assert.equal(page.find('textarea').length,0);
  await page.click('依頼を取り消す'); assert.match(page.text(),/取り消し済み/);
  assert.deepEqual(ui.calls.find(c => c.method === 'POST').body,{action:'cancel',jobId:requestId});
  const expired = setup([citation],{job:{...job,status:'expired'}});
  await expired.page.click('参加端末で実行・結果を確認'); assert.match(expired.page.text(),/期限内に検収できませんでした/);
  for (const opts of [{owner:'other'},{canSubmit:false}]) {
    const denied = setup([csv],opts); await denied.page.click('参加端末で実行・結果を確認');
    assert.equal(denied.page.find('textarea').length,0); assert.equal(denied.ui.calls.filter(c => c.method === 'POST').length,0);
  }
});
