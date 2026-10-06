"""Synthetic target-files exercise the verifier; these are not OS acceptance."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/verify-phone-artifacts.py'
SPEC = importlib.util.spec_from_file_location('artifacts', SCRIPT)
artifacts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(artifacts)


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.target = self.root / 'frankel-target_files-test.zip'
        self.ota = self.root / 'otatools.zip'
        self.props = {
            'ro.product.product.device': 'frankel',
            'ro.product.build.version.incremental': 'rock.fixture.123',
            'ro.product.build.type': 'userdebug',
            'ro.rockstaros.stage': 'device-bringup',
            'ro.rockstaros.release_flash_allowed': 'false',
            'ro.rockstaros.financial_ready': 'false',
            'ro.rockstaros.operator_agent.stage': 'excluded',
        }
        self.entries = {'META/misc_info.txt': b'ab_update=true\navb_enable=true\n'}
        self.entries.update({name: b'fixture-image' for name in artifacts.IMAGES})
        self.entries.update({f'PRODUCT/app/{m}/{m}.apk': b'fixture-apk' for m in artifacts.MODULES})
        with zipfile.ZipFile(self.ota, 'w') as z:
            for name in artifacts.TOOLS:
                z.writestr(name, b'fixture-tool-not-executable')

    def write(self, path='PRODUCT/etc/build.prop'):
        with zipfile.ZipFile(self.target, 'w') as z:
            for name, data in self.entries.items():
                z.writestr(name, data)
            z.writestr(path, ''.join(f'{k}={v}\n' for k, v in self.props.items()))

    def verify(self, operator='excluded'):
        return artifacts.verify(self.target, self.ota, 'rock.fixture.123', operator)

    def test_valid_inventory_remains_non_flashable(self):
        self.write()
        value = self.verify()
        self.assertEqual(value['status'], 'ARTIFACT_STRUCTURE_VERIFIED')
        self.assertEqual(len(value['applications']), 4)
        self.assertEqual(value['artifacts']['targetFiles'], artifacts.digest(self.target))
        for name in ('releaseFlashAllowed', 'productionSigned', 'imageBootVerified', 'hardwareFlashPerformed'):
            self.assertIs(value[name], False)

    def test_legacy_property_location(self):
        self.write('PRODUCT/build.prop')
        self.verify()

    def test_wrong_device_stale_build_or_release_flags_fail(self):
        for key, wrong in [('ro.product.product.device', 'rango'),
                           ('ro.product.build.version.incremental', 'old'),
                           ('ro.product.build.type', 'user'),
                           ('ro.rockstaros.release_flash_allowed', 'true')]:
            with self.subTest(key=key):
                old = self.props[key]
                self.props[key] = wrong
                self.write()
                with self.assertRaisesRegex(ValueError, key):
                    self.verify()
                self.props[key] = old

    def test_missing_app_image_or_metadata_fails(self):
        for name in ['PRODUCT/app/RockShell/RockShell.apk', 'IMAGES/boot.img', 'META/misc_info.txt']:
            with self.subTest(name=name):
                old = self.entries.pop(name)
                self.write()
                with self.assertRaises(ValueError):
                    self.verify()
                self.entries[name] = old

    def test_duplicate_unsafe_and_link_properties_fail(self):
        for name in ['PRODUCT/etc/build.prop', '../escape']:
            self.write()
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                with zipfile.ZipFile(self.target, 'a') as z:
                    z.writestr(name, 'bad')
            with self.assertRaises(ValueError):
                self.verify()
        self.write('PRODUCT/build.prop')
        with zipfile.ZipFile(self.target, 'a') as z:
            link = zipfile.ZipInfo('PRODUCT/etc/build.prop')
            link.external_attr = 0o120777 << 16
            z.writestr(link, '../../outside')
        with self.assertRaises(ValueError):
            self.verify()

    def test_operator_modes_match_packaged_application(self):
        name = 'PRODUCT/app/RockOperatorAgent/RockOperatorAgent.apk'
        self.entries[name] = b'fixture-operator'
        self.write()
        with self.assertRaisesRegex(ValueError, 'excluded Operator'):
            self.verify()
        self.props['ro.rockstaros.operator_agent.stage'] = 'configured'
        self.write()
        self.assertEqual(len(self.verify('configured')['applications']), 5)
        del self.entries[name]
        self.write()
        with self.assertRaises(ValueError):
            self.verify('configured')

    def test_missing_ota_tool_fails(self):
        self.write()
        with zipfile.ZipFile(self.ota, 'w') as z:
            z.writestr('unrelated', 'fixture')
        with self.assertRaises(ValueError):
            self.verify()

    def test_cli_invalidates_prior_success_on_failed_or_ambiguous_input(self):
        self.write()
        output = self.root / 'receipt.json'
        command = [sys.executable, str(SCRIPT), '--dist', str(self.root),
                   '--build-number', 'rock.fixture.123', '--operator', 'excluded',
                   '--evidence-dir', str(self.root), '--output', str(output)]
        for name in ('source-manifest.xml', 'source-lock.json', 'rock-commit.txt', 'vendor-inventory.json', 'local-ai-artifact.json'):
            (self.root / name).write_text('fixture input evidence')
        subprocess.run(command, check=True, capture_output=True)
        self.assertEqual(json.loads(output.read_text())['status'], 'ARTIFACT_STRUCTURE_VERIFIED')
        (self.root / 'frankel-target_files-stale.zip').write_bytes(self.target.read_bytes())
        self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
        self.assertEqual(json.loads(output.read_text())['status'], 'VALIDATION_PENDING')


if __name__ == '__main__':
    unittest.main()
