"""Actual static inspector: bounded metadata, no execution or source retention."""
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os/platform'))
spec = importlib.util.spec_from_file_location('native_code_inspector_test', ROOT / 'os/platform/code_inspector.py')
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


class CodeInspectorTests(unittest.TestCase):
    def test_secret_personal_metadata_lines_without_values(self):
        source = '# 見出し\r\nAPI_KEY="synthetic-private-value"\r\ncontact="person@example.test"'
        report = inspector.inspect_code(source, 'python')
        self.assertEqual('needs_review', report['state'])
        self.assertEqual({'total': 2, 'secret': 1, 'personal': 1, 'code': 0}, report['counts'])
        self.assertEqual([2, 3], [finding['line'] for finding in report['findings']])
        self.assertEqual([2, 3], [finding['endLine'] for finding in report['findings']])
        self.assertNotIn('synthetic-private-value', json.dumps(report))
        self.assertNotIn('person@example.test', json.dumps(report))
        self.assertNotIn('source', report)
        self.assertTrue(all(set(item) == {'id', 'rule', 'kind', 'severity', 'line', 'endLine', 'title', 'why', 'remediation'} for item in report['findings']))

    def test_python_ast_calls_aliases_and_multiline_locations(self):
        source = ('import subprocess as sp\nimport requests as rq\n'
                  'eval(user_input)\nsp.run(\n user_command,\n shell=True\n)\n'
                  'rq.get(url, verify=False)\n')
        report = inspector.inspect_code(source, 'python')
        self.assertEqual(['dynamic_eval', 'shell_execution', 'tls_verification_disabled'], [item['rule'] for item in report['findings']])
        self.assertEqual((4, 7), (report['findings'][1]['line'], report['findings'][1]['endLine']))
        self.assertTrue(all('要確認' in item['title'] for item in report['findings']))
        clean = '# eval(user_input)\nmessage = "exec(user_input)"\nsubprocess.run(["echo", "hello"], shell=False)\nrequests.get(url, verify=True)'
        self.assertEqual('no_findings', inspector.inspect_code(clean, 'python')['state'])
        self.assertEqual('no_findings', inspector.inspect_code('API_KEY = os.getenv("KEY")\npassword = os.environ.get("PASS")', 'python')['state'])
        self.assertEqual('needs_review', inspector.inspect_code('API_KEY = "os.getenv(quoted_value)"', 'python')['state'])

    def test_javascript_masks_literals_comments_and_checks_four_families(self):
        source = ('// eval(data)\nconst label = "document.write(data)";\n'
                  'const pattern = /eval\\(value\\)/;\n/* child_process.exec(cmd) */\n'
                  'eval(userInput);\nchild_process.exec(command);\n'
                  'node.innerHTML = response;\nconst options = {rejectUnauthorized: false};')
        report = inspector.inspect_code(source, 'javascript')
        self.assertEqual(['dynamic_eval', 'shell_execution', 'unsafe_html', 'tls_verification_disabled'], [item['rule'] for item in report['findings']])
        self.assertEqual([5, 6, 7, 8], [item['line'] for item in report['findings']])
        self.assertFalse(report['coverageLimited'])
        self.assertEqual('no_findings', inspector.inspect_code('function eval(value) { return value; }', 'javascript')['state'])
        self.assertEqual('no_findings', inspector.inspect_code('const x: string = "public"; node.textContent = x;', 'javascript')['state'])

    def test_parse_failure_and_omitted_template_are_explicit_incomplete(self):
        for language, source in [('python', 'def broken(:'), ('javascript', 'const result = `${eval(data)}`;'),
                                 ('javascript', '/* unclosed'), ('javascript', 'const message = "unclosed')]:
            with self.subTest(language=language, source=source):
                report = inspector.inspect_code(source, language)
                self.assertEqual('incomplete', report['state'])
                self.assertTrue(report['coverageLimited'])
                self.assertEqual(0, report['counts']['total'])
                self.assertNotIn(source, json.dumps(report))

    def test_empty_and_text_scope_do_not_claim_code_safety(self):
        self.assertEqual('empty', inspector.inspect_code(' \n\t', 'python')['state'])
        report = inspector.inspect_code('eval(user_input)', 'text')
        self.assertEqual('no_findings', report['state'])
        self.assertFalse(report['coverageLimited'])
        self.assertTrue(any('コードの危険な処理は検査しません' in item for item in report['limitations']))
        self.assertTrue(any('安全の保証ではありません' in item for item in report['limitations']))

    def test_input_limits_invalid_encoding_and_constant_errors(self):
        for source, language in [(None, 'python'), ('print(1)', 'ruby'), ('\ud800', 'text'), ('x', [])]:
            with self.assertRaisesRegex(ValueError, '^CODE_INSPECTION_INVALID_INPUT$'):
                inspector.inspect_code(source, language)
        for source in ('x' * (inspector.MAX_SOURCE_BYTES + 1), '界' * 21846, '\n' * 2000):
            with self.assertRaisesRegex(ValueError, '^CODE_INSPECTION_TOO_LARGE$'):
                inspector.inspect_code(source, 'text')
        self.assertEqual('no_findings', inspector.inspect_code('x' * inspector.MAX_SOURCE_BYTES, 'text')['state'])
        self.assertEqual('empty', inspector.inspect_code('\n' * 1999, 'text')['state'])

    def test_truncation_and_sensitive_detector_failure_never_look_complete(self):
        report = inspector.inspect_code('eval(value);\n' * 110, 'javascript')
        self.assertEqual(100, report['counts']['total'])
        self.assertEqual(100, len(report['findings']))
        self.assertTrue(report['coverageLimited'])
        self.assertEqual('needs_review', report['state'])
        for source, language in [('a@b.co ' * 2001, 'text'), (';'.join('x=1' for _ in range(6000)), 'python')]:
            limited = inspector.inspect_code(source, language)
            self.assertEqual('incomplete', limited['state'])
            self.assertTrue(limited['coverageLimited'])
        with patch.object(inspector, 'inspect_text', side_effect=ValueError('private parser detail')):
            report = inspector.inspect_code('A public note', 'text')
        self.assertEqual('incomplete', report['state'])
        self.assertTrue(report['coverageLimited'])
        self.assertNotIn('private parser detail', json.dumps(report))

    def test_supplied_code_never_executes_imports_connects_or_persists(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'must-not-exist.txt'
            source = 'import missing_private_module\nopen(' + repr(str(marker)) + ', "w").write("private value")\n'
            with patch.object(socket.socket, 'connect', side_effect=AssertionError('network forbidden')) as network, patch.object(subprocess, 'run', side_effect=AssertionError('process forbidden')) as process:
                report = inspector.inspect_code(source, 'python')
            network.assert_not_called()
            process.assert_not_called()
            self.assertFalse(marker.exists())
            self.assertNotIn(str(marker), json.dumps(report))
            self.assertNotIn('missing_private_module', sys.modules)

    def test_late_secret_survives_personal_and_code_result_caps(self):
        for prefix in ('"early@example.test";\n' * 110, 'eval(user_input);\n' * 110):
            with self.subTest(kind='personal' if '@' in prefix else 'code'):
                report = inspector.inspect_code(prefix + 'const API_KEY = "late-synthetic-value";', 'javascript')
                self.assertEqual(100, report['counts']['total'])
                self.assertEqual(1, report['counts']['secret'])
                self.assertEqual('secret', report['findings'][0]['kind'])
                self.assertEqual(111, report['findings'][0]['line'])
                self.assertTrue(report['coverageLimited'])
                self.assertNotIn('late-synthetic-value', json.dumps(report))


if __name__ == '__main__':
    unittest.main()
