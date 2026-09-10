import hashlib,importlib.util,json,os,stat,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
base=Path('/Users/kaiya/Library/RockstarOS/rls01-github-smoke1');out=Path('work/github-smoke1-private-originals');out.mkdir(mode=0o700)
spec=importlib.util.spec_from_file_location('p',Path('../github-candidate-download-01/preview.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
_,record=p.load(base);release=p.installed_release(base,record);p.verify_installed(base,release)
env=dict(os.environ,LIMA_HOME=str(base/'lima'));cmd=['limactl','shell','--workdir','/','os']
code="""import hashlib,json,stat,sys
from pathlib import Path
inventory=json.load(sys.stdin);root=Path('/opt/rockstaros-preview');result={}
actual={str(x.relative_to(root)) for x in root.rglob('*') if x.is_file()};assert actual==set(inventory)
for name,expected in inventory.items():
 f=root/name;i=f.lstat();assert f.resolve()==f and stat.S_ISREG(i.st_mode) and i.st_nlink==1
 with f.open('rb') as stream:h=hashlib.file_digest(stream,'sha256').hexdigest()
 value={'sha256':h,'bytes':i.st_size,'mode':stat.S_IMODE(i.st_mode)};assert value==expected,(name,value,expected);result[name]=value
print(json.dumps({'status':'PASS','files':len(result),'all_exact_source_image_legal_members':True}))
"""
result=subprocess.run(cmd+['python3','-B','-c',code],env=env,input=json.dumps(release['files']),capture_output=True,text=True,timeout=90,check=True)
report={'schema':'rock-final-original-retention/1','status':'PASS','host_payload_original_inventory':'PASS','guest_inventory':json.loads(result.stdout),'private_records':{}}
def keep(name,args):
 dest=out/name
 with dest.open('xb') as f:
  os.fchmod(f.fileno(),0o600);subprocess.run(cmd+args,env=env,stdout=f,check=True,timeout=90)
 with dest.open('rb') as f:h=hashlib.file_digest(f,'sha256').hexdigest()
 report['private_records'][name]={'bytes':dest.stat().st_size,'sha256':h}
keep('authority-stopped.tar.gz',['tar','-C','/var/tmp','-czf','-','rockstaros-preview-authority'])
keep('userdata.ext4',['cat','/var/tmp/rock-star-desktop/preview/userdata.ext4'])
keep('desktop-records.tar.gz',['tar','-C','/var/tmp/rock-star-desktop','-czf','-','preview/sessions','preview/device.json','preview/running.json'])
Path('work/github-smoke1-preserved.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
