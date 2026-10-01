"""Signed remote permission metadata must not broaden existing local packages."""
import copy
from pathlib import Path
import tempfile
import unittest

from blackberryrock.hub import Hub
from blackberryrock.packages import (PackageError, PUBLIC_TEST_KEY, TEST_PUBLISHER,
                                    REMOTE_CONTRACT, validate_manifest, verify_package)
from blackberryrock.sdk import sign_development, starter

TRUST = {TEST_PUBLISHER:PUBLIC_TEST_KEY}


def remote_source(targets=None):
    source = starter(tool_id='org.rockstar.remote-contract', schema_version=2)
    targets = ['device_local','cloud','pc_usb'] if targets is None else targets
    source['manifest'].update(schema_version=3, execution_targets=targets,
                              permissions=['text.input','text.output','execution.remote'],
                              data={'input':'user_supplied_text','destinations':[x for x in targets if x!='device_local']},
                              remote=dict(REMOTE_CONTRACT))
    return source


class RemoteManifestTests(unittest.TestCase):
    def test_existing_schema_two_stays_local_only(self):
        manifest = starter(schema_version=2)['manifest']
        self.assertIs(manifest, validate_manifest(manifest))
        manifest['execution_targets'] = ['cloud']
        with self.assertRaisesRegex(PackageError, 'schema 2'):
            validate_manifest(manifest)

    def test_schema_three_is_signed_with_explicit_data_destination_and_consent(self):
        package = sign_development(remote_source())
        manifest, _ = verify_package(package, TRUST)
        self.assertEqual(['cloud','pc_usb'], manifest['data']['destinations'])
        self.assertEqual('per_job_input_sha256', manifest['remote']['consent'])
        changed = copy.deepcopy(package)
        changed['manifest']['execution_targets'] = ['device_local','cloud']
        changed['manifest']['data']['destinations'] = ['cloud']
        with self.assertRaisesRegex(PackageError, 'signature'):
            verify_package(changed, TRUST)

    def test_remote_targets_must_be_finite_unique_and_explicit(self):
        for targets in ([], ['device_local'], ['cloud','cloud'], ['pc_link'], ['auto'],
                        ['https://example.invalid'], ['cloud',True], 'cloud'):
            with self.subTest(targets=targets), self.assertRaises(PackageError):
                source = remote_source(['cloud'])
                source['manifest']['execution_targets'] = targets
                validate_manifest(source['manifest'])

    def test_remote_data_and_permission_cannot_be_omitted_or_point_to_arbitrary_hosts(self):
        for field, value in (
            ('permissions',['text.input','text.output']),
            ('permissions',['text.input','text.output','network.all']),
            ('data',{'input':'user_supplied_text','destinations':[]}),
            ('data',{'input':'user_supplied_text','destinations':['https://example.invalid']}),
            ('data',{'input':'/etc/passwd','destinations':['cloud','pc_usb']}),
            ('remote',{**REMOTE_CONTRACT,'consent':'automatic'}),
            ('remote',{**REMOTE_CONTRACT,'endpoint':'https://example.invalid'}),
        ):
            with self.subTest(field=field,value=value), self.assertRaises(PackageError):
                manifest = remote_source()['manifest']
                manifest[field] = value
                validate_manifest(manifest)

    def test_remote_only_tool_is_not_silently_executed_on_local_hub(self):
        with tempfile.TemporaryDirectory() as temporary:
            hub = Hub(Path(temporary)/'hub.db',TRUST)
            installed = hub.install(sign_development(remote_source(['cloud'])))
            hub.enable(installed['id'],installed['hash'])
            for target in ('auto','device_local','cloud','pc_usb'):
                with self.subTest(target=target), self.assertRaises(PackageError):
                    hub.run(installed['id'],'text','try-'+target,target)
            self.assertEqual([],hub.state()['jobs'])

    def test_float_or_boolean_resource_limits_do_not_pass_integer_policy(self):
        for schema in (2,3):
            for field in ('input_bytes','output_bytes','timeout_seconds','max_steps'):
                with self.subTest(schema=schema,field=field), self.assertRaises(PackageError):
                    manifest = (starter(schema_version=2) if schema==2 else remote_source())['manifest']
                    manifest['resources'][field] = float(manifest['resources'][field])
                    validate_manifest(manifest)


if __name__ == '__main__':
    unittest.main()
