import hashlib,json,os,socket,sys
from datetime import datetime,timezone
from pathlib import Path
os.environ['PATH']='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';os.umask(0o077)
base=Path('/var/tmp/rock-final-9abf78a/systems/rock-star-os');closed=Path('/var/tmp/rock-final-c-equivocation-recovery-normal-close-04');failed=Path('/var/tmp/rock-final-c-9abf78a-continuation-03');target=Path('/var/tmp/rock-final-c-equivocation-closed-boundary.json');assert not target.exists()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
r=json.loads((closed/'report.json').read_bytes());assert r['status']=='PASS_NORMAL_CLOSE_AND_RETAINED_STATE_ORIGINAL_UI_FAIL' and r['owned_device_running'] is False
assert r['retention']=='ALL_AUTHORITY_EXACT; nonHub/remote unchanged; wallet typed read-only policy; all previous Hub jobs unchanged; expected Hub catalog refresh and one power receipt only'
sys.path[:0]=[str(base/'os/desktop'),str(base/'os'),str(base/'src')]
import guest,game_authority_observer as authority
from game_exchange import sandbox
cp=Path('/var/tmp/rock-release-os-20260910/final-9abf78a-empty-authority/root-c-device.json');config=json.loads(cp.read_bytes());record=json.loads((guest.BASE/config['name']/'running.json').read_bytes());assert not guest.running(record)
sc=Path(config['game']['config']);assert not sandbox.status(sandbox.load(sc))['running']
observer=authority.Observer(base/'os/game_exchange/sandbox.py',sc,config['game']['authority_id'],closed);current=observer.invoke('snapshot');authority.unchanged(json.loads((closed/'authority-after.json').read_bytes()),current)
ports=[]
for port in (9443,9444,9641,9642,9643):
 with socket.socket() as s:s.bind(('127.0.0.1',port))
 ports.append(port)
for service in json.loads((closed/'owned-services-stopped.json').read_bytes()):
 assert service['exit_observed'] is True
 assert not (Path('/proc')/str(service['pid'])).exists()
proof={'schema':'rock-final-c-update-ready-boundary/1','status':'PASS_STOPPED_BOUNDARY_ORIGINAL_FAILURES_RETAINED','recorded_utc':datetime.now(timezone.utc).isoformat(),'original_ui_failure_orchestration_sha256':sha(failed/'orchestration.json'),'original_ui_failure_report_sha256':sha(failed/'citations/1/report.json'),'original_ui_failure_summary_sha256':sha(failed/'citations/summary.json'),'original_normal_close_report_sha256':sha(closed/'report.json'),'normal_close_outcome':'Original same-revision equivocation failure preserved. Reused original signed registry without publish or pin reset; read-only whole authority/nonHub/old Hub jobs retained; normal native shutdown with distinct guest boot identity. Intermediate delayed-navigation and tiny-label OCR failures preserved.','ports_free':ports,'guest_running':False,'authority_running':False,'authority_exactly_unchanged_since_close':True,'root_c_config_sha256':sha(cp),'power_boot_id':r['power_boot_id'],'normal_shutdown_seconds':r['normal_shutdown_seconds'],'completed_successful_game_financial_boots':4,'failed_citation_boot_now_normally_closed':1,'remote_requests_submitted_in_failed_citation':0,'new_job_purchase_charge_or_ui_inputs':0,'failed_probe_foreign_cli_cleanup_exit_codes':'Unavailable for orphan fixtures; pidfd SIGTERM and exit observed only','closed_files_sha256':{p.name:sha(p) for p in sorted(closed.iterdir()) if p.is_file()},'checker_sha256':sha(Path(__file__))}
target.write_text(json.dumps(proof,indent=2)+'\n');target.chmod(0o600);print(json.dumps({k:v for k,v in proof.items() if k!='closed_files_sha256'}))
