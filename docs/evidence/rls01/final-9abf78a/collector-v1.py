import hashlib,importlib.util,json,os,stat,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
base=Path('/Users/kaiya/Library/RockstarOS/rls01-final1');out=Path('work/final1-private-originals');out.mkdir(mode=0o700)
spec=importlib.util.spec_from_file_location('p',Path('work/preview-final1-download/preview.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
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
  f.chmod(0o600);subprocess.run(cmd+args,env=env,stdout=f,check=True,timeout=90)
 with dest.open('rb') as f:h=hashlib.file_digest(f,'sha256').hexdigest()
 report['private_records'][name]={'bytes':dest.stat().st_size,'sha256':h}
keep('authority-stopped.tar.gz',['tar','-C','/var/tmp','-czf','-','rockstaros-preview-authority'])
keep('recovered-userdata.ext4',['cat','/var/tmp/rock-star-desktop/recovered/userdata.ext4'])
keep('desktop-records.tar.gz',['tar','-C','/var/tmp/rock-star-desktop','-czf','-','preview/sessions','preview/device.json','preview/running.json','recovered/sessions','recovered/device.json','recovered/running.json','recovered/restored.json'])
backup=Path('/Users/kaiya/Library/RockstarOS/rls01-final1-backup');raw=(backup/'backup.json').read_bytes();saved=json.loads(raw);p.validate_game_inventory(saved)
expected=set(saved['files'])|{'backup.json'};actual={str(f.relative_to(backup)) for f in backup.rglob('*') if f.is_file()};assert actual==expected
for name,r in saved['files'].items():
 f=backup/name;assert f.stat().st_size==r['bytes'] and p.digest(f)==r['sha256']
report['off_vm_export']={'status':'PASS','files':len(saved['files']),'data_bytes':sum(f['bytes'] for f in saved['files'].values()),'backup_manifest_sha256':hashlib.sha256(raw).hexdigest(),'complete_file_inventory':{k:{f:r[f] for f in ('bytes','sha256')} for k,r in saved['files'].items()}}
Path('work/final1-preserved-originals.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='off_vm_export'},indent=2))
