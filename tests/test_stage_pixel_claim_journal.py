import importlib.util
from pathlib import Path
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('stage_journal', ROOT / 'scripts/stage-pixel-claim-journal.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class StageTests(unittest.TestCase):
    def fixture(self, root):
        a = root / 'android'; target = a / 'shell/src/debug/java/dev/rock/shell'; target.mkdir(parents=True)
        (target / 'EveAccountSessionStore.java').write_text('"eve-account-session-aes-v1"\n    static SecretKey key() throws Exception {\n// unchanged creator\n}')
        (target / 'PixelPortableBridgeProtocol.java').write_text('existing protocol')
        (target / 'SkyLinuxBridge.java').write_text('existing mTLS')
        release = a / 'shell/src/main/AndroidManifest.xml'; release.parent.mkdir(parents=True); release.write_text('<manifest/>')
        (a / 'shell/build.gradle').write_text("include 'sky-language-fixture.json'")
        return a, target

    def test_debug_only_staging_preserves_bridge_release_and_creator(self):
        with tempfile.TemporaryDirectory() as folder:
            a, target = self.fixture(Path(folder)); session = target / 'EveAccountSessionStore.java'
            old = session.read_text(); result = module.stage(a)
            self.assertFalse(result['controllerConnected']); self.assertFalse(result['newKeyCreation']); self.assertFalse(result['installed'])
            self.assertEqual('existing mTLS', (target / 'SkyLinuxBridge.java').read_text())
            self.assertIn(old[old.index('    static SecretKey key()'):], session.read_text())
            accessor = session.read_text().split('static SecretKey existingJournalKey()')[1].split('static SecretKey key()')[0]
            self.assertIn('containsAlias(ALIAS)', accessor); self.assertNotIn('generateKey', accessor); self.assertNotIn('KeyGenerator', accessor)
            before = session.read_bytes()
            with self.assertRaises(ValueError): module.stage(a)
            self.assertEqual(before, session.read_bytes())

    def test_source_drift_and_collision_fail_before_any_mutation(self):
        for variant in ['source', 'collision', 'resources', 'protocol']:
            with tempfile.TemporaryDirectory() as folder:
                a, target = self.fixture(Path(folder)); session = target / 'EveAccountSessionStore.java'
                if variant == 'source': session.write_text('unreviewed source')
                if variant == 'collision': (target / 'EvePortableClaimJournal.java').write_text('keep me')
                if variant == 'resources': (a / 'shell/build.gradle').write_text('unreviewed resources')
                if variant == 'protocol': (target / 'PixelPortableBridgeProtocol.java').unlink()
                before = {p: p.read_bytes() for p in a.rglob('*') if p.is_file()}
                with self.assertRaises(ValueError): module.stage(a)
                self.assertEqual(before, {p: p.read_bytes() for p in a.rglob('*') if p.is_file()})

if __name__ == '__main__': unittest.main()
