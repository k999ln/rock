import test from 'node:test';
import assert from 'node:assert/strict';
import {clearZemaPrivateSession, zemaPrivateStorageBlocked, ZEMA_CHAT_SESSION_KEY as chat, SKY_ZEMA_HANDOFF_KEY as handoff} from '../lib/zema-private-storage.ts';
import {saveZemaChatSession,readZemaChatSessions} from '../lib/zema-chat-session.ts';
import {queueSkyZemaHandoff,consumeSkyZemaHandoff} from '../lib/sky-zema-handoff.ts';
function fixture() {
  const data=new Map(),removed=[];let failed=new Set(),silent=false,readFail=false;
  const storage={getItem(k){if(readFail)throw Error('read denied');return data.get(k)??null},setItem(k,v){data.set(k,v)},removeItem(k){removed.push(k);if(failed.has(k))throw Error('delete denied');if(!silent)data.delete(k)}};
  const seed=()=>{saveZemaChatSession({version:1,id:'03100000-0000-4000-8000-000000000001',toolId:'mr-citations',createdAt:Date.now(),messages:[{id:'a',side:'me',text:'Alice private'}],activeRequest:null,workflowStatus:'ready',outcome:null},storage);queueSkyZemaHandoff('mr-citations','Alice pending',storage)};
  return {storage,data,removed,seed,fail(keys){failed=new Set(keys)},silent(v){silent=v},readFail(v){readFail=v}};
}
void test('sessionStorage getter SecurityError is contained; both private readers/writers remain blocked through recovery until verified clear',()=>{
 const f=fixture();clearZemaPrivateSession(f.storage);f.seed();let denied=true;const original=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{name:'original-tab-name',get sessionStorage(){if(denied)throw new DOMException('blocked','SecurityError');return f.storage}}});
 try {
  assert.equal(clearZemaPrivateSession(),false);assert.equal(zemaPrivateStorageBlocked(),true);denied=false;
  assert.deepEqual(readZemaChatSessions(),[]);assert.equal(consumeSkyZemaHandoff('mr-citations'),null);
  assert.throws(()=>queueSkyZemaHandoff('mr-citations','Bob input'));assert.throws(()=>f.seed());
  assert.equal(f.data.size,2);assert.equal(clearZemaPrivateSession(),true);assert.equal(window.name,'original-tab-name');
  assert.deepEqual(readZemaChatSessions(),[]);assert.equal(consumeSkyZemaHandoff('mr-citations'),null);
  f.seed();assert.equal(readZemaChatSessions().length,1);
 } finally {clearZemaPrivateSession(f.storage);if(original)Object.defineProperty(globalThis,'window',original);else delete globalThis.window}
});
for(const keys of [[chat],[handoff],[chat,handoff]]) void test('failed removal quarantines both readers and attempts both keys: '+keys.join(','),()=>{
 const f=fixture();clearZemaPrivateSession(f.storage);f.seed();f.fail(keys);
 assert.equal(clearZemaPrivateSession(f.storage),false);assert.deepEqual(f.removed.slice(-2),[chat,handoff]);
 for(const key of [chat,handoff])assert.equal(f.data.has(key),keys.includes(key));
 f.fail([]);assert.deepEqual(readZemaChatSessions(f.storage),[]);assert.equal(consumeSkyZemaHandoff('mr-citations',f.storage),null);
 assert.equal(clearZemaPrivateSession(f.storage),true);assert.equal(f.data.size,0);assert.equal(zemaPrivateStorageBlocked(),false);
 f.seed();assert.equal(readZemaChatSessions(f.storage).length,1);assert.ok(consumeSkyZemaHandoff('mr-citations',f.storage));clearZemaPrivateSession(f.storage);
});
void test('silent deletion and readback failures do not release quarantine',()=>{
 const f=fixture();clearZemaPrivateSession(f.storage);f.seed();f.silent(true);assert.equal(clearZemaPrivateSession(f.storage),false);
 f.silent(false);f.readFail(true);assert.equal(clearZemaPrivateSession(f.storage),false);f.readFail(false);
 assert.deepEqual(readZemaChatSessions(f.storage),[]);assert.equal(clearZemaPrivateSession(f.storage),true);
});
void test('new module/document still honors tab quarantine marker',async()=>{
 const f=fixture();clearZemaPrivateSession(f.storage);f.seed();f.fail([chat]);const original=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{name:'preserve-me',sessionStorage:f.storage}});
 try {
  assert.equal(clearZemaPrivateSession(),false);f.fail([]);
  const fresh=await import('../lib/zema-private-storage.ts?new-document');assert.equal(fresh.zemaPrivateStorageBlocked(),true);assert.equal(fresh.openZemaPrivateStorage(),null);
  assert.equal(fresh.clearZemaPrivateSession(),true);assert.equal(window.name,'preserve-me');assert.equal(f.data.size,0);
 } finally {clearZemaPrivateSession(f.storage);if(original)Object.defineProperty(globalThis,'window',original);else delete globalThis.window}
});
