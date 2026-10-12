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


    def test_compile_and_receipt_lifecycle_with_fake_toolchain(self):
        with tempfile.TemporaryDirectory() as temp:
            tree = Path(temp)
            root = tree / 'external/rockstaros'
            scripts = root / 'scripts'
            scripts.mkdir(parents=True)
            for name in ('build-phone-bringup.sh', 'verify-phone-artifacts.py'):
                shutil.copy(ROOT / 'scripts' / name, scripts)
            (scripts / 'prepare-phone-build.py').write_text(
                'import sys\n'
                'if sys.argv[1] == "build-config":\n'
                ' print("frankel\\tfrankel-cur-userdebug\\tvendor/adevtool/hook\\tkernel\\ttarget-files-package,otatools-package")\n'
                'elif sys.argv[1] == "verify-hook": print("hook\\tfixture-hash")\n')
            (scripts / 'stage-local-ai-apk.py').write_text('# fake staged input\n')
            (scripts / 'freeze-phone-build-inputs.py').write_text(
                'import pathlib,sys\n'
                'if "--output" in sys.argv: pathlib.Path(sys.argv[sys.argv.index("--output")+1]).write_text("{}")\n')
            (root / 'os/physical').mkdir(parents=True)
            (root / 'os/physical/frankel-source-lock.json').write_text('{}')
            (tree / 'vendor/rockstaros-local-ai').mkdir(parents=True)
            (tree / 'vendor/rockstaros-local-ai/artifact.json').write_text('{}')
            fakebin = tree / 'bin'
            fakebin.mkdir()
            for name, content in {
                'git': '#!/bin/sh\necho 123456789abcdef\n',
                'repo': '#!/bin/sh\nif [ "$1" = manifest ]; then echo "<manifest/>" > "$4"; fi\n',
            }.items():
                command = fakebin / name
                command.write_text(content)
                command.chmod(0o755)
            (tree / 'build').mkdir()
            (tree / 'build/envsetup.sh').write_text(
                'lunch() { :; }\n'
                'm() {\n'
                '  if [[ $FAKE_RESULT == compile-failure ]]; then return 37; fi\n'
                '  python3 emit.py\n'
                '}\n')
            (tree / 'emit.py').write_text(
                'import os, shutil\n'
                'from pathlib import Path\n'
                'from test_phone_artifacts import ArtifactTests\n'
                'fixture=ArtifactTests(); fixture.setUp()\n'
                'fixture.props["ro.product.build.version.incremental"]=os.environ["BUILD_NUMBER"]\n'
                'if os.environ["FAKE_RESULT"] == "invalid-artifact": fixture.props["ro.product.product.device"]="rango"\n'
                'fixture.write()\n'
                'for p in (fixture.target, fixture.ota): shutil.copy(p, Path(os.environ["DIST_DIR"])/p.name)\n')
            signers = tree / 'allowed-signers'
            signers.write_text('fixture only')
            env = dict(os.environ, PATH=str(fakebin) + os.pathsep + os.environ['PATH'],
                       ROCK_LOCAL_AI_APK='fixture.apk', ROCK_ANDROID_AAPT2='fixture-aapt2',
                       PYTHONPATH=str(ROOT / 'tests'))
            env.pop('ROCK_OPERATOR_AGENT_CONFIG', None)
            for mode, expected in [('valid', 0), ('compile-failure', 37), ('invalid-artifact', 1)]:
                with self.subTest(mode=mode):
                    env['FAKE_RESULT'] = mode
                    result = subprocess.run(['bash', str(scripts / 'build-phone-bringup.sh'),
                                             '--mode', 'bringup', str(tree), str(signers)],
                                            env=env, capture_output=True, text=True)
                    self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
                    state = json.loads((tree / 'out/rockstaros-evidence/build-manifest.json').read_text())
                    self.assertEqual(state['status'], 'COMPILE_AND_ARTIFACT_CHECKS_PASSED' if expected == 0 else 'FAILED')
                    self.assertFalse(state['releaseFlashAllowed'])
                    if expected == 0:
                        receipt = json.loads((tree / state['evidenceDirectory'] / 'artifacts.json').read_text())
                        self.assertEqual(receipt['buildNumber'], state['buildNumber'])
                        self.assertEqual(len(receipt['inputs']), 5)


if __name__ == '__main__':
    unittest.main()
