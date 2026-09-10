import datetime,hashlib,json,os,pathlib,subprocess,sys
P=pathlib.Path
base=P('/var/tmp/rock-release-os-20260910'); source=P('/var/tmp/rock-final-9abf78a'); probe=P('/var/tmp/rock-d3-observer-review-1135'); images=P('/var/tmp/rock-final-9abf78a-profile'); out=base/'final-9abf78a-hub-continuation'
def sha(p):
 with P(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def read(p):return json.loads(P(p).read_text())
def save(n,d):(out/n).write_text(json.dumps(d,indent=2,sort_keys=True)+'\n')
os.umask(0o077); f=read(images/'freeze-manifest.json'); pre=read(base/'d3-inventory-probe-1135/report.json'); overlay=pre['probe_exact_overlay_unchanged']; old=base/'final-9abf78a-d1-d3'
def guard():
 assert all(sha(source/n)==h for n,h in f['source_files_sha256'].items())
 assert {n:sha(probe/n) for n,h in f['source_files_sha256'].items() if sha(probe/n)!=h}==overlay
 assert {p.relative_to(probe).as_posix() for p in probe.rglob('*') if p.is_file()}==set(f['source_files_sha256'])
 assert all(sha(images/n)==h for n,h in f['files_sha256'].items())
guard()
assert pre['status']=='PASS_OBSERVER_PREFLIGHT_ONLY' and pre['tests']==24
r1=read(old/'report.json');r2=read(old/'nonfinancial/report.json');failed=P(r2['gates'][-1]['evidence'])/'report.json'
assert r1['status']==r2['status']==read(failed)['status']=='FAIL' and read(failed)['cases']==[]
reused=r1['gates'][:3]+r2['gates'][:3]
assert [r['name'] for r in reused]==['boot','system','isolation','store','remote','negative']
for r in reused:assert r['status']=='PASS_SCOPED' and r['report_sha256']==sha(P(r['evidence'])/'report.json')
assert sum(r['boots'] for r in reused)==10
cmd=[sys.executable,'-B',str(probe/'systems/rock-star-os/os/verify-hub-faults.py'),'--images',str(images),'--output',str(out),'--scope','game-isolation']
if not out.exists():
 out.mkdir(mode=0o700)
 plan={'schema':'rock-final-hub-continuation/1','source_commit':f['source_commit'],'probe_commit':'7e9dcc9e4dafb686f344a790482892c489699757','overlay':overlay,'helper_sha256':sha(probe/'systems/rock-star-os/os/desktop/image_inventory.py'),'freeze_sha256':sha(images/'freeze-manifest.json'),'image_sha256':f['files_sha256'],'preflight_report_sha256':sha(base/'d3-inventory-probe-1135/report.json'),'original_whole_runs':[{ 'path':str(p),'sha256':sha(p),'status':'FAIL_RETAINED'} for p in (old/'report.json',old/'nonfinancial/report.json',failed)],'reused_completed_gates':reused,'reused_boots':10,'new_boots':3,'required_total_boots':13,'command':cmd,'limits':{'boots':3,'per_boot_seconds':240,'capture_seconds':4,'Hub_deadline_seconds':3,'prearm_seconds':2,'runtime_paths':20000,'runtime_bytes':2*1024**3},'guest_fixture_sha256':sha(probe/'systems/rock-star-os/os/platform/hub_fault_fixture.py'),'financial':'NOT_RUN; authority complete typed state must remain exactly unchanged','prepared_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'driver_sha256':sha(__file__)};save('plan.json',plan)
else:
 plan=read(out/'plan.json');assert plan['command']==cmd and plan['overlay']==overlay and plan['driver_sha256']==sha(__file__)
if '--execute' not in sys.argv:print(json.dumps({'status':'PREPARED_NOT_STARTED','plan':str(out/'plan.json'),'sha256':sha(out/'plan.json')}));sys.exit(0)
assert not (out/'report.json').exists(); report={'schema':'rock-final-hub-continuation/1','status':'RUNNING','plan_sha256':sha(out/'plan.json'),'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()};save('report.json',report)
try:
 with (out/'hubfaults.log').open('wb') as log:r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
 report['exit_code']=r.returncode;report['log_sha256']=sha(out/'hubfaults.log');assert r.returncode==0,'new Hub gate failed'
 folders=list(out.glob('hub-fault-*'));assert len(folders)==1;folder=folders[0];inner=read(folder/'report.json')
 assert inner['status']=='PASS_SCOPED' and len(inner['cases'])==3 and all(c['status']=='PASS' for c in inner['cases'])
 assert inner['game_authority_retention']['authority']=='ALL_TYPED_STATE_IDENTICAL_STOPPED'
 guard()
 for old_report in plan['original_whole_runs']:assert sha(old_report['path'])==old_report['sha256'] and read(old_report['path'])['status']=='FAIL'
 report.update(status='PASS_SCOPED',evidence=str(folder),inner_report_sha256=sha(folder/'report.json'),boots=13,new_boots=3,reused_boots=10,reused_completed_gates=reused,new_hub_report=inner,original_whole_runs='FAIL_RETAINED',source_images_unchanged=True)
except BaseException as e:report.update(status='FAIL',error=repr(e));raise
finally:
 report['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save('report.json',report);print(json.dumps({'status':report['status'],'report':str(out/'report.json'),'sha256':sha(out/'report.json')}),flush=True)
