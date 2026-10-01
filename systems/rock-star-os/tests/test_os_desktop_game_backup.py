"""Transaction/failure guards with small disk fixtures; not OS/ext4 acceptance."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'os/desktop'))
import game_backup as g


class CompleteGameRestore(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve(); self.root.chmod(0o700)
        self.base = self.root/'devices'; self.base.mkdir(mode=0o700)
        self.state = self.root/'authority'; self.state.mkdir(mode=0o700)
        self.os_path = self.root/'backup'; self.os_path.mkdir(mode=0o700)
        self.authority_path = self.root/'archive'; self.authority_path.mkdir(mode=0o700)
        self.config = {'schema': 'rock-desktop-device/7', 'name': 'source', 'network': 'game-authority',
                       'game': {'config': str(self.state/'sandbox.json'), 'sha256': 'c'*64, 'authority_id': 'public-fixture'}}
        self.source = self.base/'source'; self.source.mkdir(mode=0o700)
        g.write_json(self.source/'device.json', self.config)
        self.disks = {}
        for item in g.DISKS:
            for base in (self.source, self.os_path):
                (base/item).write_bytes(('opaque fixture '+item).encode()); (base/item).chmod(0o600)
            self.disks[item] = {'bytes': (self.os_path/item).stat().st_size, 'sha256': g.guest.digest(self.os_path/item)}
        self.os_report = {'config': self.config, 'disks': self.disks, 'update': {'signed': 'fixture-only'}}
        self.report = {'os': {'manifest_sha256': 'a'*64}, 'authority': {'receipt': {'manifest_sha256': 'b'*64}}}
        self.intent = str(uuid.uuid4())
        self.receipt = {'schema': 'rock-game-sandbox-current-restore-receipt/1', 'status': 'DONE', 'intent': self.intent,
                        'new_device': 'restored', 'post_snapshot_sha256': 'd'*64}
        self.calls = []
        self.patch(g.guest, 'BASE', self.base)
        self.patch(g, 'verify_bundle', return_value=(self.os_path, self.report, self.os_path, self.os_report, self.authority_path))
        self.patch(g, 'device', return_value={'state': str(self.state)})
        self.patch(g, 'stopped_slots', return_value=self.os_report['update'])
        self.patch(g.b, 'check_disk', return_value={'fixture': 'not ext4'})
        self.patch(g, 'authority', side_effect=self.authority)
        module = SimpleNamespace(desktop_ready=self.desktop_ready)
        item = patch.dict(sys.modules, {'game_exchange.sandbox_backup': module}); item.start(); self.addCleanup(item.stop)

    def patch(self, target, attribute, *args, **kwargs):
        item = patch.object(target, attribute, *args, **kwargs); result = item.start(); self.addCleanup(item.stop); return result

    def desktop_ready(self, state, device_name=None):
        if not (Path(state)/'desktop-restore.json').exists(): return
        value = g.read_json(Path(state)/'desktop-restore.json')
        g.require(value['schema'] == g.GATE and value['state'] == 'DONE', 'aggregate is not DONE')
        g.require(device_name not in value['retired_devices'], 'retired source')

    def authority(self, config, action, **kwargs):
        self.calls.append((action, copy.deepcopy(kwargs)))
        self.assertIn(g.read_json(self.state/'desktop-restore.json')['state'], ('PENDING', 'DONE'))
        return self.receipt

    def restore(self, **kwargs):
        return g.restore(self.config, self.os_path, kwargs.get('intent', self.intent), kwargs.get('new_device', 'restored'),
                         kwargs.get('retired', []))

    def test_current_copy_preserves_source_and_completes_both_before_gate(self):
        result = self.restore()
        self.assertEqual(result['status'], 'RESTORED'); self.assertEqual(len(self.calls), 2)
        for item in g.DISKS:
            self.assertEqual(g.guest.digest(self.source/item), self.disks[item]['sha256'])
            self.assertEqual(g.guest.digest(self.base/'restored'/item), self.disks[item]['sha256'])
        self.assertEqual(result['config']['network'], 'game-authority')
        gate = g.read_json(self.state/'desktop-restore.json')
        self.assertEqual(gate['state'], 'DONE'); self.assertEqual(gate['retired_devices'], ['source'])

    def test_changed_source_refuses_before_gate_or_authority(self):
        (self.source/'userdata.ext4').write_bytes(b'later user work')
        with self.assertRaisesRegex(ValueError, 'no longer current'): self.restore()
        self.assertEqual(self.calls, []); self.assertFalse((self.state/'desktop-restore.json').exists())

    def test_preflight_detects_stale_authority_without_creating_gate(self):
        with patch.object(g, 'authority', side_effect=ValueError('not current')):
            with self.assertRaisesRegex(ValueError, 'not current'):
                g.preflight(self.config, self.os_path, self.intent, 'restored', [])
        self.assertFalse((self.state/'desktop-restore.json').exists())
        self.assertFalse((self.base/'restored').exists())

    def test_successful_preflight_does_not_create_restore_target_or_gate(self):
        with patch.object(g, 'authority', return_value=self.report['authority']['receipt']):
            result = g.preflight(self.config, self.os_path, self.intent, 'restored', [])
        self.assertEqual(result['status'], 'READY')
        self.assertFalse((self.state/'desktop-restore.json').exists())
        self.assertFalse((self.base/'restored').exists())

    def test_existing_destination_preserved_before_authority(self):
        target = self.base/'restored'; target.mkdir(mode=0o700); (target/'userdata.ext4').write_bytes(b'keep')
        with self.assertRaisesRegex(ValueError, 'cannot be adopted'): self.restore()
        self.assertEqual((target/'userdata.ext4').read_bytes(), b'keep'); self.assertEqual(self.calls, [])

    def test_same_source_and_retired_names_are_refused(self):
        with self.assertRaisesRegex(ValueError, 'new restore device'): self.restore(new_device='source')
        with self.assertRaisesRegex(ValueError, 'retired or reused'): self.restore(retired=['restored'])
        self.assertEqual(self.calls, [])

    def test_authority_failure_leaves_pending_gate_and_no_os_activation(self):
        with patch.object(g, 'authority', side_effect=RuntimeError('current authority changed')):
            with self.assertRaisesRegex(RuntimeError, 'changed'): self.restore()
        self.assertEqual(g.read_json(self.state/'desktop-restore.json')['state'], 'PENDING')
        self.assertFalse((self.base/'restored/device.json').exists())

    def test_interrupted_partial_copy_is_recovered_only_under_same_intent(self):
        original = g.b.copy_data
        def interrupted(source, target):
            target.write_bytes(b'partial'); target.chmod(0o600)
            raise InterruptedError('simulated process interruption after durable restore intent')
        with patch.object(g.b, 'copy_data', side_effect=interrupted):
            with self.assertRaises(InterruptedError): self.restore()
        self.assertEqual(g.read_json(self.state/'desktop-restore.json')['state'], 'PENDING')
        with self.assertRaisesRegex(ValueError, 'intent differs'): self.restore(intent=str(uuid.uuid4()))
        result = self.restore(); self.assertEqual(result['status'], 'RESTORED')
        self.assertEqual(g.guest.digest(self.base/'restored/userdata.ext4'), self.disks['userdata.ext4']['sha256'])

    def test_unrelated_runtime_member_blocks_partial_copy_recovery(self):
        with patch.object(g.b, 'copy_data', side_effect=InterruptedError):
            with self.assertRaises(InterruptedError): self.restore()
        g.write_json(self.base/'restored/running.json', {'pid': 1})
        with self.assertRaisesRegex(ValueError, 'unrelated or activated'): self.restore()
        self.assertEqual(g.read_json(self.state/'desktop-restore.json')['state'], 'PENDING')

    def test_partial_copy_symlink_and_hardlink_never_overwritten(self):
        for kind in ('symlink', 'hardlink'):
            with self.subTest(kind=kind):
                self.setUp()
                with patch.object(g.b, 'copy_data', side_effect=InterruptedError):
                    with self.assertRaises(InterruptedError): self.restore()
                path = self.base/'restored'/g.DISKS[0]; source = self.root/'unrelated'
                source.write_bytes(b'keep'); source.chmod(0o600)
                if kind == 'symlink': path.symlink_to(source)
                else: os.link(source, path)
                with self.assertRaises((ValueError, RuntimeError, OSError)): self.restore()
                self.assertEqual(source.read_bytes(), b'keep')

    def test_post_authority_change_leaves_all_writers_fenced(self):
        with patch.object(g, 'authority', side_effect=[self.receipt, {**self.receipt, 'post_snapshot_sha256': 'e'*64}]):
            with self.assertRaisesRegex(ValueError, 'completion changed'): self.restore()
        self.assertEqual(g.read_json(self.state/'desktop-restore.json')['state'], 'PENDING')

    def test_completed_os_receipt_never_rewrites_modified_destination(self):
        with patch.object(g, 'authority', side_effect=[self.receipt, RuntimeError('interrupted final verification')]):
            with self.assertRaises(RuntimeError): self.restore()
        target = self.base/'restored/userdata.ext4'; target.write_bytes(b'new destination work')
        with self.assertRaisesRegex(ValueError, 'final disk'): self.restore()
        self.assertEqual(target.read_bytes(), b'new destination work')

    def test_completed_transaction_recovers_exact_receipt_without_recopy(self):
        first = self.restore()
        with patch.object(g.b, 'copy_data', side_effect=AssertionError('completed data must not be copied')):
            self.assertEqual(self.restore(), first)

    def test_owned_atomic_metadata_temporary_after_interrupt_is_recoverable(self):
        with patch.object(g.b, 'copy_data', side_effect=InterruptedError):
            with self.assertRaises(InterruptedError): self.restore()
        temporary = self.base/'restored/.gx00-1a2b3c4d'
        temporary.write_bytes(b'incomplete metadata'); temporary.chmod(0o600)
        self.restore(); self.assertFalse(temporary.exists())

    def test_changed_source_link_fails_before_authority(self):
        item = self.source/g.DISKS[0]; item.unlink(); item.symlink_to(self.os_path/g.DISKS[0])
        with self.assertRaises(OSError): self.restore()
        self.assertEqual(self.calls, [])

    def test_live_unrecorded_socket_refuses_before_authority(self):
        import socket
        sock = socket.socket(socket.AF_UNIX); self.addCleanup(sock.close)
        sock.bind(str(self.source/'qmp.sock')); sock.listen()
        with self.assertRaisesRegex(ValueError, 'still listening'): self.restore()
        self.assertEqual(self.calls, [])

    def test_raw_game_disk_restore_entry_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'complete current authority'):
            g.b.restore_stage0_backup(self.os_path, 'unsafe', self.os_report)


    def test_second_restore_retains_every_retired_source(self):
        old = {'schema': g.GATE, 'state': 'DONE', 'intent': str(uuid.uuid4()), 'source_device': 'original',
               'new_device': 'source', 'os_backup_sha256': 'e'*64, 'authority_manifest_sha256': 'f'*64,
               'retired_devices': ['original']}
        g.write_json(self.state/'desktop-restore.json', old)
        self.restore(retired=['original'])
        self.assertEqual(g.read_json(self.state/'desktop-restore.json')['retired_devices'], ['original', 'source'])

    def test_retirement_chain_cannot_be_dropped_or_overflowed(self):
        old = {'schema': g.GATE, 'state': 'DONE', 'intent': str(uuid.uuid4()), 'source_device': 'original',
               'new_device': 'source', 'os_backup_sha256': 'e'*64, 'authority_manifest_sha256': 'f'*64,
               'retired_devices': ['original']}
        g.write_json(self.state/'desktop-restore.json', old)
        with self.assertRaisesRegex(ValueError, 'retirement chain'): self.restore()
        with self.assertRaisesRegex(ValueError, 'bounded unique'): self.restore(retired=['old'+str(i) for i in range(64)])
        self.assertEqual(g.read_json(self.state/'desktop-restore.json'), old)


class AuthorityReceiptGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve(); (self.root/'manifest.json').write_bytes(b'fixture manifest')
        self.intent = str(uuid.uuid4())
        self.config = {'game': {'config': '/private/sandbox.json', 'sha256': 'c'*64, 'authority_id': 'fixture-authority'}}
        self.value = {'schema': 'rock-game-sandbox-current-restore-receipt/1', 'status': 'DONE', 'intent': self.intent,
                      'new_device': 'restored', 'source_retired': True, 'same_host_current_copy_only': True,
                      'backup_manifest_sha256': g.guest.digest(self.root/'manifest.json'),
                      'authority_id': 'fixture-authority', 'config_sha256': 'c'*64, 'simulation_only': True}

    def call(self, value):
        with patch.object(g.subprocess, 'run', return_value=SimpleNamespace(stdout=json.dumps(value))) as run:
            result = g.authority(self.config, 'restore-current', backup=self.root, intent=self.intent, new_device='restored')
            self.assertIn('--new-device', run.call_args.args[0]); return result

    def test_typed_exact_complete_current_copy_receipt_required(self):
        self.assertEqual(self.call(self.value), self.value)
        for field, value in (('schema', 'other'), ('status', 'PREPARED'), ('intent', str(uuid.uuid4())),
                             ('new_device', 'another'), ('source_retired', 1), ('same_host_current_copy_only', False),
                             ('simulation_only', 1), ('authority_id', 'foreign'), ('config_sha256', 'd'*64),
                             ('backup_manifest_sha256', 'e'*64)):
            with self.subTest(field=field), self.assertRaises(ValueError): self.call({**self.value, field: value})

    def test_duplicate_or_nonfinite_request_metadata_refused(self):
        for raw in ('{"intent":1,"intent":2}', '{"intent":NaN}'):
            with self.assertRaises(ValueError): g.decode(raw)



if __name__ == '__main__': unittest.main()
