// One calibrated planar display. Metres: wall centre (0,0,0), +y up, +z toward viewer.
// Ray/plane intersection is the off-axis pinhole mapping in design/05 §2.
export function project(point, eye, width, height) {
  if (![...point, ...eye, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || eye[2] <= .1 || point[2] >= eye[2]-.01) return null;
  const t = eye[2]/(eye[2]-point[2]);
  return [(eye[0]+t*(point[0]-eye[0]))/width+.5, .5-(eye[1]+t*(point[1]-eye[1]))/height];
}
export function modelPoint(p, yaw=0) {
  const [x,y,z] = p.map(v => (v-.5)*.75), a = (25+yaw)*Math.PI/180, b=-18*Math.PI/180;
  const xx=x*Math.cos(a)+z*Math.sin(a), zz=-x*Math.sin(a)+z*Math.cos(a);
  return [xx, y*Math.cos(b)-zz*Math.sin(b), y*Math.sin(b)+zz*Math.cos(b)-.8];
}
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>a.map(v=>v/Math.hypot(...a));
export function planeCorners(n,d) {
  const c=n.map(v=>.5+v*(d-dot(n,[.5,.5,.5]))/dot(n,n)), u=unit(cross(n,Math.abs(n[0]) < .9*Math.hypot(...n)?[1,0,0]:[0,1,0])), v=unit(cross(n,u));
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>c.map((x,i)=>x+a*u[i]+b*v[i]));
}
export function poseUsable(sample, elapsedSinceReceiveMs, limitMs=100) {
  return Boolean(sample?.pose && Number.isFinite(sample.age_ms) && sample.age_ms>=0 &&
    elapsedSinceReceiveMs>=0 && sample.age_ms+elapsedSinceReceiveMs<=limitMs);
}
