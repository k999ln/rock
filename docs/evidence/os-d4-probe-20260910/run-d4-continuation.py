#!/usr/bin/env python3
"""Sequential, fixed-image D4 orchestration; original verifier limits unchanged."""
import argparse,datetime,hashlib,importlib.util,inspect,json,os,pathlib,signal,subprocess,sys,time
P=pathlib.Path

def sha(p):
    with P(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def require(ok,msg):
    if not ok:raise RuntimeError(msg)
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')

def main():
    a=argparse.ArgumentParser();a.add_argument('--source',type=P,required=True);a.add_argument('--images',type=P,required=True);a.add_argument('--evidence',type=P,required=True);a.add_argument('--source-commit',required=True);a.add_argument('--probe-source',type=P,required=True);a.add_argument('--original-evidence',type=P,required=True);a.add_argument('--probe-proof',type=P,required=True);a.add_argument('--archive-readback',type=P,required=True);a.add_argument('--plan-only',action='store_true');x=a.parse_args()
    os.umask(0o077)
    source,images,evidence=x.source,x.images,x.evidence
    require(sys.platform=='linux' and source==source.resolve(strict=True) and images==images.resolve(strict=True),'canonical Linux source/images required')
    require(not evidence.exists() and evidence.parent==evidence.parent.resolve(strict=True),'fresh evidence directory required')
    frozen=json.loads((images/'freeze-manifest.json').read_text());require(frozen['source_commit']==x.source_commit and frozen['status']=='BUILD_COMPLETE_FROZEN' and frozen['profile_derivation']['status']=='DERIVATION_VERIFIED_FROZEN','same frozen Game source required')
    triple={n:sha(images/n) for n in ('Image','rootfs.ext4','stage0.cpio.gz')};require(triple==frozen['files_sha256'],'exact final triple required')
    def check_source():
        for name,expected in frozen['source_files_sha256'].items():
            relative=P(name);require(not relative.is_absolute() and '..' not in relative.parts,'relative frozen source path required')
            require(sha(source/relative)==expected,'frozen source changed: '+name)
    proof=json.loads(x.probe_proof.read_text())
    require(proof['status']=='PASS_SCOPED' and proof['candidate_source_commit']==x.source_commit and proof['candidate_source_unchanged'] is True and proof['candidate_images_unchanged'] is True,'pinned diagnostic overlay proof required')
    probe_expected=dict(frozen['source_files_sha256'])
    for n,v in proof['modified_existing_files'].items():
        require(probe_expected[n]==v['before_sha256'],'overlay original mismatch');probe_expected[n]=v['after_sha256']
    probe_expected.update(proof['new_test_file'])
    def check_probe():
        require({p.relative_to(x.probe_source).as_posix() for p in x.probe_source.rglob('*') if p.is_file()}==set(probe_expected),'unexpected probe file')
        require(all(sha(x.probe_source/n)==h for n,h in probe_expected.items()),'probe source changed')
    check_source();check_probe()
    original_path=x.original_evidence/'ui-startup/report.json'
    original=json.loads(original_path.read_text())
    require(original['status']=='FAIL' and original['original_images_unchanged'] is True and original['input_sha256_before']==triple and original['input_sha256_after']==triple,'original failed same-image run must be retained')
    archive=json.loads(x.archive_readback.read_text());require(archive['status']=='PASS_ALL_ORIGINAL_FILES_PRESERVED' and archive['verified_files']==85,'complete original archive preservation required')
    def load_validator(tree,name):
        p=tree/'systems/rock-star-os/os/update/verify-ui-startup.py';spec=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
    old_validator=load_validator(source,'original_startup_validator')
    new_validator=load_validator(x.probe_source,'probe_startup_validator')
    for name in ('validate_health','validate_state','validate_boot','validate_capture','boot'):
        require(inspect.getsource(getattr(old_validator,name))==inspect.getsource(getattr(new_validator,name)),'original acceptance assertion changed')
    reused=[]
    for case,expected in zip(original['cases'][:3],(('ready',2),('absent',4),('freeze',4)),strict=True):
        require((case['mode'],case['status'],len(case['boots']))==(expected[0],'PASS',expected[1]),'incomplete reusable original case')
        logs={}
        for boot in case['boots']:
            require(boot['status']=='PASS' and boot['passed'] is True and boot['exit_code']==0,'incomplete original boot')
            relative='ui-startup/'+case['mode']+'/'+boot['log'];p=x.original_evidence/relative
            require(sha(p)==archive['members'][relative]['sha256'],'original raw boot log changed')
            old_validator.validate_boot(p.read_text(errors='strict'),step=boot['step'],mode=case['mode']);logs[relative]=sha(p)
        reused.append({'case':case['mode'],'boots':expected[1],'status':'PASS_FROM_COMPLETE_ORIGINAL_CASE','raw_log_sha256':logs})
    require(original['cases'][3]['mode']=='crash' and original['cases'][3]['status']=='FAIL','original crash failure must not be promoted')
    evidence.mkdir(mode=0o700)
    tools=source/'systems/rock-star-os/os/update'
    cases=[('ui-startup-crash','verify-ui-startup.py',4,['--evidence',str(evidence/'ui-startup-crash'),'--case','crash'],4*180+600),('ab','verify-qemu.py',8,[],8*300+600),('faults','verify-faults.py',13,[],13*300+600),('auth-health','verify-auth-health.py',3,['--evidence',str(evidence/'auth-health')],3*300+300),('data-abi','verify-data-abi.py',3,['--evidence',str(evidence/'data-abi')],3*180+300)]
    plan={'schema':'rock-game-d4-run-plan/1','scope':'same frozen Game triple; original ready/absent/freeze cases plus separately pinned crash observer and remaining canonical D4 verifiers','created_utc':now(),'source_commit':x.source_commit,'freeze_sha256':sha(images/'freeze-manifest.json'),'image_sha256':triple,'harness_sha256':{name:sha((x.probe_source/'systems/rock-star-os/os/update' if case=='ui-startup-crash' else tools)/name) for case,name,_,_,_ in cases},'orchestrator_sha256':sha(__file__),'source_files_verified':len(frozen['source_files_sha256']),'sequence':[{'name':name,'boots':boots,'args':args,'outer_deadline_seconds':limit} for name,_,boots,args,limit in cases],'boots':41,'automatic_retry':False,'physical_device':'NOT_RUN','real_funds':'NOT_USED'}
    plan.update(probe_commit='f7c391c7623c40dd79098e724b9a2b28852ddabf',probe_source=str(x.probe_source),probe_proof_sha256=sha(x.probe_proof),overlay_modified_existing=proof['modified_existing_files'],overlay_new_test=proof['new_test_file'],original_failed_report_sha256=sha(original_path),original_whole_run_status='FAIL_RETAINED',original_archive_sha256=archive['archive_sha256'],original_archive_readback_sha256=sha(x.archive_readback),reused_complete_cases=reused,new_boots=31,reused_boots=10,all_required_boots=41,whole_prior_run_promoted=False)
    save(evidence/'plan.json',plan);(evidence/'plan.json').chmod(0o444)
    report={'schema':'rock-game-d4-run/1','status':'RUNNING','plan_sha256':sha(evidence/'plan.json'),'started_utc':now(),'checks':[]};save(evidence/'report.json',report)
    if x.plan_only:
        report.update(status='PLAN_ONLY_NO_GUEST_STARTED');save(evidence/'report.json',report);print(json.dumps({'status':report['status'],'plan_sha256':sha(evidence/'plan.json')}));return
    prior=None
    try:
        for name,filename,count,args,limit in cases:
            check_source();check_probe()
            active_tools=x.probe_source/'systems/rock-star-os/os/update' if name=='ui-startup-crash' else tools
            require(sha(active_tools/filename)==plan['harness_sha256'][filename] and sha(images/'freeze-manifest.json')==plan['freeze_sha256'],'pinned verifier/freeze changed')
            existing={p.name for p in images.iterdir() if p.is_dir()}
            argv=[sys.executable,'-B',str(active_tools/filename),'--artifacts',str(images)]+args
            if name=='faults':argv+=['--ab-evidence',str(prior)]
            item={'name':name,'command':argv,'status':'RUNNING','started_utc':now()};report['checks'].append(item);save(evidence/'report.json',report)
            print(json.dumps({'status':'START','case':name,'expected_boots':count}),flush=True)
            with (evidence/(name+'.log')).open('xb') as log:
                process=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
                item['pid']=process.pid;save(evidence/'report.json',report)
                try:code=process.wait(timeout=limit)
                except BaseException:
                    if process.poll() is None:
                        os.killpg(process.pid,signal.SIGTERM)
                        try:process.wait(timeout=10)
                        except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=10)
                    raise
            item.update(exit_code=code,finished_utc=now(),log_sha256=sha(evidence/(name+'.log')))
            if args:out=evidence/name
            else:
                prefix='verify-ab-' if name=='ab' else 'verify-faults-'
                created=[p for p in images.iterdir() if p.is_dir() and p.name not in existing and p.name.startswith(prefix)]
                require(len(created)==1,'exactly one new verifier evidence directory required');out=created[0]
            item['evidence']=str(out);require(code==0,'verifier failed; preserve raw report and logs')
            inner=json.loads((out/'report.json').read_text());require(inner['status']==('PASS_SCOPED' if name=='ui-startup-crash' else 'PASS'),'inner verifier did not pass')
            if name=='ui-startup-crash':
                require(inner['selected_case']=='crash' and inner['full_matrix_verified'] is False,'scoped crash report required');new_validator.selected_case_complete(inner['cases'],'crash')
            boots=sum(len(case['boots']) for case in inner['cases']) if name=='ui-startup-crash' else len(inner['boots'])
            require(boots==count,'fixed boot count differs')
            require({n:sha(images/n) for n in triple}==triple,'immutable image changed')
            item.update(status='PASS',boots=boots,report_sha256=sha(out/'report.json'));save(evidence/'report.json',report)
            print(json.dumps({'status':'PASS','case':name,'boots':boots,'evidence':str(out)}),flush=True)
            if name=='ab':prior=out
        check_source();check_probe()
        require(sum(c['boots'] for c in report['checks'])==31 and len(report['checks'])==5 and all(c['status']=='PASS' for c in report['checks']),'remaining D4 coverage incomplete')
        report.update(status='PASS_SCOPED',boots=41,new_boots=31,reused_boots=10,original_whole_run_status='FAIL_RETAINED',ui_startup_case_coverage=reused+[{'case':'crash','boots':4,'status':'PASS_NEW_DIAGNOSTIC_OBSERVER'}],immutable_image_sha256=triple,other_acceptance_gates='NOT_RUN_BY_THIS_ORCHESTRATOR')
    except BaseException as error:
        report.update(status='FAIL',error_type=type(error).__name__,error=str(error)[:1200]);raise
    finally:report['finished_utc']=now();save(evidence/'report.json',report)

if __name__=='__main__':main()
