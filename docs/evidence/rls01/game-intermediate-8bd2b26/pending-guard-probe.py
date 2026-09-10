import json,os,subprocess
from pathlib import Path
root=Path('/Users/kaiya/Library/RockstarOS/rls01-game1');env=dict(os.environ,LIMA_HOME=str(root/'lima'))
record=json.loads((root/'installation.json').read_text());intent=record['pending_restore']['intent']
base=['limactl','shell','--workdir','/','os']; native='/opt/rockstaros-preview/native'
def run(args,**kw):return subprocess.run(args,capture_output=True,text=True,timeout=35,**kw)
observed=[]
a=run(['python3','work/preview-game1/preview.py','start','--directory',str(root)])
assert a.returncode and 'restore is pending' in a.stderr
observed.append({'guard':'host start','returncode':a.returncode,'error':a.stderr.strip().splitlines()[-1]})
a=run(base+['python3','-B',native+'/os/game_exchange/sandbox.py','start','--config','/var/tmp/rockstaros-preview-authority/sandbox.json'],env=env)
assert a.returncode and 'incomplete' in a.stderr
observed.append({'guard':'authority start','returncode':a.returncode,'error':a.stderr.strip().splitlines()[-1]})
config=run(base+['cat','/var/tmp/rock-star-desktop/preview/device.json'],env=env);config.check_returncode()
a=run(base+['python3','-B',native+'/os/desktop/guest.py','start'],input=config.stdout,env=env)
assert a.returncode and 'incomplete' in a.stderr
observed.append({'guard':'source OS start','returncode':a.returncode,'error':a.stderr.strip().splitlines()[-1]})
code="""import json
from pathlib import Path
s=Path('/var/tmp/rockstaros-preview-authority')
g=json.loads((s/'desktop-restore.json').read_text());r=json.loads((s/'restores'/('INTENT.json')).read_text())
print(json.dumps({'gate':g,'authority_journal_state':r['state'],'authority_receipt':r['receipt'],'partial_disk_bytes':Path('/var/tmp/rock-star-desktop/recovered/slot-a.ext4').stat().st_size}))
""".replace('INTENT',intent)
a=run(base+['python3','-c',code],env=env);a.check_returncode();state=json.loads(a.stdout)
assert state['gate']['state']=='PENDING' and state['authority_journal_state']=='DONE' and state['partial_disk_bytes']==16*1024*1024
report={'schema':'rock-rls01-game-pending-guards/1','status':'PASS','guards':observed,'state':state}
Path('work/game1-pending-guards.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'status':'PASS','guards':observed,'authority_state':state['authority_journal_state'],'gate':state['gate'],'partial_bytes':state['partial_disk_bytes']}))
