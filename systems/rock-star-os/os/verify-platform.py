#!/usr/bin/env python3
"""Boot the real integrated OS with a native display, no NIC, and guest tests."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
from datetime import datetime, timezone


def qmp(path, execute, arguments=None):
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(5)
        connection.connect(str(path))
        stream = connection.makefile('rwb', buffering=0)
        json.loads(stream.readline())
        stream.write(b'{"execute":"qmp_capabilities"}\n')
        while 'return' not in json.loads(stream.readline()):
            pass
        stream.write(json.dumps({'execute': execute, 'arguments': arguments or {}, 'id': 'rock'}).encode() + b'\n')
        while True:
            message = json.loads(stream.readline())
            if message.get('id') == 'rock':
                if 'error' in message:
                    raise RuntimeError(str(message['error']))
                return message['return']


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def scoped_proof(content, persisted):
    marker = 'ROCK_PLATFORM_ISOLATION_GUEST_PASS '
    rows = [json.loads(line[len(marker):]) for line in content.splitlines() if line.startswith(marker)]
    if len(rows) != 1 or rows[0].get('schema') != 'rock-os-platform-isolation/1' or \
            rows[0].get('status') != 'PASS_SCOPED' or rows[0].get('scope') != 'game-isolation' or \
            not isinstance(rows[0].get('checks'), list) or not rows[0]['checks'] or \
            not rows[0].get('wallet_financial_assertions', '').startswith('NOT_RUN;'):
        raise RuntimeError('exactly one scoped guest proof with explicit financial exclusion required')
    if json.loads(persisted) != rows[0]:
        raise RuntimeError('stopped guest proof differs from actual serial observation')
    return rows[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scope', choices=('local-full', 'game-isolation'), default='local-full')
    parser.add_argument('--artifacts', type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    artifacts = (args.artifacts or Path(os.environ.get('ROCK_OS_ARTIFACTS', str(repo / 'artifacts/os')))).resolve()
    evidence = Path(tempfile.mkdtemp(prefix='platform-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-', dir=artifacts))
    kernel, rootfs = artifacts / 'Image', artifacts / 'rootfs.ext4'
    data, monitor, log = evidence / 'userdata.ext4', evidence / 'qmp.sock', evidence / 'boot.log'
    with data.open('xb') as stream:
        stream.truncate(128 * 1024 * 1024)
    subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], check=True)
    before = {p.name: digest(p) for p in (kernel, rootfs)}
    command = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg',
               '-cpu', 'cortex-a53', '-m', '1024', '-smp', '2', '-display', 'none',
               '-serial', 'stdio', '-monitor', 'none', '-qmp', f'unix:{monitor},server=on,wait=off',
               '-no-reboot', '-nic', 'none', '-kernel', str(kernel), '-append',
               'console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.platform.verify=1',
               '-drive', f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on',
               '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
               '-drive', f'if=none,file={data},format=raw,id=userdata',
               '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
               '-object', 'rng-random,filename=/dev/urandom,id=rockrng',
               '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
               '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4',
               '-device', 'virtio-keyboard-pci,addr=0x5',
               '-device', 'virtio-tablet-pci,addr=0x6']
    report = {'status': 'RUNNING', 'command': command, 'image_sha256': before,
              'network_adapter': 'none', 'blackberry': 'NOT_RUN', 'scope':args.scope,
              'wallet': 'NOT_RUN' if args.scope == 'game-isolation' else 'SIMULATOR_ONLY'}
    if args.scope == 'game-isolation':
        from game_exchange import profile
        binding = profile.verified(profile.device_config(artifacts, 'platform-isolation'))
        report['profile_binding'] = {key:binding[key] for key in ('profile','profile_sha256','factory_sha256')}
        command[command.index('-append')+1] += ' rock.platform.verify_scope=game-isolation'
    print('Integrated OS boot evidence: ' + str(evidence), flush=True)
    try:
        with log.open('wb') as output:
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT)
            deadline, screenshot_after, captured = time.monotonic() + 240, None, False
            try:
                while process.poll() is None:
                    content = log.read_text(errors='replace')
                    if 'PASS native OS catalog signed packages' in content and screenshot_after is None:
                        screenshot_after = time.monotonic() + 1
                    if not captured and screenshot_after is not None and time.monotonic() >= screenshot_after:
                        try:
                            qmp(monitor, 'screendump', {'filename': str(evidence / 'native-os-display.png'), 'format': 'png'})
                            captured = True
                        except (OSError, ValueError, RuntimeError) as error:
                            report['screenshot_error'] = str(error)
                            screenshot_after = time.monotonic() + 2
                    if time.monotonic() > deadline:
                        raise TimeoutError('integrated OS boot exceeded 240 seconds')
                    time.sleep(0.2)
                report['exit_code'] = process.returncode
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
        content = log.read_text(errors='replace')
        guest_marker = 'ROCK_PLATFORM_ISOLATION_GUEST_PASS' if args.scope == 'game-isolation' else 'ROCK_PLATFORM_GUEST_PASS'
        required = ['ROCK_PLATFORM_READY', guest_marker, 'ROCK_PLATFORM_VERIFY_PASS',
                    'ROCK_SANDBOX_RESOURCE_GUEST_PASS']
        report['missing'] = [marker for marker in required if marker not in content]
        resource_lines = [line.split('ROCK_SANDBOX_RESOURCE_GUEST_PASS ', 1)[1] for line in content.splitlines()
                          if line.startswith('ROCK_SANDBOX_RESOURCE_GUEST_PASS ')]
        if len(resource_lines) != 1:
            raise RuntimeError('exactly one real sandbox resource proof required')
        report['resource_probes'] = json.loads(resource_lines[0])
        report['resource_probe_scope'] = 'fixed sandbox diagnostics; per-file size only; Hub crash/deadline lifecycle NOT_RUN'
        if [value.get('mode') for value in report['resource_probes']] != ['memory', 'cpu', 'file-size', 'crash'] or \
                any(value.get('status') != 'PASS' for value in report['resource_probes']):
            raise RuntimeError('all fixed resource denial cases are required')
        report['native_framebuffer_capture'] = captured
        if process.returncode != 0 or report['missing'] or 'ROCK_PLATFORM_GUEST_FAIL' in content:
            raise RuntimeError('integrated guest checks failed; inspect boot.log')
        if {p.name: digest(p) for p in (kernel, rootfs)} != before:
            raise RuntimeError('read-only OS images changed')
        if args.scope == 'game-isolation':
            if 'reboot: Power down' not in content:
                raise RuntimeError('scoped guest did not shut down normally')
            persisted = subprocess.run(['debugfs','-R','cat /platform-isolation-test.json',str(data)],capture_output=True,check=True,timeout=30)
            proof = scoped_proof(content, persisted.stdout)
            check = subprocess.run(['e2fsck','-f','-n',str(data)],capture_output=True,timeout=30)
            (evidence/'filesystem-check.log').write_bytes(check.stdout+check.stderr)
            if check.returncode:
                raise RuntimeError('scoped normal shutdown did not leave a consistent filesystem')
            report.update(guest_proof=proof,normal_shutdown=True,filesystem_consistent=True,
                          wallet_financial_assertions='NOT_RUN',tool_implicit_earnings='NOT_RUN')
        report['status'] = 'PASS_SCOPED' if args.scope == 'game-isolation' else 'PASS'
        print('PASS: native OS platform checks; ' + str(evidence), flush=True)
    except BaseException as error:
        report['status'], report['error'] = 'FAIL', str(error)
        raise
    finally:
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (evidence / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
