#!/usr/bin/env python3
"""Actual guest store integration. Never installed/executed outside flagged tests."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import traceback
import uuid

TOOL = 'org.rockstar.remote-text-kit'
TEXT = '  Zebra  \nApple\nApple\n  Moon'
V1 = 'Apple\nMoon\nZebra'
V2 = '- Apple\n- Moon\n- Zebra'
PROOF = Path('/data/store-proof.json')
checks = []
api_retries = []
run_id = uuid.uuid4().hex
CLIENT = """import json,sys
sys.path.insert(0,'/usr/lib/rock-platform')
from service import call,PLATFORM_SOCKET,PLATFORM_UID
try:
    print(json.dumps(call(PLATFORM_SOCKET,json.load(sys.stdin),PLATFORM_UID)))
except (ValueError,OSError) as exc:
    print(json.dumps({'ok':False,'error':str(exc),'exception_type':type(exc).__name__}))
"""


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)
    print('PASS ' + name, flush=True)


def api(op, **fields):
    request = {'v': 1, 'op': op, **fields}
    if op not in ('snapshot', 'health', 'job.result'):
        request.setdefault('key', run_id + ':' + uuid.uuid4().hex)
    for attempt in range(2):
        started = time.monotonic()
        result = subprocess.run(['/usr/bin/python3', '-I', '-B', '-c', CLIENT],
                                input=json.dumps(request).encode(), capture_output=True, timeout=18,
                                user=1000, group=1000, extra_groups=[])
        if result.returncode:
            raise ValueError('native client failed: ' + result.stderr.decode(errors='replace')[:300])
        answer = json.loads(result.stdout)
        elapsed = round(time.monotonic() - started, 3)
        if answer.get('ok'):
            return answer
        if answer.get('exception_type') == 'TimeoutError' and attempt == 0:
            # An unknown response is not proof of rejection. Reuse the exact
            # request/key, once, and retain this delay in the final evidence.
            event = {'op':op, 'key':request.get('key'), 'elapsed_seconds':elapsed}
            api_retries.append(event)
            print('ROCK_STORE_API_RETRY ' + json.dumps(event), flush=True)
            continue
        raise ValueError(op + ' after ' + str(elapsed) + 's: ' + answer.get('error', 'API rejected request'))


def snapshot():
    return api('snapshot')['snapshot']


def wait_for(predicate, seconds=35):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.25)
    raise TimeoutError('store condition timed out')


def refresh():
    accepted = api('registry.refresh')['result']
    check('refresh accepted as durable operation', accepted.get('accepted') is True)
    return wait_for(lambda: (state if (state := snapshot()['registry'])['status'] != 'refreshing' else None))


def run_tool(expected):
    key = run_id + ':' + uuid.uuid4().hex
    job = api('run', id=TOOL, text=TEXT, target='device_local', key=key)['result']
    retry = api('run', id=TOOL, text=TEXT, target='device_local', key=key)['result']
    check('retry identifies the same actual guest job', job['id'] == retry['id'])
    result = wait_for(lambda: (value if (value := api('job.result', id=job['id'])['result'])['status'] not in ('running','cancel_requested') else None))
    check('downloaded Tool actual isolated output', result['status'] == 'succeeded' and result['output'] == expected)
    return result


def denied(op, **fields):
    try:
        api(op, **fields)
    except ValueError:
        return True
    return False


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def wallet_hash(state):
    return hashlib.sha256(json.dumps(state['wallet'], sort_keys=True).encode()).hexdigest()


def online(report):
    state = snapshot()
    check('fresh image has no remote Tool in embedded catalog', not any(x['manifest']['id'] == TOOL for x in state['catalog']))
    check('fresh persistent store has no installation or jobs', not state['hub']['installed'] and not state['hub']['jobs'])
    check('actual network carrier is connected', Path('/sys/class/net/eth0/carrier').read_text().strip() == '1')
    check('store is provisioned but has no prior index', state['registry']['configured'] and state['registry']['revision'] is None)
    report['initial_wallet_sha256'] = wallet_hash(state)
    report['runtime_sha256_before'] = file_hash('/usr/lib/rock-platform/blackberryrock/recipe_worker.py')
    index = refresh()
    check('actual HTTPS catalog refresh succeeded', index['status'] == 'ready' and index['fresh'] and index['count'] == 1)
    items = [x for x in snapshot()['catalog'] if x['manifest']['id'] == TOOL]
    check('new Tool is from verified remote metadata', len(items) == 1 and items[0]['source'] == 'registry')
    manifest = items[0]['manifest']
    installed = api('install', id=TOOL, version='1.0.0')['result']
    check('downloaded package identity matches signed catalog', installed['hash'] == items[0]['hash'])
    cache = Path('/data/platform/registry-cache/packages') / (installed['hash'] + '.rock.json')
    check('actual downloaded bytes committed to protected cache', cache.is_file() and file_hash(cache) == installed['hash'])
    check('download does not grant execution permission', denied('run', id=TOOL, text=TEXT))
    api('approve', id=TOOL, approved_hash=installed['hash'])
    report['v1_job'] = run_tool(V1)
    report['v1_package_hash'] = installed['hash']
    print('ROCK_STORE_READY_FOR_UPDATE', flush=True)
    wait_for(lambda: (refresh()['status'] == 'ready' and any(x['manifest']['id'] == TOOL and x['manifest']['version'] == '2.0.0' for x in snapshot()['catalog'])), 55)
    updated = api('update', id=TOOL, version='2.0.0')['result']
    check('Tool update uses a new independent package', updated['hash'] != installed['hash'])
    check('updated permissions require renewed exact hash approval', denied('run', id=TOOL, text=TEXT))
    api('approve', id=TOOL, approved_hash=updated['hash'])
    report['v2_job'] = run_tool(V2)
    report['v2_package_hash'] = updated['hash']
    api('rollback', id=TOOL, version='1.0.0')
    check('rollback retains explicit approval boundary', denied('run', id=TOOL, text=TEXT))
    api('approve', id=TOOL, approved_hash=installed['hash'])
    report['rollback_job'] = run_tool(V1)
    api('update', id=TOOL, version='2.0.0')
    api('approve', id=TOOL, approved_hash=updated['hash'])
    print('ROCK_STORE_READY_FOR_DISCONNECT', flush=True)
    wait_for(lambda: Path('/sys/class/net/eth0/carrier').read_text().strip() == '0')
    check('actual virtual link disconnected by host QMP', Path('/sys/class/net/eth0/carrier').read_text().strip() == '0')
    report['disconnected_job'] = run_tool(V2)
    failed = refresh()
    check('offline refresh fails visibly and preserves existing catalog', failed['status'] == 'error' and failed['count'] == 2)
    check('OS runtime unchanged by Tool download and update', file_hash('/usr/lib/rock-platform/blackberryrock/recipe_worker.py') == report['runtime_sha256_before'])
    check('Tool jobs never create Wallet revenue', wallet_hash(snapshot()) == report['initial_wallet_sha256'])
    report['offline_registry'] = failed
    report['final_wallet_sha256'] = wallet_hash(snapshot())


def offline_reboot(report):
    previous = json.loads(PROOF.read_text())
    state = snapshot()
    check('second boot has no network adapter', not Path('/sys/class/net/eth0').exists())
    item = next(x for x in state['hub']['installed'] if x['id'] == TOOL)
    check('downloaded version and approval survive offline restart', item['version'] == '2.0.0' and item['enabled'] == 1 and item['hash'] == previous['v2_package_hash'])
    report['reboot_job'] = run_tool(V2)
    check('previous actual job receipt survives reboot', api('job.result', id=previous['v1_job']['id'])['result']['output'] == V1)
    check('Wallet remains unchanged across offline restart', wallet_hash(snapshot()) == previous['initial_wallet_sha256'])
    report['previous_proof_sha256'] = file_hash(PROOF)
    report['previous_checks'] = previous['checks']


def main():
    cmdline = Path('/proc/cmdline').read_text().split()
    if os.geteuid() != 0 or os.uname().machine != 'aarch64' or 'rock.store.verify=1' not in cmdline:
        raise SystemExit('requires an explicitly flagged Rock ARM64 guest test')
    report = {'status':'FAIL', 'scope':'actual ARM64 guest service API over UID1000; real HTTPS registry',
              'started_unix':time.time(), 'blackberry':'NOT_RUN', 'gui_input':'separate native UI verification',
              'wallet':'SIMULATOR_ONLY', 'phase':2 if 'rock.store.phase=2' in cmdline else 1}
    try:
        (offline_reboot if report['phase'] == 2 else online)(report)
        report['status'] = 'PASS'
    except BaseException as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
        report['traceback'] = traceback.format_exc(limit=8)
    report.update(checks=checks, api_retries=api_retries, finished_unix=time.time())
    target = PROOF.with_name('store-proof-2.json') if report['phase'] == 2 else PROOF
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    os.sync()
    print('ROCK_STORE_GUEST_PROOF ' + json.dumps(report, ensure_ascii=False), flush=True)
    print('ROCK_STORE_GUEST_' + report['status'], flush=True)
    subprocess.run(['/sbin/poweroff','-f'], check=False)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
