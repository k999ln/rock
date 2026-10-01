"""Catch stale reviewed PIN source bindings in the ordinary source gate."""
import importlib.util
import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / 'os/ui'
spec = importlib.util.spec_from_file_location('pin_source_guard', UI / 'pin_readiness.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class PinSourceProfile(unittest.TestCase):
    def test_reviewed_profile_matches_current_native_render_dependencies(self):
        # This reads the canonical guard, including its source hash checks.
        # It neither blesses new hashes nor bypasses the separate real C test.
        self.assertEqual(set(guard.profiles()), {'enroll', 'atm'})
        manifest = json.loads((UI / 'pin-readiness.json').read_text())
        required = {'os/ui/ui.c', 'os/ui/main.c', 'os/assets/NotoSansCJKjp-Regular.otf'}
        required.update('os/ui/' + name for name in re.findall(
            r'^#include "([^"]+)"', (UI / 'ui.c').read_text(), re.M))
        self.assertLessEqual(required, set(manifest['sources']))


if __name__ == '__main__':
    unittest.main()
