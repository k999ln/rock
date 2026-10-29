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
from manifest import OFFLINE,admission,atomic_json
from profiles import profile,require_decision,runtime_problem

def stop_owned(child,grace=5):
    if child.poll() is None:
        child.terminate()
        try: child.wait(timeout=grace)
        except subprocess.TimeoutExpired: child.kill();child.wait(timeout=5)

def supervise_owned(command,root,limit,log_name='training.log',grace=5,profile_name=None):
    def interrupted(signum,frame): raise InterruptedError('training supervisor interrupted')
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
    started=time.monotonic();peak=0;reason=None;samples=0;min_available=None;max_pressure=None
    with open(root/log_name,'x') as log:
        child=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,**OFFLINE})
        try:
            while child.poll() is None:
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
                time.sleep(min(1,max(0.05,limit/10)))
        except BaseException as error:
            reason=type(error).__name__+': '+str(error)[:200]
        finally:
            stop_owned(child,grace)
    record={'schema':'eve.training-supervisor/1','exitCode':child.returncode,'stopReason':reason,'ownedChildPid':child.pid,
      'elapsedSeconds':time.monotonic()-started,'sampledPeakRssBytes':peak,'hardIsolation':False,
      'resourceSamples':samples,'minimumAvailablePagesBytes':min_available,'maximumVmPressureLevel':max_pressure,'samplingSeconds':1}
    return record

def run(root,base,data,updates,profile_name='standard',run_id='eve-qlora-v1',candidate_name='candidate-v1',reuse_before=None):
    b=Budget(root); b.check_time(1800)
    require_decision(root,profile_name)
    check=admission(root,profile_name);atomic_json(root/'training-admission.json',check)
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
    source_hashes={name:__import__('hashlib').sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in ['train.py','train_worker.py','budget.py','manifest.py','profiles.py']}
    record=supervise_owned(command,root,limit,log_name='training-'+run_id+'.log',profile_name=profile_name)
    record['runId']=run_id;record['ownedCommand']=command;record['sourceHashesAtLaunch']=source_hashes
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
    p.add_argument('--profile',choices=['standard','small-memory-v1','bounded-warning-hypothesis-v1'],default='standard')
    p.add_argument('--run-id',choices=['eve-qlora-v1','eve-qlora-v2'],default='eve-qlora-v1');p.add_argument('--candidate-name',choices=['candidate-v1','candidate-v2'],default='candidate-v1');p.add_argument('--reuse-before',choices=['eve-qlora-v1'])
    a=p.parse_args();print(json.dumps(run(a.root,a.base,a.data,a.updates,a.profile,a.run_id,a.candidate_name,a.reuse_before)))
