import test from 'node:test';
import assert from 'node:assert/strict';
import { createMiniVoiceSession, miniVoiceCommand, MINI_VOICE_PENDING } from '../lib/mini-voice-session.ts';
import { startMiniLocalSpeech } from '../lib/mini-local-speech.ts';
import { pixelPortableFixture } from './helpers/pixel-portable-fixture.mjs';
import { readFileSync } from 'node:fs';
const storage = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) }; };
const setup = (action, saved = storage()) => createMiniVoiceSession({ action, storage: saved, changed() {} });
const tick = () => new Promise(done => setTimeout(done, 5));
void test('only whole final phrases wake or stop; quoting a phrase is a request', () => {
  assert.equal(miniVoiceCommand('Ｈｅｙ Ｅｖｅ！'), 'wake');
  assert.equal(miniVoiceCommand('Thanks Eve.'), 'stop');
  assert.equal(miniVoiceCommand('ヘイイヴ'), 'wake');
  for (const text of ['Say Thanks Eve', 'Thanks Eveの文章を書く', 'hey everything']) assert.equal(miniVoiceCommand(text),'request');
});
void test('wake and speech cannot create a job; explicit confirmation reuses the existing manager, agent pins, job and export', async t => {
  const f = await pixelPortableFixture(t), saved = storage(), calls = [];
  const s = setup(async input => { calls.push(input.action); return f.manager.action(input); }, saved);
  s.hearFinal('依頼'); assert.equal(s.state.phase,'disabled');
  s.arm(); s.hearFinal('依頼'); assert.equal(s.state.phase,'standby');
  s.hearFinal('Hey Eve'); s.hearFinal('会議のお知らせを短く書いて');
  assert.equal(s.state.phase,'review'); assert.equal(calls.length,0);
  await Promise.all([s.confirm(),s.confirm()]);
  assert.equal(f.counters.dispatched,1); assert.equal(s.state.phase,'running');
  const pending=JSON.parse(saved.getItem(MINI_VOICE_PENDING));assert.equal(pending.id,s.state.jobId);
  f.finish(await f.wait()); await tick(); await s.refresh(); assert.equal(s.state.phase,'result');
  const exported=await f.manager.action({action:'export',jobId:s.state.jobId});assert.match(exported.text,/合成のPixel成果/);
  await s.stop();assert.equal(s.state.phase,'standby');assert.match(s.state.result,/合成のPixel成果/);assert.equal(saved.getItem(MINI_VOICE_PENDING),null);
  assert.equal(f.counters.stopped,0);assert.equal(f.counters.environmentsStopped,0);
});
void test('Thanks Eve stops exactly this job, confirms the existing stop receipt, and keeps agents and stored jobs', async t => {
  const f=await pixelPortableFixture(t),saved=storage(),s=setup(input=>f.manager.action(input),saved);
  s.arm();s.hearFinal('Hey Eve');s.hearFinal('依頼を段取りにして');await s.confirm();
  const count=f.manager.snapshot().agents.length;
  await Promise.all([s.stop(),s.stop()]);assert.equal(s.state.phase,'standby');assert.equal(f.counters.stopped,1);
  const snapshot=f.manager.snapshot();assert.equal(snapshot.agents.length,count);assert.equal(snapshot.runs.length,1);assert.equal(snapshot.runs[0].stop,'confirmed');assert.equal(f.counters.environmentsStopped,0);
});
void test('a stop during agent creation fences late callbacks before run, with no unrelated global stop', async t => {
  const f=await pixelPortableFixture(t);let resume,started;const gate=new Promise(done=>{resume=done;});const reached=new Promise(done=>{started=done;});
  const s=setup(async input=>{const result=await f.manager.action(input);if(input.action==='add-agent'){started();await gate;}return result;});
  s.arm();s.hearFinal('Hey Eve');s.hearFinal('段取りを作る');const run=s.confirm();await reached;const stop=s.stop();resume();await run;await stop;
  assert.equal(f.counters.dispatched,0);assert.equal(s.state.phase,'standby');
});
void test('lost start response retains its ID and stop reconciles the same actual job without replay', async t => {
  const f=await pixelPortableFixture(t),saved=storage();let starts=0;
  const s=setup(async input=>{const result=await f.manager.action(input);if(input.action==='run'){starts++;throw Error('応答が途切れました。');}return result;},saved);
  s.arm();s.hearFinal('Hey Eve');s.hearFinal('短い説明を書く');await s.confirm();assert.equal(s.state.phase,'unknown');
  await s.confirm();assert.equal(starts,1);await s.stop();assert.equal(s.state.phase,'standby');assert.equal(f.counters.stopped,1);
});
void test('absent or mismatched saved job never proves stopped and the handle stays for recovery', async t => {
  const f=await pixelPortableFixture(t),saved=storage(),s=setup(input=>f.manager.action(input),saved);
  s.arm();s.hearFinal('Hey Eve');s.hearFinal('説明を書く');await s.confirm();
  const next=setup(async()=>({...f.manager.snapshot(),runs:[]}),saved);next.arm();assert.equal(next.state.phase,'unknown');await next.stop();assert.equal(next.state.phase,'unknown');assert.ok(saved.getItem(MINI_VOICE_PENDING));
  const wrong=setup(async()=>({...f.manager.snapshot(),runs:f.manager.snapshot().runs.map(r=>({...r,input:'another owner content'}))}),saved);wrong.arm();await wrong.stop();assert.equal(wrong.state.phase,'unknown');assert.ok(saved.getItem(MINI_VOICE_PENDING));
});
void test('unprepared or busy models cannot cause downloads or execution; failed storage prevents start', async t=>{
  const f=await pixelPortableFixture(t);let calls=[];
  const s=setup(async input=>{calls.push(input.action);return {...f.manager.snapshot(),phase:'stopped'};});s.arm();s.hearFinal('Hey Eve');s.hearFinal('説明を書く');await s.confirm();assert.deepEqual(calls,['status']);assert.equal(s.state.phase,'review');
  const bad={...storage(),setItem(){throw Error('quota');}};calls=[];const q=setup(async input=>{calls.push(input.action);return f.manager.action(input);},bad);q.arm();q.hearFinal('Hey Eve');q.hearFinal('説明を書く');await q.confirm();assert.equal(q.state.phase,'review');assert.ok(!calls.includes('run'));
});
function recognizer(available='available') {
  let engine,starts=0,aborts=0;
  class Speech { processLocally=false;start(){starts++;}abort(){aborts++;}static async available(options){assert.deepEqual(options,{langs:['ja-JP'],processLocally:true});return available;}constructor(){engine=this;} }
  return {Speech,get engine(){return engine;},get starts(){return starts;},get aborts(){return aborts;}};
}
void test('speech adapter requires local support and installed language; it never falls back or downloads',async()=>{
  await assert.rejects(startMiniLocalSpeech(undefined,new AbortController().signal,()=>{},()=>{}),/端末内/);
  const no=recognizer('downloadable');await assert.rejects(startMiniLocalSpeech(no.Speech,new AbortController().signal,()=>{},()=>{}),/自動ダウンロード/);assert.equal(no.starts,0);assert.equal(no.aborts,1);
});
void test('provider and browser failures are explained in ordinary Japanese',async()=>{
  const s=setup(async()=>{throw Error('ECONNREFUSED');});s.arm();s.hearFinal('Hey Eve');s.hearFinal('説明を書く');await s.confirm();assert.match(s.state.message,/接続を確認できません/);assert.doesNotMatch(s.state.message,/ECONN/);
  const f=recognizer();f.Speech.available=()=>Promise.reject(Error('NotAllowedError'));await assert.rejects(startMiniLocalSpeech(f.Speech,new AbortController().signal,()=>{},()=>{}),/マイクの許可/);assert.equal(f.starts,0);
});
void test('only final speech is forwarded; abort detaches callbacks and releases input',async()=>{
  const f=recognizer(),signal=new AbortController(),heard=[];const close=await startMiniLocalSpeech(f.Speech,signal.signal,text=>heard.push(text),()=>{});
  assert.equal(f.engine.processLocally,true);assert.equal(f.starts,1);
  f.engine.onresult({resultIndex:0,results:[{isFinal:false,0:{transcript:'partial'}},{isFinal:true,0:{transcript:'Hey Eve'}}]});assert.deepEqual(heard,['Hey Eve']);
  signal.abort();close();assert.equal(f.aborts,1);assert.equal(f.engine.onresult,null);assert.equal(f.engine.onend,null);
});
void test('cancelling while the local language check is pending cannot restart recording',async()=>{
  const f=recognizer();let resolve;f.Speech.available=()=>new Promise(done=>{resolve=done;});const signal=new AbortController();const pending=startMiniLocalSpeech(f.Speech,signal.signal,()=>{},()=>{});signal.abort();resolve('available');await pending;assert.equal(f.starts,0);assert.equal(f.aborts,1);
});
void test('Pixel-only UI and loopback packaging keep the generic public pages free of microphone grants',()=>{
  const lab=readFileSync(new URL('../components/sky-linux-local-lab.tsx',import.meta.url),'utf8');assert.match(lab,/pixelLocal && <MiniVoicePanel/);
  const panel=readFileSync(new URL('../components/eve-interaction-panel.tsx',import.meta.url),'utf8');assert.match(panel,/visibilitychange/);assert.match(panel,/pagehide/);assert.match(panel,/session.stop\(true\)/);
  const speech=readFileSync(new URL('../lib/mini-local-speech.ts',import.meta.url),'utf8');assert.doesNotMatch(speech,/\.install\(|webkitSpeechRecognition|fetch\(/);assert.match(speech,/120_000/);
});
