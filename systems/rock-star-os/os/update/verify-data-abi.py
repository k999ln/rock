#!/usr/bin/env python3
"""Three actual boots: valid update, foreign ABI refusal, retained valid boot.

Original images and production update source remain unchanged. Only a newly
signed development B image adds the fixed observer and an init hook. This is
not userdata migration, rollback of user data, hardware or production trust.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
from make_bundle import bundle, check_filesystem, RFC8032_PUBLIC_TEST_SEED
from rock_update import MAGIC, MAX_HEADER, UpdateError, canonical, verify_envelope


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, SOURCE / filename)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


ui = load('abi_ui_fixture', 'verify-ui-startup.py')
verify, auth, require = ui.verify, ui.auth, ui.require
INIT = b'''#!/bin/sh
[ "${1:-start}" = start ] || exit 0
case " $(cat /proc/cmdline) " in *" rock.data-abi.verify=1 "*) ;; *) exit 0;; esac
(
  mkdir -p /run/rock-data-abi
  mount -t ext4 -o ro,nosuid,nodev,noexec /dev/vdd /run/rock-data-abi || exit 1
  /usr/bin/python3 -I -B /usr/lib/rock-update/data-abi-fixture.py
  result=$?
  umount /run/rock-data-abi || result=1
  [ "$result" = 0 ] || echo ROCK_DATA_ABI_INIT_FAIL
  /sbin/poweroff
) >/dev/console 2>&1 &
exit 0
'''


def foreign_bundle(image, output, valid_envelope):
    """Correct public development signature over a deliberately foreign ABI.

    No production constant or validator is replaced even in the host process.
    The canonical valid input first passes the ordinary verifier. Only the ABI,
    sequence and version differ in this explicit negative fixture.
    """
    manifest = dict(verify_envelope(valid_envelope))
    manifest.update(data_abi='incompatible-data-v2', sequence=3, version='foreign-abi-test')
    require(manifest['sha256'] == verify.sha256(image) and manifest['size'] == image.stat().st_size,
            'negative fixture payload differs from the verified development image')
    with tempfile.TemporaryDirectory(prefix='rock-abi-public-fixture-') as temporary:
        directory = Path(temporary)
        key = directory / 'public-test-seed.der'; body = directory / 'manifest'
        key.write_bytes(bytes.fromhex('302e020100300506032b657004220420' + RFC8032_PUBLIC_TEST_SEED))
        key.chmod(0o600); body.write_bytes(canonical(manifest))
        signed = subprocess.run(['openssl', 'pkeyutl', '-sign', '-keyform', 'DER', '-inkey',
                                 str(key), '-rawin', '-in', str(body)],
                                check=True, capture_output=True, timeout=15).stdout
        pub = directory / 'public.der'; sig = directory / 'signature'
        subprocess.run(['openssl', 'pkey', '-inform', 'DER', '-in', str(key), '-pubout', '-outform',
                        'DER', '-out', str(pub)], check=True, capture_output=True, timeout=15)
        sig.write_bytes(signed)
        subprocess.run(['openssl', 'pkeyutl', '-verify', '-pubin', '-keyform', 'DER', '-inkey',
                        str(pub), '-rawin', '-in', str(body), '-sigfile', str(sig)],
                       check=True, capture_output=True, timeout=15)
    envelope = {'manifest': manifest, 'signature': signed.hex()}
    try: verify_envelope(envelope)
    except UpdateError as error:
        require(str(error) == 'incompatible persistent data ABI', 'fixture failed for another reason')
    else: raise RuntimeError('production host validator accepted foreign data ABI')
    header = canonical(envelope)
    require(len(header) <= MAX_HEADER, 'fixture header too large')
    with output.open('xb') as destination, image.open('rb') as source:
        destination.write(MAGIC + struct.pack('>I', len(header)) + header)
        shutil.copyfileobj(source, destination, 1024 * 1024)
        destination.flush(); os.fsync(destination.fileno())
    return envelope


def validate_proof(proof, *, retained, expected_slots, bundle_hash):
    require(type(proof) is dict and proof.get('schema') == 'rock-data-abi-refusal/1'
            and proof.get('status') == 'PASS' and type(proof.get('attempts')) is int and proof['attempts'] == 1
            and proof.get('reboot_retained') is retained and proof.get('data_abi') == 'rock-data-v1'
            and proof.get('expected_error') == 'incompatible persistent data ABI'
            and proof.get('foreign_bundle_sha256') == bundle_hash, 'ABI proof scope differs')
    before, after = proof.get('before'), proof.get('after')
    require(type(before) is dict and before == after and set(before) == {'state_sha256', 'slot_sha256'}
            and before['slot_sha256'] == expected_slots and isinstance(before['state_sha256'], str)
            and len(before['state_sha256']) == 64
            and all(c in '0123456789abcdef' for c in before['state_sha256']), 'ABI refusal changed state or slots')


def input_snapshot(paths):
    result = {}
    for name, path in paths.items():
        before = path.stat()
        digest = verify.sha256(path)
        after = path.stat()
        identity = lambda stat: [stat.st_dev, stat.st_ino, stat.st_mode, stat.st_size, stat.st_mtime_ns]
        require(identity(before) == identity(after), 'input changed during hash: ' + name)
        result[name] = {'identity': identity(after), 'sha256': digest}
    return result


def audit_inputs(report, paths):
    """Runs after success and failure; audit errors can never turn failure into PASS."""
    try:
        after = input_snapshot(paths)
        report['final_input_snapshot'] = after
        stable = bool(report.get('initial_input_snapshot')) and after == report['initial_input_snapshot']
        report['original_inputs_unchanged'] = stable
        if not stable:
            report['input_audit_error'] = 'input identity/content changed or initial snapshot incomplete'
    except BaseException as error:
        stable = False
        report['original_inputs_unchanged'] = False
        report['input_audit_error'] = type(error).__name__ + ': ' + str(error)
    if not stable:
        report['status'] = 'FAIL'
    return stable


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--timeout', type=int, default=180)
    parser.add_argument('--preflight-only', action='store_true')
    args = parser.parse_args()
    require(sys.platform == 'linux' and 60 <= args.timeout <= 300, 'bounded dedicated Linux QEMU run required')
    images, evidence = ui.evidence_location(args.artifacts, args.evidence)
    os.umask(0o077); evidence.mkdir(mode=0o700, exist_ok=False)
    inputs = {n: images / n for n in ('Image', 'rootfs.ext4', 'stage0.cpio.gz')}
    harness = {n: SOURCE / n for n in ('verify-data-abi.py', 'data_abi_fixture.py', 'verify-ui-startup.py',
                                     'verify-auth-health.py', 'verify-qemu.py', 'make_bundle.py')}
    audited = {**inputs, **{'harness/' + n: p for n, p in harness.items()}}
    report = {'schema': 'rock-data-abi-boots/1', 'status': 'RUNNING', 'boots': [],
              'started_utc': datetime.now(timezone.utc).isoformat(),
              'scope': 'actual frozen Updater foreign ABI refusal before writes and retained valid B boot',
              'guest_ui': 'NOT_RUN: explicit headless test; separate GUI suite required',
              'data_migration': 'NOT_IMPLEMENTED', 'physical_device': 'NOT_RUN', 'real_funds': 'NOT_USED',
              'network_adapter': 'none', 'trust': 'PUBLIC RFC8032 development fixture',
              'per_boot_seconds': args.timeout, 'host_boot_metadata_mutations': 0}
    try:
        report['initial_input_snapshot'] = input_snapshot(audited)
        report['input_sha256'] = {n: report['initial_input_snapshot'][n]['sha256'] for n in inputs}
        report['harness_sha256'] = {n: report['initial_input_snapshot']['harness/' + n]['sha256'] for n in harness}
        freeze = json.loads((images / 'freeze-manifest.json').read_text())
        require(report['input_sha256'] == {n: freeze['files_sha256'][n] for n in inputs}, 'not the frozen image triple')
        report['source_sha256'] = auth.source_checks(images, evidence)
        candidate = evidence / 'release-2.ext4'
        verify.sparse_copy(inputs['rootfs.ext4'], candidate)
        injections = [('marker-2', 'etc/rock-update/build-marker', b'release-2\n', False),
                      ('data-abi-fixture.py', 'usr/lib/rock-update/data-abi-fixture.py',
                       (SOURCE / 'data_abi_fixture.py').read_bytes(), False),
                      ('data-abi-init', 'etc/init.d/S98rock-data-abi', INIT, True)]
        report['injections'] = [ui.write_guest_file(candidate, evidence, name, path, raw, executable=executable)
                                for name, path, raw, executable in injections]
        report['unchanged_guest_files'] = {}
        for path in ('usr/lib/rock-update/rock_update.py','usr/lib/rock-update/guest_test.py',
                     'usr/lib/rock-update/fault_guest.py','etc/init.d/S97rock-update-health',
                     'etc/init.d/S99rock-ab-test','usr/bin/rock-ui','usr/sbin/rockd',
                     'usr/libexec/rock-sandbox-exec','usr/lib/rock-platform/service.py'):
            original = auth.embedded(inputs['rootfs.ext4'], path)
            require(auth.embedded(candidate, path) == original, 'fixture changed production file: ' + path)
            report['unchanged_guest_files'][path] = hashlib.sha256(original).hexdigest()
        check_filesystem(candidate)
        fixtures = evidence / 'fixtures'; fixtures.mkdir()
        valid = bundle(candidate, fixtures / 'release-2.rock', 2, 'release-2')
        foreign = foreign_bundle(candidate, fixtures / 'foreign-abi.rock', valid)
        report['candidate_envelope'], report['foreign_envelope'] = valid, foreign
        report['foreign_bundle_sha256'] = verify.sha256(fixtures / 'foreign-abi.rock')
        a, b, data, payloads = (evidence / n for n in ('slot-a.ext4','slot-b.ext4','userdata.ext4','payloads.ext4'))
        verify.sparse_copy(inputs['rootfs.ext4'], a)
        for path, size in ((b, candidate.stat().st_size), (data, 128*1024**2),
                           (payloads, sum(p.stat().st_size for p in fixtures.iterdir()) * 12//10 + 64*1024**2)):
            with path.open('xb') as stream: stream.truncate(size)
        subprocess.run(['mkfs.ext4','-q','-F','-L','rock-abi-data',str(data)],check=True,timeout=60)
        subprocess.run(['mkfs.ext4','-q','-F','-L','rock-abi-fixture','-d',str(fixtures),str(payloads)],check=True,timeout=120)
        base = ['qemu-system-aarch64','-machine','virt-10.0,gic-version=3','-cpu','cortex-a53','-accel','tcg',
                '-m','1024','-smp','2','-nographic','-monitor','none','-no-reboot','-nic','none',
                '-kernel',str(inputs['Image']),'-initrd',str(inputs['stage0.cpio.gz'])]
        for name,path,address,readonly in (('slota',a,1,False),('userdata',data,2,False),('slotb',b,4,False),('fixtures',payloads,5,True)):
            base += ['-drive',f'if=none,file={path},format=raw,id={name}' + (',readonly=on' if readonly else ''),
                     '-device',f'virtio-blk-pci,drive={name},addr=0x{address:x}']
        base += ['-object','rng-random,filename=/dev/urandom,id=rockrng','-device','virtio-rng-pci,rng=rockrng,addr=0x3']
        if args.preflight_only:
            require(report['input_sha256'] == {n:verify.sha256(p) for n,p in inputs.items()}, 'preflight changed frozen images')
            report.update(status='PREFLIGHT_ONLY', qemu='NOT_RUN')
            print('PREFLIGHT_ONLY: source, signed foreign fixture and fresh disks prepared; QEMU NOT_RUN',flush=True)
            return
        slots = {'A': report['input_sha256']['rootfs.ext4'], 'B': valid['manifest']['sha256']}
        first_proof = None
        for number in (1,2,3):
            mode = 'rock.abtest=fault-stage' if number == 1 else 'rock.data-abi.verify=1'
            command = base + ['-append','console=ttyAMA0 ro rootwait panic=1 rock.ui=headless ' + mode]
            log = evidence / f'boot-{number}.log'
            print(f'ABI guest boot {number}/3; {log}', flush=True)
            result = verify.boot(command, log, args.timeout)
            text = log.read_text(errors='replace').replace('\r','')
            require(not any(x in text for x in ('ROCK_DATA_ABI_FAIL','ROCK_DATA_ABI_INIT_FAIL','ROCK_AB_RECOVERY','Kernel panic','ROCK_AB_TEST_FAIL')),
                    'guest ABI run reported failure')
            selected = 'A sequence=1 reason=committed' if number == 1 else 'B sequence=2 reason=' + ('trial' if number == 2 else 'committed')
            require('ROCK_AB_SELECTED slot='+selected in text and 'ROCK_AB_HEALTH_CONFIRMED' in text,
                    'actual stage0 selection or health confirmation differs')
            if number == 1:
                require('ROCK_AB_PHASE_PASS phase=fault-stage' in text, 'valid B was not staged by the frozen guest installer')
            else:
                values = [json.loads(line.split(' ',1)[1]) for line in text.splitlines() if line.startswith('ROCK_DATA_ABI_PROOF ')]
                require(len(values) == 1 and 'reboot: Power down' in text, 'exact ABI proof and normal shutdown required')
                validate_proof(values[0],retained=number==3,expected_slots=slots,bundle_hash=report['foreign_bundle_sha256'])
                if number == 2: first_proof = values[0]
                else: require({**values[0], 'reboot_retained': False} == first_proof, 'reboot changed the immutable refusal proof')
                result['proof'] = values[0]
                check = subprocess.run(['e2fsck','-fn',str(data)],capture_output=True,timeout=30)
                require(check.returncode == 0, 'normal poweroff left data recovery required')
            require({n:verify.sha256(p) for n,p in (('A',a),('B',b))} == slots, 'actual boot modified valid slots')
            report['boots'].append(dict(number=number,status='PASS',log=log.name,command=command,**result))
            (evidence/'report.json').write_text(json.dumps(report,indent=2)+'\n')
        require(report['input_sha256'] == {n:verify.sha256(p) for n,p in inputs.items()}, 'frozen original images changed')
        require(report['harness_sha256'] == {n:verify.sha256(SOURCE/n) for n in report['harness_sha256']},
                'host verifier changed during the fixed trial')
        report['status'] = 'PASS'
        print('PASS: foreign ABI refused before writes and retained across actual boot',flush=True)
    except BaseException as error:
        report.update(status='FAIL',error=type(error).__name__+': '+str(error));raise
    finally:
        stable = audit_inputs(report, audited)
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (evidence/'report.json').write_text(json.dumps(report,indent=2)+'\n')
        if not stable and sys.exc_info()[0] is None:
            raise RuntimeError(report['input_audit_error'])


if __name__ == '__main__': main()
