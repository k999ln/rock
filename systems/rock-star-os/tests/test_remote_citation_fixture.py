"""The optional remote version keeps the existing citation content contract."""
import hashlib
import json
from pathlib import Path
import unittest

from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, verify_package
from runner.build_fixture import remote_citation_fixture


class RemoteCitationFixtureTests(unittest.TestCase):
    def test_explicit_remote_version_preserves_original_product_and_limits(self):
        native = Path(__file__).resolve().parents[1]
        original_path = native / 'os/tools/packages/org.rockstar.citation-organizer--1.0.0.recipe.json'
        before = original_path.read_bytes()
        original = json.loads(before)
        package = remote_citation_fixture()
        verify_package(package, {TEST_PUBLISHER: PUBLIC_TEST_KEY})
        self.assertEqual(before, original_path.read_bytes())
        self.assertEqual(package['recipe'], original['recipe'])
        for field in ('id', 'name', 'publisher', 'kind', 'runtime', 'resources', 'price', 'source', 'recipe_sha256', 'lifecycle'):
            self.assertEqual(package['manifest'][field], original['manifest'][field], field)
        self.assertEqual(package['manifest']['version'], '1.1.0')
        self.assertEqual(package['manifest']['execution_targets'], ['device_local', 'cloud', 'pc_usb'])
        self.assertEqual(package['manifest']['data']['destinations'], ['cloud', 'pc_usb'])
        self.assertEqual(package['manifest']['remote']['consent'], 'per_job_input_sha256')
        self.assertEqual(hashlib.sha256((native / 'os/tools/fixtures/citations.md').read_bytes()).hexdigest(),
                         'bad73028a4b23b6e046abc4a1463f2fa14ffd4f55844ec9146cdc9acc3b1387e')


if __name__ == '__main__':
    unittest.main()
