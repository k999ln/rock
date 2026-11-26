import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {noahPageHref,noahPageTab,NOAH_EXPLORE_TABS} from '../lib/noah-page-routes.ts';
import {noahPageRedirect,noahRedirectURL} from '../services/sky-web/noah-page-routes.mjs';
import * as agentLibrary from '../lib/sky-agent-library.ts';
import * as providers from '../lib/llm-providers.ts';
import * as myRoutes from '../lib/noah-my-routes.ts';
import {screen} from './fixtures/noah/screen.mjs';

void test('canonical search keeps a Unicode query and trial attribution without accepting executable or return parameters',()=>{
 const href=noahPageHref('explore',{q:'資料 & image',via:'trial-300',returnTo:'https://evil.test',execute:'1',q2:['a','b']},'catalog');
 const url=new URL(href,'https://avoado.si');
 assert.equal(url.pathname,'/noah');assert.equal(url.searchParams.get('q'),'資料 & image');assert.equal(url.searchParams.get('via'),'trial-300');
 assert.deepEqual([...url.searchParams.keys()],['tab','q','via']);
 assert.equal(noahPageTab('__proto__',NOAH_EXPLORE_TABS,'ready'),'ready');
 assert.equal(noahPageHref('explore',{q:['a','b']},'https://evil.test'),'/noah?tab=ready');
});
void test('saved board and work references survive old entry redirects without changing owners or executing writes',()=>{
 assert.equal(noahPageHref('saved',{board:'board-one'},'boards'),'/noah/saved?tab=boards&board=board-one');
 assert.equal(noahPageHref('saved',{job:'work-one',owner:'other',action:'delete'},'files'),'/noah/saved?tab=files&job=work-one');
 assert.equal(noahPageRedirect('/sky/outputs'),'/noah/saved?tab=files');
 assert.equal(noahPageRedirect('/sky/agents'),'/noah/saved?tab=roles');
 assert.equal(noahPageRedirect('/zema/library'),'/noah/saved?tab=roles');
 assert.equal(noahPageRedirect('/noah/library'),null,'page redirect must not be overridden by the old Mac redirect');
 const oldMy = new URL('https://avoado.si/noah/public/my?view=saved&tab=files&job=work-one');
 const canonical = noahRedirectURL(oldMy, noahPageRedirect(oldMy.pathname));
 assert.equal(canonical.pathname + canonical.search, '/noah/my?view=saved&tab=files&job=work-one');
});
void test('each saved type still renders its existing store-backed reader from one page',()=>{
 const child=name=>({default:props=>({type:'section',props:{children:name,...props}})});
 const modules={
  '@/lib/noah-page-routes':{noahPageTab}, '@/lib/noah-my-routes':myRoutes,
  './noah-page-tabs':child('TABS'), './noah-boards':{NoahBoardsPage:()=>({type:'section',props:{children:'BOARDS'}}),NoahBoardPage:props=>({type:'section',props:{children:'BOARD '+props.id}})},
  './noah-work-page':child('RESULTS'),'./noah-library':child('AGENTS'),'./sky-agent-library':child('ROLES'),'./noah-result-data':child('RESULTS'),'./sky-output-center':child('FILES'),
 };
 for(const [tab,label] of [['boards','BOARDS'],['roles','ROLES'],['results','RESULTS'],['files','FILES']]){
  const ui=screen({modules});const p=ui.mount('components/noah-saved.tsx',{params:{tab,job:'saved-job'}});assert.ok(p.text().includes(label));assert.equal(ui.calls.length,0);
  if(tab==='files')assert.equal(p.find('section').find(x=>x.props.initialWorkJobId)?.props.initialWorkJobId,'saved-job');
 }
 const ui=screen({modules});assert.match(ui.mount('components/noah-saved.tsx',{params:{tab:'boards',board:'board-one'}}).text(),/BOARD board-one/);
});
void test('personal library pin faces open the owned upload, shared invitation and entitled release; search only filters uploads', async () => {
 const modules = {
  './workspace-shell': {default: ({children}) => children},
  './noah-instances': {NoahInstancesList: () => null},
  './noah-managed-installation': {NoahInstallationsList: () => null},
  './noah-agent-catalog': {adapterLabels: {web: '専用Web画面'}},
 };
 const manifest = {name:'Calendar Agent', summary:'Meetings', version:'1.1', adapter:'web'};
 const library = {ownerScope:'owner', uploads:[{id:'upload', manifest, uploadState:'ready'}],
  releases:[{packageKey:'package@1', manifestSha256:'release', name:'Market Agent', version:'1.0'}],
  roles:[{id:'role', name:'Writing Agent', model:'local', enabled:false}]};
 const invite = {inviteId:'invitation', uploadId:'shared', manifest:{...manifest,name:'Shared Agent'}, expiresAt:1000, access:'source'};
 const ui = screen({modules, fetch:async ({url}) => {
  if (url === '/api/noah/library') return {body:library};
  assert.equal(url, '/api/noah/invites?received=1');
  return {body:{ownerScope:'owner',shared:[invite]}};
 }});
 const view = ui.mount('components/noah-library.tsx', {embedded:true}); await view.flush();
 const ids = () => view.find('li').map(node => node.props['data-agent-pin-id']);
 assert.deepEqual(ids(), ['package@1', 'upload', 'shared', 'role']);
 for (const [name,href] of [['Calendar Agent','/noah/agents/upload'],['Shared Agent','/noah/invites/invitation'],['Market Agent','/noah/releases/release']]) {
  assert.equal(view.find('a',name)[0].props.href, href);
 }
 assert.match(view.text(), /閲覧・コード取得/);
 assert.match(view.text(), /利用停止中/);
 await view.type('no match');
 assert.deepEqual(ids(), ['package@1', 'shared', 'role']);
 assert.ok(ui.calls.every(call => call.method === 'GET'));
});
void test('selecting a saved Agent pin opens settings and protects an unsaved edit', async () => {
 const empty = {default:() => null};
 const modules = {
  './noah-navigation':empty, '@/components/workspace-shell':empty, '@/components/sky-agent-capability-review':empty,
  '@/components/sky-owned-agents':empty, '@/components/sky-device-agent-connections':empty,
  '@/components/sky-commerce':{SkyPurchases:() => null}, '@/components/sky-feedback':{SkyNotice:() => null},
  '@/lib/sky-agent-library':agentLibrary, '@/lib/llm-providers':providers,
 };
 const agents = ['Writing Agent','Coding Agent'].map((name, index) => ({
  ...agentLibrary.defaultSkyAgentSettings(name, name), name, source:'personal', id:'agent-' + index, revision:1,
 }));
 const ui = screen({modules, fetch:async ({url}) => {
  assert.equal(url, '/api/sky/agents'); return {body:{agents,ownerUserId:'owner'}};
 }});
 const view = ui.mount('components/sky-agent-library.tsx', {embedded:true,pinView:true}); await view.tick(0);
 assert.deepEqual(view.find('li').map(node => node.props['data-agent-pin-id']), agents.map(agent => agent.id));
 await view.click(agents[0].name);
 assert.equal(view.find('button', agents[0].name)[0].props['aria-pressed'], true);
 await view.change(view.find('input').find(node => node.props.value === agents[0].name), 'Edited');
 assert.equal(view.find('button', agents[1].name)[0].props.disabled, true);
 await view.click('変更を破棄');
 assert.equal(view.find('button', agents[1].name)[0].props.disabled, false);
 assert.ok(ui.calls.every(call => call.method === 'GET'));
});
void test('old links keep the theater and personal readers without duplicating the shared navigation',()=>{
 const child=name=>({default:props=>({type:'section',props:{...props,children:name}})});
 const modules={'@/lib/noah-my-routes':myRoutes, './noah-work-page':child('WORK'), './noah-library':child('LIBRARY'), './noah-saved':child('SAVED'),
  './noah-theater':child('THEATER')};
 const cases=[
  [{},undefined,'THEATER'],[{view:'agents'},undefined,'LIBRARY'],[{view:'activity'},undefined,'WORK'],[{view:'saved',tab:'files',job:'job-one'},undefined,'SAVED'],
  [{tab:'agents'},'saved','LIBRARY'],[{view:'agents'},'activity','WORK'],[{},'saved','SAVED'],
  [{view:['saved'],action:'delete'},undefined,'THEATER'],[{view:'saved',tab:'agents'},undefined,'LIBRARY'],
 ];
 for(const [params,legacy,reader] of cases){
  const ui=screen({modules}); const page=ui.mount('components/noah-my.tsx',{params,legacy});
  const title={THEATER:'シアター',LIBRARY:'自分のAgent',WORK:'実行中',SAVED:'保存したもの'}[reader];
  assert.match(page.text(),new RegExp(reader)); assert.deepEqual(page.find('h1').map(node=>page.text(node)),[title]);
  assert.equal(page.text().includes('THEATER'),reader==='THEATER');
  assert.equal(page.find('nav').length,0,'page heading must not duplicate the shared navigation');
  assert.equal(ui.calls.length,0);
 }
 assert.deepEqual(myRoutes.noahMySelection({},'saved'),{view:'saved',saved:'boards'});
 assert.equal(myRoutes.noahMyHref('theater'),'/noah/my');
 assert.equal(myRoutes.noahMyHref('agents'),'/noah/my?view=agents');
 assert.equal(myRoutes.noahMyHref('saved','files',{job:'saved-one',owner:'another',board:'wrong'}),'/noah/my?view=saved&tab=files&job=saved-one');
 assert.equal(myRoutes.noahMyHref('saved','boards',{board:'ボード 1',run:'yes'}),'/noah/my?view=saved&tab=boards&board=%E3%83%9C%E3%83%BC%E3%83%89+1');
});
void test('retired Noah pages are gone while shared implementations and data APIs remain',()=>{
 const file=p=>new URL('../'+p,import.meta.url);
 for(const path of ['mac','mac/agents','mac/activity','local-tools','guides/cowagent-mac','social','community','campus','campus/[campusId]','campus/[campusId]/hub','work/[id]']){
  assert.equal(existsSync(file('app/noah/'+path+'/page.tsx')),false,path);
  assert.equal(noahPageRedirect('/noah/'+path),null,path);
 }
 for(const path of ['app/sky/campus/page.tsx','app/campus/page.tsx','app/api/noah/boards/route.ts','app/api/noah/data/route.ts','app/api/noah/library/route.ts'])assert.ok(existsSync(file(path)),path);
 for(const path of ['components/noah-shell.tsx','components/noah-public-catalog.tsx','components/noah-public-detail.tsx','components/noah-navigation.tsx'])assert.doesNotMatch(readFileSync(file(path),'utf8'),/\/social#compose|\/mac\?|COWAGENT_GUIDE_PATH/);
});
