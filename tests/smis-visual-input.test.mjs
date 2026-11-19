import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observeSmisPixels, parseSmisVisualFingerprint, parseSmisVisualReference, matchSmisVisualObservation, readSmisVisualReferences, saveSmisVisualReference, smisVisualStorageKey } from '../lib/smis-visual-input.ts';
import { createSmisInputSession } from '../lib/smis-input-session.ts';
import { readSmisObjectHandoff, smisObjectHandoffPrompt, SMIS_OBJECT_HANDOFF_KEY } from '../lib/smis-object-handoff.ts';
const now=100_000;
function pixels(kind='red') {
  const rgba=new Uint8ClampedArray(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const mark=kind==='red'?x>12&&x<44&&y>8&&y<50:kind==='blue'?x>24&&x<54&&y>16&&y<54:false;
    rgba.set(mark?(kind==='red'?[220,30,40,255]:[20,40,220,255]):[35,40,35,255],(y*64+x)*4);
  }
  return rgba;
}
const observe=(kind='red',source='browser-camera',at=now)=>observeSmisPixels(pixels(kind),source,at);
function reference(patch={}) {
  return parseSmisVisualReference({schema:'smis.visual-reference/1',owner:'owner-a',agentId:'agent-a',agentRevision:1,objectName:'自分で選んだ対象',samples:Array.from({length:3},()=>observe().fingerprint),background:observe('background').fingerprint,...patch});
}
function storage(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
const agents=[{id:'agent-a',revision:1,enabled:true,attachment:{objectName:'自分で選んだ対象'}}];
void test('Pixel and future Mini adapters share pixels and comparison without implying accepted hardware',()=>{
  const ref=reference(),a=matchSmisVisualObservation(observe(),[ref],'owner-a',now),b=matchSmisVisualObservation(observe('red','mini-camera'),[ref],'owner-a',now);
  assert.deepEqual(a.candidate,b.candidate);assert.equal(a.candidate.agentId,'agent-a');
  for(const result of [a,b]){assert.equal(result.authorizationGranted,false);assert.equal(result.physicalActionAccepted,false);assert.equal(result.semanticImageUnderstanding,false);}
  assert.equal(JSON.stringify(a).includes('pixels'),false);
});
void test('background, a different registered appearance, another owner and ambiguous candidates do not select an agent',()=>{
  const ref=reference();
  for(const observation of [observe('background'),observe('blue')])assert.equal(matchSmisVisualObservation(observation,[ref],'owner-a',now).candidate,null);
  assert.equal(matchSmisVisualObservation(observe(),[ref],'owner-b',now).candidate,null);
  assert.equal(matchSmisVisualObservation(observe(),[ref,reference({agentId:'similar-agent'})],'owner-a',now).candidate,null);
  assert.equal(matchSmisVisualObservation(observe(),[],'owner-a',now).candidate,null);
});
void test('strict observations reject time changes, unknown sources, transparent frames and authority fields',()=>{
  for(const at of [now-10001,now+1,NaN])assert.throws(()=>matchSmisVisualObservation(observe('red','browser-camera',Number.isNaN(at)?now:at),[reference()],'owner-a',Number.isNaN(at)?NaN:now));
  assert.throws(()=>matchSmisVisualObservation({...observe(),grant:true},[reference()],'owner-a',now));
  assert.throws(()=>observeSmisPixels(pixels(),'unknown',now));
  const transparent=pixels();transparent[3]=0;assert.throws(()=>observeSmisPixels(transparent,'browser-camera',now));
  assert.throws(()=>observeSmisPixels(new Uint8ClampedArray(1),'browser-camera',now));
  for(const patch of [{detail:NaN},{layout:Array(192).fill(Infinity)},{edges:[1]},{shell:'anything'}])assert.throws(()=>parseSmisVisualFingerprint({...observe().fingerprint,...patch}));
});
void test('enrollment needs three bounded usable views and a distinguishable background',()=>{
  for(const patch of [{samples:[]},{samples:[observe().fingerprint]},{background:observe().fingerprint},{owner:''},{agentRevision:0},{objectName:'x'.repeat(41)},{approved:true}])assert.throws(()=>reference(patch));
  assert.throws(()=>reference({samples:Array(3).fill(observe('background').fingerprint)}));
});
void test('visual storage is owner-specific, preserves other accounts and rejects changed or disabled roles',()=>{
  const s=storage(),a=reference(),b=reference({owner:'owner-b'});
  saveSmisVisualReference(s,a,agents);saveSmisVisualReference(s,b,agents);
  assert.notEqual(smisVisualStorageKey('owner-a'),smisVisualStorageKey('owner-b'));
  assert.equal(readSmisVisualReferences(s,'owner-a',agents)[0].owner,'owner-a');
  assert.equal(readSmisVisualReferences(s,'owner-b',agents)[0].owner,'owner-b');
  assert.deepEqual(readSmisVisualReferences(s,'owner-a',[{...agents[0],revision:2}]),[]);
  assert.deepEqual(readSmisVisualReferences(s,'owner-a',[{...agents[0],enabled:false}]),[]);
  assert.throws(()=>saveSmisVisualReference(s,a,[{...agents[0],revision:2}]));
  s.setItem(smisVisualStorageKey('owner-a'),'bad json');assert.throws(()=>readSmisVisualReferences(s,'owner-a',agents));
  assert.equal(readSmisVisualReferences(s,'owner-b',agents).length,1);
});
void test('bounded local storage cannot silently drop an account or accept too many references',()=>{
  const s=storage();s.setItem(smisVisualStorageKey('owner-a'),'x'.repeat(150001));assert.throws(()=>readSmisVisualReferences(s,'owner-a',agents));
  s.setItem(smisVisualStorageKey('owner-a'),JSON.stringify(Array(11).fill(reference())));assert.throws(()=>readSmisVisualReferences(s,'owner-a',agents));
});
const handoff=(patch={})=>({schema:'smis.object-handoff/1',owner:'owner-a',agentId:'agent-a',agentRevision:1,objectName:'自分で選んだ対象',observedAt:now,confirmedAt:now+1000,source:'browser-camera',...patch});
const selectedAgent={id:'agent-a',revision:1,enabled:true,attachment:{objectName:'自分で選んだ対象'}};
void test('Eve accepts only a current exact-owner, exact-role, explicitly confirmed observation',()=>{
  const s=storage();s.setItem(SMIS_OBJECT_HANDOFF_KEY,JSON.stringify(handoff()));
  assert.equal(readSmisObjectHandoff(s,'owner-a',selectedAgent,now+2000).agentId,'agent-a');
  assert.equal(readSmisObjectHandoff(s,'owner-b',selectedAgent,now+2000),null);
  for(const patch of [{revision:2},{enabled:false},{attachment:undefined}])assert.equal(readSmisObjectHandoff(s,'owner-a',{...selectedAgent,...patch},now+2000),null);
  for(const patch of [{source:'unknown'},{confirmedAt:now+10001},{observedAt:now+2001},{shell:'go'},{agentId:'other'}]){s.setItem(SMIS_OBJECT_HANDOFF_KEY,JSON.stringify(handoff(patch)));assert.equal(readSmisObjectHandoff(s,'owner-a',selectedAgent,now+2000),null);}
  s.setItem(SMIS_OBJECT_HANDOFF_KEY,JSON.stringify(handoff()));assert.equal(readSmisObjectHandoff(s,'owner-a',selectedAgent,now+121001),null);
  assert.equal(readSmisObjectHandoff(s,'owner-a',selectedAgent,NaN),null);
  assert.match(smisObjectHandoffPrompt(handoff()),/測定した情報は渡していません/);
});
void test('camera page stops tracks and fences late permission and account results; it makes no image upload request',()=>{
  const source=readFileSync(new URL('../components/smis-camera-workspace.tsx',import.meta.url),'utf8');
  for(const token of ['track.stop()','visibilitychange','pagehide','!session.current.current(mine)','readSmisObjectHandoff','await currentAgent','audio: false'])assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/toDataURL|toBlob|FormData|method:\s*['"]POST|method:\s*['"]PUT/);
  assert.doesNotMatch(source,/finally \{ lock.current = false/);
  assert.match(source,/event.preventDefault\(\); stop\(\); location.assign\(anchor.href\)/);
  for (const path of ['sky-attached-object.tsx','sky-object-agent-summary.tsx','eve-sync-workspace.tsx']) {
    const entry=readFileSync(new URL('../components/'+path,import.meta.url),'utf8');
    assert.doesNotMatch(entry,/<Link\s+href=(?:\{`|")\/sky\/objects\/camera/);
    assert.match(entry,/<a\s+href=(?:\{`|")\/sky\/objects\/camera/);
  }
  const adapter=readFileSync(new URL('../lib/smis-camera.ts',import.meta.url),'utf8');assert.doesNotMatch(adapter,/fetch\(|localStorage|sessionStorage/);
});

void test('a late permission result cannot restart a cancelled input or stop a newer one',()=>{
  const lease=createSmisInputSession(),closed=[];
  const first=lease.begin();lease.cancel();const second=lease.begin();
  assert.equal(lease.adopt(second,()=>closed.push('new')),true);
  assert.equal(lease.adopt(first,()=>closed.push('old')),false);
  assert.deepEqual(closed,['old']);assert.equal(lease.current(second),true);
  lease.cancel();lease.cancel();assert.deepEqual(closed,['old','new']);
  assert.equal(lease.current(second),false);
});
void test('new sensor sessions close the old input before replacing its observation',()=>{
  const lease=createSmisInputSession(),closed=[];const first=lease.begin();lease.adopt(first,()=>closed.push('first'));
  const second=lease.begin();assert.deepEqual(closed,['first']);assert.equal(lease.current(first),false);
  lease.adopt(second,()=>closed.push('second'));lease.cancel();assert.deepEqual(closed,['first','second']);
});
