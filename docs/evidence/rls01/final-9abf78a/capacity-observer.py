"""Read-only real capacity gates around the default sixteen-GiB lifecycle."""
import argparse,json,os,shutil,subprocess,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--phase',required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--host-only',action='store_true');p.add_argument('--minimum-guest-free-gib',type=int,default=0);a=p.parse_args()
assert not a.output.exists()
root=Path('/Users/kaiya/Library/RockstarOS/rls01-final1');usage=shutil.disk_usage(root.parent)
r={'schema':'rock-final-capacity-observation/1','phase':a.phase,'observed_unix':time.time(),'default_vm_disk_gib':16,'host':{'total':usage.total,'used':usage.used,'free':usage.free},'minimum_guest_free_bytes':a.minimum_guest_free_gib*1024**3,'status':'PASS'}
if not a.host_only:
 code="""import json,os,shutil,stat
from pathlib import Path
u=shutil.disk_usage('/var/tmp');sizes={}
for path in map(Path,('/opt/rockstaros-preview','/var/tmp/rock-star-desktop','/var/tmp/rockstaros-preview-authority','/var/tmp/rockstaros-preview-backups')):
 total=allocated=count=0
 if path.exists():
  for item in path.rglob('*'):
   s=item.lstat()
   if stat.S_ISREG(s.st_mode):total+=s.st_size;allocated+=s.st_blocks*512;count+=1
 sizes[str(path)]={'regular_files':count,'logical_bytes':total,'allocated_bytes':allocated}
print(json.dumps({'total':u.total,'used':u.used,'free':u.free,'trees':sizes}))
"""
 result=subprocess.run(['limactl','shell','--workdir','/','os','python3','-B','-c',code],env=dict(os.environ,LIMA_HOME=str(root/'lima')),capture_output=True,text=True,timeout=45,check=True)
 r['guest']=json.loads(result.stdout)
 if r['guest']['free']<r['minimum_guest_free_bytes']:r['status']='INSUFFICIENT_SPACE_STOP_BEFORE_NEXT_MUTATION'
a.output.write_text(json.dumps(r,sort_keys=True,indent=2)+'\n');print(json.dumps(r,sort_keys=True));assert r['status']=='PASS','do not change the default disk size or delete data to continue silently'
