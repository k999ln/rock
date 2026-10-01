"""Signed compatibility metadata and structural verification remain separate.

Signing uses the published RFC fixture only. No server, OS, download or external
publication is involved; these tests establish SDK/package contracts only.
"""
import copy
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import tomllib
import unittest

from blackberryrock import __version__
from blackberryrock.packages import (
    CURRENT_PROFILE, PackageCompatibilityError, PackageError, PUBLIC_TEST_KEY,
    REMOTE_CONTRACT, TEST_PUBLISHER, canonical, compatibility_status, digest,
    require_compatible, validate_manifest, verify_package,
)
from blackberryrock.sdk import main as sdk_main, sign_development, starter

ROOT = Path(__file__).resolve().parents[1]
TRUST = {TEST_PUBLISHER: PUBLIC_TEST_KEY}


def remote_source():
    source = starter(tool_id='org.rockstar.compatible-remote')
    source['manifest'].update(
        execution_targets=['device_local', 'cloud', 'pc_usb'],
        permissions=['text.input', 'text.output', 'execution.remote'],
        data={'input': 'user_supplied_text', 'destinations': ['cloud', 'pc_usb']},
        remote=dict(REMOTE_CONTRACT),
    )
    return source


class SDKCompatibilityTests(unittest.TestCase):
    def test_default_starter_explicitly_requires_this_release_and_runtime(self):
        manifest = starter()['manifest']
        self.assertEqual(4, manifest['schema_version'])
        self.assertEqual({'os': 'rock-star-os', 'min_os_version': '0.3.0',
                          'min_runtime_version': '1.0.0'}, manifest['compatibility'])
        status = compatibility_status(manifest)
        self.assertEqual([], status['reasons'])
        self.assertIs(status['compatible'], True)
        self.assertIs(status['declared'], True)
        self.assertIs(manifest, require_compatible(manifest))

    def test_release_metadata_agrees_with_immutable_profile(self):
        metadata = tomllib.loads((ROOT / 'pyproject.toml').read_text())
        self.assertEqual('0.3.0', __version__)
        self.assertEqual(__version__, metadata['project']['version'])
        self.assertEqual(__version__, CURRENT_PROFILE['os_version'])
        with self.assertRaises(TypeError):
            CURRENT_PROFILE['os_version'] = '999.0.0'
        status = compatibility_status(starter()['manifest'])
        status['current']['os_version'] = '999.0.0'
        status['required']['min_os_version'] = '999.0.0'
        self.assertEqual('0.3.0', CURRENT_PROFILE['os_version'])
        self.assertTrue(compatibility_status(starter()['manifest'])['compatible'])

    def test_existing_schema_two_and_three_signed_fixtures_remain_byte_identical(self):
        paths = [ROOT / 'examples/registry/org.rockstar.text-tidy--1.0.0.rock.json',
                 ROOT / 'os/runner/fixtures/remote-text.rock.json']
        for schema, path in zip((2, 3), paths):
            with self.subTest(schema=schema):
                raw = path.read_bytes()
                package = json.loads(raw)
                before = canonical(package)
                manifest, package_hash = verify_package(package, TRUST)
                self.assertEqual(schema, manifest['schema_version'])
                self.assertNotIn('compatibility', manifest)
                self.assertEqual(digest(package), package_hash)
                self.assertIs(manifest, require_compatible(manifest))
                self.assertIs(compatibility_status(manifest)['declared'], False)
                self.assertEqual(before, canonical(sign_development(package)))
                self.assertEqual(raw, path.read_bytes())

    def test_explicit_legacy_starter_cannot_silently_discard_minimum_requirements(self):
        legacy = starter(schema_version=2)
        self.assertEqual(2, legacy['manifest']['schema_version'])
        self.assertNotIn('compatibility', legacy['manifest'])
        verify_package(sign_development(legacy), TRUST)
        for field in ('min_os_version', 'min_runtime_version'):
            with self.subTest(field=field), self.assertRaises(ValueError):
                starter(schema_version=2, **{field: '999.0.0'})
        for schema in (True, 4.0, '4', 1, 3, 5):
            with self.subTest(schema=schema), self.assertRaises(ValueError):
                starter(schema_version=schema)

    def test_correctly_signed_future_os_package_passes_structure_but_fails_admission(self):
        package = sign_development(starter(min_os_version='999.0.0'))
        manifest, package_hash = verify_package(package, TRUST)
        self.assertEqual(digest(package), package_hash)
        self.assertIs(manifest, validate_manifest(manifest))
        with self.assertRaises(PackageCompatibilityError) as caught:
            require_compatible(manifest)
        self.assertEqual(['os_too_old'], caught.exception.status['reasons'])
        self.assertIn('999.0.0', str(caught.exception))
        self.assertIn('0.3.0', str(caught.exception))
        self.assertIs(require_compatible(manifest, {**CURRENT_PROFILE, 'os_version': '999.0.0'}), manifest)

    def test_known_recipe_with_future_runtime_minimum_is_distributable_but_not_admitted(self):
        package = sign_development(starter(min_runtime_version='1.10.0'))
        manifest, _ = verify_package(package, TRUST)
        with self.assertRaises(PackageCompatibilityError) as caught:
            require_compatible(manifest)
        self.assertEqual(['runtime_too_old'], caught.exception.status['reasons'])
        self.assertIs(require_compatible(manifest, {**CURRENT_PROFILE, 'runtime_version': '1.10.0'}), manifest)

    def test_numeric_comparison_handles_major_minor_patch_without_lexical_ordering(self):
        for current, minimum, compatible in (
            ('1.10.0', '1.9.0', True), ('1.9.0', '1.10.0', False),
            ('2.0.0', '1.99.99', True), ('1.99.99', '2.0.0', False),
            ('1.2.10', '1.2.9', True), ('1.2.9', '1.2.10', False),
            ('1.2.3', '1.2.3', True),
        ):
            for field, profile_field, reason in (
                ('min_os_version', 'os_version', 'os_too_old'),
                ('min_runtime_version', 'runtime_version', 'runtime_too_old'),
            ):
                with self.subTest(current=current, minimum=minimum, field=field):
                    manifest = starter(**{field: minimum})['manifest']
                    status = compatibility_status(manifest, {**CURRENT_PROFILE, profile_field: current})
                    self.assertIs(status['compatible'], compatible)
                    self.assertEqual([] if compatible else [reason], status['reasons'])

    def test_both_incompatibilities_are_reported_without_mutating_manifest_or_profile(self):
        manifest = starter(min_os_version='999.0.0', min_runtime_version='99.0.0')['manifest']
        profile = dict(CURRENT_PROFILE)
        original = canonical([manifest, profile])
        status = compatibility_status(manifest, profile)
        self.assertEqual(['os_too_old', 'runtime_too_old'], status['reasons'])
        self.assertEqual(original, canonical([manifest, profile]))

    def test_minimum_requirements_are_part_of_the_verified_signature(self):
        package = sign_development(starter(min_os_version='999.0.0', min_runtime_version='9.0.0'))
        for field in ('min_os_version', 'min_runtime_version'):
            with self.subTest(field=field):
                changed = copy.deepcopy(package)
                changed['manifest']['compatibility'][field] = '0.0.0'
                with self.assertRaisesRegex(PackageError, 'signature'):
                    verify_package(changed, TRUST)

    def test_schema_four_remote_targets_keep_the_exact_existing_consent_contract(self):
        source = remote_source()
        manifest, _ = verify_package(sign_development(source), TRUST)
        self.assertEqual(4, manifest['schema_version'])
        self.assertEqual(['cloud', 'pc_usb'], manifest['data']['destinations'])
        self.assertIs(manifest, require_compatible(manifest))
        for field, value in (
            ('remote', {**REMOTE_CONTRACT, 'consent': 'automatic'}),
            ('permissions', ['text.input', 'text.output']),
            ('data', {'input': 'user_supplied_text', 'destinations': ['cloud']}),
            ('execution_targets', ['cloud', 'cloud']),
            ('execution_targets', ['arbitrary-host']),
        ):
            with self.subTest(field=field):
                changed = copy.deepcopy(manifest)
                changed[field] = value
                with self.assertRaises(PackageError):
                    validate_manifest(changed)
        no_remote = copy.deepcopy(manifest)
        del no_remote['remote']
        with self.assertRaises(PackageError):
            validate_manifest(no_remote)
        local = starter()['manifest']
        local['remote'] = dict(REMOTE_CONTRACT)
        with self.assertRaises(PackageError):
            validate_manifest(local)

    def test_unknown_or_malformed_compatibility_requirements_are_never_distributable(self):
        good = starter()['manifest']
        malformed = [None, True, [], '0.3.0', {},
                     {**good['compatibility'], 'os': 'another-os'},
                     {**good['compatibility'], 'os': ['rock-star-os']},
                     {**good['compatibility'], 'max_os_version': '999.0.0'}]
        for field in ('os', 'min_os_version', 'min_runtime_version'):
            missing = dict(good['compatibility'])
            del missing[field]
            malformed.append(missing)
        for value in malformed:
            with self.subTest(value=value):
                changed = copy.deepcopy(good)
                changed['compatibility'] = value
                with self.assertRaises(PackageError):
                    validate_manifest(changed)
                with self.assertRaises(PackageError):
                    compatibility_status(changed)

    def test_minimum_versions_reject_noncanonical_unbounded_or_nonstring_values(self):
        invalid = [None, True, False, 1, 1.0, [], {}, '', '1', '1.2', '01.2.3',
                   '1.02.3', '1.2.03', '-1.2.3', '1.2.3-beta', '1.2.3+build',
                   ' 1.2.3', '1.2.3\n', '１.２.３', '9' * 61 + '.0.0']
        for field in ('min_os_version', 'min_runtime_version'):
            for value in invalid:
                with self.subTest(field=field, value=value):
                    manifest = starter()['manifest']
                    manifest['compatibility'][field] = value
                    with self.assertRaises(PackageError):
                        validate_manifest(manifest)
                    if value is not None:  # None is the starter's omitted-option default.
                        with self.assertRaises(PackageError):
                            starter(**{field: value})

    def test_unknown_schema_runtime_and_legacy_extra_compatibility_remain_rejected(self):
        for schema in (True, 4.0, '4', 1, 5):
            manifest = starter()['manifest']
            manifest['schema_version'] = schema
            with self.subTest(schema=schema), self.assertRaises(PackageError):
                validate_manifest(manifest)
        for runtime in (None, True, [], {}, 'rock-recipe/2', 'python', 'rock-recipe/1.0'):
            manifest = starter()['manifest']
            manifest['runtime'] = runtime
            with self.subTest(runtime=runtime), self.assertRaises(PackageError):
                validate_manifest(manifest)
        manifest = starter(schema_version=2)['manifest']
        manifest['compatibility'] = starter()['manifest']['compatibility']
        with self.assertRaises(PackageError):
            validate_manifest(manifest)

    def test_malformed_current_profiles_fail_instead_of_claiming_compatibility(self):
        profiles = [False, [], {}, '0.3.0', {**CURRENT_PROFILE, 'extra': True},
                    {**CURRENT_PROFILE, 'os': 'another-os'},
                    {**CURRENT_PROFILE, 'runtime': 'rock-recipe/2'}]
        for field in CURRENT_PROFILE:
            missing = dict(CURRENT_PROFILE)
            del missing[field]
            profiles.append(missing)
        for field in ('os_version', 'runtime_version'):
            for value in (True, 1.0, [], 'latest', '1.0.0-beta', '9' * 61 + '.0.0'):
                profiles.append({**CURRENT_PROFILE, field: value})
        for profile in profiles:
            with self.subTest(profile=profile), self.assertRaises(PackageError):
                compatibility_status(starter()['manifest'], profile)

    def test_sdk_default_and_legacy_new_roundtrip_keep_check_explicit(self):
        with tempfile.TemporaryDirectory() as temp, redirect_stdout(io.StringIO()):
            directory = Path(temp)
            for schema in (4, 2):
                source, package = directory / f'source-{schema}.json', directory / f'package-{schema}.json'
                args = ['new', str(source)] + (['--schema-version', '2'] if schema == 2 else [])
                self.assertEqual(0, sdk_main(args))
                self.assertEqual(schema, json.loads(source.read_text())['manifest']['schema_version'])
                self.assertEqual(0, sdk_main(['build-dev', str(source), str(package)]))
                self.assertEqual(0, sdk_main(['check', str(package)]))
                self.assertEqual(0, sdk_main(['check', str(package), '--compatible']))

    def test_sdk_future_minimum_build_and_structural_check_succeed_but_compatible_check_refuses(self):
        with tempfile.TemporaryDirectory() as temp, redirect_stdout(io.StringIO()):
            directory = Path(temp)
            source, package = directory / 'source.json', directory / 'future.rock.json'
            self.assertEqual(0, sdk_main(['new', str(source), '--min-os-version', '999.0.0',
                                          '--min-runtime-version', '99.0.0']))
            self.assertEqual(0, sdk_main(['build-dev', str(source), str(package)]))
            self.assertEqual(0, sdk_main(['check', str(package)]))
            before = package.read_bytes()
            with self.assertRaises(PackageCompatibilityError):
                sdk_main(['check', str(package), '--compatible'])
            self.assertEqual(before, package.read_bytes())
            verify_package(json.loads(before), TRUST)


if __name__ == '__main__':
    unittest.main()
