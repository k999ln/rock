import {project,modelPoint,planeCorners,poseUsable} from './geometry.js';
const $=id=>document.getElementById(id), ctx=$('scene').getContext('2d');
const data=await (await fetch('/materials.json',{cache:'no-store'})).json();
let yaw=0,sample=null,received=0,frameCount=0,lastFps=performance.now(),fps=0;
$('notice').textContent=data.mode==='fixture'?'匿名fixture専用 — 実測・実参加者・光学合格ではありません。':'未測定の欄は空欄。Gen1は校正・実測と実頭位置入力がそろうまで停止します。';
$('fixture').hidden=data.mode!=='fixture';
for(const [id,y] of [['left',-30],['centre',0],['right',30]]) $(id).onclick=()=>{yaw=y;};
function focusView(on){$('stage').classList.toggle('focused',on);document.body.classList.toggle('studyfocus',on);$('exit').hidden=!on;}
$('fullscreen').onclick=()=>focusView(true);$('exit').onclick=()=>focusView(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')focusView(false);});
for (const id of ['condition','form','phase','item']) $(id).onchange=()=>{yaw=0;$('head').value='0';};
async function poll(){
  const start=performance.now();
  try{
    const r=await fetch('/pose',{cache:'no-store'}); sample=await r.json();
    // Add full transport duration conservatively; do not call this motion-to-photon latency.
    sample.age_ms=sample.age_ms===null?null:sample.age_ms+(performance.now()-start);received=performance.now();
  }catch{sample=null;}
  setTimeout(poll,16);
}
poll();
function frame(now){
  requestAnimationFrame(frame);
  frameCount++;
  if(now-lastFps>1000){fps=frameCount*1000/(now-lastFps);frameCount=0;lastFps=now;}
  const canvas=$('scene'),w=canvas.width,h=Math.round(w*data.display.height_m/data.display.width_m);
  if(canvas.height!==h)canvas.height=h;
  canvas.style.maxWidth=$('stage').classList.contains('focused')?Math.max(100,Math.min(innerWidth-32,(innerHeight-150)*w/h))+'px':'';
  ctx.fillStyle='#102630';ctx.fillRect(0,0,w,h);
  const condition=$('condition').value;
  let eye=[0,0,data.display.eye_distance_m],source='固定視点';
  if(condition==='gen1'){
    if(data.mode==='fixture'){eye[0]=Number($('head').value);source='FIXTURE / 模擬頭位置';}
    else if(data.readiness_errors.length || !poseUsable(sample,now-received)){
      ctx.fillStyle='#ffe3ab';ctx.font='30px sans-serif';ctx.fillText('頭部追従停止 — 校正・実頭位置を確認',40,h/2);
      $('status').textContent='未準備: '+(data.readiness_errors.join(', ')||'頭位置なし／100ms超の古い入力');return;
    }else{eye=[sample.pose.x,sample.pose.y,sample.pose.z];source='実入力（校正・計測は別票）';}
  }
  const practice=$('phase').value==='practice',id=`${$('form').value}-immediate-${$('item').value}`;
  const item=practice?{normal:[0,1,0],offset:.5}:data.materials[id];
  const mapped=p=>{const q=project(modelPoint(p,yaw),eye,data.display.width_m,data.display.height_m);return q?[q[0]*w,q[1]*h]:null;};
  function path(points,fill,stroke){
    const ps=points.map(mapped);if(ps.some(p=>!p))return;
    ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.stroke();}
  }
  path(planeCorners(item.normal,item.offset),'#77b2c640','#91c4d8');
  for(const edge of data.edges){const a=mapped(data.vertices[edge[0]]),b=mapped(data.vertices[edge[1]]);if(!a||!b)continue;
    ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle='#e8f4ef';ctx.lineWidth=3;ctx.stroke();}
  if(practice) path([[0,.5,0],[1,.5,0],[1,.5,1],[0,.5,1]],'#ffd18d55','#ffd18d');
  ctx.fillStyle='#ffffff';ctx.font='bold 25px sans-serif';
  for(const [label,p] of Object.entries(data.vertices)){const q=mapped(p);if(q)ctx.fillText(label,q[0]+7,q[1]-7);}
  ctx.font='20px sans-serif';ctx.fillStyle='#c3d5dc';ctx.fillText(`${practice?'共通練習':id} | ${source}`,24,32);
  if(data.mode==='fixture'){ctx.fillStyle='#ffc987';ctx.fillText('模擬入力・実機合格なし',24,h-22);}
  $('practiceText').textContent=practice?'共通練習：高さの中央で切ると四角形。切る辺は DA・BC・FG・HE、巡回順は DA → BC → FG → HE。練習は90秒。全方式で同じ説明にします。':'';
  $('status').textContent=`描画 ${fps.toFixed(1)} fps / ${source}${condition==='gen1'&&data.mode==='field'?` / 入力の古さ 約${Math.round(sample.age_ms+now-received)}ms`:''}。これは実際に光るまでの遅延測定ではありません。`;
}
requestAnimationFrame(frame);
