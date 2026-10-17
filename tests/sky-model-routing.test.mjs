import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSkyModel, discoverSkyLocalModels } from '../lib/sky-model-routing.ts';

void test('task routing chooses installed coding or general model deterministically', () => {
  const models = [{provider:'ollama',model:'qwen3:4b'}, {provider:'ollama',model:'qwen2.5-coder:3b'}];
  assert.equal(chooseSkyModel('Pythonコードをデバッグ', models).model, 'qwen2.5-coder:3b');
  assert.equal(chooseSkyModel('文章を要約', models).model, 'qwen3:4b');
  assert.equal(chooseSkyModel('hello', []), null);
});

void test('discovery makes only local metadata GET calls and filters invalid IDs', async () => {
  const seen=[];
  const models=await discoverSkyLocalModels({SKY_LOCAL_LLM_BASE_URL:'http://127.0.0.1:4317/v1',SKY_LLM_COMPATIBLE_BASE_URL:'https://paid.example/v1'}, async (url, init) => {
    seen.push(url); assert.equal(init.redirect,'manual'); assert.equal(init.body,undefined);
    return Response.json(url.endsWith('/api/tags') ? {models:[{name:'qwen3:4b'}]} : {data:[{id:'local/coder'},{id:'invalid model'},null]});
  });
  assert.equal(seen.length,2);
  assert.ok(seen.every(url=>url.startsWith('http://127.0.0.1:')));
  assert.deepEqual(models.map(x=>x.model),['local/coder','qwen3:4b']);
});

void test('unreachable or remote local-config never becomes a cloud fallback', async () => {
  let calls=0;
  const models=await discoverSkyLocalModels({SKY_OLLAMA_BASE_URL:'https://remote.example', SKY_LOCAL_LLM_BASE_URL:'http://user:password@localhost:4317'}, async ()=>{calls++;throw Error('must not call');});
  assert.equal(calls,0); assert.deepEqual(models,[]);
  assert.deepEqual(await discoverSkyLocalModels({},async()=>{throw Error('offline');}),[]);
});
