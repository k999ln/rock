import {transformPoint} from './runtime.mjs';
/** Host-owned output leases. No network endpoint or new account/price authority. */
const check=(v,c)=>{if(!v)throw Error(c);};
const id=v=>typeof v==='string' && /^[a-zA-Z0-9:._-]{1,120}$/.test(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createDisplayCoordinator({owner,placeEpoch,authorize,now=()=>performance.now()}) {
 check(id(owner)&&Number.isSafeInteger(placeEpoch)&&placeEpoch>=0&&typeof authorize==='function','DISPLAY_HOST_REQUIRED');
 const nodes=new Map();let focus=null,epoch=placeEpoch,session=crypto.randomUUID();
 function revoke(node){node.generation++;node.valid=false;try{node.adapter.blackout();}catch{/* failed stop remains unknown */}node.lastFrame=null;}
 function eligible(node){const t=now(),p=node.profile;return node.valid&&p.placeEpoch===epoch&&t<p.calibrationExpiresMonoMs&&t<node.healthExpires&&node.health.stopOk===true&&node.health.temperatureOk===true&&node.health.outputMeasured===true;}
 function register(profile,adapter){
  profile=structuredClone(profile);
  check(profile&&id(profile.nodeId)&&profile.owner===owner&&profile.placeEpoch===epoch&&!nodes.has(profile.nodeId)&&nodes.size<128,'NODE_BINDING_INVALID');
  check(id(profile.calibrationId)&&finite(profile.calibrationExpiresMonoMs)&&profile.calibrationExpiresMonoMs>now(),'NODE_CALIBRATION_INVALID');
  check(['monitor-bench','optical-bench'].includes(profile.kind)&&finite(profile.measuredPeakCdM2)&&profile.measuredPeakCdM2>0&&finite(profile.ownerComfortCapCdM2)&&profile.ownerComfortCapCdM2>0&&profile.measuredPeakCdM2<=profile.ownerComfortCapCdM2,'MEASURED_COMFORT_LIMIT_REQUIRED');
  check(profile.measurement&&id(profile.measurement.id)&&profile.measurement.sameHardwareAndMode===true&&profile.measurement.glareReviewAccepted===true,'OPTICAL_MEASUREMENT_REQUIRED');
  transformPoint(profile.transform,[0,0,0]);
  check(id(profile.surfaceId)&&Array.isArray(profile.uvRegion)&&profile.uvRegion.length===4&&profile.uvRegion.every(v=>finite(v)&&v>=0&&v<=1)&&profile.uvRegion[0]<profile.uvRegion[2]&&profile.uvRegion[1]<profile.uvRegion[3],'OUTPUT_REGION_REQUIRED');
  check(typeof adapter?.present==='function'&&typeof adapter?.blackout==='function','OUTPUT_ADAPTER_REQUIRED');
  // Transport authentication/pairing belongs to the host; message payloads cannot self-register.
  nodes.set(profile.nodeId,{profile:structuredClone(profile),adapter,health:{},healthExpires:-1,healthSequence:-1,valid:true,generation:0,lastFrame:null});
 }
 function heartbeat(nodeId,status){const n=nodes.get(nodeId);check(n&&status&&Number.isSafeInteger(status.sequence)&&status.sequence>n.healthSequence&&status.placeEpoch===epoch,'STALE_NODE_STATUS');n.healthSequence=status.sequence;n.health=structuredClone(status);n.healthExpires=now()+200;if(!eligible(n))revoke(n);}
 const inflight=new Set();
 async function present(nodeId,frame){
  check(inflight.size===0,'OUTPUT_IN_FLIGHT');inflight.add(nodeId);
  try{return await presentInternal(nodeId,frame);}finally{inflight.delete(nodeId);}
 }
 async function presentInternal(nodeId,frame){
  frame=structuredClone(frame);
  const n=nodes.get(nodeId);check(n&&eligible(n),'DISPLAY_UNAVAILABLE');
  check(frame&&frame.surfaceId===n.profile.surfaceId&&typeof frame.content==='string'&&frame.content.length<=4096&&id(frame.frameId)&&id(frame.actionId)&&Number.isSafeInteger(frame.sceneRevision)&&frame.sceneRevision>=0&&frame.placeEpoch===epoch&&finite(frame.expiresMonoMs)&&now()<frame.expiresMonoMs&&frame.expiresMonoMs-now()<=200,'FRAME_INVALID');
  check(Array.isArray(frame.uvBounds)&&frame.uvBounds.length===4&&frame.uvBounds.every(finite)&&frame.uvBounds[0]>=n.profile.uvRegion[0]&&frame.uvBounds[1]>=n.profile.uvRegion[1]&&frame.uvBounds[2]<=n.profile.uvRegion[2]&&frame.uvBounds[3]<=n.profile.uvRegion[3]&&frame.uvBounds[0]<frame.uvBounds[2]&&frame.uvBounds[1]<frame.uvBounds[3],'FRAME_OUTSIDE_CALIBRATED_REGION');
  check(finite(frame.requestedPeakCdM2)&&frame.requestedPeakCdM2>=0&&frame.requestedPeakCdM2<=n.profile.ownerComfortCapCdM2&&frame.requestedPeakCdM2<=n.profile.measuredPeakCdM2,'LUMINANCE_LIMIT_EXCEEDED');
  const generation=n.generation,leaseSession=session;
  const payloadSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(frame))))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const binding={owner,nodeId,session,placeEpoch:epoch,frameId:frame.frameId,actionId:frame.actionId,payloadSha256,scope:'spatial.output.local',maximumCloudCostMinor:0};
  check(same(await authorize(structuredClone(binding)),binding),'OUTPUT_APPROVAL_REQUIRED');
  check(n.generation===generation&&session===leaseSession&&eligible(n)&&now()<frame.expiresMonoMs,'OUTPUT_LEASE_EXPIRED');
  let receipt;
  try {receipt=await n.adapter.present(structuredClone(frame));}catch(error){revoke(n);throw error;}
  if(n.generation!==generation||session!==leaseSession||!eligible(n)||now()>=frame.expiresMonoMs){revoke(n);throw Error('FRAME_RESULT_UNKNOWN');}
  if(receipt?.frameId!==frame.frameId||receipt?.placeEpoch!==epoch||receipt?.stage!=='software-presented'){revoke(n);throw Error('FRAME_RECEIPT_MISMATCH');}
  n.lastFrame=frame.frameId;focus={nodeId,actionId:frame.actionId};
  return {...binding,stage:'software-presented',physicalVisible:false,toolExecuted:false};
 }
 function tick(){for(const n of nodes.values())if(n.valid&&!eligible(n))revoke(n);}
 function changePlace(next){check(Number.isSafeInteger(next)&&next>epoch,'PLACE_EPOCH_REQUIRED');epoch=next;session=crypto.randomUUID();for(const n of nodes.values())revoke(n);focus=null;}
 function remove(nodeId){const n=nodes.get(nodeId);if(n)revoke(n);nodes.delete(nodeId);if(focus?.nodeId===nodeId)focus=null;}
 function state(){tick();return {owner,placeEpoch:epoch,session,focus:structuredClone(focus),nodes:[...nodes.values()].map(n=>({nodeId:n.profile.nodeId,available:eligible(n),lastFrame:n.lastFrame})),physicalAccepted:false};}
 return Object.freeze({register,heartbeat,present,tick,changePlace,remove,state});
}
