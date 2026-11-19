const check=(v,c)=>{if(!v)throw Error(c);};
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const spec={west:[0,0],east:[0,1],south:[1,0],north:[1,1],floor:[2,0],ceiling:[2,1]};
const tangents=axis=>[0,1,2].filter(x=>x!==axis);
/** Ideal homogeneous free-space ray geometry. No light-field/driver authority. */
export function createExitGeometry({bounds,exits}){
 check(bounds&&vec(bounds.min)&&vec(bounds.max)&&bounds.min.every((v,i)=>v<bounds.max[i]),'ENCLOSURE_BOUNDS_REQUIRED');
 check(Array.isArray(exits)&&exits.length>0&&exits.length<=128,'BOUNDED_OPTICAL_EXITS_REQUIRED');
 bounds=structuredClone(bounds);exits=structuredClone(exits);const ids=new Set();
 for(const e of exits){
  check(e&&typeof e.id==='string'&&e.id.length>0&&e.id.length<=120&&!ids.has(e.id)&&Object.hasOwn(spec,e.face),'EXIT_ID_OR_FACE_INVALID');ids.add(e.id);
  check(Array.isArray(e.rect)&&e.rect.length===4&&e.rect.every(Number.isFinite)&&e.rect[0]<e.rect[2]&&e.rect[1]<e.rect[3]&&Number.isFinite(e.guardM)&&e.guardM>=0,'EXIT_RECT_REQUIRED');
  const t=tangents(spec[e.face][0]);check(e.rect[0]>=bounds.min[t[0]]&&e.rect[2]<=bounds.max[t[0]]&&e.rect[1]>=bounds.min[t[1]]&&e.rect[3]<=bounds.max[t[1]]&&2*e.guardM<Math.min(e.rect[2]-e.rect[0],e.rect[3]-e.rect[1]),'EXIT_OUTSIDE_ENCLOSURE');
 }
 const inside=p=>p.every((v,i)=>v>bounds.min[i]&&v<bounds.max[i]);
 function ray(eye,target){
  check(vec(eye)&&vec(target)&&inside(eye)&&inside(target),'RAY_ENDPOINTS_MUST_BE_INSIDE');
  const direction=target.map((v,i)=>v-eye[i]);check(Math.hypot(...direction)>1e-9,'COINCIDENT_EYE_TARGET');
  const candidates=[];
  for(const [face,[axis,side]] of Object.entries(spec)){
   if(Math.abs(direction[axis])<1e-12)continue;
   const s=((side?bounds.max:bounds.min)[axis]-target[axis])/direction[axis];
   if(s>0)candidates.push({face,s});
  }
  const nearest=Math.min(...candidates.map(x=>x.s));
  const point=target.map((v,i)=>v+nearest*direction[i]);
  const faces=candidates.filter(c=>Math.abs(c.s-nearest)<=1e-9*Math.max(1,Math.abs(nearest))).map(c=>c.face);
  const reachable=exits.filter(e=>{
   if(!faces.includes(e.face))return false;const a=tangents(spec[e.face][0]),g=e.guardM;
   return point[a[0]]>=e.rect[0]+g&&point[a[0]]<=e.rect[2]-g&&point[a[1]]>=e.rect[1]+g&&point[a[1]]<=e.rect[3]-g;
  }).map(e=>e.id);
  return {boundaryPointM:point,boundaryFaces:faces,candidateExitIds:reachable,geometricPathAvailable:reachable.length>0,physicalVisible:false};
 }
 return Object.freeze({ray,scope:'ideal-empty-enclosure-ray-geometry',physicalAccepted:false});
}
