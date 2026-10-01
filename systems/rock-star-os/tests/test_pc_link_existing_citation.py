"""The optional update selector cannot infer approval from a tool name."""
from contextlib import closing
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from blackberryrock.packages import canonical, verify_package, PUBLIC_TEST_KEY, TEST_PUBLISHER
from blackberryrock.sdk import sign_development

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/'os/desktop/observe-pc-link-os.py'
spec = importlib.util.spec_from_file_location('pc_link_existing_citation', SCRIPT)
observer = importlib.util.module_from_spec(spec); spec.loader.exec_module(observer)


class ExistingCitationBaseline(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(); self.addCleanup(self.directory.cleanup)
        self.database = Path(self.directory.name)/'hub.sqlite3'
        self.package = sign_development(json.loads((ROOT/'os/tools/packages/org.rockstar.citation-organizer--1.0.0.recipe.json').read_bytes()))
        self.manifest, self.package_hash = verify_package(self.package, {TEST_PUBLISHER: PUBLIC_TEST_KEY})
        with closing(sqlite3.connect(self.database)) as db:
            db.executescript('CREATE TABLE hub_installed(id TEXT PRIMARY KEY,version TEXT,enabled INTEGER); CREATE TABLE hub_packages(id TEXT,version TEXT,hash TEXT,body TEXT,PRIMARY KEY(id,version)); CREATE TABLE hub_revoked(subject TEXT PRIMARY KEY);')
            db.execute('INSERT INTO hub_installed VALUES(?,?,?)', (self.manifest['id'], '1.0.0', 1))
            db.execute('INSERT INTO hub_packages VALUES(?,?,?,?)', (self.manifest['id'], '1.0.0', self.package_hash, canonical(self.package).decode()))
            db.commit()

    def mutate(self, sql, parameters=()):
        with closing(sqlite3.connect(self.database)) as db:
            db.execute(sql, parameters); db.commit()

    def rejected(self):
        before = hashlib.sha256(self.database.read_bytes()).hexdigest()
        with self.assertRaises((AssertionError, ValueError)):
            observer.verify_existing_local_citation(self.database, ROOT)
        self.assertEqual(hashlib.sha256(self.database.read_bytes()).hexdigest(), before)

    def test_exact_public_enabled_fixture_is_read_only(self):
        before = self.database.read_bytes()
        result = observer.verify_existing_local_citation(self.database, ROOT)
        self.assertEqual(result['package_sha256'], observer.LOCAL_CITATION_PACKAGE_SHA256)
        self.assertEqual(result['version'], '1.0.0')
        self.assertEqual(result['hub_database_sha256'], hashlib.sha256(before).hexdigest())
        self.assertEqual(self.database.read_bytes(), before)

    def test_missing_install_rejected(self):
        self.mutate('DELETE FROM hub_installed'); self.rejected()

    def test_already_updated_version_rejected(self):
        self.mutate("UPDATE hub_installed SET version='1.1.0'"); self.rejected()

    def test_disabled_install_rejected(self):
        self.mutate('UPDATE hub_installed SET enabled=0'); self.rejected()

    def test_package_hash_mismatch_rejected(self):
        self.mutate('UPDATE hub_packages SET hash=?', ('f'*64,)); self.rejected()

    def test_name_matching_but_different_recipe_rejected(self):
        self.package['recipe'] = [{'op': 'trim_lines'}]
        self.mutate('UPDATE hub_packages SET body=?', (canonical(self.package).decode(),)); self.rejected()

    def test_public_version_revocation_rejected(self):
        self.mutate('INSERT INTO hub_revoked VALUES(?)', (self.manifest['id']+'@1.0.0',)); self.rejected()

    def test_publisher_revocation_rejected(self):
        self.mutate('INSERT INTO hub_revoked VALUES(?)', (TEST_PUBLISHER,)); self.rejected()

    def test_flag_requires_citations_and_stopped_baseline_before_any_file_read(self):
        command = [sys.executable, '-B', str(SCRIPT), '--source', '/not-an-existing-source',
                   '--config', '/not-a-config', '--sandbox-config', '/not-a-sandbox',
                   '--output', '/not-an-output', '--commit', '9'*40, '--existing-local-citation']
        for extra in ([], ['--fixture', 'citations', '--resume-from', '/not-a-resume']):
            with self.subTest(extra=extra):
                result = subprocess.run(command+extra, capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 2)
                self.assertIn('requires --fixture citations and a stopped baseline', result.stderr)
                self.assertNotIn('Traceback', result.stderr)


if __name__ == '__main__':
    unittest.main()
