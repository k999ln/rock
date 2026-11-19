import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createExitGeometry} from '../../../systems/rock-star-os/targets/avocado-mini/spatial/optical-exits.mjs';
// Development calculation, not device acceptance or a continuous optical proof.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const bounds={min:[-2,-2,0],max:[2,2,3]},axis={west:0,east:0,south:1,north:1,floor:2,ceiling:2};
const faces=Object.keys(axis),grid=(n,a,b)=>Array.from({length:n},(_,i)=>a+(b-a)*i/(n-1));
const eyes=[],targets=[];
for(const x of grid(9,-1.5,1.5))for(const y of grid(9,-1.5,1.5))for(const z of [1.2,1.6,1.9])eyes.push([x,y,z]);
for(const x of grid(7,-1.5,1.5))for(const y of grid(7,-1.5,1.5))for(const z of [.8,1.4,2.])targets.push([x,y,z]);
function layout(width,faceCount,guard){return faces.slice(0,faceCount).map(face=>{
 const a=[0,1,2].filter(i=>i!==axis[face]),center=a.map(i=>(bounds.min[i]+bounds.max[i])/2);
 const half=a.map(i=>Math.min(width/2,(bounds.max[i]-bounds.min[i])/2));
 return {id:face,face,rect:[center[0]-half[0],center[1]-half[1],center[0]+half[0],center[1]+half[1]],guardM:guard};
});}
const results=[];
for(const c of [{width:.3,count:6,guard:0},{width:1.2,count:6,guard:0},{width:4,count:4,guard:0},{width:4,count:6,guard:0},{width:4,count:6,guard:.01}]){
 const exits=layout(c.width,c.count,c.guard),geometry=createExitGeometry({bounds,exits});let misses=0,first=null,rays=0;const usage={};
 for(const eye of eyes)for(const target of targets){
  const dx=target[0]-eye[0],dy=target[1]-eye[1],length=Math.hypot(dx,dy),right=length>1e-9?[-dy/length,dx/length,0]:[1,0,0];let pass=true;
  for(const side of [-.032,.032])for(const px of [-.002,0,.002])for(const pz of [-.002,0,.002]){
   const pupil=eye.map((v,i)=>v+right[i]*(side+px)+(i===2?pz:0));const r=geometry.ray(pupil,target);rays++;
   if(!r.geometricPathAvailable){pass=false;first??={eyeCenterM:eye,targetM:target,pupilM:pupil,...r};}
   for(const face of r.boundaryFaces)usage[face]=(usage[face]??0)+1;
  }
  if(!pass)misses++;
 }
 const area=exits.reduce((s,e)=>s+(e.rect[2]-e.rect[0])*(e.rect[3]-e.rect[1]),0);
 results.push({exitCount:c.count,sourceCount:'not_assigned_no_accepted_lightfield_engine',maximumExitDimensionM:c.width,guardM:c.guard,exitAreaM2:area,eyeTargetPairs:eyes.length*targets.length,pupilRays:rays,missingPairs:misses,firstMissing:first,boundaryRayCounts:usage,exits,physicalAccepted:false,wholeRangeAccepted:false});
}
const result={schema:'rockstaros.mini.six-exit-study/1',boundsM:bounds,serviceRoomM:[3,3],imageLocationNoPlateOrMembrane:true,assumptions:['empty homogeneous optical path','ideal unlimited angle/focus at every aperture position','no supplied Go/relay/actuator','different pupil rays may use different exits','no occlusion, radiometry or lens acceptance'],conditionalGeometricStatement:'For eye and target strictly inside a convex closed box, the ray extended from eye through target meets its boundary. Covering that entire boundary with ideal emitting apertures supplies a geometric exit for every noncoincident eye-target ray. This does not prove realizable ray generation, brightness, continuity through physical seams or product acceptance.',results};
const out=resolve(root,'work/mini-spatial-engineering');await mkdir(out,{recursive:true});await writeFile(resolve(out,'six-exits-result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({exits:r.exitCount,widthM:r.maximumExitDimensionM,guardM:r.guardM,areaM2:r.exitAreaM2,missing:r.missingPairs,pairs:r.eyeTargetPairs})),null,2));
