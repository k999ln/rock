import hashlib
import importlib.util
import json
import math
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import sys

root = Path('/var/tmp/rkh15/systems/rock-star-os')
sys.path.insert(0, str(root / 'os/desktop'))
spec = importlib.util.spec_from_file_location('business_audit', root / 'os/desktop/verify-business.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
c = v.contract
evidence = Path('/var/tmp/rk-business/business-acbb54714e014da4a63f')
plan = json.loads((evidence / 'plan.json').read_text())
report = json.loads((evidence / 'report.json').read_text())
checks = []
def checked(name, condition):
    if not condition:
        raise ValueError('FAIL: ' + name)
    checks.append(name)

checked('original plan file SHA256', v.guest.digest(evidence / 'plan.json') ==
        '87df318c07e968052563bbb35ef12af4af5d14b478d35bb8dee31b760827010e')
checked('canonical UTF8 plan/report correspondence', c.hashed(plan) == report['plan_sha256'])
checked('original final report PASS_SCOPED', report['status'] == 'PASS_SCOPED')
c.validate_soak(plan, report['plan_sha256'], report)
checks.append('all original frozen soak thresholds independently reevaluated')
checked('original fixed thresholds preserved', all(plan[k] == value for k, value in c.plan('soak').items()))
v.guest.validate_config(plan['config'])
checks.append('image hashes, signed factory and embedded host source guard')
screens = []
boots = []
sample_files = []
limits = plan['limits']
for cycle in report['cycles']:
    folder = evidence / ('cycle-' + str(cycle['number']))
    checked('resource sample file hash cycle ' + str(cycle['number']),
            v.guest.digest(folder/'resource-samples.json') == cycle['resource_samples_sha256'])
    samples = json.loads((folder/'resource-samples.json').read_text())
    checked('all-cycle raw resource summary ' + str(cycle['number']),
            v.resource_summary(samples) == cycle['resources'])
    sample_files.append({'cycle':cycle['number'], 'samples':len(samples), 'sha256':cycle['resource_samples_sha256']})
    hashes = set()
    for screen in cycle['screenshots']:
        image = folder/screen['name']
        checked('frame bytes/hash ' + str(cycle['number']) + '/' + screen['name'],
                image.stat().st_size == screen['bytes'] and v.guest.digest(image) == screen['sha256'])
        hashes.add(screen['sha256'])
        screens.append({'cycle':cycle['number'], 'name':screen['name'], 'sha256':screen['sha256']})
    checked('UI states reference retained real frames ' + str(cycle['number']),
            all(s['screenshot_sha256'] in hashes for s in cycle['ui_states']))
    checked('bounded UI evidence ' + str(cycle['number']), len(cycle['screenshots']) <= limits['max_screenshots'])
    events = [e for e in cycle['qmp_events'] if e['event'] in ('RESET', 'SHUTDOWN')]
    checked('one actual guest poweroff ' + str(cycle['number']),
            len(events) == 1 and events[0]['event'] == 'SHUTDOWN' and events[0]['data']['guest'] is True)
    log = Path(cycle['session'])/'boot.log'
    log_text = log.read_text(errors='replace')
    checked('init stops services and reaches powerdown ' + str(cycle['number']),
            all(token in log_text for token in ('stopped /usr/bin/rock-ui',
                "pidfile '/run/rock-authenticator.pid'", "pidfile '/run/rock-platform.pid'",
                "pidfile '/run/rock-wallet.pid'", "pidfile '/run/rock-system.pid'",
                "pidfile '/run/rockd.pid'", 'EXT4-fs (vdb): unmounting filesystem',
                'reboot: Power down')))
    boots.append({'number':cycle['number'], 'boot_id':cycle['boot_id'],
                  'boot_seconds':cycle['boot_seconds'], 'shutdown_seconds':cycle['shutdown_seconds'],
                  'clean_exit':cycle['clean_exit'], 'retention_verified':cycle['retention_verified'],
                  'jobs_this_cycle':len(cycle['jobs']), 'disk_sha256':cycle['disk_sha256'],
                  'boot_log_sha256':v.guest.digest(log), 'event':events[0]})

final = report['cycles'][-1]
record = json.loads((v.guest.BASE / plan['config']['name'] / 'running.json').read_text())
checked('last recorded process is stopped', not v.guest.running(record))
checked('last session corresponds to final report', record['session'] == final['session'])
with v.closed_device(plan['config'], record) as disk:
    checked('stopped final disk bytes unchanged', v.guest.digest(disk) == final['disk_sha256'])
    check = subprocess.run(['e2fsck', '-f', '-n', str(disk)], capture_output=True, text=True, timeout=30)
    checked('stopped filesystem clean without repair', check.returncode == 0)
    snapshot, rows, power_rows = v.retention.business_snapshot(disk)
    checked('all typed database snapshots unchanged', snapshot == final['business_snapshot'])
    actual = c.validate_hub(rows, report['operations'], plan['package_hashes'])
    checked('all 67 real jobs, 76 requests/audits and exact outputs', actual == final['business'])
    checked('all five normal power receipts retained', len(power_rows) == 5 and
            {r['boot_id'] for r in power_rows} == {r['boot_id'] for r in report['cycles']})
    v.unchanged_non_hub(report['cycles'][0]['business_snapshot'], snapshot)
    checks.append('non-Hub Wallet/membership/remote/authenticator data unchanged')
    import stage0
    stage0.validate_disks(plan['config'], disk.parent)
    checked('signed stopped slots unchanged', stage0.stopped_slots(plan['config'], disk.parent) == final['signed_slots'])
    checked('A/B bytes unchanged', {n:v.guest.digest(disk.parent/n) for n in final['slot_sha256']} == final['slot_sha256'])
    checked('stopped disk still unchanged after read-only audit', v.guest.digest(disk) == final['disk_sha256'])

result = {'schema':'rock-run44-independent-recovery/1', 'status':'PASS_SCOPED',
          'observed_at':datetime.now(timezone.utc).isoformat(),
          'runtime_commit':plan['source_commit_declared'],
          'original_plan_file_sha256':v.guest.digest(evidence/'plan.json'),
          'canonical_plan_sha256':report['plan_sha256'],
          'original_report_sha256':v.guest.digest(evidence/'report.json'),
          'image_sha256':plan['config']['sha256'], 'boot_profile':plan['config']['boot'],
          'host_tools_root':str(root), 'host_tools_sha256':{str(p.relative_to(root)):v.guest.digest(p)
               for p in sorted((root/'os/desktop').glob('*.py'))},
          'checks_passed':len(checks), 'checks_manifest_sha256':c.hashed(checks),
          'resource_files':sample_files, 'resources':report['resources'], 'soak':report['soak'],
          'cycles':boots, 'screenshots_verified':len(screens), 'screenshots_manifest_sha256':c.hashed(screens),
          'last_process':{'pid':record['pid'], 'running':False},
          'stopped_inspection':{'disk_sha256':final['disk_sha256'], 'e2fsck_exit':check.returncode,
                'e2fsck_output_sha256':hashlib.sha256((check.stdout+check.stderr).encode()).hexdigest(),
                'snapshot_sha256':c.hashed(snapshot), 'jobs':len(rows['hub_jobs']),
                'requests':len(rows['hub_requests']), 'audits':len(rows['hub_audit']),
                'power_receipts':len(power_rows), 'logical_databases':len(snapshot),
                'table_count':sum(len(r['tables']) for r in snapshot.values()),
                'no_mutations':True},
          'scope':report['scope'], 'D6':report['D6'],
          'not_run':['new runtime candidate', 'guest per-service resources', 'Game/SDK',
                     'fresh installation', 'real hardware', 'real funds'],
          'audit_operations':'read-only original artifacts and stopped disks, existing lock fence; no QEMU start, repair, mutation RPC or duplicated soak'}
print(json.dumps(result,ensure_ascii=False,sort_keys=True,indent=2))
