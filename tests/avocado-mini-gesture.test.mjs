import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GestureEngine} from '../systems/rock-star-os/targets/avocado-mini/gesture/engine.mjs';
import {CameraSession} from '../systems/rock-star-os/targets/avocado-mini/gesture/camera-session.mjs';
import {hand} from '../systems/rock-star-os/targets/avocado-mini/gesture/fixture.mjs';
const engine=()=>new GestureEngine({sessionId:'fixture',sceneRevision:3});
function feed(e,t,h=hand()){return e.frame({timestampMs:t,hands:[h]});}
function arm(e){feed(e,0);feed(e,70);return feed(e,140);}
void test('stable pinch begins once; move/rotation are view-only and release never commits a Core action',()=>{
  const e=engine();assert.equal(arm(e)[0].phase,'BEGIN');
  const moved=hand({dx:.05});moved.landmarks[9].x+=.1;
  const event=feed(e,210,moved)[0];assert.equal(event.kind,'transform');assert.ok(event.data.dx>.049);assert.ok(event.data.rotationRadians>.1);
  for(const key of ['physicalExecutionAllowed','approvalGranted','preferenceInferred'])assert.equal(event[key],false);
  assert.equal(event.scope,'VIEW_ONLY');assert.equal(event.calibrated,false);
  feed(e,280,hand({pose:'release'}));feed(e,350,hand({pose:'release'}));assert.equal(feed(e,420,hand({pose:'release'}))[0].phase,'END');
  assert.equal(feed(e,490,hand({pose:'release'})).length,0);
});
void test('brief pinch and threshold jitter do not begin an operation',()=>{
  const e=engine();feed(e,0);feed(e,70,hand({pose:'release'}));feed(e,140);assert.equal(e.active,null);
});
void test('palm stop cancels a pending gesture and does not repeatedly execute',()=>{
  const e=engine();arm(e);const events=[];for(let i=3;i<10;i++)events.push(...feed(e,i*70,hand({pose:'stop'})));
  assert.equal(events.filter(x=>x.kind==='stop').length,1);assert.equal(e.active,null);
});
void test('loss, ambiguity, hand-label switch, tracking jumps and out-of-frame landmarks cancel',()=>{
  for(const type of ['missing','two','left','jump','outside','nan']){
    const e=engine();arm(e);let hands=[hand()];
    if(type==='missing')hands=[];if(type==='two')hands.push(hand());if(type==='left')hands=[hand({handedness:'Left'})];
    if(type==='jump')hands=[hand({dx:.25})];if(type==='outside')hands[0].landmarks[0].x=1.01;if(type==='nan')hands[0].landmarks[0].z=NaN;
    assert.equal(e.frame({timestampMs:210,hands})[0].phase,'CANCEL',type);assert.equal(e.active,null);
  }
});
void test('time reversal, delayed frames and stale scene cannot complete an old operation',()=>{
  for(const t of [140,139,1000]){const e=engine();arm(e);assert.equal(feed(e,t)[0].phase,'CANCEL');}
  const e=engine();arm(e);assert.equal(e.changeScene(4)[0].phase,'CANCEL');assert.equal(e.sceneRevision,4);assert.throws(()=>e.changeScene(4));
});
void test('handedness score is not used as biometric identity or tracking confidence',()=>{
  const e=engine();const h=hand();h.score=1;h.confidence=1;h.ownerId='owner';h.landmarks[1].x=-.2;
  for(let t=0;t<210;t+=70)assert.deepEqual(feed(e,t,h),[]);assert.equal(e.active,null);
});
function fixture(extra={}){
  let now=0,next=null,closed=0,stops=0,terminated=0,requests=0,worker;
  const statuses=[],frames=[],posts=[],constraints=[];const track={onended:null,stop(){stops++;}};
  const stream={getTracks:()=>[track]};const video={srcObject:null,readyState:2,play:async()=>{},pause(){}};
  const options={video,mediaDevices:{getUserMedia:async options=>{constraints.push(options);requests++;return stream;}},
    createWorker:()=>worker={onmessage:null,onerror:null,postMessage(data){posts.push(data);if(data.type==='init')queueMicrotask(()=>worker.onmessage?.({data:{type:'ready'}}));},terminate(){terminated++;}},
    bitmap:async()=>({close(){closed++;}}),schedule:cb=>{next=cb;return 1;},cancelSchedule:()=>{next=null;},clock:()=>now,
    onFrame:f=>frames.push(f),onStatus:s=>statuses.push(s),...extra};
  const session=new CameraSession(options);
  return {session,video,stream,track,posts,statuses,frames,constraints,get worker(){return worker;},get counts(){return {closed,stops,terminated,requests};},
    step:async(t)=>{now=t;const fn=next;next=null;if(fn)await fn();},advance:t=>{now=t;},reply(data){worker.onmessage({data});}};
}
void test('camera is explicit, audio disabled, only one frame in flight, stop closes tracks and worker',async()=>{
  const f=fixture();assert.equal(f.counts.requests,0);await f.session.start();assert.equal(f.counts.requests,1);assert.equal(f.constraints[0].audio,false);assert.equal(f.constraints[0].video.frameRate.max,30);
  await f.step(10);await f.step(90);assert.equal(f.posts.filter(x=>x.type==='frame').length,1);
  f.reply({type:'frame',id:1,timestampMs:10,hands:[]});await f.step(100);assert.equal(f.posts.filter(x=>x.type==='frame').length,2);
  f.session.stop();assert.equal(f.video.srcObject,null);assert.equal(f.counts.stops,1);assert.equal(f.counts.terminated,1);
});
void test('stop while camera permission is pending closes a late stream without attaching it',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r;});const f=fixture({mediaDevices:{getUserMedia:()=>pending}});
  const start=f.session.start();await new Promise(r=>setImmediate(r));f.session.stop();resolve(f.stream);
  await assert.rejects(start);await new Promise(r=>setImmediate(r));assert.equal(f.counts.stops,1);assert.equal(f.video.srcObject,null);
});
void test('stop while bitmap capture is pending closes the late bitmap without posting',async()=>{
  let resolve,closed=0;const pending=new Promise(r=>{resolve=r;});const f=fixture({bitmap:()=>pending});await f.session.start();
  const step=f.step(10);f.session.stop();resolve({close(){closed++;}});await step;assert.equal(closed,1);assert.equal(f.posts.filter(x=>x.type==='frame').length,0);
});
void test('frame deadline and malformed worker response stop capture',async()=>{
  const f=fixture({frameTimeoutMs:100});await f.session.start();await f.step(10);await new Promise(r=>setTimeout(r,130));
  assert.equal(f.session.state,'idle');assert.ok(f.statuses.includes('frame_timeout'));assert.equal(f.counts.stops,1);
  const g=fixture();await g.session.start();await g.step(10);g.reply({type:'frame',id:8,timestampMs:10,hands:[]});assert.equal(g.session.state,'idle');
});
void test('duration/frame limits, ended camera and failed startup release all capture resources',async()=>{
  const f=fixture({maxFrames:1});await f.session.start();await f.step(10);await f.step(90);assert.equal(f.session.state,'idle');
  const g=fixture({maxDurationMs:100});await g.session.start();await g.step(100);assert.equal(g.session.state,'idle');
  const h=fixture();await h.session.start();h.track.onended();assert.equal(h.session.state,'idle');
  const j=fixture({mediaDevices:{getUserMedia:async()=>{throw Error('denied');}}});await assert.rejects(j.session.start());assert.equal(j.session.state,'idle');assert.equal(j.counts.terminated,1);
});

void test('permission resolution racing with stop cannot store or leak a late camera stream',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r;});const f=fixture({mediaDevices:{getUserMedia:()=>pending}});
  const start=f.session.start();await new Promise(r=>setImmediate(r));resolve(f.stream);
  queueMicrotask(()=>queueMicrotask(()=>f.session.stop()));await assert.rejects(start);
  assert.equal(f.counts.stops,1);assert.equal(f.session.stream,null);assert.equal(f.video.srcObject,null);
});
void test('an old worker error cannot stop a restarted camera session',async()=>{
  const f=fixture();await f.session.start();const oldError=f.worker.onerror;f.session.stop();await f.session.start();
  oldError();assert.equal(f.session.state,'running');f.session.stop();
});
void test('response-time duration expiry and invalid clocks cannot deliver tracking results',async()=>{
  for(const now of [100,NaN,0]){
    const f=fixture({maxDurationMs:100});await f.session.start();await f.step(10);f.advance(now);
    f.reply({type:'frame',id:1,timestampMs:10,hands:[]});assert.equal(f.frames.length,0);assert.equal(f.session.state,'idle');assert.equal(f.counts.stops,1);
  }
});
