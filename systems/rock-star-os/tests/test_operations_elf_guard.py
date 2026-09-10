"""Synthetic malformed headers plus the exact observed wrong-loader rejection."""
import importlib.util
from pathlib import Path
import struct
import unittest

spec = importlib.util.spec_from_file_location('operations_elf_guard', Path(__file__).resolve().parents[1] /
    'os/operations/elf_guard.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


def fixture(interpreter=guard.INTERPRETER, *, machine=183, duplicate=False):
    data = interpreter.encode() + b'\0'
    count = 2 if duplicate else 1
    start = 64 + count * 56
    ident = b'\x7fELF\x02\x01\x01' + b'\0' * 9
    header = struct.pack('<HHIQQQIHHHHHH', 3, machine, 1, 0, 64, 0, 0, 64, 56, count, 0, 0, 0)
    program = struct.pack('<IIQQQQQQ', 3, 4, start, 0, 0, len(data), len(data), 1)
    return ident + header + program * count + data


class OperationsELFGuardTests(unittest.TestCase):
    def test_expected_aarch64_musl_is_accepted_without_executing_binary(self):
        self.assertEqual(guard.verify_native_elf(fixture())['interpreter'], guard.INTERPRETER)

    def test_observed_host_glibc_loader_cannot_pass(self):
        with self.assertRaisesRegex(ValueError, 'musl interpreter'):
            guard.verify_native_elf(fixture('/lib/ld-linux-aarch64.so.1'))

    def test_wrong_architecture_duplicate_or_missing_interpreter_rejected(self):
        no_interpreter = bytearray(fixture()); struct.pack_into('<I', no_interpreter, 64, 1)
        for raw in (fixture(machine=62), fixture(duplicate=True), bytes(no_interpreter)):
            with self.subTest(raw=raw[:24]), self.assertRaises(ValueError): guard.verify_native_elf(raw)

    def test_segment_header_bounds_and_wrong_class_rejected(self):
        beyond = bytearray(fixture()); struct.pack_into('<Q', beyond, 72, len(beyond)+1)
        for raw in (b'', fixture()[:-1], bytes(beyond), b'\x7fELF\x01' + fixture()[5:]):
            with self.subTest(size=len(raw)), self.assertRaises(ValueError): guard.verify_native_elf(raw)


if __name__ == '__main__': unittest.main()
