import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

void test('Python worker enforces common limits and keeps the legacy token/time contract', () => {
  const python = spawnSync('python3', ['-c', `
import importlib.util
spec=importlib.util.spec_from_file_location('worker','toolkits/sky-linux-local/worker.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
base={'jobId':'a'*36,'input':'fixture','instructions':'draft','modelSha256':'b'*64}
assert w.execution_limits(base,1000)=={'tokens':512,'wall_seconds':180,'cpu_seconds':170}
assert w.execution_limits({**base,'modelId':'fixture','maxOutputTokens':64,'deadline':2500},1000)=={'tokens':64,'wall_seconds':1.5,'cpu_seconds':2}
for patch in [{'maxOutputTokens':64},{'deadline':2500},{'maxOutputTokens':True,'deadline':2500},{'maxOutputTokens':0,'deadline':2500},{'maxOutputTokens':1025,'deadline':2500},{'maxOutputTokens':64,'deadline':1000},{'maxOutputTokens':64,'deadline':121001},{'maxOutputTokens':64,'deadline':float('inf')},{'shell':'id'}]:
 try: w.execution_limits({**base,**patch},1000)
 except ValueError: pass
 else: raise AssertionError(patch)
`], { encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
});

void test('fixed Python process receives approved token/wall/CPU limits without a shell, and preserves legacy defaults', () => {
  const python = spawnSync('python3', ['-c', `
import importlib.util,tempfile,json,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('worker','toolkits/sky-linux-local/worker.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
with tempfile.TemporaryDirectory(prefix='sky-worker-bounds-') as folder:
 w.ROOT=Path(folder);model=b'synthetic model';(w.ROOT/'model.gguf').write_bytes(model)
 descriptor={'id':'fixture','bytes':len(model),'sha256':hashlib.sha256(model).hexdigest()}
 (w.ROOT/'runtime-lock.json').write_text(json.dumps({'directory':'fixture','model':descriptor}))
 binary=w.ROOT/'runtime/fixture/llama-completion';binary.parent.mkdir(parents=True);binary.write_bytes(b'non executable fixture')
 (w.ROOT/'runtime-files.json').write_text(json.dumps({'llama-completion':w.digest(binary)}))
 captures=[];limits=[]
 w.identity=lambda pid:{'pid':pid,'boot':'synthetic','start':'synthetic'}
 w.time.time=lambda:1000
 w.resource.setrlimit=lambda resource,value:limits.append((resource,value))
 # This fake Popen executes preexec in the host process. Real Linux parent-death
 # behavior is covered by test_pixel_worker_parent_exit.py on the Pixel guest.
 def fake_child_setup(cpu,parent):
  assert parent==w.os.getpid()
  w.limits(cpu)
 w.prepare_child=fake_child_setup
 class Child:
  pid=999999999;returncode=0
  def __init__(self,args,**kw):
   self.call={'args':args,'kwargs':kw};captures.append(self.call);kw['stdout'].write(b'fixture output');kw['stdout'].flush();kw['preexec_fn']()
  def wait(self,timeout=None):self.call['timeout']=timeout
 w.subprocess.Popen=Child
 base={'jobId':'a'*36,'input':'untrusted $(shell) text','instructions':'draft only','modelSha256':descriptor['sha256']}
 assert w.run({**base,'maxOutputTokens':64,'deadline':1005000})['text']=='fixture output'
 first=captures[-1];assert first['args'][first['args'].index('-n')+1]=='64';assert first['timeout']==5
 assert (w.resource.RLIMIT_CPU,(5,5)) in limits
 assert first['kwargs'].get('shell',False) is False
 assert set(first['kwargs']['env'])=={'PATH','HOME','LD_LIBRARY_PATH','LANG'}
 limits.clear();w.run({**base,'jobId':'c'*36})
 second=captures[-1];assert second['args'][second['args'].index('-n')+1]=='512';assert second['timeout']==180
 assert (w.resource.RLIMIT_CPU,(170,170)) in limits
 assert len(captures)==2
 def cannot_start(*args,**kwargs):raise OSError('synthetic launch failure')
 w.subprocess.Popen=cannot_start
 try:w.run({**base,'jobId':'d'*36,'maxOutputTokens':64,'deadline':1005000})
 except OSError:pass
 else:raise AssertionError('launch must fail')
 assert not (w.ROOT/'jobs'/('d'*36)/'prompt.txt').exists()
 clock=iter([1000,1000,1006]);w.time.time=lambda:next(clock)
 try:w.run({**base,'jobId':'e'*36,'maxOutputTokens':64,'deadline':1005000})
 except ValueError:pass
 else:raise AssertionError('expired launch must fail')
 assert not (w.ROOT/'jobs'/('e'*36)/'prompt.txt').exists()
 assert len(captures)==2
`], { encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
});
