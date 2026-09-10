"""Prepare a NEW Linux development purchaser image; never boot or alter its base.

Only existing public fixture credentials and the existing RFC 8032 update signer
are supported. The derived stage0 factory binds the derived rootfs, preserving
every other archive entry. This is image preparation, not an OS boot proof or
production provisioning. The caller supplies hashes of an independently reviewed
base and the configurations returned by its one ClosedServiceAuthority.
"""
from contextlib import ExitStack
import gzip
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

from blackberryrock.packages import canonical
from entitlement.protocol import PUBLIC_TOKENS, identifier
from .controller import PUBLIC_SERVICE_TOKENS
from . import os_client

ROOT = Path(__file__).resolve().parents[2]
IMAGE_NAMES = ('Image', 'rootfs.ext4', 'stage0.cpio.gz')
BOUNDS = {'Image': (64, 128 * 1024**2), 'rootfs.ext4': (8 * 1024**2, 2 * 1024**3),
          'stage0.cpio.gz': (32, 256 * 1024**2)}
SERVICE_PATH = '/etc/rock-platform/service-access.json'
REQUIRED_PATH = '/etc/rock-platform/service-access.required'
WALLET_PATH = '/etc/rock-wallet/backend.json'
TOKEN_PATH = '/etc/rock-wallet/backend-token'
AUTH_PATH = '/etc/rock-authenticator/device.json'
MCP_PATH = '/etc/rock-platform/mcp-services.json'
CA_PATH = '/usr/share/rock/development-store-ca.pem'
FACTORY_PATH = 'etc/rock-update/factory.json'
REQUIRED_BYTES = b'rock-purchaser-services-device/1\n'
SOURCE_BINDINGS = {
    '/usr/lib/rock-platform/service_access/os_client.py': 'os/service_access/os_client.py',
    '/usr/lib/rock-platform/service_access/status.py': 'os/service_access/status.py',
    '/usr/lib/rock-platform/service.py': 'os/platform/service.py',
    '/usr/lib/rock-platform/wallet_backend/client.py': 'os/wallet_backend/client.py',
    '/usr/lib/rock-platform/wallet_auth/daemon.py': 'os/wallet_auth/daemon.py',
    CA_PATH: 'os/registry/fixtures/development-ca.pem',
}
MCP_SOURCE_BINDINGS = {
    '/usr/lib/rock-platform/mcp_broker/device_client.py': 'os/mcp_broker/device_client.py',
    '/usr/lib/rock-platform/mcp_broker/http.py': 'os/mcp_broker/http.py',
}


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def _update_helpers():
    # Same existing host-only helper and public fixture as build-initramfs.py.
    source = ROOT / 'os/update'
    if str(source) not in sys.path:
        sys.path.insert(0, str(source))
    import make_bundle
    import rock_update
    require(Path(make_bundle.__file__).resolve() == source / 'make_bundle.py' and
            Path(rock_update.__file__).resolve() == source / 'rock_update.py',
            'unexpected update helper origin')
    return make_bundle, rock_update


def configurations(service, wallet, token, authenticator, *, mcp_configuration=None):
    """Strict public-fixture profile subset; no credentials are generated."""
    service = os_client.validate(service)
    require(type(wallet) is dict and set(wallet) == {
        'schema_version', 'mode', 'origin', 'authority_id', 'device_ref', 'ca_file', 'token_file'} and
        type(wallet['schema_version']) is int and wallet['schema_version'] == 2 and
        wallet['mode'] == 'development-remote-authority', 'bound Wallet configuration required')
    require(wallet['authority_id'] == service['authority_id'] and
            wallet['device_ref'] == service['device_ref'], 'Wallet and service binding differ')
    identifier(service['device_ref'], fixture=True)
    require(wallet['ca_file'] == CA_PATH and wallet['token_file'] == TOKEN_PATH,
            'fixed current CA and Wallet token paths required')
    origins = [urlsplit(service[key]) for key in ('registry_origin', 'runner_origin')]
    require(isinstance(wallet['origin'], str), 'invalid Wallet origin')
    origins.append(urlsplit(wallet['origin']))
    require(all(origin.scheme == 'https' and origin.hostname == '10.0.2.2' and
                origin.username is None and origin.password is None and not origin.path and
                not origin.query and not origin.fragment and origin.port is not None and
                1024 <= origin.port <= 65535 for origin in origins) and
            len({origin.port for origin in origins}) == 3,
            'three distinct fixed QEMU development HTTPS endpoints required')
    from wallet_backend.server import PUBLIC_SECOND_DEVICE_TOKEN
    wallet_tokens = {PUBLIC_SERVICE_TOKENS['alice-a']: PUBLIC_TOKENS['alice'],
                     PUBLIC_SERVICE_TOKENS['alice-b']: PUBLIC_SECOND_DEVICE_TOKEN,
                     PUBLIC_SERVICE_TOKENS['bob']: PUBLIC_TOKENS['bob']}
    require(isinstance(token, str) and service['token'] in wallet_tokens and
            token == wallet_tokens[service['token']], 'mismatched public Wallet fixture token')
    require(type(authenticator) is dict and set(authenticator) == {'schema_version', 'kind', 'device_ref'} and
            type(authenticator['schema_version']) is int and authenticator['schema_version'] == 1 and
            authenticator['kind'] == 'public-software-test-authenticator' and
            authenticator['device_ref'] == service['device_ref'], 'authenticator device binding differs')
    payloads = {SERVICE_PATH: canonical(service) + b'\n', REQUIRED_PATH: REQUIRED_BYTES,
                WALLET_PATH: canonical(wallet) + b'\n', TOKEN_PATH: token.encode('ascii') + b'\n',
                AUTH_PATH: canonical(authenticator) + b'\n'}
    if mcp_configuration is not None:
        require(type(mcp_configuration) is dict and set(mcp_configuration) == {'schema', 'gateway_origin'} and
                mcp_configuration['schema'] == 'rock-mcp-hub-device/1' and
                type(mcp_configuration['gateway_origin']) is str,
                'strict optional MCP gateway configuration required')
        origin = urlsplit(mcp_configuration['gateway_origin'])
        require(origin.scheme == 'https' and origin.hostname == '10.0.2.2' and
                origin.port is not None and 1024 <= origin.port <= 65535 and
                mcp_configuration['gateway_origin'] == f'https://10.0.2.2:{origin.port}' and
                origin.port not in {item.port for item in origins},
                'distinct fourth fixed QEMU HTTPS endpoint required')
        payloads[MCP_PATH] = canonical(mcp_configuration) + b'\n'
    return payloads


def _path(value, *, exists):
    path = Path(value)
    require(path.is_absolute() and str(path) == str(path.resolve(strict=exists)) and
            re.fullmatch(r'/[A-Za-z0-9_./-]+', str(path)) is not None,
            'absolute canonical path without symlinks required')
    return path


def _inputs(base, expected):
    base = _path(base, exists=True)
    require(base.is_dir(), 'base image directory required')
    require(type(expected) is dict and set(expected) == set(IMAGE_NAMES) and all(
        isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) for value in expected.values()),
        'exact independently pinned image hashes required')
    result = {}
    for name in IMAGE_NAMES:
        path = _path(base / name, exists=True)
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, 'rb') as stream:
            info = os.fstat(stream.fileno())
            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and
                    info.st_uid in (0, os.geteuid()) and not info.st_mode & 0o222,
                    'base images must be single-link read-only regular files')
            low, high = BOUNDS[name]
            require(low <= info.st_size <= high, 'base image size outside supported bounds')
            if name == 'Image':
                require(stream.read(64)[56:60] == b'ARM\x64', 'ARM64 kernel Image header required')
                stream.seek(0)
            actual = hashlib.file_digest(stream, 'sha256').hexdigest()
            require(actual == expected[name], 'base image hash mismatch: ' + name)
            after = os.fstat(stream.fileno())
            require(all(getattr(after, field) == getattr(info, field) for field in
                        ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')),
                    'base image changed while read')
        result[name] = {'path': str(path), 'sha256': actual, 'size': info.st_size}
    return result


def _debug(image, command, *, write=False, cwd=None):
    return subprocess.run(['debugfs', *(['-w'] if write else []), '-R', command, str(image)],
                          cwd=cwd, capture_output=True, check=True, timeout=30)


def _metadata(image, path):
    require(path in {*SOURCE_BINDINGS, *MCP_SOURCE_BINDINGS, SERVICE_PATH, REQUIRED_PATH, WALLET_PATH,
                    TOKEN_PATH, AUTH_PATH, MCP_PATH,
                    '/etc', '/etc/rock-platform', '/etc/rock-wallet', '/etc/rock-authenticator',
                    '/usr', '/usr/share', '/usr/share/rock', '/usr/lib', '/usr/lib/rock-platform',
                    '/usr/lib/rock-platform/service_access', '/usr/lib/rock-platform/wallet_backend',
                    '/usr/lib/rock-platform/wallet_auth', '/usr/lib/rock-platform/mcp_broker'},
            'fixed image metadata path required')
    result = _debug(image, 'stat ' + path)
    raw = result.stdout.decode('utf-8', 'strict')
    if 'File not found by ext2_lookup' in result.stderr.decode('utf-8', 'replace'):
        return None
    kind = re.search(r'Type:\s+(\S+)\s+Mode:\s+([0-7]+)', raw)
    owner = re.search(r'User:\s+(\d+)\s+Group:\s+(\d+)', raw)
    links = re.search(r'Links:\s+(\d+)', raw)
    require(kind and owner and links, 'cannot read exact image inode metadata: ' + path)
    return {'type': kind[1], 'mode': int(kind[2], 8), 'uid': int(owner[1]),
            'gid': int(owner[2]), 'links': int(links[1])}


def _cat(image, path):
    require(path in {*SOURCE_BINDINGS, *MCP_SOURCE_BINDINGS, SERVICE_PATH, REQUIRED_PATH,
                    WALLET_PATH, TOKEN_PATH, AUTH_PATH, MCP_PATH},
            'fixed image content path required')
    return _debug(image, 'cat ' + path).stdout


def _regular(image, path):
    info = _metadata(image, path)
    require(info is not None and info['type'] == 'regular' and info['links'] == 1 and
            info['uid'] == info['gid'] == 0 and not info['mode'] & 0o022 and
            info['mode'] & 0o444 == 0o444,
            'protected single-link guest file required: ' + path)
    return info


def _image_preflight(image, *, mcp_enabled=False):
    directories = ('/etc', '/usr', '/usr/share', '/usr/share/rock', '/usr/lib',
                      '/usr/lib/rock-platform', '/usr/lib/rock-platform/service_access',
                      '/usr/lib/rock-platform/wallet_backend', '/usr/lib/rock-platform/wallet_auth',
                      '/etc/rock-platform', '/etc/rock-authenticator')
    if mcp_enabled:
        directories += ('/usr/lib/rock-platform/mcp_broker',)
    for directory in directories:
        info = _metadata(image, directory)
        require(info is not None and info['type'] == 'directory' and info['uid'] == info['gid'] == 0 and
                info['mode'] == 0o755, 'protected searchable guest parent directory required: ' + directory)
    for path in (SERVICE_PATH, REQUIRED_PATH, '/etc/rock-wallet'):
        require(_metadata(image, path) is None, 'base must be an unconfigured new-device image')
    # None must not silently carry an old gateway into a newly signed profile.
    # Older unconfigured bases need no MCP modules, but must have no MCP config.
    require(_metadata(image, MCP_PATH) is None, 'base MCP profile must be unconfigured')
    hashes = {}
    bindings = {**SOURCE_BINDINGS, **MCP_SOURCE_BINDINGS} if mcp_enabled else SOURCE_BINDINGS
    for destination, relative in bindings.items():
        _regular(image, destination)
        expected = (ROOT / relative).read_bytes()
        require(_cat(image, destination) == expected, 'base embedded source/CA differs: ' + relative)
        hashes[relative] = hashlib.sha256(expected).hexdigest()
    _regular(image, AUTH_PATH)
    value = os_client.decode(_cat(image, AUTH_PATH))
    require(type(value) is dict and set(value) == {'schema_version', 'kind', 'device_ref'} and
            type(value['schema_version']) is int and value['schema_version'] == 1 and
            value['kind'] == 'public-software-test-authenticator', 'invalid base authenticator configuration')
    identifier(value['device_ref'], fixture=True)
    return hashes


def _stage0(path, *, destination=None, replacement=None):
    """Bounded streaming newc rewrite; never extract or resolve archive paths."""
    seen, total, factory, other = set(), 0, None, hashlib.sha256()
    with ExitStack() as stack:
        source = stack.enter_context(gzip.open(path, 'rb'))
        output = None
        if destination is not None:
            require(type(replacement) is bytes and len(replacement) <= 8192, 'bounded factory replacement required')
            raw_output = stack.enter_context(Path(destination).open('xb'))
            output = stack.enter_context(gzip.GzipFile(filename='', mode='wb', fileobj=raw_output, mtime=0))
        while True:
            header = source.read(110)
            require(len(header) == 110 and header[:6] == b'070701' and
                    re.fullmatch(b'[0-9a-fA-F]{104}', header[6:]), 'invalid stage0 newc header')
            fields = [int(header[i:i+8], 16) for i in range(6, 110, 8)]
            mode, size, length = fields[1], fields[6], fields[11]
            require(1 <= length <= 4096 and size <= 64 * 1024**2 and fields[12] == 0,
                    'stage0 member exceeds bounds')
            encoded = source.read(length)
            require(len(encoded) == length and encoded[-1:] == b'\0' and b'\0' not in encoded[:-1],
                    'invalid stage0 member name')
            name = encoded[:-1].decode('utf-8', 'strict')
            require(name and name not in seen and not name.startswith('/') and
                    '..' not in PurePosixPath(name).parts and str(PurePosixPath(name)) == name,
                    'duplicate or unsafe stage0 path')
            seen.add(name)
            total += 110 + length + size + 6
            require(len(seen) <= 10000 and total <= 512 * 1024**2, 'stage0 expansion limit')
            padding = source.read(-(110 + length) % 4)
            require(padding == b'\0' * (-(110 + length) % 4), 'invalid stage0 name padding')
            selected = name == FACTORY_PATH
            if selected:
                require(stat.S_ISREG(mode) and fields[2:5] == [0, 0, 1] and
                        not mode & 0o022 and size <= 8192, 'invalid factory inode')
            if name == 'TRAILER!!!':
                require(size == 0, 'invalid stage0 trailer')
            if not selected:
                other.update(header + encoded + padding)
            if output:
                new_header = header
                if selected:
                    new_fields = fields[:]
                    new_fields[6] = len(replacement)
                    new_header = b'070701' + b''.join(f'{value:08x}'.encode() for value in new_fields)
                output.write(new_header + encoded + padding)
            remaining, chunks = size, []
            while remaining:
                block = source.read(min(remaining, 1024**2))
                require(block, 'truncated stage0 payload')
                remaining -= len(block)
                if selected:
                    chunks.append(block)
                else:
                    other.update(block)
                    if output:
                        output.write(block)
            tail = source.read(-size % 4)
            require(tail == b'\0' * (-size % 4), 'invalid stage0 payload padding')
            if selected:
                factory = b''.join(chunks)
                if output:
                    output.write(replacement + b'\0' * (-len(replacement) % 4))
            else:
                other.update(tail)
                if output:
                    output.write(tail)
            if name == 'TRAILER!!!':
                trailing = source.read(4097)
                require(len(trailing) <= 4096 and not trailing.strip(b'\0'), 'unexpected trailing stage0 bytes')
                other.update(trailing)
                if output:
                    output.write(trailing)
                break
    require(factory is not None, 'stage0 signed factory is missing')
    return {'factory': factory, 'other_entries_sha256': other.hexdigest(), 'entry_count': len(seen)}


def _inject(image, payloads, directory):
    _debug(image, 'mkdir /etc/rock-wallet', write=True)
    for field, value in (('mode', '040755'), ('uid', '0'), ('gid', '0')):
        _debug(image, 'set_inode_field /etc/rock-wallet ' + field + ' ' + value, write=True)
    info = _metadata(image, '/etc/rock-wallet')
    require(info and all(info[key] == value for key, value in
            {'type': 'directory', 'mode': 0o755, 'uid': 0, 'gid': 0}.items()), 'Wallet directory was not created')
    records = []
    with tempfile.TemporaryDirectory(prefix='profile-payloads-', dir=directory) as temporary:
        for index, (path, raw) in enumerate(payloads.items()):
            name = 'payload-' + str(index)
            (Path(temporary) / name).write_bytes(raw)
            if path == AUTH_PATH:
                _debug(image, 'rm ' + AUTH_PATH, write=True)
            require(_metadata(image, path) is None, 'refuse existing injected destination')
            result = _debug(image, 'write ' + name + ' ' + path, write=True, cwd=temporary)
            require(b'Allocated inode' in result.stdout, 'profile entry was not allocated')
            for field, value in (('mode', '0100444'), ('uid', '0'), ('gid', '0')):
                _debug(image, 'set_inode_field ' + path + ' ' + field + ' ' + value, write=True)
            info = _regular(image, path)
            require(info['mode'] == 0o444 and _cat(image, path) == raw, 'profile entry readback mismatch')
            records.append({'path': path, 'sha256': hashlib.sha256(raw).hexdigest(), 'size': len(raw), **info})
    return records


def prepare_profile(base_images, output_dir, *, expected_sha256, service_configuration,
                    wallet_configuration, wallet_token, authenticator_configuration,
                    mcp_configuration=None):
    """Return a completed immutable-image report; output_dir must not exist.

    A failed attempt retains its fresh partial directory, without profile.json.
    It cannot be retried in place. No device data, provider, network or VM is used.
    Launcher configuration is deliberately owned by the caller. Optional MCP
    configuration adds only a pinned device gateway; no upstream credential or
    network call is used. None preserves the original image requirements.
    """
    require(sys.platform == 'linux', 'profile image preparation requires Linux')
    payloads = configurations(service_configuration, wallet_configuration, wallet_token,
                              authenticator_configuration, mcp_configuration=mcp_configuration)
    base = _inputs(base_images, expected_sha256)
    output = _path(output_dir, exists=False)
    require(not output.exists() and not output.is_symlink() and output.parent.is_dir(),
            'a fresh output directory with an existing parent is required')
    require(not output.is_relative_to(Path(base_images)), 'output must be separate from the base')
    require(all(shutil.which(tool) for tool in ('debugfs', 'e2fsck', 'openssl')), 'Linux image tools required')
    signer, update = _update_helpers()
    rootfs = Path(base['rootfs.ext4']['path'])
    stage0 = Path(base['stage0.cpio.gz']['path'])
    signer.check_filesystem(rootfs)
    original = _stage0(stage0)
    old_envelope = update.decode(original['factory'], 8192)
    manifest = update.verify_envelope(old_envelope)
    require(manifest['sha256'] == base['rootfs.ext4']['sha256'] and
            manifest['size'] == base['rootfs.ext4']['size'], 'base stage0 factory does not bind base rootfs')
    sources = _image_preflight(rootfs, mcp_enabled=mcp_configuration is not None)
    output.mkdir(mode=0o700)
    try:
        for name in ('Image', 'rootfs.ext4'):
            with Path(base[name]['path']).open('rb') as source, (output / name).open('xb') as target:
                shutil.copyfileobj(source, target, length=1024**2)
                target.flush()
                os.fsync(target.fileno())
            require(digest(output / name) == base[name]['sha256'], 'copied image hash differs')
        records = _inject(output / 'rootfs.ext4', payloads, output)
        signer.check_filesystem(output / 'rootfs.ext4')
        new_envelope = signer.envelope_for(output / 'rootfs.ext4', manifest['sequence'], manifest['version'])
        replacement = canonical(new_envelope) + b'\n'
        _stage0(stage0, destination=output / 'stage0.cpio.gz', replacement=replacement)
        readback = _stage0(output / 'stage0.cpio.gz')
        require(readback['factory'] == replacement and
                readback['other_entries_sha256'] == original['other_entries_sha256'] and
                readback['entry_count'] == original['entry_count'], 'stage0 entries changed outside factory')
        require(update.verify_envelope(update.decode(readback['factory'], 8192)) == new_envelope['manifest'],
                'derived stage0 factory signature differs')
        images = {}
        for name in IMAGE_NAMES:
            path = output / name
            path.chmod(0o444)
            images[name] = {'path': str(path), 'sha256': digest(path), 'size': path.stat().st_size}
        require(images['Image']['sha256'] == base['Image']['sha256'] and
                images['rootfs.ext4']['sha256'] == new_envelope['manifest']['sha256'] and
                images['rootfs.ext4']['size'] == new_envelope['manifest']['size'], 'derived image binding differs')
        public_configurations = [('service-access.json', payloads[SERVICE_PATH]),
                                 ('wallet-backend.json', payloads[WALLET_PATH]),
                                 ('authenticator-device.json', payloads[AUTH_PATH])]
        if mcp_configuration is not None:
            public_configurations.append(('mcp-services.json', payloads[MCP_PATH]))
        for name, raw in public_configurations:
            with (output / name).open('xb') as stream:
                stream.write(raw)
            (output / name).chmod(0o444)
        require(all(digest(ROOT / relative) == value for relative, value in sources.items()),
                'reviewed host source changed during preparation')
        report = {'schema': 'rock-closed-service-image-profile/1', 'status': 'PREPARED',
            'simulation_only': True, 'boot_verified': False, 'provider_connected': False,
            'signing': 'existing-public-RFC8032-development-fixture', 'base_images': base,
            'images': images, 'binding': os_client.binding(service_configuration),
            'service_configuration_path': str(output / 'service-access.json'),
            'service_configuration_sha256': hashlib.sha256(payloads[SERVICE_PATH]).hexdigest(),
            'injected_files': records, 'source_sha256': sources,
            'stage0': {'input_factory': old_envelope, 'output_factory': new_envelope,
                'input_factory_sha256': hashlib.sha256(original['factory']).hexdigest(),
                'output_factory_sha256': hashlib.sha256(replacement).hexdigest(),
                'other_entries_sha256': original['other_entries_sha256'], 'entry_count': original['entry_count']},
            'base_images_unchanged': True, 'device_data_created': False}
        if mcp_configuration is not None:
            report['mcp_configuration_path'] = str(output / 'mcp-services.json')
            report['mcp_configuration_sha256'] = hashlib.sha256(payloads[MCP_PATH]).hexdigest()
    finally:
        require(_inputs(base_images, expected_sha256) == base, 'base images changed during preparation')
    # Completion marker is published only after all image/source/invariance checks.
    with (output / 'profile.json').open('xb') as stream:
        stream.write(canonical(report) + b'\n')
        stream.flush()
        os.fsync(stream.fileno())
    (output / 'profile.json').chmod(0o444)
    return report
