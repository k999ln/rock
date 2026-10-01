#!/usr/bin/env python3
"""Five actual stage0 boots for purchaser-profile update and natural rollback.

Requires the root-coordinated Linux VM slot. --images is a new immutable frozen
base. Every authority, profile, signed test image, slot and data disk is created
under one NEW private output directory. Never reuses desktop/earlier proof data.
The only lost files in release3 are service-access.json and .required: Wallet
configuration remains valid, so an unrelated Wallet outage cannot mask failure.
"""
from datetime import datetime, timezone
import argparse
import hashlib
import importlib.util
import json
import multiprocessing as mp
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

SOURCE = Path(__file__).resolve().parent
REPO = SOURCE.parents[1]
sys.path[:0] = [str(SOURCE), str(REPO / 'src'), str(REPO / 'os')]
from make_bundle import bundle, check_filesystem, envelope_for
from rock_update import canonical, verify_envelope
from service_access import profile as profile_helper
from service_access import verify_os as fixture
from entitlement.protocol import PUBLIC_TOKENS
from wallet_backend.verify_os import (QMPObserver, cat, checkpoint, debug, filesystem_check,
                                      markers, metadata, save, sha, utc)
from verify_purchaser_contract import (BAD, DATABASES, ERROR, PHASES, database_summary,
                                       digest, require, validate_boot)

EARLY_HOOK = b'''#!/bin/sh
[ "${1:-start}" = start ] || exit 0
case " $(cat /proc/cmdline) " in
 *" rock.purchaser.update=3 "*|*" rock.purchaser.update=4 "*)
  /usr/bin/python3 -B -I /usr/lib/rock-update/verify_purchaser_guest.py >/dev/console 2>&1
 ;;
esac
'''
LATE_HOOK = b'''#!/bin/sh
[ "${1:-start}" = start ] || exit 0
case " $(cat /proc/cmdline) " in
 *" rock.purchaser.update=1 "*|*" rock.purchaser.update=2 "*|*" rock.purchaser.update=5 "*)
  mkdir -p /run/rock-purchaser-fixtures
  mount -t ext4 -o ro,nosuid,nodev,noexec /dev/vdd /run/rock-purchaser-fixtures || exit 1
  /usr/bin/python3 -B -I /usr/lib/rock-update/verify_purchaser_guest.py >/dev/console 2>&1 &
 ;;
esac
'''
TARGET = {**fixture.TARGET,
    'os/update/rock_update.py': '/usr/lib/rock-update/rock_update.py',
    'os/update/S97rock-update-health': '/etc/init.d/S97rock-update-health',
    'os/update/rock-boot-watchdog': '/usr/libexec/rock-boot-watchdog'}
EXTRA = set(fixture.EXTRA) | {'os/update/verify_purchaser.py', 'os/update/verify_purchaser_guest.py',
    'os/update/verify_purchaser_contract.py', 'os/update/make_bundle.py', 'os/update/init',
    'os/update/build-initramfs.py', 'os/registry/fixtures/PUBLIC-FIXTURE-KEY.pem',
    'os/registry/fixtures/approved-authors.json', 'os/registry/fixtures/PUBLIC-AUTHOR-TOKEN.txt',
    'os/entitlement/fixtures/device-handoff.json'}


def imported_sources():
    """Record imported repository helpers, including transitive pipe/TLS helpers.

    This records source inputs, not a claim that every branch was executed.
    Embedded production sources are independently joined to the frozen image.
    """
    result = set()
    for module in tuple(sys.modules.values()):
        path = getattr(module, '__file__', None)
        if path is None:
            continue
        try:
            relative = Path(path).resolve().relative_to(REPO)
        except ValueError:
            continue
        if relative.suffix == '.py' and relative.parts[0] in ('src', 'os'):
            result.add(str(relative))
    return result


def record_source(output, mapping):
    for name, expected in mapping.items():
        source = REPO / name
        require(sha(source) == expected, 'current verifier or frozen source differs: ' + name)
        target = output / 'sources' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream:
            stream.write(source.read_bytes())


def inject(image, private):
    entries = [
        ('observer.py', '/usr/lib/rock-update/verify_purchaser_guest.py', (SOURCE / 'verify_purchaser_guest.py').read_bytes()),
        ('contract.py', '/usr/lib/rock-update/verify_purchaser_contract.py', (SOURCE / 'verify_purchaser_contract.py').read_bytes()),
        ('fixture.py', '/usr/lib/rock-update/purchaser_fixture.py', (REPO / 'os/service_access/guest_probe.py').read_bytes()),
        ('early-hook', '/etc/init.d/S96rock-purchaser-update-test', EARLY_HOOK),
        ('late-hook', '/etc/init.d/S99rock-purchaser-update-test', LATE_HOOK)]
    result = []
    for name, destination, raw in entries:
        require(metadata(image, destination) is None, 'test helper would replace existing content')
        (private / name).write_bytes(raw)
        require(b'Allocated inode' in debug(image, 'write ' + name + ' ' + destination, write=True, cwd=private),
                'test helper inode not allocated')
        for field, value in [('mode', '0100755'), ('uid', '0'), ('gid', '0')]:
            debug(image, 'set_inode_field ' + destination + ' ' + field + ' ' + value, write=True)
        require(cat(image, destination) == raw and metadata(image, destination) ==
                {'type': 'regular', 'mode': 0o755, 'uid': 0, 'gid': 0}, 'test helper readback differs')
        result.append({'path': destination, 'sha256': hashlib.sha256(raw).hexdigest(), 'mode': 0o755})
    return result


def marker(image, private, sequence):
    name = 'release-marker-' + str(sequence)
    raw = ('release-' + str(sequence) + '\n').encode()
    (private / name).write_bytes(raw)
    destination = '/etc/rock-update/build-marker'
    if metadata(image, destination) is not None:
        debug(image, 'rm ' + destination, write=True)
    require(b'Allocated inode' in debug(image, 'write ' + name + ' ' + destination, write=True, cwd=private),
            'release marker not allocated')
    debug(image, 'set_inode_field ' + destination + ' mode 0100444', write=True)
    require(cat(image, destination) == raw, 'release marker differs')


def make_disks(images, private, report, ready):
    source_profile = profile_helper.prepare_profile(images, private / 'profile',
        expected_sha256=report['input_sha256'], service_configuration=ready['service'],
        wallet_configuration=ready['wallet'], wallet_token=PUBLIC_TOKENS['alice'],
        authenticator_configuration={'schema_version': 1, 'kind': 'public-software-test-authenticator',
                                    'device_ref': fixture.DEVICE})
    report['profile'] = {key: source_profile[key] for key in
                        ('schema', 'status', 'images', 'binding', 'source_sha256', 'injected_files', 'stage0')}
    factory_root = private / 'factory-rootfs.ext4'
    shutil.copyfile(private / 'profile/rootfs.ext4', factory_root)
    factory_root.chmod(0o600)
    report['test_injections'] = inject(factory_root, private)
    check_filesystem(factory_root)
    factory = envelope_for(factory_root, 1, 'factory-1')
    stage0 = private / 'stage0.cpio.gz'
    original = profile_helper._stage0(private / 'profile/stage0.cpio.gz', destination=stage0,
                                     replacement=canonical(factory) + b'\n')
    actual = profile_helper._stage0(stage0)
    require(original['other_entries_sha256'] == actual['other_entries_sha256'] and
            json.loads(actual['factory']) == factory and verify_envelope(factory)['sha256'] == sha(factory_root),
            'signed test stage0 does not bind actual factory root')
    report['test_stage0'] = {'sha256': sha(stage0), 'factory': factory,
        'other_entries_sha256': actual['other_entries_sha256'], 'entry_count': actual['entry_count'],
        'factory_rootfs_sha256': sha(factory_root), 'only_factory_envelope_changed_in_initramfs': True}
    fixture_dir = private / 'payload-files'; fixture_dir.mkdir(mode=0o700)
    candidates = {}
    for sequence in (2, 3):
        image = private / f'release-{sequence}.ext4'
        shutil.copyfile(factory_root, image); image.chmod(0o600)
        marker(image, private, sequence)
        if sequence == 3:
            for destination in (profile_helper.SERVICE_PATH, profile_helper.REQUIRED_PATH):
                require(metadata(image, destination) is not None, 'expected closed configuration absent before loss')
                debug(image, 'rm ' + destination, write=True)
                require(metadata(image, destination) is None, 'configuration-loss fixture was not applied')
        require(metadata(image, '/etc/rock-update/health-fail') is None, 'artificial health-fail file would mask policy failure')
        for destination in (profile_helper.WALLET_PATH, profile_helper.TOKEN_PATH, profile_helper.AUTH_PATH):
            require(cat(image, destination) == cat(factory_root, destination), 'unrelated Wallet/authenticator config changed')
        check_filesystem(image)
        envelope = bundle(image, fixture_dir / f'release-{sequence}.rock', sequence, f'release-{sequence}')
        candidates[str(sequence)] = {'envelope': envelope, 'image_sha256': sha(image),
                                     'bundle_sha256': sha(fixture_dir / f'release-{sequence}.rock')}
    report['candidates'] = candidates
    a, b, data, payloads = (private / name for name in ('slot-a.ext4', 'slot-b.ext4', 'userdata.ext4', 'payloads.ext4'))
    shutil.copyfile(factory_root, a)
    with b.open('xb') as stream:
        stream.truncate(factory_root.stat().st_size)
    with data.open('xb') as stream:
        stream.truncate(256 * 1024**2)
    subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-purchaser-data', str(data)],
                   check=True, capture_output=True, timeout=60)
    size = sum(p.stat().st_size for p in fixture_dir.iterdir()) * 12 // 10 + 64 * 1024**2
    with payloads.open('xb') as stream:
        stream.truncate(size)
    subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-purchaser-payload', '-d', str(fixture_dir), str(payloads)],
                   check=True, capture_output=True, timeout=120)
    return stage0, a, b, data, payloads


def boot_phase(base, phase, output, pipe, report, timeout):
    process = observer = None
    log = output / f'boot-{phase}.log'
    entry = {'phase': phase, 'status': 'RUNNING', 'log': log.name, 'host_power_commands': 0}
    report['boots'].append(entry)
    with tempfile.TemporaryDirectory(prefix='rock-purchaser-ab-qmp-') as temporary:
        monitor = Path(temporary) / 'qmp.sock'
        command = base + ['-qmp', f'unix:{monitor},server=on,wait=off', '-append',
                         f'console=ttyAMA0 ro rootwait panic=-1 rock.ui=required rock.purchaser.update={phase}']
        entry['command'] = command
        try:
            with log.open('xb') as stream:
                process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT)
                entry['qemu_pid'] = process.pid
                deadline = time.monotonic() + 15
                while not monitor.exists():
                    require(process.poll() is None and time.monotonic() < deadline, 'QEMU monitor startup failed')
                    time.sleep(.05)
                observer = QMPObserver(monitor)
                deadline = time.monotonic() + timeout
                seeded = False
                while process.poll() is None:
                    text = log.read_text(errors='replace')
                    require(not markers(text, 'ROCK_PURCHASER_UPDATE_FAIL'), 'guest failed; inspect fixed assertion label')
                    if phase == 1 and not seeded and (ready := markers(text, 'ROCK_PURCHASER_SETTLEMENT_READY')):
                        require(len(ready) == 1, 'repeated settlement request')
                        reply = fixture.rpc(pipe, 'seed'); seeded = True
                        report['settlement_fixture'] = {'boot_id': ready[0]['boot_id'], 'wallet': reply['wallet'],
                                                        'purpose': 'public settled simulator credit only after actual owner activation'}
                    require(time.monotonic() < deadline, 'guest phase timeout')
                    time.sleep(.1)
                entry['exit_code'] = process.returncode
                require(process.returncode == 0, 'QEMU did not exit normally')
                observer.thread.join(3)
                entry['qmp_events'] = observer.events
                require(not observer.errors, 'QMP observer failed')
                observer.close(); observer = None
            require(phase != 1 or seeded, 'owner activation/settlement transition missing')
            entry['log_sha256'] = sha(log)
            if phase not in BAD:
                require(len([event for event in entry['qmp_events'] if event.get('event') == 'SHUTDOWN'
                             and event.get('data', {}).get('guest') is True]) == 1, 'guest normal shutdown not observed')
                entry['shutdown_method'] = 'root-test-hook-normal-init-poweroff'
            else:
                entry['shutdown_method'] = 'actual-S97-health-failure-sync-reboot-f'
            entry.update(status='AWAITING_DURABLE_READBACK', owned_qemu_stopped=True)
        finally:
            try:
                cleanup_boot(process, observer, entry)
            finally:
                checkpoint(output / 'report.json', report)


def cleanup_boot(process, observer, entry):
    """Observer persistence/close failures must not skip owned QEMU cleanup."""
    errors = []
    if observer is not None:
        try:
            observer.close()
        except BaseException as error:
            errors.append('QMP observer close: ' + type(error).__name__)
    if process is not None and process.poll() is None:
        entry.update(status='FAIL', forced_owned_cleanup=True)
        try:
            process.terminate()
            try:
                process.wait(5)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait(5)
        except BaseException as error:
            errors.append('owned QEMU cleanup: ' + type(error).__name__)
    if errors:
        entry.update(status='FAIL', cleanup_errors=errors)
        raise RuntimeError('; '.join(errors))


def backend_history(private):
    root = private / 'backend/authority/wallet'
    return {name: database_summary(root / filename, 'authority', os.geteuid())
            for name, filename in [('wallet', 'wallet-simulator.db'), ('membership', 'entitlement.db')]}


def verify(images, output, timeout=320, qemu='qemu-system-aarch64'):
    require(sys.platform == 'linux' and 90 <= timeout <= 600, 'authorized Linux slot and bounded timeout required')
    require(all(shutil.which(name) for name in (qemu, 'debugfs', 'mkfs.ext4', 'e2fsck', 'openssl')), 'missing Linux proof dependency')
    images, output = Path(images).absolute(), Path(output).absolute()
    require(re.fullmatch(r'/[A-Za-z0-9_./-]+', str(output)) and not output.exists() and not output.is_symlink(),
            'new safe private output path required')
    os.umask(0o077); output.mkdir(mode=0o700, parents=False, exist_ok=False)
    report = {'schema': 'rock-purchaser-stage0-recovery/1', 'status': 'RUNNING', 'started_utc': utc(),
              'simulation_only': True, 'goal_complete': False, 'boots': [], 'full_update_suite': False,
              'scope': 'five actual ARM64 stage0 boots; new private authority/data; purchaser-only setting loss and natural rollback',
              'no_gui_or_hardware_or_production_secure_boot_claim': True, 'old_private_state_reused': False,
              'host_slot_or_boot_state_edits_between_boots': False, 'artificial_health_fail_file': False}
    child = pipe = None
    verified = False
    try:
        freeze = json.loads((images / 'freeze-manifest.json').read_text())
        report['input_sha256'] = {name: sha(images / name) for name in profile_helper.IMAGE_NAMES}
        require(report['input_sha256'] == {name: freeze['files_sha256'][name] for name in profile_helper.IMAGE_NAMES},
                'input images do not match final freeze')
        report['freeze_manifest_sha256'] = sha(images / 'freeze-manifest.json')
        profile_helper._inputs(images, report['input_sha256'])
        shutil.copyfile(images / 'freeze-manifest.json', output / 'freeze-manifest.json')
        source_hashes = dict(freeze['source_sha256'])
        for name in set(TARGET) | EXTRA | imported_sources():
            value = sha(REPO / name)
            require(name not in source_hashes or source_hashes[name] == value, 'frozen/current source conflict')
            source_hashes[name] = value
        for name, destination in TARGET.items():
            require(digest(cat(images / 'rootfs.ext4', destination)) == source_hashes[name], 'embedded source mismatch: ' + name)
        record_source(output, source_hashes); report['source_sha256'] = source_hashes
        private = output / 'private'; private.mkdir(mode=0o700)
        context = mp.get_context('spawn'); pipe, child_pipe = context.Pipe()
        child = context.Process(target=fixture.authority_process, args=(str(private / 'backend'), str(private / 'authority.log'), child_pipe))
        child.start(); child_pipe.close()
        ready = fixture.receive(pipe)
        require(ready.get('ready') is True and child.is_alive(), 'fresh private authority not ready')
        report['authority'] = ready['metadata']; report['authority_pid'] = ready['pid']
        stage0, a, b, data, payloads = make_disks(images, private, report, ready)
        immutable = ['stage0.cpio.gz', 'factory-rootfs.ext4', 'release-2.ext4', 'release-3.ext4',
                     'payloads.ext4', 'payload-files/release-2.rock', 'payload-files/release-3.rock']
        immutable += ['profile/' + name for name in profile_helper.IMAGE_NAMES]
        report['test_input_sha256'] = {name: sha(private / name) for name in immutable}
        base = [qemu, '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53',
                '-m', '1024', '-smp', '2', '-display', 'none', '-serial', 'stdio', '-monitor', 'none', '-no-reboot',
                '-kernel', str(images / 'Image'), '-initrd', str(stage0),
                '-drive', f'if=none,file={a},format=raw,id=slota', '-device', 'virtio-blk-pci,drive=slota,addr=0x1',
                '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
                '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
                '-drive', f'if=none,file={b},format=raw,id=slotb', '-device', 'virtio-blk-pci,drive=slotb,addr=0x4',
                '-drive', f'if=none,file={payloads},format=raw,id=fixtures,readonly=on', '-device', 'virtio-blk-pci,drive=fixtures,addr=0x5',
                '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x6', '-netdev', 'user,id=purchaser',
                '-device', 'virtio-net-pci,netdev=purchaser,addr=0x7,romfile=',
                '-device', 'virtio-keyboard-pci,addr=0x8', '-device', 'virtio-tablet-pci,addr=0x9']
        for phase in PHASES:
            print(f'Purchaser stage0 boot {phase}/5; output={output}', flush=True)
            boot_phase(base, phase, output, pipe, report, timeout)
            entry = report['boots'][-1]
            entry['slot_sha256'] = {'A': sha(a), 'B': sha(b)}
            expected_a = report['test_stage0']['factory_rootfs_sha256'] if phase == 1 else report['candidates']['3']['image_sha256']
            require(entry['slot_sha256'] == {'A': expected_a, 'B': report['candidates']['2']['image_sha256']},
                    'actual inactive-slot update/readback differs')
            if phase == 1:
                report['backend_history_initial'] = backend_history(private)
                report['initial_closed_filesystem'] = filesystem_check(data, output, 'initial')
            checkpoint(output / 'report.json', report)
        report['filesystem'] = filesystem_check(data, output, 'final')
        baseline = json.loads(cat(data, '/purchaser-update-proof/baseline.json'))
        require(json.loads(cat(data, '/platform/purchaser-service-binding.json')) == report['profile']['binding'] and
                all(baseline['service_access'][key] == ready['service'][key]
                    for key in ('authority_id', 'consumer_id', 'device_ref')) and
                ready['service']['authority_id'] == ready['metadata']['authority_id'],
                'retained guest binding is not the fresh authority/profile binding')
        for entry in report['boots']:
            phase = entry['phase']
            raw = cat(data, f'/purchaser-update-proof/phase-{phase}.json'); proof = json.loads(raw)
            log = (output / entry['log']).read_text(errors='replace')
            expected = report['test_stage0']['factory_rootfs_sha256'] if phase == 1 else report['candidates'][str(PHASES[phase][1])]['image_sha256']
            validate_boot(log, phase, proof, expected)
            require(markers(log, 'ROCK_PURCHASER_UPDATE_PASS') == [{'phase': phase, 'boot_id': proof['boot_id'],
                    'proof_sha256': digest(raw)}], 'serial and durable guest proof differ')
            require(proof['history'] == baseline['history'], 'saved phase did not retain original history')
            save(output / f'guest-{phase}.json', proof)
            entry.update(status='PASS', proof_sha256=digest(raw), history_matches_initial=True)
        require(len({read['boot_id'] for read in [json.loads(cat(data, f'/purchaser-update-proof/phase-{p}.json')) for p in PHASES]}) == 5,
                'five distinct actual kernel boots required')
        with tempfile.TemporaryDirectory(prefix='closed-read-', dir=private) as temporary:
            for role, (path, _uid) in DATABASES.items():
                local = Path(temporary) / (role + '.sqlite3'); local.write_bytes(cat(data, path)); local.chmod(0o600)
                require(database_summary(local, role, os.geteuid()) == baseline['history']['databases'][role],
                        'stopped guest database differs from retained original: ' + role)
        require(digest(cat(data, '/platform/purchaser-service-binding.json')) == baseline['history']['binding_sha256'] and
                digest(cat(data, '/purchaser-personal/meeting.txt')) == baseline['history']['personal_file_sha256'],
                'stopped owner data or service binding changed')
        final = fixture.rpc(pipe, 'snapshot')
        require(final['wallet'] == {'available_minor': 4112, 'held_minor': 0, 'billed_minor': 888,
                'bill_count': 1, 'ledger_balance_minor': 0, 'simulation_only': True} and not final['executions'],
                'unexpected authoritative debit or remote execution')
        stopped = fixture.rpc(pipe, 'stop'); child.join(15)
        require(stopped.get('stopped') is True and stopped['wallet'] == final['wallet'], 'authority normal close acknowledgement differs')
        require(not child.is_alive() and child.exitcode == 0, 'authority did not close normally')
        pipe.close(); pipe = None; child = None
        report['backend_history_final'] = backend_history(private)
        require(report['backend_history_final'] == report['backend_history_initial'], 'authority receipts or ledger changed across updates')
        report.update(authority_closed_normally=True, backend_wallet=final['wallet'], final_userdata_sha256=sha(data),
                      stopped_private_databases_verified=True, source_and_base_images_unchanged=True)
        require(report['input_sha256'] == {name: sha(images / name) for name in profile_helper.IMAGE_NAMES}, 'base images changed')
        require(report['freeze_manifest_sha256'] == sha(images / 'freeze-manifest.json'), 'base freeze manifest changed')
        require(report['test_input_sha256'] == {name: sha(private / name) for name in immutable}, 'signed test inputs changed')
        require(report['source_sha256'] == {name: sha(REPO / name) for name in report['source_sha256']}, 'source changed during proof')
        verified = True
    except BaseException as error:
        report.update(status='FAIL', error_type=type(error).__name__)
        if isinstance(error, AssertionError):
            report['error_label'] = str(error)[:240]
    finally:
        if child is not None:
            try:
                if child.is_alive() and pipe is not None:
                    pipe.send({'op': 'stop'}); fixture.receive(pipe, 15)
                child.join(15)
                if child.is_alive():
                    report.setdefault('cleanup_errors', []).append('owned authority required forced termination')
                    child.terminate(); child.join(5)
                    if child.is_alive():
                        child.kill(); child.join(5)
                if child.exitcode != 0:
                    report.setdefault('cleanup_errors', []).append('owned authority nonzero exit')
            except BaseException as error:
                report.setdefault('cleanup_errors', []).append('authority cleanup: ' + type(error).__name__)
                if child.is_alive():
                    child.terminate(); child.join(5)
                    if child.is_alive():
                        child.kill(); child.join(5)
        if pipe is not None:
            pipe.close()
        report.update(finished_utc=utc(), status='PASS' if verified and not report.get('cleanup_errors') else 'FAIL')
        report['export_files'] = ['report.json'] + [str(p.relative_to(output)) for p in sorted(output.rglob('*'))
            if p.is_file() and 'private' not in p.relative_to(output).parts and p.name != 'report.json']
        if not checkpoint(output / 'report.json', report):
            raise RuntimeError('final proof could not be persisted; private state retained')
    require(report['status'] == 'PASS', 'purchaser stage0 proof failed; retained evidence: ' + str(output))
    print('PASS: five purchaser stage0 update/recovery boots; output=' + str(output), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--images', type=Path, required=True, help='new immutable freeze with Image/rootfs/stage0/manifest')
    parser.add_argument('--output', type=Path, required=True, help='new private evidence directory; existing parent only')
    parser.add_argument('--timeout', type=int, default=320)
    parser.add_argument('--qemu', default='qemu-system-aarch64')
    args = parser.parse_args()
    verify(args.images, args.output, args.timeout, args.qemu)
