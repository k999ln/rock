"""State-machine/security tests; regular files are explicit test-only slots."""
import json
import io
import hashlib
import errno
import os
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

from make_bundle import bundle, envelope_for, sign_development
from rock_update import (ATTEMPTS, MAGIC, MAX_HEADER, Updater, UpdateError,
                         atomic_json, canonical, clean_ext4)


def image_bytes(content):
    # Tiny state-machine fixture with a synthetic clean superblock; actual
    # ext4 consistency and mounts are checked by e2fsck and the QEMU harness.
    raw = bytearray(content * (8192 // len(content)))
    raw[1024:2048] = bytes(1024)
    struct.pack_into('<HH', raw, 1024 + 0x38, 0xef53, 1)
    return raw


class ABTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="rock-ab-unit-")
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.a = self.directory / "A"
        self.b = self.directory / "B"
        self.a.write_bytes(image_bytes(b"A"))
        self.b.write_bytes(b"\0" * 8192)
        self.factory = self.directory / "factory.json"
        self.factory.write_bytes(canonical(envelope_for(self.a, 1, "factory-1")))
        self.update = Updater(self.directory / "state", {"A": self.a, "B": self.b},
                              self.directory / "run/boot.json", self.factory, test_regular_files=True)
        self.assertEqual(self.update.boot_select(), self.a)
        self.assertEqual(self.update.mark_good()["result"], "already-good")

    def new_bundle(self, sequence=2, content=b"B", name=None):
        image = self.directory / f"image-{sequence}-{name or 'normal'}"
        image.write_bytes(image_bytes(content))
        result = self.directory / f"bundle-{sequence}-{name or 'normal'}"
        bundle(image, result, sequence, f"test-{sequence}")
        return result

    def assert_unarmed(self):
        state = self.update.read_state()
        self.assertEqual(state["committed"], "A")
        self.assertIsNone(state["pending"])
        self.assertEqual(state["floor"], 1)

    def test_unclean_ext4_metadata_is_rejected(self):
        for offset, fmt, value in ((0x38, '<H', 0), (0x3a, '<H', 0), (0x3a, '<H', 3),
                                   (0x60, '<I', 4), (0x64, '<I', 0x10000), (0xe8, '<I', 15)):
            with self.subTest(offset=offset, value=value):
                raw = image_bytes(b'C')
                struct.pack_into(fmt, raw, 1024 + offset, value)
                with self.assertRaises(UpdateError):
                    clean_ext4(io.BytesIO(raw))

    def test_signed_unclean_root_is_rejected_before_inactive_write(self):
        candidate = self.new_bundle()
        raw = candidate.read_bytes()
        length = struct.unpack('>I', raw[len(MAGIC):len(MAGIC) + 4])[0]
        envelope = json.loads(raw[len(MAGIC) + 4:len(MAGIC) + 4 + length])
        payload = bytearray(raw[len(MAGIC) + 4 + length:])
        struct.pack_into('<I', payload, 1024 + 0x60, 4)
        envelope['manifest']['sha256'] = hashlib.sha256(payload).hexdigest()
        header = canonical(sign_development(envelope['manifest']))
        candidate.write_bytes(MAGIC + struct.pack('>I', len(header)) + header + payload)
        before = self.b.read_bytes()
        with self.assertRaisesRegex(UpdateError, 'requires journal recovery'):
            self.update.install(candidate)
        self.assertEqual(before, self.b.read_bytes())
        self.assert_unarmed()

    def foreign_abi_bundle(self):
        candidate = self.new_bundle()
        raw = candidate.read_bytes()
        length = struct.unpack('>I', raw[len(MAGIC):len(MAGIC) + 4])[0]
        envelope = json.loads(raw[len(MAGIC) + 4:len(MAGIC) + 4 + length])
        envelope['manifest']['data_abi'] = 'incompatible-data-v2'
        with patch('rock_update.DATA_ABI', 'incompatible-data-v2'):
            envelope = sign_development(envelope['manifest'])
        header = canonical(envelope)
        candidate.write_bytes(MAGIC + struct.pack('>I', len(header)) + header + raw[len(MAGIC) + 4 + length:])
        return candidate, envelope

    def test_foreign_data_abi_rejected_before_slot_write(self):
        candidate, _ = self.foreign_abi_bundle()
        before = self.b.read_bytes()
        with self.assertRaisesRegex(UpdateError, 'incompatible persistent data ABI'):
            self.update.install(candidate)
        self.assertEqual(before, self.b.read_bytes())
        self.assert_unarmed()

    def test_foreign_data_abi_in_boot_metadata_fails_closed(self):
        _, foreign = self.foreign_abi_bundle()
        state = self.update.read_state()
        state.update(pending='B', attempts_left=2)
        state['slots']['B'] = foreign
        self.update.save_state(state)
        before = self.update.state_path.read_bytes()
        with patch.object(self.update, 'save_state') as save:
            with self.assertRaisesRegex(UpdateError, 'incompatible persistent data ABI'):
                self.update.boot_select()
            save.assert_not_called()
        self.assertEqual(before, self.update.state_path.read_bytes())

    def test_boot_state_storage_errors_select_only_committed_and_do_not_confirm_trial(self):
        self.update.install(self.new_bundle())
        before = self.update.state_path.read_bytes()
        for code in (errno.ENOSPC, errno.EDQUOT, errno.EROFS, errno.EIO, errno.EACCES):
            with self.subTest(errno=code), patch.object(self.update, 'save_state', side_effect=OSError(code, 'storage unavailable')):
                self.assertEqual(self.update.boot_select(), self.a)
                self.assertEqual(self.update.mark_good()['result'], 'committed-fallback')
            self.assertEqual(before, self.update.state_path.read_bytes())
            self.assertEqual(json.loads(self.update.boot_record.read_text())['reason'], 'state-write-failed')
            self.assertEqual(self.update.read_state()['floor'], 1)

    def test_exhausted_attempts_with_full_state_store_use_committed(self):
        self.update.install(self.new_bundle())
        state = self.update.read_state()
        state['attempts_left'] = 0
        self.update.save_state(state)
        before = self.update.state_path.read_bytes()
        with patch.object(self.update, 'save_state', side_effect=OSError(errno.ENOSPC, 'full')):
            self.assertEqual(self.update.boot_select(), self.a)
            self.assertEqual(self.update.mark_good()['result'], 'committed-fallback')
        self.assertEqual(before, self.update.state_path.read_bytes())

    def test_readonly_state_store_uses_existing_readonly_lock(self):
        self.update.install(self.new_bundle())
        original_open = os.open
        before = self.update.state_path.read_bytes()
        def readonly_open(path, flags, *args, **kwargs):
            if Path(path).is_relative_to(self.update.data) and flags & (os.O_RDWR | os.O_WRONLY):
                raise OSError(errno.EROFS, 'state filesystem is read-only')
            return original_open(path, flags, *args, **kwargs)
        with patch('os.open', side_effect=readonly_open):
            self.assertEqual(self.update.boot_select(), self.a)
            self.assertEqual(self.update.mark_good()['result'], 'committed-fallback')
            with self.assertRaises(OSError):
                self.update.install(self.new_bundle(3))
        self.assertEqual(before, self.update.state_path.read_bytes())

    def test_storage_error_never_justifies_corrupt_committed_slot(self):
        self.update.install(self.new_bundle())
        self.a.write_bytes(b'X' * 8192)
        with patch.object(self.update, 'save_state', side_effect=OSError(errno.EIO, 'I/O error')):
            with self.assertRaisesRegex(UpdateError, 'digest mismatch'):
                self.update.boot_select()

    def test_invalid_boot_signature_is_not_storage_fallback(self):
        state = self.update.read_state()
        state['slots']['A']['signature'] = '00' * 64
        self.update.save_state(state)
        with patch.object(self.update, 'save_state') as save:
            with self.assertRaisesRegex(UpdateError, 'signature rejected'):
                self.update.boot_select()
            save.assert_not_called()

    def test_failure_after_state_replace_still_selects_committed(self):
        self.update.install(self.new_bundle())
        save = self.update.save_state
        def saved_then_error(state):
            save(state)
            raise OSError(errno.EIO, 'directory sync failed after replacement')
        with patch.object(self.update, 'save_state', side_effect=saved_then_error):
            self.assertEqual(self.update.boot_select(), self.a)
            self.assertEqual(self.update.mark_good()['result'], 'committed-fallback')
        self.assertEqual(self.update.read_state()['attempts_left'], 1)
        self.assertEqual(self.update.read_state()['floor'], 1)

    @staticmethod
    def cut_at(wanted):
        def cut(point):
            if point == wanted:
                raise InterruptedError('test power cut at ' + point)
        return cut

    def test_power_cut_after_payload_sync_leaves_trial_unarmed(self):
        self.update.fault_hook = self.cut_at('install.payload_synced')
        with self.assertRaises(InterruptedError):
            self.update.install(self.new_bundle())
        self.assert_unarmed()
        self.assertEqual(self.update.boot_select(), self.a)

    def test_power_cut_after_pending_save_retains_trial(self):
        self.update.fault_hook = self.cut_at('install.pending_saved')
        with self.assertRaises(InterruptedError):
            self.update.install(self.new_bundle())
        self.assertEqual(self.update.read_state()['pending'], 'B')
        self.assertEqual(self.update.boot_select(), self.b)
        self.assertEqual(self.update.mark_good()['sequence'], 2)

    def test_power_cut_after_attempt_save_retains_consumed_attempt(self):
        self.update.install(self.new_bundle())
        self.update.fault_hook = self.cut_at('boot.attempts_saved')
        with self.assertRaises(InterruptedError):
            self.update.boot_select()
        self.assertEqual(self.update.read_state()['attempts_left'], 1)
        self.update.fault_hook = None
        self.assertEqual(self.update.boot_select(), self.b)
        self.assertEqual(self.update.read_state()['attempts_left'], 0)
        self.assertEqual(self.update.mark_good()['sequence'], 2)

    def test_power_cut_after_confirmation_save_keeps_confirmed_floor(self):
        self.update.install(self.new_bundle())
        self.update.boot_select()
        self.update.fault_hook = self.cut_at('confirm.committed_saved')
        with self.assertRaises(InterruptedError):
            self.update.mark_good()
        self.assertEqual(self.update.read_state()['floor'], 2)
        self.assertEqual(self.update.boot_select(), self.b)
        self.assertEqual(self.update.mark_good()['result'], 'already-good')

    def test_install_reboot_confirm_and_next_slot(self):
        candidate = self.new_bundle()
        original = self.a.read_bytes()
        self.assertEqual(self.update.install(candidate)["slot"], "B")
        self.assertEqual(self.a.read_bytes(), original)
        self.assertEqual(self.update.boot_select(), self.b)
        self.assertEqual(self.update.read_state()["attempts_left"], ATTEMPTS - 1)
        self.assertEqual(self.update.mark_good()["result"], "committed")
        self.assertEqual(self.update.read_state()["floor"], 2)
        self.assertEqual(self.update.mark_good()["result"], "already-good")
        next_bundle = self.new_bundle(3, b"C")
        self.assertEqual(self.update.install(next_bundle)["slot"], "A")
        self.assertEqual(self.update.boot_select(), self.a)
        self.assertEqual(self.update.mark_good()["sequence"], 3)

    def test_failed_boots_exhaust_attempts_and_restore_committed(self):
        self.update.install(self.new_bundle())
        for _ in range(ATTEMPTS):
            self.assertEqual(self.update.boot_select(), self.b)
        self.assertEqual(self.update.boot_select(), self.a)
        self.assert_unarmed()
        self.assertEqual(json.loads(self.update.boot_record.read_text())["reason"], "attempts-exhausted")

    def test_tampered_pending_image_is_rejected_by_boot_selector(self):
        self.update.install(self.new_bundle())
        with self.b.open("r+b") as stream:
            stream.write(b"tampered")
        self.assertEqual(self.update.boot_select(), self.a)
        self.assert_unarmed()
        self.assertEqual(json.loads(self.update.boot_record.read_text())["reason"], "rejected-trial")

    def test_corrupt_committed_image_fails_closed(self):
        self.a.write_bytes(b"X" * 8192)
        with self.assertRaisesRegex(UpdateError, "digest mismatch"):
            self.update.boot_select()

    def test_corrupt_state_does_not_silently_reset_to_factory(self):
        self.update.state_path.write_text('{"incomplete":')
        with self.assertRaises(UpdateError):
            self.update.boot_select()

    def test_broken_state_symlink_does_not_reset_to_factory(self):
        self.update.state_path.unlink()
        self.update.state_path.symlink_to(self.directory / "missing-state")
        with self.assertRaises(OSError):
            self.update.boot_select()

    def test_signature_rejected_before_any_slot_write(self):
        candidate = self.new_bundle()
        raw = candidate.read_bytes()
        length = struct.unpack(">I", raw[len(MAGIC):len(MAGIC) + 4])[0]
        header = json.loads(raw[len(MAGIC) + 4:len(MAGIC) + 4 + length])
        header["signature"] = "00" * 64
        replacement = canonical(header)
        candidate.write_bytes(MAGIC + struct.pack(">I", len(replacement)) + replacement + raw[len(MAGIC) + 4 + length:])
        before = self.b.read_bytes()
        with self.assertRaisesRegex(UpdateError, "signature rejected"):
            self.update.install(candidate)
        self.assertEqual(before, self.b.read_bytes())
        self.assert_unarmed()

    def test_payload_rejected_before_any_slot_write(self):
        candidate = self.new_bundle()
        with candidate.open("r+b") as stream:
            stream.seek(-1, os.SEEK_END)
            stream.write(b"X")
        before = self.b.read_bytes()
        with self.assertRaisesRegex(UpdateError, "payload digest rejected"):
            self.update.install(candidate)
        self.assertEqual(before, self.b.read_bytes())
        self.assert_unarmed()

    def test_header_limit_and_truncation_and_trailing_bytes(self):
        candidate = self.directory / "malformed"
        for raw in (MAGIC + struct.pack(">I", MAX_HEADER + 1), MAGIC, b"wrong"):
            candidate.write_bytes(raw)
            with self.assertRaises(UpdateError):
                self.update.install(candidate)
        valid = self.new_bundle().read_bytes()
        for raw in (valid[:-1], valid + b"extra"):
            candidate.write_bytes(raw)
            with self.assertRaisesRegex(UpdateError, "length mismatch"):
                self.update.install(candidate)
        self.assert_unarmed()

    def test_duplicate_json_fields_are_rejected(self):
        candidate = self.directory / "duplicate"
        header = b'{"manifest":{},"manifest":{},"signature":""}'
        candidate.write_bytes(MAGIC + struct.pack(">I", len(header)) + header)
        with self.assertRaisesRegex(UpdateError, "duplicate JSON"):
            self.update.install(candidate)

    def test_same_pending_update_is_idempotent_without_resetting_attempts(self):
        candidate = self.new_bundle()
        self.update.install(candidate)
        state_before = self.update.state_path.read_bytes()
        self.assertEqual(self.update.install(candidate)["result"], "already-staged")
        self.assertEqual(state_before, self.update.state_path.read_bytes())

    def test_different_pending_update_is_rejected(self):
        self.update.install(self.new_bundle())
        before = self.b.read_bytes()
        with self.assertRaisesRegex(UpdateError, "another update is pending"):
            self.update.install(self.new_bundle(3, b"C"))
        self.assertEqual(before, self.b.read_bytes())

    def test_downgrade_is_rejected_after_confirmation(self):
        self.update.install(self.new_bundle())
        self.update.boot_select()
        self.update.mark_good()
        with self.assertRaisesRegex(UpdateError, "not newer"):
            self.update.install(self.new_bundle(1, b"A"))

    def test_installer_interruption_does_not_arm_trial(self):
        before = self.update.state_path.read_bytes()

        def stop_after_first_write(_):
            raise InterruptedError("simulated installer crash")

        with self.assertRaises(InterruptedError):
            self.update.install(self.new_bundle(), write_observer=stop_after_first_write)
        self.assertEqual(before, self.update.state_path.read_bytes())
        self.assertEqual(self.update.boot_select(), self.a)
        self.assert_unarmed()

    def test_bundle_mutation_during_copy_does_not_arm_trial(self):
        candidate = self.new_bundle()

        def mutate(_):
            original_time = candidate.stat().st_mtime_ns
            with candidate.open("r+b") as stream:
                stream.seek(-1, os.SEEK_END)
                stream.write(b"X")
            # Linux can give two sub-tick writes the same timestamp. This test
            # isolates the identity guard; final slot hashing independently
            # guarantees that only authenticated bytes can ever be armed.
            os.utime(candidate, ns=(original_time + 1_000_000_000, original_time + 1_000_000_000))

        with self.assertRaisesRegex(UpdateError, "changed while writing"):
            self.update.install(candidate, write_observer=mutate)
        self.assert_unarmed()

    def test_inactive_capacity_mismatch_is_rejected(self):
        self.b.write_bytes(b"\0" * 4096)
        with self.assertRaisesRegex(UpdateError, "does not fit"):
            self.update.install(self.new_bundle())
        self.assertEqual(self.b.read_bytes(), b"\0" * 4096)

    def test_unconfirmed_running_slot_cannot_install(self):
        self.update.install(self.new_bundle())
        self.update.boot_select()
        with self.assertRaisesRegex(UpdateError, "confirm or roll back"):
            self.update.install(self.new_bundle(3, b"C"))

    def test_old_slot_cannot_confirm_pending_slot(self):
        self.update.install(self.new_bundle())
        with self.assertRaisesRegex(UpdateError, "not running"):
            self.update.mark_good()

    def test_symlink_bundle_is_refused(self):
        link = self.directory / "link"
        link.symlink_to(self.new_bundle())
        with self.assertRaises(OSError):
            self.update.install(link)

    def test_wrong_boot_identity_prevents_write(self):
        record = json.loads(self.update.boot_record.read_text())
        record["sha256"] = "0" * 64
        atomic_json(self.update.boot_record, record)
        with self.assertRaisesRegex(UpdateError, "boot identity differs"):
            self.update.install(self.new_bundle())

    def test_unprivileged_real_updater_rejected_before_creating_state(self):
        missing = self.directory / "not-created"
        real = Updater(data=missing)
        with patch("os.geteuid", return_value=1000):
            with self.assertRaisesRegex(UpdateError, "root is required"):
                with real.lock():
                    self.fail("unprivileged lock was accepted")
        self.assertFalse(missing.exists())

    def test_group_writable_state_directory_rejected(self):
        self.update.data.chmod(0o770)
        with self.assertRaisesRegex(UpdateError, "private"):
            self.update.boot_select()


if __name__ == "__main__":
    unittest.main()
