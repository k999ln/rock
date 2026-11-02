import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMiiPoint,miiFingerPoint,miiReplacement} from '../lib/mii-spatial-input.ts';
import {createMiiLocalSpeech} from '../lib/mii-local-speech.ts';
const surface={id:'objective',left:.1,top:.1,right:.9,bottom:.9,editable:true};
void test('point selection rejects ambiguity, stale/future/invalid positions and empty space',()=>{
 const p={x:.5,y:.5,at:1000,source:'camera'};
 assert.equal(resolveMiiPoint(p,[surface],1500),'objective');
 for(const [point,surfaces,now] of [[p,[surface],1501],[p,[surface],999],[p,[surface,surface],1000],[{...p,x:NaN},[surface],1000],[{...p,x:2},[surface],1000],[{...p,x:0},[surface],1000]])assert.equal(resolveMiiPoint(point,surfaces,now),null);
});
void test('camera fingertip needs exactly one valid hand and mirrors x without authenticating a person',()=>{
 const hand={landmarks:Array.from({length:21},()=>({x:.2,y:.4,z:0}))};
 assert.deepEqual(miiFingerPoint([hand],100),{x:.8,y:.4,at:100,source:'camera'});
 for(const hands of [[],[hand,hand],[{landmarks:[]}],[{landmarks:[...hand.landmarks.slice(1),{x:Infinity,y:0,z:0}]}]])assert.equal(miiFingerPoint(hands,100),null);
});
void test('replacement grammar preserves literal text and requires a bounded nonempty value',()=>{
 assert.equal(miiReplacement('これを「庭のある家」に変更して'),'庭のある家');
 assert.equal(miiReplacement('make a garden website'),'make a garden website');
 for(const value of [' ','a'.repeat(1001)])assert.throws(()=>miiReplacement(value));
});
function speechFixture(){let recognition,starts=0,aborts=0,availability='available',waiting=null;const accepted=[],states=[];
 class Recognition {processLocally=false; static async available(options){assert.deepEqual(options,{langs:['ja-JP'],processLocally:true});return waiting?await waiting:availability;} constructor(){recognition=this;}start(){starts++;assert.equal(this.processLocally,true);}abort(){aborts++;}}
 const api=createMiiLocalSpeech(Recognition,text=>accepted.push(text),state=>states.push(state));
 return {api,accepted,states,get r(){return recognition;},get starts(){return starts;},get aborts(){return aborts;},unavailable(){availability='downloadable';},wait(p){waiting=p;}};
}
void test('speech accepts one final transcript once; duplicates and late results after stop cannot change text',async()=>{
 const h=speechFixture();await h.api.start();const receive=h.r.onresult;receive({results:[{isFinal:true,length:1,0:{transcript:'庭のある家'}}]});receive({results:[{isFinal:true,length:1,0:{transcript:'late'}}]});
 assert.deepEqual(h.accepted,['庭のある家']);assert.equal(h.aborts,1);
 await h.api.start();const old=h.r.onresult;h.api.stop();old({results:[{isFinal:true,length:1,0:{transcript:'stopped'}}]});assert.equal(h.accepted.length,1);
});
void test('no local pack means no microphone start or cloud fallback; cancellation fences delayed availability',async()=>{
 const h=speechFixture();h.unavailable();await h.api.start();assert.equal(h.starts,0);
 let resolve;h.wait(new Promise(r=>resolve=r));const pending=h.api.start();h.api.stop();resolve('available');await pending;assert.equal(h.starts,0);
});
void test('multiple or interim speech hypotheses are not converted to a final edit',async()=>{
 const h=speechFixture();await h.api.start();h.r.onresult({results:[{isFinal:false,length:1,0:{transcript:'partial'}}]});assert.deepEqual(h.accepted,[]);assert.equal(h.aborts,1);
});
