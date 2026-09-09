"""Explicit purchaser v5 / local v6 stage0 and stopped A/B/data boundary.

Only existing public RFC8032 development verification is reused. No key is
created, no profile is rewritten, no backend is provisioned and no disk repaired.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

from guest import digest, require, save

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os')]
DISKS = ('slot-a.ext4', 'slot-b.ext4', 'userdata.ext4')


def regular(path, *, private=False, readonly=False, maximum=2*1024**3):
    info = Path(path).lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid in (0, os.geteuid()) and
            0 < info.st_size <= maximum, 'owned bounded single-link regular file required')
    if private:
        require(info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o600, 'private disk file required')
    if readonly:
        require(not info.st_mode & 0o222, 'immutable image/profile required')
    return info


def read_json(path, limit=65536):
    regular(path, maximum=limit)
    from service_access.profile import _update_helpers
    _, update = _update_helpers()
    return update.decode(Path(path).read_bytes(), limit)


def verified_profile(config):
    from service_access import profile, serve
    image = Path(config['images'])
    require(image.resolve(strict=True) == image, 'canonical non-symlink image directory required')
    boot = config['boot']
    require(type(boot) is dict and set(boot) == {'mode', 'factory_sha256', 'profile_sha256'} and
            boot['mode'] == 'signed-stage0', 'explicit pinned signed-stage0 boot required')
    for field in ('factory_sha256', 'profile_sha256'):
        require(type(boot[field]) is str and re.fullmatch('[0-9a-f]{64}', boot[field]), 'invalid stage0/profile digest')
    inputs = profile._inputs(image, config['sha256'])
    regular(image/'profile.json', readonly=True, maximum=65536)
    require(digest(image/'profile.json') == boot['profile_sha256'], 'purchaser profile digest changed')
    record = read_json(image/'profile.json')
    require(record.get('schema') == 'rock-closed-service-image-profile/1' and record.get('status') == 'PREPARED',
            'completed purchaser profile required')
    raw = profile._stage0(image/'stage0.cpio.gz')['factory']
    require(hashlib.sha256(raw).hexdigest() == boot['factory_sha256'], 'factory pin mismatch')
    _, update = profile._update_helpers()
    envelope = update.decode(raw, 8192); manifest = update.verify_envelope(envelope)
    require(manifest['sha256'] == inputs['rootfs.ext4']['sha256'] and manifest['size'] == inputs['rootfs.ext4']['size'],
            'signed factory does not bind the pinned rootfs')
    require(record['stage0']['output_factory'] == envelope and record['stage0']['output_factory_sha256'] == boot['factory_sha256'],
            'profile and signed factory disagree')
    for name in profile.IMAGE_NAMES:
        require(record['images'][name]['sha256'] == inputs[name]['sha256'] and
                record['images'][name]['size'] == inputs[name]['size'], 'profile image set mismatch')
    service = update.decode(profile._cat(image/'rootfs.ext4', profile.SERVICE_PATH), 16384)
    wallet = update.decode(profile._cat(image/'rootfs.ext4', profile.WALLET_PATH), 16384)
    authenticator = update.decode(profile._cat(image/'rootfs.ext4', profile.AUTH_PATH), 16384)
    token = profile._cat(image/'rootfs.ext4', profile.TOKEN_PATH).decode('ascii').strip()
    profile.configurations(service, wallet, token, authenticator)
    require(profile.os_client.binding(service) == record['binding'] and
            service['authority_id'] == wallet['authority_id'] == config['services']['authority_id'] and
            service['device_ref'] == wallet['device_ref'], 'embedded purchaser/Wallet/backend scope differs')
    # Offline boot survives an unavailable host backend. A PRESENT backend
    # configuration may not silently point this profile at other service ports.
    backend_path = Path(config['services']['config'])
    if os.path.lexists(backend_path):
        backend = serve.load(backend_path, config['services']['sha256'], config['services']['authority_id'])
        require(record['binding']['device_ref'] == serve.DEVICE and record['binding']['consumer_id'] == 'alice-a',
                'launcher backend supports its fixed current purchaser only')
        require(urlsplit(service['registry_origin']).port == backend['registry_port'] and
                urlsplit(service['runner_origin']).port == backend['runner_port'] and
                urlsplit(wallet['origin']).port == backend['wallet_port'], 'backend endpoint/profile mismatch')
        if 'mcp' in backend:
            # The optional provider is supervised on the host. Only its fixed
            # gateway belongs in the signed device image; an offline backend
            # must not turn this local consistency check into an online gate.
            mcp_raw = profile._cat(image/'rootfs.ext4', profile.MCP_PATH)
            mcp = update.decode(mcp_raw, 16384)
            require(type(mcp) is dict, 'configured MCP gateway object required')
            profile.configurations(service, wallet, token, authenticator, mcp_configuration=mcp)
            require(record.get('mcp_configuration_sha256') == hashlib.sha256(mcp_raw).hexdigest(),
                    'MCP profile configuration digest mismatch')
            require(urlsplit(mcp['gateway_origin']).port == backend['mcp']['gateway_port'] and
                    record['binding']['consumer_id'] == backend['mcp']['consumer_id'],
                    'MCP backend endpoint/profile mismatch')
    return {'factory': envelope, 'factory_sha256': boot['factory_sha256'], 'profile_sha256': boot['profile_sha256'],
            'rootfs_size': manifest['size'], 'binding': record['binding']}


def verified_local_profile(config):
    """Separate local admission; never reinterpret a purchaser configuration.

    The image triple is read-only and independently hash-pinned. Reuse the
    existing bounded newc parser, real update signature verification, and full
    unconfigured-base/source/authenticator checks. No keys, profiles or disks
    are written. There is no purchaser profile.json or backend fallback here.
    """
    from service_access import profile
    require(config.get('schema') == 'rock-desktop-device/6' and config.get('network') == 'none' and
            'services' not in config, 'explicit offline local A/B configuration required')
    image, boot = Path(config['images']), config['boot']
    require(type(boot) is dict and set(boot) == {'mode', 'profile', 'factory_sha256'} and
            boot['mode'] == 'signed-stage0' and boot['profile'] == 'local-development' and
            type(boot['factory_sha256']) is str and re.fullmatch('[0-9a-f]{64}', boot['factory_sha256']),
            'strict local signed-stage0 boot fields required')
    inputs = profile._inputs(image, config['sha256'])
    raw = profile._stage0(image/'stage0.cpio.gz')['factory']
    require(hashlib.sha256(raw).hexdigest() == boot['factory_sha256'], 'local factory pin mismatch')
    _, update = profile._update_helpers()
    envelope = update.decode(raw, 8192); manifest = update.verify_envelope(envelope)
    require(manifest['sha256'] == inputs['rootfs.ext4']['sha256'] and manifest['size'] == inputs['rootfs.ext4']['size'],
            'signed local factory does not bind the pinned rootfs')
    # This checks absent purchaser/service/MCP/Wallet configuration, protected
    # guest directories, exact embedded service+CA sources, and a public test
    # authenticator. Merely deleting the host services field cannot pass it.
    source_hashes = profile._image_preflight(image/'rootfs.ext4')
    require(profile._inputs(image, config['sha256']) == inputs, 'local image triple changed during preflight')
    return {'profile': 'local-development', 'factory': envelope, 'factory_sha256': boot['factory_sha256'],
            'rootfs_size': manifest['size'], 'images': inputs, 'source_sha256': source_hashes,
            'external_authority': False, 'simulation_only': True, 'boot_verified': False}


def copy_file(source, destination):
    before = regular(source)
    fd = os.open(destination, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
    with Path(source).open('rb') as incoming, os.fdopen(fd, 'wb') as outgoing:
        shutil.copyfileobj(incoming, outgoing, 1024*1024); outgoing.flush(); os.fsync(outgoing.fileno())
    after = regular(source)
    require((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns) ==
            (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and
            digest(source) == digest(destination), 'disk changed while copied')


def validate_disks(config, state):
    size = (Path(config['images'])/'rootfs.ext4').stat().st_size
    inodes = set()
    for name in DISKS:
        require(os.path.lexists(state/name), 'saved A/B/data image missing; explicit recovery required')
        info = regular(state/name, private=True)
        require((info.st_dev, info.st_ino) not in inodes, 'slots and data must be distinct files')
        inodes.add((info.st_dev, info.st_ino))
        require(info.st_size == (256*1024**2 if name == 'userdata.ext4' else size), 'saved disk capacity changed')


def prepare_disks(config, state):
    """Caller holds device lock and excludes live/unrecorded QEMU sockets."""
    size = (Path(config['images'])/'rootfs.ext4').stat().st_size
    marker = state/'device.json'
    if os.path.lexists(marker):
        regular(marker, private=True, maximum=65536)
        require(read_json(marker) == config, 'saved device belongs to different OS images; use a new device name')
        validate_disks(config, state)
        check = subprocess.run(['e2fsck','-f','-n',str(state/'userdata.ext4')],capture_output=True,text=True,timeout=30)
        require(check.returncode == 0, 'saved data needs explicit recovery; no repair or formatting was performed')
        # stage0 verifies the selected signed slot; this must not overwrite a
        # legitimate B update with the factory image during ordinary restart.
        return
    require(not any(os.path.lexists(state/name) for name in DISKS),
            'unidentified or partial A/B/data set; no formatting was performed')
    require({path.name for path in state.iterdir()} <= {'lock'},
            'existing device history without complete marker; explicit recovery required')
    copy_file(Path(config['images'])/'rootfs.ext4', state/'slot-a.ext4')
    for name, length in (('slot-b.ext4',size), ('userdata.ext4',256*1024**2)):
        fd = os.open(state/name,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as stream:
            stream.truncate(length);stream.flush();os.fsync(stream.fileno())
    subprocess.run(['mkfs.ext4','-q','-F','-L','rock-desktop',str(state/'userdata.ext4')],check=True,timeout=30)
    save(marker,config)


def _state_bytes(data):
    result = subprocess.run(['debugfs','-R','cat /rock-update/state.json',str(data)],capture_output=True,timeout=30)
    require(result.returncode == 0, 'cannot inspect stopped update state')
    if b'File not found by ext2_lookup' in result.stderr:
        return None
    require(0 < len(result.stdout) <= 65536, 'bounded stopped update state required')
    return result.stdout


def stopped_slots(config, state):
    """Conservative backup admission: all signed slot records must match bytes.

    Existing pending/failed update state is preserved, but not exported as a
    successful ordinary backup until its explicit recovery completes.
    """
    from service_access.profile import _update_helpers
    _, update = _update_helpers()
    raw = _state_bytes(state/'userdata.ext4')
    if raw is None:
        require(digest(state/'slot-a.ext4') == config['sha256']['rootfs.ext4'], 'missing state with changed factory A')
        with (state/'slot-b.ext4').open('rb') as stream:
            while block := stream.read(1024*1024): require(not block.strip(b'\0'), 'missing state with nonempty B')
        return {'mode':'unbooted-factory','update_state_sha256':None,'committed':None,'floor':None}
    with tempfile.TemporaryDirectory(prefix='desktop-ab-read-') as temporary:
        path = Path(temporary); (path/'state.json').write_bytes(raw); (path/'state.json').chmod(0o600)
        checker = update.Updater(data=path,devices={'A':state/'slot-a.ext4','B':state/'slot-b.ext4'},test_regular_files=True)
        saved = checker.read_state()
        require(saved['pending'] is None, 'pending update needs explicit recovery before ordinary backup')
        for slot in ('A','B'):
            if saved['slots'][slot] is not None: checker.verify_slot(slot,saved['slots'][slot])
        return {'mode':'signed-committed','update_state_sha256':hashlib.sha256(raw).hexdigest(),
                'committed':saved['committed'],'floor':saved['floor']}
