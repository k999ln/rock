import { screen } from './fixtures/noah/screen.mjs';
import * as packageApi from '../lib/sky-tool-package.ts';
import * as submission from '../lib/sky-submission.ts';
import * as publication from '../lib/noah-publication-form.ts';
import * as packages from '../lib/noah-agent-package-view.ts';
import * as intent from '../lib/owner-intent.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createNoahPublisherApi } from '../lib/noah-publisher.ts';
import { createNoahFeedApi } from '../lib/noah-feed.ts';
import { createSkyToolPackageDraft } from '../lib/sky-tool-package.ts';
import { skyToolPackageStore } from '../lib/sky-tool-package-store.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

const confirmations={rights:true,pricing:true,sideEffects:true,tests:true};
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  for(const file of ['0021_sites_schema_convergence.sql','0036_noah_feed_preferences.sql'])sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const db={prepare(sql){return{bind(...args){return{async all(){return{results:sqlite.prepare(sql).all(...args)};},async first(){return sqlite.prepare(sql).get(...args)||null;}};}};}};
  const authenticate=async r=>{const u=r.headers.get('test-owner');if(!u)throw new Error('UNAUTHORIZED');return u;};
  const api=createNoahPublisherApi({db,authenticate}),feed=createNoahFeedApi({db,authenticate});
  const manifest=createSkyToolPackageDraft({sourceKind:'github',sourceUrl:'https://github.com/example/test-agent',developerName:'Fixture',developerId:'fixture',license:'MIT'});
  return{api,feed,sqlite,manifest,store:skyToolPackageStore(db)};
}
async function request(body,owner='alice',headers={},method='POST'){
  return new Request('https://noah.example/api/noah/publisher',{method:method==='PATCH'?'PATCH':'POST',headers:{origin:'https://noah.example','content-type':'application/json','test-owner':owner,'x-rock-owner-scope':await ownerScopeFor(owner),...headers},body:JSON.stringify(body)});
}
const get=(owner='alice')=>new Request('https://noah.example/api/noah/publisher',{headers:{'test-owner':owner}});
const transition=(p,action,status=p.status)=>({action,packageKey:p.packageKey,manifestSha256:p.manifestSha256,status});
void test('publisher saves immutable owner-scoped specifications, idempotently retries, and never publishes on save',async t=>{
  const {api,manifest,feed}=fixture(t),body={manifest,confirmations};
  const response=await api.create(await request(body));assert.equal(response.status,201);
  const first=(await response.json()).package;assert.equal(first.status,'submitted');assert.equal(first.installable,false);
  assert.equal((await api.create(await request(body))).status,200);
  assert.equal((await api.create(await request({...body,manifest:{...manifest,summary:manifest.summary+' 追加説明があります。'}}))).status,409);
  assert.equal((await api.create(await request(body,'bob'))).status,409);
  assert.equal((await (await api.list(get('bob'))).json()).packages.length,0);
  assert.equal((await (await feed.get(new Request('https://noah.example/api/noah/feed'))).json()).entries.length,0);
});
void test('all creation paths prevent taking another publisher identity by registering a different version of the same tool ID',async t=>{
  const {api,manifest,store}=fixture(t);await api.create(await request({manifest,confirmations}));
  assert.equal(await store.create('bob',{...manifest,version:'0.2.0'}),null);
  assert.equal((await api.create(await request({manifest:{...manifest,version:'0.3.0'},confirmations},'bob'))).status,409);
  assert.ok(await store.create('alice',{...manifest,version:'0.2.0'}));
});
void test('submission retries stay review-pending; withdrawal is irreversible and excludes a verified package from feed and runtime lookup',async t=>{
  const {api,manifest,sqlite,store,feed}=fixture(t);
  const saved=(await(await api.create(await request({manifest,confirmations}))).json()).package;
  for(let i=0;i<2;i++)assert.equal((await api.transition(await request(transition(saved,'submit'),'alice',{},'PATCH'))).status,200);
  const pending=(await(await api.list(get())).json()).packages[0];assert.equal(pending.status,'published_declared');assert.equal(pending.installable,false);
  assert.equal((await api.transition(await request(transition(pending,'withdraw'),'bob',{},'PATCH'))).status,409);
  // Local test evidence only: the API cannot write a review or promote itself to verified.
  sqlite.prepare("UPDATE sky_tool_packages SET status='verified' WHERE package_key=?").run(saved.packageKey);
  sqlite.prepare("INSERT INTO sky_tool_package_reviews(id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at) VALUES('review',?,?,'independent-reviewer','verified','{}','{}','',?,?)").run(saved.packageKey,saved.manifestSha256,Date.now(),Date.now()+60000);
  assert.ok(await store.verifiedRegistryPackage(saved.packageKey,saved.manifestSha256));
  assert.equal((await api.transition(await request(transition(pending,'withdraw'),'alice',{},'PATCH'))).status,409,'must refresh after review');
  const verified=await store.getOwner('alice',saved.packageKey);
  for(let i=0;i<2;i++)assert.equal((await api.transition(await request(transition(verified,'withdraw'),'alice',{},'PATCH'))).status,200);
  assert.equal(await store.verifiedRegistryPackage(saved.packageKey,saved.manifestSha256),null);
  assert.equal((await (await feed.get(new Request('https://noah.example/api/noah/feed'))).json()).entries.length,0);
  assert.equal((await api.transition(await request(transition(saved,'submit'),'alice',{},'PATCH'))).status,409);
  assert.equal((await(await api.create(await request({manifest,confirmations}))).json()).package.status,'revoked');
});
void test('publisher mutations fail closed on authentication, origin, stale owner, malformed and oversized inputs',async t=>{
  const {api,manifest}=fixture(t),body={manifest,confirmations};
  assert.equal((await api.create(await request(body,''))).status,401);
  assert.equal((await api.create(await request(body,'alice',{origin:'https://evil.example'}))).status,403);
  assert.equal((await api.create(await request(body,'alice',{'x-rock-owner-scope':await ownerScopeFor('bob')}))).status,409);
  assert.equal((await api.create(await request({...body,confirmations:{...confirmations,tests:false}}))).status,400);
  assert.equal((await api.create(await request(body,'alice',{'content-type':'text/plain'}))).status,415);
  assert.equal((await api.create(await request({...body,padding:'x'.repeat(131072)}))).status,413);
  assert.equal((await api.create(await request(null))).status,400);
  assert.equal((await api.transition(await request({action:'verify'},'alice',{},'PATCH'))).status,400);
});


void test('engineering carries an older private MCP upload into a new specification, then submits that version for review', async t => {
  const {api, feed, manifest} = fixture(t), scope = await ownerScopeFor('alice');
  const agent = {id:'00000000-0000-4000-8000-000000000031', uploadState:'ready', source:null, manifest:{
    name:'会議の準備票', summary:'入力したメモを整理し、研修で聞くことを準備票にまとめて返します。', author:'Alice', adapter:'mcp_http',
    endpointUrl:'https://tools.example.com/mcp', license:'MIT', priceNote:'無料', version:'1.0.0'}};
  await api.create(await request({ manifest, confirmations }));
  const ui = screen({document:{hidden:false}, modules:{
    '@/lib/sky-tool-package':packageApi, '@/lib/noah-publication-form':publication, '@/lib/noah-agent-package-view':packages,
    '@/lib/owner-intent':intent, '@/lib/sky-submission':submission,
    './noah-guide-editor':{default:() => null}, './noah-cover-picker':{default:() => null,coverReady:() => true},
    './noah-agent-pin':{NoahAgentPin:({actions}) => actions,NoahAgentPinGrid:({children}) => children},
  },fetch: async r => {
    if (r.url === '/api/noah/agents') return {body:{ownerScope:scope, agents:[]}};
    if (r.url === '/api/noah/agents/' + agent.id) return {body:{ownerScope:scope, agent}};
    assert.equal(r.url,'/api/noah/publisher');
    if (r.method !== 'GET') assert.equal(r.headers['X-Rock-Owner-Scope'],scope);
    const response = r.method === 'GET' ? await api.list(get()) : r.method === 'POST' ? await api.create(await request(r.body)) : await api.transition(await request(r.body,'alice',{},'PATCH'));
    return {status:response.status, body:await response.json()};
  }});
  const page = ui.mount('components/noah-publisher.tsx',{engineeringAgentId:agent.id});
  await page.tick(0);
  const field = (label,selector) => page.nodes(page.find('label',label)[0]).find(node => node.type === selector);
  assert.equal(field('Agent名','input').props.value,agent.manifest.name);
  assert.equal(field('接続方式','select').props.value,'mcp_streamable_http');
  assert.equal(field('実行先のURL','input').props.value,agent.manifest.endpointUrl);
  assert.equal(field('料金・外部実費','textarea').props.value,'無料');
  await page.change(field('成果を合格とする条件','textarea'),'入力した項目を含む準備票が返る');
  await page.change(field('正常な入力で確認する試験','input'),'項目を入れると準備票を返す');
  await page.change(field('不正な入力で確認する試験','input'),'空の入力を拒否する');
  await page.click('入力内容から公開仕様を確認');
  assert.equal(page.find('button','公開仕様を保存する')[0].props.disabled,true);
  for (const label of ['コード・配布元の権利','料金・外部サービスの実費','権限・送信先・副作用','試験条件と実施結果']) {
    field(label,'input').props.onChange({target:{checked:true}});page.render();await page.flush();
  }
  await page.click('公開仕様を保存する');
  const saved = ui.calls.find(c => c.method === 'POST');
  assert.equal(saved.body.manifest.id,publication.noahPublicationAgentId(scope,agent.id));
  assert.equal(saved.body.manifest.adapter.endpointUrl,agent.manifest.endpointUrl);
  assert.equal(page.find('button','審査へ提出する').length,1,page.text());
  await page.click('審査へ提出する');
  assert.match(page.text(),/審査へ提出しました/);
  assert.equal((await (await feed.get(new Request('https://noah.example/api/noah/feed'))).json()).entries.length,0);
});
