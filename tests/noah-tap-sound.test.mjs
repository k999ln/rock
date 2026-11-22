import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const code=ts.transpileModule(readFileSync(new URL('../lib/noah-tap-sound.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function setup({defer=false,supported=true}={}) {
  let now=1000,enabled=true,resume;
  const exports={},contexts=[],timers=new Map(),document={hidden:false};
  class Context {
    constructor(options){this.options=options;this.state='suspended';this.currentTime=2;this.destination={};this.voices=[];contexts.push(this);}
    resume(){return defer?new Promise(resolve=>{resume=()=>{this.state='running';resolve();};}):(this.state='running',Promise.resolve());}
    suspend(){this.state='suspended';return Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
    createOscillator(){const tone={started:false,stopped:[],disconnected:false,frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){this.disconnected=true;},start(){this.started=true;},stop(at){this.stopped.push(at);}};this.voices.push(tone);return tone;}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  runInNewContext(code,{exports,window:{AudioContext:supported?Context:undefined},document,Date:{now:()=>now},setTimeout:callback=>{const id=Symbol();timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),require:id=>{assert.equal(id,'./noah-connection-sound');return{noahConnectionSoundEnabled:()=>enabled};}});
  return {api:exports,contexts,document,timers,advance:ms=>{now+=ms;},mute:()=>{enabled=false;},resume:async()=>{resume();await Promise.resolve();}};
}

void test('tap audio uses interactive latency, reuses one context and bounds overlapping or duplicate taps',async()=>{
  const h=setup();h.api.playNoahTapSound('tap');await Promise.resolve();
  assert.equal(h.contexts.length,1);const c=h.contexts[0];assert.equal(c.options.latencyHint,'interactive');
  assert.equal(c.voices.length,1);assert.equal(c.voices[0].started,true);assert.ok(c.voices[0].stopped[0]-2<.1);
  h.api.playNoahTapSound('tap');assert.equal(c.voices.length,1);
  h.advance(80);h.api.playNoahTapSound('select');assert.equal(h.contexts.length,1);assert.equal(c.voices.length,2);
  assert.equal(c.voices[0].disconnected,true);assert.deepEqual(c.voices[0].stopped,[2.095,undefined]);
  assert.equal(h.timers.size,1);[...h.timers.values()][0]();assert.equal(c.state,'suspended');
  h.advance(11000);h.api.playNoahTapSound('tap');await Promise.resolve();assert.equal(c.state,'running');assert.equal(h.contexts.length,1);
  h.api.disposeNoahTapSound();assert.equal(c.state,'closed');assert.equal(h.timers.size,0);
});

void test('a delayed or superseded resume cannot replay an old click; hiding or muting cancels it',async()=>{
  for(const reason of ['late','hidden','muted','disposed']){
    const h=setup({defer:true});h.api.playNoahTapSound('tap');
    if(reason==='late')h.advance(181);
    if(reason==='hidden')h.document.hidden=true;
    if(reason==='muted')h.mute();
    if(reason==='disposed')h.api.disposeNoahTapSound();
    await h.resume();assert.equal(h.contexts[0].voices.length,0,reason);
  }
  const muted=setup();muted.mute();muted.api.playNoahTapSound('select');assert.equal(muted.contexts.length,0);
  const unsupported=setup({supported:false});assert.doesNotThrow(()=>unsupported.api.playNoahTapSound('tap'));
});
