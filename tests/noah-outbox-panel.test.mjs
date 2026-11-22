import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../components/noah-outbox.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
const job=(state='draft',revision=1)=>({id:'record-a',revision,noahOutbox:{state,snapshotSha256:'snapshot',payload:{agent:{name:'Synthetic Agent',version:'1',summary:'Private summary'},recipient:'recipient-a',body:'Synthetic message'},source:{agentId:'agent-a'},destination:{label:'Test inbox',endpoint:'https://inbox.example.test',test:true},attempts:[]}});
const reply=(j,scope='owner-a')=>({ok:true,status:200,json:async()=>({job:j,ownerScope:scope})});
const listing=(jobs=[],next=null)=>({observedAt:1,jobs,next,ownerScope:'owner-a',agents:[{id:'agent-a',name:'Synthetic Agent',version:'1'}],invites:[],targets:[{id:'inbox',label:'Test inbox'}]});
const jsonReply=d=>({ok:true,json:async()=>d});
function harness(fetcher,{page=false}={}){
 const slots=[],effects=[],exports={},updates=[],polls=[];let cursor=0,tree,alive=true;
 const props={job:job(),scope:'owner-a',disabled:false,onUpdated:j=>updates.push(j)};
 const react={useState(initial){const i=cursor++;slots[i]??={value:initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n]))){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const jsx=(type,props)=>({type,props});
 runInNewContext(code,{exports,Error,URLSearchParams,AbortSignal,crypto:{randomUUID},window:{location:{search:'',reload(){}}},fetch:fetcher,require(id){if(id==='react')return react;if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};if(id==='next/link')return {default:'a'};if(id==='./workspace-shell')return {default:'shell'};if(id.endsWith('.css'))return {default:{}};if(id==='@/lib/owner-intent')return {OWNER_SCOPE_HEADER:'X-Rock-Owner-Scope'};if(id==='@/lib/noah-visible-polling')return {startNoahVisiblePolling(fn){const controller=new AbortController();polls.push(()=>fn(controller.signal));void fn(controller.signal);return ()=>controller.abort();}};throw Error(id);}});
 function render(){if(!alive)return;cursor=0;tree=page?exports.default():exports.NoahOutboxCard(props);effects.splice(0).forEach(f=>f());}
 function walk(n){return Array.isArray(n)?n.flatMap(walk):n&&typeof n==='object'?[n,...walk(n.props?.children)]:[];}
 const nodes=()=>walk(tree),flush=async()=>{for(let i=0;i<4;i++){await new Promise(setImmediate);render();}};
 render();return {props,updates,nodes,polls,flush,button:text=>nodes().find(n=>n.type==='button'&&n.props.children===text),unmount(){alive=false;slots.forEach(s=>s.cleanup?.());}};
}
void test('immutable preview needs a checked approval, then a separate send; rendering never mutates',async t=>{
 const calls=[],h=harness(async(_u,o)=>{calls.push(JSON.parse(o.body));return reply(job(calls.length===1?'approved':'sending',calls.length+1));});t.after(()=>h.unmount());await h.flush();assert.equal(calls.length,0);
 assert.ok(h.nodes().some(n=>n.props?.children==='Synthetic message'));assert.equal(h.button('この内容の送信を承認').props.disabled,true);h.button('この内容の送信を承認').props.onClick();await h.flush();assert.equal(calls.length,0);
 h.nodes().find(n=>n.type==='input').props.onChange({target:{checked:true}});await h.flush();h.button('この内容の送信を承認').props.onClick();await h.flush();assert.equal(calls[0].action,'approve');assert.equal(calls[0].confirmation,'noah-external-send/1');assert.equal(calls.length,1);
 h.props.job=h.updates[0];await h.flush();h.button('試験用受信箱に送る').props.onClick();await h.flush();assert.equal(calls[1].action,'send');assert.equal(calls[1].snapshotSha256,'snapshot');
});
void test('lost command acknowledgement retries the exact identity despite a polled revision',async t=>{
 const calls=[],h=harness(async(_u,o)=>{calls.push(JSON.parse(o.body));if(calls.length===1)throw Error('lost reply');return reply(job('sending',3));});t.after(()=>h.unmount());h.props.job=job('approved',2);await h.flush();h.button('試験用受信箱に送る').props.onClick();await h.flush();
 h.props.job=job('sending',3);await h.flush();assert.equal(h.button('試験用受信箱に送る'),undefined);h.button('同じ操作の結果を確認').props.onClick();await h.flush();assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].revision,2);
});
void test('unknown delivery offers readback only and never approval, cancellation or resend',async t=>{
 const calls=[],h=harness(async(_u,o)=>{calls.push(JSON.parse(o.body));return reply(job('accepted',5));});t.after(()=>h.unmount());h.props.job=job('unknown',4);await h.flush();assert.equal(h.button('試験用受信箱に送る'),undefined);assert.equal(h.button('この内容の送信を承認'),undefined);assert.equal(h.button('送信前に中止'),undefined);
 h.button('再送せず受付結果を照合').props.onClick();await h.flush();assert.equal(calls[0].action,'reconcile');
});
void test('disabled and duplicate clicks do nothing; foreign or unmounted results cannot update',async t=>{
 let release,calls=0;const h=harness(async()=>{calls++;return new Promise(r=>{release=r;});});t.after(()=>h.unmount());h.props.job=job('approved');h.props.disabled=true;await h.flush();h.button('試験用受信箱に送る').props.onClick();assert.equal(calls,0);
 h.props.disabled=false;await h.flush();h.button('試験用受信箱に送る').props.onClick();h.button('試験用受信箱に送る').props.onClick();assert.equal(calls,1);release(reply(job('sending',2),'foreign'));await h.flush();assert.equal(h.updates.length,0);
 h.button('同じ操作の結果を確認').props.onClick();h.unmount();release(reply(job('sending',2)));await h.flush();assert.equal(h.updates.length,0);
});
void test('history refresh retains newer revisions, pagination and an in-flight mutation',async t=>{
 let release;const calls=[],h=harness(async(u,o)=>{calls.push({u,o});if(u.includes('?after='))return new Promise(r=>{release=r;});return jsonReply(listing([job('sending',3)],'page-2'));},{page:true});t.after(()=>h.unmount());await h.flush();assert.ok(calls.every(c=>c.o.method===undefined));
 h.button('送信履歴の続きを表示').props.onClick();await h.flush();const card=h.nodes().find(n=>typeof n.type==='function');card.props.onUpdated(job('accepted',4));await h.flush();release(jsonReply(listing([{...job(),id:'older'}],null)));await h.flush();
 assert.equal(h.nodes().find(n=>n.type==='fieldset').props.disabled,false);assert.equal(h.button('送信履歴の続きを表示'),undefined);assert.equal(h.nodes().find(n=>typeof n.type==='function'&&n.props.job.id==='record-a').props.job.revision,4);
 await h.polls.at(-1)();await h.flush();assert.equal(h.button('送信履歴の続きを表示'),undefined);
});
void test('account change removes private history and discards a pending draft acknowledgement',async t=>{
 let release,foreign=false;const h=harness(async(_u,o)=>{if(o.method==='POST')return new Promise(r=>{release=r;});return jsonReply({...listing([job()]),ownerScope:foreign?'other':'owner-a'});},{page:true});t.after(()=>h.unmount());await h.flush();h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});foreign=true;await h.polls.at(-1)();await h.flush();release(reply(job('draft',2)));await h.flush();
 assert.equal(h.nodes().filter(n=>typeof n.type==='function').length,0);assert.equal(h.nodes().find(n=>n.type==='fieldset').props.disabled,true);assert.equal(h.nodes().filter(n=>n.type==='option'&&n.props.value==='agent-a').length,0);assert.equal(h.nodes().find(n=>n.type==='textarea').props.value,'');
});
