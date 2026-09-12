"""Install public source inputs into a disposable target; never build or boot an OS."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
BENCHMARK = ROOT / 'os/benchmark'
HISTORICAL = BENCHMARK / 'prepared/20260908-v1'


class PlatformInstallInputsTests(unittest.TestCase):
    def test_public_overlay_install_and_fresh_benchmark_preparation(self):
        historical = {path.name: path.read_bytes() for path in HISTORICAL.iterdir() if path.is_file()}
        with tempfile.TemporaryDirectory(prefix='rock-platform-install-') as temporary:
            work = Path(temporary)
            target = work / 'target'
            shutil.copytree(ROOT / 'os/buildroot/board/rock-virt/overlay', target)
            # Buildroot's base filesystem supplies this directory before the
            # platform package runs. All init hooks come from the real overlay.
            (target / 'usr/libexec').mkdir(parents=True, exist_ok=True)
            installed = subprocess.run(['sh', str(ROOT / 'os/platform/install-target.sh'), str(target)],
                                       capture_output=True, text=True, timeout=30)
            self.assertEqual(installed.returncode, 0, installed.stdout + installed.stderr)
            protocol = historical['preregistration.md']
            self.assertEqual((target / 'usr/lib/rock-benchmark/preregistration.md').read_bytes(), protocol)
            for path in ('usr/lib/rock-platform/service.py', 'usr/lib/rock-platform/wallet_auth/daemon.py',
                         'usr/lib/rock-platform/blackberryrock/sky_services.py',
                         'usr/libexec/rock-wallet-evidence-auth.py', 'usr/libexec/rock-platform-health',
                         'usr/share/rock/sky-services/catalog.json',
                         'usr/share/rock/sky-services/rockstar-ledger.zip',
                         'usr/share/fonts/rock/NotoSansCJKjp-Regular.otf'):
                self.assertGreater((target / path).stat().st_size, 0, path)
            sky_catalog = json.loads((target / 'usr/share/rock/sky-services/catalog.json').read_text())
            sky_bundle = (target / 'usr/share/rock/sky-services/rockstar-ledger.zip').read_bytes()
            self.assertEqual(sky_catalog['services'][0]['sha256'], hashlib.sha256(sky_bundle).hexdigest())
            # Resolve the installed guest's actual document path in an isolated
            # interpreter. Import does not run its guarded measurement main().
            probe = subprocess.run([sys.executable, '-I', '-B', '-c',
                'import hashlib,sys;sys.path.insert(0,sys.argv[1]);import guest;'
                'print(hashlib.sha256(guest.PROTOCOL.read_bytes()).hexdigest())',
                str(target / 'usr/lib/rock-benchmark')], capture_output=True, text=True, timeout=30)
            self.assertEqual(probe.returncode, 0, probe.stdout + probe.stderr)
            digest = hashlib.sha256(protocol).hexdigest()
            self.assertEqual(probe.stdout.strip(), digest)
            self.assertEqual(json.loads(historical['preparation.json'])['preregistration_sha256'], digest)
            prepared = work / 'new-preparation'
            result = subprocess.run([sys.executable, '-B', str(BENCHMARK / 'verify.py'), 'prepare', '--output', str(prepared)],
                                    capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('PREPARED ONLY; no experiment executed:', result.stdout)
            self.assertEqual((prepared / 'preregistration.md').read_bytes(), protocol)
            report = json.loads((prepared / 'preparation.json').read_text())
            self.assertEqual(report['preregistration_sha256'], digest)
            for name, value in report['sources'].items():
                self.assertEqual(value, hashlib.sha256((target / 'usr/lib/rock-benchmark' / name).read_bytes()).hexdigest())
            for value in report['packages'].values():
                self.assertEqual(value['sha256'], hashlib.sha256((prepared / value['filename']).read_bytes()).hexdigest())
        self.assertEqual({path.name: path.read_bytes() for path in HISTORICAL.iterdir() if path.is_file()}, historical)


if __name__ == '__main__':
    unittest.main()
