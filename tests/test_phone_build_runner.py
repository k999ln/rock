"""Run the real shell orchestrator against a deliberately fake build toolchain."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RunnerTests(unittest.TestCase):
    def test_host_failure_replaces_previous_success(self):
        with tempfile.TemporaryDirectory() as temp:
            tree = Path(temp)
            root = tree / 'external/rockstaros'
            scripts = root / 'scripts'
            scripts.mkdir(parents=True)
            shutil.copy(ROOT / 'scripts/build-phone-bringup.sh', scripts)
            (scripts / 'prepare-phone-build.py').write_text(
                'import sys\n'
                'if sys.argv[1] == "build-config":\n'
                ' print("frankel\\tfrankel-cur-userdebug\\thook\\tkernel\\ttarget-files-package,otatools-package")\n'
                'else: sys.exit(23)\n')
            fakebin = tree / 'bin'
            fakebin.mkdir()
            fakegit = fakebin / 'git'
            fakegit.write_text('#!/bin/sh\necho 123456789abc\n')
            fakegit.chmod(0o755)
            signers = tree / 'allowed-signers'
            signers.write_text('fixture only')
            evidence = tree / 'out/rockstaros-evidence'
            evidence.mkdir(parents=True)
            manifest = evidence / 'build-manifest.json'
            manifest.write_text('{"status":"COMPILE_AND_ARTIFACT_CHECKS_PASSED"}')
            env = dict(os.environ, PATH=str(fakebin) + os.pathsep + os.environ['PATH'],
                       ROCK_LOCAL_AI_APK='fixture.apk', ROCK_ANDROID_AAPT2='fixture-aapt2')
            result = subprocess.run(['bash', str(scripts / 'build-phone-bringup.sh'),
                                     '--mode', 'bringup', str(tree), str(signers)],
                                    env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 23, result.stderr)
            value = json.loads(manifest.read_text())
            self.assertEqual(value['status'], 'FAILED')
            self.assertEqual(value['exitCode'], 23)
            self.assertFalse(value['releaseFlashAllowed'])
            first = value['buildNumber']
            subprocess.run(['bash', str(scripts / 'build-phone-bringup.sh'),
                            '--mode', 'bringup', str(tree), str(signers)],
                           env=env, capture_output=True)
            self.assertNotEqual(json.loads(manifest.read_text())['buildNumber'], first)


if __name__ == '__main__':
    unittest.main()
