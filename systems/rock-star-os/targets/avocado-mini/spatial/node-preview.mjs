import { userInfo } from 'node:os';
import { openNodeExecutorJournal } from '../../../../../packages/rockstaros-runtime/src/node-host.mjs';
import { createLocalDraftApp,createSpatialDraftRuntime,demoContext,demoRay } from './runtime.mjs';

const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++) {
 if(args[i]==='--accept-local-draft')options.accept=true;
 else if(['--state-dir','--u','--v','--read-id'].includes(args[i])) {if(options[args[i]]!==undefined || !args[i+1])throw new Error('INVALID_OPTIONS');options[args[i]]=args[++i];}
 else throw new Error('UNKNOWN_OPTION');
}
if(!options['--state-dir'])throw new Error('PRIVATE_STATE_DIRECTORY_REQUIRED');
const journal=await openNodeExecutorJournal(options['--state-dir']);
try {
 const owner=`local-uid:${userInfo().uid}`;
 if(options['--read-id']) {
  const id=options['--read-id'];if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('INVALID_ACTION_ID');
  const saved=await journal.get(id);if(!saved || saved.owner!==owner || saved.schema!=='rockstaros.spatial-local-execution/1')throw new Error('SPATIAL_ACTION_NOT_FOUND');
  console.log(JSON.stringify({...saved,observedState:saved.state==='running'?'unknown':saved.state,reexecutionPerformed:false},null,2));
 } else {
  if(!options.accept)throw new Error('EXPLICIT_LOCAL_DRAFT_APPROVAL_REQUIRED');
  const uv=[Number(options['--u']??.68),Number(options['--v']??.42)],deviceId=crypto.randomUUID(),context=demoContext(owner,deviceId);
  const runtime=createSpatialDraftRuntime({owner,deviceId,hostSurface:'node',journal,app:createLocalDraftApp(),context:()=>context,
   authorize:async binding=>{if(binding.permission!=='local-draft.move'||binding.maximumCloudCostMinor!==0)throw new Error('SCOPE_REJECTED');return binding;}});
  const prepared=await runtime.prepare(demoRay(context,uv,0));
  console.log(JSON.stringify(await runtime.commit(prepared.id),null,2));
 }
}finally {await journal.close();}
