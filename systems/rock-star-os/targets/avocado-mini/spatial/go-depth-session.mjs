import {createD405ObservationReader} from './depth-observation.mjs';
const check=(v,e)=>{if(!v)throw Error(e);};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
// Same-host observation pairing, not pixel output, gesture inference or authority.
export function createGoDepthSession({goProfileSha256,goSerialSha256,calibrationId,placeEpoch,depthConfig,nowNs=()=>process.hrtime.bigint()}){
 check(hash(goProfileSha256)&&hash(goSerialSha256)&&depthConfig?.calibrationId===calibrationId&&depthConfig?.placeEpoch===placeEpoch,'GO_DEPTH_BINDING_REQUIRED');
 const reader=createD405ObservationReader({...depthConfig,nowNs});
 let revoked=false,boot=null,seq=-1,subset=null,goReceived=-1n;
 function acceptGo(line){
  try{
   check(!revoked&&typeof line==='string'&&line.length<=16384,'GO_STREAM_UNAVAILABLE');const e=JSON.parse(line);
   check(e.schema==='rockstaros.go-bridge-observation/1'&&uuid(e.bootId)&&(boot===null||boot===e.bootId)&&Number.isSafeInteger(e.sequence)&&e.sequence>seq,'GO_SCHEMA_OR_REPLAY');
   check(e.profileSha256===goProfileSha256&&e.serialSha256===goSerialSha256&&e.calibrationId===calibrationId&&e.placeEpoch===placeEpoch,'GO_IDENTITY_MISMATCH');
   check(e.calibrationComplete===false&&e.pixelsSubmitted===false&&e.physicalAccepted===false&&JSON.stringify(e.dimensions)==='[1440,2560]'&&hash(e.scalarCalibrationSha256)&&(subset===null||subset===e.scalarCalibrationSha256),'GO_OBSERVATION_MODE_CHANGED');
   check(typeof e.receivedMonoNs==='string'&&/^[0-9]{1,20}$/.test(e.receivedMonoNs),'GO_TIMESTAMP_INVALID');const stamp=BigInt(e.receivedMonoNs),age=nowNs()-stamp;
   check(stamp>goReceived&&age>=0n&&age<=500000000n,'GO_STATUS_STALE');
   boot=e.bootId;seq=e.sequence;subset=e.scalarCalibrationSha256;goReceived=stamp;
   return {stage:'go-enumerated-scalar-observed',placeEpoch,pixelsSubmitted:false,physicalAccepted:false};
  }catch(error){revoke();throw error;}
 }
 function acceptDepth(line){
  try{
   check(!revoked,'SESSION_REVOKED');const age=nowNs()-goReceived;
   check(goReceived>=0n&&age>=0n&&age<=500000000n,'GO_STATUS_REQUIRED');const observed=reader.accept(line);
   return {...observed,schema:'rockstaros.go-depth-preview/1',goScalarCalibrationSha256:subset,goEnumerationAgeNs:age.toString(),displayStage:'not-submitted',sensorExposureSynchronized:false,spatialActionEligible:false,toolExecuted:false,physicalAccepted:false};
  }catch(error){revoke();throw error;}
 }
 function revoke(){revoked=true;reader.revoke();goReceived=-1n;}
 return Object.freeze({acceptGo,acceptDepth,revoke});
}
