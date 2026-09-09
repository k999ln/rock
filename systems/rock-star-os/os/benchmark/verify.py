#!/usr/bin/env python3
"""Prepare public SDK fixtures; separately run an exclusive actual-OS experiment."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path[:0] = [str(HERE), str(REPO / 'src'), str(REPO / 'os')]
from common import *
from blackberryrock.sdk import starter, sign_development
from registry.publish import publish
from registry.transport import HTTPSOrigin


def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def prepare(directory):
    directory.mkdir(parents=True, exist_ok=False)
    protocol = (REPO / 'docs/PRODUCT-EXPERIMENTS-OS.md').read_text().split('\n## 結果\n', 1)[0]
    report = {'schema': EXPERIMENT, 'prepared_utc': now(), 'preregistration_sha256': sha(protocol.encode()),
              'packages': {}, 'sources': {name: file_hash(HERE / name) for name in ('common.py', 'guest.py')}}
    (directory / 'preregistration.md').write_text(protocol)
    (directory / 'input.txt').write_bytes(INPUT.encode())
    (directory / 'expected.txt').write_bytes(EXPECTED.encode())
    for name in NAMES:
        operations = OPERATIONS if name == 'workflow' else (name,)
        source = starter(tool_id=IDS[name], name='H2 OS ' + name,
                         recipe=[{'op': op} for op in operations])
        source['manifest']['description'] = 'Pre-registered comparison within one ARM64 development OS.'
        if name == 'workflow':
            source['manifest']['kind'] = 'Workflow'
        package = sign_development(source)
        filename = name + '.rock.json'
        (directory / (name + '.source.json')).write_bytes(canonical(source))
        (directory / filename).write_bytes(canonical(package))
        report['packages'][name] = {'id': IDS[name], 'filename': filename, 'sha256': sha(canonical(package))}
    report['input_sha256'] = file_hash(directory / 'input.txt')
    report['expected_sha256'] = file_hash(directory / 'expected.txt')
    (directory / 'preparation.json').write_bytes(canonical(report) + b'\n')
    print('PREPARED ONLY; no experiment executed: ' + str(directory), flush=True)


def host_state(excluded_pid=None):
    conflicts = []
    build_names = {'make', 'gmake', 'ninja', 'cc1', 'cc1plus', 'gcc', 'g++', 'clang', 'clang++', 'ld', 'ld.lld'}
    for process in Path('/proc').glob('[0-9]*'):
        try:
            pid = int(process.name)
            name = Path(os.readlink(process / 'exe')).name
            if pid != excluded_pid and (name.startswith('qemu-system-') or name in build_names or
                                        name.endswith(('-gcc', '-g++', '-ld'))):
                conflicts.append({'pid': pid, 'executable': name})
        except (OSError, ValueError):
            continue
    return {'loadavg': list(os.getloadavg()), 'cpu_count': os.cpu_count(), 'conflicting_processes': conflicts,
            'uname': list(os.uname()), 'observed_utc': now()}


def validate_proof(proof, preparation):
    require(proof['schema'] == EXPERIMENT and proof['status'] == 'COMPLETE' and not proof['failures'], 'guest experiment incomplete')
    require(proof['preregistration']['sha256'] == preparation['preregistration_sha256'] ==
            sha(proof['preregistration']['text'].encode()), 'preregistration differs from prepared protocol')
    require(proof['input']['sha256'] == preparation['input_sha256'] == sha(INPUT.encode()) and
            proof['input']['expected_output'] == EXPECTED and proof['input']['bytes'] == len(INPUT.encode()), 'input/oracle differs')
    require(proof['runtime_sha256_before'] == proof['runtime_sha256_after'], 'guest runtime changed')
    require(set(proof['runtime_sha256_before']) == set(RUNTIME) | {'/usr/lib/rock-benchmark/common.py', '/usr/lib/rock-benchmark/guest.py'},
            'guest runtime hash inventory is incomplete')
    for name, digest in preparation['sources'].items():
        require(proof['runtime_sha256_before']['/usr/lib/rock-benchmark/' + name] == digest,
                'running guest measurement code differs from prepared code')
    require(proof['preparation']['uid'] == proof['preparation']['gid'] == 1000, 'wrong measurement client identity')
    require(proof['environment']['uname'][0] == 'Linux' and proof['environment']['uname'][4] == 'aarch64' and
            proof['environment']['cpu_count'] == 2, 'actual guest environment differs from protocol')
    mounts = [line.split() for line in proof['environment']['proc_mounts'].splitlines()]
    root = next((x for x in mounts if x[1] == '/'), None)
    data = next((x for x in mounts if x[1] == '/data'), None)
    require(root is not None and root[2] == 'ext4' and 'ro' in root[3].split(',') and data is not None and
            data[:3] == ['/dev/vdb', '/data', 'ext4'] and {'rw', 'nosuid', 'nodev', 'noexec'} <= set(data[3].split(',')),
            'guest root/data protections differ from protocol')
    require(proof['downloaded_package_sha256'] == {name: entry['sha256'] for name, entry in preparation['packages'].items()},
            'actual downloaded package cache evidence differs from SDK packages')
    require(proof['preparation']['wallet_sha256'] == proof['completion']['wallet_final_sha256'], 'Wallet changed')
    samples = proof['samples']
    require([(x['phase'], x['pair'], x['order_in_pair'], x['variant']) for x in samples] == list(schedule()), 'sample order/count changed')
    ids = set()
    for sample in samples:
        names = OPERATIONS if sample['variant'] == 'A' else ('workflow',)
        require(sample['status'] == 'succeeded' and sample['jobs_started'] == len(sample['jobs']) == len(names), 'wrong successful job count')
        require(type(sample['elapsed_ns']) is int and sample['elapsed_ns'] > 0, 'invalid elapsed time')
        text = INPUT
        for step, (name, job) in enumerate(zip(names, sample['jobs'])):
            expected_key = f"h2os-{sample['phase']}-{sample['pair']}-{sample['variant']}-{step}"
            require(job['id'] not in ids, 'actual job reused between trials')
            ids.add(job['id'])
            require(job['status'] == 'succeeded' and job['error'] is None and job['tool_id'] == IDS[name] and
                    job['package_hash'] == preparation['packages'][name]['sha256'] and job['key'] == expected_key and
                    job['request_hash'] == sha(canonical({'id': IDS[name], 'text': text, 'target': 'device_local'})) and
                    job['input_bytes'] == len(text.encode()), 'actual job/input/package evidence mismatch')
            text = job['output']
        require(text == EXPECTED and sample['output_matches_expected'] is True and
                sample['output_sha256'] == sha(EXPECTED.encode()), 'final full output differs')
    require(len(ids) == 132 and proof['database']['actual_job_count'] == proof['database']['actual_run_audit_count'] == 132 and
            proof['database']['all_api_jobs_match_readonly_database'] and proof['database']['all_runs_local_sandbox'], 'independent actual database proof missing')
    summary = summarize(samples)
    require(summary == proof['summary'] == proof['completion']['summary'], 'summary differs from all retained samples')
    require(proof['hypothesis_supported_within_test_conditions'] ==
            (summary['B_one_workflow']['median_ms'] < summary['A_three_tools']['median_ms']), 'hypothesis criterion changed')


def stop(process):
    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def verify(artifacts, prepared):
    require(sys.platform == 'linux', 'actual verification runs only in the Linux build VM')
    preparation = json.loads((prepared / 'preparation.json').read_text())
    require(preparation['schema'] == EXPERIMENT, 'unknown preparation')
    require(file_hash(prepared / 'preregistration.md') == preparation['preregistration_sha256'], 'prepared protocol was changed')
    require(file_hash(prepared / 'input.txt') == preparation['input_sha256'] == sha(INPUT.encode()) and
            file_hash(prepared / 'expected.txt') == preparation['expected_sha256'] == sha(EXPECTED.encode()), 'prepared input changed')
    require({name: file_hash(HERE / name) for name in preparation['sources']} == preparation['sources'], 'source changed after preparation')
    for entry in preparation['packages'].values():
        require(Path(entry['filename']).name == entry['filename'] and file_hash(prepared / entry['filename']) == entry['sha256'], 'prepared package changed')
    kernel, rootfs = artifacts / 'Image', artifacts / 'rootfs.ext4'
    hashes = {p.name: file_hash(p) for p in (kernel, rootfs)}
    evidence = Path(tempfile.mkdtemp(prefix='benchmark-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-', dir=artifacts))
    report = {'schema': EXPERIMENT, 'status': 'INCOMPLETE', 'started_utc': now(), 'prepared': str(prepared),
              'image_sha256_before': hashes, 'host_before': host_state(), 'publish_receipts': [],
              'scope': 'one QEMU ARM64 OS, A three Tools versus B one Workflow only',
              'blackberry': 'NOT_RUN', 'human_time': 'NOT_MEASURED', 'physical_battery': 'NOT_MEASURED'}
    server, guest = None, None
    server_log = (evidence / 'registry.log').open('wb')
    try:
        require(not report['host_before']['conflicting_processes'], 'other QEMU/build activity prevents fixed-condition measurement')
        shutil.copytree(prepared, evidence / 'prepared')
        fixtures = REPO / 'os/registry/fixtures'
        ca, origin = fixtures / 'development-ca.pem', 'https://127.0.0.1:9443'
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 9443))
        command = [sys.executable, '-B', '-m', 'registry.server', '--state', str(evidence / 'server-state'),
                   '--authors', str(fixtures / 'approved-authors.json'), '--cert', str(ca),
                   '--fixture-key', str(fixtures / 'PUBLIC-FIXTURE-KEY.pem')]
        server = subprocess.Popen(command, env=dict(os.environ, PYTHONPATH=str(REPO / 'src') + ':' + str(REPO / 'os')),
                                  stdin=subprocess.DEVNULL, stdout=server_log, stderr=subprocess.STDOUT)
        transport = HTTPSOrigin(origin, ca, timeout=1, attempts=1)
        deadline = time.monotonic() + 10
        while True:
            require(server.poll() is None, 'owned registry failed before readiness')
            try:
                transport.request('GET', '/index.json', 512 * 1024)
                break
            except ValueError:
                require(time.monotonic() < deadline, 'registry readiness deadline exceeded')
                time.sleep(.1)
        for name in NAMES:
            package = prepared / preparation['packages'][name]['filename']
            receipt = publish(origin, ca, fixtures / 'PUBLIC-AUTHOR-TOKEN.txt', package, 'h2os-publish-' + file_hash(package))
            report['publish_receipts'].append(receipt)
        data = evidence / 'userdata.ext4'
        with data.open('xb') as stream:
            stream.truncate(128 * 1024 * 1024)
        subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-benchmark', str(data)], check=True, timeout=30)
        command = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53',
                   '-m', '1024', '-smp', '2', '-display', 'none', '-serial', 'stdio', '-monitor', 'none', '-no-reboot',
                   '-kernel', str(kernel), '-append',
                   'console=ttyAMA0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.benchmark.verify=1',
                   '-drive', f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on', '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
                   '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
                   '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
                   '-netdev', 'user,id=store-net', '-device', 'virtio-net-pci,netdev=store-net,id=store-nic,addr=0x4,romfile=']
        report['command'] = command
        report['qemu_version'] = subprocess.check_output(['qemu-system-aarch64', '--version'], text=True)
        log = evidence / 'boot.log'
        print('Actual OS benchmark evidence: ' + str(evidence), flush=True)
        with log.open('wb') as stream:
            guest = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + 1200
            while guest.poll() is None:
                require(time.monotonic() < deadline, 'guest benchmark exceeded 1200 seconds')
                time.sleep(.5)
            report['exit_code'] = guest.returncode
        lines = log.read_text(errors='replace').replace('\r', '').splitlines()
        prefix = 'ROCK_BENCH_GUEST_PROOF '
        proofs = [json.loads(line[len(prefix):]) for line in lines if line.startswith(prefix)]
        require(len(proofs) == 1, 'exactly one actual guest proof required')
        proof = proofs[0]
        (evidence / 'guest-proof.json').write_bytes(canonical(proof) + b'\n')
        disk = subprocess.run(['debugfs', '-R', 'cat /benchmark/proof.json', str(data)], capture_output=True, check=True, timeout=20)
        require(json.loads(disk.stdout) == proof, 'serial proof differs from durable guest proof')
        sample_file = subprocess.run(['debugfs', '-R', 'cat /benchmark/samples.jsonl', str(data)], capture_output=True, check=True, timeout=20)
        samples = [json.loads(line) for line in sample_file.stdout.splitlines()]
        require(samples == proof['samples'], 'durable sample journal differs from final evidence')
        (evidence / 'samples.jsonl').write_bytes(sample_file.stdout)
        require(guest.returncode == 0, 'QEMU did not shut down cleanly')
        validate_proof(proof, preparation)
        report['host_after'] = host_state()
        require(not report['host_after']['conflicting_processes'], 'other build/QEMU activity changed the measurement conditions')
        require(hashes == {p.name: file_hash(p) for p in (kernel, rootfs)}, 'OS inputs changed')
        report.update(status='COMPLETE', summary=proof['summary'],
                      hypothesis_supported_within_test_conditions=proof['hypothesis_supported_within_test_conditions'],
                      guest_proof_sha256=sha(canonical(proof)), durable_proof_matches_serial=True)
        print('COMPLETE actual OS comparison: ' + json.dumps(report['summary']), flush=True)
    except BaseException as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
        raise
    finally:
        stop(guest)
        stop(server)
        server_log.close()
        report['finished_utc'] = now()
        report['image_sha256_after'] = {p.name: file_hash(p) for p in (kernel, rootfs)}
        (evidence / 'report.json').write_bytes(canonical(report) + b'\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest='action', required=True)
    first = actions.add_parser('prepare', help='build public fixtures only; no server or OS execution')
    first.add_argument('--output', required=True, type=Path)
    second = actions.add_parser('verify', help='actual exclusive Linux QEMU experiment')
    second.add_argument('--prepared', required=True, type=Path)
    second.add_argument('--artifacts', required=True, type=Path)
    args = parser.parse_args()
    if args.action == 'prepare':
        prepare(args.output.resolve())
    else:
        verify(args.artifacts.resolve(strict=True), args.prepared.resolve(strict=True))


if __name__ == '__main__':
    main()
