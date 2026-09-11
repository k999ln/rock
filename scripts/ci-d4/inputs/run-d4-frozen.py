#!/usr/bin/env python3
"""Sequential, fixed-image D4 orchestration; original verifier limits unchanged."""
import argparse,datetime,hashlib,json,os,pathlib,signal,subprocess,sys,time
P=pathlib.Path

def sha(p):
    with P(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def require(ok,msg):
    if not ok:raise RuntimeError(msg)
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')

def main():
    a=argparse.ArgumentParser();a.add_argument('--source',type=P,required=True);a.add_argument('--images',type=P,required=True);a.add_argument('--evidence',type=P,required=True);a.add_argument('--source-commit',required=True);x=a.parse_args()
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
    check_source()
    evidence.mkdir(mode=0o700)
    tools=source/'systems/rock-star-os/os/update'
    cases=[('ui-startup','verify-ui-startup.py',14,['--evidence',str(evidence/'ui-startup')],14*180+600),('ab','verify-qemu.py',8,[],8*300+600),('faults','verify-faults.py',13,[],13*300+600),('auth-health','verify-auth-health.py',3,['--evidence',str(evidence/'auth-health')],3*300+300),('data-abi','verify-data-abi.py',3,['--evidence',str(evidence/'data-abi')],3*180+300)]
    plan={'schema':'rock-game-d4-run-plan/1','scope':'same frozen Game triple; original five verifier contracts unchanged','created_utc':now(),'source_commit':x.source_commit,'freeze_sha256':sha(images/'freeze-manifest.json'),'image_sha256':triple,'harness_sha256':{name:sha(tools/name) for _,name,_,_,_ in cases},'orchestrator_sha256':sha(__file__),'source_files_verified':len(frozen['source_files_sha256']),'sequence':[{'name':name,'boots':boots,'args':args,'outer_deadline_seconds':limit} for name,_,boots,args,limit in cases],'boots':41,'automatic_retry':False,'physical_device':'NOT_RUN','real_funds':'NOT_USED'}
    save(evidence/'plan.json',plan);(evidence/'plan.json').chmod(0o444)
    report={'schema':'rock-game-d4-run/1','status':'RUNNING','plan_sha256':sha(evidence/'plan.json'),'started_utc':now(),'checks':[]};save(evidence/'report.json',report)
    prior=None
    try:
        for name,filename,count,args,limit in cases:
            check_source()
            require(sha(tools/filename)==plan['harness_sha256'][filename] and sha(images/'freeze-manifest.json')==plan['freeze_sha256'],'pinned verifier/freeze changed')
            existing={p.name for p in images.iterdir() if p.is_dir()}
            argv=[sys.executable,'-B',str(tools/filename),'--artifacts',str(images)]+args
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
            inner=json.loads((out/'report.json').read_text());require(inner['status']=='PASS','inner verifier did not pass')
            boots=sum(len(case['boots']) for case in inner['cases']) if name=='ui-startup' else len(inner['boots'])
            require(boots==count,'fixed boot count differs')
            require({n:sha(images/n) for n in triple}==triple,'immutable image changed')
            item.update(status='PASS',boots=boots,report_sha256=sha(out/'report.json'));save(evidence/'report.json',report)
            print(json.dumps({'status':'PASS','case':name,'boots':boots,'evidence':str(out)}),flush=True)
            if name=='ab':prior=out
        check_source()
        report.update(status='PASS_SCOPED',boots=sum(c['boots'] for c in report['checks']),immutable_image_sha256=triple,other_acceptance_gates='NOT_RUN_BY_THIS_ORCHESTRATOR')
    except BaseException as error:
        report.update(status='FAIL',error_type=type(error).__name__,error=str(error)[:1200]);raise
    finally:report['finished_utc']=now();save(evidence/'report.json',report)

if __name__=='__main__':main()
