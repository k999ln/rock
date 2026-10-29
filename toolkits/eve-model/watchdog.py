"""Owned inference process monitor. A fatal sample ends this process only."""
import os
import subprocess
import sys
import threading
import time
from manifest import admission,atomic_json
from profiles import profile,runtime_problem

def start_watchdog(root,profile_name):
    policy=profile(profile_name);halt=threading.Event();started=time.monotonic()
    def monitor():
        while not halt.is_set():
            try:
                sample=admission(root,profile_name)
                rss=int(subprocess.check_output(['/bin/ps','-o','rss=','-p',str(os.getpid())],text=True,timeout=1).strip())*1024
                sample['sampleAgeSeconds']=time.monotonic()-sample['sampleStartedMonotonic']
                reason=runtime_problem(sample,policy,rss)
                if time.monotonic()-started>=110:reason='owned inference child120-second envelope; early cutoff110'
            except BaseException as error:
                sample=None;rss=None;reason='resource monitoring unavailable: '+type(error).__name__
            if reason:
                try:atomic_json(root/'inference-resource-stop.json',{'at':time.time(),'pid':os.getpid(),'reason':reason,'sample':sample,'rssBytes':rss,'hardIsolation':False,'samplingSeconds':1})
                finally:
                    print('FATAL_RESOURCE_GUARD: '+reason,file=sys.stderr,flush=True)
                    os._exit(75)
            halt.wait(1)
    threading.Thread(target=monitor,name='eve-owned-resource-monitor',daemon=True).start()
    return halt
