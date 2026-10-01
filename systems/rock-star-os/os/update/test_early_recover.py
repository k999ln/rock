"""Safety guards for the explicit development-only full-data recovery helper."""
from contextlib import nullcontext
import json
from pathlib import Path
import stat
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import early_recover as early
from rock_update import UpdateError


class RecoveryGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.filler = Path(self.tmp.name) / 'fault-full-data'
        self.filler.write_bytes(b'x' * 4096)
        self.proof = Path(self.tmp.name) / 'proof.json'
        actual = self.filler.lstat()
        self.info = SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=1,
                                    st_size=4096, st_blocks=8, st_dev=actual.st_dev)
        self.state = {'committed': 'A', 'floor': 1, 'pending': 'B'}
        self.boot = {'slot': 'A', 'sequence': 1, 'reason': 'state-write-failed'}
        self.updater = SimpleNamespace(lock=lambda **kwargs: nullcontext(), read_state=lambda: self.state,
                                       running_slot=lambda state: 'A')

    def invoke(self):
        values = [SimpleNamespace(f_bfree=0, f_bavail=0, f_frsize=4096),
                  SimpleNamespace(f_bfree=1, f_bavail=1, f_frsize=4096)]
        with patch.object(early, 'FILLER', self.filler), patch.object(early, 'PROOF', self.proof), \
                patch.object(Path, 'lstat', return_value=self.info), \
                patch.object(early.os, 'statvfs', side_effect=values), patch.object(early.os, 'sync'):
            early.reclaim(self.updater, self.boot)

    def test_reclaims_only_after_committed_fallback_and_records_capacity(self):
        self.invoke()
        self.assertFalse(self.filler.exists())
        proof = json.loads(self.proof.read_text())
        self.assertEqual(('A', 1, 'B', 0, 1), (proof['slot'], proof['sequence'], proof['pending'],
                                              proof['free_blocks_before'], proof['free_blocks_after']))
        self.assertEqual({'committed': 'A', 'floor': 1, 'pending': 'B'}, self.state)

    def test_trial_or_unmatched_state_cannot_delete_filler(self):
        for state, boot in ((self.state, {**self.boot, 'reason': 'trial'}),
                            ({**self.state, 'committed': 'B'}, self.boot),
                            ({**self.state, 'pending': None}, self.boot),
                            (self.state, {**self.boot, 'sequence': 2})):
            with self.subTest(state=state, boot=boot):
                self.state, self.boot = state, boot
                with self.assertRaises(UpdateError):
                    self.invoke()
                self.assertEqual(b'x' * 4096, self.filler.read_bytes())
                self.assertFalse(self.proof.exists())

    def test_unowned_symlink_or_multilink_filler_is_never_removed(self):
        original = vars(self.info).copy()
        for changed in ({'st_uid': 1000}, {'st_mode': stat.S_IFLNK | 0o777}, {'st_nlink': 2}, {'st_blocks': 0}):
            with self.subTest(changed=changed):
                self.info = SimpleNamespace(**{**original, **changed})
                with self.assertRaises(UpdateError):
                    self.invoke()
                self.assertEqual(b'x' * 4096, self.filler.read_bytes())
                self.assertFalse(self.proof.exists())

    def test_normal_install_removes_development_recovery_hook(self):
        target = Path(self.tmp.name) / 'target'
        (target / 'usr').mkdir(parents=True)
        (target / 'etc').mkdir()
        install = Path(__file__).with_name('install-target.sh')
        subprocess.run(['sh', str(install), str(target), '--include-tests'], check=True)
        hook = target / 'etc/init.d/S01rock-ab-full-recover'
        helper = target / 'usr/lib/rock-update/early_recover.py'
        self.assertTrue(hook.is_file() and helper.is_file())
        subprocess.run(['sh', str(install), str(target)], check=True)
        self.assertFalse(hook.exists() or helper.exists())


if __name__ == '__main__':
    unittest.main()
