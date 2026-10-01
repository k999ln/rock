"""Focused proof validation; mocked errors here are not actual ENOSPC evidence."""
from contextlib import nullcontext
import errno
import hashlib
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import fault_guest as guest
from rock_update import UpdateError


class FullFixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'state.json'
        self.path.write_bytes(b'{"generation":2}\n')
        self.updater = SimpleNamespace(state_path=self.path, lock=lambda **kw: nullcontext(),
                                      read_state=lambda: {'generation': 2}, save_state=Mock())

    def invoke(self):
        with patch.object(guest.os, 'sync'):
            return guest.state_enospc_proof(self.updater)

    def test_requires_enospc_and_exact_unchanged_state(self):
        self.updater.save_state.side_effect = OSError(errno.ENOSPC, 'test error')
        proof = self.invoke()
        digest = hashlib.sha256(self.path.read_bytes()).hexdigest()
        self.assertEqual(proof, {'errno': 28, 'state_bytes': 17,
                                'state_sha256_before': digest, 'state_sha256_after': digest})

    def test_success_or_other_storage_error_never_proves_full(self):
        with self.assertRaisesRegex(RuntimeError, 'unexpectedly saved'):
            self.invoke()
        for number in (errno.EIO, errno.EROFS, errno.EACCES):
            self.updater.save_state.side_effect = OSError(number, 'test error')
            with self.subTest(number=number), self.assertRaisesRegex(UpdateError, 'other than actual ENOSPC'):
                self.invoke()

    def test_even_enospc_cannot_pass_if_state_bytes_changed(self):
        def corrupt(state):
            self.path.write_bytes(b'changed')
            raise OSError(errno.ENOSPC, 'test error')
        self.updater.save_state.side_effect = corrupt
        with self.assertRaisesRegex(UpdateError, 'changed persistent metadata'):
            self.invoke()


if __name__ == '__main__':
    unittest.main()
