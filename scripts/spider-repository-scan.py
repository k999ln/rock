#!/usr/bin/env python3
"""Run a caller-verified Gitleaks binary; publish only bounded, safe metadata."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time

VERSION = '8.30.1'
MAX_FINDINGS = 100
MAX_ANNOTATIONS = 20
MAX_CAPTURE_BYTES = 256 * 1024
PROCESS_TIMEOUT = 210
SHA = re.compile(r'(?:[0-9a-f]{40}|[0-9a-f]{64})\Z')
PATH = re.compile(r'[A-Za-z0-9._/-]{1,240}\Z')
RULE = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}\Z')
CREDENTIAL = re.compile(
    r'(?:gh[pousr]_|github_pat_|glpat[-_]|xox[baprs]-|sk[-_]|AKIA|ASIA)[A-Za-z0-9_-]{8,}'
    r'|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'
    r'|[A-Za-z0-9_-]{48,}', re.IGNORECASE)
LIMITATIONS = [
    'Gitleaks text-pattern inspection of all commits reachable from the resolved HEAD; not other refs or uncommitted files.',
    'Binary content and archive contents are not covered; archive traversal is disabled and decoding is limited to depth 2.',
    'Detection is not proof of a valid credential; no findings does not establish safety or cover all vulnerabilities.',
    'Counts are historical pattern matches and can repeat across commits or merges; they are not unique credentials.',
    'This check does not intercept a running program or provide continuous runtime protection.',
]
# No Secret, Match, Line, Author, Email, Message, or Fingerprint is serialized.
# stdout keeps even hostile filenames out of intermediate report files.
REPORT_TEMPLATE = '''{"total":{{len .}},"findings":[{{range $i, $f := .}}{{if lt $i 100}}{{if $i}},{{end}}{"rule":{{printf "%q" $f.RuleID}},"file":{{if le (len $f.File) 240}}{{printf "%q" $f.File}}{{else}}"[redacted-path]"{{end}},"line":{{$f.StartLine}},"commit":{{printf "%q" $f.Commit}}}{{end}}{{end}}]}'''


class ScanError(Exception):
    """Only a constant code may cross the public error boundary."""


def _stop(process):
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait()


def _capture(command, *, cwd, env, timeout):
    """Bound time and in-memory stdout/stderr; never spool either to disk."""
    try:
        process = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   start_new_session=True)
    except OSError:
        raise ScanError('PROCESS_START_FAILED') from None
    buffers = [bytearray(), bytearray()]
    deadline = time.monotonic() + timeout
    try:
        with selectors.DefaultSelector() as selector:
            for index, stream in enumerate((process.stdout, process.stderr)):
                selector.register(stream, selectors.EVENT_READ, index)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise ScanError('PROCESS_TIMEOUT')
                for key, _ in selector.select(min(remaining, .2)):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    buffers[key.data].extend(chunk)
                    if len(buffers[key.data]) > MAX_CAPTURE_BYTES:
                        raise ScanError('PROCESS_OUTPUT_LIMIT')
            try:
                code = process.wait(timeout=max(.01, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                raise ScanError('PROCESS_TIMEOUT') from None
        return code, bytes(buffers[0]), bytes(buffers[1])
    finally:
        _stop(process)
        process.stdout.close()
        process.stderr.close()


def _environment(directory, git):
    # In particular, inherit no GITLEAKS_*, GIT_*, tokens, proxy or loader options.
    env = {'PATH': str(git.parent) + os.pathsep + os.defpath, 'HOME': str(directory),
           'TMPDIR': str(directory), 'LANG': 'C', 'LC_ALL': 'C', 'NO_COLOR': '1',
           'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull,
           'GIT_NO_REPLACE_OBJECTS': '1', 'GIT_TERMINAL_PROMPT': '0',
           'GIT_PAGER': 'cat'}
    forced = {'core.hooksPath': os.devnull, 'core.fsmonitor': 'false',
              'log.showSignature': 'false', 'core.attributesFile': os.devnull}
    env['GIT_CONFIG_COUNT'] = str(len(forced))
    for index, (key, value) in enumerate(forced.items()):
        env[f'GIT_CONFIG_KEY_{index}'] = key
        env[f'GIT_CONFIG_VALUE_{index}'] = value
    return env


def _git(git, repository, directory, env, *arguments):
    code, out, err = _capture([str(git), '-C', str(repository), *arguments],
                              cwd=directory, env=env, timeout=15)
    if code or err.strip():
        raise ScanError('GIT_METADATA_FAILED')
    try:
        return out.decode('ascii').strip()
    except UnicodeError:
        raise ScanError('GIT_METADATA_INVALID') from None


def _public_path(value):
    if (not PATH.fullmatch(value) or value.startswith('/')
            or any(part in ('', '.', '..') for part in value.split('/'))
            or CREDENTIAL.search(value)):
        return '[redacted-path]'
    return value


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate key')
        result[key] = value
    return result


def _parse_report(raw, returncode):
    try:
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=_unique_object,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        if type(value) is not dict or set(value) != {'total', 'findings'}:
            raise ValueError()
        total, rows = value['total'], value['findings']
        if (type(total) is not int or not 0 <= total <= 1_000_000_000
                or type(rows) is not list or len(rows) != min(total, MAX_FINDINGS)
                or (returncode == 0) != (total == 0)):
            raise ValueError()
        result = []
        for row in rows:
            if (type(row) is not dict or set(row) != {'rule', 'file', 'line', 'commit'}
                    or any(type(row[key]) is not str for key in ('rule', 'file', 'commit'))
                    or type(row['line']) is not int or not 1 <= row['line'] <= 2**31 - 1
                    or not SHA.fullmatch(row['commit'])):
                raise ValueError()
            result.append({'rule': row['rule'] if RULE.fullmatch(row['rule']) and not CREDENTIAL.search(row['rule']) else '[redacted-rule]',
                           'file': _public_path(row['file']), 'line': row['line'],
                           'commit': row['commit']})
        return total, result
    except (ValueError, UnicodeError, RecursionError):
        raise ScanError('SCANNER_REPORT_INVALID') from None


def scan(repository, gitleaks, config):
    report = {'schemaVersion': 1, 'scanner': 'SPIDER / Gitleaks', 'scannerVersion': VERSION,
              'status': 'error', 'targetHead': None, 'reachableCommitCount': None,
              'historyScanCompleted': False, 'maxDecodeDepth': 2, 'maxArchiveDepth': 0,
              'totalFindings': None, 'findings': [], 'findingsTruncated': False,
              'truncatedFindings': 0, 'limitations': LIMITATIONS}
    try:
        repository, gitleaks, config = (Path(path).resolve(strict=True) for path in (repository, gitleaks, config))
        git = Path(shutil.which('git') or '').resolve(strict=True)
        if not repository.is_dir() or not gitleaks.is_file() or not config.is_file() or git.is_relative_to(repository):
            raise ScanError('INPUT_PATH_INVALID')
        if config.stat().st_size > 1024 * 1024:
            raise ScanError('CONFIG_TOO_LARGE')
        report['configSha256'] = hashlib.sha256(config.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory(prefix='spider-scan-') as temporary:
            directory = Path(temporary)
            env = _environment(directory, git)
            code, version, err = _capture([str(gitleaks), 'version'], cwd=directory, env=env, timeout=15)
            if code or err.strip() or version.strip() != VERSION.encode():
                raise ScanError('SCANNER_VERSION_INVALID')
            head = _git(git, repository, directory, env, 'rev-parse', '--verify', 'HEAD^{commit}')
            if not SHA.fullmatch(head):
                raise ScanError('GIT_HEAD_INVALID')
            report['targetHead'] = head
            if _git(git, repository, directory, env, 'rev-parse', '--is-shallow-repository') != 'false':
                raise ScanError('GIT_HISTORY_SHALLOW')
            count = _git(git, repository, directory, env, 'rev-list', '--count', head)
            if not count.isdecimal() or not 1 <= int(count) <= 1_000_000_000:
                raise ScanError('GIT_COUNT_INVALID')
            report['reachableCommitCount'] = int(count)
            template = directory / 'metadata.tmpl'
            template.write_text(REPORT_TEMPLATE, encoding='utf-8')
            ignore = directory / 'empty-ignore'
            ignore.write_bytes(b'')
            command = [str(gitleaks), 'git', str(repository), '--config', str(config),
                       '--gitleaks-ignore-path', str(ignore), '--ignore-gitleaks-allow',
                       '--redact=100', '--log-level=error', '--no-banner', '--no-color',
                       '--max-decode-depth=2', '--max-archive-depth=0', '--timeout=180',
                       '--exit-code=1', '--report-format=template', '--report-template', str(template),
                       '--report-path=-',
                       '--log-opts=--full-history --text --no-ext-diff --no-textconv --no-renames -m --format=medium ' + head]
            code, out, err = _capture(command, cwd=directory, env=env, timeout=PROCESS_TIMEOUT)
            # Gitleaks also uses exit 1 for errors. Even a partial valid report
            # cannot establish complete coverage when an error was logged.
            if code not in (0, 1) or err.strip():
                raise ScanError('SCANNER_FAILED')
            total, findings = _parse_report(out, code)
            report.update(status='findings' if total else 'clean', historyScanCompleted=True,
                          totalFindings=total, findings=findings,
                          findingsTruncated=total > len(findings), truncatedFindings=total-len(findings))
            return report, code
    except ScanError as error:
        report['error'] = str(error)
    except (OSError, ValueError, OverflowError):
        report['error'] = 'INSPECTION_UNAVAILABLE'
    return report, 2


def summary(report):
    lines = ['# SPIDER repository inspection', '',
             f"Status: **{report['status']}**", '',
             f"Target HEAD: `{report['targetHead'] or 'unavailable'}`",
             f"Reachable commits: {report['reachableCommitCount'] if report['reachableCommitCount'] is not None else 'unavailable'}",
             f"Gitleaks version: `{VERSION}`; full HEAD-reachable history, decode depth 2, archive depth 0.", '']
    if report['status'] == 'error':
        lines += [f"Inspection incomplete: `{report['error']}`. No clean result is asserted.", '']
    else:
        lines += [f"Candidates: **{report['totalFindings']}**; shown: {len(report['findings'])}; omitted: {report['truncatedFindings']}.", '']
    if report['findings']:
        lines += ['| Rule | File | Line | Commit |', '| --- | --- | --- | --- |']
        lines += [f"| `{row['rule']}` | `{row['file']}` | {row['line']} | `{row['commit']}` |" for row in report['findings']]
        lines += ['', 'Review candidates privately. If a credential is real, revoke/rotate it; deleting the current file does not remove historical exposure.', '']
    lines += ['Coverage limitations:', '', *['- ' + item for item in LIMITATIONS], '']
    return '\n'.join(lines)


def _safe_write(path, text, *, append=False):
    flags = os.O_WRONLY | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0) | os.O_NONBLOCK
    descriptor = os.open(path, flags, 0o600)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise OSError('unsafe output')
        if append:
            os.lseek(descriptor, 0, os.SEEK_END)
        else:
            os.ftruncate(descriptor, 0)
        with os.fdopen(descriptor, 'w', encoding='utf-8', closefd=False) as stream:
            stream.write(text)
    finally:
        os.close(descriptor)


def publish(report, output):
    output = Path(os.path.abspath(output))
    if any(path.is_symlink() for path in (output, *output.parents)):
        raise OSError('unsafe output')
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    markdown = summary(report)
    _safe_write(output / 'report.json', json.dumps(report, indent=2, ensure_ascii=True) + '\n')
    _safe_write(output / 'summary.md', markdown)
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            _safe_write(os.environ['GITHUB_STEP_SUMMARY'], markdown, append=True)
        if report['status'] == 'error':
            print(f"::error title=SPIDER inspection incomplete::{report['error']}; no clean result is asserted.")
        for row in report['findings'][:MAX_ANNOTATIONS]:
            current = row['commit'] == report['targetHead'] and row['file'] != '[redacted-path]'
            location = f"file={row['file']},line={row['line']}," if current else ''
            print(f"::error {location}title=SPIDER secret candidate::{row['rule']} candidate at {row['file']}:{row['line']} in commit {row['commit']}; review the metadata report.")


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ScanError('ARGUMENTS_INVALID')


def main(argv=None):
    parser = Parser(description=__doc__)
    for name in ('repository', 'gitleaks', 'config', 'output'):
        parser.add_argument('--' + name, required=True)
    try:
        args = parser.parse_args(argv)
    except ScanError:
        print('SPIDER error: ARGUMENTS_INVALID')
        return 2
    report, code = scan(args.repository, args.gitleaks, args.config)
    try:
        publish(report, args.output)
    except (OSError, ValueError):
        print('SPIDER error: REPORT_WRITE_FAILED')
        return 2
    print('SPIDER ' + report['status'] + ': ' + (str(report['totalFindings']) + ' candidates' if code != 2 else report['error']))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
