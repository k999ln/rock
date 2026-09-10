#!/usr/bin/env python3
"""Three headless QEMU boots of a disposable derived rootfs; no production edit.

This is launcher-fault/Hub API evidence. The original Image/rootfs/stage0 triple
is hashed before/after, but only Image is booted unchanged. Stage0/A-B and GUI
are NOT_RUN. All pre-existing /usr,/lib,/bin,/sbin,/etc runtime files are compared
before/after injection. The derived rootfs has its own distinct recorded hash.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time

REPO = Path(__file__).resolve().parents[1]
SOURCE = REPO/'os/platform/hub_fault_fixture.py'
spec = importlib.util.spec_from_file_location('fixed_hub_fault_contract', SOURCE)
fixture = importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)
require = fixture.require
PREFIXES = ('usr', 'lib', 'bin', 'sbin', 'etc')
HOOK = 'usr/libexec/rock-hub-fault-fixture.py'
RUNTIME = 'usr/libexec/rock-hub-fault-runtime.json'
INIT = 'etc/init.d/S98rock-hub-fault-verify'
TIMEOUT = 240


def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(path, value):
    path.write_bytes(json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False).encode()+b'\n')


def regular(path):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not info.st_mode & 0o022, 'immutable regular input required: '+str(path))
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


def embedded(image, path):
    result = subprocess.run(['debugfs', '-R', 'cat /'+path, str(image)], capture_output=True, timeout=30)
    require(result.returncode == 0 and result.stdout and len(result.stdout) <= 32*1024*1024,
            'missing or oversized embedded file: '+path)
    return result.stdout


def check_fs(image):
    result = subprocess.run(['e2fsck','-f','-n',str(image)], capture_output=True, text=True, timeout=60)
    require(result.returncode == 0, 'filesystem must be clean; no repair is performed')
    return {'exit_code': 0, 'output': result.stdout+result.stderr}


def tree_manifest(image, parent):
    """Read-only debugfs exports; directories never become a guest root mount."""
    parent.mkdir(mode=0o700)
    for prefix in PREFIXES:
        # Map only this invoking user to namespace root so rdump can preserve
        # root-owned runtime metadata without sudo or changing host ownership.
        # Everything except the new export directory is bound read-only.
        command = ['bwrap','--unshare-user','--uid','0','--gid','0','--unshare-net','--die-with-parent',
                   '--ro-bind','/','/','--bind',str(parent),str(parent),
                   '--cap-add','CAP_CHOWN','--cap-add','CAP_FOWNER',
                   'debugfs','-R','rdump /'+prefix+' '+str(parent),str(image)]
        result = subprocess.run(command,
                                capture_output=True, text=True, timeout=120)
        lines = [line for line in result.stderr.splitlines() if line and not line.startswith('debugfs ')]
        require(result.returncode == 0 and not lines and (parent/prefix).exists(),
                'runtime export failed: '+prefix+'; '+result.stderr[:2000])
    manifest, total = {}, 0
    for directory, directories, files in os.walk(parent, followlinks=False):
        for name in sorted(directories+files):
            path = Path(directory)/name; value = path.lstat(); relative = path.relative_to(parent).as_posix()
            if stat.S_ISLNK(value.st_mode): item = {'kind':'symlink','target':os.readlink(path)}
            elif stat.S_ISDIR(value.st_mode): item = {'kind':'directory'}
            else:
                require(stat.S_ISREG(value.st_mode), 'unexpected special file in installed runtime')
                total += value.st_size
                require(total <= 2*1024**3, 'runtime export exceeds fixed byte limit')
                item = {'kind':'file','bytes':value.st_size,'sha256':digest(path)}
            item['mode'] = stat.S_IMODE(value.st_mode)
            manifest[relative] = item
            require(len(manifest) <= 20000, 'runtime inventory exceeds fixed path limit')
    require(len(manifest) >= 100 and manifest.get('usr/libexec/rock-sandbox-exec',{}).get('kind') == 'file',
            'installed runtime inventory is incomplete')
    return manifest


def inject(image, directory, name, path, raw, executable=False):
    target = directory/name; target.write_bytes(raw)
    for command in ('write '+name+' /'+path,
                    'set_inode_field /'+path+' mode '+('0100755' if executable else '0100644')):
        result = subprocess.run(['debugfs','-w','-R',command,image.name], cwd=directory,
                                capture_output=True, text=True, timeout=30)
        require(result.returncode == 0 and (not command.startswith('write ') or 'Allocated inode' in result.stdout),
                'new fixed hook injection failed; never replace an existing file')
    require(embedded(image,path) == raw, 'fixed hook readback differs')
    return {'path':path,'sha256':hashlib.sha256(raw).hexdigest(),'test_only':True}


def closed_export(image, source, destination):
    for suffix in ('','-wal','-journal'):
        output = str(destination)+suffix
        result = subprocess.run(['debugfs','-R','dump /'+source+suffix+' '+output,str(image)],
                                capture_output=True, timeout=30)
        require(result.returncode == 0, 'closed Hub DB extraction failed')
        if suffix:
            if Path(output).exists(): require(Path(output).stat().st_size == 0, 'pending Hub SQLite journal after shutdown')
            else: require(b'File not found' in result.stderr, 'could not prove journal absence')
    require(destination.is_file(), 'actual closed business DB missing')


def closed_rows(image, directory):
    destination = directory/'observed-hub.sqlite3'
    closed_export(image,'platform/hub.db',destination)
    with closing(sqlite3.connect(destination.as_uri()+'?mode=ro',uri=True)) as db:
        db.execute('PRAGMA query_only=ON'); db.row_factory = sqlite3.Row
        require(tuple(db.execute('PRAGMA integrity_check').fetchone()) == ('ok',), 'closed Hub integrity failed')
        return {table:[dict(row) for row in db.execute('SELECT * FROM '+table+' ORDER BY '+order+' LIMIT 20')]
                for table,order in (('hub_jobs','created'),('hub_requests','key'),('hub_audit','seq'))}


def validate_result(proof, mode, rows, package_hash):
    fixture.validate_durable_rows(rows,package_hash)
    require(proof.get('schema') == 'rock-hub-fault-proof/1' and proof.get('status') == 'PASS' and proof.get('mode') == mode and
            proof.get('durable_rows') == rows, 'serial proof differs from actual stopped Hub DB')
    require(len(rows['hub_jobs']) == proof['job_count'] == (2 if mode == 'crash' else 4) and
            len(rows['hub_requests']) == len(rows['hub_audit']) == proof['job_count']+2,
            'actual job/receipt/audit counts differ')
    if mode != 'recovery':
        fault = proof['fault']; parent = proof['platform_identity']
        fixture.validate_prearm(fault.get('prearm_inventory'), parent['pid'])
        fixture.validate_launcher(fault['identity'], parent_pid=parent['pid'],
                                  tracer_pid=fault['identity']['tracer_pid'], previous_pids=set())
        require(fault['identity']['tracer_pid'] > 1, 'actual root tracer identity missing')
        fixture.validate_verifier_evidence(fault.get('signature_verifier'), parent_pid=parent['pid'],
                                          tracer_pid=fault['identity']['tracer_pid'], launcher_pid=fault['identity']['pid'])
        capture = fault.get('capture_elapsed_seconds')
        require(type(capture) in (int, float) and 0 <= capture <= 4, 'complete fixed four-second capture evidence required')
        fixture.validate_fault(mode, fault)
        fixture.validate_failure(mode, proof['failed_job'])
        fixture.validate_replay(proof['accepted'],proof['replay'])
        require(proof['failed_job'] in rows['hub_jobs'] and proof['retry_job'] in rows['hub_jobs'] and
                proof['accepted']['result']['id'] == proof['failed_job']['id'] and
                proof['failed_job']['key'] == 'd3-hub:'+mode and
                proof['retry_job']['key'] == 'd3-hub:'+mode+':explicit-retry' and
                proof['retry_job']['status'] == 'succeeded' and proof['retry_job']['output'] == fixture.OUTPUT and
                proof['retry_job']['error'] is None and proof['failed_job']['id'] != proof['retry_job']['id'],
                'actual failed/new explicit retry identity or content differs')
        receipt = [r for r in rows['hub_requests'] if r['key'] == proof['failed_job']['key']]
        require(len(receipt) == 1 and json.loads(receipt[0]['result']) == proof['accepted']['result'],
                'durable original acceptance receipt missing')
        require(proof['conflict'].get('ok') is False and proof['conflict'].get('code') == 'rejected',
                'same-key conflicting payload was not rejected')


def reject_serial_failure(content):
    lines = content.replace(b'\r', b'').split(b'\n')[:-1]
    require(not any(line == b'ROCK_HUB_FAULT_FAIL' or line.startswith(b'ROCK_HUB_FAULT_FAIL ') for line in lines),
            'guest explicitly reported failure; owned QEMU is stopped as FAIL')


def boot(command, log):
    process = None; started = time.monotonic()
    try:
        with log.open('wb') as stream:
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT)
            while process.poll() is None:
                require(time.monotonic()-started <= TIMEOUT, 'fixed boot deadline exceeded')
                require(log.stat().st_size <= 4*1024*1024, 'serial evidence exceeds fixed byte limit')
                reject_serial_failure(log.read_bytes())
                time.sleep(.1)
            require(process.returncode == 0, 'owned QEMU did not exit normally')
        content = log.read_text(errors='replace')
        require('ROCK_HUB_FAULT_FAIL' not in content and 'Kernel panic' not in content and
                'Power down' in content, 'guest failure or missing real kernel shutdown')
        lines = [line[len('ROCK_HUB_FAULT_PROOF '):] for line in content.splitlines() if line.startswith('ROCK_HUB_FAULT_PROOF ')]
        require(len(lines) == 1, 'exactly one real guest proof is required per boot')
        return json.loads(lines[0]), {'exit_code':0,'elapsed_seconds':time.monotonic()-started,'log_sha256':digest(log)}
    finally:
        if process is not None and process.poll() is None:
            # Only this newly spawned, retained Popen child is terminated on
            # failure. This is never reported as normal shutdown or a pass.
            process.kill(); process.wait(timeout=10)


def finish_report(output,report,inputs,before,identities):
    after, current_identities, stable = {}, {}, False
    try:
        for name,path in inputs.items():
            current_identities[name], after[name] = regular(path), digest(path)
        stable = current_identities == identities and after == before
    except (OSError,ValueError) as error:
        report['input_recheck_error'] = type(error).__name__+': '+str(error)
    report['source_image_sha256_after'] = after
    report['original_images_unchanged'] = stable
    if not stable: report.update(status='FAIL',error='source artifact identity/content changed')
    report['finished_utc'] = datetime.now(timezone.utc).isoformat()
    save(output/'report.json',report)
    print(json.dumps({'status':report['status'],'evidence':str(output)}),flush=True)
    require(stable,'source artifact identity/content changed; verifier cannot exit successfully')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--images',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True,help='existing private evidence parent')
    parser.add_argument('--preflight-only',action='store_true')
    parser.add_argument('--scope',choices=('local-full','game-isolation'),default='local-full')
    args = parser.parse_args()
    require(sys.platform == 'linux', 'NOT_RUN: Linux host required')
    for command in ('debugfs','e2fsck','mkfs.ext4','qemu-system-aarch64','bwrap','openssl'):
        require(shutil.which(command), 'NOT_RUN: missing '+command)
    images, parent = args.images.resolve(strict=True), args.output.resolve(strict=True)
    require(all(re.fullmatch('/[A-Za-z0-9_./-]+',str(p)) for p in (images,parent)), 'safe absolute paths required')
    info = parent.stat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700,
            'private owned evidence parent required')
    require(shutil.disk_usage(parent).free >= 4*1024**3, 'at least 4 GiB free evidence space required')
    output = Path(tempfile.mkdtemp(prefix='hub-fault-',dir=parent))
    inputs = {name:images/name for name in ('Image','rootfs.ext4','stage0.cpio.gz')}
    identities = {name:regular(path) for name,path in inputs.items()}
    before = {name:digest(path) for name,path in inputs.items()}
    report = {'schema':'rock-hub-fault-evidence/1','status':'RUNNING','source_image_sha256':before,'cases':[],
              'limits':{'boots':3,'per_boot_seconds':TIMEOUT,'capture_seconds':4,'Hub_deadline_seconds':3,
                        'prearm_seconds':2,'platform_threads':16,'process_inventory':4096,'stat_bytes':4096},
              'scope':{'fixture':'derived rootfs; fixed root tracer and owner API', 'fault_target':'launcher before sandbox execution',
                       'gui':'NOT_RUN','stage0_ab':'NOT_RUN','whole_D3':'INCOMPLETE','real_funds':'NOT_RUN',
                       'platform_service_crash_interruption':'NOT_RUN','network':'none'},
              'runtime_manifest_prefixes':list(PREFIXES),
              'runtime_manifest_metadata_scope':'content hashes, file/directory modes and symlink targets; source UID/GID are not attested'}
    try:
        game_gate = None
        if args.scope=='game-isolation':
            sys.path.insert(0,str(REPO/'os/desktop'))
            from game_gate_observer import Gate
            game_gate = Gate(images,output,('os/verify-hub-faults.py','os/platform/hub_fault_fixture.py'),report['limits'])
            report.update(verification_scope=args.scope,wallet='NOT_RUN',game_scope_plan_sha256=game_gate.plan_sha)
        check_fs(inputs['rootfs.ext4'])
        original = tree_manifest(inputs['rootfs.ext4'],output/'original-runtime')
        save(output/'original-runtime-manifest.json',original)
        mapping = {'os/platform/service.py':'usr/lib/rock-platform/service.py',
                   'src/blackberryrock/hub.py':'usr/lib/rock-platform/blackberryrock/hub.py',
                   'src/blackberryrock/recipe_worker.py':'usr/lib/rock-platform/blackberryrock/recipe_worker.py',
                   'src/blackberryrock/packages.py':'usr/lib/rock-platform/blackberryrock/packages.py',
                   'os/buildroot/board/rock-virt/overlay/etc/init.d/S50rockplatform':'etc/init.d/S50rockplatform'}
        for source,path in mapping.items():
            require((output/'original-runtime'/path).read_bytes() == (REPO/source).read_bytes(),
                    'harness source does not match actual frozen runtime: '+source)
        runtime = {path:original[path]['sha256'] for path in mapping.values()}
        runtime[fixture.LAUNCHER.lstrip('/')] = original[fixture.LAUNCHER.lstrip('/')]['sha256']
        for path in (fixture.VERIFIER, fixture.PACKAGE):
            entry = original[path.lstrip('/')]
            require(entry['kind'] == 'file', 'fixed signature verifier and package must be regular runtime files')
            runtime[path.lstrip('/')] = entry['sha256']
        report['runtime_sha256'] = runtime
        sys.path.insert(0,str(REPO/'src'))
        from blackberryrock.packages import verify_package, PUBLIC_TEST_KEY, TEST_PUBLISHER
        found = []
        for path in (output/'original-runtime/usr/share/rock/registry').glob('*.rock.json'):
            package = json.loads(path.read_text())
            if package.get('manifest',{}).get('id') == fixture.TOOL and package['manifest'].get('version') == fixture.VERSION:
                manifest, package_hash = verify_package(package,{TEST_PUBLISHER:PUBLIC_TEST_KEY})
                require(manifest['execution_targets'] == ['device_local'], 'fixture must use the signed local execution target')
                found.append(package_hash)
        require(len(found) == 1, 'exactly one actual signed test Tool version is required')
        package_hash = found[0]; report['signed_package_sha256'] = package_hash
        require(package_hash == fixture.PACKAGE_HASH and
                fixture.hashed(json.loads((output/'original-runtime'/fixture.PACKAGE.lstrip('/')).read_bytes())) == package_hash,
                'fixed public signature inputs require the exact installed text-tidy version')
        derived = output/'derived-rootfs.ext4'
        subprocess.run(['cp','--sparse=always','--reflink=auto',str(inputs['rootfs.ext4']),str(derived)],check=True,timeout=120)
        derived.chmod(0o600)  # Only this new copy; frozen inputs may be 0444.
        raw_init = b'#!/bin/sh\n[ "${1:-start}" = start ] || exit 0\nexec /usr/bin/python3 -I -B /usr/libexec/rock-hub-fault-fixture.py\n'
        report['injections'] = [inject(derived,output,'guest-fixture.py',HOOK,SOURCE.read_bytes()),
                                inject(derived,output,'guest-runtime.json',RUNTIME,fixture.canonical(runtime)),
                                inject(derived,output,'guest-init',INIT,raw_init,True)]
        changed = tree_manifest(derived,output/'derived-runtime')
        fixture.validate_manifest(original,changed,{HOOK,RUNTIME,INIT})
        report['all_existing_runtime_files_unchanged'] = True
        save(output/'derived-runtime-manifest.json',changed)
        report['derived_rootfs_sha256'] = digest(derived)
        require(report['derived_rootfs_sha256'] != before['rootfs.ext4'], 'derived fixture must have a distinct image identity')
        report['derived_filesystem_check'] = check_fs(derived)
        frozen = {'source_image_sha256':before,'derived_rootfs_sha256':report['derived_rootfs_sha256'],
                  'runtime_manifest_sha256':digest(output/'original-runtime-manifest.json'),
                  'signed_package_sha256':package_hash,
                  'injections':report['injections'],'limits':report['limits'],'modes':list(fixture.MODES),
                  'host_verifier_sha256':digest(Path(__file__))}
        if game_gate:frozen['game_scope_plan_sha256']=game_gate.plan_sha
        save(output/'plan.json',frozen); expected_plan = digest(output/'plan.json'); report['plan_sha256'] = expected_plan
        if args.preflight_only:
            report.update(status='PREFLIGHT_ONLY',qemu='NOT_RUN'); return
        data = output/'userdata.ext4'
        with data.open('xb') as stream: stream.truncate(128*1024**2)
        subprocess.run(['mkfs.ext4','-q','-F','-L','rock-hub-fault',str(data)],check=True,timeout=60)
        proofs = []
        for mode in fixture.MODES:
            require(digest(output/'plan.json') == expected_plan and digest(derived) == frozen['derived_rootfs_sha256'], 'frozen test input changed')
            folder = output/mode; folder.mkdir(mode=0o700)
            command = ['qemu-system-aarch64','-machine','virt-10.0,gic-version=3','-accel','tcg','-cpu','cortex-a53',
                       '-m','1024','-smp','2','-display','none','-serial','stdio','-monitor','none','-no-reboot','-nic','none',
                       '-kernel',str(inputs['Image']),'-append',
                       'console=ttyAMA0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.hubfault='+mode,
                       '-drive','if=none,file='+str(derived)+',format=raw,id=osdisk,readonly=on','-device','virtio-blk-pci,drive=osdisk,addr=0x1',
                       '-drive','if=none,file='+str(data)+',format=raw,id=userdata','-device','virtio-blk-pci,drive=userdata,addr=0x2',
                       '-object','rng-random,filename=/dev/urandom,id=rockrng','-device','virtio-rng-pci,rng=rockrng,addr=0x3']
            if game_gate:command[command.index('-append')+1] += ' rock.hubfault.scope=game-isolation'
            entry = {'mode':mode,'status':'RUNNING','command':command}; report['cases'].append(entry)
            save(output/'report.json',report)
            print('Actual Hub launcher fault: '+mode+'; '+str(folder),flush=True)
            proof, outcome = boot(command,folder/'boot.log')
            if game_gate:game_gate.proof(proof)
            entry['filesystem_check'] = check_fs(data)
            history = json.loads(embedded(data,'hub-fault-proof.json'))
            require(len(history) == len(proofs)+1 and history[:-1] == proofs and history[-1] == proof,
                    'serial evidence differs from retained proof history')
            rows = closed_rows(data,folder); validate_result(proof,mode,rows,package_hash)
            wallet_directory = folder/'wallet'; wallet_directory.mkdir(mode=0o700)
            for name in (fixture.GAME_DATABASES if game_gate else ('wallet-simulator.db','entitlement.db')):
                (wallet_directory/name).parent.mkdir(mode=0o700,parents=True,exist_ok=True)
                closed_export(data,'wallet/'+name,wallet_directory/name)
            if game_gate:
                # Inspect absence on the actual stopped disk, not only the exported subset.
                for name in ('wallet-simulator.db','entitlement.db'):
                    result=subprocess.run(['debugfs','-R','stat /wallet/'+name,str(data)],capture_output=True,check=True,timeout=20)
                    require(b'File not found by ext2_lookup' in result.stderr,'unexpected local authoritative Wallet database')
            require(fixture.wallet_state(wallet_directory,args.scope) == proof['wallet_sha256'],
                    'closed Wallet tables differ from the actual pre-fault baseline')
            require(proof['runtime_sha256'] == fixture.hashed(runtime), 'guest used different installed runtime bytes')
            proofs.append(proof); entry.update(status='PASS',proof=proof,**outcome)
            entry['data_sha256'] = digest(data)
        fixture.validate_matrix(proofs)
        require(digest(derived) == frozen['derived_rootfs_sha256'], 'guest changed read-only derived rootfs')
        if game_gate:report['game_authority_retention'] = game_gate.finish()
        report['status'] = 'PASS_SCOPED'
    except BaseException as error:
        report.update(status='FAIL',error=type(error).__name__+': '+str(error)); raise
    finally:
        finish_report(output,report,inputs,before,identities)


if __name__ == '__main__': main()
