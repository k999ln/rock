import importlib.util
from pathlib import Path
import unittest


SPEC = importlib.util.spec_from_file_location('package_android_trial', Path(__file__).resolve().parents[1] / 'scripts/package-android-trial.py')
TRIAL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TRIAL)


def badging(package, internet=False):
    result = f"package: name='{package}' versionCode='1' versionName='0.1.0'\nsdkVersion:'35'\ntargetSdkVersion:'35'\napplication-debuggable\n"
    if internet:
        result += "uses-permission: name='android.permission.INTERNET'\n"
    return result


class AndroidTrialContractTests(unittest.TestCase):
    def test_current_three_apk_network_boundaries(self):
        for module, package in TRIAL.TRIAL_PACKAGES:
            internet = module == 'automation'
            with self.subTest(module=module):
                self.assertEqual(internet, TRIAL.validate_badging(module, package, badging(package, internet)))
                with self.assertRaisesRegex(ValueError, 'INTERNET'):
                    TRIAL.validate_badging(module, package, badging(package, not internet))

    def test_conditional_internet_permission_cannot_enter_shell_or_tool(self):
        for module, package in TRIAL.TRIAL_PACKAGES[1:]:
            with self.subTest(module=module), self.assertRaisesRegex(ValueError, 'INTERNET'):
                TRIAL.validate_badging(module, package, badging(package) + "uses-permission-sdk-23: name='android.permission.INTERNET'\n")

    def test_identity_sdk_and_debug_contract_still_reject_drift(self):
        for old, new in [("dev.rock.shell", "dev.rock.other"), ("versionCode='1'", "versionCode='2'"),
                         ("sdkVersion:'35'", "sdkVersion:'34'"), ("targetSdkVersion:'35'", "targetSdkVersion:'34'"),
                         ('application-debuggable', '')]:
            with self.subTest(field=old), self.assertRaisesRegex(ValueError, 'identity, SDK or debug'):
                TRIAL.validate_badging('shell', 'dev.rock.shell', badging('dev.rock.shell').replace(old, new))
        with self.assertRaisesRegex(ValueError, 'Unknown'):
            TRIAL.validate_badging('automation', 'dev.rock.shell', badging('dev.rock.shell', True))

    def test_cleartext_must_be_explicitly_disabled_in_compiled_manifest(self):
        attribute = '  A: android:usesCleartextTraffic(0x010104ec)=(type 0x12)0x0\n'
        TRIAL.validate_cleartext_manifest(attribute)
        for invalid in ['', attribute.replace(')0x0', ')0xffffffff'), attribute + attribute]:
            with self.subTest(manifest=invalid), self.assertRaisesRegex(ValueError, 'cleartext'):
                TRIAL.validate_cleartext_manifest(invalid)


if __name__ == '__main__':
    unittest.main()
