"""Operator entry: no child is spawned after failed fresh admission."""
import argparse
import json
from pathlib import Path
import subprocess
from manifest import admission

def launch(root,base,python,candidate_root,resumption=False,admission_fn=admission,run=subprocess.run):
    root=Path(root)
    check=admission_fn(root,'matched-768-v1')
    name='diagnostic-launch-admission-reviewed.json' if resumption else 'diagnostic-launch-admission.json'
    with (root/name).open('x') as f:json.dump(check,f,indent=2)
    if not check.get('admitted'):raise ValueError('fresh admission refused; no diagnostic child started')
    command=['node',str(Path(__file__).with_name('diagnose.mjs')),str(root),str(base),str(python),str(candidate_root)]
    if resumption:command.append('reviewed-resumption')
    return run(command,check=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--base',type=Path,required=True);p.add_argument('--python',required=True);p.add_argument('--candidate-root',type=Path,required=True);p.add_argument('--reviewed-resumption',action='store_true')
    a=p.parse_args();launch(a.root,a.base,a.python,a.candidate_root,a.reviewed_resumption)
