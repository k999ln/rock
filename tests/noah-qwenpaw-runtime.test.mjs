import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { recipeFor } from '../lib/noah-execution-contract.mjs';
import { sourcePlan } from '../scripts/noah-source-fetch.mjs';

const python = source => execFileSync('python3', ['-c', `import sys\nsys.dont_write_bytecode=True\nsys.path.insert(0,'scripts/noah-agent-runtime')\nfrom qwenpaw_sdk import ReplyState,workspace_path,validate_route\n${source}`], { encoding: 'utf8' }).trim();

void test('QwenPaw requires one matching official completed reply; partial/error/limit/approval is not success', () => {
  assert.equal(python(`
start={'type':'REPLY_START','session_id':'s','reply_id':'r'}
end={'type':'REPLY_END','session_id':'s','reply_id':'r','finished_reason':'completed'}
s=ReplyState()
for e in [start,{'type':'TEXT_BLOCK_DELTA'},end]: s.accept(e)
s.verify()
for events in [[],[start],[end],[start,start,end],[start,end,end],
 [start,{**end,'session_id':'other'}],[start,{**end,'reply_id':'other'}],
 [start,{**end,'finished_reason':'interrupted'}],[start,{**end,'finished_reason':'exceed_max_iters'}],
 [start,{**end,'error':{'message':'failed'}}],
 [start,{'type':'REQUIRE_USER_CONFIRM'},end],[start,{'type':'REQUIRE_EXTERNAL_EXECUTION'},end]]:
 try:
  s=ReplyState()
  for e in events: s.accept(e)
  s.verify()
 except ValueError: pass
 else: raise AssertionError(events)
print('ok')`), 'ok');
});

void test('QwenPaw file profile denies traversal, symlinks out, hidden state and oversized paths', () => {
  assert.equal(python(`
import tempfile
from pathlib import Path
with tempfile.TemporaryDirectory() as d:
 root=Path(d)/'workspace';root.mkdir()
 (root/'link').symlink_to(root.parent, target_is_directory=True)
 assert workspace_path('result.txt',root)==str((root/'result.txt').resolve())
 for value in ['../secret','/etc/passwd','link/secret','.hidden','nested/.secret','',None,'x'*181]:
  try: workspace_path(value,root)
  except ValueError: pass
  else: raise AssertionError(value)
print('ok')`), 'ok');
});

void test('QwenPaw model route cannot acquire a host credential or choose another provider', () => {
  assert.equal(python(`
validate_route('http://127.0.0.1:1234/v1','qwen3:4b')
validate_route('http://127.0.0.1:1234/v1','qwen2.5-tools:1.5b-v1')
for base,model in [('https://api.example/v1','qwen3:4b'),('http://127.0.0.1:1234/v1','unknown'),
 ('http://token@127.0.0.1:1234/v1','qwen3:4b'),('http://127.0.0.1:1234/v1?url=x','qwen3:4b'),
 ('http://127.0.0.1/v1','qwen3:4b')]:
 try: validate_route(base,model)
 except ValueError: pass
 else: raise AssertionError(base)
print('ok')`), 'ok');
});

void test('QwenPaw routes the actual official distribution with every runtime dependency hash locked', () => {
  const id = 'research-ce4d82de8c3d6abcf0ee';
  const recipe = recipeFor(id);
  assert.equal(sourcePlan({ id, kind: 'agent' }).adapter, 'isolated');
  const lines = readFileSync('scripts/noah-agent-runtime/qwenpaw/requirements.lock', 'utf8').split('\n').filter(s => s && !s.startsWith('#'));
  assert.ok(lines.length > 100);
  for (const line of lines) assert.match(line, /^[\w.-]+ @ https:\/\/files\.pythonhosted\.org\/packages\/\S+ --hash=sha256:[a-f0-9]{64}$/);
  assert.ok(lines.includes(`qwenpaw @ ${recipe.artifact.url} --hash=sha256:${recipe.artifact.sha256}`));
  const bootstrap = readFileSync('scripts/noah-agent-runtime/qwenpaw/build-requirements.lock', 'utf8').trim();
  assert.ok(lines.includes(bootstrap));
});
