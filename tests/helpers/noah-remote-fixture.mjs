import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createIntakeStore } from '../../lib/noah-intake-store.ts';
import { parseNoahFlags } from '../../lib/noah-flags.ts';
import { createNoahConnectApi, createNoahConnectPlanApi } from '../../lib/noah-connect.ts';
import { createNoahAskApi, createNoahToolsApi } from '../../lib/noah-ask.ts';
import { createIntakeApi } from '../../lib/noah-intake-api.ts';
import { ownerScopeFor } from '../../lib/owner-intent.ts';
import { workStore } from '../../lib/work-store.ts';
export const tool = (name,required=false,readOnly=true) => ({name,description:`${name} description`,inputSchema:{type:'object',properties:required?{query:{type:'string',title:'調べること',maxLength:200}}:{},required:required?['query']:[]},annotations:{readOnlyHint:readOnly}});
export async function remoteFixture(t, options={}) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec("PRAGMA foreign_keys=ON; CREATE TABLE noah_runner_devices(id TEXT PRIMARY KEY); CREATE TABLE noah_runner_commands(id TEXT PRIMARY KEY); CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL);");
  for(const name of ['0044_noah_intake','0047_noah_connections','0048_noah_asks']) sql.exec(readFileSync(new URL(`../../drizzle/${name}.sql`,import.meta.url),'utf8'));
  const statement=(query,args=[])=>({query,args,bind(...values){assertBindings(values);return statement(query,values);},async first(){return sql.prepare(query).get(...args)??null;},async all(){return this.execute();},async run(){return this.execute();},execute(){const stmt=sql.prepare(query);const results=stmt.columns().length?stmt.all(...args):[];const changes=stmt.columns().length?sql.prepare('SELECT changes() n').get().n:Number(stmt.run(...args).changes);return {results,meta:{changes}};}});
  function assertBindings(values){if(values.length>100)throw Error('D1 binding limit');}
  const db={prepare:statement,async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>s.execute());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  let clock=Date.UTC(2026,10,21,10);const requests=[],pending=[];
  const state={tools:[tool('read',false),tool('search',true),tool('review',true,false)],status:0,callStatus:0,callHook:null,callResult:{content:[{type:'text',text:'Agentから受け取った成果'}]},...options};
  const family='mcp-registry:test.provider/phone-agent';
  const fetcher=async (address,init={})=>{
    const url=String(address);
    if(url.includes('registry.modelcontextprotocol.io')) return Response.json({servers:[{server:{name:'test.provider/phone-agent',title:'Phone Agent',description:'Synthetic phone loop fixture',version:'1.0.0',remotes:[{type:'streamable-http',url:'https://phone.example.com/mcp'}]},_meta:{'io.modelcontextprotocol.registry/official':{status:'active',updatedAt:new Date(clock).toISOString()}}}],metadata:{}});
    const body=init.body?JSON.parse(init.body):null;requests.push({url,method:init.method,headers:new Headers(init.headers),body});
    if(init.method==='DELETE')return new Response(null,{status:204});
    if(state.status)return new Response(null,{status:state.status,headers:{'Retry-After':'120','WWW-Authenticate':'Bearer resource_metadata="https://auth.example.com/metadata"'}});
    if(body.method==='initialize')return Response.json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-11-25',serverInfo:{name:'fixture'}}});
    if(body.method==='notifications/initialized')return new Response(null,{status:202});
    if(body.method==='tools/list')return Response.json({jsonrpc:'2.0',id:body.id,result:{tools:state.tools}});
    if(body.method==='tools/call'){
      if(state.callHook)await state.callHook(init);
      if(state.callStatus)return new Response(null,{status:state.callStatus,headers:{'Retry-After':'120'}});
      return Response.json({jsonrpc:'2.0',id:body.id,result:state.callResult});
    }
    throw Error('Unexpected request');
  };
  const deps={db,fetcher,now:()=>clock,origin:'https://noah.example.com',authenticate:async r=>{const owner=r.headers.get('test-owner');if(!owner)throw Error('UNAUTHORIZED');return owner;},
    flags:parseNoahFlags({NOAH_INTAKE_PUBLIC:'true',NOAH_ASK_FORM:'true',NOAH_PATROL_ENABLED:'true'}),reviewers:['reviewer'],defer:p=>{pending.push(p);}};
  const store=createIntakeStore(deps);await store.sync();if(options.probe!==false)await store.probeDue();
  const apis={connect:createNoahConnectApi(deps),plan:createNoahConnectPlanApi(deps),ask:createNoahAskApi(deps),tools:createNoahToolsApi(deps),intake:createIntakeApi(deps)};
  async function request(kind,body,extra={}){
    const owner=Object.hasOwn(extra,'owner')?extra.owner:'alice';
    const headers={...(owner?{'test-owner':owner}:{}),...(body?{'Content-Type':'application/json',Origin:'https://noah.example.com','X-Rock-Owner-Scope':await ownerScopeFor(owner)}:{}),...extra.headers};
    const path=kind==='plan'?'/api/noah/connect-plan':'/api/noah/'+kind;
    const res=await apis[kind](new Request('https://noah.example.com'+path+(extra.query??''),{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})}),extra.id);
    return {status:res.status,data:await res.json(),headers:res.headers};
  }
  async function connect(owner='alice'){
    const plan=await request('plan',null,{owner,query:'?agent='+encodeURIComponent(family)});
    const response=await request('connect',{id:crypto.randomUUID(),agentId:family,planSha256:plan.data.planSha256},{owner});
    if(response.status!==200)throw Error(JSON.stringify(response));return response.data;
  }
  return {sql,db,deps,store,requests,state,family,request,connect,pending,advance:ms=>{clock+=ms;},time:()=>clock,
    drain:async()=>{while(pending.length)await Promise.all(pending.splice(0));},works:workStore(db),calls:()=>requests.filter(r=>r.body?.method==='tools/call')};
}
