import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import * as library from '../lib/sky-agent-library.ts';
import * as providers from '../lib/llm-providers.ts';
import * as connections from '../lib/sky-eve-connections.ts';
import * as navigation from '../lib/eve-noah-navigation.ts';
import { smisStorageFixtureTables } from './helpers/smis-storage-fixture.mjs';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
function harness(path,{initial={},params=new URLSearchParams(),fetcher=async()=>{throw Error('unexpected fetch');},liveSnapshots=false}={}) {
 const state=[],refs=[],effects=[],frames=[],events=new Map();let cursor=0,refCursor=0,effectCursor=0;
 const jsx=(type,props)=>({type,props:props??{}});
 const react={useState(value){const index=cursor++;if(!(index in state))state[index]=index in initial?initial[index]:typeof value==='function'?value():value;return[state[index],next=>{state[index]=typeof next==='function'?next(state[index]):next;}];},useRef(value){return refs[refCursor++]??={current:value};},useCallback:fn=>fn,useSyncExternalStore:(_subscribe,get,server)=>liveSnapshots?get():server(),useEffect(fn){if(!(effectCursor in effects))effects[effectCursor]={fn,ran:false};effectCursor++;}};
 const location=new URL('https://fixture.test/os/eve?'+params.toString());
 const exports={};runInNewContext(ts.transpileModule(read(path),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,fetch:fetcher,crypto,URL,URLSearchParams,AbortController,Event,document:{hidden:false,querySelector:()=>null},window:{location,history:{replaceState(){},pushState(_state,_title,hash){location.hash=hash;}},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),dispatchEvent:event=>events.get(event.type)?.()},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};if(name==='next/link')return{default:'a'};if(name==='next/navigation')return{useSearchParams:()=>params};if(name==='@/lib/sky-eve-connections')return connections;if(name==='./sky-agent-eve-profile')return{default:'agent-profile',useSkyAgentProfileKey:()=>[params.get('agent'),params.get('agentRevision')].join(':'),useSkyAgentProfileRequested:()=>params.has('agent')||params.has('agentRevision')};if(name==='./sky-agent-library')return{default:'builder-panel'};if(name==='./workspace-shell')return{default:props=>jsx('workspace',{...props,children:props.children})};if(name==='lucide-react')return new Proxy({},{get:(_,key)=>String(key)});if(name==='@/lib/eve-noah-navigation')return navigation;if(name==='@/lib/sky-agent-library')return library;if(name==='@/lib/llm-providers')return providers;if(name.endsWith('.module.css'))return{default:new Proxy({},{get:(_,key)=>String(key)})};return{default:()=>null,SkyNotice:({message})=>jsx('output',{children:message})};}});
 function expand(node){if(Array.isArray(node))return node.flatMap(expand);if(!node||typeof node!=='object')return[node];if(node.props.hidden)return[];if(typeof node.type==='function')return expand(node.type(node.props));return[{...node,props:{...node.props,children:expand(node.props.children)}}];}
 return{navigateHash(value){location.hash=value;},render(props={}){cursor=refCursor=effectCursor=0;return expand(exports.default(props));},async effects(){for(const e of effects)if(!e.ran){e.ran=true;e.fn();}for(const fn of frames.splice(0))fn();await flush();}};
}
function nodes(tree){return tree.flatMap(n=>n&&typeof n==='object'?[n,...nodes(n.props.children??[])]:[]);}
function text(node){return Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props.children):node==null||typeof node==='boolean'?'':String(node);}
const flush=async()=>{for(let i=0;i<15;i++)await new Promise(resolve=>setImmediate(resolve));};
const button=(view,label)=>nodes(view).find(n=>n.type==='button'&&text(n).trim()===label);
function fixture(t){const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());smisStorageFixtureTables(sqlite);const db={prepare(sql){return{bind(...args){return{async all(){return{results:sqlite.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}};}};return{store:skyAgentLibraryStore(db,'builder-owner'),db};}
for(const lostResponse of [false,true])void test(`Eve idea → reviewed settings → stored agent → private smis post → exact Eve revision (${lostResponse?'lost response':'normal'})`,async t=>{
 const {store,db}=fixture(t);let writes=0;const methods=[];
 const app=harness('components/sky-agent-library.tsx',{initial:{0:[],1:'builder-owner',4:false},fetcher:async(url,options={})=>{methods.push(options.method??'GET');if(options.method==='PUT'){writes++;const body=JSON.parse(options.body);assert.equal(options.headers['X-smis-Owner'],'builder-owner');const saved=await store.save(body.id,body.revision,body.settings,body.create);if(lostResponse)throw Error('fixture response lost');return{ok:true,json:async()=>({agent:saved})};}const id=new URL(url,'https://fixture.test').searchParams.get('id');return{ok:true,json:async()=>({ownerUserId:'builder-owner',agent:await store.get(id)})};}});
 let view=app.render({embedded:true,creator:true});
 nodes(view).find(n=>n.type==='textarea'&&n.props.placeholder?.startsWith('例：資料')).props.onChange({target:{value:'資料を読み、出典と要点をまとめる担当'}});
 button(app.render({embedded:true,creator:true}),'担当の下書きにする').props.onClick();
 for(let i=0;i<2;i++)button(app.render({embedded:true,creator:true}),'次へ').props.onClick();
 view=app.render({embedded:true,creator:true});button(view,'エージェントを作成').props.onClick({preventDefault(){}});await flush();
 const saved=(await store.list()).find(a=>a.source==='personal');assert.ok(saved);assert.equal(saved.revision,1);assert.equal(writes,1);assert.ok(methods.every(m=>m==='GET'||m==='PUT'));
 assert.deepEqual(await skyAgentLibraryStore(db,'other-owner').get(saved.id),null);
 view=app.render({embedded:true,creator:true});assert.ok(nodes(view).some(n=>n.type==='a'&&n.props.href===library.skyAgentEvePath(saved)));
 const stream=harness('components/smis-added-posts.tsx',{initial:{0:{owner:'builder-owner',agents:[saved],plugins:[]},1:'ready'}}).render();
 assert.match(text(stream),/資料を読み/);assert.match(text(stream),/自分のみ/);assert.ok(nodes(stream).some(n=>n.type==='a'&&n.props.href===library.skyAgentEvePath(saved)));
});
void test('smis rejects mixed-owner response data and issues only reads on mount',async()=>{
 const methods=[];const app=harness('components/smis-added-posts.tsx',{fetcher:async(url,options)=>{methods.push(options.method??'GET');return{ok:true,status:200,json:async()=>url.endsWith('/agents')?{ownerUserId:'a',agents:[{name:'private-must-not-render'}]}:{ownerUserId:'b',plugins:[]}};}});
 app.render();await app.effects();const view=app.render();assert.doesNotMatch(text(view),/private-must-not-render/);assert.match(text(view),/一覧を確認できません/);assert.deepEqual(methods,['GET','GET']);
});
void test('creation and work keep their state mounted; conversation precedes the composer',()=>{
 const eve=read('components/eve-sync-workspace.tsx');assert.ok(eve.indexOf('className={styles.messages}')<eve.indexOf('className={styles.composer}'));assert.ok(eve.indexOf('<textarea')<eve.indexOf('className={styles.executionSettings}'));
 assert.match(eve,/buildVisited\|\|workbenchMode==='build'/);assert.match(eve,/hidden=\{workbenchMode!=='work'\}/);assert.match(eve,/className=\{styles.executionSettings\}/);assert.match(eve,/hideAccountAccess/);assert.match(eve,/function choose\(id: string\) \{\s*setModeOverride\('work'\)/);assert.match(eve,/メニューを閉じる/);
 assert.match(read('components/sky-discovery-feed.tsx'),/standalone \? tools : tools\.slice/);
 assert.match(read('components/home-screen.tsx'),/personalFeed=\{<SmisAddedPosts/);
});

void test('Eve tab changes preserve pinned URL context and a new agent link opens work instead of the old build override',()=>{
 const params=new URLSearchParams({device:'fixture-device',thread:'fixture-thread'});
 const app=harness('components/eve-sync-workspace.tsx',{params});
 const before=params.toString();
 button(app.render(),'担当を作る').props.onClick();
 assert.ok(button(app.render(),'依頼に戻る'));assert.equal(params.toString(),before);
 params.delete('device');params.set('agent','fixture-saved-agent');params.set('agentRevision','1');
 assert.ok(button(app.render(),'担当を作る'));
});

void test('actual Eve keeps its unsent request through results and blocks cross-route loss until explicit choice',()=>{
 const app=harness('components/eve-sync-workspace.tsx',{liveSnapshots:true});
 const input=()=>nodes(app.render()).find(n=>n.type==='textarea'&&n.props['aria-label']==='続きの依頼');
 input().props.onChange({target:{value:'Synthetic unsent request'}});
 app.navigateHash('#eve-work-results');
 assert.equal(input()?.props.value,undefined);
 button(app.render(),'依頼画面に戻る').props.onClick();
 assert.equal(input().props.value,'Synthetic unsent request');
 let blocked=false;
 const workspace=nodes(app.render()).find(n=>n.type==='workspace');
 workspace.props.onClickCapture({button:0,target:{closest:()=>({getAttribute:key=>key==='href'?'/settings':null,hasAttribute:()=>false})},preventDefault(){blocked=true;}});
 assert.equal(blocked,true);
 assert.ok(nodes(app.render()).some(n=>n.props.open===true&&n.props.onOpenChange));
 button(app.render(),'入力を残して戻る').props.onClick();
 assert.equal(input().props.value,'Synthetic unsent request');
 assert.equal(nodes(app.render()).some(n=>n.props.open===true&&n.props.onOpenChange),false);
 button(app.render(),'＋ 新しい会話').props.onClick();
 assert.ok(nodes(app.render()).some(n=>n.props.open===true&&n.props.onOpenChange));
 button(app.render(),'入力を残して戻る').props.onClick();
 assert.equal(input().props.value,'Synthetic unsent request');
});

void test('the conversation composer preserves typed text and cannot submit without a ready execution target and consent',()=>{
 const app=harness('components/eve-sync-workspace.tsx');
 const input=()=>nodes(app.render()).find(n=>n.type==='textarea'&&n.props['aria-label']==='続きの依頼');
 input().props.onChange({target:{value:'自分の依頼'}});
 assert.equal(input().props.value,'自分の依頼');
 assert.equal(button(app.render(),'下書きを作る').props.disabled,true);
});

void test('Cloud and Tool result actions open the intended panel without dropping thread or selected agent',()=>{
 const params=new URLSearchParams({thread:'12345678-1234-1234-1234-123456789012',agent:'saved-agent',agentRevision:'7'});
 const app=harness('components/eve-sync-workspace.tsx',{params,liveSnapshots:true,initial:{20:true,29:'fixture-owner'}});
 const before=params.toString();
 app.navigateHash('#eve-work-results');
 button(app.render(),'Cloudの仕事と成果').props.onClick();
 let view=app.render();
 assert.equal(nodes(view).find(n=>n.props.id==='eve-cloud-results')?.props.open,true);
 assert.equal(params.toString(),before);
 app.navigateHash('#eve-work-results');
 button(app.render(),'Toolの仕事と成果').props.onClick();
 view=app.render();
 assert.equal(nodes(view).find(n=>n.props.id==='eve-tool-results')?.props.open,true);
 assert.equal(params.toString(),before);
});
void test('incoming news is visible with its original link and survives the account return path',()=>{
 const params=new URLSearchParams({newsSource:'https://example.com/story',sourceTitle:'選んだ記事',sourceSeenAt:'2026-11-02T08:00:00Z',sourceStale:'false'});
 const app=harness('components/eve-sync-workspace.tsx',{params,liveSnapshots:true,initial:{20:false}});
 const view=app.render();
 const banner=nodes(view).find(n=>n.props.id==='eve-news-handoff');
 assert.match(text(banner),/選んだ記事/);
 assert.ok(nodes(view).some(n=>n.type==='a'&&n.props.href==='https://example.com/story'&&n.props.rel.includes('noopener')));
 const account=nodes(view).find(n=>n.type==='a'&&n.props.href?.startsWith('/account?returnTo='));
 const back=new URL(new URL(account.props.href,'https://fixture.test').searchParams.get('returnTo'),'https://fixture.test');
 assert.equal(back.pathname,'/os/eve');
 for(const [key,value] of params)assert.equal(back.searchParams.get(key),value);
});
