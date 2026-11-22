import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {screen} from './fixtures/noah/screen.mjs';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as readyView from '../lib/noah-ready-view.ts';

const code=ts.transpileModule(readFileSync(new URL('../lib/noah-connection-sound.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function audio({supported=true,resumes=true}={}){
  const contexts=[],events=new Map(),storage=new Map(),exports={},document={hidden:false};
  class Context {
    constructor(){this.state='suspended';this.currentTime=10;this.destination={};this.starts=[];this.stops=[];this.levels=[];contexts.push(this);}
    resume(){if(resumes)this.state='running';return Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
    createOscillator(){const owner=this;return this.tone={type:'',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(at){owner.starts.push(at);},stop(at){owner.stops.push(at);}};}
    createGain(){return {gain:{setValueAtTime:value=>this.levels.push(value),linearRampToValueAtTime:value=>this.levels.push(value),exponentialRampToValueAtTime:value=>this.levels.push(value)},connect(){},disconnect(){}};}
  }
  const window={AudioContext:supported?Context:undefined,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n),dispatchEvent:e=>events.get(e.type)?.(e)};
  runInNewContext(code,{exports,window,document,Event});
  return {api:exports,contexts,document,events,storage};
}

void test('a tap silently unlocks audio; confirmed success plays one short, quiet pop and releases it',()=>{
  const h=audio(),cue=h.api.prepareNoahConnectionSound(),ctx=h.contexts[0];
  assert.equal(ctx.state,'running');assert.equal(ctx.starts.length,0);
  assert.equal(cue.play(),true);assert.equal(cue.play(),false);
  assert.deepEqual(ctx.starts,[10]);assert.ok(ctx.stops[0]-10<=.181);assert.ok(Math.max(...ctx.levels)<=.12);
  ctx.tone.onended();assert.equal(ctx.state,'closed');
});
void test('failure/cancel, muted, hidden, unsupported or suspended audio never queues a later success sound',()=>{
  const h=audio(),cue=h.api.prepareNoahConnectionSound();cue.dispose();assert.equal(cue.play(),false);assert.equal(h.contexts[0].starts.length,0);
  h.api.setNoahConnectionSound(false);h.api.prepareNoahConnectionSound().play();assert.equal(h.contexts.length,1);
  for(const kind of ['hidden','muted']){const env=audio(),sound=env.api.prepareNoahConnectionSound();if(kind==='hidden')env.document.hidden=true;else env.api.setNoahConnectionSound(false);assert.equal(sound.play(),false);assert.equal(env.contexts[0].starts.length,0);assert.equal(env.contexts[0].state,'closed');}
  assert.equal(audio({supported:false}).api.prepareNoahConnectionSound().play(),false);
  const suspended=audio({resumes:false}),sound=suspended.api.prepareNoahConnectionSound();assert.equal(sound.play(),false);assert.equal(suspended.contexts[0].state,'closed');
  const server={};runInNewContext(code,{exports:server});assert.equal(server.prepareNoahConnectionSound().play(),false);
});
void test('sound preference persists and synchronizes across tabs independently of vibration',()=>{
  const h=audio();let updates=0;const off=h.api.subscribeNoahConnectionSound(()=>updates++);
  h.api.setNoahConnectionSound(false);assert.equal(h.api.noahConnectionSoundEnabled(),false);assert.equal(updates,1);
  h.storage.set('noah-connection-sound-v1','on');h.events.get('storage')({key:'noah-connection-sound-v1'});assert.equal(h.api.noahConnectionSoundEnabled(),true);
  off();assert.equal(h.events.size,0);
});
void test('logo appears immediately while connecting; success pops once, failure is silent, duplicate taps send once',async()=>{
  for(const status of [200,503]){
    let release;const held=new Promise(resolve=>{release=resolve;});const cues=[],pulses=[];
    const ui=screen({modules:{'@/lib/owner-intent':ownerIntent,'@/lib/noah-ready-view':readyView,'@/lib/noah-haptics':{noahHaptic:k=>pulses.push(k)},'@/lib/noah-connection-sound':{prepareNoahConnectionSound:()=>{cues.push('unlock');return{play:()=>cues.push('pop'),dispose:()=>cues.push('dispose')};}}},fetch:async({method})=>method==='GET'?{body:{planSha256:'plan'}}:(await held,{status,body:status===200?{id:'connected-id',state:'connected',revision:1}:{error:'unavailable'}})});
    const page=ui.mount('components/noah-connect-button.tsx',{agentId:'family-1',listed:true,signedIn:true,ownerScope:'owner',connection:null,onChange(){}});
    const press=page.find('button','接続')[0].props.onClick;press();press();page.render();
    assert.equal(page.find('div').filter(n=>n.props['data-noah-connection-loading']).length,1);
    assert.equal(page.find('button')[0].props.disabled,true);assert.deepEqual(cues,['unlock']);assert.deepEqual(pulses,[]);
    release();await page.flush();assert.equal(ui.calls.filter(r=>r.method==='POST').length,1);
    assert.equal(page.find('div').filter(n=>n.props['data-noah-connection-loading']).length,0);
    assert.deepEqual(pulses,status===200?['success']:[]);assert.equal(cues.filter(c=>c==='pop').length,status===200?1:0);
    page.render();await page.flush();assert.equal(cues.filter(c=>c==='pop').length,status===200?1:0);
  }
});
void test('a pending connection keeps its logo and only plays feedback when polling confirms success',async()=>{
  const cues=[],pulses=[];let currentState='probing';const props={agentId:'family-1',listed:true,signedIn:true,ownerScope:'owner',connection:null,onChange(next){props.connection=next;}};
  const ui=screen({modules:{'@/lib/owner-intent':ownerIntent,'@/lib/noah-ready-view':readyView,'@/lib/noah-haptics':{noahHaptic:k=>pulses.push(k)},'@/lib/noah-connection-sound':{prepareNoahConnectionSound:()=>({play:()=>cues.push('pop'),dispose(){}})}},fetch:async({url})=>url.includes('connect-plan')?{body:{planSha256:'plan'}}:{body:{id:'pending-id',state:currentState,revision:1}}});
  const page=ui.mount('components/noah-connect-button.tsx',props);await page.click('接続');
  assert.equal(page.find('div').filter(n=>n.props['data-noah-connection-loading']).length,1);assert.deepEqual(cues,[]);
  currentState='connected';await page.tick(1500);assert.deepEqual(cues,['pop']);assert.deepEqual(pulses,['success']);
  assert.equal(page.find('div').filter(n=>n.props['data-noah-connection-loading']).length,0);await page.tick(3000);assert.deepEqual(cues,['pop']);
});
