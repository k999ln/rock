"""Device provisioning for purchaser services, without a permissive fallback.

The trusted image owns configuration. The private marker contains hashes, never
the service token. Missing/changed closed configuration disables remote clients;
the caller still starts the local Hub and retains jobs and personal data.
"""
from contextlib import contextmanager
from dataclasses import dataclass
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import uuid
from urllib.parse import urlsplit

from blackberryrock.packages import canonical

CONFIG_SCHEMA = 'rock-purchaser-services-device/1'
MARKER_SCHEMA = 'rock-purchaser-services-binding/1'
MARKER = 'purchaser-service-binding.json'
MAX_CONFIG = 8192


def require(condition, message):
    if not condition:
        raise ValueError(message)


def decode(raw):
    def unique(pairs):
        result = {}
        for name, value in pairs:
            require(name not in result, 'duplicate service configuration field')
            result[name] = value
        return result
    return json.loads(raw.decode('utf-8'), object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('non-finite configuration')))


def protected_read(path, *, private=False):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and
                info.st_uid in (0, os.geteuid()) and not info.st_mode & 0o022 and
                info.st_size <= MAX_CONFIG, 'service configuration must be a protected regular file')
        if private:
            require(info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o600,
                    'private service binding must be owned mode 0600')
        raw = stream.read(MAX_CONFIG + 1)
        require(len(raw) <= MAX_CONFIG, 'service configuration exceeds limit')
        return decode(raw)


def validate(value):
    fields = {'schema', 'authority_id', 'consumer_id', 'device_ref', 'token',
              'registry_origin', 'runner_origin', 'runner_endpoint_id'}
    require(isinstance(value, dict) and set(value) == fields and value['schema'] == CONFIG_SCHEMA,
            'unknown purchaser service configuration')
    authority = value['authority_id']
    require(isinstance(authority, str) and str(uuid.UUID(authority)) == authority,
            'invalid service authority identity')
    for name in ('consumer_id', 'device_ref', 'runner_endpoint_id'):
        require(isinstance(value[name], str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}', value[name]),
                'invalid service identity')
    token = value['token']
    require(isinstance(token, str) and token.startswith('PUBLIC-FIXTURE-') and
            16 <= len(token) <= 256 and all(33 <= ord(c) <= 126 for c in token),
            'this profile requires an explicit public development credential')
    for field in ('registry_origin', 'runner_origin'):
        parsed = urlsplit(value[field])
        require(parsed.scheme == 'https' and parsed.hostname in {'127.0.0.1', 'localhost', '10.0.2.2'} and
                parsed.username is None and parsed.password is None and parsed.path in ('', '/') and
                not parsed.query and not parsed.fragment and parsed.port is not None and
                1024 <= parsed.port <= 65535, 'service origin must be a fixed development HTTPS endpoint')
    return dict(value)


def binding(config):
    return {'schema': MARKER_SCHEMA, 'authority_id': config['authority_id'],
            'consumer_id': config['consumer_id'], 'device_ref': config['device_ref'],
            'configuration_sha256': hashlib.sha256(canonical(config)).hexdigest()}


def private_directory(path):
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and not info.st_mode & 0o077,
            'platform state must be private and owned')


@contextmanager
def marker_lock(directory):
    fd = os.open(directory / 'purchaser-service-binding.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and
                info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600, 'invalid service binding lock')
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def write_marker(path, value):
    fd, temporary = tempfile.mkstemp(prefix='.service-binding-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(canonical(value)); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@dataclass(frozen=True)
class Profile:
    config: dict | None
    status: dict

    @property
    def legacy_development(self):
        return self.status['mode'] == 'development-fixture'


def resolve(state_dir, config_path):
    """No network or Wallet mutation; malformed closed config never means open."""
    directory, path = Path(state_dir), Path(config_path)
    private_directory(directory)
    marker = directory / MARKER
    with marker_lock(directory):
        closed_before = marker.exists() or marker.is_symlink()
        configured = path.exists() or path.is_symlink()
        required_path = path.with_suffix('.required')
        required = required_path.exists() or required_path.is_symlink()
        if not configured and not closed_before and not required:
            return Profile(None, {'mode': 'development-fixture', 'state': 'configured',
                                  'simulation_only': True})
        status = {'mode': 'purchaser-fixture', 'state': 'unavailable', 'simulation_only': True,
                  'message': '購入者サービスの設定を復元してください。端末内の道具と履歴は利用できます。'}
        try:
            unbound = {'schema': MARKER_SCHEMA, 'state': 'UNBOUND'}
            if not closed_before:
                # Seeing a closed image/config latches the mode even if its
                # configuration is malformed or temporarily absent.
                write_marker(marker, unbound)
            require(configured, 'purchaser service configuration is missing')
            config = validate(protected_read(path))
            expected = binding(config)
            previous = protected_read(marker, private=True)
            if previous != unbound:
                require(previous == expected,
                        'purchaser service authority or device binding changed')
            else:
                # A new profile cannot silently adopt receipts or caches from an
                # earlier open endpoint. A new virtual device is the migration
                # path in this development version; existing data is untouched.
                require(not (directory / 'registry-cache' / 'verified-index.json').exists() and
                        not (directory / 'remote' / 'remote.sqlite3').exists(),
                        'existing remote state requires explicit migration or a new device')
                write_marker(marker, expected)
            status.update(state='configured', message='購入者限定の開発サービス',
                          authority_id=config['authority_id'], consumer_id=config['consumer_id'],
                          device_ref=config['device_ref'])
            return Profile(config, status)
        except (ValueError, OSError, TypeError, KeyError, RecursionError):
            # Do not include credential material or raw exception/request text.
            return Profile(None, status)


def clients(profile, state_dir, ca_file):
    """Construct authenticated transports only for the validated closed mode."""
    require(not profile.legacy_development, 'legacy client configuration belongs to the explicit SDK profile')
    if profile.config is None:
        return None, {}
    from registry.client import RegistryClient
    from runner.client import RunnerClient
    from runner.transport import HTTPSRunnerTransport
    config = profile.config
    registry = RegistryClient(config['registry_origin'], ca_file, Path(state_dir) / 'registry-cache',
                              timeout=3, attempts=2, consumer=config['consumer_id'], consumer_token=config['token'],
                              authority_id=config['authority_id'])
    runner = RunnerClient(HTTPSRunnerTransport(config['runner_origin'], ca_file, timeout=3),
                          endpoint_id=config['runner_endpoint_id'], owner=config['consumer_id'],
                          token=config['token'], attempts=2, authority_id=config['authority_id'])
    return registry, {'cloud': runner}
