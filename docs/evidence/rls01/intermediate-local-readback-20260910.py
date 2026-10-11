import importlib.util,json,sys
from pathlib import Path
root=Path('/opt/rockstaros-preview/native')
sys.path[:0]=[str(root/'os/desktop'),str(root/'os'),str(root/'src')]
import guest,backup
spec=importlib.util.spec_from_file_location('installed_retention',root/'os/desktop/verify-backup.py')
retention=importlib.util.module_from_spec(spec);spec.loader.exec_module(retention)
source=Path('/var/tmp/rock-star-desktop/preview')
target=Path('/var/tmp/rock-star-desktop/recovered')
saved=source/'backups/20260910T064822Z-96059d6c6e0f'
with backup.locked(source),backup.locked(target):
    for state in (source,target):
        guest.require(not guest.running(json.loads((state/'running.json').read_text())),'owned device still running')
    report=json.loads((saved/'backup.json').read_text())
    profile=retention.retention_profile(report['config'])
    source_disks=retention.verify_disk_set(report['disks'],source,'retired source')
    saved_disks=retention.verify_disk_set(report['disks'],saved,'backup')
    before,before_hub,old_power=retention.business_snapshot(saved/'userdata.ext4',profile)
    after,after_hub,new_power=retention.business_snapshot(target/'userdata.ext4',profile)
    retention.compare_business(before,after,profile)
    old={r['key']:r for r in old_power};new={r['key']:r for r in new_power}
    guest.require(len(new)==len(old)+1 and all(new.get(k)==v for k,v in old.items()),'shutdown receipt transition differs')
    latest=next(v for k,v in new.items() if k not in old)
    retention.power.guest.validate_record(latest,'poweroff',latest['boot_id'],dispatched=True)
    print(json.dumps({'schema':'rockstaros-preview-local-readback/1','status':'PASS',
      'scope':'intermediate local profile only; no QMP event observer in this manual CUA run; final Game candidate requires separate acceptance',
      'source_commit':'3fa88610fe77317b920efe1dea8f58f8d2113092',
      'source_disks_preserved':source_disks,'backup_disks_verified':saved_disks,
      'before':before,'after':after,'business_roles_exact':sorted(set(profile['sources'])-{'power'}),
      'old_power_receipts_preserved':len(old),'new_dispatched_native_shutdowns':1,
      'new_shutdown_receipt_sha256':retention.hashed(latest),
      'hub_jobs':before['hub']['tables']['hub_jobs'],'wallet_totals':after['wallet']['financial_summary']},indent=2))
