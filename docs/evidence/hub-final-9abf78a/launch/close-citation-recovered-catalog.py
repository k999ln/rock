#!/usr/bin/env python3
import hashlib,importlib.util,json,os,select,signal,socket,sys,time,traceback
from datetime import datetime,timezone
from pathlib import Path
os.umask(0o077);os.environ['PATH']='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
base=Path('/var/tmp/rock-final-9abf78a/systems/rock-star-os');failed=Path('/var/tmp/rock-final-c-9abf78a-continuation-03/citations');out=Path('/var/tmp/rock-final-c-equivocation-recovery-normal-close-04');out.mkdir(mode=0o700,exist_ok=False)
sys.path[:0]=[str(base/'os/desktop'),str(base/'os'),str(base/'src')]
spec=importlib.util.spec_from_file_location('close_update_business',base/'os/desktop/verify-business.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
import game_authority_observer as authority
config=json.loads(Path('/var/tmp/rock-release-os-20260910/final-9abf78a-empty-authority/root-c-device.json').read_bytes());prior=json.loads((failed/'1/report.json').read_bytes());summary={'services':[dict(json.loads(Path('/var/tmp/rock-final-c-equivocation-recovery-normal-close-02/reused-registry.json').read_bytes()),label='registry')]};record=json.loads((failed/'1/owned-record.json').read_bytes())
assert prior['status']=='FAIL' and prior['owned_device_running'] is True and "label='remote-tool-search'" in prior['traceback']
assert not any(v['phrase']=='この内容の送信に同意して実行' for v in prior['ui_states'])
assert b.guest.running(record)
limits=b.contract.plan('lifecycle')['limits'];report={'schema':'rock-original-citation-failed-boot-normal-close/1','status':'RUNNING','started_utc':datetime.now(timezone.utc).isoformat(),'input_events':[],'screenshots':[],'qmp_events':[],'qmp_commands':[],'ui_states':[],'original_ui_status':'FAIL_RETAINED','new_execution_or_financial_input':False,'recovery_inputs':'No repeated refresh. Prior actual frame shows signed catalog restored; tiny label OCR timed out and remains FAIL. Canonical search label and normal shutdown only here.' }
b.guest.save(out/'plan.json',{'source_commit':'9abf78a80d27aa9f847c4051d20e4c552e407276','action':'Original clean_shutdown only, closed guest/authority readback, then exact owned registry/runner SIGTERM','failed_report_sha256':hashlib.sha256((failed/'1/report.json').read_bytes()).hexdigest(),'expected_new_power_receipts':1,'repeat_job_purchase_or_charge':False})
sampler=monitor=None
try:
 sampler=b.ResourceSampler(record,limits);sampler.start();monitor=b.power.Monitor(record['qmp_socket'],report);driver=b.ScreenDriver(monitor,out,report,record,sampler,limits);driver.booting=False
 driver.wait('ツール名・説明・IDで検索',label='recovered-hub-normal-close')
 report['normal_shutdown_seconds']=b.clean_shutdown(driver,record);sampler.stop()
 observer=authority.Observer(base/'os/game_exchange/sandbox.py',Path(config['game']['config']),config['game']['authority_id'],out)
 observer.invoke('stop');after=observer.invoke('snapshot');authority.unchanged(json.loads((failed/'authority-before.json').read_bytes()),after);b.guest.save(out/'authority-after.json',after)
 profile=b.retention.retention_profile(config)
 with b.closed_device(config,record) as data:
  state,rows,powers=b.retention.business_snapshot(data,profile);b.guest.save(out/'guest-state.json',state);b.guest.save(out/'guest-rows.json',rows);b.guest.save(out/'power-after.json',powers)
  report['power_boot_id']=b.verify_power(json.loads((failed/'baseline/power-rows.json').read_bytes()),powers,report['qmp_events'])
  from contextlib import closing
  import sqlite3
  from game_exchange.current_restore import snapshot
  comparison={}
  for role,(path,_) in profile['sources'].items():
   target=out/(role+'.sqlite3');b.power.export_closed_database(data,path,target);target.chmod(0o600)
   with closing(sqlite3.connect(target.as_uri()+'?mode=ro&immutable=1',uri=True)) as db:comparison[role]=snapshot(db)
  before=json.loads((failed/'baseline/device-snapshot.json').read_bytes())
  for role in set(before)-{'hub','power','wallet_cache'}:assert comparison[role]==before[role],role
  import wallet_cache_retention
  wallet_cache_retention.compare(before['wallet_cache'],state['wallet_cache'])
  oldjobs=next(t for t in before['hub']['tables'] if t['name']=='hub_jobs');newjobs=next(t for t in comparison['hub']['tables'] if t['name']=='hub_jobs');assert oldjobs==newjobs
  assert next(t for t in comparison['remote']['tables'] if t['name']=='remote_jobs')['row_count']==0
  report['retention']='ALL_AUTHORITY_EXACT; nonHub/remote unchanged; wallet typed read-only policy; all previous Hub jobs unchanged; expected Hub catalog refresh and one power receipt only'
 stops=[]
 for service in summary['services']:
  if service['label'] not in ('registry','runner-1'):continue
  pid=service['pid'];proc=Path('/proc')/str(pid);fd=os.pidfd_open(pid)
  try:
   cmd=(proc/'cmdline').read_bytes().rstrip(b'\0').decode().split('\0');assert cmd==service['argv'];assert Path(os.readlink(proc/'cwd'))==base
   fields=(proc/'stat').read_text().rsplit(')',1)[1].split();ticks=int(fields[19]);btime=next(int(l.split()[1]) for l in Path('/proc/stat').read_text().splitlines() if l.startswith('btime '));assert str(Path('/var/tmp/rock-final-c-9abf78a-continuation-02/citations/registry')) in cmd
   signal.pidfd_send_signal(fd,signal.SIGTERM);poll=select.poll();poll.register(fd,select.POLLIN);assert poll.poll(10000)
   stops.append({'label':service['label'],'pid':pid,'argv':cmd,'start_ticks':ticks,'signal':'SIGTERM','exit_observed':True,'exit_code':None,'scope':'Owned orphan fixture; no child exit status available to this new parent'})
  finally:os.close(fd)
 b.guest.save(out/'owned-services-stopped.json',stops)
 report['port_bind_check']='DEFERRED_READ_ONLY_BOUNDARY_AFTER_TIME_WAIT'; report['prior_error']='RegistryError: same-revision index equivocation rejected'
 report['status']='PASS_NORMAL_CLOSE_AND_RETAINED_STATE_ORIGINAL_UI_FAIL'
except Exception as e:report.update(status='FAIL',error=repr(e),traceback=traceback.format_exc());raise
finally:
 if sampler:sampler.stop()
 if monitor:monitor.close()
 report['owned_device_running']=b.guest.running(record);report['finished_utc']=datetime.now(timezone.utc).isoformat();b.guest.save(out/'report.json',report);print(json.dumps({k:report.get(k) for k in ('status','error','power_boot_id','normal_shutdown_seconds','owned_device_running')}))
