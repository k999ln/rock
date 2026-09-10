#!/usr/bin/env python3
import hashlib,importlib.util,json,os,select,signal,sqlite3,stat,sys,time
from contextlib import closing
from datetime import datetime,timezone
from pathlib import Path
base=Path('/var/tmp/rock-final-9abf78a/systems/rock-star-os'); old=Path('/var/tmp/rock-final-c-9abf78a-01'); out=Path('/var/tmp/rock-final-c-preflight-correction-02');out.mkdir(mode=0o700,exist_ok=False);os.umask(0o077);os.environ['PATH']='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(name,d):p=out/name;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');p.chmod(0o600)
summary=json.loads((old/'citations/summary.json').read_bytes());assert summary['status']=='FAIL' and summary['cycles']==[]
assert not (old/'citations/1').exists()
source_files=[base/'src/blackberryrock/recipe_worker.py',base/'os/runner/isolated_entry.py']; launcher=old/'citations/runner-sandbox'
metadata=[{'path':str(p),'mode':stat.S_IMODE(p.stat().st_mode),'sha256':sha(p)} for p in [launcher,*source_files]]
assert metadata[0]['mode']==0o775 and all(x['mode']==0o644 for x in metadata[1:])
prior_stop=Path('/var/tmp/rock-final-c-preflight-correction-01/registry-stop.json');stop=json.loads(prior_stop.read_bytes());assert stop['process_exit_observed'] is True;assert not (Path('/proc')/str(stop['identity']['pid'])).exists();save('registry-stop.json',stop)
sys.path[:0]=[str(base/'os/desktop'),str(base/'os'),str(base/'src')]
spec=importlib.util.spec_from_file_location('correction_business',base/'os/desktop/verify-business.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
import game_authority_observer as authority
from game_exchange import sandbox
config_path=Path('/var/tmp/rock-release-os-20260910/final-9abf78a-empty-authority/root-c-device.json');config=json.loads(config_path.read_bytes());sc=Path(config['game']['config']);assert sandbox.status(sandbox.load(sc))['running'] is False
observer=authority.Observer(base/'os/game_exchange/sandbox.py',sc,config['game']['authority_id'],out)
current=observer.invoke('snapshot');before=json.loads((old/'citations/authority-before.json').read_bytes());authority.unchanged(before,current);save('authority-current.json',current)
record=json.loads((b.guest.BASE/config['name']/'running.json').read_bytes());assert not b.guest.running(record)
profile=b.retention.retention_profile(config);dbs=[]
with b.closed_device(config,record) as data:
 for role,(source,_) in profile['sources'].items():
  target=out/(role+'.sqlite3');b.power.export_closed_database(data,source,target);target.chmod(0o600);original=old/'citations/baseline'/(role+'.sqlite3');assert sha(target)==sha(original),role
  dbs.append({'role':role,'sha256':sha(target),'matches_original_baseline':True})
ports=[]
import socket
for port in [9443,9444,9641,9642,9643]:
 with socket.socket() as s:s.bind(('127.0.0.1',port))
 ports.append(port)
report={'schema':'rock-c-citation-preflight-correction/1','status':'PASS_ORIGINAL_STATE_UNCHANGED_READY_FOR_REMAINING_STAGES','observed_utc':datetime.now(timezone.utc).isoformat(),'original_orchestration_sha256':sha(old/'orchestration.json'),'original_citation_summary_sha256':sha(old/'citations/summary.json'),'original_citation_log_sha256':sha(old/'citations.log'),'original_runner_log_sha256':sha(old/'citations/runner-1.log'),'original_cycles':0,'prior_read_only_collection_failure':'First collector stopped the owned registry and compared authority, then lacked /usr/sbin for debugfs; original partial evidence retained in correction-01. This second read-only collection sets the declared Linux PATH and performs no further process stop.','root_c_config_sha256':sha(config_path),'cause':'Inherited Lima umask0002 produced owned cc launcher0775; unchanged executor guard rejected it before guest boot. Frozen source components0644.','original_metadata':metadata,'next_process_umask':'0077','source_or_image_changes':False,'financial_actions_repeated':0,'authority_complete_unchanged':True,'guest_database_bytes_unchanged':dbs,'guest_running':False,'authority_running':False,'ports_free':ports,'registry_stop_sha256':sha(out/'registry-stop.json'),'collector_sha256':sha(Path(__file__)),'scope':'Retained original FAIL. Only owned orphan registry stopped; unchanged existing guest and financial state may supply remaining citations and demo in a new directory.'}
save('report.json',report);print(json.dumps({k:v for k,v in report.items() if k not in ('original_metadata','guest_database_bytes_unchanged')}))
