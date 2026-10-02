"""Deterministic native data guard and application-owned plaintext watcher.

No network, shell execution, raw-value persistence, SQLite byte scanning or
caller-selected IPC paths. Inspection is heuristic, never a safety certificate.
"""
from __future__ import annotations

import copy
import hashlib
import math
import os
from pathlib import Path
import re
import stat
import threading
import time

MAX_TEXT_LENGTH = 256_000
MAX_FINDINGS = 2_000
MAX_NODES = 10_000
MAX_DEPTH = 20
MAX_FILES = 5_000
MAX_TOTAL_BYTES = 16 * 1024 * 1024
MAX_FILE_BYTES = MAX_TEXT_LENGTH * 4
MAX_REPORT_FINDINGS = 300
MASK = '[機密情報を非表示]'
TEXT_EXTENSIONS = frozenset({'.json', '.txt', '.md', '.csv', '.env'})


class SensitiveDataBlockedError(ValueError):
    def __init__(self, count=0, kinds=()):
        super().__init__('SENSITIVE_DATA_BLOCKED')
        self.count = count
        self.kinds = sorted(set(kinds) & {'secret', 'personal'})


def _secret_label(key):
    name = re.sub(r'[^a-z0-9]', '', key.lower())
    if name.endswith('apikey'):
        return 'APIキー'
    if name.endswith('token') or name == 'authorization':
        return 'アクセストークン'
    if re.search(r'(?:password|passwd|pwd)$', name):
        return 'パスワード'
    if name.endswith('privatekey'):
        return '秘密鍵'
    if re.search(r'(?:secret|secretkey|secretaccesskey)$', name):
        return 'シークレット'
    return None


def _luhn(value):
    digits = re.sub(r'\D', '', value)
    if not 13 <= len(digits) <= 19 or len(set(digits)) == 1:
        return False
    total = 0
    for index, char in enumerate(reversed(digits)):
        digit = int(char)
        if index % 2:
            digit = digit * 2 - 9 if digit * 2 > 9 else digit * 2
        total += digit
    return total % 10 == 0


_ASSIGNMENT = re.compile(
    r'''\b([A-Za-z_][A-Za-z0-9_.-]{0,100})["']?[ \t]*[:=][ \t]*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`|([^\s,;#}"'`]+))''')
_PEM = re.compile(r'-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|$)')
_TOKENS = tuple(re.compile(pattern, flags) for pattern, flags in (
    (r'\bgh[pousr]_[A-Za-z0-9]{20,255}\b', 0),
    (r'\bgithub_pat_[A-Za-z0-9_]{30,255}\b', 0),
    (r'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,512}\b', 0),
    (r'\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,255}\b', 0),
    (r'\bxox[baprs]-[A-Za-z0-9-]{15,255}\b', 0),
    (r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b', 0),
    (r'\beyJ[A-Za-z0-9_-]{8,1024}\.[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{10,1024}\b', 0),
    (r'\bBearer[ \t]+[A-Za-z0-9_.~+/-]{16,1024}={0,2}', re.I),
    (r'''\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s:@/]{1,100}:[^\s@/]{1,500}@[^\s"']+''', re.I),
))
_EMAIL = re.compile(r"[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+", re.I)
_EMAIL_PREFIX = re.compile(r"[A-Z0-9.!#$%&'*+/=?^_`{|}~-]", re.I)
_NUMBERS = re.compile(r'\+?[0-9](?:[0-9 -]*[0-9])?')


def inspect_text(text):
    """Return metadata only. Offsets are Python character indexes, never bytes."""
    if type(text) is not str or len(text) > MAX_TEXT_LENGTH:
        raise SensitiveDataBlockedError()
    candidates = []

    def add(start, end, kind, label, severity, priority):
        if len(candidates) >= MAX_FINDINGS:
            raise SensitiveDataBlockedError()
        candidates.append({'start': start, 'end': end, 'kind': kind,
                           'label': label, 'severity': severity, '_priority': priority})

    for match in _PEM.finditer(text):
        add(*match.span(), 'secret', '秘密鍵', 'critical', 100)
    for match in _ASSIGNMENT.finditer(text):
        label = _secret_label(match[1])
        if not label:
            continue
        group = next(index for index in range(2, 6) if match[index] is not None)
        value = match[group]
        if not value or value == MASK:
            continue
        if group == 5 and re.match(r'(?:process\.env\.|import\.meta\.env\.|os\.environ|undefined$|null$|[A-Za-z_$][\w$]*\()', value):
            continue
        add(*match.span(group), 'secret', label, 'critical', 90)
    for pattern in _TOKENS:
        for match in pattern.finditer(text):
            add(*match.span(), 'secret', '認証トークン候補', 'critical', 80)
    for match in _EMAIL.finditer(text):
        if match.start() and _EMAIL_PREFIX.match(text[match.start() - 1]):
            continue
        add(*match.span(), 'personal', 'メールアドレス', 'medium', 40)
    for match in _NUMBERS.finditer(text):
        start, end = match.span()
        if (start and re.match(r'\w', text[start - 1])) or (end < len(text) and re.match(r'\w', text[end])):
            continue
        digits = re.sub(r'\D', '', match[0])
        if not match[0].startswith('+') and _luhn(match[0]):
            add(start, end, 'personal', 'カード番号候補', 'high', 60)
        elif re.fullmatch(r'0[1-9][0-9]{8,9}', digits) or (match[0].startswith('+81') and re.fullmatch(r'81[1-9][0-9]{8,9}', digits)):
            add(start, end, 'personal', '電話番号候補', 'high', 50)
    candidates.sort(key=lambda item: (-item['_priority'], item['start'], -item['end']))
    accepted = []
    for item in candidates:
        if not any(item['start'] < other['end'] and other['start'] < item['end'] for other in accepted):
            accepted.append(item)
    for item in accepted:
        item.pop('_priority')
    return sorted(accepted, key=lambda item: item['start'])


def assert_safe_outbound(value):
    """Inspect only JSON-like payload data; transport credentials stay separate."""
    characters = nodes = count = 0
    kinds, ancestors = set(), set()

    def inspect(text):
        nonlocal characters, count
        characters += len(text)
        if characters > MAX_TEXT_LENGTH:
            raise SensitiveDataBlockedError()
        findings = inspect_text(text)
        count += len(findings)
        kinds.update(item['kind'] for item in findings)
        if count > MAX_FINDINGS:
            raise SensitiveDataBlockedError(count, kinds)

    def visit(item, depth):
        nonlocal nodes, count
        nodes += 1
        if nodes > MAX_NODES or depth > MAX_DEPTH:
            raise SensitiveDataBlockedError()
        if type(item) is str:
            inspect(item)
        elif item is None or type(item) is bool:
            return
        elif type(item) in (int, float):
            if isinstance(item, float) and not math.isfinite(item):
                raise SensitiveDataBlockedError()
            try:
                number = str(item)
            except ValueError:
                raise SensitiveDataBlockedError() from None
            inspect(number)
        elif type(item) in (dict, list):
            if id(item) in ancestors:
                raise SensitiveDataBlockedError()
            ancestors.add(id(item))
            if type(item) is dict:
                for key, entry in item.items():
                    if type(key) is not str:
                        raise SensitiveDataBlockedError()
                    inspect(key)
                    if _secret_label(key) and entry is not None and entry != '' and entry != MASK:
                        count += 1
                        kinds.add('secret')
                    visit(entry, depth + 1)
            else:
                for entry in item:
                    visit(entry, depth + 1)
            ancestors.remove(id(item))
        else:
            raise SensitiveDataBlockedError()

    visit(value, 0)
    if count:
        raise SensitiveDataBlockedError(count, kinds)
    return True


def _display_path(value):
    """File names can contain secrets too; never expose those matches in status."""
    try:
        findings = inspect_text(value)
    except ValueError:
        return '[path hidden]'
    cursor, output = 0, []
    for finding in findings:
        output.extend((value[cursor:finding['start']], MASK))
        cursor = finding['end']
    output.append(value[cursor:])
    return re.sub(r'[\x00-\x1f\x7f]', '?', ''.join(output))[:400]


class SensitiveGuard:
    """A bounded background watcher of one explicitly configured platform dir.

    Periodic results are advisory inventory. Every outbound inspection is
    synchronous and fail-closed, independent of worker availability.
    """
    def __init__(self, data_dir, interval=30):
        if type(interval) not in (int, float) or not math.isfinite(interval) or not 0.02 <= interval <= 3600:
            raise ValueError('SPIDER_INTERVAL_INVALID')
        self.data_dir = Path(data_dir).absolute()
        self.interval = interval
        self._lock = threading.RLock()
        self._scan_lock = threading.Lock()
        self._stopping = threading.Event()
        self.thread = None
        self._last_success_monotonic = None
        self._report = {
            'schemaVersion': 1, 'status': 'starting', 'scope': 'platform-data',
            'intervalSeconds': interval, 'lastScanAt': None, 'nextScanAt': None,
            'filesScanned': 0, 'candidateCount': 0, 'secretCount': 0, 'personalCount': 0,
            'findings': [], 'findingsTruncated': False, 'coverageLimited': True,
            'skipped': {}, 'inspections': 0, 'blocked': 0, 'events': [],
        }

    def _event(self, boundary, action, count=0, kinds=()):
        boundary = boundary if type(boundary) is str and re.fullmatch(r'[A-Za-z0-9_.:-]{1,80}', boundary) else 'unclassified'
        if inspect_text(boundary):
            boundary = 'unclassified'
        self._report['events'].insert(0, {'time': time.time(), 'boundary': boundary,
                                             'action': action, 'count': count,
                                             'kinds': sorted(set(kinds) & {'secret', 'personal'})})
        del self._report['events'][30:]

    def inspect(self, value, boundary):
        try:
            assert_safe_outbound(value)
        except ValueError as error:
            with self._lock:
                self._report['inspections'] += 1
                self._report['blocked'] += 1
                self._event(boundary, 'blocked', getattr(error, 'count', 0), getattr(error, 'kinds', ()))
            raise ValueError('SENSITIVE_DATA_BLOCKED') from None
        with self._lock:
            self._report['inspections'] += 1
        return True

    def status(self):
        with self._lock:
            result = copy.deepcopy(self._report)
            alive = bool(self.thread is not None and self.thread.is_alive() and not self._stopping.is_set())
            age = (max(0, time.monotonic() - self._last_success_monotonic)
                   if self._last_success_monotonic is not None else None)
            result.update(workerAlive=alive, lastScanAgeSeconds=age,
                          fresh=bool(alive and age is not None and age <= max(3 * self.interval, 90)
                                     and result['status'] in {'watching', 'scanning'}))
            return result

    def start(self):
        with self._lock:
            if self._stopping.is_set():
                raise ValueError('SPIDER_GUARD_CLOSED')
            if self.thread is not None and self.thread.is_alive():
                return
            self._scan()
            self.thread = threading.Thread(target=self._loop, name='rock-sensitive-guard', daemon=True)
            self.thread.start()

    def close(self):
        self._stopping.set()
        thread = self.thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=10)
            if thread.is_alive():
                raise RuntimeError('SPIDER_STOP_TIMEOUT')
        with self._lock:
            self._report.update(status='stopped', nextScanAt=None)

    def _loop(self):
        while not self._stopping.wait(self.interval):
            self._scan()

    def _scan(self):
        with self._scan_lock:
            with self._lock:
                self._report['status'] = 'scanning'
            try:
                result = self._scan_files()
            except Exception:
                with self._lock:
                    self._report.update(status='error', coverageLimited=True,
                                        nextScanAt=time.time() + self.interval)
                    self._event('platform-data', 'scan-failed')
                return
            with self._lock:
                self._last_success_monotonic = time.monotonic()
                previous = [(item['id']) for item in self._report['findings']]
                current = [(item['id']) for item in result['findings']]
                if self._report['lastScanAt'] is None or previous != current or self._report['candidateCount'] != result['candidateCount']:
                    self._event('platform-data', 'scan-updated', result['candidateCount'])
                self._report.update(result, status='watching', lastScanAt=time.time(), nextScanAt=time.time() + self.interval)

    def _scan_files(self):
        skipped = dict(excluded=0, symlink=0, unreadable=0, oversize=0, binary=0, unstable=0, limits=0)
        findings, counts = [], {'secret': 0, 'personal': 0}
        visited = scanned = total_bytes = 0
        root_fd = None
        flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
        try:
            # O_NOFOLLOW plus descriptor-relative descent prevents symlink swaps
            # of any child directory from moving reads outside this root.
            root_fd = os.open(str(self.data_dir), flags | os.O_DIRECTORY)
            root_stat = os.fstat(root_fd)
            if root_stat.st_uid != os.geteuid():
                raise ValueError('SPIDER_ROOT_OWNER_MISMATCH')

            def walk(directory_fd, relative='', depth=0):
                nonlocal visited, scanned, total_bytes
                if depth > MAX_DEPTH:
                    skipped['limits'] += 1
                    return
                try:
                    with os.scandir(directory_fd) as entries:
                        names = []
                        for entry in entries:
                            if len(names) + visited >= MAX_FILES:
                                skipped['limits'] += 1
                                break
                            names.append(entry.name)
                except OSError:
                    skipped['unreadable'] += 1
                    return
                for name in sorted(names):
                    if self._stopping.is_set():
                        return
                    if visited >= MAX_FILES or total_bytes >= MAX_TOTAL_BYTES:
                        skipped['limits'] += 1
                        return
                    visited += 1
                    child_fd = None
                    path = relative + '/' + name if relative else name
                    try:
                        metadata = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
                        if stat.S_ISLNK(metadata.st_mode):
                            skipped['symlink'] += 1
                            continue
                        if stat.S_ISDIR(metadata.st_mode):
                            child_fd = os.open(name, flags | os.O_DIRECTORY, dir_fd=directory_fd)
                            if os.fstat(child_fd).st_uid != os.geteuid():
                                skipped['excluded'] += 1
                                continue
                            walk(child_fd, path, depth + 1)
                            continue
                        if not stat.S_ISREG(metadata.st_mode):
                            skipped['excluded'] += 1
                            continue
                        if Path(name).suffix.lower() not in TEXT_EXTENSIONS and name != '.env' and not name.startswith('.env.'):
                            skipped['excluded'] += 1
                            continue
                        child_fd = os.open(name, flags, dir_fd=directory_fd)
                        before = os.fstat(child_fd)
                        if not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid() or before.st_nlink != 1:
                            skipped['excluded'] += 1
                            continue
                        if before.st_size > MAX_FILE_BYTES:
                            skipped['oversize'] += 1
                            continue
                        if total_bytes + before.st_size > MAX_TOTAL_BYTES:
                            skipped['limits'] += 1
                            continue
                        total_bytes += before.st_size
                        chunks, remaining = [], before.st_size + 1
                        while remaining:
                            chunk = os.read(child_fd, min(65536, remaining))
                            if not chunk:
                                break
                            chunks.append(chunk)
                            remaining -= len(chunk)
                        raw = b''.join(chunks)
                        after = os.fstat(child_fd)
                        if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns) or len(raw) != before.st_size:
                            skipped['unstable'] += 1
                            continue
                        if b'\0' in raw:
                            skipped['binary'] += 1
                            continue
                        try:
                            text = raw.decode('utf-8')
                        except UnicodeDecodeError:
                            skipped['binary'] += 1
                            continue
                        if len(text) > MAX_TEXT_LENGTH:
                            skipped['oversize'] += 1
                            continue
                        detected = inspect_text(text)
                        scanned += 1
                        display = _display_path(path)
                        for finding in detected:
                            counts[finding['kind']] += 1
                            if len(findings) < MAX_REPORT_FINDINGS:
                                identifier = hashlib.sha256((path + ':' + str(finding['start']) + ':' + finding['kind']).encode()).hexdigest()[:18]
                                findings.append({'id': identifier, 'path': display,
                                    'line': text.count('\n', 0, finding['start']) + 1,
                                    'kind': finding['kind'], 'label': finding['label'], 'severity': finding['severity']})
                    except (OSError, ValueError):
                        skipped['unreadable'] += 1
                    finally:
                        if child_fd is not None:
                            os.close(child_fd)

            walk(root_fd)
        finally:
            if root_fd is not None:
                os.close(root_fd)
        count = sum(counts.values())
        return {'filesScanned': scanned, 'candidateCount': count,
                'secretCount': counts['secret'], 'personalCount': counts['personal'],
                'findings': findings, 'findingsTruncated': count > MAX_REPORT_FINDINGS,
                'coverageLimited': any(skipped.values()), 'skipped': skipped}
