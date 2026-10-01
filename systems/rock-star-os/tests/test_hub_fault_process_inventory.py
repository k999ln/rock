"""Bounded proc inventory guards; no kernel checkpoint/restore hook needed."""
import importlib.util
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('hub_process_inventory',
    Path(__file__).resolve().parents[1] / 'os/platform/hub_fault_fixture.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


class ProcessInventoryTests(unittest.TestCase):
    def test_prearm_proof_cannot_skip_quiescence_or_relax_any_bound(self):
        value = {'method': 'all-platform-threads-stopped-and-proc-stat-ppid', 'thread_ids': [101, 102],
                 'process_count': 12, 'existing_children': 0, 'elapsed_seconds': .1}
        fixture.validate_prearm(value, 101)
        for name, item in [('method', 'children'), ('thread_ids', [102]), ('thread_ids', [101, 101]),
                           ('process_count', True), ('process_count', 4097), ('existing_children', False),
                           ('existing_children', 1), ('elapsed_seconds', 2.01), ('elapsed_seconds', float('nan'))]:
            with self.subTest(name=name, item=item), self.assertRaises(ValueError):
                fixture.validate_prearm(dict(value, **{name: item}), 101)
        with self.assertRaises(ValueError):
            fixture.validate_prearm(None, 101)

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='rock-hub-proc-')
        self.addCleanup(self.temporary.cleanup)
        self.proc = Path(self.temporary.name)
        self.add_process(1, 0)
        self.add_process(101, 1)

    def add_process(self, pid, ppid, state='S'):
        directory = self.proc / str(pid)
        directory.mkdir()
        fields = [state, str(ppid)] + ['0'] * 17 + ['987', '0']
        (directory / 'stat').write_text(f'{pid} (name with ) parentheses) ' + ' '.join(fields) + '\n')

    def inventory(self, **changes):
        args = dict(proc=self.proc, deadline=time.monotonic() + 2)
        args.update(changes)
        return fixture.process_inventory(101, {101, 102}, **args)

    def test_stat_inventory_works_without_any_children_file(self):
        self.assertEqual(self.inventory(), {1, 101})
        self.assertEqual(list(self.proc.rglob('children')), [])

    def test_existing_child_or_zombie_of_any_platform_thread_refuses_arm(self):
        for ppid, state in ((101, 'S'), (102, 'R'), (101, 'Z')):
            with self.subTest(ppid=ppid, state=state):
                self.add_process(201, ppid, state)
                with self.assertRaisesRegex(ValueError, 'already has a child'):
                    self.inventory()
                (self.proc / '201/stat').unlink()
                (self.proc / '201').rmdir()

    def test_missing_or_malformed_stat_cannot_count_as_child_absence(self):
        path = self.proc / '101/stat'
        for data in (b'', b'101 (broken', b'999 (wrong pid) S 1 ' + b'0 ' * 30,
                     b'101 (bad number) S nope ' + b'0 ' * 30, b'x' * 4097):
            with self.subTest(data=data[:35]):
                path.write_bytes(data)
                with self.assertRaises((ValueError, OSError)):
                    self.inventory()
        path.unlink()
        with self.assertRaises(FileNotFoundError):
            self.inventory()

    def test_inventory_deadline_and_size_are_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'deadline'):
            self.inventory(deadline=time.monotonic() - 1)
        with patch.object(fixture, 'MAX_PROCESSES', 1):
            with self.assertRaisesRegex(ValueError, 'inventory limit'):
                self.inventory()

    def test_platform_missing_from_inventory_cannot_arm(self):
        (self.proc / '101/stat').unlink()
        (self.proc / '101').rmdir()
        with self.assertRaisesRegex(ValueError, 'platform missing'):
            self.inventory()


if __name__ == '__main__':
    unittest.main()
