#!/usr/bin/env python3
"""Read-only observer for a fixed native GUI signed-store verification boot.

The GUI must request refresh, search, install, approve and run. This observer
has no platform mutation entry point, network client or arbitrary path options.
"""
from contextlib import closing
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time

SOURCE = Path('/usr/libexec/rock-ui-evidence.py')
if not SOURCE.is_file():
    SOURCE = Path(__file__).with_name('guest-ui-evidence.py')
spec = importlib.util.spec_from_file_location('rock_fixed_ui_observer', SOURCE)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

CONTRACT = {'id': 'org.rockstar.remote-text-kit', 'version': '1.0.0',
            'input': 'Native OS\nLocal result', 'output': 'Local result\nNative OS'}
PROOF = Path('/data/ui-remote-proof.json')


def registry_rows():
    with closing(sqlite3.connect('file:' + base.DATABASE + '?mode=ro', uri=True, timeout=2)) as connection:
        connection.execute('PRAGMA query_only=ON')
        connection.row_factory = sqlite3.Row
        return [dict(row) for row in connection.execute('SELECT * FROM rock_registry_requests LIMIT 2')]


def split_receipts(receipts, rows):
    base.require(len(rows) == 1, 'exactly one native GUI catalog refresh is required')
    row = rows[0]
    key = row['key']
    base.require(re.fullmatch(r'ui-[0-9a-f]{32}', key) is not None, 'refresh lacks a native UI request identity')
    base.require(row['status'] == 'ready' and row['error'] is None and row['finished'] is not None, 'signed catalog refresh did not complete')
    matches = [item for item in receipts if item['key'] == key]
    base.require(len(matches) == 1, 'refresh queue has no unique durable request receipt')
    receipt = matches[0]
    base.require(receipt['request_hash'] == base.digest({'v': 1, 'op': 'registry.refresh', 'key': key}), 'refresh receipt differs from exact GUI request')
    base.require(json.loads(receipt['result']) == {'accepted': True, 'operation': key}, 'refresh acceptance receipt mismatch')
    return [item for item in receipts if item['key'] != key], {
        'key': key, 'request_hash': receipt['request_hash'], 'result': json.loads(receipt['result']), 'queue': row}


def embedded_ids():
    paths = sorted(Path('/usr/share/rock/registry').glob('*.rock.json'))
    base.require(len(paths) <= 100, 'embedded registry inventory exceeds observer bound')
    result = []
    for path in paths:
        base.require(path.stat().st_size <= 128 * 1024, 'embedded package exceeds observer bound')
        result.append(json.loads(path.read_bytes())['manifest']['id'])
    return sorted(set(result))


def observe(report):
    deadline = time.monotonic() + 230
    while True:
        try:
            initial = base.read_api('snapshot')['snapshot']
            environment = base.environment_evidence(store_network=True)
            break
        except (OSError, ValueError, AssertionError) as error:
            if time.monotonic() >= deadline:
                raise TimeoutError('remote GUI services did not become ready: ' + str(error)) from error
            time.sleep(0.5)
    initial_ids = [item['manifest']['id'] for item in initial['catalog']]
    image_ids = embedded_ids()
    base.require(CONTRACT['id'] not in initial_ids and CONTRACT['id'] not in image_ids, 'remote Tool must be absent from the initial catalog and immutable image')
    base.require(initial['hub']['installed'] == [] and initial['hub']['jobs'] == [] and initial['hub']['audit'] == [] and
                 base.read_receipts() == [] and registry_rows() == [], 'remote GUI test requires fresh persistent state')
    base.require(initial['registry']['configured'] is True and initial['registry']['can_refresh'] is True and
                 initial['registry']['count'] == 0, 'fresh configured registry must not have a fetched remote catalog')
    baseline_hash = base.wallet_baseline(initial['wallet'])
    report.update(environment_initial=environment, wallet_initial=initial['wallet'], wallet_initial_sha256=baseline_hash,
                  expected_input=CONTRACT['input'], expected_output=CONTRACT['output'], registry_initial=initial['registry'],
                  initial_catalog_ids=initial_ids, immutable_embedded_tool_ids=image_ids, remote_absent_initially=True)
    base.emit('ROCK_UI_REMOTE_OBSERVER_READY', {'tool': CONTRACT['id'], 'wallet_sha256': baseline_hash})
    package_hash, stage, succeeded_at = None, 0, None
    while time.monotonic() < deadline:
        snapshot = base.read_api('snapshot')['snapshot']
        base.require(base.digest(snapshot['wallet']) == baseline_hash, 'store or Tool flow changed the simulator Wallet')
        registry = snapshot['registry']
        base.require(registry['status'] != 'error', 'native GUI catalog refresh failed: ' + str(registry.get('last_error')))
        items = [item for item in snapshot['catalog'] if item['manifest']['id'] == CONTRACT['id'] and item['manifest']['version'] == CONTRACT['version']]
        if package_hash is None and registry['status'] == 'ready' and registry.get('fresh') is True and items:
            base.require(len(items) == 1, 'remote tool catalog entry is not unique')
            _, refresh = split_receipts(base.read_receipts(), registry_rows())
            report['registry_refresh_receipt'] = refresh
            package_hash = items[0]['hash']
            report['tool'] = {'id': CONTRACT['id'], 'version': CONTRACT['version'], 'package_hash': package_hash}
            base.emit('ROCK_UI_REMOTE_CATALOG_OBSERVED', {'tool': CONTRACT['id'], 'package_hash': package_hash, 'revision': registry['revision']})
        if package_hash is None:
            base.require(snapshot['hub']['installed'] == [] and snapshot['hub']['jobs'] == [], 'Tool used before signed catalog observation')
            time.sleep(0.35)
            continue
        progress = base.check_progress(snapshot, baseline_hash, package_hash, CONTRACT)
        if progress['stage'] > stage:
            for number in range(stage + 1, progress['stage'] + 1):
                base.emit(('', 'ROCK_UI_REMOTE_INSTALLED_OBSERVED', 'ROCK_UI_REMOTE_APPROVED_OBSERVED', 'ROCK_UI_REMOTE_RUN_OBSERVED')[number])
            stage = progress['stage']
        job = progress['job']
        if job and job['status'] == 'succeeded' and succeeded_at is None:
            succeeded_at = time.monotonic()
            base.emit('ROCK_UI_REMOTE_JOB_OBSERVED', {'id': job['id'], 'status': job['status'], 'output': job['output']})
        if succeeded_at is not None and time.monotonic() - succeeded_at >= base.CAPTURE_SECONDS:
            full_job = base.read_api('job.result', job['id'])['result']
            base.require(full_job['status'] == 'succeeded' and full_job['output'] == CONTRACT['output'] and full_job['key'] == job['key'], 'full remote job differs from snapshot')
            receipts, refresh = split_receipts(base.read_receipts(), registry_rows())
            report.update(environment_final=base.environment_evidence(store_network=True), wallet_final=snapshot['wallet'],
                          wallet_final_sha256=base.digest(snapshot['wallet']), audit=progress['audit'], job=full_job,
                          receipts=base.validate_receipts(receipts, package_hash, job, CONTRACT), registry_refresh_receipt=refresh,
                          registry_final=registry, installed=snapshot['hub']['installed'], hub_maturity=snapshot['hub']['maturity'],
                          hub_modes=snapshot['hub']['modes'], capture_grace_seconds=base.CAPTURE_SECONDS, wallet_unchanged=True)
            base.require(report['environment_initial']['processes'] == report['environment_final']['processes'], 'native service restarted during store flow')
            base.require(registry['status'] == 'ready' and registry['fresh'] is True, 'signed catalog lost its valid state')
            report['status'] = 'PASS'
            return
        time.sleep(0.35)
    raise TimeoutError('native GUI signed-store flow did not complete; last stage=' + str(stage))


def main():
    if os.getuid() != 0 or os.geteuid() != 0 or os.uname().machine != 'aarch64' or 'rock.ui.remote.verify=1' not in Path('/proc/cmdline').read_text().split():
        raise SystemExit('observer requires root in an explicitly flagged Rock OS ARM64 remote GUI verification boot')
    report = {'schema': 'rock-native-remote-ui-proof/1', 'status': 'FAIL', 'scope': 'actual native GUI and local TLS development store',
              'observer': 'read-only snapshot/job.result, fixed embedded package inventory and SQLite mode=ro; no mutations',
              'blackberry': 'NOT_RUN', 'wallet': 'SIMULATOR_ONLY', 'started_unix': time.time()}
    try:
        observe(report)
    except BaseException as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
    finally:
        report['finished_unix'] = time.time()
        try:
            base.PROOF = PROOF
            base.persist(report)
        except BaseException as error:
            report.update(status='FAIL', persistence_error=str(error))
        base.emit('ROCK_UI_REMOTE_GUEST_PROOF', report)
        base.emit('ROCK_UI_REMOTE_GUEST_' + report['status'])
        os.sync()
        subprocess.run(['/sbin/poweroff', '-f'], check=False)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
