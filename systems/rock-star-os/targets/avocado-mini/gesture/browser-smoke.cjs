// Test-only synthetic camera. Never opens physical capture devices.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
const browser=await chromium.launch({headless:true,channel:"chrome"});const page=await browser.newPage({viewport:{width:1000,height:850}});
const errors=[],requests=[],pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.context().on('request',r=>requests.push({url:r.url(),method:r.method()}));
await page.addInitScript(()=>{
  window.fixtureCameraCalls=0;window.fixtureStreams=[];window.fixtureInferenceFrames=0;
  const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data?.type==='frame')window.fixtureInferenceFrames++;});}};
  navigator.mediaDevices.getUserMedia=async()=>{
    window.fixtureCameraCalls++;const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
    const c=canvas.getContext('2d');c.fillStyle='#444';c.fillRect(0,0,640,480);
    const stream=canvas.captureStream(15);window.fixtureStreams.push(stream);return stream;
  };
});
await page.goto('http://127.0.0.1:8768/demo.html');await page.getByRole('button',{name:'合成動作を試す'}).click();
await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('デモが完了'),{timeout:5000});
const synthetic=await page.evaluate(()=>({cameraCalls:window.fixtureCameraCalls,transform:document.querySelector('#object').style.transform,status:document.querySelector('#status').textContent}));
if(process.env.MINI_GESTURE_SCREENSHOT)await page.screenshot({path:process.env.MINI_GESTURE_SCREENSHOT});
await page.getByRole('button',{name:'カメラを開始',exact:true}).click();
await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('追跡しています')||document.querySelector('#status').textContent.includes('開始できません'),{timeout:20000});
const running=await page.locator('#status').textContent();await page.waitForFunction(()=>window.fixtureInferenceFrames>=2,{timeout:10000});await page.getByRole('button',{name:'停止',exact:true}).click({timeout:2000}).catch(()=>{});
const stopped=await page.evaluate(()=>({cameraCalls:window.fixtureCameraCalls,inferenceFrames:window.fixtureInferenceFrames,tracks:window.fixtureStreams.flatMap(s=>s.getTracks().map(t=>t.readyState)),srcNull:document.querySelector('video').srcObject===null,status:document.querySelector('#status').textContent}));
const externalRequests=requests.filter(r=>!r.url.startsWith('http://127.0.0.1:8768/'));
assert.equal(synthetic.cameraCalls,0);assert.equal(stopped.cameraCalls,1);assert.ok(stopped.inferenceFrames>=2);assert.ok(stopped.tracks.length>0);assert.ok(stopped.tracks.every(s=>s==='ended'));assert.equal(stopped.srcNull,true);assert.equal(externalRequests.length,0);assert.deepEqual(pageErrors,[]);assert.deepEqual(errors.filter(e=>!e.startsWith('INFO: Created TensorFlow Lite XNNPACK')),[]);
console.log(JSON.stringify({synthetic,running,stopped,pageErrors,consoleDiagnostics:errors,externalRequests},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
