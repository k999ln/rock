import datetime,hashlib,json,os,pathlib,subprocess,sys
P=pathlib.Path
base=P('/var/tmp/rock-release-os-20260910'); out=base/'d3-inventory-probe-1135'; source=P('/var/tmp/rock-final-9abf78a'); probe=P('/var/tmp/rock-d3-observer-review-1135'); images=P('/var/tmp/rock-final-9abf78a-profile')
os.umask(0o022); out.mkdir(mode=0o700)
def sha(p):
 with P(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def read(p):return json.loads(P(p).read_text())
def save(n,d):(out/n).write_text(json.dumps(d,indent=2,sort_keys=True)+'\n')
f=read(images/'freeze-manifest.json'); allowed={'systems/rock-star-os/os/verify-hub-faults.py','systems/rock-star-os/tests/test_os_hub_fault_evidence.py'}
def guard():
 assert all(sha(source/n)==h for n,h in f['source_files_sha256'].items())
 changed={n for n,h in f['source_files_sha256'].items() if sha(probe/n)!=h};assert changed==allowed,changed
 assert {p.relative_to(probe).as_posix() for p in probe.rglob('*') if p.is_file()}==set(f['source_files_sha256'])
 assert all(sha(images/n)==h for n,h in f['files_sha256'].items())
 return {n:sha(probe/n) for n in sorted(allowed)}
overlay=guard(); native=probe/'systems/rock-star-os'
plan={'schema':'rock-hub-inventory-observer-probe/1','source_commit':f['source_commit'],'observer_commit':'7e9dcc9','overlay':overlay,'frozen_image_sha256':f['files_sha256'],'freeze_sha256':sha(images/'freeze-manifest.json'),'helper_sha256':sha(native/'os/desktop/image_inventory.py'),'old_manifest':'content/modes/symlink target string; UID/GID not attested','new_manifest':'same PREFIXES/max20000 plus UID/GID and symlink target size/SHA; existing entry exact equality and additions3 unchanged','original_preflight_fail':str(base/'final-9abf78a-d1-d3/nonfinancial/hub-fault-mov_i28m/report.json'),'actual_guest':'NOT_RUN_PREFLIGHT_ONLY','fixed_guest_limits':{'boots':3,'per_boot_seconds':240,'Hub_deadline_seconds':3},'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()};save('plan.json',plan)
env=dict(os.environ,PYTHONPATH=str(native/'src')+':'+str(native/'os'),PYTHONDONTWRITEBYTECODE='1');reports=[]
for name in ('test_os_hub_fault_evidence','test_os_image_inventory'):
 with (out/(name+'.log')).open('wb') as log:r=subprocess.run([sys.executable,'-B','-m','unittest','discover','-s',str(native/'tests'),'-p',name+'.py','-v'],env=env,stdout=log,stderr=subprocess.STDOUT)
 assert r.returncode==0,name
 reports.append({'name':name,'log_sha256':sha(out/(name+'.log'))})
with (out/'preflight.log').open('wb') as log:r=subprocess.run([sys.executable,'-B',str(native/'os/verify-hub-faults.py'),'--images',str(images),'--output',str(out),'--scope','game-isolation','--preflight-only'],env=env,stdout=log,stderr=subprocess.STDOUT)
assert r.returncode==0,'preflight failed'
folders=list(out.glob('hub-fault-*'));assert len(folders)==1; folder=folders[0]; result=read(folder/'report.json'); manifest=read(folder/'original-runtime-manifest.json')
assert result['status']=='PREFLIGHT_ONLY' and result['cases']==[] and result['original_images_unchanged'] and result['all_existing_runtime_files_unchanged']
assert all(manifest['etc/rock-wallet/'+name]['uid']==manifest['etc/rock-wallet/'+name]['gid']==1003 and manifest['etc/rock-wallet/'+name]['mode']==0o600 for name in ('backend.json','backend-token'))
assert not any(p.endswith('/verify-hub-faults.py') or p.endswith('/image_inventory.py') for p in manifest)
assert guard()==overlay
report={'schema':'rock-hub-inventory-observer-probe/1','status':'PASS_OBSERVER_PREFLIGHT_ONLY','plan_sha256':sha(out/'plan.json'),'regressions':reports,'tests':24,'preflight_report':str(folder/'report.json'),'preflight_report_sha256':sha(folder/'report.json'),'private_wallet_file_metadata_attested':True,'runtime_manifest_paths':len(manifest),'runtime_manifest_sha256':sha(folder/'original-runtime-manifest.json'),'production_host_observers_absent_from_runtime':True,'original_source_files_unchanged':len(f['source_files_sha256']),'probe_exact_overlay_unchanged':overlay,'original_triple_unchanged':True,'finished_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()};save('report.json',report);print(json.dumps(report),flush=True)
