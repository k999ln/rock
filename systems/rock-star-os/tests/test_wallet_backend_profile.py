"""Device Wallet profile selection cannot silently replace a remote authority.

All state is disposable. The transport returns a fixed simulator snapshot only;
these tests do not connect to TLS, start an OS, or represent real funds.
"""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('rock_wallet_profile_test', ROOT / 'os/platform/service.py')
platform_service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(platform_service)

from wallet_backend import client

AUTHORITY_ID = '11111111-1111-4111-8111-111111111111'
PROVISIONING = ROOT / 'os/entitlement/fixtures/device-handoff.json'


class FakeAuthorityTransport:
    fingerprint = 'profile-test-public-simulator-authority'

    def __init__(self):
        self.calls = []

    def exchange(self, request):
        self.calls.append(copy.deepcopy(request))
        if request != {'v': 1, 'op': 'snapshot'}:
            raise AssertionError('profile tests must not send a money mutation')
        return {'ok': True, 'snapshot': {
            'simulation_only': True, 'available_minor': 1112, 'held_minor': 0,
            'billed_minor': 888, 'ledger_balance_minor': 0,
            'membership': {'simulation_only': True, 'registered': False},
            'billing': {'simulation_only': True, 'history': []},
        }}


def tree_state(root):
    """Observe bytes and metadata without traversing a symlink target."""
    result = {}

    def visit(path):
        info = path.lstat()
        details = (info.st_mode, info.st_uid, info.st_gid, info.st_nlink,
                   info.st_ino, info.st_mtime_ns)
        if stat.S_ISLNK(info.st_mode):
            payload = ('symlink', os.readlink(path))
        elif stat.S_ISREG(info.st_mode):
            payload = ('file', hashlib.sha256(path.read_bytes()).hexdigest())
        elif stat.S_ISDIR(info.st_mode):
            payload = ('directory',)
        else:
            raise AssertionError('unexpected fixture file type')
        result[str(path.relative_to(root))] = (details, payload)
        if stat.S_ISDIR(info.st_mode):
            for child in sorted(path.iterdir()):
                visit(child)

    visit(root)
    return result


class WalletBackendProfileTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='rock-wallet-profile-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.state = self.root / 'wallet'
        # OS init creates /data/wallet privately before the service starts;
        # reproduce that boundary independently of the test runner's umask.
        self.state.mkdir(mode=0o700)
        self.config = self.root / 'backend.json'

    def write_config(self, path=None):
        path = path or self.config
        path.write_text(json.dumps({
            'schema_version': 1, 'mode': 'development-remote-authority',
            'origin': 'https://127.0.0.1:9445', 'authority_id': AUTHORITY_ID,
            'ca_file': '/unused/public-fixture-ca',
            'token_file': '/unused/public-fixture-owner-token',
        }))
        path.chmod(0o600)
        return path

    def factory(self, *, state=None, config=None):
        # The production factory is intentionally the only not-yet-added API.
        return platform_service.device_wallet_service(
            state or self.state, config or self.config, provisioning_file=PROVISIONING)

    def assert_no_local_ledger(self, state=None):
        state = state or self.state
        for name in ('wallet-simulator.db', 'entitlement.db'):
            for suffix in ('', '-wal', '-shm', '-journal'):
                path = state / (name + suffix)
                self.assertFalse(path.exists() or path.is_symlink(), str(path))

    def test_fresh_device_without_remote_configuration_opens_normal_local_wallet(self):
        local_type = platform_service.WalletService
        with patch.object(platform_service, 'WalletService', wraps=local_type) as local, \
                patch.object(client, 'configured_service', side_effect=AssertionError('remote profile not selected')) as remote:
            wallet = self.factory()
            self.addCleanup(wallet.close)
            self.assertIsInstance(wallet, local_type)
            local.assert_called_once_with(self.state, provisioning_file=PROVISIONING)
            remote.assert_not_called()
            snapshot = wallet.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=1002)['snapshot']
        self.assertIs(snapshot['simulation_only'], True)
        self.assertEqual(0, snapshot['available_minor'])
        self.assertEqual(0, snapshot['billed_minor'])
        self.assertIs(snapshot['membership']['registered'], False)
        self.assertTrue((self.state / 'wallet-simulator.db').is_file())
        self.assertTrue((self.state / 'entitlement.db').is_file())
        self.assertFalse((self.state / 'backend-cache').exists())
        self.assertFalse(self.config.exists())

    def test_explicit_remote_configuration_uses_real_cache_and_never_local_wallet(self):
        self.write_config()
        authority = FakeAuthorityTransport()
        with patch.object(platform_service, 'WalletService', side_effect=AssertionError('local Wallet forbidden')) as local, \
                patch.object(client, 'HTTPSWalletTransport', return_value=authority) as transport, \
                patch.object(client, 'configured_service', wraps=client.configured_service) as remote:
            wallet = self.factory()
            self.addCleanup(wallet.close)
            self.assertIsInstance(wallet, client.RemoteWalletService)
            snapshot = wallet.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=1002)['snapshot']
            local.assert_not_called()
            remote.assert_called_once_with(self.config, self.state)
            transport.assert_called_once_with(
                'https://127.0.0.1:9445', '/unused/public-fixture-ca',
                '/unused/public-fixture-owner-token', authority_id=AUTHORITY_ID)
        self.assertEqual(1112, snapshot['available_minor'])
        self.assertIs(snapshot['backend']['connected'], True)
        self.assertIs(snapshot['backend']['cache_is_spendable'], False)
        self.assertTrue((self.state / 'backend-cache/remote-cache.db').is_file())
        self.assert_no_local_ledger()

    def test_lost_configuration_preserves_real_remote_cache_and_refuses_local_constructor(self):
        authority = FakeAuthorityTransport()
        cached = client.RemoteWalletService(self.state / 'backend-cache', authority, clock=lambda: 1788856800.0)
        try:
            snapshot = cached.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=1002)['snapshot']
            self.assertEqual(1112, snapshot['available_minor'])
        finally:
            cached.close()
        self.write_config().unlink()
        before = tree_state(self.root)
        calls = copy.deepcopy(authority.calls)
        with patch.object(platform_service, 'WalletService', side_effect=AssertionError('local Wallet forbidden')) as local, \
                patch.object(client, 'configured_service', side_effect=AssertionError('missing configuration')) as remote:
            with self.assertRaises(ValueError):
                self.factory()
            local.assert_not_called()
            remote.assert_not_called()
        self.assertEqual(before, tree_state(self.root))
        self.assertEqual(calls, authority.calls)
        self.assert_no_local_ledger()

    def test_any_cache_entry_without_configuration_blocks_fallback_without_touching_targets(self):
        for kind in ('directory', 'file', 'dangling-symlink', 'directory-symlink', 'file-symlink'):
            with self.subTest(kind=kind):
                case = self.root / kind
                state, outside = case / 'wallet', case / 'outside-wallet'
                state.mkdir(parents=True, mode=0o700)
                outside.mkdir(mode=0o700)
                sentinel = outside / 'keep.bin'
                sentinel.write_bytes(b'public fixture target must stay byte-for-byte unchanged')
                cache = state / 'backend-cache'
                if kind == 'directory':
                    cache.mkdir(mode=0o700)
                elif kind == 'file':
                    cache.write_bytes(b'partial remote profile marker')
                elif kind == 'dangling-symlink':
                    cache.symlink_to(outside / 'missing-cache')
                elif kind == 'directory-symlink':
                    cache.symlink_to(outside, target_is_directory=True)
                else:
                    cache.symlink_to(sentinel)
                before = tree_state(case)
                with patch.object(platform_service, 'WalletService', side_effect=AssertionError('local Wallet forbidden')) as local, \
                        patch.object(client, 'configured_service', side_effect=AssertionError('missing configuration')) as remote:
                    with self.assertRaises(ValueError):
                        self.factory(state=state, config=case / 'missing-config.json')
                    local.assert_not_called()
                    remote.assert_not_called()
                self.assertEqual(before, tree_state(case))
                self.assert_no_local_ledger(state)

    def test_invalid_existing_configuration_never_falls_back_or_creates_state(self):
        for raw in (b'{invalid-json', b'{}', b'{"schema_version":1,"mode":"development-remote-authority"}'):
            with self.subTest(raw=raw):
                self.config.write_bytes(raw)
                self.config.chmod(0o600)
                before = tree_state(self.root)
                with patch.object(platform_service, 'WalletService', side_effect=AssertionError('local fallback forbidden')) as local, \
                        patch.object(client, 'HTTPSWalletTransport', side_effect=AssertionError('invalid config must not reach transport')) as transport:
                    with self.assertRaises(ValueError):
                        self.factory()
                    local.assert_not_called()
                    transport.assert_not_called()
                self.assertEqual(before, tree_state(self.root))
                self.assertEqual([], list(self.state.iterdir()))

    def test_symlink_or_directory_configuration_reaches_protected_loader_without_fallback(self):
        for kind in ('valid-target-symlink', 'dangling-symlink', 'directory'):
            with self.subTest(kind=kind):
                case = self.root / kind
                case.mkdir(mode=0o700)
                state, config = case / 'wallet', case / 'backend.json'
                target = self.write_config(case / 'outside-config.json')
                if kind == 'valid-target-symlink':
                    config.symlink_to(target)
                elif kind == 'dangling-symlink':
                    config.symlink_to(case / 'missing-config.json')
                else:
                    config.mkdir(mode=0o700)
                before = tree_state(case)
                with patch.object(platform_service, 'WalletService', side_effect=AssertionError('local fallback forbidden')) as local, \
                        patch.object(client, 'configured_service', wraps=client.configured_service) as remote, \
                        patch.object(client, 'HTTPSWalletTransport', side_effect=AssertionError('invalid config must not reach transport')) as transport:
                    with self.assertRaises((ValueError, OSError)):
                        self.factory(state=state, config=config)
                    local.assert_not_called()
                    remote.assert_called_once_with(config, state)
                    transport.assert_not_called()
                self.assertEqual(before, tree_state(case))
                self.assertFalse(state.exists())

    def test_existing_local_ledger_cannot_be_replaced_by_remote_profile(self):
        local = platform_service.WalletService(self.state, provisioning_file=PROVISIONING, authentication_required=False)
        try:
            snapshot = local.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=1002)['snapshot']
            self.assertEqual(0, snapshot['available_minor'])
        finally:
            local.close()
        self.write_config()
        before = tree_state(self.root)
        with patch.object(platform_service, 'WalletService', side_effect=AssertionError('must not reopen local Wallet')) as local, \
                patch.object(client, 'configured_service', wraps=client.configured_service) as remote, \
                patch.object(client, 'HTTPSWalletTransport', side_effect=AssertionError('local ledger must block remote transport')) as transport:
            with self.assertRaises(ValueError):
                self.factory()
            local.assert_not_called()
            remote.assert_called_once_with(self.config, self.state)
            transport.assert_not_called()
        self.assertEqual(before, tree_state(self.root))
        self.assertFalse((self.state / 'backend-cache').exists())


if __name__ == '__main__':
    unittest.main()
