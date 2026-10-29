"""Sampled resource supervisor, not an OS isolation boundary."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import signal
import sys
import time
from budget import Budget
from manifest import OFFLINE,admission,atomic_json,sha
from profiles import PROFILES,profile,require_decision,runtime_problem
from train_worker import RUN_IDS,CANDIDATE_NAMES,validate_recipe,semantic_update_decision

def stop_owned(child,grace=5):
    if child.poll() is None:
        child.terminate()
        try: child.wait(timeout=grace)
        except subprocess.TimeoutExpired: child.kill();child.wait(timeout=5)

def supervise_owned(command,root,limit,log_name='training.log',grace=5,profile_name=None):
    interrupted_signal=None
    def interrupted(signum,frame):
        nonlocal interrupted_signal
        if interrupted_signal is None: interrupted_signal=signum
    previous={sig:signal.getsignal(sig) for sig in (signal.SIGTERM,signal.SIGINT)}
    started=time.monotonic();peak=0;reason=None;samples=0;min_available=None;max_pressure=None
    child=None
    try:
        for sig in previous: signal.signal(sig,interrupted)
        with open(root/log_name,'x') as log:
            if interrupted_signal is None:
                child=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,**OFFLINE})
            try:
              while child is not None and interrupted_signal is None and child.poll() is None:
                if interrupted_signal is not None: break
                elapsed=time.monotonic()-started
                sample=subprocess.run(['/bin/ps','-o','rss=','-p',str(child.pid)],capture_output=True,text=True,timeout=1)
                if sample.returncode==0 and sample.stdout.strip(): peak=max(peak,int(sample.stdout.strip())*1024)
                elif child.poll() is None: reason='process RSS monitoring unavailable'
                policy=profile(profile_name or 'standard')
                if peak>policy['rssLimitBytes']: reason='process RSS exceeded fixed profile limit'
                if profile_name:
                    sample_resource=admission(root,profile_name);samples+=1
                    min_available=min(sample_resource['freeInactiveSpeculativeBytes'],min_available or sample_resource['freeInactiveSpeculativeBytes'])
                    max_pressure=max(sample_resource['vmPressureLevel'],max_pressure or 0)
                    reason=runtime_problem(sample_resource,policy,peak) or reason
                if elapsed>=limit: reason='training/session time limit'
                storage=sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
                if storage>8*1024**3: reason='additional run storage exceeded 8GiB'
                if reason:
                    stop_owned(child,grace)
                    break
                if interrupted_signal is None: time.sleep(min(1,max(0.05,limit/10)))
            except BaseException as error:
                reason=type(error).__name__+': '+str(error)[:200]
            finally:
                if child is not None: stop_owned(child,grace)
    finally:
        for sig,handler in previous.items(): signal.signal(sig,handler)
    if interrupted_signal is not None: reason='InterruptedError: training supervisor interrupted'
    record={'schema':'eve.training-supervisor/1','exitCode':child.returncode if child is not None else None,'stopReason':reason,'ownedChildPid':child.pid if child is not None else None,
      'elapsedSeconds':time.monotonic()-started,'sampledPeakRssBytes':peak,'hardIsolation':False,
      'resourceSamples':samples,'minimumAvailablePagesBytes':min_available,'maximumVmPressureLevel':max_pressure,'samplingSeconds':1}
    return record

def reviewed_startup_binding(root,data,budget):
    """One reviewed retry of a denied, never-started semantic probe only."""
    run_id='eve-semantic-probe';original=root/('training-admission-'+run_id+'.json')
    if json.loads(original.read_text()).get('admitted') is not False:raise ValueError('original probe admission must be false')
    # Any reservation (even zero completed updates) or execution evidence denies reuse.
    for table,column in [('training','id'),('training_allocations','id'),('training_reconciliations','run_id'),('validation','run_id')]:
        if budget.db.execute('SELECT COUNT(*) FROM '+table+' WHERE '+column+'=?',(run_id,)).fetchone()[0]:raise ValueError('probe already has training or validation state')
    records=['training-supervisor-'+run_id+'.json','training-supervisor.json','training-progress-'+run_id+'.json','training-progress.json','candidate-manifest-'+run_id+'.json','candidate-manifest.json','validation-'+run_id+'.json','training-'+run_id+'.log','training.log','probe-v1','candidate-v1','candidate-v2']
    if any((root/name).exists() for name in records):raise ValueError('probe already has execution evidence')
    review_path=root/'TRAINING_STARTUP_RESUMPTION_REVIEW.json';decision_path=root/'training-startup-resumption-decision.json';protocol_path=root/'training-protocol.json'
    review=json.loads(review_path.read_text());decision=json.loads(decision_path.read_text());protocol_sha=sha(protocol_path)
    if review.get('schema')!='eve.training-startup-resumption-review/1' or review.get('permitted') is not True or review.get('runId')!=run_id or review.get('trainingProtocolSha256')!=protocol_sha:raise ValueError('current independent startup review required')
    binding={'runId':run_id,'originalAdmissionSha256':sha(original),'reviewSha256':sha(review_path),'dataManifestSha256':sha(data/'manifest.json'),'trainingProtocolSha256':protocol_sha}
    if decision.get('schema')!='eve.training-startup-resumption-decision/1' or decision.get('status')!='adopted' or decision.get('onceOnly') is not True or any(decision.get(key)!=value for key,value in binding.items()):raise ValueError('bound one-time startup decision required')
    return {**binding,'decisionSha256':sha(decision_path),'originalAdmissionFile':original.name,'reviewFile':review_path.name,'decisionFile':decision_path.name,'startupAdmissionFile':'training-admission-'+run_id+'-reviewed1.json','onceOnly':True}

def run(root,base,data,updates,profile_name='standard',run_id='eve-qlora-v1',candidate_name='candidate-v1',reuse_before=None,startup_resumption=False):
    if type(startup_resumption) is not bool:raise ValueError('startup resumption must be an explicit boolean')
    if startup_resumption and (run_id,updates,profile_name,candidate_name,reuse_before)!=('eve-semantic-probe',8,'matched-768-v1','probe-v1',None):raise ValueError('reviewed startup resumption is semantic-probe-only')
    if run_id.startswith('eve-semantic-'):
        validate_recipe(updates,profile_name,run_id,candidate_name,reuse_before)
        if run_id=='eve-semantic-final':
            decision=semantic_update_decision(root,data)
            if updates!=decision['selectedUpdates']:raise ValueError('final updates differ from preregistered resource decision')
            atomic_json(root/'semantic-update-decision.json',decision)
    b=Budget(root); b.check_time(1800)
    require_decision(root,profile_name)
    admission_path=root/('training-admission-'+run_id+('-reviewed1' if startup_resumption else '')+'.json')
    if startup_resumption and admission_path.exists():raise FileExistsError('reviewed startup attempt already consumed')
    resumption=reviewed_startup_binding(root,data,b) if startup_resumption else None
    # Exclusive creation reserves this run's evidence before querying resources.
    # A partial write/query failure is an unstarted-attempt record, not reusable.
    # No child may start until the complete snapshot is flushed and fsynced.
    with admission_path.open('x',encoding='utf8') as evidence:
        check=admission(root,profile_name)
        if resumption:check={**check,'startupResumption':resumption}
        json.dump(check,evidence,ensure_ascii=False,sort_keys=True,indent=2)
        evidence.write('\n');evidence.flush();os.fsync(evidence.fileno())
    if resumption and reviewed_startup_binding(root,data,b)!=resumption:raise ValueError('startup approval/evidence changed during fresh gate')
    atomic_json(root/'training-admission.json',check)
    if not check['admitted']: raise ValueError('memory/disk admission failed; no optimizer step started')
    if not 1<=updates<=128: raise ValueError('updates out of bounds')
    policy=profile(profile_name)
    if updates>policy.get('maxTrainingUpdates',128):raise ValueError('selected profile update limit')
    prior=b.snapshot()['trainingWallSecondsCharged']
    # Leave room for sample queries and terminate/kill/wait inside the envelope.
    limit=min(1775-prior,b.session['deadlineMonotonicSeconds']-925-time.monotonic(),policy.get('trainingChildWallLimitSeconds',1800)-20)
    if limit<=0: raise ValueError('no training time remains')
    command=[sys.executable,str(Path(__file__).with_name('train_worker.py')),'--root',str(root),'--base',str(base),'--data',str(data),'--updates',str(updates),'--profile',profile_name,'--run-id',run_id,'--candidate-name',candidate_name]
    if reuse_before:command+=['--reuse-before',reuse_before]
    source_hashes={name:__import__('hashlib').sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in ['train.py','train_worker.py','completion_loss.py','budget.py','manifest.py','profiles.py']}
    record=supervise_owned(command,root,limit,log_name='training-'+run_id+'.log',profile_name=profile_name)
    record['runId']=run_id;record['ownedCommand']=command;record['sourceHashesAtLaunch']=source_hashes
    record['startupAdmissionFile']=admission_path.name
    if resumption:record['startupResumption']=resumption
    atomic_json(root/('training-supervisor-'+run_id+'.json'),record)
    try:b.charge_training_wall(run_id,record['elapsedSeconds'])
    except BaseException as error:
        record['budgetAccountingError']=type(error).__name__+': '+str(error)[:200]
        atomic_json(root/('training-supervisor-'+run_id+'.json'),record);atomic_json(root/'training-supervisor.json',record)
        raise
    record['budget']=b.snapshot()
    atomic_json(root/('training-supervisor-'+run_id+'.json'),record)
    atomic_json(root/'training-supervisor.json',record)
    if record['exitCode'] or record['stopReason']: raise RuntimeError(json.dumps(record))
    return record

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--base',type=Path,required=True);p.add_argument('--data',type=Path,required=True);p.add_argument('--updates',type=int,default=128)
    p.add_argument('--profile',choices=list(PROFILES),default='standard')
    p.add_argument('--run-id',choices=RUN_IDS,default='eve-qlora-v1');p.add_argument('--candidate-name',choices=CANDIDATE_NAMES,default='candidate-v1');p.add_argument('--reuse-before',choices=['eve-qlora-v1','eve-recovery-probe','eve-semantic-probe'])
    p.add_argument('--reviewed-startup-resumption',action='store_true')
    a=p.parse_args();print(json.dumps(run(a.root,a.base,a.data,a.updates,a.profile,a.run_id,a.candidate_name,a.reuse_before,a.reviewed_startup_resumption)))
