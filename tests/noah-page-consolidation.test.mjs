import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {noahPageHref,noahPageTab,NOAH_EXPLORE_TABS} from '../lib/noah-page-routes.ts';
import {noahPageRedirect} from '../services/sky-web/noah-page-routes.mjs';
import * as myRoutes from '../lib/noah-my-routes.ts';
import {screen} from './fixtures/noah/screen.mjs';

void test('canonical search keeps a Unicode query and trial attribution without accepting executable or return parameters',()=>{
 const href=noahPageHref('explore',{q:'資料 & image',via:'trial-300',returnTo:'https://evil.test',execute:'1',q2:['a','b']},'catalog');
 const url=new URL(href,'https://avoado.si');
 assert.equal(url.pathname,'/noah/explore');assert.equal(url.searchParams.get('q'),'資料 & image');assert.equal(url.searchParams.get('via'),'trial-300');
 assert.deepEqual([...url.searchParams.keys()],['tab','q','via']);
 assert.equal(noahPageTab('__proto__',NOAH_EXPLORE_TABS,'ready'),'ready');
 assert.equal(noahPageHref('explore',{q:['a','b']},'https://evil.test'),'/noah/explore?tab=ready');
});
void test('saved board and work references survive old entry redirects without changing owners or executing writes',()=>{
 assert.equal(noahPageHref('saved',{board:'board-one'},'boards'),'/noah/saved?tab=boards&board=board-one');
 assert.equal(noahPageHref('saved',{job:'work-one',owner:'other',action:'delete'},'files'),'/noah/saved?tab=files&job=work-one');
 assert.equal(noahPageRedirect('/sky/outputs'),'/noah/saved?tab=files');
 assert.equal(noahPageRedirect('/sky/agents'),'/noah/saved?tab=roles');
 assert.equal(noahPageRedirect('/zema/library'),'/noah/saved?tab=roles');
 assert.equal(noahPageRedirect('/noah/library'),null,'page redirect must not be overridden by the old Mac redirect');
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
void test('the three My Agent sections restore from their URLs and old library and saved links select the correct personal reader',()=>{
 const child=name=>({default:props=>({type:'section',props:{...props,children:name}})});
 const modules={'@/lib/noah-my-routes':myRoutes, './noah-work-page':child('WORK'), './noah-library':child('LIBRARY'), './noah-saved':child('SAVED')};
 const cases=[
  [{},undefined,'LIBRARY'],[{view:'activity'},undefined,'WORK'],[{view:'saved',tab:'files',job:'job-one'},undefined,'SAVED'],
  [{tab:'agents'},'saved','LIBRARY'],[{view:'agents'},'activity','WORK'],[{},'saved','SAVED'],
  [{view:['saved'],action:'delete'},undefined,'LIBRARY'],
 ];
 for(const [params,legacy,reader] of cases){
  const ui=screen({modules}); const page=ui.mount('components/noah-my.tsx',{params,legacy});
  assert.match(page.text(),new RegExp(reader)); assert.equal(page.find('h1').length,1); assert.equal(page.find('a').length,3);
  assert.equal(page.find('a').filter(a=>a.props['aria-current']==='page').length,1); assert.equal(ui.calls.length,0);
 }
 assert.deepEqual(myRoutes.noahMySelection({},'saved'),{view:'saved',saved:'boards'});
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
