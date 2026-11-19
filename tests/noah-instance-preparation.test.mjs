import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createInstancePreparation, instancePreparationMiddleware } from '../scripts/noah-instance-preparation.mjs';

const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const flush=()=>new Promise(setImmediate);
const pin={agentId:randomUUID(),kind:'upload',version:'2.0.0',model:'none',digest:'a'.repeat(64),manifestSha256:'b'.repeat(64),sourceSha256:'c'.repeat(64)};
function fixture(t,{hold,fail=false}={}) {
  const manager=createInstancePreparation({wait:async()=>{await hold?.promise;}}),calls=[];t.after(()=>manager.close());let current,connections=0,canFinish=false;
  const input={id:randomUUID(),revision:1,commandId:randomUUID(),agentId:pin.agentId,digest:pin.digest,replacePending:false};
  const client={revalidate:async()=>{},api:async(action,value)=>{
    calls.push({action,value});
    if(action==='prepare'){current=value.commandId;return {instance:{id:input.id,pending:{id:current,pin}}};}
    if(action==='cancel'){current=null;return {instance:{id:input.id,pending:null}};}
    if(action==='finish'){if(current!==value.commandId)throw new Error('cancelled');canFinish=value.state==='selected';current=null;}
    return {instance:{id:input.id,pending:current?{id:current,pin}:null}};
  },installations:{async connect(){connections++;},async status(){return hold&&!hold.done?{busy:true}:{busy:false,state:fail?'failed':'connected'};},async execution(){return {binding:{version:pin.version,model:pin.model,source:{uploadId:pin.agentId,manifestSha256:pin.manifestSha256,sourceSha256:pin.sourceSha256}}};}}};
  return {manager,input,client,calls,get connections(){return connections;},get selected(){return canFinish;}};
}

void test('host prepares the candidate independently of response/view lifetime; same request is not prepared twice',async t=>{
  const hold=gate(),f=fixture(t,{hold});await f.manager.start('owner',f.input,f.client);await flush();
  await f.manager.start('owner',f.input,f.client);assert.equal(f.connections,1);assert.equal(f.selected,false);
  hold.done=true;hold.resolve();await flush();assert.equal(f.selected,true);
  const finish=f.calls.find(c=>c.action==='finish');assert.equal(finish.value.state,'selected');assert.equal(finish.value.claim.length,64);
});
void test('capacity/preparation failure preserves selection and a new explicit retry may prepare again',async t=>{
  const f=fixture(t,{fail:true});await f.manager.start('owner',f.input,f.client);await flush();
  assert.equal(f.selected,false);assert.equal(f.calls.find(c=>c.action==='finish').value.state,'failed');
  f.client.installations.status=async()=>({busy:false,state:'connected'});
  await f.manager.start('owner',{...f.input,commandId:randomUUID(),revision:3},f.client);await flush();assert.equal(f.selected,true);
});
void test('cancelled and disconnected preparations cannot select; no runtime stop is sent to an in-flight old version',async t=>{
  const hold=gate(),f=fixture(t,{hold});let stops=0;f.client.installations.disconnect=async()=>{stops++;};
  await f.manager.start('owner',f.input,f.client);await flush();await f.manager.cancel('owner',{id:f.input.id,revision:2},f.client);
  hold.done=true;hold.resolve();await flush();assert.equal(f.selected,false);assert.equal(stops,0);
  f.client.revalidate=async()=>{throw new Error('owner changed');};
  await assert.rejects(f.manager.start('owner',{...f.input,commandId:randomUUID()},f.client));
});

void test('concurrent owner checks cannot overbook the two preparation slots',async t=>{
  const hold=gate(),f=fixture(t,{hold});
  try {
    const results=await Promise.allSettled(Array.from({length:3},()=>f.manager.start('owner',{...f.input,id:randomUUID(),commandId:randomUUID()},f.client)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
    assert.equal(results.find(r=>r.status==='rejected').reason.status,429);
    assert.equal(f.connections,2);
  } finally {hold.done=true;hold.resolve();await flush();}
});

void test('prepared source mismatch and disk exhaustion never select a candidate',async t=>{
  for(const failure of ['hash','capacity']) {
    const f=fixture(t);
    if(failure==='hash') f.client.installations.execution=async()=>({binding:{version:pin.version,model:pin.model,source:{uploadId:pin.agentId,manifestSha256:pin.manifestSha256,sourceSha256:'d'.repeat(64)}}});
    else f.client.installations.connect=async()=>{throw Object.assign(new Error('disk full'),{code:'ENOSPC'});};
    await f.manager.start('owner',f.input,f.client);await flush();
    assert.equal(f.selected,false);assert.equal(f.calls.find(c=>c.action==='finish').value.state,'failed');
  }
});

void test('instance host rejects foreign origin, nonlocal host, wrong owner, oversize bodies before preparation',async()=>{
  const scope='owner-v1:'+ 'a'.repeat(64);let starts=0;
  const middleware=instancePreparationMiddleware({port:3107,manager:{start:async()=>{starts++;return{instance:{id:'test'}};},attached:(_s,i)=>i},installations:{},getOwner:async()=>({localHostOwner:true,ownerScope:scope}),instanceFor:()=>async()=>({})});
  const send=async(headers={},body='{}',remote='127.0.0.1')=>{
    const request=Readable.from([Buffer.from(body)]);Object.assign(request,{url:'/__noah/instances',method:'POST',socket:{remoteAddress:remote},headers:{host:'127.0.0.1:3107',origin:'http://127.0.0.1:3107','content-type':'application/json','x-rock-owner-scope':scope,...headers}});
    let status;await middleware(request,{writeHead:s=>{status=s;},end:()=>{}},()=>assert.fail('unexpected pass-through'));return status;
  };
  assert.equal(await send({origin:'https://foreign.example'}),403);
  assert.equal(await send({},'{}','192.0.2.1'),403);
  assert.equal(await send({'x-rock-owner-scope':'owner-v1:'+'b'.repeat(64)}),409);
  assert.equal(await send({},'x'.repeat(4097)),413);
  assert.equal(starts,0);
});

// Exercise the actual page handlers: a rejected stale revision must permit a new
// explicit intent, while a lost response must retain its idempotency key.
void test('version UI retries a known conflict with the latest revision, but preserves intent after network uncertainty',async t=>{
  const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');const {default:ts}=await import('typescript');
  const {visiblePollingFixture}=await import('./helpers/noah-visible-polling-fixture.mjs');
  for(const uncertain of [false,true]) {
    const slots=[],effects=[],polling=visiblePollingFixture(),posts=[];let cursor=0,tree,rev=1;
    const active={...pin,digest:'e'.repeat(64),version:'1.0.0',permissions:[]};const candidate={...pin,permissions:[]};
    const record=()=>({id:randomUUID(),revision:rev,active,history:[],pending:null,removed:false,last:null});
    const react={useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},useRef(initial){return slots[cursor++]??={current:initial};},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n]))){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
    const jsx=(type,props)=>({type,props});
    const fetcher=async(url,options)=>{
      if(options.method==='POST') {
        posts.push(JSON.parse(options.body));
        if(posts.length===1){rev=2;if(uncertain)throw new TypeError('lost response');return{ok:false,status:409,json:async()=>({error:'stale revision'})};}
      }
      return {ok:true,status:200,json:async()=>({ownerScope:'owner-a',instance:record(),pins:[candidate]})};
    };
    const compile=name=>{
      const exports={};const code=ts.transpileModule(readFileSync(new URL('../components/'+name+'.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
      runInNewContext(code,{exports,Error,crypto,fetch:fetcher,require(id){
        if(id==='react')return react;if(id==='react/jsx-runtime')return{jsx,jsxs:jsx};if(id==='next/link')return{default:'a'};
        if(id==='@/lib/owner-intent')return{OWNER_SCOPE_HEADER:'X-Rock-Owner-Scope'};
        if(id==='@/lib/noah-visible-polling')return{startNoahVisiblePolling:polling.start};if(id==='./noah-instances')return shared;
        if(id==='./workspace-shell'||id==='./noah-managed-installation')return{default:'section'};if(id.endsWith('.css'))return{default:{}};
        throw new Error('Unexpected import '+id);
      }});return exports;
    };
    const shared=compile('noah-instances');const page=compile('noah-instance-detail').default;
    const render=()=>{cursor=0;tree=page({id:'test-instance'});effects.splice(0).forEach(fn=>fn());};
    const walk=n=>Array.isArray(n)?n.flatMap(walk):n&&typeof n==='object'?[n,...walk(n.props?.children)]:[];
    const nodes=()=>walk(tree),flush=async()=>{for(let i=0;i<4;i++){await new Promise(setImmediate);render();}};
    t.after(()=>slots.forEach(s=>s.cleanup?.()));render();await flush();
    nodes().find(n=>n.type==='select').props.onChange({target:{value:pin.digest}});await flush();
    const confirm=()=>nodes().find(n=>n.type==='input'&&n.props.type==='checkbox');
    const submit=()=>nodes().find(n=>n.type==='button'&&n.props.children==='この版を準備して使う');
    confirm().props.onChange({target:{checked:true}});await flush();submit().props.onClick();await flush();
    assert.equal(posts[0].revision,1);assert.equal(submit().props.disabled,!uncertain);
    if(!uncertain){confirm().props.onChange({target:{checked:true}});await flush();}
    submit().props.onClick();await flush();assert.equal(posts.length,2);
    assert.equal(posts[1].revision,uncertain?1:2);
    assert.equal(posts[1].commandId===posts[0].commandId,uncertain);
  }
});
