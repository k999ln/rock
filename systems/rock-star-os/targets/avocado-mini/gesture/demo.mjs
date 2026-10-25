import {GestureEngine} from './engine.mjs';
import {CameraSession} from './camera-session.mjs';
import {hand} from './fixture.mjs';
const $=id=>document.getElementById(id);
let engine,session,fixtureTimer=null,base={x:0,y:0,r:0},preview={...base};
const status={loading:'追跡モデルを準備しています',permission:'カメラの利用許可を待っています',running:'カメラで手を追跡しています',stopped:'カメラは停止しています',session_limit:'利用時間の上限で停止しました',start_failed:'開始できませんでした。利用許可と準備手順を確認してください',frame_timeout:'追跡が遅れたため停止しました',camera_ended:'カメラが停止しました'};
function render(){ $('object').style.transform=`translate(${-preview.x*500}px,${preview.y*350}px) rotate(${-preview.r}rad)`; }
function events(list){for(const e of list){
  if(e.phase==='BEGIN'){base={...preview};$('object').classList.add('selected');$('action').textContent='つかんでいます';}
  else if(e.phase==='UPDATE'){preview={x:base.x+e.data.dx,y:base.y+e.data.dy,r:base.r+e.data.rotationRadians};render();$('action').textContent='移動・回転中';}
  else if(e.phase==='END'){base={...preview};$('object').classList.remove('selected');$('action').textContent='手を離しました';}
  else if(e.phase==='CANCEL'){preview={...base};render();$('object').classList.remove('selected');$('action').textContent='取り消しました';}
}}
function resetEngine(){engine=new GestureEngine({sessionId:crypto.randomUUID(),sceneRevision:0});}
function stopped(reason){events(engine?.cancel(reason)||[]);$('start').disabled=false;$('stop').disabled=true;$('fixture').disabled=false;$('status').textContent=status[reason]||'追跡を停止しました';}
function stop(){if(fixtureTimer){clearInterval(fixtureTimer);fixtureTimer=null;}session?.stop();session=null;stopped('stopped');}
$('start').onclick=async()=>{
  stop();resetEngine();$('start').disabled=true;$('stop').disabled=false;$('fixture').disabled=true;
  let current;
  try{current=new CameraSession({video:$('camera'),mediaDevices:navigator.mediaDevices,
    createWorker:()=>new Worker(new URL('./tracking-worker.js',import.meta.url)),
    bitmap:v=>createImageBitmap(v),schedule:cb=>requestAnimationFrame(cb),cancelSchedule:id=>cancelAnimationFrame(id),
    onFrame:frame=>{if(session===current)events(engine.frame(frame));},onStatus:state=>{
      if(session!==current)return;
      $('status').textContent=status[state]||'追跡を停止しました';
      if(!['loading','permission','running'].includes(state))stopped(state);
    }});
  session=current;
  await current.start();}catch{if(!current || session===current)stopped('start_failed');}
};
$('stop').onclick=stop;
$('fixture').onclick=()=>{
  stop();resetEngine();$('start').disabled=true;$('stop').disabled=false;$('fixture').disabled=true;
  $('status').textContent='合成動作のデモです。カメラは使っていません';let i=0;
  fixtureTimer=setInterval(()=>{
    const pose=i<15?'pinch':i<20?'release':'stop';
    const dx=i<5?0:Math.min(.1,(i-5)*.01);
    events(engine.frame({timestampMs:i*70,hands:[hand({pose,dx})]}));i++;
    if(i===24){clearInterval(fixtureTimer);fixtureTimer=null;$('start').disabled=false;$('stop').disabled=true;$('fixture').disabled=false;$('status').textContent='合成動作のデモが完了しました。カメラは停止しています';}
  },70);
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
addEventListener('pagehide',stop);
