"""Real subprocess/Git fixtures; fake scanner faults never become clean reports."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
REAL_GITLEAKS = Path(os.environ.get('GITLEAKS_BINARY', ROOT / 'work/spider-ci/bin/gitleaks'))
SPEC = importlib.util.spec_from_file_location('spider_repository_scan', ROOT / 'scripts/spider-repository-scan.py')
scanner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scanner)


def git(repository, *args):
    result = subprocess.run(['git', '-c', 'core.hooksPath=' + os.devnull,
                             '-c', 'commit.gpgsign=false', '-C', str(repository), *args],
                            capture_output=True, check=True)
    return result.stdout.decode().strip()


class RepositoryScanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.repository = self.root / 'candidate'
        self.repository.mkdir()
        git(self.repository, 'init', '-q')
        git(self.repository, 'config', 'user.name', 'Private fixture author')
        git(self.repository, 'config', 'user.email', 'private-author@example.invalid')
        (self.repository / 'public.txt').write_text('public fixture\n')
        git(self.repository, 'add', '.')
        git(self.repository, 'commit', '-qm', 'Private fixture message')
        self.head = git(self.repository, 'rev-parse', 'HEAD')
        self.config = self.root / 'trusted.toml'
        self.config.write_text('[extend]\nuseDefault = true\n')
        self.binary = self.root / 'fake-gitleaks'
        self.binary.write_text('#!' + sys.executable + '\n' + '''
import json, os, pathlib, sys, time
p = pathlib.Path(__file__)
s = json.loads(p.with_suffix('.json').read_text())
if sys.argv[1:] == ['version']:
    print(s.get('version', '8.30.1'))
    raise SystemExit(0)
args = sys.argv[1:]
template = pathlib.Path(args[args.index('--report-template')+1]).read_text()
ignore = pathlib.Path(args[args.index('--gitleaks-ignore-path')+1]).read_text()
p.with_suffix('.observed').write_text(json.dumps({'args':args,'env':list(os.environ),'template':template,'ignore':ignore,'cwd':os.getcwd()}))
time.sleep(s.get('sleep', 0))
sys.stdout.write(s.get('raw', json.dumps(s.get('report', {'total':0,'findings':[]}))))
sys.stderr.write(s.get('stderr', ''))
raise SystemExit(s.get('code', 0))
''')
        self.binary.chmod(0o700)
        self.configure()

    def configure(self, **settings):
        self.binary.with_suffix('.json').write_text(json.dumps(settings))

    def row(self, **changes):
        return {'rule': 'generic-api-key', 'file': 'src/settings.py', 'line': 7,
                'commit': self.head, **changes}

    def run_scan(self, **env):
        output = self.root / 'result'
        captured = io.StringIO()
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'false', **env}), contextlib.redirect_stdout(captured):
            code = scanner.main(['--repository', str(self.repository), '--gitleaks', str(self.binary),
                                 '--config', str(self.config), '--output', str(output)])
        return code, json.loads((output / 'report.json').read_text()), captured.getvalue(), (output / 'summary.md').read_text()

    def test_clean_uses_fixed_head_trusted_config_and_no_candidate_overrides(self):
        (self.repository / '.gitleaks.toml').write_text('not a config; must not be loaded')
        (self.repository / '.gitleaksignore').write_text('must not be loaded')
        code, report, _, _ = self.run_scan(GITLEAKS_CONFIG='untrusted', GITLEAKS_CONFIG_TOML='untrusted', GIT_EXTERNAL_DIFF='untrusted')
        self.assertEqual(0, code)
        self.assertEqual('clean', report['status'])
        self.assertEqual(self.head, report['targetHead'])
        self.assertEqual(1, report['reachableCommitCount'])
        observed = json.loads(self.binary.with_suffix('.observed').read_text())
        self.assertEqual('', observed['ignore'])
        self.assertNotEqual(str(self.repository), observed['cwd'])
        self.assertFalse(any(key.startswith('GITLEAKS_') for key in observed['env']))
        self.assertNotIn('GIT_EXTERNAL_DIFF', observed['env'])
        for flag in ('--ignore-gitleaks-allow', '--redact=100', '--log-level=error', '--timeout=180', '--max-decode-depth=2', '--max-archive-depth=0', '--report-path=-'):
            self.assertIn(flag, observed['args'])
        options = next(x for x in observed['args'] if x.startswith('--log-opts='))
        self.assertIn('--no-ext-diff --no-textconv', options)
        self.assertTrue(options.endswith(self.head))
        self.assertEqual(str(self.config), observed['args'][observed['args'].index('--config') + 1])
        for forbidden in ('.Secret', '.Match', '.Author', '.Email', '.Message', '.Fingerprint'):
            self.assertNotIn(forbidden, observed['template'])

    def test_candidates_are_bounded_sanitized_and_historical_annotations_are_not_current_lines(self):
        marker = 'gh' + 'p_' + secrets.token_hex(18)
        unsafe = ['../private', '/absolute', 'a//b', './file', 'two words', 'a\n::error title=forged::bad', 'a\\b', 'a/' + marker, 'あ.py', 'x' * 241]
        rows = [self.row(file=name) for name in unsafe]
        rows += [self.row(commit='a'*40)]
        rows += [self.row()] * (100-len(rows))
        self.configure(code=1, report={'total': 123, 'findings': rows})
        summary_path = self.root / 'github-summary'
        code, report, stdout, markdown = self.run_scan(GITHUB_ACTIONS='true', GITHUB_STEP_SUMMARY=str(summary_path))
        self.assertEqual(1, code)
        self.assertEqual(123, report['totalFindings'])
        self.assertEqual(23, report['truncatedFindings'])
        self.assertTrue(report['findingsTruncated'])
        self.assertEqual(['[redacted-path]'] * len(unsafe), [row['file'] for row in report['findings'][:len(unsafe)]])
        self.assertEqual(20, stdout.count('::error '))
        historical = next(line for line in stdout.splitlines() if 'a'*40 in line)
        self.assertNotIn('file=', historical)
        self.assertIn('file=src/settings.py,line=7,', stdout)
        for text in (json.dumps(report), stdout, markdown, summary_path.read_text()):
            self.assertNotIn(marker, text)
            self.assertNotIn('title=forged', text)
            self.assertNotIn('private-author@example.invalid', text)

    def test_error_and_inconsistent_reports_fail_closed_without_raw_logs(self):
        private = 'private-error-text-that-must-never-be-published'
        valid = {'total': 1, 'findings': [self.row()]}
        cases = [
            {'code': 2, 'stderr': private}, {'code': 1, 'report': valid, 'stderr': private},
            {'code': 1}, {'code': 0, 'report': valid}, {'code': 1, 'raw': private},
            {'code': 1, 'report': {'total': 1, 'findings': [{**self.row(), 'Secret': private}]}},
            {'code': 1, 'report': {'total': 1, 'findings': [self.row(line=True)]}},
            {'code': 1, 'report': {'total': 1, 'findings': [self.row(commit=private)]}},
            {'code': 1, 'raw': '{"total":0,"total":1,"findings":[]}'},
            {'code': 1, 'report': {'total': 2, 'findings': [self.row()]}},
            {'code': 0, 'raw': ''}, {'version': '0.0.0'},
        ]
        for settings in cases:
            with self.subTest(case=list(settings)):
                self.configure(**settings)
                code, report, stdout, markdown = self.run_scan()
                self.assertEqual(2, code)
                self.assertEqual('error', report['status'])
                self.assertFalse(report['historyScanCompleted'])
                self.assertIsNone(report['totalFindings'])
                self.assertEqual([], report['findings'])
                self.assertNotIn(private, json.dumps(report) + stdout + markdown)

    def test_timeout_and_output_cap_are_errors(self):
        self.configure(sleep=2)
        with patch.object(scanner, 'PROCESS_TIMEOUT', .05):
            code, report, _, _ = self.run_scan()
        self.assertEqual((2, 'PROCESS_TIMEOUT'), (code, report['error']))
        self.configure(raw='x' * (scanner.MAX_CAPTURE_BYTES + 1))
        code, report, _, _ = self.run_scan()
        self.assertEqual((2, 'PROCESS_OUTPUT_LIMIT'), (code, report['error']))

    def test_missing_binary_shallow_history_and_unsafe_outputs_are_not_clean(self):
        self.binary.unlink()
        code, report, _, _ = self.run_scan()
        self.assertEqual((2, 'error'), (code, report['status']))
        outside = self.root / 'outside'
        outside.write_text('preserve')
        output = self.root / 'unsafe'
        output.mkdir()
        (output / 'report.json').symlink_to(outside)
        with self.assertRaises(OSError):
            scanner.publish(report, output)
        self.assertEqual('preserve', outside.read_text())
        clone = self.root / 'shallow'
        subprocess.run(['git', 'clone', '-q', '--depth=1', self.repository.as_uri(), str(clone)], check=True, capture_output=True)
        real = REAL_GITLEAKS
        if real.is_file():
            report, code = scanner.scan(clone, real, self.config)
            self.assertEqual((2, 'GIT_HISTORY_SHALLOW'), (code, report['error']))

    @unittest.skipUnless(REAL_GITLEAKS.is_file(), 'optional caller-verified Gitleaks 8.30.1 binary unavailable')
    def test_real_binary_scans_deleted_history_ignores_candidate_allowlists_and_never_runs_diff_helpers(self):
        marker = 'gh' + 'p_' + secrets.token_hex(18)
        (self.repository / 'credential.txt').write_text('token = "' + marker + '" # gitleaks:allow\n')
        (self.repository / 'hidden.txt').write_text('token = "' + marker + '"\n')
        (self.repository / '.gitleaks.toml').write_text('[allowlist]\nregexes = [".*"]\n')
        (self.repository / '.gitattributes').write_text('*.txt diff=untrusted\nhidden.txt -diff\n')
        git(self.repository, 'add', '.')
        git(self.repository, 'commit', '-qm', 'private historical message')
        secret_commit = git(self.repository, 'rev-parse', 'HEAD')
        (self.repository / '.gitleaksignore').write_text(secret_commit + ':credential.txt:github-pat:1\n')
        git(self.repository, 'rm', '-q', 'credential.txt', 'hidden.txt')
        git(self.repository, 'commit', '-qm', 'remove fixture')
        invoked = self.root / 'helper-invoked'
        helper = self.repository / 'untrusted-helper'
        helper.write_text('#!/bin/sh\ntouch ' + str(invoked) + '\n')
        helper.chmod(0o700)
        git(self.repository, 'config', 'diff.external', str(helper))
        git(self.repository, 'config', 'diff.untrusted.textconv', str(helper))
        report, code = scanner.scan(self.repository, REAL_GITLEAKS, self.config)
        self.assertEqual(1, code, report)
        self.assertEqual(3, report['reachableCommitCount'])
        self.assertTrue(any(row['commit'] == secret_commit for row in report['findings']))
        self.assertTrue(any(row['file'] == 'hidden.txt' and row['commit'] == secret_commit for row in report['findings']))
        self.assertFalse(invoked.exists())
        output = self.root / 'real-result'
        scanner.publish(report, output)
        for path in output.iterdir():
            text = path.read_text()
            for value in (marker, 'private-author@example.invalid', 'Private fixture author', 'private historical message'):
                self.assertNotIn(value, text)


if __name__ == '__main__':
    unittest.main()
