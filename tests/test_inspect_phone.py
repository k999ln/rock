"""Host-only read-only transport fixtures. Never contact adb or a device."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("inspect_phone", Path(__file__).resolve().parents[1] / "scripts/inspect-phone.py")
phone = importlib.util.module_from_spec(spec)
spec.loader.exec_module(phone)
REAL_POPEN = subprocess.Popen


class PhoneInspectionTests(unittest.TestCase):
    def test_requires_explicit_device_and_only_reads_named_allowlist_without_identifiers(self):
        with patch.object(phone, "read_property") as read, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as missing:
                phone.main([])
            self.assertEqual(missing.exception.code, 2)
            read.assert_not_called()
        serial = "FIXTURE-PRIVATE-123"
        commands = []

        def transport(args, **kwargs):
            commands.append(args)
            self.assertFalse(kwargs["shell"])
            self.assertEqual(kwargs["stdin"], subprocess.DEVNULL)
            self.assertEqual(kwargs["stderr"], subprocess.DEVNULL)
            raw = "Fixture phone\n" if args[-1] == "ro.product.model" else "\n"
            return REAL_POPEN([sys.executable, "-c", "import sys; sys.stdout.write(" + repr(raw) + ")"], **kwargs)

        with patch.object(phone.subprocess, "Popen", side_effect=transport):
            report = phone.inspect(serial)
        self.assertEqual(commands, [["adb", "-s", serial, "shell", "getprop", prop] for prop in phone.PROPERTIES.values()])
        self.assertEqual(report["properties"]["model"], "Fixture phone")
        self.assertIsNone(report["properties"]["vbmeta_device_state"])
        self.assertNotIn(serial, json.dumps(report))
        self.assertNotIn("ro.serialno", json.dumps(commands))
        self.assertNotIn("ro.boot.serialno", json.dumps(commands))

    def test_transport_rejects_oversize_timeout_nonzero_and_identifier_echo_without_leaking_diagnostics(self):
        serial = "FIXTURE-PRIVATE-123"
        scenarios = [
            ("import sys; sys.stdout.write('x' * 1025)", 2, "output bound"),
            ("import time; time.sleep(2)", 0.1, "timed out"),
            ("import sys; sys.stderr.write('FIXTURE-PRIVATE-123 SECRET'); sys.exit(1)", 2, "could not read"),
            ("print('FIXTURE-PRIVATE-123')", 2, "output suppressed"),
        ]
        for program, timeout, expected in scenarios:
            with self.subTest(expected=expected):
                child = None

                def transport(args, **kwargs):
                    nonlocal child
                    child = REAL_POPEN([sys.executable, "-c", program], **kwargs)
                    return child

                with patch.object(phone.subprocess, "Popen", side_effect=transport):
                    with self.assertRaises(phone.InspectionError) as failed:
                        phone.read_property(serial, "ro.product.model", time.monotonic() + timeout)
                self.assertIn(expected, str(failed.exception))
                self.assertNotIn(serial, str(failed.exception))
                self.assertNotIn("SECRET", str(failed.exception))
                self.assertIsNotNone(child.poll())

    def test_late_read_failure_emits_no_partial_success_and_invalid_serial_never_starts_adb(self):
        out, err = io.StringIO(), io.StringIO()
        with patch.object(phone, "read_property", side_effect=["Model", phone.InspectionError("Device property read timed out; no report produced.")]), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            result = phone.main(["--serial", "FIXTURE-PRIVATE-123"])
        self.assertEqual(result, 2)
        self.assertEqual(out.getvalue(), "")
        self.assertNotIn("FIXTURE-PRIVATE-123", err.getvalue())
        with patch.object(phone.subprocess, "Popen") as execute, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(phone.main(["--serial", "bad;identifier"]), 2)
            execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
