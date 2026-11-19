import {transformPoint} from './runtime.mjs';
const check=(v,e)=>{if(!v)throw Error(e);};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
/** Host-bound child stream; retrieval age is not exposure age or precision acceptance. */
export function createD405ObservationReader({profileSha256,deviceSerialSha256,calibrationId,placeEpoch,cameraToPlace,nowNs=()=>process.hrtime.bigint()}){
 check(hash(profileSha256)&&hash(deviceSerialSha256)&&typeof calibrationId==='string'&&calibrationId.length>0&&Number.isSafeInteger(placeEpoch)&&placeEpoch>=0,'D405_HOST_BINDING_REQUIRED');
 const transform=structuredClone(cameraToPlace);transformPoint(transform,[0,0,0]);let boot=null,last=-1,lastDeviceFrame=-1n,intrinsicHash=null,revoked=false;
 function accept(line){
  check(!revoked&&typeof line==='string'&&line.length<=32768,'D405_STREAM_UNAVAILABLE');const e=JSON.parse(line);
  check(e?.schema==='rockstaros.depth-observation/1'&&e.source==='realsense-d405'&&e.units==='m'&&e.coordinateFrame==='camera_x_right_y_down_z_forward','D405_SCHEMA_MISMATCH');
  check(e.profileSha256===profileSha256&&e.deviceSerialSha256===deviceSerialSha256&&e.calibrationId===calibrationId&&e.placeEpoch===placeEpoch&&id(e.bootId),'D405_IDENTITY_MISMATCH');
  check((boot===null||e.bootId===boot)&&Number.isSafeInteger(e.sequence)&&e.sequence>last&&typeof e.deviceFrameNumber==='string'&&/^[0-9]{1,20}$/.test(e.deviceFrameNumber)&&BigInt(e.deviceFrameNumber)>lastDeviceFrame,'D405_REPLAY_OR_REBOOT');
  check(hash(e.intrinsicsSha256)&&(intrinsicHash===null||intrinsicHash===e.intrinsicsSha256),'D405_INTRINSICS_CHANGED');
  check(typeof e.receivedMonoNs==='string'&&/^[0-9]{1,20}$/.test(e.receivedMonoNs)&&Number.isFinite(e.sdkFrameTimestampMs)&&e.sdkFrameTimestampMs>=0&&typeof e.sdkTimestampDomain==='string','D405_TIMESTAMP_INVALID');
  const age=nowNs()-BigInt(e.receivedMonoNs);check(age>=0n&&age<=100000000n,'D405_RETRIEVAL_STALE');
  check(e.spatialActionEligible===false&&e.physicalAccepted===false&&Array.isArray(e.points)&&e.points.length<=16,'D405_UNQUALIFIED_AUTHORITY');
  const seen=new Set(),points=e.points.map(p=>{
   check(Array.isArray(p.pixel)&&p.pixel.length===2&&p.pixel.every(Number.isSafeInteger)&&p.pixel[0]>=0&&p.pixel[0]<1280&&p.pixel[1]>=0&&p.pixel[1]<720&&!seen.has(p.pixel.join(','))&&Array.isArray(p.pointCameraM)&&p.pointCameraM.length===3&&p.pointCameraM.every(v=>Number.isFinite(v)&&Math.abs(v)<=1)&&p.pointCameraM[2]>=.07&&p.pointCameraM[2]<=.5&&p.positionErrorBoundM===null,'D405_POINT_INVALID');
   seen.add(p.pixel.join(','));return {pixel:p.pixel,pointPlaceM:transformPoint(transform,p.pointCameraM),positionErrorBoundM:null};
  });
  boot=e.bootId;last=e.sequence;lastDeviceFrame=BigInt(e.deviceFrameNumber);intrinsicHash=e.intrinsicsSha256;
  return {schema:'rockstaros.spatial-geometry-preview/1',source:e.source,calibrationId,placeEpoch,points,deviceTimestampMappedToHost:false,spatialActionEligible:false,toolExecuted:false,physicalAccepted:false};
 }
 return Object.freeze({accept,revoke(){revoked=true;}});
}
