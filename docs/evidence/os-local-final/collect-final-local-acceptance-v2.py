import argparse,datetime,hashlib,json,os,pathlib,socket,sys
P=pathlib.Path
def sha(p):
    with P(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def read(p):return json.loads(P(p).read_text())
q=argparse.ArgumentParser()
for n in ('source','images','d4','d2','d1d3','hub','prepared','output'):q.add_argument('--'+n,type=P,required=True)
a=q.parse_args();os.umask(0o077);assert not a.output.exists()
frozen=read(a.images/'freeze-manifest.json');source=frozen['source_commit']
assert source=='9abf78a80d27aa9f847c4051d20e4c552e407276'
assert all(sha(a.source/n)==h for n,h in frozen['source_files_sha256'].items())
assert all(sha(a.images/n)==h for n,h in frozen['files_sha256'].items())
native=a.source/'systems/rock-star-os';sys.path[:0]=[str(native/'src'),str(native/'os'),str(native/'os/desktop')]
from game_exchange import sandbox,profile
import guest,game_authority_observer as authority,business_contract
d4=read(a.d4/'report.json');d2=read(a.d2/'report.json');d13=read(a.d1d3/'report.json')
assert d4['status']=='PASS_SCOPED' and (d4['boots'],d4['new_boots'],d4['reused_boots'])==(41,31,10)
assert d4['original_whole_run_status']=='FAIL_RETAINED' and len(d4['checks'])==5 and all(c['status']=='PASS' for c in d4['checks'])
assert d4['plan_sha256']==sha(a.d4/'plan.json')
assert d2['status']=='PASS_SCOPED' and len(d2['cycles'])==2
assert d2['D2']['reinstall_after_delete']=={'status':'PASS','operations':16,'jobs':5}
assert all(c['clean_exit'] and c['retention_verified'] and c['authority_retention']=='PASS_ALL_DECLARED_DATABASES_AND_IDENTITIES' for c in d2['cycles'])
assert d2['plan_sha256']==business_contract.hashed(read(a.d2/'plan.json'))
assert d13['status']=='FAIL' and len(d13['gates'])==4
hub=read(a.hub/'report.json');hp=read(a.hub/'plan.json')
assert hub['status']=='PASS_SCOPED' and (hub['boots'],hub['new_boots'],hub['reused_boots'])==(13,3,10)
assert hub['plan_sha256']==sha(a.hub/'plan.json') and hub['original_whole_runs']=='FAIL_RETAINED' and hub['source_images_unchanged']
for r in hp['original_whole_runs']:
    assert r['sha256']==sha(r['path']) and read(r['path'])['status']=='FAIL'
assert len(hub['reused_completed_gates'])==6 and sum(r['boots'] for r in hub['reused_completed_gates'])==10
for r in hub['reused_completed_gates']:
    assert r['status']=='PASS_SCOPED' and r['report_sha256']==sha(P(r['evidence'])/'report.json')
assert hub['inner_report_sha256']==sha(P(hub['evidence'])/'report.json')
assert len(hub['new_hub_report']['cases'])==3 and all(c['status']=='PASS' for c in hub['new_hub_report']['cases'])
assert hub['new_hub_report']['game_authority_retention']['authority']=='ALL_TYPED_STATE_IDENTICAL_STOPPED'
for n,h in hp['overlay'].items():assert sha(P('/var/tmp/rock-d3-observer-review-1135')/n)==h
assert d13['plan_sha256']==sha(a.d1d3/'plan.json')
prepared=read(a.prepared/'report.json');config=sandbox.load(P(prepared['sandbox_config']));snapshot=sandbox.snapshot(config)
authority.validate(snapshot,config['authority_id']);empty=authority.empty_baseline(snapshot);authority.unchanged(read(a.prepared/'snapshot.json'),snapshot)
c_path=P(prepared['root_c_device_config']);c=read(c_path);guest.validate_config(c);profile.verified(c)
assert not (guest.BASE/c['name']).exists(),'root C device must remain completely fresh'
for proc in P('/proc').iterdir():
    if proc.name.isdigit():
        try:cmd=(proc/'cmdline').read_bytes()
        except (FileNotFoundError,PermissionError,ProcessLookupError):continue
        assert b'qemu-system-aarch64\0' not in cmd,'QEMU still running'
for port in (9443,9444,9641,9642,9643):
    with socket.socket() as s:s.bind(('127.0.0.1',port))
def evidence(path,report):
    return {'directory':str(path),'report_sha256':sha(path/'report.json'),'plan_raw_sha256':sha(path/'plan.json'),'report':report}
summary={'schema':'rock-final-local-os-acceptance/2','status':'PASS_SCOPED_LOCAL_D1_D2_HUB_D3_NONFINANCIAL_D4','observed_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_commit':source,'freeze_sha256':sha(a.images/'freeze-manifest.json'),'profile_sha256':sha(a.images/'profile.json'),'image_sha256':frozen['files_sha256'],'source_files_verified_unchanged':len(frozen['source_files_sha256']),'build_and_guest_host':{'system':os.uname().sysname,'release':os.uname().release,'architecture':os.uname().machine,'uid':os.geteuid(),'gid':os.getegid()},'D4':evidence(a.d4,d4),'D2_Hub':evidence(a.d2,{'status':d2['status'],'D2':d2['D2'],'normal_boots':len(d2['cycles']),'plan_canonical_sha256':d2['plan_sha256'],'authority_retention':[c['authority_retention'] for c in d2['cycles']]}),'D1_D3_original':evidence(a.d1d3,d13),'D1_D3_coverage':evidence(a.hub,hub),'handoff':{'authority_state':'EMPTY_STOPPED_EXACTLY_UNCHANGED','empty':empty,'baseline_sha256':sha(a.prepared/'snapshot.json'),'current_snapshot_canonical_sha256':hashlib.sha256(json.dumps(snapshot,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'root_c_config':str(c_path),'root_c_config_sha256':sha(c_path),'root_c_device_name':c['name'],'root_c_device_directory_absent':True,'qemu_processes':0,'ports_free':[9443,9444,9641,9642,9643]},'other_acceptance':'root native Game/Wallet/PC/demo, remote D6 and B D5/SDK remain separate evidence; no whole-product acceptance inferred','original_failures':'original D4 and D1/D3 whole run failures, Hub preflight failure, and local ARM64 native regression failure retained; source-regression admission uses exact original x86_64 CI report','collector_sha256':sha(__file__)}
a.output.mkdir(mode=0o700);(a.output/'authority-handoff.json').write_text(json.dumps(snapshot,indent=2)+'\n');(a.output/'report.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':summary['status'],'report_sha256':sha(a.output/'report.json'),'handoff':summary['handoff']},ensure_ascii=False),flush=True)
