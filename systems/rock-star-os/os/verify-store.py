#!/usr/bin/env python3
"""Real SDK -> local TLS registry -> ARM64 OS download/update/offline reboot.

Owns and stops only its child registry/QEMU processes. Every run gets fresh
server and guest data, and never modifies the source kernel or root filesystem.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time

REPO = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(REPO / 'src'), str(REPO / 'os')]
from blackberryrock.sdk import starter, sign_development
from blackberryrock.packages import canonical
from registry.publish import publish
from registry.transport import HTTPSOrigin

spec = importlib.util.spec_from_file_location('platform_boot', REPO / 'os/verify-platform.py')
boot_helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boot_helpers)


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def stop(process):
    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def build_package(directory, version):
    recipe = [{'op':'trim_lines'}, {'op':'unique_lines'}, {'op':'sort_lines'}]
    if version == '2.0.0':
        recipe.append({'op':'prefix_lines', 'value':'- '})
    source = starter(tool_id='org.rockstar.remote-text-kit', name='Store text kit', version=version, recipe=recipe)
    source['manifest']['description'] = 'ストアから取得する独立Tool。行を整理し、更新版は読みやすい箇条書きにします。'
    (directory / ('source-' + version + '.json')).write_bytes(canonical(source))
    path = directory / ('package-' + version + '.rock.json')
    path.write_bytes(canonical(sign_development(source)))
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--artifacts', type=Path, required=True)
    args = parser.parse_args()
    if sys.platform != 'linux':
        raise SystemExit('Run in the Linux build VM')
    artifacts = args.artifacts.resolve()
    evidence = Path(tempfile.mkdtemp(prefix='store-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-', dir=artifacts))
    kernel, rootfs = artifacts / 'Image', artifacts / 'rootfs.ext4'
    fixtures = REPO / 'os/registry/fixtures'
    ca = fixtures / 'development-ca.pem'
    origin = 'https://127.0.0.1:9443'
    images = {path.name: sha(path) for path in (kernel, rootfs)}
    core_files = [REPO / 'src/blackberryrock' / name for name in ('hub.py','packages.py','recipe_worker.py')]
    core_before = {str(path.relative_to(REPO)):sha(path) for path in core_files}
    report = {'status':'RUNNING', 'started_utc':datetime.now(timezone.utc).isoformat(),
              'scope':'actual Linux ARM64 guest API, real local TLS, SDK-created independent packages',
              'blackberry':'NOT_RUN', 'physical_usb':'NOT_RUN', 'real_money':'NOT_RUN',
              'gui':'separate native GUI evidence', 'images':images, 'core_sources_before':core_before,
              'public_development_fixtures':True, 'boots':[], 'publish_receipts':[]}
    server, guest = None, None
    server_log = (evidence / 'registry.log').open('wb')
    try:
        # Refuse to reuse or stop another test's server.
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(('127.0.0.1', 9443))
            probe.listen(1)
        command = [sys.executable, '-B', '-m', 'registry.server', '--state', str(evidence / 'server-state'),
                   '--authors', str(fixtures / 'approved-authors.json'), '--cert', str(ca),
                   '--fixture-key', str(fixtures / 'PUBLIC-FIXTURE-KEY.pem')]
        environment = dict(os.environ, PYTHONPATH=str(REPO / 'src') + ':' + str(REPO / 'os'))
        server = subprocess.Popen(command, env=environment, stdin=subprocess.DEVNULL, stdout=server_log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 10
        transport = HTTPSOrigin(origin, ca, timeout=1, attempts=1)
        while True:
            if server.poll() is not None:
                raise RuntimeError('owned registry exited before ready')
            try:
                transport.request('GET', '/index.json', 512 * 1024)
                break
            except ValueError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.1)
        first, second = (build_package(evidence, version) for version in ('1.0.0','2.0.0'))
        def submit(path):
            receipt = publish(origin, ca, fixtures / 'PUBLIC-AUTHOR-TOKEN.txt', path, 'sdk-' + sha(path))
            report['publish_receipts'].append(receipt)
            return receipt
        submit(first)
        data = evidence / 'userdata.ext4'
        with data.open('xb') as stream:
            stream.truncate(128 * 1024 * 1024)
        subprocess.run(['mkfs.ext4','-q','-F','-L','rock-data',str(data)],check=True)
        print('Actual OS store evidence: ' + str(evidence), flush=True)
        for phase in (1,2):
            monitor, logfile = evidence / f'qmp-{phase}.sock', evidence / f'boot-{phase}.log'
            command = ['qemu-system-aarch64','-machine','virt-10.0,gic-version=3','-accel','tcg','-cpu','cortex-a53',
                       '-m','1024','-smp','2','-display','none','-serial','stdio','-monitor','none',
                       '-qmp',f'unix:{monitor},server=on,wait=off','-no-reboot','-kernel',str(kernel),
                       '-append',f'console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.store.verify=1 rock.store.phase={phase}',
                       '-drive',f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on',
                       '-device','virtio-blk-pci,drive=osdisk,addr=0x1',
                       '-drive',f'if=none,file={data},format=raw,id=userdata',
                       '-device','virtio-blk-pci,drive=userdata,addr=0x2',
                       '-object','rng-random,filename=/dev/urandom,id=rockrng',
                       '-device','virtio-rng-pci,rng=rockrng,addr=0x3',
                       '-device','virtio-gpu-pci,xres=720,yres=960,addr=0x4',
                       '-device','virtio-keyboard-pci,addr=0x5','-device','virtio-tablet-pci,addr=0x6']
            if phase == 1:
                # Direct kernel boot does not use an x86 PXE option ROM. Minimal
                # QEMU installs need no unrelated efi-virtio.rom package here.
                command += ['-netdev','user,id=store-net','-device','virtio-net-pci,netdev=store-net,id=store-nic,addr=0x7,romfile=']
            else:
                command += ['-nic','none']
            updated, disconnected, captured = False, False, False
            with logfile.open('wb') as output:
                guest = subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT)
                deadline = time.monotonic() + 300
                while guest.poll() is None:
                    content = logfile.read_text(errors='replace')
                    if phase == 1 and not updated and 'ROCK_STORE_READY_FOR_UPDATE' in content:
                        submit(second)
                        updated = True
                    if phase == 1 and not disconnected and 'ROCK_STORE_READY_FOR_DISCONNECT' in content:
                        boot_helpers.qmp(monitor, 'screendump', {'filename':str(evidence / 'store-native-screen.png'),'format':'png'})
                        captured = True
                        boot_helpers.qmp(monitor,'set_link',{'name':'store-nic','up':False})
                        disconnected = True
                    if time.monotonic() >= deadline:
                        raise TimeoutError('store guest timed out; inspect ' + str(logfile))
                    time.sleep(0.2)
                code = guest.returncode
            content = logfile.read_text(errors='replace')
            lines = [line.split('ROCK_STORE_GUEST_PROOF ',1)[1] for line in content.splitlines() if 'ROCK_STORE_GUEST_PROOF ' in line]
            if len(lines) != 1:
                raise RuntimeError('exactly one guest proof required; inspect ' + str(logfile))
            proof = json.loads(lines[0])
            report['boots'].append({'phase':phase,'command':command,'exit_code':code,'proof':proof,
                                    'updated_through_sdk':updated,'actual_link_disconnected':disconnected,'native_capture':captured})
            if code or proof['status'] != 'PASS' or 'ROCK_STORE_GUEST_FAIL' in content:
                raise RuntimeError('store guest failed: ' + str(proof.get('error')))
            filename = '/store-proof.json' if phase == 1 else '/store-proof-2.json'
            disk = subprocess.run(['debugfs','-R','cat ' + filename,str(data)],capture_output=True,check=True,timeout=15)
            if json.loads(disk.stdout) != proof:
                raise RuntimeError('guest serial proof differs from persistent disk')
            (evidence / f'guest-proof-{phase}.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
            if phase == 1 and not (updated and disconnected):
                raise RuntimeError('required actual host/network actions were not performed')
        if {path.name:sha(path) for path in (kernel,rootfs)} != images:
            raise RuntimeError('input OS images changed during independent Tool update')
        if {str(path.relative_to(REPO)):sha(path) for path in core_files} != core_before:
            raise RuntimeError('Core source changed during SDK/Tool-only test')
        access_log = (evidence / 'registry.log').read_text(errors='replace')
        report['registry_access_log'] = 'registry.log'
        report['os_unchanged'] = True
        report['status'] = 'PASS'
        print('PASS actual OS store download/update/disconnect/offline restart',flush=True)
    except BaseException as error:
        report['status'], report['error'] = 'FAIL', type(error).__name__ + ': ' + str(error)
        raise
    finally:
        stop(guest)
        stop(server)
        server_log.close()
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (evidence/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')


if __name__ == '__main__':
    main()
