import {transformPoint} from './runtime.mjs';
const check=(value,code)=>{if(!value)throw Error(code);};
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
/** For a same-Linux-host private child-process stream only, not browser/network input.
 * Retrieval recency is not exposure time. This reader never emits spatial rays/grants.
 */
export function createStereoObservationReader({calibrationId,calibrationSha256,placeEpoch,leftCameraToPlace,nowNs=()=>process.hrtime.bigint()}) {
 check(typeof calibrationId==='string'&&/^[a-f0-9]{64}$/.test(calibrationSha256)&&Number.isSafeInteger(placeEpoch)&&placeEpoch>=0,'STEREO_HOST_BINDING_REQUIRED');
 const transform=structuredClone(leftCameraToPlace);transformPoint(transform,[0,0,0]);
 let boot=null,lastSequence=-1,revoked=false;
 function revoke(){revoked=true;}
 function accept(line){
  check(!revoked&&typeof line==='string'&&line.length<=32768,'STEREO_STREAM_UNAVAILABLE');
  const e=JSON.parse(line);
  check(e?.schema==='rockstaros.stereo-marker-observation/1'&&e.source==='v4l2-stereo-marker'&&e.units==='m'&&e.coordinateFrame==='left_camera_x_right_y_down_z_forward','STEREO_SCHEMA_MISMATCH');
  check(e.calibrationId===calibrationId&&e.calibrationSha256===calibrationSha256&&e.placeEpoch===placeEpoch&&uuid(e.bootId),'STEREO_CALIBRATION_MISMATCH');
  check(Number.isSafeInteger(e.sequence)&&e.sequence>=0&&e.sequence>lastSequence&&(boot===null||e.bootId===boot),'STEREO_REPLAY_OR_REBOOT');
  check(typeof e.receivedMonoNs==='string'&&/^[0-9]{1,20}$/.test(e.receivedMonoNs)&&typeof e.retrievalSpanNs==='string'&&/^[0-9]{1,20}$/.test(e.retrievalSpanNs),'STEREO_CLOCK_INVALID');
  const age=nowNs()-BigInt(e.receivedMonoNs);check(age>=0n&&age<=100000000n,'STEREO_RETRIEVAL_STALE');
  check(e.exposureMonoNs===null&&e.exposureSynchronizationVerified===false&&e.spatialActionEligible===false&&e.physicalAccepted===false,'UNQUALIFIED_SENSOR_AUTHORITY');
  check(Array.isArray(e.points)&&e.points.length<=8,'STEREO_POINT_BOUND');
  const ids=new Set(),points=e.points.map(p=>{
   check(Number.isInteger(p.markerId)&&p.markerId>=0&&p.markerId<50&&!ids.has(p.markerId)&&vec(p.pointLeftCameraM)&&p.pointLeftCameraM.every(v=>Math.abs(v)<=5)&&Number.isFinite(p.maximumReprojectionResidualPx)&&p.maximumReprojectionResidualPx>=0&&p.maximumReprojectionResidualPx<=2&&p.positionErrorBoundM===null,'STEREO_POINT_INVALID');
   ids.add(p.markerId);return {markerId:p.markerId,pointPlaceM:transformPoint(transform,p.pointLeftCameraM),positionErrorBoundM:null};
  });
  boot=e.bootId;lastSequence=e.sequence;
  return {schema:'rockstaros.spatial-geometry-preview/1',source:e.source,bootId:boot,sequence:lastSequence,calibrationId,placeEpoch,points,exposureTimeKnown:false,spatialActionEligible:false,toolExecuted:false,physicalAccepted:false};
 }
 return Object.freeze({accept,revoke});
}
