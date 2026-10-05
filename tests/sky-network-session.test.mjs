import test from 'node:test';
import assert from 'node:assert/strict';
import { createNetworkSession, networkServiceHint } from '../lib/sky-network-session.ts';
function fixture(){
 let online=true, token=false, calls=0, resolve, reject;
 const states=[];
 const operation=()=>{calls++;return new Promise((yes,no)=>{resolve=yes;reject=no;});};
 const flow=createNetworkSession({online:()=>online,hasToken:()=>token,verify:operation,connect:operation,changed:s=>states.push(s)});
 return {flow,states,get last(){return states.at(-1)},get calls(){return calls},resolve:()=>resolve(),reject:()=>reject(new Error('接続アプリを起動してください。')),offline:()=>{online=false;flow.offline()},online:()=>{online=true},token:()=>{token=true}};
}
await test('late connect success after offline never shows connected',async()=>{
 const f=fixture(), p=f.flow.connect();assert.equal(f.last.status,'connecting');f.offline();f.resolve();await p;
 assert.equal(f.last.status,'offline');assert.equal(f.last.pending,false);assert.equal(f.states.some(s=>s.status==='connected'),false);
});
await test('offline then online cannot admit the old success; explicit retry recovers',async()=>{
 const f=fixture(),p=f.flow.connect();f.offline();f.online();await f.flow.check();f.resolve();await p;
 assert.equal(f.last.status,'idle');assert.equal(f.states.some(s=>s.status==='connected'),false);
 const retry=f.flow.connect();f.resolve();await retry;assert.equal(f.last.status,'connected');
});
await test('failure exposes retry and double click or device event cannot start a second operation',async()=>{
 const f=fixture(),p=f.flow.connect();await f.flow.connect();f.token();await f.flow.check();assert.equal(f.calls,1);
 f.reject();await p;assert.equal(f.last.status,'failed');assert.match(f.last.message,/接続アプリ/);assert.equal(f.last.pending,false);
 const retry=f.flow.connect();f.resolve();await retry;assert.equal(f.last.status,'connected');
});
await test('disposed view ignores late connection completion',async()=>{
 const f=fixture(),p=f.flow.connect();f.flow.dispose();const count=f.states.length;f.resolve();await p;assert.equal(f.states.length,count);
});
await test('saved connection verification also cannot override offline',async()=>{
 const f=fixture();f.token();const p=f.flow.check();assert.equal(f.last.status,'checking');f.offline();f.reject();await p;assert.equal(f.last.status,'offline');
});
await test('missing token and offline state never attempt to connect automatically',async()=>{
 const f=fixture();await f.flow.check();assert.equal(f.last.status,'idle');f.offline();await f.flow.connect();assert.equal(f.calls,0);
});
await test('a sign-in response proves Sky reachability but never permits device checks',async()=>{
 const signin=networkServiceHint('signin');assert.equal(signin.reachable,true);assert.equal(signin.mayCheckDevice,false);
 const ready=networkServiceHint('ready');assert.equal(ready.reachable,true);assert.equal(ready.mayCheckDevice,true);
 for(const state of ['checking','unavailable','unknown'])assert.equal(networkServiceHint(state).mayCheckDevice,false);
});
await test('pausing for an authentication recheck invalidates an in-flight success',async()=>{
 const f=fixture(),p=f.flow.connect();f.flow.pause();assert.equal(f.last.status,'idle');assert.equal(f.last.pending,true);
 await f.flow.connect();assert.equal(f.calls,1);f.resolve();await p;
 assert.equal(f.last.pending,false);assert.equal(f.states.some(s=>s.status==='connected'),false);
 const retry=f.flow.connect();f.resolve();await retry;assert.equal(f.last.status,'connected');
});
await test('pausing a verified view clears its connected presentation without another operation',async()=>{
 const f=fixture(),p=f.flow.connect();f.resolve();await p;assert.equal(f.last.status,'connected');
 f.flow.pause();assert.equal(f.last.status,'idle');assert.equal(f.last.pending,false);assert.equal(f.calls,1);
});
await test('production connectDevice stops at failed runtime startup and never requests a PC token',async()=>{
 const {build}=await import('esbuild');
 const built=await build({entryPoints:[new URL('../lib/device.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser'});
 const device=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const saved=Object.fromEntries(['window','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));const requests=[];
 try{
  globalThis.window={location:{hostname:'127.0.0.1'}};
  globalThis.fetch=async(path,init)=>{requests.push({path,method:init.method});return Response.json({error:'failure-only fixture'},{status:503});};
  await assert.rejects(device.connectDevice(),/failure-only fixture/);
  assert.deepEqual(requests,[{path:'/__sky/runtime/start',method:'POST'}]);
 }finally{for(const [key,descriptor] of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
