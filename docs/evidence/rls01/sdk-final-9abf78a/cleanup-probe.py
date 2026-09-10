import hashlib,importlib.util,json,sys
from pathlib import Path
sys.dont_write_bytecode=True
root=Path('/Users/kaiya/Library/RockstarOS/rls01-sdk-final1');spec=importlib.util.spec_from_file_location('p',Path('../github-candidate-download-01/preview.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
root,record=p.load(root)
with p.locked(root):
 assert record['state']=='SDK_ONLY_PROBE'
 preserved=json.loads(Path('work/sdk-final1-preserved.json').read_text());assert preserved['status']=='PASS'
 for n,r in preserved['private_files'].items():
  f=Path('work/sdk-final1-private-originals')/n
  assert f.stat().st_size==r['bytes'] and p.digest(f)==r['sha256']
 p.verify_vm(root,record)
 release=json.loads((root/'probe-release.json').read_text())
 state=p.sandbox_command(root,release,'status');assert state['running'] is False
 p.lima(root,'stop','os',timeout=180);p.verify_vm(root,record);p.lima(root,'delete','--tty=false','os',timeout=180)
 record.update(state='SDK_PROBE_REMOVED',previous_state='SDK_ONLY_PROBE');p.save(root/'installation.json',record)
 assert not (root/'lima/os').exists()
 report={'schema':'rock-final-sdk-owned-cleanup/1','status':'PASS','method':'delivered verify_vm and isolated Lima normal stop/delete, SDK-only owned probe scope','force_used':False,'normal_os_remove_refused_non_os_probe':True,'probe_label_not_changed_to_installed':True,'authority_observed_stopped':state,'private_originals_hashes_preserved':preserved['private_files'],'owned_vm_directory_absent':True}
 p.save(Path('work/sdk-final1-cleanup.json'),report);print(json.dumps(report,indent=2))
