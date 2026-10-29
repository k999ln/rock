// Synthetic, localhost-only development bridge. Does not impersonate a product account.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Journal,fingerprint} from './journal.mjs';
import {Planner,sameBinding} from './planner.mjs';
import {runZemaLocalAgent,parseZemaLocalAgentReply} from '../../lib/zema-local-agent.ts';
import {prepareEveTextJob} from '../../lib/eve-text-job.ts';

const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(x,k));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const constant=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function validateRun(input,cases) {
  if(!exact(input,['operationId','caseId','arm','category','fault'])||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.operationId)||!cases.has(input.caseId)||!['A','C'].includes(input.arm)||!['pixel','comparison'].includes(input.category)||!['none','lost_response','delay_result','unavailable'].includes(input.fault))throw Error('invalid bounded test request');
  return input;
}
export function validateSelection(input,cases) {
  if(!exact(input,['caseId','arm','fault'])||!cases.has(input.caseId)||!['A','C'].includes(input.arm)||!['none','lost_response','delay_result','unavailable'].includes(input.fault))throw Error('invalid bounded fixture selection');
  return input;
}
async function body(req) {
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>2048)throw Error('request too large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
// Open once with exclusive creation or a non-following read; never check a path
// and subsequently use it as if its identity were unchanged.
export function loadBridgeCredentials(file,port) {
  if(fs.constants.O_NOFOLLOW===undefined)throw Error('non-following file opens required');
  let fd,created=false;
  try {fd=fs.openSync(file,fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);created=true;}
  catch(error){if(error.code!=='EEXIST')throw error;fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);}
  try {
    const info=fs.fstatSync(fd);
    if(!info.isFile()||info.nlink!==1||(info.mode&0o077)!==0||
      (typeof process.getuid==='function'&&info.uid!==process.getuid()))throw Error('private owned credential file required');
    let credentials;
    if(created){credentials={owner:'synthetic-'+crypto.randomUUID(),nonce:crypto.randomBytes(32).toString('hex'),token:crypto.randomBytes(32).toString('hex'),port};fs.writeFileSync(fd,JSON.stringify(credentials));fs.fsyncSync(fd);}
    else {try{credentials=JSON.parse(fs.readFileSync(fd,'utf8'));}catch{throw Error('invalid bridge credentials');}}
    if(!exact(credentials,['owner','nonce','token','port'])||typeof credentials.owner!=='string'||
      !/^synthetic-[0-9a-f-]{36}$/.test(credentials.owner)||!['nonce','token'].every(k=>typeof credentials[k]==='string'&&/^[0-9a-f]{64}$/.test(credentials[k]))||credentials.port!==port)throw Error('invalid bridge credentials or test session port mismatch');
    return credentials;
  }finally{fs.closeSync(fd);}
}
export function bridgeContentSecurityPolicy(html) {
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  if(scripts.length!==1)throw Error('exactly one inline client script required');
  const digest=crypto.createHash('sha256').update(scripts[0][1]).digest('base64');
  return `default-src 'none'; script-src 'sha256-${digest}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
}
export async function createBridge({root,base,python,port=18749,planner:injectedPlanner}) {
  const session=JSON.parse(fs.readFileSync(path.join(root,'session.json'),'utf8'));
  const candidate=JSON.parse(fs.readFileSync(path.join(root,'candidate-manifest.json'),'utf8'));
  const binding={baseSha256:candidate.base.files['model.safetensors'],adapterSha256:candidate.adapterSha256,
    tokenizerSha256:candidate.base.files['tokenizer.json'],candidateManifestSha256:sha(fs.readFileSync(path.join(root,'candidate-manifest.json')))};
  const raw=fs.readFileSync(path.join(root,'observed-v3','development.jsonl'),'utf8');
  const developmentCases=new Map(raw.trim().split('\n').map(JSON.parse).map(x=>[x.id,x]));
  if(developmentCases.size!==20)throw Error('exactly20 frozen development tasks required');
  const cases=new Map(developmentCases);
  const functional=path.join(root,'functional-v1','extra.jsonl');
  if(fs.existsSync(functional)){
    const fixture=fs.readFileSync(functional,'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(root,'functional-v1','manifest.json'),'utf8'));
    if(sha(fixture)!==manifest.extraSha256||manifest.sourceDevelopmentSha256!==sha(raw))throw Error('functional fixture identity mismatch');
    const extra=fixture.trim().split('\n').map(JSON.parse),legacy=manifest.schema==='eve.physical-functional-fixtures/1';
    const expected=legacy?['dev_archive-01-ja-clean']:['dev_archive-01-ja-clean','functional-coco-ja-20','functional-coco-en-80'];
    if(!legacy&&manifest.schema!=='eve.physical-functional-fixtures/2')throw Error('unknown functional fixture schema');
    if(manifest.records!==expected.length||extra.length!==expected.length||new Set(extra.map(x=>x.id)).size!==expected.length||extra.some(x=>!expected.includes(x.id)||cases.has(x.id)))throw Error('unexpected physical controls');
    if(!legacy&&(!Array.isArray(manifest.caseIds)||manifest.caseIds.length!==3||new Set(manifest.caseIds).size!==3||manifest.caseIds.some(id=>!expected.includes(id))||manifest.trainingUse!==false||manifest.teacherCalls!==0))throw Error('invalid three-case functional manifest');
    for(const task of extra)cases.set(task.id,task);
  }
  const credentialsFile=path.join(root,'bridge-credentials.json');
  const credentials=loadBridgeCredentials(credentialsFile,port);
  const journal=new Journal(path.join(root,'client-jobs.sqlite'),credentials.owner);
  const planner=injectedPlanner??new Planner({root,base,python,expectedBinding:binding});
  let selection={revision:0,caseId:null,arm:'C',fault:'none'};
  let active=null,group=null,closing=false,lastProbe=null,busy=false,activeCompletion=Promise.resolve(),groupCompletion=Promise.resolve();
  const safeEnd=Date.parse(session.deadlineAt)-900000;
  const checkTime=()=>{if(Date.now()>=safeEnd||closing)throw Error('session safe-stop boundary');};
  async function execute(record,task,fault) {
    let resolveCompletion;activeCompletion=new Promise(resolve=>{resolveCompletion=resolve;});
    const trace=[];const started=Date.now();record.state='running';journal.save(record);active=record.id;
    try {
      checkTime();if(fault==='unavailable')throw Error('synthetic model-unavailable fault; no model called');
      const result=await runZemaLocalAgent({request:task.request+'\n資料（データ）:\n'+JSON.stringify(task.materials),maxSteps:3,
        planner:async input=>{
          checkTime();if(journal.get(record.id).state==='cancelled')throw Error('job cancelled');
          if(task.setupToolFailure&&input.step===1){
            const raw=JSON.stringify({schema:'zema-local-agent/1',action:'tool',...task.setupToolFailure,reason:'synthetic injected invalid argument, matched across arms'});
            trace.push({step:input.step,scriptedFault:true,raw});return raw;
          }
          const remaining=120000-(Date.now()-started);if(remaining<=0)throw Error('whole-job timeout');
          const output=await planner.generate({id:record.id+':'+input.step,category:record.category,arm:record.arm,
            system:input.system,prompt:input.prompt,maxTokens:256},remaining);
          if(!sameBinding(output.binding,binding)){await planner.stop('identity');throw Object.assign(Error('result candidate identity mismatch'),{fatal:true});}
          let strict=false,parsed=null;try{const obj=JSON.parse(output.raw);strict=!output.excludedReasoning&&obj&&typeof obj==='object'&&!Array.isArray(obj);parsed=parseZemaLocalAgentReply(output.raw);}catch{}
          trace.push({step:input.step,strictJson:strict,parsed,output});
          if(journal.get(record.id).state==='cancelled')throw Error('late model output after stop');
          if(output.finishReason!=='stop')throw Object.assign(Error('INCOMPLETE_MODEL_REPLY'),{code:'INCOMPLETE_MODEL_REPLY'});
          return output.raw;
        }});
      if(fault==='delay_result')await new Promise(resolve=>setTimeout(resolve,5000));
      journal.finish(record.id,{result},trace);
    } catch(error){journal.finish(record.id,{error:error.code??error.message},trace);if(error.fatal&&group?.state==='running'){group.state='stopped';group.error='fatal model/resource error; remaining tasks not started';}}
    finally {await planner.stop('normal_job_end');if(planner.halted&&group?.state==='running'){group.state='stopped';group.error='fatal model/resource cleanup; no next job';}if(active===record.id)active=null;resolveCompletion();}
  }
  async function start(input) {
    checkTime();validateRun(input,cases);
    if(journal.get(input.operationId))return await journal.create(input,cases.get(input.caseId),binding);
    if(planner.halted)throw Error('model/resource experiment halted; no automatic retry');
    if(active||busy||group?.state==='running')throw Error('another owned GPU job is active');
    busy=true;
    try{
      const outcome=await journal.create(input,cases.get(input.caseId),binding);checkTime();
      if(!outcome.replayed)void execute(outcome.record,cases.get(input.caseId),input.fault);
      return outcome;
    }finally{busy=false;}
  }
  async function compare() {
    if(planner.halted)throw Error('model/resource experiment halted; no automatic retry');
    checkTime();if(active||busy||group?.state==='running')throw Error('experiment already active');busy=true;
    group={id:crypto.randomUUID(),state:'running',startedAt:new Date().toISOString(),completed:0,total:40,plannedTasksSha256:sha(raw),arms:['A','C'],faults:'repair first-step injected identically'};
    const current=group;
    groupCompletion=(async()=>{
      try{
        for(const arm of ['A','C'])for(const task of developmentCases.values()){
          checkTime();if(current.state!=='running')throw Error('comparison stopped');
          const input={operationId:crypto.randomUUID(),caseId:task.id,arm,category:'comparison',fault:'none'};
          const {record}=await journal.create(input,task,binding);
          if(current.state!=='running'||closing){journal.cancel(record.id);throw Error('comparison stopped before dispatch');}
          await execute(record,task,'none');current.completed++;
          fs.writeFileSync(path.join(root,'comparison-progress.json'),JSON.stringify(current,null,2)+'\n');
        }
        current.state='completed';current.finishedAt=new Date().toISOString();
      }catch(error){current.state='stopped';current.error=error.message;}
      busy=false;fs.writeFileSync(path.join(root,'comparison-progress.json'),JSON.stringify(current,null,2)+'\n');
    })();
    return current;
  }
  const html=fs.readFileSync(fileURLToPath(new URL('./client.html',import.meta.url)),'utf8');
  const csp=bridgeContentSecurityPolicy(html);
  const server=http.createServer(async(req,res)=>{
    const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',csp);
    try{
      const host=req.headers.host;
      if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return json(403,{error:'host refused'});
      const url=new URL(req.url,`http://${host}`);checkTime();
      if(req.method==='POST'&&req.headers.origin!==`http://${host}`)return json(403,{error:'origin refused'});
      if(req.method==='POST'&&req.headers['content-type']!=='application/json')return json(415,{error:'JSON required'});
      if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;}
      if(req.method==='POST'&&url.pathname==='/api/session'){
        const value=await body(req);if(!exact(value,['nonce'])||!constant(value.nonce,credentials.nonce))return json(403,{error:'session refused'});
        res.setHeader('Set-Cookie',`eve_dev=${credentials.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(0,Math.floor((safeEnd-Date.now())/1000))}`);return json(200,{authenticated:true,ownerScope:'synthetic development session'});
      }
      const cookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('eve_dev='))?.slice(8);
      if(!constant(cookie,credentials.token))return json(401,{error:'development session required'});
      if(req.method==='GET'&&url.pathname==='/api/state')return json(200,{binding,group,active,lastProbe,selection,modelHalted:Boolean(planner.halted),runs:journal.list(),cases:[...cases.values()].map(({id,request,materials})=>({id,request,materials}))});
      if(req.method==='POST'&&url.pathname==='/api/select'){
        const input=validateSelection(await body(req),cases);
        if(active||busy||group?.state==='running')throw Error('cannot select while an owned job is active');
        selection={revision:selection.revision+1,caseId:input.caseId,arm:input.arm,fault:input.fault};
        return json(200,{selection,modelCalls:0,jobsCreated:0});
      }
      if(req.method==='GET'&&url.pathname==='/api/run-status'){
        const record=journal.get(url.searchParams.get('id'));return json(record?200:404,record??{error:'job not found'});
      }
      if(req.method==='POST'&&url.pathname==='/api/run'){
        if(group?.state==='running')throw Error('comparison already active');
        const input=await body(req);if(input.category!=='pixel')throw Error('interactive route only permits Pixel pool');
        const outcome=await start(input);
        if(input.fault==='lost_response'&&!outcome.replayed){req.socket.destroy();return;}
        return json(202,outcome);
      }
      if(req.method==='POST'&&url.pathname==='/api/compare'){const value=await body(req);if(!exact(value,[]))throw Error('unexpected comparison option');return json(202,await compare());}
      if(req.method==='POST'&&url.pathname==='/api/stop'){
        const value=await body(req);if(!exact(value,['operationId']))throw Error('invalid stop');
        if(!journal.get(value.operationId))throw Error('job not found');
        if(group?.state==='running')group.state='stopped';
        const stoppedId=active??value.operationId;
        const record=journal.cancel(stoppedId);
        const termination=active===record.id?await planner.stop():{terminated:true,alreadyStopped:true};
        await activeCompletion;
        const stopped=journal.get(stoppedId);
        if(stopped.state==='cancelled'){stopped.stopReceipt={requestedId:value.operationId,stoppedId,termination,confirmedAt:new Date().toISOString(),scope:'owned Mac model worker only; no remote provider finality claim'};journal.save(stopped);}
        return json(200,{requestedId:value.operationId,stoppedId,record:stopped,termination});
      }
      if(req.method==='POST'&&url.pathname==='/api/probe'){
        const value=await body(req);if(!exact(value,['kind'])||value.kind!=='oversize')throw Error('unknown probe');
        let rejected=false;try{prepareEveTextJob(Array.from({length:5},(_,i)=>({name:String(i),text:'synthetic'})),'synthetic overlimit');}catch{rejected=true;}
        lastProbe={kind:'oversize',rejected,modelCalls:0,existingJobCount:journal.list().length};return json(200,lastProbe);
      }
      return json(404,{error:'route not found'});
    }catch(error){return json(409,{error:String(error.message).slice(0,200)});}
  });
  server.requestTimeout=10000;server.headersTimeout=5000;
  const safeTimer=setTimeout(()=>{closing=true;if(group?.state==='running')group.state='stopped';void planner.stop();server.close();},Math.max(1,safeEnd-Date.now()));safeTimer.unref();
  return {server,journal,planner,credentialsFile,binding,start,compare,close:async()=>{closing=true;if(group?.state==='running')group.state='stopped';clearTimeout(safeTimer);await planner.stop();await activeCompletion;await groupCompletion;if(server.listening)await new Promise(resolve=>server.close(resolve));journal.db.close();}};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [root,base,python]=process.argv.slice(2);if(!root||!base||!python)throw Error('root base python paths required');
  const bridge=await createBridge({root,base,python});
  bridge.server.listen(18749,'127.0.0.1',()=>console.log(JSON.stringify({listening:'127.0.0.1:18749',credentialsFile:bridge.credentialsFile,binding:bridge.binding})));
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{void bridge.close().then(()=>process.exit(0));});
}
