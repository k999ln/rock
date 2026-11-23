import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
const now = Date.UTC(2026,10,23);
const product = { id:'AG0491', familyId:'f', name:'Car Agent', publisher:'author',category:'移動',summary:'Agent task',status:'研究確認',requirements:[],sources:[],added:false };
const registry = {schema:'noah.verified-agent-catalog/1',revision:'r1',asOf:'2026-11-23',summary:{families:786,categories:20,added:337,reviewed:2603,unresolved:52,individuallyReviewed:1,automatedTriage:2602},products:[product],reviews:[]};
void test('live catalog refreshes evidence, filters usable bodies, and expires an old success even when refresh fails',async()=>{
  let online=true;
  const document={hidden:false};
  const ui=screen({now,document,fetch:async({url})=>{
    if(url.endsWith('agent-registry')) return {body:registry};
    if(!online) return {status:503};
    return {body:{asOf:now,total:786,available:1,connected:0,items:[{id:product.id,familyId:'f',projectId:'p',status:'available',checkedAt:now,succeededAt:now,expiresAt:now+15000,href:'/noah/discover/agent?id=p'}]}};
  }});
  const view=ui.mount('components/noah-verified-agents.tsx');await view.flush();
  assert.equal(view.find('a','Noahで使う').length,1);
  await view.change(view.find('select').find(n=>n.props['aria-label']==='稼働状態で絞り込む'),'available');
  assert.ok(view.text().includes('Car Agent'));
  online=false;await view.tick(20000);
  assert.equal(view.find('a','Noahで使う').length,0);
  assert.ok(view.text().includes('本番で成果を確認：0系列'));
  assert.ok(view.text().includes('稼働状態を更新できませんでした'));
  const calls=ui.calls.length;document.hidden=true;await view.tick(20000);assert.equal(ui.calls.length,calls);
});
