import {drawMiniSourcePreview} from './source-preview.mjs';
import {createDisplayCoordinator} from './display-coordinator.mjs';
import {createMiniCameraInput} from './sensor-camera.mjs';
import {createLocalDraftApp,createSpatialDraftRuntime,memorySpatialJournal,demoContext,demoRay} from './runtime.mjs';
const $=id=>document.getElementById(id),owner=`browser-preview:${crypto.randomUUID()}`,deviceId=crypto.randomUUID();
let context=demoContext(owner,deviceId),sequence=0,pending=null,approved=false,lastReceipt=null;
const app=createLocalDraftApp(),journal=memorySpatialJournal(owner);
const runtime=createSpatialDraftRuntime({owner,deviceId,hostSurface:'browser',journal,app,context:()=>context,authorize:async binding=>{if(!approved)throw new Error('LOCAL_CONFIRMATION_REQUIRED');return binding;}});
const canvas=$('space'),ctx=canvas.getContext('2d');
function message(s){$('message').textContent=s;}
function draw(state){
 ctx.fillStyle='#18201c';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#344438';ctx.lineWidth=1;
 for(let x=0;x<=canvas.width;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
 for(let y=0;y<=canvas.height;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
 ctx.strokeStyle='#abbca0';ctx.strokeRect(24,24,canvas.width-48,canvas.height-48);
 ctx.fillStyle='#c1ceb2';ctx.fillRect(state.x*canvas.width-60,state.y*canvas.height-32,120,64);
 ctx.fillStyle='#172117';ctx.font='18px system-ui';ctx.textAlign='center';ctx.fillText('Local draft',state.x*canvas.width,state.y*canvas.height+6);
 if(pending){ctx.strokeStyle='#e0c58e';ctx.setLineDash([6,5]);ctx.strokeRect(pending.uv[0]*canvas.width-60,pending.uv[1]*canvas.height-32,120,64);ctx.setLineDash([]);}
 if(context.occluders.length){ctx.fillStyle='#765e4d99';ctx.fillRect(canvas.width*.35,canvas.height*.2,canvas.width*.3,canvas.height*.6);}
 $('revision').textContent=String(state.revision);
 const frame=drawMiniSourcePreview($('source-preview'),state,{sceneRevision:context.sceneRevision});
 $('source-frame').textContent=`source frame ${frame.frameId} ／ 物理光学出力は未接続`;
}
canvas.addEventListener('pointerdown',async event=>{
 if(pending){message('準備済みの操作を確定するか、取り消してください。');return;}
 const r=canvas.getBoundingClientRect(),uv=[(event.clientX-r.left)/r.width,(event.clientY-r.top)/r.height];
 try {pending=await runtime.prepare(demoRay(context,uv,sequence++));$('confirm').disabled=false;$('discard').disabled=false;message('点線が移動先です。10秒以内に確定してください。');draw(await app.read());}
 catch(e){message(e.message);}
});
$('confirm').addEventListener('click',async()=>{
 if(!pending)return;$('confirm').disabled=true;approved=true;
 try {lastReceipt=await runtime.commit(pending.id);$('receipt').textContent=JSON.stringify(lastReceipt,null,2);message(lastReceipt.state==='succeeded'?'ローカル下書きの変更と読戻しを完了。実機操作ではありません。':'結果を確認してください：'+lastReceipt.state);$('export').disabled=false;}
 catch(e){message(e.message);}finally {approved=false;pending=null;$('discard').disabled=true;draw(await app.read());}
});
$('discard').addEventListener('click',async()=>{pending=null;$('confirm').disabled=true;$('discard').disabled=true;message('未実行の候補を取り消しました。');draw(await app.read());});
$('detach').addEventListener('click',async()=>{context={...context,placeEpoch:context.placeEpoch+1,sceneRevision:context.sceneRevision+1};message('場所epochを更新しました。以前の候補は実行できません。');draw(await app.read());});
$('obstacle').addEventListener('click',async()=>{const on=context.occluders.length===0;context={...context,sceneRevision:context.sceneRevision+1,occluders:on?[{min:[-.25,0,.65],max:[.25,.4,1.35]}]:[]};message(on?'合成障害物を追加。rayが遮られる操作は拒否します。':'合成障害物を除きました。');draw(await app.read());});
$('recalibrate').addEventListener('click',async()=>{context={...context,calibrationId:crypto.randomUUID(),sceneRevision:context.sceneRevision+1,expiresMonoMs:performance.now()+300000};message('合成校正を更新しました。実機の校正ではありません。');draw(await app.read());});
$('export').addEventListener('click',()=>{if(!lastReceipt)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastReceipt,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mini-local-spatial-operation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
draw(await app.read());

// Device camera is optional and local-only; spatial pointer remains synthetic.
let cameraAllowed=false;
const camera=createMiniCameraInput({video:$('camera-video'),authorize:async()=>cameraAllowed});
$('camera-start').addEventListener('click',async()=>{cameraAllowed=true;try{await camera.start();$('camera-status').textContent='カメラ入力中。画像はこの端末内だけで処理します。';}catch(e){cameraAllowed=false;$('camera-status').textContent=e.message;}});
$('camera-stop').addEventListener('click',()=>{cameraAllowed=false;camera.stop();$('camera-status').textContent='カメラ停止';});
$('camera-observe').addEventListener('click',async()=>{try{const o=await camera.observe();$('camera-status').textContent=`smis画像観測を生成：${o.observedAt}／手・深度の測定は未対応`;}catch(e){$('camera-status').textContent=e.message;}});
window.addEventListener('pagehide',()=>{cameraAllowed=false;camera.stop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cameraAllowed=false;camera.stop();$('camera-status').textContent='画面を離れたためカメラ停止';}});

const outputs=createDisplayCoordinator({owner,placeEpoch:context.placeEpoch,authorize:async()=>{throw Error('MEASURED_OUTPUT_NOT_PAIRED');}});
$('output-status').textContent=`測定済み表示部：${outputs.state().nodes.length}台。実光学出力は無効です。`;
