const check=(v,c)=>{if(!v)throw Error(c);};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
/** Host-local image gesture preview. No metric pose, workflow/billing writes or actions. */
export function createHandPreview({profileSha256,modelSha256,calibrationId,placeEpoch,nowNs=()=>process.hrtime.bigint()}){
 check(hash(profileSha256)&&hash(modelSha256)&&typeof calibrationId==='string'&&calibrationId.length>0&&Number.isSafeInteger(placeEpoch)&&placeEpoch>=0,'HAND_HOST_BINDING_REQUIRED');
 let boot=null,seq=-1,lastReceived=-1n,expires=-1n,revoked=false,state='idle',openedAt=null,closedAt=null,anchor=null,lastWrist=null;
 const reset=()=>{state='idle';openedAt=null;closedAt=null;anchor=null;lastWrist=null;};
 function status(extra={}){return {schema:'rockstaros.hand-scene-preview/1',placeEpoch,state,expiresMonoNs:expires<0n?null:expires.toString(),...extra,metricPoseAvailable:false,spatialActionEligible:false,workflowExecuted:false,physicalAccepted:false};}
 function accept(line){
  try{
   check(!revoked&&typeof line==='string'&&line.length<=16384,'HAND_PREVIEW_UNAVAILABLE');const e=JSON.parse(line);
   check(e.schema==='rockstaros.hand-image-observation/1'&&e.source==='v4l2-mediapipe-hand'&&uuid(e.bootId)&&(boot===null||boot===e.bootId)&&Number.isSafeInteger(e.sequence)&&e.sequence>seq,'HAND_REPLAY_OR_SOURCE_CHANGED');
   check(e.profileSha256===profileSha256&&e.modelSha256===modelSha256&&e.calibrationId===calibrationId&&e.placeEpoch===placeEpoch&&e.coordinateFrame==='image_normalized_x_right_y_down'&&e.positionErrorBoundM===null&&e.exposureSynchronized===false&&e.spatialActionEligible===false&&e.physicalAccepted===false,'HAND_PROFILE_OR_AUTHORITY_MISMATCH');
   check([e.receivedMonoNs,e.inferenceFinishedMonoNs].every(s=>typeof s==='string'&&/^[0-9]{1,20}$/.test(s)),'HAND_TIME_INVALID');
   const received=BigInt(e.receivedMonoNs),finished=BigInt(e.inferenceFinishedMonoNs),now=nowNs();
   check(received>lastReceived&&finished>=received&&finished<=now&&now-received<=100000000n,'HAND_OBSERVATION_STALE');
   check(Array.isArray(e.landmarks)&&e.landmarks.length<=2&&e.landmarks.every(h=>Array.isArray(h)&&h.length===21&&h.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>finite(v)&&v>=-.5&&v<=1.5))),'HAND_LANDMARK_INVALID');
   if(lastReceived>=0n&&received-lastReceived>100000000n)reset();
   boot=e.bootId;seq=e.sequence;lastReceived=received;expires=received+100000000n;
   if(e.landmarks.length!==1){reset();return status({reason:e.landmarks.length?'ambiguous-hands':'hand-lost'});}
   const h=e.landmarks[0],wrist=h[0],tip=h[8],distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),span=distance(h[5],h[17]);
   if(span<.03||span>.6||tip.some(v=>v<.05||v>.95)||(lastWrist&&distance(lastWrist,wrist)>.2)){reset();return status({reason:'edge-scale-or-track-discontinuity'});}
   lastWrist=[...wrist];const ratio=distance(h[4],tip)/span;
   // These are preview tuning values, not accepted per-user gesture thresholds.
   let proposal=null;
   if(ratio>=.45){
    closedAt=null;
    if(state==='drag-preview'&&anchor)proposal={kind:'local-image-translation',deltaUv:[tip[0]-anchor[0],tip[1]-anchor[1]],requiresExistingBroker:true};
    if(state==='drag-preview')reset();
    openedAt??=received;
    if(received-openedAt>=180000000n)state='armed-preview';
   }else if(ratio<=.25){
    openedAt=null;
    if(state==='armed-preview'){closedAt??=received;if(received-closedAt>=60000000n){state='drag-preview';anchor=[...tip];}}
   }else{closedAt=null;if(state==='idle')openedAt=null;}
   return status({pointerUv:[...tip],pinchRatio:ratio,translationPreviewUv:state==='drag-preview'&&anchor?[tip[0]-anchor[0],tip[1]-anchor[1]]:[0,0],proposal});
  }catch(error){revoked=true;reset();throw error;}
 }
 function tick(){if(expires<0n||nowNs()>=expires){reset();return status({reason:'input-expired'});}return status();}
 return Object.freeze({accept,tick,revoke(){revoked=true;expires=-1n;reset();}});
}
