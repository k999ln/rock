import {captureSmisCamera} from '../../../../../lib/smis-camera.ts';

/** Camera observations reuse smis. No inferred depth/hand ray or implicit Tool authority. */
export function createMiniCameraInput({authorize,mediaDevices=globalThis.navigator?.mediaDevices,video,now=()=>Date.now()}) {
 if(typeof authorize!=='function' || !video)throw Error('CAMERA_HOST_REQUIRED');
 let stream=null,starting=false,generation=0;const waiting=new Set();
 function stop(){generation++;for(const cancel of [...waiting])cancel();if(stream)for(const track of stream.getTracks())track.stop();stream=null;video.srcObject=null;}
 async function start(){
  if(starting || stream)throw Error('CAMERA_ALREADY_ACTIVE');
  starting=true;const own=++generation;
  try {
   if(await authorize('camera.local-observation')!==true)throw Error('CAMERA_APPROVAL_REQUIRED');
   if(own!==generation)throw Error('CAMERA_START_CANCELLED');
   if(!mediaDevices?.getUserMedia)throw Error('CAMERA_API_UNAVAILABLE');
   const acquired=await mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480}},audio:false});
   if(own!==generation){for(const t of acquired.getTracks())t.stop();throw Error('CAMERA_START_CANCELLED');}
   stream=acquired;video.srcObject=stream;video.muted=true;video.playsInline=true;
   for(const track of stream.getVideoTracks())track.addEventListener('ended',stop,{once:true});
   await video.play();if(own!==generation)throw Error('CAMERA_START_CANCELLED');
   return {source:'mini-camera',state:'streaming',spatialRayAvailable:false,physicalAccepted:false};
  } catch(error){if(own===generation)stop();throw error;}finally{starting=false;}
 }
 async function observe(){
  if(!stream || !stream.getVideoTracks().some(t=>t.readyState==='live'))throw Error('CAMERA_NOT_ACTIVE');
  if(await authorize('camera.local-observation')!==true){stop();throw Error('CAMERA_APPROVAL_REVOKED');}
  if(!stream)throw Error('CAMERA_NOT_ACTIVE');
  if(typeof video.requestVideoFrameCallback!=='function'||typeof video.cancelVideoFrameCallback!=='function')throw Error('FRESH_CAMERA_FRAME_API_REQUIRED');
  const own=generation;
  return await new Promise((resolve,reject)=>{
   let token=null,timer=null,done=false;
   const finish=(error,value)=>{if(done)return;done=true;if(timer!==null)clearTimeout(timer);if(token!==null)video.cancelVideoFrameCallback(token);waiting.delete(cancel);if(error)reject(error);else resolve(value);};
   const cancel=()=>finish(Error('CAMERA_OBSERVATION_CANCELLED'));
   waiting.add(cancel);timer=setTimeout(()=>finish(Error('FRESH_CAMERA_FRAME_TIMEOUT')),1000);
   token=video.requestVideoFrameCallback(()=>{
    if(own!==generation||!stream){finish(Error('CAMERA_NOT_ACTIVE'));return;}
    try {
     const observation=captureSmisCamera(video);
     if(Math.abs(now()-observation.observedAt)>1000)throw Error('CAMERA_CLOCK_CHANGED');
     finish(null,{...observation,source:'mini-camera'});
    }catch(error){finish(error);}
   });
  });
 }
 return Object.freeze({start,stop,observe});
}
