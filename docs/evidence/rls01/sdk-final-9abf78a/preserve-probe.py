import hashlib,importlib.util,json,os,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
root=Path('/Users/kaiya/Library/RockstarOS/rls01-sdk-final1');out=Path('work/sdk-final1-private-originals');out.mkdir(mode=0o700)
spec=importlib.util.spec_from_file_location('p',Path('../github-candidate-download-01/preview.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
r=json.loads((root/'sdk-result.json').read_text());f=json.loads(Path('work/sdk-final1-financial-readback.json').read_text());assert r['final_snapshot_sha256']==f['authority_snapshot_sha256']
release=json.loads(Path('work/preview-final1/release-manifest.json').read_text())['manifest'];expected={n:v for n,v in release['files'].items() if n.startswith('native/')}
env=dict(os.environ,LIMA_HOME=str(root/'lima'));cmd=['limactl','shell','--workdir','/','os']
code="""import hashlib,json,stat,sys
from pathlib import Path
root=Path('/opt/rockstaros-preview');inventory=json.load(sys.stdin);actual={str(p.relative_to(root)) for p in (root/'native').rglob('*') if p.is_file()};assert actual==set(inventory)
for name,expected in inventory.items():
 p=root/name;i=p.lstat();assert stat.S_ISREG(i.st_mode) and i.st_nlink==1 and p.resolve()==p
 with p.open('rb') as f:h=hashlib.file_digest(f,'sha256').hexdigest()
 assert h==expected['sha256'] and i.st_size==expected['bytes'] and stat.S_IMODE(i.st_mode)==expected['mode'],name
print(json.dumps({'status':'PASS','native_files':len(inventory),'matches_signed_final_release':True}))
"""
a=subprocess.run(cmd+['python3','-B','-c',code],env=env,input=json.dumps(expected),capture_output=True,text=True,timeout=30,check=True)
report={'schema':'rock-final-sdk-originals/1','status':'PASS','native_inventory':json.loads(a.stdout),'financial_snapshot_matches_harness':True,'private_files':{}}
for name,args in [('authority-and-client-state.tar.gz',['tar','-C','/var/tmp','-czf','-','rockstaros-preview-authority','game-sdk-onboarding-01'])]:
 file=out/name
 with file.open('xb') as stream:
  os.fchmod(stream.fileno(),0o600);subprocess.run(cmd+args,env=env,stdout=stream,check=True,timeout=30)
 with file.open('rb') as stream:h=hashlib.file_digest(stream,'sha256').hexdigest()
 report['private_files'][name]={'sha256':h,'bytes':file.stat().st_size}
Path('work/sdk-final1-preserved.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
