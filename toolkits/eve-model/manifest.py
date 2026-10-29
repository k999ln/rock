from __future__ import annotations
import hashlib
import json
import os
import math
from pathlib import Path
import re
import shutil
import subprocess
import time
from profiles import profile

BASE_SHA='0979f33d1bc58afcf696d13f57977644e7b11a6f0eec3e631d8e9463d18c0717'
BASE_REVISION='8b403126fc14f14cfc99bb4cfa72ecbc129ea677'
OFFLINE={'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1','TOKENIZERS_PARALLELISM':'false'}

def finite_metric(value,name):
    result=float(value)
    if not math.isfinite(result): raise ValueError('nonfinite '+name)
    return result

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()

def atomic_json(path,value):
    p=Path(path); tmp=p.with_suffix(p.suffix+'.tmp')
    tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n'); os.replace(tmp,p)

def base_identity(base):
    p=Path(base).resolve()
    if not p.is_dir(): raise ValueError('local model directory missing')
    files={name:sha(p/name) for name in ['model.safetensors','config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','added_tokens.json','merges.txt','vocab.json']}
    if files['model.safetensors']!=BASE_SHA: raise ValueError('base weight mismatch')
    return {'model':'mlx-community/Qwen2.5-1.5B-Instruct-4bit','revision':BASE_REVISION,'files':files}

def admission(root,profile_name='standard'):
    """macOS reports a reclaimability estimate, not a hard isolation guarantee."""
    sample_started=time.monotonic();sample_deadline=sample_started+2
    def query(command):
        remaining=sample_deadline-time.monotonic()
        if remaining<=0:raise TimeoutError('resource sample stale')
        return subprocess.check_output(command,text=True,timeout=remaining)
    vm=query(['/usr/bin/vm_stat'])
    page=int(re.search(r'page size of (\d+)',vm).group(1))
    pages={m.group(1):int(m.group(2)) for m in re.finditer(r'^(Pages [^:]+):\s+(\d+)\.',vm,re.M)}
    total=int(query(['/usr/sbin/sysctl','-n','hw.memsize']))
    pressure=query(['/usr/bin/memory_pressure','-Q'])
    percent=int(re.search(r'System-wide memory free percentage: (\d+)%',pressure).group(1))
    pressure_level=int(query(['/usr/sbin/sysctl','-n','kern.memorystatus_vm_pressure_level']))
    if pressure_level not in [1,2,4]: raise ValueError('unknown macOS memory pressure level')
    policy=profile(profile_name)
    estimated=total*percent//100
    conservative=page*sum(pages.get(k,0) for k in ['Pages free','Pages inactive','Pages speculative'])
    free=shutil.disk_usage(root).free
    record={'at':time.time(),'diskFreeBytes':free,'physicalMemoryBytes':total,
      'availableEstimateBytes':estimated,'availableMethod':'macOS memory_pressure -Q percentage × hw.memsize: noncompressed pool including active pages; NOT additional available memory',
      'freeInactiveSpeculativeBytes':conservative,'macOSFreePercent':percent,
      'vmPressureLevel':pressure_level,'vmPressureLabels':{'1':'normal','2':'warning','4':'critical'},
      'processRssBudgetBytes':policy['rssLimitBytes'],'diskMinimumBytes':20*1024**3,'availableMinimumBytes':policy['minimumAvailableBytes'],
      'profile':policy,'pollWaitSeconds':1,'sampleStartedMonotonic':sample_started,'sampleAgeSeconds':time.monotonic()-sample_started,
      'hardIsolation':False,'rssAndMetalMayOverlap':True}
    record['admissionMethod']='free + inactive + speculative pages; memory_pressure estimate is informational only'
    record['originalStandardAvailableGateAccepted']=conservative>=4*1024**3
    record['admitted']=free>=20*1024**3 and conservative>=policy['minimumAvailableBytes'] and (pressure_level==1 or pressure_level==2 and policy.get('allowWarning',False)) and record['sampleAgeSeconds']<=2
    return record
