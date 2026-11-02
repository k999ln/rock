import { randomUUID } from 'node:crypto';
/** Actual workerd/D1 paths, synthetic owners only; no inference, publication, or external lookup. */
export async function checkSmisEveApi({call,check,database,alice,bob}) {
 const id=randomUUID(),path='/api/sky/agents';
 const settings={name:'smis synthetic builder',instructions:'整理した文章を返す担当',provider:'local-model',model:'fixture-model',enabled:true};
 await call('GET',undefined,{path,user:null,status:401});
 await call('PUT',{id,revision:0,settings,create:true},{path,headers:{'X-smis-Owner':bob},status:409});
 await call('PUT',{id,revision:0,settings,create:true},{path,headers:{'X-sky-Owner':bob},status:409});
 await call('PUT',{id,revision:0,settings,create:true},{path,headers:{'X-sky-Owner':alice,'X-smis-Owner':bob},status:409});
 await call('PUT',{id,revision:0,settings,create:true},{path,origin:'https://other.example.test',status:403});
 const saved=await call('PUT',{id,revision:0,settings,create:true},{path,headers:{'X-smis-Owner':alice}});
 check(saved.agent.id,id);check(saved.agent.revision,1);check(saved.agent.source,'personal');
 const list=await call('GET',undefined,{path});check(list.ownerUserId,alice);check(list.agents.some(a=>a.id===id),true);
 const detail=await call('GET',undefined,{path:path+'?id='+id});check(detail.agent.instructions,settings.instructions);
 await call('GET',undefined,{path:path+'?id='+id,user:bob,status:404});
 await call('PUT',{id,revision:0,settings,create:true},{path,status:409});
 const hubPath='/api/sky/hub';
 await call('GET',undefined,{path:hubPath,user:null,status:401});
 const key='model:fixture/smis-builder',metadata={title:'Saved model',sourceUrl:'https://huggingface.co/fixture/smis-builder',revision:null,license:null,task:'text-generation',downloads:0,likes:0,gated:false,sdk:null,skyFeeMinor:0};
 await database.prepare('INSERT INTO sky_hub_plugins(owner_user_id,plugin_key,kind,resource,enabled,revision,metadata,consent_version,updated_at) VALUES(?,?,?,?,1,1,?,NULL,?)').bind(alice,key,'model','fixture/smis-builder',JSON.stringify(metadata),Date.now()).run();
 const hub=await call('GET',undefined,{path:hubPath});check(hub.ownerUserId,alice);check(hub.plugins.find(p=>p.key===key)?.metadata.title,'Saved model');
 const other=await call('GET',undefined,{path:hubPath,user:bob});check(other.ownerUserId,bob);check(other.plugins.some(p=>p.key===key),false);
 const disabled=await call('PUT',{kind:'model',resource:'fixture/smis-builder',enabled:false,revision:1},{path:hubPath});check(disabled.plugins.find(p=>p.key===key)?.enabled,false);
 await database.prepare('DELETE FROM sky_agent_settings WHERE owner_user_id=? AND id=?').bind(alice,id).run();
 await database.prepare('DELETE FROM sky_hub_plugins WHERE owner_user_id=? AND plugin_key=?').bind(alice,key).run();
}
