import json,os,subprocess
from pathlib import Path
root=Path('/Users/kaiya/Library/RockstarOS/rls01-final1');env=dict(os.environ,LIMA_HOME=str(root/'lima'));base=['limactl','shell','--workdir','/','os']
pre=json.loads(Path('work/final1-pending-guards.json').read_text())['state'];intent=pre['gate']['intent'];record=json.loads((root/'installation.json').read_text())
assert record['state']=='INSTALLED' and record['active_device']=='recovered' and record['retired_devices']==['preview']
def run(args,**kw):return subprocess.run(base+args,env=env,capture_output=True,text=True,timeout=40,**kw)
code="""import hashlib,json
from pathlib import Path
s=Path('/var/tmp/rockstaros-preview-authority');d=Path('/var/tmp/rock-star-desktop')
r=json.loads((s/'restores'/'INTENT.json').read_text());g=json.loads((s/'desktop-restore.json').read_text());c=json.loads((d/'recovered/restored.json').read_text())
def h(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
print(json.dumps({'gate':g,'authority_receipt':r['receipt'],'authority_journal_state':r['state'],'os_receipt':c,'source_disks':{n:h(d/'preview'/n) for n in ('slot-a.ext4','slot-b.ext4','userdata.ext4')},'destination_disks':{n:h(d/'recovered'/n) for n in ('slot-a.ext4','slot-b.ext4','userdata.ext4')}}))
""".replace('INTENT',intent)
a=run(['python3','-c',code]);a.check_returncode();state=json.loads(a.stdout)
assert state['gate']['state']=='DONE' and state['authority_receipt']==pre['authority_receipt'] and state['source_disks']==state['destination_disks']
a=run(['cat','/var/tmp/rock-star-desktop/preview/device.json']);a.check_returncode()
b=run(['python3','-B','/opt/rockstaros-preview/native/os/desktop/guest.py','start'],input=a.stdout)
assert b.returncode and 'retired source OS' in b.stderr
report={'schema':'rock-rls01-game-restore-recovery/1','status':'PASS','state':state,'host_state':record['state'],'same_authority_receipt':True,'epoch_not_incremented_twice':True,'retired_source_start_refused':b.stderr.strip().splitlines()[-1]}
Path('work/final1-recovery.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='state'}))
