"""Reproducible host verification with sanitized, source-bound evidence."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys

root=Path(__file__).resolve().parents[1]
os.chdir(root)
evidence=root/'docs/evidence'
evidence.mkdir(exist_ok=True)
env=dict(os.environ, PYTHONPATH=str(root/'src'))
try:
    sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True,stderr=subprocess.DEVNULL).strip()
except (OSError,subprocess.CalledProcessError):
    sha='source-export-without-git'
files={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ('src','tests','examples/registry') for p in sorted((root/folder).rglob('*')) if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ('.pyc','.pyo')}
report={'started_at':datetime.datetime.now(datetime.UTC).isoformat(),'base_commit':sha,'working_tree_file_sha256':files,'environment':{'python':sys.version,'platform':platform.platform(),'machine':platform.machine()},'checks':[]}
checks=[('unittest',[sys.executable,'-m','unittest','discover','-s','tests','-v']),('python-compile',[sys.executable,'-m','compileall','-q','src']),('javascript-syntax',['node','--check','src/blackberryrock/web/app.js'])]
for name,command in checks:
    started=datetime.datetime.now(datetime.UTC).isoformat()
    r=subprocess.run(command,capture_output=True,text=True,env=env)
    output=r.stdout+r.stderr
    (evidence/(name+'.log')).write_text(output)
    report['checks'].append({'name':name,'command':command,'started_at':started,'exit_status':r.returncode,'log':name+'.log'})
    print(name, 'PASS' if r.returncode==0 else 'FAIL',flush=True)
    if r.returncode:
        print(output[-5000:])
report['finished_at']=datetime.datetime.now(datetime.UTC).isoformat()
report['status']='PASS' if all(c['exit_status']==0 for c in report['checks']) else 'FAIL'
(evidence/'verification.json').write_text(json.dumps(report,indent=2))
raise SystemExit(0 if report['status']=='PASS' else 1)
