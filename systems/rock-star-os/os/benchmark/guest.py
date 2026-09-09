#!/usr/bin/env python3
"""Fixed actual-OS experiment: UID1000 API client, root read-only observer."""
from contextlib import closing
import json
import os
from pathlib import Path
import selectors
import signal
import socket
import sqlite3
import stat
import struct
import subprocess
import sys
import time
import traceback

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

SOCKET = '/run/rock-platform/api.sock'
OUTPUT = Path('/data/benchmark')
PROTOCOL = Path(__file__).with_name('PRODUCT-EXPERIMENTS-OS.md')
DATABASE = '/data/platform/hub.db'
TERMINAL = {'succeeded', 'failed', 'cancelled', 'interrupted'}


def api(op, deadline=None, *, on_send=None, **fields):
    require(op in ('health', 'snapshot', 'registry.refresh', 'install', 'approve', 'run', 'job.result', 'cancel'),
            'benchmark API operation is not fixed')
    deadline = min(deadline or float('inf'), time.monotonic() + JOB_SECONDS)
    request = {'v': 1, 'op': op, **fields}
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(max(.001, deadline - time.monotonic()))
        connection.connect(SOCKET)
        _, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        require(uid == 1002, 'wrong authenticated platform peer')
        if on_send is not None:
            on_send()
        connection.sendall(canonical(request) + b'\n')
        data = bytearray()
        while b'\n' not in data:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('benchmark API deadline; no timed automatic retry')
            connection.settimeout(remaining)
            block = connection.recv(min(65536, 1024 * 1024 + 1 - len(data)))
            require(bool(block), 'platform response was incomplete')
            data.extend(block)
            require(len(data) <= 1024 * 1024, 'platform response exceeded 1 MiB')
        require(data.count(b'\n') == 1 and data.endswith(b'\n'), 'platform response has extra frames')
        result = json.loads(data)
        require(type(result) is dict and result.get('ok') is True, 'platform rejected request: ' + str(result)[:300])
        return result


def send(stream, kind, value):
    stream.write(canonical({'type': kind, 'value': value}) + b'\n')
    stream.flush()


def client(stream):
    require(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 1000 and not os.getgroups(),
            'measurement client identity must be UID/GID1000 without supplementary groups')
    deadline = time.monotonic() + PREP_SECONDS
    health = api('health', deadline)['result']
    require(health.get('sandbox_verified') is True and health.get('catalog_verified') is True, 'actual OS sandbox readiness failed')
    initial = api('snapshot', deadline)['snapshot']
    require(initial['hub']['installed'] == [] and initial['hub']['total_jobs'] == 0, 'benchmark needs fresh persistent state')
    require(initial['hub']['modes']['device_local'] == 'linux_namespace_seccomp', 'host interpreter cannot replace OS sandbox')
    require(not any(x['manifest']['id'] in IDS.values() for x in initial['catalog']), 'benchmark packages already embedded')
    wallet = sha(canonical(initial['wallet']))
    api('registry.refresh', deadline, key='h2os-prepare-refresh')
    while True:
        state = api('snapshot', deadline)['snapshot']
        if state['registry']['status'] == 'ready':
            break
        require(state['registry']['status'] != 'error', 'signed registry refresh failed')
        require(time.monotonic() < deadline, 'registry preparation deadline exceeded')
        time.sleep(.1)
    require(state['registry']['fresh'] and state['registry']['count'] == 4, 'fresh signed four-package catalog is required')
    packages = {}
    for name in NAMES:
        items = [x for x in state['catalog'] if x['manifest']['id'] == IDS[name]]
        require(len(items) == 1 and items[0]['source'] == 'registry' and items[0]['manifest']['version'] == '1.0.0', 'remote package identity mismatch')
        item = items[0]
        installed = api('install', deadline, key='h2os-install-' + name, id=IDS[name], version='1.0.0')['result']
        require(installed['hash'] == item['hash'] and installed['enabled'] is False, 'download hash or disabled state mismatch')
        api('approve', deadline, key='h2os-approve-' + name, id=IDS[name], approved_hash=installed['hash'])
        packages[name] = {'id': IDS[name], 'hash': installed['hash'], 'manifest': item['manifest']}
    send(stream, 'prepared', {'uid': os.getuid(), 'gid': os.getgid(), 'health': health, 'packages': packages,
                              'registry': state['registry'], 'wallet_sha256': wallet, 'completed_utc': now()})
    experiment_deadline = time.monotonic() + MEASUREMENT_SECONDS
    samples = []
    for phase, pair, order, variant in schedule():
        require(time.monotonic() < experiment_deadline, 'measurement exceeded 900 seconds')
        before = api('snapshot', experiment_deadline)['snapshot']['hub']['total_jobs']
        sample = {'phase': phase, 'pair': pair, 'order_in_pair': order, 'variant': variant,
                  'status': 'incomplete', 'jobs': [], 'started_utc': now()}
        output = INPUT
        active_id = None
        started = []
        attempt_start = time.perf_counter_ns()
        try:
            for step, name in enumerate(OPERATIONS if variant == 'A' else ('workflow',)):
                key = f'h2os-{phase}-{pair}-{variant}-{step}'
                sample['active_key'] = key
                job_deadline = min(experiment_deadline, time.monotonic() + JOB_SECONDS)
                request_hash = sha(canonical({'id': IDS[name], 'text': output, 'target': 'device_local'}))
                created = api('run', job_deadline, on_send=(lambda: started.append(time.perf_counter_ns())) if not started else None,
                              key=key, id=IDS[name], text=output, target='device_local')['result']
                active_id = created['id']
                while True:
                    job = api('job.result', job_deadline, id=active_id)['result']
                    if job['status'] in TERMINAL:
                        observed_ns = time.perf_counter_ns()
                        break
                    if time.monotonic() >= job_deadline:
                        raise TimeoutError('job completion exceeded 30 seconds')
                    time.sleep(POLL_SECONDS)
                require(job['status'] == 'succeeded' and job['error'] is None, 'OS job failed')
                require(job['tool_id'] == IDS[name] and job['package_hash'] == packages[name]['hash'] and
                        job['key'] == key and job['request_hash'] == request_hash, 'actual job differs from request/package')
                sample['jobs'].append(job)
                output = job['output']
                active_id = None
            sample['elapsed_ns'] = observed_ns - started[0]
            after = api('snapshot', experiment_deadline)['snapshot']['hub']['total_jobs']
            sample.update(jobs_started=after - before, output_sha256=sha(output.encode()), output_matches_expected=output == EXPECTED)
            require(after - before == (3 if variant == 'A' else 1), 'actual DB job count increment mismatch')
            require(output == EXPECTED, 'output differs from the independent known-word oracle')
            sample['status'] = 'succeeded'
        except BaseException as error:
            sample.setdefault('elapsed_ns', time.perf_counter_ns() - (started[0] if started else attempt_start))
            sample.update(error=type(error).__name__ + ': ' + str(error), active_job_id=active_id)
            # Never retry a timed mutation with a new key. Cancel only its known job.
            if active_id is not None:
                try:
                    sample['cancel_receipt'] = api('cancel', key='cancel-' + sample['active_key'], id=active_id)
                except BaseException as cancel_error:
                    sample['cancel_error'] = str(cancel_error)
            raise
        finally:
            sample['finished_utc'] = now()
            send(stream, 'sample', sample)
            samples.append(sample)
    final = api('snapshot')['snapshot']
    require(sha(canonical(final['wallet'])) == wallet, 'benchmark changed Wallet')
    require(final['hub']['total_jobs'] == 132, 'expected exactly 132 actual jobs')
    send(stream, 'complete', {'summary': summarize(samples), 'wallet_final_sha256': wallet,
                              'total_jobs': final['hub']['total_jobs'], 'finished_utc': now()})


def runtime_hashes():
    paths = (*RUNTIME, str(Path(__file__)), str(Path(__file__).with_name('common.py')))
    return {path: sha(Path(path).read_bytes()) for path in paths}


def database_evidence(samples):
    with closing(sqlite3.connect('file:' + DATABASE + '?mode=ro', uri=True)) as db:
        db.execute('PRAGMA query_only=ON')
        db.row_factory = sqlite3.Row
        rows = [dict(row) for row in db.execute('SELECT * FROM hub_jobs ORDER BY created,id')]
        audits = [dict(row) for row in db.execute("SELECT * FROM hub_audit WHERE event='run_approved' ORDER BY seq")]
    submitted = [job for sample in samples for job in sample['jobs']]
    require(len(rows) == len(submitted) == 132 and len({x['id'] for x in rows}) == 132, 'independent DB job total/identity mismatch')
    require({x['id']: x for x in rows} == {x['id']: x for x in submitted}, 'independent DB rows differ from API jobs')
    require(len(audits) == 132, 'missing actual local-run audit')
    bodies = {json.loads(x['body'])['job_id']: json.loads(x['body']) for x in audits}
    for row in rows:
        expected = {'job_id': row['id'], 'package_hash': row['package_hash'], 'execution_target': 'device_local',
                    'actual_host': 'rock_os_linux_namespace', 'sent_to_cloud': False, 'amount_minor': 0}
        require(bodies.get(row['id']) == expected and row['status'] == 'succeeded' and row['error'] is None,
                'DB does not attest actual successful free local sandbox job')
    return {'actual_job_count': len(rows), 'actual_run_audit_count': len(audits),
            'job_rows_sha256': sha(canonical(rows)), 'audits_sha256': sha(canonical(audits)),
            'all_api_jobs_match_readonly_database': True, 'all_runs_local_sandbox': True}


def cancel_own_unfinished():
    """Read-only discovery; cancel only this experiment's existing unknown jobs."""
    with closing(sqlite3.connect('file:' + DATABASE + '?mode=ro', uri=True, timeout=2)) as db:
        db.execute('PRAGMA query_only=ON')
        rows = db.execute("SELECT id,key,status FROM hub_jobs WHERE key LIKE 'h2os-%' AND status IN ('running','cancel_requested')").fetchall()
    outcomes = []
    for identifier, key, status in rows:
        result = {'id': identifier, 'key': key, 'observed_status': status}
        try:
            result['cancel_receipt'] = api('cancel', key='cleanup-' + key, id=identifier)
        except BaseException as error:
            result['error'] = type(error).__name__ + ': ' + str(error)
        outcomes.append(result)
    return outcomes


def main():
    require(os.getuid() == os.geteuid() == 0 and os.uname().machine == 'aarch64' and
            'rock.benchmark.verify=1' in Path('/proc/cmdline').read_text().split(), 'explicit root ARM64 benchmark boot required')
    OUTPUT.mkdir(mode=0o700)
    info = OUTPUT.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700, 'private evidence directory required')
    protocol = PROTOCOL.read_text().split('\n## 結果\n', 1)[0]
    report = {'schema': EXPERIMENT, 'status': 'INCOMPLETE', 'scope': 'same QEMU ARM64 OS methods only',
              'started_utc': now(), 'samples': [], 'failures': [], 'preregistration': {'text': protocol, 'sha256': sha(protocol.encode())},
              'blackberry': 'NOT_RUN', 'human_time': 'NOT_MEASURED', 'physical_battery': 'NOT_MEASURED',
              'input': {'lines': 1200, 'bytes': len(INPUT.encode()), 'sha256': sha(INPUT.encode()),
                        'expected_output': EXPECTED, 'expected_output_sha256': sha(EXPECTED.encode())}}
    report['environment'] = {'uname': list(os.uname()), 'cpu_count': os.cpu_count(), 'python': sys.version,
                             'proc_meminfo': Path('/proc/meminfo').read_text(), 'proc_mounts': Path('/proc/mounts').read_text(),
                             'proc_cmdline': Path('/proc/cmdline').read_text(), 'loadavg_before': list(os.getloadavg())}
    child, reader = None, None
    try:
        report['runtime_sha256_before'] = runtime_hashes()
        read_fd, write_fd = os.pipe()
        child = os.fork()
        if child == 0:
            os.close(read_fd)
            with os.fdopen(write_fd, 'wb') as stream:
                try:
                    os.setgroups([])
                    os.setgid(1000)
                    os.setuid(1000)
                    client(stream)
                except BaseException as error:
                    send(stream, 'failure', {'error': type(error).__name__ + ': ' + str(error), 'traceback': traceback.format_exc(limit=7)})
                    os._exit(1)
            os._exit(0)
        os.close(write_fd)
        reader = os.fdopen(read_fd, 'rb', buffering=0)
        deadline = time.monotonic() + PREP_SECONDS + MEASUREMENT_SECONDS + 60
        buffer = bytearray()
        complete = False
        with selectors.DefaultSelector() as selector, (OUTPUT / 'samples.jsonl').open('xb') as journal:
            selector.register(reader, selectors.EVENT_READ)
            while True:
                require(time.monotonic() < deadline, 'benchmark child overall deadline exceeded')
                if not selector.select(1):
                    continue
                block = reader.read(65536)
                if not block:
                    require(not buffer, 'truncated child evidence frame')
                    break
                buffer.extend(block)
                require(len(buffer) <= 1024 * 1024, 'child evidence frame exceeds limit')
                while b'\n' in buffer:
                    raw, _, tail = buffer.partition(b'\n')
                    buffer = bytearray(tail)
                    event = json.loads(raw)
                    kind, value = event['type'], event['value']
                    if kind == 'sample':
                        report['samples'].append(value)
                        journal.write(canonical(value) + b'\n')
                        journal.flush()
                        os.fsync(journal.fileno())
                        print('\nROCK_BENCH_SAMPLE ' + canonical(value).decode(), flush=True)
                    elif kind == 'prepared':
                        report['preparation'] = value
                    elif kind == 'complete':
                        require(not complete, 'duplicate completion evidence')
                        report['completion'] = value
                        complete = True
                    elif kind == 'failure':
                        report['failures'].append(value)
                    else:
                        raise ValueError('unexpected child event')
        _, wait_status = os.waitpid(child, 0)
        child = None
        require(os.waitstatus_to_exitcode(wait_status) == 0 and complete and not report['failures'], 'benchmark client did not complete cleanly')
        require([(s['phase'], s['pair'], s['order_in_pair'], s['variant']) for s in report['samples']] == list(schedule()), 'fixed full sample order/count mismatch')
        require(all(s['status'] == 'succeeded' and s['output_matches_expected'] for s in report['samples']), 'unsuccessful measured sample')
        report['database'] = database_evidence(report['samples'])
        report['downloaded_package_sha256'] = {}
        for name, package in report['preparation']['packages'].items():
            actual = sha((Path('/data/platform/registry-cache/packages') / (package['hash'] + '.rock.json')).read_bytes())
            require(actual == package['hash'], 'actual downloaded package cache differs from installed hash')
            report['downloaded_package_sha256'][name] = actual
        report['runtime_sha256_after'] = runtime_hashes()
        require(report['runtime_sha256_before'] == report['runtime_sha256_after'], 'guest runtime changed during measurement')
        report['summary'] = summarize(report['samples'])
        require(report['summary'] == report['completion']['summary'], 'independent statistics differ')
        report['hypothesis_supported_within_test_conditions'] = report['summary']['B_one_workflow']['median_ms'] < report['summary']['A_three_tools']['median_ms']
        report['status'] = 'COMPLETE'
    except BaseException as error:
        report['failures'].append({'error': type(error).__name__ + ': ' + str(error), 'traceback': traceback.format_exc(limit=7)})
    finally:
        if child is not None:
            try:
                os.kill(child, signal.SIGTERM)
            except ProcessLookupError:
                pass
            os.waitpid(child, 0)
        if reader:
            reader.close()
        if report['status'] != 'COMPLETE':
            try:
                report['unfinished_cleanup'] = cancel_own_unfinished()
            except BaseException as error:
                report['unfinished_cleanup_error'] = str(error)
        report['finished_utc'] = now()
        report['environment']['loadavg_after'] = list(os.getloadavg())
        report.setdefault('summary', summarize(report['samples']))
        with (OUTPUT / 'proof.json').open('xb') as stream:
            stream.write(canonical(report) + b'\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.sync()
        print('\nROCK_BENCH_GUEST_PROOF ' + canonical(report).decode(), flush=True)
        print('\nROCK_BENCH_GUEST_' + report['status'], flush=True)
        subprocess.run(['/sbin/poweroff', '-f'], check=False)
    return 0 if report['status'] == 'COMPLETE' else 1


if __name__ == '__main__':
    sys.exit(main())
