#!/usr/bin/env python3
"""Read-only after successful C sequence: bind original files and closed state."""
import argparse,hashlib,json,os,stat,subprocess,sys
from datetime import datetime,timezone
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--config',type=Path,required=True);p.add_argument('--record',type=Path,required=True);args=p.parse_args()
assert not args.record.exists()
os.umask(0o077);os.environ['PATH']='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
source=args.source.resolve(strict=True);root=args.output.resolve(strict=True);config=json.loads(args.config.read_bytes());images=Path(config['images'])
freeze=images/'freeze-manifest.json'
def sha(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
assert sha(freeze)=='d258a303794a3a16bbec792807bc39427fa3bf3ea3c3d86492be07948f1736fc'
f=json.loads(freeze.read_bytes());assert f['source_commit']=='9abf78a80d27aa9f847c4051d20e4c552e407276'
for name,digest in f['source_files_sha256'].items():assert sha(source.parent.parent/name)==digest,name
for name,digest in f['files_sha256'].items():assert sha(images/name)==digest,name
report=json.loads((root/'orchestration.json').read_bytes());assert report['status']=='PASS_REMAINING_UI_SEQUENCE_DEMO_ENCODING_AND_VISUAL_REVIEW_PENDING'
assert [s['stage'] for s in report['stages']]==['citations','demo']
previous_root=Path('/var/tmp/rock-final-c-9abf78a-01');previous=json.loads((previous_root/'orchestration.json').read_bytes())
assert sha(previous_root/'orchestration.json')==report['previous_orchestration_sha256']=='31c6be06bf1ebe9c7bb992b95ff5ab171e4019692da7f928433b52f32e2a893d'
assert previous['status']=='FAIL_ORIGINAL_STAGE_RETAINED'
assert report['reused_complete_stages']==previous['stages'][:3]
assert [(s['stage'],s['status']) for s in previous['stages']]==[('game','PASS'),('audit','PASS'),('financial','PASS'),('citations','FAIL'),('demo','NOT_RUN')]
for stage in previous['stages'][:4]:assert sha(previous_root/(stage['stage']+'.log'))==stage['log_sha256']
assert all(s['status']=='PASS' and s['exit_code']==0 for s in report['stages'])
for stage in report['stages']:assert sha(root/(stage['stage']+'.log'))==stage['log_sha256']
assert sha(root/'demo-stopped-retention.json')==report['demo_stopped_retention_sha256']
ret=json.loads((root/'demo-stopped-retention.json').read_bytes());assert ret['status']=='PASS'
for rel,digest in ret['inputs_sha256'].items():assert sha(root/rel)==digest
sys.path[:0]=[str(source/'os/desktop'),str(source/'os'),str(source/'src')]
import guest
from game_exchange import sandbox
record=json.loads((guest.BASE/config['name']/'running.json').read_bytes());assert not guest.running(record)
sc=sandbox.load(Path(config['game']['config']));authority=sandbox.status(sc);assert authority['running'] is False
qemu=[]
for proc in Path('/proc').iterdir():
 if not proc.name.isdigit():continue
 try: cmd=(proc/'cmdline').read_bytes().split(b'\0')
 except (FileNotFoundError,PermissionError,ProcessLookupError):continue
 if cmd and Path(os.fsdecode(cmd[0])).name.startswith('qemu-system-'):qemu.append(int(proc.name))
assert not qemu,qemu
cycles=[]
for base,stage,count in [(previous_root,'game',2),(previous_root,'financial',2),(root,'citations',3),(root,'demo',1)]:
 for number in range(1,count+1):
  folder=base/stage/str(number) if stage!='demo' else base/stage
  raw=json.loads((folder/'report.json').read_bytes());assert raw['status'].startswith('PASS') and raw['owned_device_running'] is False
  events=[e for e in raw['qmp_events'] if e.get('event') in ('RESET','SHUTDOWN')];assert len(events)==1 and events[0]['event']=='SHUTDOWN' and events[0]['data']['guest'] is True
  if stage=='demo':
   import importlib.util
   spec=importlib.util.spec_from_file_location('final_collector_business',source/'os/desktop/verify-business.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
   boot_id=b.verify_power(json.loads((folder/'power-before.json').read_bytes()),json.loads((folder/'power-after.json').read_bytes()),raw['qmp_events'])
  else:boot_id=raw['power_boot_id']
  cycles.append({'stage':stage,'cycle':number,'power_boot_id':boot_id,'normal_shutdown_seconds':raw['normal_shutdown_seconds'],'guest_SHUTDOWN':events[0],'report_sha256':sha(folder/'report.json')})
assert len(cycles)==8 and len({c['power_boot_id'] for c in cycles})==8
failed_boots=[]
for failed_tree,close in [('/var/tmp/rock-final-c-9abf78a-continuation-02','/var/tmp/rock-final-c-update-failure-normal-close-01'),('/var/tmp/rock-final-c-9abf78a-continuation-03','/var/tmp/rock-final-c-equivocation-recovery-normal-close-04')]:
 original=json.loads((Path(failed_tree)/'citations/1/report.json').read_bytes());closed=json.loads((Path(close)/'report.json').read_bytes())
 assert original['status']=='FAIL' and original['owned_device_running'] is True
 assert closed['owned_device_running'] is False and closed['normal_shutdown_seconds']>0
 events=[e for e in closed['qmp_events'] if e.get('event') in ('RESET','SHUTDOWN')];assert len(events)==1 and events[0]['event']=='SHUTDOWN' and events[0]['data']['guest'] is True
 failed_boots.append({'original_report_sha256':sha(Path(failed_tree)/'citations/1/report.json'),'normal_close_report_sha256':sha(Path(close)/'report.json'),'power_boot_id':closed['power_boot_id'],'original_status':'FAIL_RETAINED','normal_shutdown_seconds':closed['normal_shutdown_seconds'],'scope':'Additional failed citation setup boot, zero remote requests; normal close separately verified'})
assert len({v['power_boot_id'] for v in cycles+failed_boots})==10
files=[]
for prefix,tree in [('original',previous_root),('continuation',root),('failed-v4',Path('/var/tmp/rock-final-c-9abf78a-continuation-02')),('failed-v5',Path('/var/tmp/rock-final-c-9abf78a-continuation-03')),('v4-normal-close',Path('/var/tmp/rock-final-c-update-failure-normal-close-01')),('v5-normal-close-attempt',Path('/var/tmp/rock-final-c-equivocation-normal-close-01')),('v5-recovery-attempt1',Path('/var/tmp/rock-final-c-equivocation-recovery-normal-close-02')),('v5-recovery-attempt2',Path('/var/tmp/rock-final-c-equivocation-recovery-normal-close-03')),('v5-normal-close',Path('/var/tmp/rock-final-c-equivocation-recovery-normal-close-04'))]:
 for path in sorted(tree.rglob('*')):
  info=path.lstat()
  if stat.S_ISDIR(info.st_mode):continue
  assert stat.S_ISREG(info.st_mode) and info.st_nlink==1,path
  files.append({'path':prefix+'/'+str(path.relative_to(tree)),'bytes':info.st_size,'mode':stat.S_IMODE(info.st_mode),'sha256':sha(path)})
result={'schema':'rock-final-c-original-evidence-inventory/1','status':'PASS_ORIGINAL_SEQUENCE_CLOSED_AND_BYTE_BOUND','observed_utc':datetime.now(timezone.utc).isoformat(),'source_commit':f['source_commit'],'source_files_verified':len(f['source_files_sha256']),'image_sha256':f['files_sha256'],'freeze_sha256':sha(freeze),'config_sha256':sha(args.config),'orchestration_sha256':sha(root/'orchestration.json'),'demo_retention_sha256':sha(root/'demo-stopped-retention.json'),'guest_running':False,'authority_running':False,'qemu_processes':qemu,'original_orchestration_status':'FAIL_RETAINED','reused_completed_stages':['game','audit','financial'],'new_completed_stages':['citations','demo'],'normal_cycles':cycles,'additional_failed_boots_normally_closed':failed_boots,'successful_ui_acceptance_boots':8,'total_physical_c_boots':10,'files':files,'regular_files':len(files),'total_bytes':sum(v['bytes'] for v in files),'collector_sha256':sha(Path(__file__)),'scope':'Original report/log/frame bytes and frozen inputs are bound here; C02 registry/runner state was deliberately reused by the final successful run and is inventoried at final collection time, not claimed to be the original failed-time database snapshot. Original failure-time exported baseline/report hashes remain distinct. No new UI, financial operation, cleanup, encoding or visual acceptance.'}
args.record.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');args.record.chmod(0o600)
print(json.dumps({k:v for k,v in result.items() if k not in ('files','normal_cycles')}))
