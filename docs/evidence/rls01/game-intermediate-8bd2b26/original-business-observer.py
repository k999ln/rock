import importlib.util,json,sys
from pathlib import Path
root=Path('/opt/rockstaros-preview/native')
sys.path[:0]=[str(root/'os/desktop'),str(root/'os'),str(root/'src')]
import guest,backup
spec=importlib.util.spec_from_file_location('installed_retention',root/'os/desktop/verify-backup.py')
retention=importlib.util.module_from_spec(spec);spec.loader.exec_module(retention)
source=Path('/var/tmp/rock-star-desktop/preview')
target=Path('/var/tmp/rock-star-desktop/recovered')
saved=source/'backups/20260910T081255Z-9869e18f8e5f'
with backup.locked(source),backup.locked(target):
    for state in (source,target):
        guest.require(not guest.running(json.loads((state/'running.json').read_text())),'owned device still running')
    report=json.loads((saved/'backup.json').read_text())
    profile=retention.retention_profile(report['config'])
    source_disks=retention.verify_disk_set(report['disks'],source,'retired source')
    saved_disks=retention.verify_disk_set(report['disks'],saved,'backup')
    before,before_hub,old_power=retention.business_snapshot(saved/'userdata.ext4',profile)
    after,after_hub,new_power=retention.business_snapshot(target/'userdata.ext4',profile)
    try:
        retention.compare_business(before,after,profile)
        original_comparison={'status':'PASS'}
    except Exception as exc:
        original_comparison={'status':'FAIL','exception':type(exc).__name__,'message':str(exc)}
    old={r['key']:r for r in old_power};new={r['key']:r for r in new_power}
    guest.require(len(new)==len(old)+1 and all(new.get(k)==v for k,v in old.items()),'shutdown receipt transition differs')
    latest=next(v for k,v in new.items() if k not in old)
    retention.power.guest.validate_record(latest,'poweroff',latest['boot_id'],dispatched=True)
    print(json.dumps({'schema':'rockstaros-preview-game-readback/1','status':'OBSERVED','original_frozen_compare':original_comparison,
      'scope':'intermediate Game profile; original frozen comparator outcome retained; no QMP event observer in this manual CUA run',
      'source_commit':'8bd2b26b23bbb953c12027f69d0f68297c49e2ae',
      'source_disks_preserved':source_disks,'backup_disks_verified':saved_disks,
      'before':before,'after':after,'business_roles_observed':sorted(set(profile['sources'])-{'power'}),
      'old_power_receipts_preserved':len(old),'new_dispatched_native_shutdowns':1,
      'new_shutdown_receipt_sha256':retention.hashed(latest),
      'hub_jobs':before['hub']['tables']['hub_jobs']},indent=2))
