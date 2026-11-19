import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = source => execFileSync('python3', ['-c', `import sys,json\nsys.dont_write_bytecode=True\nsys.path.insert(0,'scripts/noah-agent-runtime')\nfrom dsh_cli import consume,profile\n${source}`], { encoding: 'utf8' });

void test('DSH accepts only the matching completed official final event, never status text or an earlier turn', () => {
  assert.equal(run(`session={'type':'session','sessionId':'s'}
final={'type':'final','sessionId':'s','reason':{'kind':'completed'},'text':'saved'}
assert consume(map(json.dumps,[session,{'type':'text','text':'draft'},final]))=='saved'
bad=[[],[session],[final],[session,{**final,'reason':None}],[session,{**final,'reason':{'kind':'error'}}],
 [session,{**final,'sessionId':'other'}],[session,final,final],[session,{'type':'error'},final],
 [session,{**final,'text':3}],[session,session,final],[session,{'type':'text','text':'completed'}]]
for events in bad:
 try: consume(map(json.dumps,events))
 except ValueError: pass
 else: raise AssertionError(events)
try: consume(['x'*131073])
except ValueError: pass
else: raise AssertionError('unbounded event')
print('ok')`).trim(), 'ok');
});

void test('DSH fixes the local route and removes interactive/network/delegation surfaces', () => {
  const rows = JSON.parse(run("print(json.dumps(profile('http://127.0.0.1:1234/v1','qwen2.5:1.5b')))"));
  const providers = rows.find(r => r.id === 'llm-pi-ai').config.providers;
  assert.deepEqual(Object.keys(providers), ['noah-local']);
  assert.equal(providers['noah-local'].retryPolicy.maxRetries, 0);
  assert.equal(providers['noah-local'].models[0].contextWindow, 8192);
  for (const id of ['session-title-llm', 'tool-web', 'tool-subagent', 'tool-subagent-fork', 'tool-workflow', 'tool-bash']) assert.equal(rows.find(r => r.id === id).disabled, true);
  assert.equal(run("\nfor base,model in [('https://external.invalid/v1','qwen2.5:1.5b'),('http://127.0.0.1:1234/v1','paid-model')]:\n try: profile(base,model)\n except ValueError: pass\n else: raise AssertionError('route allowed')\nprint('ok')").trim(), 'ok');
});

void test('official DSH and all dependencies have fixed npm integrity and registry provenance', () => {
  const lock = JSON.parse(readFileSync('scripts/noah-agent-runtime/dsh/package-lock.json', 'utf8'));
  const pkg = lock.packages['node_modules/@deepseek-ai/dsh'];
  assert.equal(pkg.version, '0.2.2-rc.3');
  assert.equal(pkg.integrity, 'sha512-S+4oUYVKWuc1SCMMp1mpUa2llxVy0o9gIgp7TDg/Ea7PuvXVkAfnykqSH1/oDXVB+y5VzEm0QIJulo1LIB3qRg==');
  for (const [name, p] of Object.entries(lock.packages)) if (name) {
    assert.ok(p.resolved.startsWith('https://registry.npmjs.org/'));
    assert.match(p.integrity, /^sha512-/);
  }
});
