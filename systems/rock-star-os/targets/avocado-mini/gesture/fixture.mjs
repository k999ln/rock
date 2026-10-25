/** Synthetic geometry only. It is not a camera accuracy sample. */
export function hand({pose='pinch',dx=0,dy=0,handedness='Right'}={}) {
  const p=Array.from({length:21},()=>({x:.5,y:.65,z:0}));
  p[0]={x:.5,y:.85,z:0};p[5]={x:.4,y:.6,z:0};p[17]={x:.65,y:.6,z:0};p[9]={x:.5,y:.6,z:0};
  p[4]={x:.43,y:.42,z:0};p[8]={x:.45,y:.42,z:0};
  if(pose==='release')p[4]={x:.28,y:.42,z:0};
  if(pose==='stop') {
    p[4]={x:.2,y:.55,z:0};
    for(const [i,x] of [[8,.4],[12,.48],[16,.56],[20,.64]]) {p[i]={x,y:.25,z:0};p[i-2]={x,y:.5,z:0};}
  }
  return {handedness,landmarks:p.map(v=>({...v,x:v.x+dx,y:v.y+dy}))};
}
