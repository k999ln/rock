"""Owner-only Pixel guest code update. Never replaces private state, models or keys."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import shutil
import socket
import stat
import subprocess
import sys
import time
import tempfile
import urllib.request
import uuid

FILES = {'server.mjs', 'ui/index.html', 'ui/app.js', 'ui/app.css',
         'toolkits/sky-linux-local/worker.py', 'toolkits/sky-linux-local/runtime-lock.json',
         'toolkits/sky-linux-local/prepare-pixel.py', 'toolkits/sky-linux-local/node-lock.json',
         'toolkits/sky-linux-local/models.json', 'toolkits/sky-linux-local/android-bridge.py',
         'toolkits/sky-linux-local/install-android-bridge.py'}
UNITS = ('sky-android-bridge.service', 'sky-private.service')
IDENTITIES = ('pairing.json', 'client.key', 'client.pem', 'server.pem')
TERMINAL = ('committed', 'rolled_back')


class UpdateError(RuntimeError):
    pass


def require(value, code):
    if not value:
        raise UpdateError(code)


def regular(path, owned=True):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and (not owned or info.st_uid == os.getuid()), 'OWNED_REGULAR_FILE_REQUIRED')
    return info


def digest(path):
    regular(path)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_directory(path):
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and not info.st_mode & 0o077,
            'PRIVATE_DIRECTORY_REQUIRED')


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def sync_tree(directory):
    for path in directory.rglob('*'):
        require(not path.is_symlink(), 'APP_SYMLINK_REJECTED')
        if not path.is_dir():
            regular(path)
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    for path in sorted((p for p in directory.rglob('*') if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        sync_directory(path)
    sync_directory(directory)


def move_directory(source, destination):
    os.replace(source, destination)
    sync_directory(source.parent)
    if destination.parent != source.parent:
        sync_directory(destination.parent)


def atomic(path, data):
    if path.exists() or path.is_symlink():
        regular(path)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        require(path.read_bytes() == data, 'WRITE_UNCONFIRMED')
    finally:
        temporary.unlink(missing_ok=True)


def save(path, value):
    body = (json.dumps(value, sort_keys=True, ensure_ascii=True) + '\n').encode()
    require(len(body) <= 262144, 'UPDATE_RECORD_TOO_LARGE')
    atomic(path, body)


def read_json(path, limit=5 * 1024 * 1024):
    require(regular(path).st_size <= limit, 'FILE_TOO_LARGE')
    body = path.read_bytes()
    require(len(body) <= limit, 'FILE_TOO_LARGE')
    return json.loads(body)


def inventory(directory):
    require(directory.is_dir() and not directory.is_symlink(), 'APP_DIRECTORY_REQUIRED')
    found = {}
    size = 0
    for path in sorted(directory.rglob('*')):
        require(not path.is_symlink(), 'APP_SYMLINK_REJECTED')
        if path.is_dir():
            continue
        size += regular(path).st_size
        require(size <= 32 * 1024 * 1024 and len(found) < 256, 'APP_LIMIT_EXCEEDED')
        found[str(path.relative_to(directory))] = digest(path)
    return found


def protected(root):
    private_directory(root / 'state')
    value = read_json(root / 'state/state.json')
    require(value.get('schema') == 1 and all(isinstance(value.get(k), list) for k in ('runs', 'models', 'agents')),
            'STATE_SCHEMA_REQUIRED')
    body = {key: value.get(key) for key in ('schema', 'owner', 'runs', 'models', 'agents', 'selectedModelId')}
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=True).encode()).hexdigest()


def cache_ledger(root):
    value = read_json(root / 'state/state.json')
    # First backend startup may initialize an empty ledger; this is not history
    # loss. Existing bound rows are hashed exactly and never restored from backup.
    ledger = value.get('cachePreparations', {'schema': 1, 'incomplete': False, 'entries': {}})
    body = {'cachePreparations': ledger, 'cachePreparation': value.get('cachePreparation')}
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=True).encode()).hexdigest()


def identities(root):
    directory = root / 'android-bridge'
    private_directory(directory)
    return {name: digest(directory / name) for name in IDENTITIES}


def status():
    request = urllib.request.Request('http://127.0.0.1:5199/__sky/linux', data=b'{"action":"status"}',
                                    headers={'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:5199'})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=5) as response:
        body = response.read(5 * 1024 * 1024 + 1)
        require(len(body) <= 5 * 1024 * 1024, 'STATUS_TOO_LARGE')
        return json.loads(body)


def idle(value):
    require(value.get('schema') == 'sky.private-linux-deployment/1' and value.get('phase') in ('stopped', 'none'),
            'STOP_ENVIRONMENT_BEFORE_UPDATE')
    require(not any(run['job']['status'] == 'active' or run['stop'] in ('requested', 'unconfirmed')
                    for run in value['runs']), 'WORK_NOT_STOPPED')


def systemctl(action, unit):
    require(action in ('stop', 'start', 'check') and unit in UNITS, 'FIXED_SERVICE_ONLY')
    command = ['systemctl', 'is-active', '--quiet', unit] if action == 'check' else ['sudo', '-n', 'systemctl', action, unit]
    subprocess.run(command, check=True, timeout=30,
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def capabilities(root):
    # Backend-only health probe: no scoped common-runtime/socket claim.
    worker = root / 'worker.py'
    regular(worker)
    def bounded_probe():
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_FSIZE, (8192, 8192))
        resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    with tempfile.TemporaryFile() as output:
        subprocess.run(['python3', str(worker), 'capabilities'],
                                stdout=output, stderr=subprocess.DEVNULL, timeout=15,
                                env={'PATH': '/usr/bin:/bin', 'HOME': str(root.parent), 'LANG': 'C.UTF-8'},
                                stdin=subprocess.DEVNULL, preexec_fn=bounded_probe, check=True)
        require(output.tell() <= 8192, 'RUNTIME_RESPONSE_INVALID')
        output.seek(0)
        body = output.read(8193)
    require(len(body) <= 8192, 'RUNTIME_RESPONSE_INVALID')
    value = json.loads(body)
    require(value.get('schema') == 'rockstaros.linux-text-capability/1'
            and type(value.get('protocol')) is int and value['protocol'] == 1
            and value.get('platform') == 'linux' and value.get('architecture') == 'aarch64'
            and type(value.get('maximumOutputTokens')) is int and value['maximumOutputTokens'] == 1024
            and type(value.get('maximumDeadlineMs')) is int and value['maximumDeadlineMs'] == 120000,
            'RUNTIME_ABI_UNSUPPORTED')


def wait_status(inspect, expected, root):
    deadline = time.monotonic() + 15
    while True:
        try:
            value = inspect()
            idle(value)
            require(protected(root) == expected, 'PRIVATE_DATA_CHANGED')
            return value
        except UpdateError:
            raise
        except Exception:
            if time.monotonic() >= deadline:
                raise UpdateError('SERVICE_HEALTH_UNCONFIRMED') from None
            time.sleep(.2)


def receipt_directory(root, transaction):
    require(isinstance(transaction, str) and re.fullmatch(r'[a-f0-9]{64}-[a-f0-9]{32}', transaction), 'INVALID_TRANSACTION')
    private_directory(root / 'updates')
    directory = root / 'updates' / transaction
    private_directory(directory)
    return directory


def rollback(root, receipt, control, inspect, check_capabilities=capabilities):
    directory = receipt_directory(root, receipt['id'])
    for unit in UNITS:
        control('stop', unit)
    old = directory / 'app'
    if old.exists():
        require(inventory(old) == receipt['oldApp'], 'BACKUP_CHANGED')
        if (root / 'app').exists():
            require(inventory(root / 'app') == receipt['newApp'], 'INSTALLED_SOURCE_CHANGED')
            move_directory(root / 'app', directory / 'failed-app')
        move_directory(old, root / 'app')
    else:
        require(inventory(root / 'app') == receipt['oldApp'], 'BACKUP_UNAVAILABLE')
    for name, relative in [('worker.py', 'worker.py'), ('client.py', 'android-bridge/client.py')]:
        original = directory / name
        require(digest(original) == receipt['oldAux'][name], 'BACKUP_CHANGED')
        require(digest(root / relative) in (receipt['oldAux'][name], receipt['newAux'][name]), 'INSTALLED_SOURCE_CHANGED')
        atomic(root / relative, original.read_bytes())
    require(identities(root) == receipt['identities'], 'PAIRING_CHANGED')
    control('start', 'sky-private.service')
    wait_status(inspect, receipt['protected'], root)
    if 'cacheLedgerSha256' in receipt:
        require(cache_ledger(root) == receipt['cacheLedgerSha256'], 'CACHE_LEDGER_CHANGED')
    if receipt.get('oldRuntimeCapability'):
        check_capabilities(root)
    control('start', 'sky-android-bridge.service')
    for unit in UNITS:
        control('check', unit)
    receipt['state'] = 'rolled_back'
    save(directory / 'receipt.json', receipt)


def update(root, source, manifest_sha, control=systemctl, inspect=status, check_capabilities=capabilities):
    private_directory(root)
    require(re.fullmatch(r'[a-f0-9]{64}', manifest_sha), 'MANIFEST_SHA_REQUIRED')
    manifest_path = source / 'package-manifest.json'
    require(regular(manifest_path, owned=False).st_size <= 65536, 'PACKAGE_TOO_LARGE')
    manifest_bytes = manifest_path.read_bytes()
    require(len(manifest_bytes) <= 65536 and hashlib.sha256(manifest_bytes).hexdigest() == manifest_sha, 'PACKAGE_CHANGED')
    manifest = json.loads(manifest_bytes)
    require(manifest.get('schema') == 'sky.pixel-linux-package/1' and set(manifest.get('files', {})) == FILES,
            'PACKAGE_SCHEMA_REQUIRED')
    payload = {}
    for name, expected in manifest['files'].items():
        path = source / name
        require(path.resolve().is_relative_to(source.resolve()) and not path.is_symlink(), 'PACKAGE_PATH_REJECTED')
        require(regular(path, owned=False).st_size <= 4 * 1024 * 1024, 'PACKAGE_FILE_TOO_LARGE')
        payload[name] = path.read_bytes()
        require(len(payload[name]) <= 4 * 1024 * 1024 and hashlib.sha256(payload[name]).hexdigest() == expected, 'PACKAGE_CHANGED')
    lock = os.open(root / 'update.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        pointer = root / 'update-transaction.json'
        if pointer.exists():
            prior = receipt_directory(root, read_json(pointer, 65536)['id'])
            require(read_json(prior / 'receipt.json')['state'] in TERMINAL, 'UPDATE_RECOVERY_REQUIRED')
        before = inspect()
        idle(before)
        fingerprint = protected(root)
        ledger_fingerprint = cache_ledger(root)
        identity = identities(root)
        try:
            check_capabilities(root)
            old_capability = True
        except Exception:
            old_capability = False
        old_inventory = inventory(root / 'app')
        for name in ('node-lock.json', 'runtime-lock.json'):
            relative = 'toolkits/sky-linux-local/' + name
            require(hashlib.sha256(payload[relative]).hexdigest() == digest(root / 'app' / relative),
                    'ENGINE_OR_NODE_UPGRADE_REQUIRES_SEPARATE_ACCEPTANCE')
        updates = root / 'updates'
        updates.mkdir(mode=0o700, exist_ok=True)
        private_directory(updates)
        transaction = manifest_sha + '-' + uuid.uuid4().hex
        directory = updates / transaction
        directory.mkdir(mode=0o700)
        sync_directory(updates)
        staged = directory / 'staged-app'
        shutil.copytree(root / 'app', staged)
        for name, body in payload.items():
            destination = staged / name
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            atomic(destination, body)
        auxiliary = {'worker.py': root / 'worker.py', 'client.py': root / 'android-bridge/client.py'}
        old_aux = {name: digest(path) for name, path in auxiliary.items()}
        for name, path in auxiliary.items():
            atomic(directory / name, path.read_bytes())
        sync_tree(staged)
        receipt = {'schema': 'sky.pixel-guest-update/1', 'id': transaction, 'state': 'staged',
                   'manifestSha256': manifest_sha, 'oldApp': old_inventory, 'newApp': inventory(staged),
                   'oldAux': old_aux, 'newAux': {'worker.py': manifest['files']['toolkits/sky-linux-local/worker.py'],
                                               'client.py': manifest['files']['toolkits/sky-linux-local/android-bridge.py']},
                   'protected': fingerprint, 'cacheLedgerSha256': ledger_fingerprint,
                   'identities': identity, 'oldRuntimeCapability': old_capability}
        save(directory / 'receipt.json', receipt)
        save(pointer, {'id': transaction})
        try:
            idle(inspect())
        except Exception:
            # Admission failed before any service/code effect: do not stop a
            # cache preparation that won the race. No user state is restored.
            require(inventory(root / 'app') == old_inventory and identities(root) == identity,
                    'UPDATE_RECOVERY_REQUIRED')
            receipt['state'] = 'rolled_back'
            receipt['reason'] = 'admission_rejected_before_effect'
            save(directory / 'receipt.json', receipt)
            raise UpdateError('UPDATE_ADMISSION_REJECTED') from None
        try:
            for unit in UNITS:
                control('stop', unit)
            require(protected(root) == fingerprint and cache_ledger(root) == ledger_fingerprint
                    and inventory(root / 'app') == old_inventory, 'CONCURRENT_CHANGE')
            receipt['state'] = 'services_stopped'
            save(directory / 'receipt.json', receipt)
            move_directory(root / 'app', directory / 'app')
            receipt['state'] = 'old_moved'
            save(directory / 'receipt.json', receipt)
            move_directory(staged, root / 'app')
            for name, relative in [('worker.py', 'toolkits/sky-linux-local/worker.py'), ('client.py', 'toolkits/sky-linux-local/android-bridge.py')]:
                atomic(auxiliary[name], payload[relative])
            receipt['state'] = 'installed'
            save(directory / 'receipt.json', receipt)
            require(identities(root) == identity, 'PAIRING_CHANGED')
            control('start', 'sky-private.service')
            after = wait_status(inspect, fingerprint, root)
            require(cache_ledger(root) == ledger_fingerprint, 'CACHE_LEDGER_CHANGED')
            check_capabilities(root)
            control('start', 'sky-android-bridge.service')
            for unit in UNITS:
                control('check', unit)
            require(inventory(root / 'app') == receipt['newApp'] and identities(root) == identity, 'UPDATE_READBACK_FAILED')
            receipt['state'] = 'committed'
            save(directory / 'receipt.json', receipt)
            return {'schema': receipt['schema'], 'transactionId': transaction, 'manifestSha256': manifest_sha,
                    'state': 'committed', 'jobsRetained': len(after['runs']), 'modelsRetained': len(after['models']),
                    'agentsRetained': len(after['agents']), 'privateDataRetained': True, 'pairingRetained': True,
                    'runtimeCapabilityConfirmed': True, 'newInference': 0, 'newKeys': 0}
        except Exception:
            try:
                rollback(root, receipt, control, inspect, check_capabilities)
            except Exception:
                receipt['state'] = 'rollback_failed'
                save(directory / 'receipt.json', receipt)
                raise UpdateError('UPDATE_RECOVERY_REQUIRED') from None
            raise UpdateError('UPDATE_FAILED_OLD_CODE_RESTORED') from None
    finally:
        os.close(lock)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest-sha')
    parser.add_argument('--recover')
    args = parser.parse_args()
    require(sys.platform == 'linux' and os.uname().machine == 'aarch64' and os.geteuid() != 0, 'OWNER_PIXEL_GUEST_REQUIRED')
    require(bool(args.manifest_sha) != bool(args.recover), 'CHOOSE_UPDATE_OR_RECOVERY')
    os.umask(0o077)
    root = Path.home() / 'sky-private'
    if args.recover:
        private_directory(root)
        descriptor = os.open(root / 'update.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            directory = receipt_directory(root, args.recover)
            require(read_json(root / 'update-transaction.json', 65536) == {'id': args.recover}, 'CURRENT_TRANSACTION_REQUIRED')
            receipt = read_json(directory / 'receipt.json')
            require(receipt['id'] == args.recover and receipt['state'] not in TERMINAL, 'UNFINISHED_TRANSACTION_REQUIRED')
            rollback(root, receipt, systemctl, status)
            print(json.dumps({'state': 'rolled_back', 'privateDataOverwritten': False}))
        finally:
            os.close(descriptor)
    else:
        print(json.dumps(update(root, Path(__file__).resolve().parent, args.manifest_sha), ensure_ascii=False))


if __name__ == '__main__':
    main()
