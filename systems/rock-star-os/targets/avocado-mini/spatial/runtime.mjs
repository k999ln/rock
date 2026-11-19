import { createMiniSpatialPreviewJob, recordMiniSpatialPreview } from '../../../../../lib/mini-spatial-workflow.ts';

const fail = (ok, code) => { if (!ok) throw new Error(code); };
const obj = v => v && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => obj(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const integer = v => Number.isSafeInteger(v) && v >= 0;
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const add = (a,b) => a.map((v,i)=>v+b[i]);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const mul = (a,s) => a.map(v=>v*s);
const norm = a => Math.sqrt(dot(a,a));
const unit = a => vector(a) && Math.abs(norm(a)-1) < 1e-6;
const clone = v => structuredClone(v);
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const canonical = v => Array.isArray(v) ? '['+v.map(canonical).join(',')+']' : obj(v) ? '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}' : JSON.stringify(v);
async function digest(v) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(v))))].map(b=>b.toString(16).padStart(2,'0')).join(''); }

/** Row-major rigid transform. Foreign axes/scale require an explicit adapter. */
export function transformPoint(matrix, point) {
  fail(Array.isArray(matrix) && matrix.length===16 && matrix.every(Number.isFinite) && vector(point), 'INVALID_TRANSFORM');
  fail(matrix.slice(12).every((v,i)=>Math.abs(v-([0,0,0,1][i]))<1e-9),'INVALID_AFFINE_ROW');
  const rows=[matrix.slice(0,3),matrix.slice(4,7),matrix.slice(8,11)];
  const determinant=rows[0][0]*(rows[1][1]*rows[2][2]-rows[1][2]*rows[2][1])-rows[0][1]*(rows[1][0]*rows[2][2]-rows[1][2]*rows[2][0])+rows[0][2]*(rows[1][0]*rows[2][1]-rows[1][1]*rows[2][0]);
  fail(rows.every(unit) && Math.abs(dot(rows[0],rows[1]))<1e-6 && Math.abs(dot(rows[0],rows[2]))<1e-6 && Math.abs(dot(rows[1],rows[2]))<1e-6 && Math.abs(determinant-1)<1e-6,'NON_RIGID_TRANSFORM');
  return rows.map((r,i)=>dot(r,point)+matrix[i*4+3]);
}
function bounds(box) { return exact(box,['min','max']) && vector(box.min) && vector(box.max) && box.min.every((v,i)=>v<box.max[i]); }
function inside(p,box,margin=0) { return p.every((v,i)=>v>=box.min[i]+margin && v<=box.max[i]-margin); }
function obstruction(origin,direction,box,limit) {
  fail(bounds(box),'INVALID_OCCLUDER');let lo=0,hi=limit;
  for(let i=0;i<3;i++) {
    if(Math.abs(direction[i])<1e-9){if(origin[i]<box.min[i] || origin[i]>box.max[i])return false;}
    else {const a=(box.min[i]-origin[i])/direction[i],b=(box.max[i]-origin[i])/direction[i];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return false;}
  }
  return lo<limit-1e-6 && hi>=0;
}
export function resolveRay(observation, context, now) {
  fail(exact(observation,['schema','source','bootId','sequence','calibrationId','placeEpoch','observedMonoMs','expiresMonoMs','origin','direction','errorBoundM']),'INVALID_OBSERVATION');
  fail(observation.schema==='rockstaros.spatial-ray/1' && observation.source==='synthetic-pointer','UNSUPPORTED_SENSOR_SOURCE');
  fail(Number.isFinite(now) && Number.isFinite(observation.observedMonoMs) && Number.isFinite(observation.expiresMonoMs) && observation.observedMonoMs<=now && now<observation.expiresMonoMs && observation.expiresMonoMs>observation.observedMonoMs && observation.expiresMonoMs-observation.observedMonoMs<=100+1e-6,'STALE_INPUT');
  fail(integer(observation.sequence) && observation.bootId===context.bootId && observation.calibrationId===context.calibrationId && observation.placeEpoch===context.placeEpoch,'OBSERVATION_BINDING_MISMATCH');
  fail(context.tracking && now<context.expiresMonoMs && bounds(context.domain),'CALIBRATION_UNAVAILABLE');
  fail(vector(observation.origin) && unit(observation.direction) && Number.isFinite(observation.errorBoundM) && observation.errorBoundM>=0 && observation.errorBoundM<=0.015,'INPUT_PRECISION_UNAVAILABLE');
  const p=context.surface;
  fail(vector(p.center) && unit(p.right) && unit(p.up) && unit(p.normal) && Math.abs(dot(p.right,p.up))<1e-6 && Math.abs(dot(p.right,p.normal))<1e-6 && Math.abs(dot(p.up,p.normal))<1e-6 && Number.isFinite(p.widthM) && p.widthM>0 && Number.isFinite(p.heightM) && p.heightM>0,'INVALID_SURFACE');
  const denominator=dot(observation.direction,p.normal);
  fail(denominator < -1e-6,'BACKFACE_OR_PARALLEL');
  const distance=dot(sub(p.center,observation.origin),p.normal)/denominator;
  fail(distance>0 && distance<=5,'RAY_RANGE_UNAVAILABLE');
  const point=add(observation.origin,mul(observation.direction,distance));
  fail(inside(point,context.domain,observation.errorBoundM),'OUTSIDE_DOMAIN');
  fail(Array.isArray(context.occluders) && context.occluders.length<=64,'INVALID_OCCLUDERS');
  fail(!context.occluders.some(b=>obstruction(observation.origin,observation.direction,b,distance)),'OCCLUDED');
  const relative=sub(point,p.center),u=dot(relative,p.right)/p.widthM+0.5,v=0.5-dot(relative,p.up)/p.heightM;
  const guardU=Math.max(0.025,observation.errorBoundM/p.widthM),guardV=Math.max(0.025,observation.errorBoundM/p.heightM);
  fail(u>=guardU && u<=1-guardU && v>=guardV && v<=1-guardV,'SURFACE_EDGE_UNCERTAIN');
  return {point,uv:[u,v],surfaceId:p.id,inputSource:observation.source};
}

/** First-party in-memory local draft; no outside app, CAD or physical actuator. */
export function createLocalDraftApp() {
  let state={schema:'rockstaros.local-spatial-draft/1',appId:'mini-local-draft',objectId:'panel',revision:0,x:0.5,y:0.5};
  return Object.freeze({
    read:async()=>clone(state),
    async move(expectedRevision,uv) {
      fail(expectedRevision===state.revision && Array.isArray(uv) && uv.length===2 && uv.every(v=>Number.isFinite(v) && v>=0.025 && v<=0.975),'APP_REVISION_OR_TARGET_CHANGED');
      state={...state,revision:state.revision+1,x:uv[0],y:uv[1]};return clone(state);
    }
  });
}
export function memorySpatialJournal(owner) {
  const records=new Map();
  return {owner,get:async id=>clone(records.get(id)??null),
    async claim(value) {fail(value.owner===owner && uuid(value.id),'JOURNAL_OWNER_MISMATCH');if(records.has(value.id))return {created:false,record:clone(records.get(value.id))};fail(records.size<100,'JOURNAL_FULL');records.set(value.id,clone(value));return {created:true,record:clone(value)};},
    async replace(id,revision,value) {const old=records.get(id);fail(old && old.revision===revision && value.id===id && value.owner===owner && value.digest===old.digest && value.revision===revision+1,'JOURNAL_CONFLICT');records.set(id,clone(value));}
  };
}

/** Host closures own context and approval. Request data cannot grant permissions. */
export function createSpatialDraftRuntime({owner,deviceId,hostSurface,journal,app,context,authorize,now=()=>performance.now()}) {
  fail(typeof owner==='string' && owner.length>0 && owner.length<=160 && uuid(deviceId) && ['browser','node'].includes(hostSurface) && journal.owner===owner && typeof app?.read==='function' && typeof app?.move==='function' && typeof context==='function' && typeof authorize==='function','INVALID_SPATIAL_HOST');
  const prepared=new Map(),active=new Set();let lastSequence=-1,lastInputBinding='';
  function hostContext() {const c=context();fail(c && c.owner===owner && c.deviceId===deviceId && integer(c.placeEpoch) && integer(c.sceneRevision) && typeof c.bootId==='string' && typeof c.calibrationId==='string' && c.tracking && Number.isFinite(c.expiresMonoMs) && now()<c.expiresMonoMs,'HOST_CONTEXT_UNAVAILABLE');return c;}
  const contextBinding = c => ({bootId:c.bootId,calibrationId:c.calibrationId,placeEpoch:c.placeEpoch,sceneRevision:c.sceneRevision,surface:clone(c.surface),domain:clone(c.domain),occluders:clone(c.occluders)});
  const view = record => {fail(record.owner===owner,'OWNER_MISMATCH');return {...clone(record),observedState:record.state==='running'&&!active.has(record.id)?'unknown':record.state};};
  async function prepare(observation) {
    for(const [id,item] of prepared)if(now()>=item.expiresMonoMs)prepared.delete(id);
    fail(prepared.size<64,'PREPARED_QUEUE_FULL');const c=hostContext(),at=now();
    const hit=resolveRay(observation,c,at),inputBinding=canonical([c.bootId,c.placeEpoch,c.calibrationId]);
    if(inputBinding!==lastInputBinding){lastInputBinding=inputBinding;lastSequence=-1;}
    fail(observation.sequence>lastSequence,'REPLAYED_INPUT');lastSequence=observation.sequence;
    const before=await app.read();fail(now()<observation.expiresMonoMs,'INPUT_EXPIRED_DURING_RESOLVE');
    fail(before.appId==='mini-local-draft' && before.objectId==='panel' && integer(before.revision),'UNSUPPORTED_APP');
    fail(canonical(contextBinding(hostContext()))===canonical(contextBinding(c)),'CONTEXT_CHANGED');
    const id=crypto.randomUUID(),jobId=crypto.randomUUID();
    const request={id,jobId,owner,deviceId,scope:'local-draft.move',maximumCloudCostMinor:0,context:contextBinding(c),before,hit,observation:clone(observation),preparedAt:at,expiresMonoMs:at+10000};
    request.digest=await digest(request);prepared.set(id,request);
    return {id,jobId,uv:clone(hit.uv),expiresMonoMs:request.expiresMonoMs,requiresLocalConfirmation:true,inputSource:observation.source,physicalAccepted:false};
  }
  async function read(id) {fail(uuid(id),'INVALID_ACTION_ID');const r=await journal.get(id);return r?view(r):null;}
  async function commit(id) {
    fail(uuid(id),'INVALID_ACTION_ID');const prior=await journal.get(id);if(prior)return view(prior);
    const request=prepared.get(id);fail(request,'ACTION_NOT_PREPARED');
    const c=hostContext();fail(now()<request.expiresMonoMs && canonical(contextBinding(c))===canonical(request.context),'INTENT_EXPIRED_OR_CONTEXT_CHANGED');
    fail(canonical(await app.read())===canonical(request.before),'APP_CHANGED');
    const binding={owner,deviceId,jobId:request.jobId,actionId:id,requestSha256:request.digest,permission:request.scope,maximumCloudCostMinor:0,expiresMonoMs:request.expiresMonoMs};
    fail(canonical(await authorize(clone(binding)))===canonical(binding),'APPROVAL_REQUIRED');
    fail(now()<request.expiresMonoMs && canonical(contextBinding(hostContext()))===canonical(request.context),'APPROVAL_CONTEXT_EXPIRED');
    let record={schema:'rockstaros.spatial-local-execution/1',id,owner,digest:request.digest,revision:0,state:'running',job:createMiniSpatialPreviewJob(request.jobId),before:request.before,result:null,classification:'local-draft-operation',inputSource:'synthetic-pointer',externalToolSuccess:false,physicalAccepted:false};
    const claim=await journal.claim(record);if(!claim.created)return view(claim.record);
    active.add(id);let dispatched=false;
    try {
      fail(now()<request.expiresMonoMs && canonical(contextBinding(hostContext()))===canonical(request.context),'CONTEXT_CHANGED_BEFORE_DISPATCH');
      dispatched=true;const response=await app.move(request.before.revision,request.hit.uv),after=await app.read();
      fail(response.revision===request.before.revision+1 && canonical(response)===canonical(after) && after.x===request.hit.uv[0] && after.y===request.hit.uv[1] && after.appId===request.before.appId && after.objectId===request.before.objectId,'READBACK_MISMATCH');
      record={...record,revision:1,state:'succeeded',result:after,hostSurface,
        localStages:['ray_resolved','local_draft_changed','readback_matches'],
        workflowTransportRecorded:hostSurface==='browser',
        job:hostSurface==='browser'?recordMiniSpatialPreview(record.job,[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()]):record.job};
    } catch(error) {record={...record,revision:1,state:dispatched?'unknown':'failed',error:String(error?.message??'SPATIAL_OPERATION_FAILED')};}
    try {await journal.replace(id,0,record);return view(record);} finally {active.delete(id);prepared.delete(id);}
  }
  return Object.freeze({prepare,commit,read});
}

export function demoContext(owner,deviceId,at=performance.now()) {
 return {owner,deviceId,bootId:crypto.randomUUID(),calibrationId:crypto.randomUUID(),placeEpoch:0,sceneRevision:0,tracking:true,expiresMonoMs:at+300000,
  domain:{min:[-1.5,-1.5,0],max:[1.5,1.5,2.5]},occluders:[],surface:{id:'local-plane',center:[0,1,1],normal:[0,-1,0],right:[1,0,0],up:[0,0,1],widthM:2,heightM:1.2}};
}
export function demoRay(context,uv,sequence,at=performance.now()) {
 fail(Array.isArray(uv)&&uv.length===2&&uv.every(Number.isFinite),'INVALID_DEMO_POSITION');
 const origin=[0,-1,1],point=add(add(context.surface.center,mul(context.surface.right,(uv[0]-.5)*context.surface.widthM)),mul(context.surface.up,(.5-uv[1])*context.surface.heightM));
 const d=sub(point,origin);
 return {schema:'rockstaros.spatial-ray/1',source:'synthetic-pointer',bootId:context.bootId,sequence,calibrationId:context.calibrationId,placeEpoch:context.placeEpoch,observedMonoMs:at,expiresMonoMs:at+100,origin,direction:mul(d,1/norm(d)),errorBoundM:0.005};
}
