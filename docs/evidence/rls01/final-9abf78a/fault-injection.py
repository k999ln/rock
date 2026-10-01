"""Test-only fault injection; immutable installed files remain untouched."""
import importlib.util,json,sys
from pathlib import Path
from types import SimpleNamespace
sys.dont_write_bytecode=True
root=Path('/Users/kaiya/Library/RockstarOS/rls01-final1')
bootstrap=Path(__file__).resolve().parents[1]/'work/preview-final1-download/preview.py'
spec=importlib.util.spec_from_file_location('fault_preview',bootstrap)
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
original=p.guest_python
hook='''import json,os,signal,sys
from pathlib import Path
script=Path(sys.argv[1]);sys.path.insert(0,str(script.parent))
import game_backup as g
def interrupted(source,destination):
 with source.open('rb') as incoming,destination.open('xb') as outgoing:
  raw=incoming.read(16*1024*1024);outgoing.write(raw);outgoing.flush();os.fsync(outgoing.fileno())
 print(json.dumps({'schema':'rock-test-copy-interruption/1','method':'SIGKILL','source':str(source),'destination':str(destination),'copied_bytes':len(raw),'phase':'after actual authority current-copy, during first OS component copy'}),flush=True)
 os.kill(os.getpid(),signal.SIGKILL)
g.b.copy_data=interrupted
sys.argv=sys.argv[1:]
g.main()
'''
count=0
def inject(root,code,*args,**kwargs):
 global count
 if len(args)>2 and args[0].endswith('/os/desktop/game_backup.py') and args[2]=='restore':
  count+=1
  old="result=subprocess.run([sys.executable,'-B',str(script),*sys.argv[3:]],input=sys.stdin.read(),capture_output=True,text=True,check=True,timeout=540)"
  if code.count(old)!=1:raise ValueError('frozen transaction trampoline changed; no injection performed')
  new="fault_script="+repr(hook)+"\ntry:\n result=subprocess.run([sys.executable,'-B','-c',fault_script,str(script),*sys.argv[3:]],input=sys.stdin.read(),capture_output=True,text=True,check=True,timeout=540)\nexcept subprocess.CalledProcessError as error:\n print(error.stdout,end='');print(error.stderr,end='',file=sys.stderr);raise"
  code=code.replace(old,new)
 return original(root,code,*args,**kwargs)
p.guest_python=inject
try:
 p.action(SimpleNamespace(directory=root,action='restore',name='recovered'))
 raise AssertionError('fault-injected restore unexpectedly completed')
except p.subprocess.CalledProcessError as error:
 record=p.load(root)[1]
 if count!=1 or record['state']!='RESTORE_PENDING':raise
 observations=[json.loads(line) for line in error.stdout.splitlines() if line.startswith('{')]
 if len(observations)!=1 or observations[0].get('method')!='SIGKILL' or observations[0].get('copied_bytes')!=16*1024*1024:raise
 result={'schema':'rock-rls01-restore-interruption/1','status':'INTERRUPTED_AS_PLANNED','observation':observations[0],
         'installation_state':record['state'],'pending_restore':record['pending_restore'],
         'bootstrap_sha256':p.digest(bootstrap),'installed_source_files_mutated':False,'original_qemu_signalled':False}
 p.save(root/'interrupted-restore-observation.json',result)
 print(json.dumps(result,indent=2))
