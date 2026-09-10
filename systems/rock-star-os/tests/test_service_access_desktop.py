"""Owned Linux backend lifecycle and the purchaser desktop's offline boundary."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import socket
import sys
import tempfile
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'os/desktop'), str(ROOT / 'os')]
import guest
import closed_services
from blackberryrock.packages import canonical
from service_access import serve
from service_access.os_client import protected_read


class ClosedDesktopConfigTests(unittest.TestCase):
    def test_schema4_preserves_local_boot_when_backend_config_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            images = root / 'images'; images.mkdir()
            hashes = {}
            for name in ('Image', 'rootfs.ext4'):
                (images / name).write_bytes(b'unit fixture ' + name.encode())
                hashes[name] = hashlib.sha256((images / name).read_bytes()).hexdigest()
            config = {'schema': 'rock-desktop-device/4', 'name': 'closed-unit', 'images': str(images),
                      'sha256': hashes, 'network': 'closed-services', 'viewer': 'browser',
                      'services': {'config': str(root / 'missing-backend.json'), 'sha256': '0'*64,
                                   'authority_id': '11111111-1111-4111-8111-111111111111'}}
            guest.validate_config(config)
            command = guest.command(config, root, root)
            self.assertIn('-netdev', command)
            offline = {**config, 'network': 'none'}
            guest.validate_config(offline)
            self.assertNotIn('-netdev', guest.command(offline, root, root))
            for change in ({'network': 'development-services'}, {'services': None},
                           {'schema': 'rock-desktop-device/3'}):
                with self.assertRaises(ValueError): guest.validate_config({**config, **change})


@unittest.skipUnless(sys.platform == 'linux', 'real independent backend runs in the Linux development VM')
class ClosedDesktopLifecycleTests(unittest.TestCase):
    def setUp(self):
        parent = Path('/var/tmp/rock-star-closed-services')
        serve.private_directory(parent)
        self.root = parent / ('test-' + uuid.uuid4().hex)
        self.config_path = self.root / 'launcher.json'
        probes = [socket.socket() for _ in range(3)]
        try:
            for probe in probes: probe.bind(('127.0.0.1', 0))
            ports = [probe.getsockname()[1] for probe in probes]
        finally:
            for probe in probes: probe.close()
        self.prepared = serve.prepare(self.root, self.config_path,
            registry_port=ports[0], runner_port=ports[1], wallet_port=ports[2])
        self.service = {'config': str(self.config_path), 'sha256': self.prepared['config_sha256'],
                        'authority_id': self.prepared['config']['authority_id']}
        self.addCleanup(self.cleanup)

    def cleanup(self):
        closed_services.stop(self.service)
        shutil.rmtree(self.root)

    def test_backend_starts_without_os_is_reused_and_restarts_same_authority(self):
        first = closed_services.ensure(self.service)
        self.assertEqual(first['status'], 'READY')
        self.assertTrue(first['independent_of_os_power'])
        again = closed_services.ensure(self.service)
        self.assertTrue(again['reused']); self.assertEqual(first['pid'], again['pid'])
        self.assertEqual(closed_services.stop(self.service)['status'], 'STOPPED')
        restarted = closed_services.ensure(self.service)
        self.assertEqual(restarted['authority_id'], first['authority_id'])
        self.assertNotEqual(restarted['pid'], first['pid'])
        raw = (self.root / 'supervisor/ready.json').read_text() + (self.root / 'supervisor/backend.log').read_text()
        self.assertNotIn(serve.CONSUMERS['alice-a']['token'], raw)
        self.assertNotIn(serve.PUBLIC_TOKENS['alice'], raw)

    def test_concurrent_ensure_has_one_owned_process_and_config_drift_is_denied(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            values = list(pool.map(lambda _: closed_services.ensure(self.service), range(2)))
        self.assertEqual(values[0]['pid'], values[1]['pid'])
        self.assertEqual(sorted(value['reused'] for value in values), [False, True])
        for changed in ({**self.service, 'sha256': '0'*64},
                        {**self.service, 'authority_id': '11111111-1111-4111-8111-111111111111'}):
            with self.assertRaises(ValueError): closed_services.ensure(changed)
        self.assertEqual(closed_services.ensure(self.service)['pid'], values[0]['pid'])

    def test_conflicting_listener_is_preserved_and_failed_owned_start_is_reaped(self):
        with socket.socket() as unrelated:
            unrelated.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            unrelated.bind(('127.0.0.1', self.prepared['config']['runner_port']))
            unrelated.listen(1)
            with self.assertRaises(ValueError): closed_services.ensure(self.service, timeout=5)
            with socket.create_connection(unrelated.getsockname(), timeout=1) as client:
                connected, _ = unrelated.accept()
                connected.close()
            self.assertEqual(closed_services.OWNED_CHILDREN, {})
        self.assertEqual(closed_services.ensure(self.service)['status'], 'READY')


if __name__ == '__main__': unittest.main()
