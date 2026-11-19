import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { recipeFor } from '../lib/noah-execution-contract.mjs';
import { sourcePlan, downloadArtifact, sha256 } from '../scripts/noah-source-fetch.mjs';

const python = source => execFileSync('python3', ['-c', `import sys\nsys.dont_write_bytecode=True\nsys.path.insert(0,'scripts/noah-agent-runtime')\nfrom cow_sdk import ReplyState,request_payload,validate_route,MODEL\n${source}`], { encoding: 'utf8' }).trim();

void test('fixed codeload archives verify bytes and reject hash mismatch, misleading hosts and remote redirects', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'noah-cow-source-'));
  try {
    const url = recipeFor('research-25a5f6ae5d1576507f83').artifact.url;
    const destination = path.join(dir, 'archive'), bytes = Buffer.from('fixed archive');
    const args = { url, destination, sha256: sha256(bytes), fetcher: async () => new Response(bytes) };
    await downloadArtifact(args); assert.deepEqual(await readFile(destination), bytes);
    await rm(destination);
    await assert.rejects(downloadArtifact({ ...args, sha256: '0'.repeat(64) }), /ハッシュ/);
    await assert.rejects(access(destination));
    let calls = 0;
    await assert.rejects(downloadArtifact({ ...args, fetcher: async () => {
      calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
    } }), /転送先/);
    assert.equal(calls, 1);
    for (const bad of ['https://codeload.github.com.attacker.invalid/a', 'http://codeload.github.com/a', 'https://key@codeload.github.com/a']) {
      await assert.rejects(downloadArtifact({ ...args, url: bad, fetcher: async () => assert.fail('must not fetch') }), /転送先/);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

void test('Cow native blocks preserve parallel Tool identity and reject unsupported content or tools', () => {
  assert.equal(python(`
from types import SimpleNamespace
request=SimpleNamespace(system='system',messages=[{'role':'user','content':'write'},
 {'role':'assistant','content':[{'type':'text','text':'working'},
 {'type':'tool_use','id':'a','name':'write','input':{'path':'one.txt','content':'one'}},
 {'type':'tool_use','id':'b','name':'read','input':{'path':'two.txt'}}]},
 {'role':'user','content':[{'type':'tool_result','tool_use_id':'b','content':'two'},
 {'type':'tool_result','tool_use_id':'a','content':[{'type':'text','text':'saved'}]}]}],
 tools=[{'name':'write','description':'file','input_schema':{'type':'object'}}])
p=request_payload(request,MODEL)
assert p['messages'][0]=={'role':'system','content':'system'}
assert [x['id'] for x in p['messages'][2]['tool_calls']]==['a','b']
assert [x['tool_call_id'] for x in p['messages'][3:]]==['b','a']
assert p['messages'][4]['content']=='saved'
assert p['tools'][0]['function']['name']=='write'
assert p['max_tokens']==2048 and p['stream'] is False
for message in [{'role':'user','content':[{'type':'image','source':{}}]},
 {'role':'assistant','content':[{'type':'tool_result','tool_use_id':'a','content':'x'}]},
 {'role':'user','content':[{'type':'tool_result','content':'x'}]},
 {'role':'assistant','content':[{'type':'tool_use','id':'a','name':'write','input':'bad'}]}]:
 request.messages=[message]
 try: request_payload(request,MODEL)
 except ValueError: pass
 else: raise AssertionError(message)
request.messages=[{'role':'user','content':'hello'}]
request.tools=[{'name':'browser','description':'bad','input_schema':{}}]
try: request_payload(request,MODEL)
except ValueError: pass
else: raise AssertionError('unexpected Tool accepted')
print('ok')`), 'ok');
});

void test('Cow completed reply requires a normal final turn, matching end and no error/cancellation', () => {
  assert.equal(python(`
turn={'type':'turn_end','data':{'has_tool_calls':False,'stop_reason':'stop'}}
end={'type':'agent_end','data':{'final_response':'done','cancelled':False}}
s=ReplyState()
for e in [turn,end]:s.accept(e)
s.verify('done')
for events in [[],[turn],[end],[turn,end,end],[turn,{'type':'error'},end],
 [turn,{'type':'agent_cancelled'},end],
 [{'type':'turn_end','data':{'has_tool_calls':True,'stop_reason':'tool_calls'}},end],
 [{'type':'turn_end','data':{'has_tool_calls':False,'stop_reason':'length'}},end],
 [turn,{'type':'agent_end','data':{'final_response':'done','cancelled':True}}]]:
 s=ReplyState()
 for e in events:s.accept(e)
 try:s.verify('done')
 except ValueError:pass
 else:raise AssertionError(events)
s=ReplyState();s.accept(turn);s.accept(end)
for response in ['',None,'different']:
 try:s.verify(response)
 except ValueError:pass
 else:raise AssertionError(response)
print('ok')`), 'ok');
});

void test('Cow route excludes remote providers, URL credentials, query routing and unprepared models', () => {
  assert.equal(python(`
validate_route('http://127.0.0.1:1234/v1',MODEL)
for base,model in [('https://api.example/v1',MODEL),('http://127.0.0.1:1234/v1','other'),
 ('http://key@127.0.0.1:1234/v1',MODEL),('http://127.0.0.1:1234/v1?url=x',MODEL),
 ('http://127.0.0.1/v1',MODEL)]:
 try:validate_route(base,model)
 except ValueError:pass
 else:raise AssertionError(base)
print('ok')`), 'ok');
});

void test('Cow cannot promote denied, failed, missing or mismatched Tool completion to a successful reply', () => {
  assert.equal(python(`
start={'type':'tool_execution_start','data':{'tool_call_id':'a','tool_name':'write'}}
end={'type':'tool_execution_end','data':{'tool_call_id':'a','tool_name':'write','status':'success'}}
finish=[{'type':'turn_end','data':{'has_tool_calls':False,'stop_reason':'stop'}},
 {'type':'agent_end','data':{'final_response':'done','cancelled':False}}]
s=ReplyState()
for e in [start,end]+finish:s.accept(e)
s.verify('done')
for events in [[start],[end],[start,start,end],[start,end,end],
 [start,dict(end,data=dict(end['data'],status='error'))],
 [start,dict(end,data=dict(end['data'],permission_denied=True))],
 [start,dict(end,data=dict(end['data'],tool_name='read'))],
 [start,dict(end,data=dict(end['data'],tool_call_id='b'))],
 [dict(start,data=dict(start['data'],tool_name='browser')),end]]:
 s=ReplyState()
 for e in events+finish:s.accept(e)
 try:s.verify('done')
 except ValueError:pass
 else:raise AssertionError(events)
print('ok')`), 'ok');
});

void test('Cow source is fixed to the reviewed official archive with hash-locked wheels', () => {
  const id = 'research-25a5f6ae5d1576507f83', recipe = recipeFor(id);
  assert.equal(sourcePlan({ id, kind: 'agent' }).adapter, 'isolated');
  assert.equal(recipe.sourcePin, recipe.version);
  const dockerfile = readFileSync('scripts/noah-agent-runtime/Dockerfile.cow', 'utf8');
  assert.ok(dockerfile.includes(recipe.artifact.url));
  assert.ok(dockerfile.includes(recipe.artifact.sha256));
  const lines = readFileSync('scripts/noah-agent-runtime/cow/requirements.lock', 'utf8').split('\n').filter(s => s && !s.startsWith('#'));
  assert.ok(lines.length > 0);
  for (const line of lines) assert.match(line, /^[\w.-]+ @ https:\/\/files\.pythonhosted\.org\/packages\/\S+\.whl --hash=sha256:[a-f0-9]{64}$/);
});
