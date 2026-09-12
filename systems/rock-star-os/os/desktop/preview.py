#!/usr/bin/env python3
"""RockstarOS 1.0 Developer Preview: verified package and owned Lima lifecycle.

Obtain this bootstrap from the source commit through a trusted channel BEFORE
running it. A key bundled with an archive does not establish publisher trust.
The public RFC8032 fixture requires explicit opt-in plus an independently pinned
manifest; it provides development integrity, never production authenticity.
"""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import signal
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
from urllib.parse import urlsplit
from urllib.request import urlopen

TITLE = 'RockstarOS 1.0 Developer Preview'
SCHEMA = 'rockstaros-preview-release/2'
OWNERSHIP = 'rockstaros-preview-installation/1'
PUBLIC_TEST_KEY = bytes.fromhex('302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')
IMAGE_NAMES = ('Image', 'rootfs.ext4', 'stage0.cpio.gz')
GUEST_ROOT = '/opt/rockstaros-preview'
VM_NAME = 'os'
PREVIEW_DISPLAY = {'viewer_port': 8900, 'websocket_port': 5910}
GAME_AUTHORITY = '6fdcc9a6-90c7-4e28-a165-aadf9c904910'
GAME_STATE = '/var/tmp/rockstaros-preview-authority'
GAME_CONFIG = GAME_STATE + '/sandbox.json'
GAME_CONFIG_MEMBER = 'native/os/game_exchange/fixtures/sandbox-20260910.json'
MAX_ARCHIVE = 4 * 1024**3
MAX_EXPANDED = 6 * 1024**3
BASE_IMAGE = {
    'location': 'https://cloud.debian.org/images/cloud/trixie/20260712-2537/debian-13-genericcloud-arm64-20260712-2537.qcow2',
    'arch': 'aarch64',
    'digest': 'sha512:8543d795f2fde630eb66c492f245a8c1da19dedc636e0a8e7b3d0f95920e1a05aa911ef2d82d177d41cc53ced5fccbd2a3945d07fa5e15018914c4d864bb07ed',
}


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def decode(raw):
    def unique(pairs):
        out = {}
        for key, value in pairs:
            require(key not in out, 'duplicate JSON field')
            out[key] = value
        return out
    require(0 < len(raw) <= 4 * 1024**2, 'bounded metadata required')
    return json.loads(raw, object_pairs_hook=unique)


def read(path, limit=4 * 1024**2):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= limit,
                'bounded single-link metadata file required')
        return stream.read(limit + 1)


def save(path, value):
    temporary = path.with_name(path.name + '.new-' + uuid.uuid4().hex)
    with temporary.open('xb') as stream:
        stream.write(canonical(value) + b'\n')
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(0o600)
    os.replace(temporary, path)
    descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def command(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True,
                          timeout=kwargs.pop('timeout', 60), **kwargs)


def openssl():
    for name in ('/opt/homebrew/opt/openssl@3/bin/openssl', shutil.which('openssl')):
        if name and Path(name).is_file():
            version = command([name, 'version']).stdout
            if version.startswith('OpenSSL 3.'):
                return name
    raise ValueError('OpenSSL 3 が必要です。Homebrew の openssl@3 を導入してください。')


def hash_text(value):
    require(type(value) is str and re.fullmatch('[0-9a-f]{64}', value), 'exact SHA-256 required')
    return value


def safe_member(name):
    require(type(name) is str and 0 < len(name) <= 1024 and
            re.fullmatch(r'[A-Za-z0-9_./+@ -]+', name) and not name.startswith('/') and
            '..' not in PurePosixPath(name).parts and str(PurePosixPath(name)) == name,
            'unsafe archive member')
    return name


def verify_release(manifest_path, archive, trusted_key, key_sha256,
                   *, manifest_sha256=None, allow_public_test_key=False):
    raw = read(manifest_path)
    if manifest_sha256 is not None:
        require(hashlib.sha256(raw).hexdigest() == hash_text(manifest_sha256), 'release manifest hash mismatch')
    key = read(trusted_key, 4096)
    require(hashlib.sha256(key).hexdigest() == hash_text(key_sha256), 'trusted release key fingerprint differs')
    require(len(key) == 44 and key[:12] == bytes.fromhex('302a300506032b6570032100'),
            'trusted key must be an Ed25519 SubjectPublicKeyInfo DER file')
    if key == PUBLIC_TEST_KEY:
        require(allow_public_test_key and manifest_sha256 is not None,
                'public test key requires --allow-public-test-key AND an independently obtained --manifest-sha256')
    envelope = decode(raw)
    require(type(envelope) is dict and set(envelope) == {'manifest', 'signature'}, 'signed release envelope required')
    value = envelope['manifest']
    require(type(value) is dict and value.get('schema') == SCHEMA and value.get('product') == TITLE,
            'unknown release product/schema')
    required = {'schema', 'product', 'version', 'source_commit', 'host_tools_commit', 'host', 'archive',
                'files', 'image_sha256', 'factory_sha256', 'trust', 'legal', 'acceptance', 'display', 'boot', 'game'}
    require(set(value) == required and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}', value['version']) and
            all(re.fullmatch('[0-9a-f]{40}', value[field]) for field in ('source_commit', 'host_tools_commit')),
            'incomplete release identity')
    require(value['host'] == {'os': 'macOS', 'tested_version': '15.7.4', 'architecture': 'arm64',
                             'lima_version': '2.2.0', 'vm_type': 'vz', 'base_image': BASE_IMAGE},
            'unsupported host bundle')
    require(value['display'] == PREVIEW_DISPLAY, 'release display ports differ from the supported pinned profile')
    require(value['trust'] == ('PUBLIC_RFC8032_DEVELOPMENT_ONLY' if key == PUBLIC_TEST_KEY else 'EXTERNAL_RELEASE_KEY'),
            'signature trust label disagrees with the actual verification key')
    signature = envelope['signature']
    require(type(signature) is str and re.fullmatch('[0-9a-f]{128}', signature), 'Ed25519 signature required')
    with tempfile.TemporaryDirectory(prefix='rock-release-verify-') as temporary:
        temp = Path(temporary)
        (temp / 'manifest').write_bytes(canonical(value))
        (temp / 'signature').write_bytes(bytes.fromhex(signature))
        (temp / 'key.der').write_bytes(key)
        result = subprocess.run([openssl(), 'pkeyutl', '-verify', '-pubin', '-keyform', 'DER',
                                 '-inkey', str(temp / 'key.der'), '-rawin', '-in', str(temp / 'manifest'),
                                 '-sigfile', str(temp / 'signature')], capture_output=True, timeout=30)
        require(result.returncode == 0, 'release signature verification failed')
    item = value['archive']
    require(type(item) is dict and set(item) == {'name', 'sha256', 'bytes'} and
            re.fullmatch(r'rockstaros-[A-Za-z0-9.+_-]+-macos-arm64\.tar\.gz', item['name']) and
            type(item['bytes']) is int and 0 < item['bytes'] <= MAX_ARCHIVE, 'invalid archive identity')
    info = Path(archive).lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size == item['bytes'] and
            digest(archive) == hash_text(item['sha256']), 'archive size/hash mismatch')
    files = value['files']
    require(type(files) is dict and 1 <= len(files) <= 20000, 'bounded release file inventory required')
    total = 0
    for name, record in files.items():
        safe_member(name)
        require(type(record) is dict and set(record) == {'sha256', 'bytes', 'mode'} and
                type(record['bytes']) is int and 0 <= record['bytes'] <= MAX_ARCHIVE and
                type(record['mode']) is int and record['mode'] in (0o444, 0o555), 'invalid release file record')
        hash_text(record['sha256'])
        total += record['bytes']
    require(total <= MAX_EXPANDED and type(value['image_sha256']) is dict and
            set(value['image_sha256']) == set(IMAGE_NAMES), 'invalid expanded release/image inventory')
    for name in IMAGE_NAMES:
        require(files.get('images/' + name, {}).get('sha256') == hash_text(value['image_sha256'][name]),
                'image hash and release inventory differ')
    hash_text(value['factory_sha256'])
    boot = value['boot']
    require(type(boot) is dict and boot.get('mode') == 'signed-stage0' and
            boot.get('factory_sha256') == value['factory_sha256'], 'release boot/factory binding differs')
    if boot.get('profile') == 'local-development':
        require(set(boot) == {'mode', 'profile', 'factory_sha256'} and value['game'] is None,
                'local release cannot carry an implicit Game authority')
    else:
        require(boot.get('profile') == 'development-game-authority' and
                set(boot) == {'mode', 'profile', 'factory_sha256', 'profile_sha256'} and
                files.get('images/profile.json', {}).get('sha256') == hash_text(boot['profile_sha256']),
                'explicit immutable Game image profile required')
        game = value['game']
        require(type(game) is dict and set(game) == {'authority_id', 'config', 'sha256', 'config_member'} and
                game['authority_id'] == GAME_AUTHORITY and game['config'] == GAME_CONFIG and
                game['config_member'] == GAME_CONFIG_MEMBER and
                files.get(GAME_CONFIG_MEMBER, {}).get('sha256') == hash_text(game['sha256']),
                'fixed public Game authority/config inventory binding differs')
    return value


def extract_verified(archive, destination, files):
    """No tar.extractall: links, devices, duplicates, traversal and extra files fail."""
    destination.mkdir(mode=0o700)
    seen = set()
    directories = {destination}
    with tarfile.open(archive, 'r:gz') as incoming:
        for member in incoming:
            name = safe_member(member.name)
            require(name not in seen and name in files and member.isfile() and not member.sparse,
                    'unexpected, duplicate, linked or non-regular archive member')
            seen.add(name)
            expected = files[name]
            require(member.size == expected['bytes'] and member.mode == expected['mode'],
                    'archive entry metadata differs')
            path = destination / name
            parent = destination
            for part in PurePosixPath(name).parts[:-1]:
                parent /= part
                if parent not in directories:
                    parent.mkdir(mode=0o755)
                    parent.chmod(0o755)
                    directories.add(parent)
            source = incoming.extractfile(member)
            require(source is not None, 'missing archive payload')
            with source, path.open('xb') as target:
                shutil.copyfileobj(source, target, 1024**2)
            require(digest(path) == expected['sha256'], 'extracted file hash mismatch')
            path.chmod(expected['mode'])
    require(seen == set(files), 'incomplete release archive')


def verify_installed(root, release):
    payload = root / 'payload'
    for name, item in release['files'].items():
        path = payload / name
        info = path.lstat()
        require(path.resolve() == path and stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and
                info.st_size == item['bytes'] and stat.S_IMODE(info.st_mode) == item['mode'] and
                digest(path) == item['sha256'], 'installed release file differs: ' + name)


def installed_release(root, record):
    raw = read(root / 'release.json')
    require(hashlib.sha256(raw).hexdigest() == record.get('installed_release_sha256'),
            'installed release inventory differs from the verified installation binding')
    return decode(raw)


def protected(path, *, new=False):
    path = Path(path).expanduser().absolute()
    require(path == path.resolve(), 'installation path must be canonical without symlinks')
    for parent in path.parents:
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and (not info.st_mode & 0o022 or
                info.st_uid == 0 and info.st_mode & stat.S_ISVTX), 'unprotected installation parent')
    if new:
        require(not os.path.lexists(path), 'installation destination already exists; it will not be adopted or changed')
    else:
        info = path.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and
                stat.S_IMODE(info.st_mode) == 0o700, 'owned private installation directory required')
    return path


@contextmanager
def locked(root):
    fd = os.open(root / 'installation.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1,
                'unsafe installation lock')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def host_check():
    require(sys.platform == 'darwin' and platform.machine() == 'arm64', '対応環境は Apple Silicon Mac です。')
    version = command(['/usr/bin/sw_vers', '-productVersion']).stdout.strip()
    require(version == '15.7.4', '受入対象は macOS 15.7.4 です。他の版は未検証です。')
    require(sys.version_info >= (3, 11), 'Python 3.11 以降が必要です。')
    binary = shutil.which('limactl')
    require(binary is not None, 'Lima 2.2.0 が必要です。')
    lima_version = command([binary, '--version']).stdout.strip()
    require(lima_version == 'limactl version 2.2.0', '受入対象は Lima 2.2.0 です。他の版は未検証です。')
    return {'os': version, 'architecture': platform.machine(), 'lima': lima_version,
            'python': platform.python_version(), 'openssl': command([openssl(), 'version']).stdout.strip()}


def lima(root, *args, **kwargs):
    return command([shutil.which('limactl') or 'limactl', *args],
                   env=dict(os.environ, LIMA_HOME=str(root / 'lima')), **kwargs)


def guest_python(root, code, *args, timeout=120, input=None):
    return lima(root, 'shell', '--workdir', '/', VM_NAME, '/usr/bin/env',
                'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                'python3', '-B', '-c', code, *args, timeout=timeout, input=input)


def vm_config(root):
    return {'vmType': 'vz', 'arch': 'aarch64', 'cpus': 2, 'memory': '3GiB', 'disk': '16GiB',
            'images': [BASE_IMAGE], 'mounts': [{'location': str(root / 'payload'),
                                               'mountPoint': '/mnt/rockstaros-package', 'writable': False}],
            'mountType': 'virtiofs', 'containerd': {'system': False, 'user': False},
            'ssh': {'loadDotSSHPubKeys': False, 'forwardAgent': False, 'forwardX11': False},
            'propagateProxyEnv': False,
            'portForwards': [{'guestIP': '0.0.0.0', 'proto': 'any', 'ignore': True}],
            'provision': [{'mode': 'system', 'script': '#!/bin/sh\nset -eu\nexport DEBIAN_FRONTEND=noninteractive\n'
                          'if ! test -e /var/lib/rockstaros-preview-dependencies; then\n'
                          'apt-get update\napt-get install -y --no-install-recommends '
                          'python3 qemu-system-arm qemu-utils e2fsprogs openssl\n'
                          'touch /var/lib/rockstaros-preview-dependencies\nfi\n'}]}


def load(root):
    root = protected(root)
    record = decode(read(root / 'installation.json'))
    require(record.get('schema') == OWNERSHIP and record.get('root') == str(root) and
            record.get('uid') == os.geteuid() and re.fullmatch('[0-9a-f]{32}', record.get('id', '')) and
            record.get('vm_name') == VM_NAME, 'installation ownership does not match')
    return root, record


def verify_vm(root, record):
    home = protected(root / 'lima')
    vm = protected(home / VM_NAME)
    for name, field in (('lima.yaml', 'vm_config_sha256'), ('vz-identifier', 'vm_identity_sha256')):
        require(digest(vm / name) == record.get(field), 'owned VM identity/configuration differs; preserving it')
    listing = [json.loads(line) for line in lima(root, 'list', '--json', VM_NAME).stdout.splitlines() if line.strip()]
    require(len(listing) == 1 and listing[0].get('dir') == str(vm) and listing[0].get('name') == VM_NAME and
            listing[0].get('hostname') == 'lima-' + VM_NAME and listing[0].get('arch') == 'aarch64' and
            listing[0].get('vmType') == 'vz', 'Lima instance does not match this installation')
    return listing[0]


def launcher(root):
    path = root / 'payload/native/os/desktop/launcher.py'
    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location('rockstaros_preview_launcher', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def close_owned_display(module, config):
    """Close this profile's viewer only after OS shutdown; never take a port."""
    state = Path(config['host_state'])
    if not state.exists():
        return {'viewer': 'NOT_STARTED'}
    with module.launcher_lock(config, state):
        record_path = state / 'viewer.json'
        if not record_path.exists():
            return {'viewer': 'NOT_STARTED'}
        record = module.decode_manifest(module.private_file(record_path))
        import browser_server
        try:
            actual = browser_server.process_command(record['pid'])
        except (OSError, subprocess.SubprocessError):
            return {'viewer': 'STOPPED'}
        if actual != record.get('command'):
            # PID reuse or an unrelated process: leave it completely alone.
            return {'viewer': 'OLD_PROCESS_GONE'}
        expected_script = str(Path(module.__file__).with_name('browser_server.py'))
        require(expected_script in actual and '--instance ' + record['instance'] in actual and
                record['build'] == browser_server.fingerprint() and browser_server.healthy(record) and
                record.get('port', 8899) == module.browser_port(config) and
                record.get('websocket_port', 5909) == config['port'] and
                module.tunnel_listening({**config, 'port': module.browser_port(config)}, record['pid']),
                'viewer ownership could not be established; no process was stopped')
        os.kill(record['pid'], signal.SIGTERM)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                if browser_server.process_command(record['pid']) != actual:
                    return {'viewer': 'STOPPED'}
            except (OSError, subprocess.SubprocessError):
                return {'viewer': 'STOPPED'}
            time.sleep(.1)
        raise ValueError('owned viewer has not stopped; no force termination was performed')


def launcher_manifest(root, release, record, device):
    value = {'schema': 'rock-desktop-launcher/3', 'lima_home': str(root / 'lima'), 'vm_name': VM_NAME,
             'vm_config_sha256': record['vm_config_sha256'], 'vm_identity_sha256': record['vm_identity_sha256'],
             'guest_source': GUEST_ROOT + '/native',
             'guest_script_sha256': release['files']['native/os/desktop/guest.py']['sha256'],
             'host_state': str(root / 'display' / device), 'port': release['display']['websocket_port'],
             'viewer_port': release['display']['viewer_port'],
             'device': {'schema': 'rock-desktop-device/6', 'name': device,
                        'images': GUEST_ROOT + '/images', 'sha256': release['image_sha256'],
                        'network': 'none', 'viewer': 'browser',
                        'boot': dict(release['boot'])}}
    if release['game'] is not None:
        value['device'].update(schema='rock-desktop-device/7', network='game-authority',
                               game={key: release['game'][key] for key in ('config', 'sha256', 'authority_id')})
    path = root / 'profiles' / (device + '.json')
    require(not path.exists(), 'existing launch profile cannot be replaced')
    save(path, value)
    return path


def sandbox_command(root, release, action):
    """Use the source-pinned host sandbox CLI; never call authority internals."""
    require(release['game'] is not None and action in ('prepare', 'start', 'stop', 'status'),
            'explicit public Game sandbox action required')
    expected = release['files']['native/os/game_exchange/sandbox.py']['sha256']
    code = '''import hashlib,json,os,stat,subprocess,sys
from pathlib import Path
script=Path(sys.argv[1]);expected=sys.argv[2];config=Path(sys.argv[3]);config_sha=sys.argv[4];action=sys.argv[5]
info=script.lstat()
if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022 or info.st_nlink!=1 or script.resolve()!=script or hashlib.sha256(script.read_bytes()).hexdigest()!=expected:
 raise ValueError('installed sandbox source differs from the release')
for parent in script.parents:
 info=parent.lstat()
 if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022: raise ValueError('unprotected installed sandbox source parent')
info=config.lstat();parent=config.parent.lstat()
if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid() or stat.S_IMODE(info.st_mode)!=0o600 or info.st_nlink!=1 or config.resolve()!=config:
 raise ValueError('owned private sandbox config required')
if not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=os.geteuid() or stat.S_IMODE(parent.st_mode)!=0o700 or hashlib.sha256(config.read_bytes()).hexdigest()!=config_sha:
 raise ValueError('sandbox state/config binding differs')
result=subprocess.run([sys.executable,'-B',str(script),action,'--config',str(config)],check=True,capture_output=True,text=True,timeout=90)
print(result.stdout,end='')'''
    raw = guest_python(root, code, GUEST_ROOT + '/native/os/game_exchange/sandbox.py', expected,
                       GAME_CONFIG, release['game']['sha256'], action, timeout=110).stdout
    receipt = decode(raw.encode())
    require(type(receipt) is dict and receipt.get('authority_id') == GAME_AUTHORITY and
            receipt.get('config_sha256') == release['game']['sha256'] and receipt.get('simulation_only') is True,
            'sandbox receipt authority/config binding differs')
    if action == 'prepare':
        require(receipt.get('schema') == 'rock-game-sandbox-prepared/1' and
                receipt.get('initialization') == 'explicit-public-fixture' and
                type(receipt.get('descriptor')) is dict and type(receipt.get('game_uuids')) is dict,
                'complete prepared sandbox receipt required')
    else:
        require(receipt.get('schema') == 'rock-game-sandbox-status/1' and type(receipt.get('running')) is bool,
                'typed sandbox process status required')
        if action in ('start', 'stop'):
            require(receipt['running'] == (action == 'start'), 'sandbox lifecycle result differs from the requested action')
    return receipt


def prepare_sandbox(root, release):
    if release['game'] is None:
        return None
    code = '''import hashlib,os,shutil,sys
from pathlib import Path
source=Path(sys.argv[1]);state=Path(sys.argv[2]);expected=sys.argv[3]
if state.exists() or state.is_symlink(): raise ValueError('existing sandbox state cannot be adopted')
if hashlib.sha256(source.read_bytes()).hexdigest()!=expected: raise ValueError('public fixture config differs')
state.mkdir(mode=0o700);target=state/'sandbox.json'
with source.open('rb') as incoming,target.open('xb') as outgoing:
 shutil.copyfileobj(incoming,outgoing);outgoing.flush();os.fsync(outgoing.fileno())
target.chmod(0o600)
fd=os.open(state,os.O_RDONLY|os.O_DIRECTORY)
try: os.fsync(fd)
finally: os.close(fd)'''
    guest_python(root, code, GUEST_ROOT + '/' + GAME_CONFIG_MEMBER, GAME_STATE, release['game']['sha256'])
    return sandbox_command(root, release, 'prepare')


def optional_sandbox(root, release, action):
    """Hub remains usable when an independently owned Game service is offline."""
    if release['game'] is None:
        return {'status': 'NOT_CONFIGURED'}
    try:
        return sandbox_command(root, release, action)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        return {'status': 'UNAVAILABLE', 'error_type': type(error).__name__, 'simulation_only': True,
                'meaning': 'Game service is unavailable; Hub may still run; no replacement authority was created'}


def game_transaction(root, release, config, action, intent, *, saved=None, name=None, retired=()):
    require(action in ('backup', 'check-restore', 'restore') and release['game'] is not None, 'explicit complete Game transaction required')
    member = 'native/os/desktop/game_backup.py'
    arguments = [action, '--intent', intent]
    if action != 'backup': arguments += ['--backup', saved['backup'], '--name', name]
    code = '''import hashlib,json,os,stat,subprocess,sys
from pathlib import Path
script=Path(sys.argv[1]);expected=sys.argv[2]
info=script.lstat()
if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022 or info.st_nlink!=1 or script.resolve()!=script or hashlib.sha256(script.read_bytes()).hexdigest()!=expected:
 raise ValueError('installed complete-backup component differs from release')
for parent in script.parents:
 info=parent.lstat()
 if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022: raise ValueError('unprotected backup component source parent')
result=subprocess.run([sys.executable,'-B',str(script),*sys.argv[3:]],input=sys.stdin.read(),capture_output=True,text=True,check=True,timeout=540)
print(result.stdout,end='')'''
    result = guest_python(root, code, GUEST_ROOT+'/'+member, release['files'][member]['sha256'], *arguments,
                          timeout=560, input=json.dumps({'config': config['device'], 'retired_devices': list(retired)}))
    receipt = decode(result.stdout.encode())
    require(type(receipt) is dict and receipt.get('simulation_only') is True, 'complete simulation receipt required')
    if action == 'backup':
        require(receipt.get('schema') == 'rock-desktop-game-backup/1' and receipt.get('backup_id') == intent and
                receipt.get('backup') == '/var/tmp/rockstaros-preview-backups/'+intent and
                receipt.get('source_device') == config['device']['name'] and receipt.get('config') == config['device'],
                'complete backup source/intent differs')
        authority = receipt.get('authority', {}).get('receipt', {})
        require(authority.get('schema') == 'rock-game-sandbox-backup-receipt/1' and authority.get('backup_id') == intent and
                authority.get('authority_id') == GAME_AUTHORITY and authority.get('config_sha256') == release['game']['sha256'] and
                authority.get('simulation_only') is True, 'complete backup authority binding differs')
        validate_game_inventory(receipt)
    elif action == 'check-restore':
        require(receipt == {'schema': 'rock-desktop-game-restore-preflight/1', 'status': 'READY', 'intent': intent,
                           'backup': saved['backup'], 'source_device': config['device']['name'], 'new_device': name, 'simulation_only': True},
                'complete restore preflight binding differs')
    else:
        expected_config = {**config['device'], 'name': name}
        require(receipt.get('schema') == 'rock-desktop-game-restore/1' and receipt.get('status') == 'RESTORED' and
                receipt.get('device') == name and receipt.get('config') == expected_config and
                receipt.get('source_retired') is True and receipt.get('original_device_preserved') is True and
                receipt.get('same_host_current_copy_only') is True and
                receipt.get('binding') == {'intent': intent, 'source_device': config['device']['name'], 'new_device': name,
                    'os_backup_sha256': saved['os']['manifest_sha256'],
                    'authority_manifest_sha256': saved['authority']['receipt']['manifest_sha256']},
                'complete restore binding differs')
        authority = receipt.get('authority', {})
        require(authority.get('schema') == 'rock-game-sandbox-current-restore-receipt/1' and authority.get('status') == 'DONE' and
                authority.get('intent') == intent and authority.get('new_device') == name and
                authority.get('authority_id') == GAME_AUTHORITY and authority.get('config_sha256') == release['game']['sha256'] and
                authority.get('source_retired') is True and authority.get('same_host_current_copy_only') is True and
                authority.get('simulation_only') is True and
                authority.get('backup_manifest_sha256') == saved['authority']['receipt']['manifest_sha256'],
                'complete authority restore receipt differs')
        require(receipt.get('disks') == {disk: {key: saved['files']['os/'+disk][key] for key in ('bytes', 'sha256')}
                for disk in ('slot-a.ext4', 'slot-b.ext4', 'userdata.ext4')}, 'restored OS disks differ from the complete backup')
    return receipt


def validate_game_inventory(saved):
    files = saved.get('files')
    require(type(files) is dict and 11 <= len(files) <= 264, 'bounded full OS/authority backup inventory required')
    require({'os/backup.json', 'os/slot-a.ext4', 'os/slot-b.ext4', 'os/userdata.ext4',
             'authority/manifest.json', 'authority/plan.json'} <= set(files), 'OS or authority backup component is missing')
    total = 0
    for member, value in files.items():
        safe_member(member)
        require(type(value) is dict and set(value) == {'source', 'sha256', 'bytes'} and
                type(value['bytes']) is int and 0 <= value['bytes'] <= 2*1024**3, 'invalid complete backup file')
        hash_text(value['sha256']); total += value['bytes']
        if member.startswith('os/'):
            require(member in {'os/backup.json', 'os/slot-a.ext4', 'os/slot-b.ext4', 'os/userdata.ext4'} and
                    value['source'] == saved['os']['backup']+'/'+member[3:], 'OS export member/path differs')
        else:
            require(member in ('authority/manifest.json', 'authority/plan.json') or member.startswith('authority/files/'),
                    'unknown authority export member')
            require(value['source'] == saved['backup']+'/'+member, 'authority export member/path differs')
        require(Path(value['source']).is_absolute() and str(Path(value['source'])) == value['source'] and
                '..' not in Path(value['source']).parts, 'canonical absolute export source required')
    require(total <= 7*1024**3 and saved['os']['backup'].startswith('/var/tmp/rock-star-desktop/'+saved['source_device']+'/backups/'),
            'complete backup scope or byte bound differs')
    require(files['os/backup.json']['sha256'] == saved['os']['manifest_sha256'] and
            files['authority/manifest.json']['sha256'] == saved['authority']['receipt']['manifest_sha256'],
            'component manifests differ from full inventory')


def export_game_backup(root, saved, output):
    validate_game_inventory(saved)
    target = protected(output, new=True); target.mkdir(mode=0o700)
    for member, value in saved['files'].items():
        destination = target/member
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        for parent in destination.parents:
            if parent == target: break
            parent.chmod(0o700)
        lima(root, 'copy', '--backend=scp', VM_NAME+':'+value['source'], str(destination), timeout=180)
        destination.chmod(0o600)
        with destination.open('rb') as stream: os.fsync(stream.fileno())
        require(destination.stat().st_size == value['bytes'] and digest(destination) == value['sha256'],
                'exported complete backup differs; in-VM originals preserved')
    save(target/'backup.json', saved)
    for directory in sorted((path for path in target.rglob('*') if path.is_dir()), reverse=True):
        fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(fd)
        finally: os.close(fd)
    return str(target)


def install(args):
    observations = host_check()
    release = verify_release(args.manifest, args.archive, args.trusted_key, args.trusted_key_sha256,
                             manifest_sha256=args.manifest_sha256, allow_public_test_key=args.allow_public_test_key)
    root = protected(args.directory, new=True)
    require(len(str(root / 'lima' / VM_NAME).encode()) <= 70, 'VM socket path is too long; use a shorter installation directory')
    require(shutil.disk_usage(root.parent).free >= 10 * 1024**3, '初回導入には 10 GiB 以上の空き容量が必要です。')
    root.mkdir(mode=0o700)
    record = {'schema': OWNERSHIP, 'id': uuid.uuid4().hex, 'root': str(root), 'uid': os.geteuid(),
              'vm_name': VM_NAME, 'state': 'PREPARING', 'active_device': 'preview', 'retired_devices': [],
              'created_unix': time.time(), 'host': observations,
              'manifest_sha256': digest(args.manifest), 'archive_sha256': digest(args.archive),
              'source_commit': release['source_commit'], 'host_tools_commit': release['host_tools_commit']}
    save(root / 'installation.json', record)
    try:
        with locked(root):
            extract_verified(args.archive, root / 'payload', release['files'])
            save(root / 'release.json', release)
            record['installed_release_sha256'] = digest(root / 'release.json')
            for directory in ('lima', 'display', 'profiles'):
                (root / directory).mkdir(mode=0o700)
            save(root / 'vm-template.yaml', vm_config(root))
            record['state'] = 'CREATING_VM'
            save(root / 'installation.json', record)
            print('署名・hash を検証しました。専用の新規 Linux VM を作成しています。', flush=True)
            try:
                with (root / 'provision.log').open('x') as log:
                    result = subprocess.run([shutil.which('limactl'), 'start', '--tty=false', '--name=' + VM_NAME,
                                             '--timeout=20m', str(root / 'vm-template.yaml')],
                                            env=dict(os.environ, LIMA_HOME=str(root / 'lima')),
                                            stdout=log, stderr=subprocess.STDOUT, timeout=1250)
            finally:
                for name, field in (('lima.yaml', 'vm_config_sha256'), ('vz-identifier', 'vm_identity_sha256')):
                    path = root / 'lima' / VM_NAME / name
                    if path.is_file() and not path.is_symlink():
                        record[field] = digest(path)
                save(root / 'installation.json', record)
            require(result.returncode == 0, 'VM creation failed; inspect provision.log; owned partial resources are preserved')
            record.update(vm_config_sha256=digest(root / 'lima' / VM_NAME / 'lima.yaml'),
                          vm_identity_sha256=digest(root / 'lima' / VM_NAME / 'vz-identifier'))
            save(root / 'installation.json', record)
            # The guest copies only the verified read-only bundle into a protected
            # path. The host home and all pre-existing Lima instances are absent.
            setup = 'set -eu; test ! -e ' + GUEST_ROOT + '; sudo cp -R /mnt/rockstaros-package ' + GUEST_ROOT + '; sudo chmod 755 ' + GUEST_ROOT
            lima(root, 'shell', '--workdir', '/', VM_NAME, '/bin/sh', '-c', setup, timeout=120)
            record['game_prepared'] = prepare_sandbox(root, release)
            save(root / 'installation.json', record)
            probe = '''import json,subprocess,sys
from pathlib import Path
root=Path(sys.argv[1]);sys.path[:0]=[str(root/'native/os/desktop'),str(root/'native/os'),str(root/'native/src')]
import guest
config=json.loads(sys.stdin.read());guest.validate_config(config)
machine=subprocess.check_output(['qemu-system-aarch64','-machine','help'],text=True)
if 'virt-10.0' not in machine: raise ValueError('QEMU virt-10.0 support is required')
print(json.dumps({'image_preflight':'PASS','qemu':subprocess.check_output(['qemu-system-aarch64','--version'],text=True).splitlines()[0],
'python':sys.version.split()[0],'linux':Path('/etc/os-release').read_text(),'package_versions':subprocess.check_output(['dpkg-query','-W','python3','qemu-system-arm','qemu-utils','e2fsprogs','openssl'],text=True)}))'''
            profile_path = launcher_manifest(root, release, record, 'preview')
            profile = decode(read(profile_path))
            record['guest'] = json.loads(guest_python(root, probe, GUEST_ROOT, input=json.dumps(profile['device'])).stdout)
            record['state'] = 'INSTALLED'
            save(root / 'installation.json', record)
        return {'status': 'INSTALLED', 'directory': str(root), 'source_commit': release['source_commit'],
                'acceptance': 'installation preparation only; OS/UI/restore acceptance is separate',
                'next': 'python3 preview.py start --directory ' + str(root)}
    except BaseException as error:
        record.update(state='INSTALL_FAILED', error_type=type(error).__name__)
        save(root / 'installation.json', record)
        raise


def action(args):
    root, record = load(args.directory)
    with locked(root):
        if args.action == 'diagnose':
            identity = {'status': 'NOT_CREATED_OR_UNVERIFIABLE'}
            if 'vm_config_sha256' in record and 'vm_identity_sha256' in record:
                try:
                    instance = verify_vm(root, record)
                    identity = {'status': 'VERIFIED', 'vm_status': instance['status']}
                except (OSError, ValueError, subprocess.SubprocessError):
                    identity = {'status': 'MISMATCH_OR_REMOVED; no mutation performed'}
            return {'status': record['state'], 'source_commit': record['source_commit'], 'host': record['host'],
                    'guest': record.get('guest'), 'vm_identity': identity,
                    'active_device': record['active_device'], 'retired_devices': record['retired_devices'],
                    'pending_restore': record.get('pending_restore'), 'error_type': record.get('error_type'),
                    'data': 'preserved; simulator only; no secret or raw user data included'}
        require(record['state'] in ('INSTALLED', 'RETIRED', 'RESTORE_PENDING'), 'incomplete installation; inspect provision.log and use cleanup-failed')
        release = installed_release(root, record)
        if record['state'] == 'RESTORE_PENDING':
            require(args.action == 'restore' and release['game'] is not None,
                    'restore is pending; keep writers stopped and repeat the same Game restore name to recover')
        verify_installed(root, release)
        instance = verify_vm(root, record)
        if instance['status'] != 'Running':
            require(instance['status'] == 'Stopped',
                    'owned VM state is not stable Running/Stopped; preserving it for diagnosis')
            if args.action in ('status', 'stop'):
                return {'running': False, 'vm_status': instance['status'],
                        'active_device': record['active_device'], 'source_commit': record['source_commit'],
                        'observed': 'owned VM is not running; this does not infer a prior normal OS shutdown',
                        'wallet': 'SIMULATOR_ONLY'}
            lima(root, 'start', '--tty=false', VM_NAME, timeout=180)
            verify_vm(root, record)
        module = launcher(root)
        config = module.load(root / 'profiles' / (record['active_device'] + '.json'))
        if args.action == 'start':
            require(record['active_device'] not in record['retired_devices'], 'source was retired after restore')
            result = module.launch(config, not args.no_open)
            # The Game authority is independently owned and optional.  Start it
            # only after the OS/display launcher has passed its host-port and
            # ownership checks, so a failed OS launch cannot leave a new writer
            # running behind the caller's back.
            result['game'] = optional_sandbox(root, release, 'start')
            return result
        status = module.remote(config, 'status')
        module.verify_device_record(config, status)
        if args.action == 'status':
            return {'running': status['running'], 'active_device': record['active_device'],
                    'source_commit': record['source_commit'], 'wallet': 'SIMULATOR_ONLY',
                    'game': optional_sandbox(root, release, 'status')}
        if args.action == 'stop':
            print('OS 右上の端末操作 → 電源を切る → 確認して実行を選んでください。ブラウザを閉じるだけでは終了しません。', flush=True)
            deadline = time.monotonic() + args.timeout
            while status.get('running') and time.monotonic() < deadline:
                time.sleep(1)
                status = module.remote(config, 'status')
            require(not status.get('running'), 'normal UI shutdown was not observed before timeout; OS and data preserved')
            game = sandbox_command(root, release, 'stop') if release['game'] is not None else {'status': 'NOT_CONFIGURED'}
            return {'running': False, 'observed': 'owned QEMU stopped; use the OS UI for normal shutdown', 'game': game}
        require(not status.get('running'), 'OS を画面内の電源操作で終了してください。稼働中のデータは変更しません。')
        if args.action == 'backup':
            if release['game'] is not None:
                saved = game_transaction(root, release, config, 'backup', str(uuid.uuid4()))
                save(root/'last-backup.json', saved)
                exported = export_game_backup(root, saved, args.output) if args.output else None
                return {'status': 'SAVED', 'backup': saved['backup'], 'export': exported, 'encrypted': False,
                        'components': 'complete OS A/B/data and independent Wallet/Game/C state', 'restore_scope': saved['restore_scope']}
            saved = module.backup_profile(config)
            if args.output:
                target = protected(args.output, new=True)
                target.mkdir(mode=0o700)
                # Preserve an independently usable off-VM copy. Remote restore
                # remains the existing same-host/offline new-device contract.
                for name in ('backup.json', 'slot-a.ext4', 'slot-b.ext4', 'userdata.ext4'):
                    lima(root, 'copy', '--backend=scp', VM_NAME + ':' + saved['backup'] + '/' + name, str(target / name), timeout=180)
                    (target / name).chmod(0o600)
                    with (target / name).open('rb') as exported:
                        os.fsync(exported.fileno())
                for name, item in saved['disks'].items():
                    require(digest(target / name) == item['sha256'] and (target / name).stat().st_size == item['bytes'],
                            'exported backup differs; original backup preserved')
                save(target / 'installation-origin.json', {'schema': 'rockstaros-preview-backup-origin/1',
                     'installation_id': record['id'], 'source_commit': record['source_commit'],
                     'backup': saved['backup'], 'restore_scope': 'same owned VM; original OS stopped; new device name'})
            save(root / 'last-backup.json', saved)
            return {'status': 'SAVED', 'backup': saved['backup'], 'export': str(args.output) if args.output else None,
                    'encrypted': False, 'restore_scope': 'same owned VM, new offline device; external game servers excluded'}
        if args.action == 'restore':
            require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}', args.name) and
                    args.name != record['active_device'] and args.name not in record['retired_devices'], 'new restore device name required')
            saved = decode(read(root / 'last-backup.json'))
            require(saved.get('source_device') == record['active_device'] and saved.get('config') == config['device'],
                    'backup does not belong to this active device')
            if release['game'] is not None:
                if record['state'] == 'RESTORE_PENDING':
                    pending = record['pending_restore']
                    require(pending['name'] == args.name and pending['source'] == record['active_device'] and
                            pending['backup'] == saved['backup'] and pending['backup_sha256'] == digest(root/'last-backup.json'),
                            'repeat exactly the pending restore; backup/name cannot change')
                else:
                    require(not (root/'profiles'/(args.name+'.json')).exists(), 'restore profile already exists')
                    pending = {'intent': str(uuid.uuid4()), 'name': args.name, 'source': record['active_device'],
                               'backup': saved['backup'], 'backup_sha256': digest(root/'last-backup.json')}
                    game_transaction(root, release, config, 'check-restore', pending['intent'], saved=saved,
                                     name=args.name, retired=record['retired_devices'])
                    close_owned_display(module, config)
                    record.update(state='RESTORE_PENDING', pending_restore=pending)
                    save(root/'installation.json', record)
                restored = game_transaction(root, release, config, 'restore', pending['intent'], saved=saved,
                                            name=args.name, retired=record['retired_devices'])
                launcher_manifest(root, release, record, args.name)
                save(root/'last-restore.json', restored)
                record['retired_devices'].append(record['active_device'])
                record.update(active_device=args.name, state='INSTALLED')
                del record['pending_restore']; save(root/'installation.json', record)
                return {'status': 'RESTORED', 'active_device': args.name, 'original': 'preserved and retired by the OS/authority gate',
                        'scope': 'same-host current copy, all authority and OS post-state verified',
                        'next': 'start the restored device and verify saved Hub results and synthetic Wallet/Game'}
            require(not (root / 'profiles' / (args.name + '.json')).exists(), 'restore profile already exists')
            close_owned_display(module, config)
            # Persist a fail-closed transaction marker before creating another
            # copy. A killed process cannot silently resume the source writer.
            record['state'] = 'RESTORE_PENDING'
            record['pending_restore'] = {'name': args.name, 'source': record['active_device'], 'backup': saved['backup']}
            save(root / 'installation.json', record)
            # Reuse guest.restore_backup: all disk hashes, signatures and clean
            # filesystems are rechecked; existing destinations are never adopted.
            restored = module.remote(dict(config, device={**config['device'], 'name': args.name}),
                                     'restore', {'backup': saved['backup']})
            require(restored.get('status') == 'RESTORED' and restored.get('device') == args.name,
                    'unexpected restore receipt')
            launcher_manifest(root, release, record, args.name)
            record['retired_devices'].append(record['active_device'])
            record['active_device'] = args.name
            record['state'] = 'INSTALLED'
            del record['pending_restore']
            save(root / 'installation.json', record)
            save(root / 'last-restore.json', restored)
            return {'status': 'RESTORED', 'active_device': args.name, 'original': 'preserved and retired from this launcher',
                    'next': 'start the restored device and verify saved Hub results and synthetic Wallet'}
        if args.action == 'remove':
            require(args.delete_data, 'remove requires --delete-data; export a stopped backup first to retain data')
            # Check every recorded device, including restored sources, before VM
            # deletion. No --force and no action against the user's default Lima.
            for name in record['retired_devices']:
                other = module.load(root / 'profiles' / (name + '.json'))
                require(not module.remote(other, 'status').get('running'), 'retired source still running; preserving VM')
                close_owned_display(module, other)
            close_owned_display(module, config)
            if release['game'] is not None:
                sandbox_command(root, release, 'stop')
            lima(root, 'stop', VM_NAME, timeout=180)
            verify_vm(root, record)
            lima(root, 'delete', '--tty=false', VM_NAME, timeout=180)
            record['state'] = 'REMOVED'
            save(root / 'installation.json', record)
            # Leave the small receipt/bootstrap/evidence directory for diagnosis.
            # The only VM deleted was inside this installation's private Lima home.
            return {'status': 'REMOVED', 'deleted': 'owned VM and all its OS data/in-VM backups',
                    'retained': 'host package, receipts and separately exported backups', 'directory': str(root)}
    raise ValueError('unknown action')


def cleanup_failed(args):
    root, record = load(args.directory)
    with locked(root):
        require(record['state'] == 'INSTALL_FAILED' and args.delete_data,
                'cleanup-failed requires a failed installation and --delete-data')
        vm = root / 'lima' / VM_NAME
        if vm.exists():
            # A failed creator might not have produced an identity. Refuse to
            # guess in that case; its local metadata remains for explicit review.
            instance = verify_vm(root, record)
            if instance['status'] == 'Running':
                lima(root, 'stop', VM_NAME, timeout=180)
            lima(root, 'delete', '--tty=false', VM_NAME, timeout=180)
        record['state'] = 'REMOVED'
        save(root / 'installation.json', record)
        return {'status': 'REMOVED', 'retained': 'failed-install logs, verified package and ownership receipt',
                'default_lima_home': 'not read or modified'}


def fetch(args):
    url = urlsplit(args.url)
    require(url.scheme == 'https' and url.hostname and not url.username and not url.password and not url.fragment,
            'HTTPS archive URL without credentials or fragment required')
    target = protected(args.output, new=True)
    expected = hash_text(args.sha256)
    created = False
    identity = None
    try:
        with urlopen(args.url, timeout=60) as response, target.open('xb') as output:
            created = True
            info = os.fstat(output.fileno())
            identity = (info.st_dev, info.st_ino)
            require(urlsplit(response.geturl()).scheme == 'https', 'download redirected away from HTTPS')
            total = 0
            while block := response.read(1024**2):
                total += len(block)
                require(total <= MAX_ARCHIVE, 'download exceeds archive bound')
                output.write(block)
        require(digest(target) == expected, 'download SHA-256 mismatch')
        return {'status': 'DOWNLOADED', 'sha256': expected, 'path': str(target), 'signature': 'verify before installation'}
    except BaseException:
        if created and target.exists():
            info = target.lstat()
            if (info.st_dev, info.st_ino) == identity:
                target.unlink()
        raise


def main():
    parser = argparse.ArgumentParser(description=TITLE)
    sub = parser.add_subparsers(dest='action', required=True)
    for name in ('verify', 'install'):
        item = sub.add_parser(name)
        item.add_argument('--manifest', required=True, type=Path)
        item.add_argument('--archive', required=True, type=Path)
        item.add_argument('--trusted-key', required=True, type=Path)
        item.add_argument('--trusted-key-sha256', required=True)
        item.add_argument('--manifest-sha256')
        item.add_argument('--allow-public-test-key', action='store_true')
        if name == 'install':
            item.add_argument('--directory', required=True, type=Path)
    for name in ('start', 'status', 'stop', 'backup', 'restore', 'diagnose', 'remove', 'cleanup-failed'):
        item = sub.add_parser(name)
        item.add_argument('--directory', type=Path, required=True)
        if name == 'start':
            item.add_argument('--no-open', action='store_true')
        elif name == 'stop':
            item.add_argument('--timeout', type=int, choices=range(1, 601), default=120)
        elif name == 'backup':
            item.add_argument('--output', type=Path)
        elif name == 'restore':
            item.add_argument('--name', required=True)
        elif name in ('remove', 'cleanup-failed'):
            item.add_argument('--delete-data', action='store_true')
    item = sub.add_parser('fetch')
    item.add_argument('--url', required=True)
    item.add_argument('--sha256', required=True)
    item.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    print(TITLE, flush=True)
    if args.action == 'verify':
        result = verify_release(args.manifest, args.archive, args.trusted_key, args.trusted_key_sha256,
                                manifest_sha256=args.manifest_sha256, allow_public_test_key=args.allow_public_test_key)
        result = {'status': 'VERIFIED', 'source_commit': result['source_commit'], 'trust': result['trust'],
                  'archive_sha256': result['archive']['sha256'], 'OS_acceptance': 'separate gate'}
    elif args.action == 'install':
        result = install(args)
    elif args.action == 'fetch':
        result = fetch(args)
    elif args.action == 'cleanup-failed':
        result = cleanup_failed(args)
    else:
        result = action(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        # Avoid echoing subprocess argv or raw output which might hold a display
        # credential. Logs and structured diagnostics remain installation-local.
        print(TITLE + ': ' + (str(error) if isinstance(error, ValueError) else type(error).__name__), file=sys.stderr)
        raise SystemExit(1)
