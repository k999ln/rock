"""Bounded static inspection of pasted source; never executes or stores code."""
from __future__ import annotations

import ast
from bisect import bisect_right
import re

from sensitive_guard import inspect_text

MAX_SOURCE_BYTES = 64 * 1024
MAX_SOURCE_LINES = 2000
MAX_REPORT_FINDINGS = 100
MAX_AST_NODES = 20000
LANGUAGES = frozenset({'javascript', 'python', 'text'})
BASE_LIMITATION = '固定ルールによる静的検査です。検出なしは安全の保証ではありません。'
RULES = {
    'dynamic_eval': ('high', '動的なコード実行（要確認）',
        '文字列をコードとして実行できる呼出しです。外部入力が届くか確認が必要です。',
        'eval・exec・Functionへの入力を確認し、固定の処理や安全なデータ解析へ置き換えてください。'),
    'shell_execution': ('high', 'シェル実行（要確認）',
        'シェルを介してコマンドを実行する呼出しです。入力次第で意図しない命令が動く可能性があります。',
        'シェルを使わない引数配列のAPIを選び、実行対象と引数を許可した値に限定してください。'),
    'unsafe_html': ('medium', 'HTMLの直接挿入（要確認）',
        'HTMLとして解釈される代入または書込みです。未検証の入力が届くか確認が必要です。',
        '文字だけならtextContentを使い、HTMLが必要なら用途に適したサニタイズを行ってください。'),
    'tls_verification_disabled': ('high', '通信相手の証明書検証を無効化（要確認）',
        '証明書検証を無効にする指定です。通信相手の偽装を見逃す可能性があります。',
        '証明書検証を有効にし、必要な認証局や正しい証明書を設定してください。'),
}


def _python_checks(source, add, limitations):
    try:
        tree = ast.parse(source, mode='exec')
    except (SyntaxError, ValueError, RecursionError, MemoryError):
        limitations.append('Pythonの構文を解析できなかったため、コードの危険な処理の検査は未完了です。')
        return True
    nodes = []
    for node in ast.walk(tree):
        if len(nodes) >= MAX_AST_NODES:
            limitations.append('Pythonの構文要素が検査上限に達しました。コードの一部は未検査です。')
            return True
        nodes.append(node)
    aliases = {}
    for node in nodes:
        if isinstance(node, ast.Import):
            for item in node.names:
                aliases[item.asname or item.name.split('.')[0]] = item.name if item.asname else item.name.split('.')[0]
        elif isinstance(node, ast.ImportFrom) and node.module:
            for item in node.names:
                if item.name != '*':
                    aliases[item.asname or item.name] = node.module + '.' + item.name

    def name_of(node):
        parts = []
        while isinstance(node, ast.Attribute):
            parts.append(node.attr)
            node = node.value
        if not isinstance(node, ast.Name):
            return ''
        return '.'.join([aliases.get(node.id, node.id)] + list(reversed(parts)))

    for node in nodes:
        if not isinstance(node, ast.Call):
            continue
        name = name_of(node.func)
        rule = None
        if name in {'eval', 'exec', 'builtins.eval', 'builtins.exec'}:
            rule = 'dynamic_eval'
        elif name in {'os.system', 'os.popen', 'subprocess.getoutput', 'subprocess.getstatusoutput'}:
            rule = 'shell_execution'
        elif name in {'subprocess.run', 'subprocess.Popen', 'subprocess.call', 'subprocess.check_call', 'subprocess.check_output'}:
            if any(item.arg == 'shell' and isinstance(item.value, ast.Constant) and item.value.value is True for item in node.keywords):
                rule = 'shell_execution'
        elif name == 'ssl._create_unverified_context':
            rule = 'tls_verification_disabled'
        elif name in {'requests.get', 'requests.post', 'requests.put', 'requests.patch', 'requests.delete', 'requests.head', 'requests.options', 'requests.request', 'httpx.get', 'httpx.post', 'httpx.Client', 'httpx.AsyncClient'}:
            if any(item.arg == 'verify' and isinstance(item.value, ast.Constant) and item.value.value is False for item in node.keywords):
                rule = 'tls_verification_disabled'
        if rule:
            add(rule, node.lineno, getattr(node, 'end_lineno', node.lineno))
    return False


def _mask_javascript(source):
    """Keep newlines/positions, hide comments/literals, report omitted templates."""
    result = list(source)
    index, limited = 0, False
    previous, word = '', ''
    length = len(source)
    while index < length:
        start = index
        comment = False
        if source.startswith('//', index):
            comment = True
            end = source.find('\n', index + 2)
            index = length if end < 0 else end
        elif source.startswith('/*', index):
            comment = True
            end = source.find('*/', index + 2)
            limited |= end < 0
            index = length if end < 0 else end + 2
        elif source[index] in "\"'`":
            quote = source[index]
            index += 1
            closed = False
            while index < length:
                if source[index] == '\\':
                    index += 2
                    continue
                if quote == '`' and source.startswith('${', index):
                    limited = True
                if source[index] == quote:
                    index += 1
                    closed = True
                    break
                if quote != '`' and source[index] == '\n':
                    limited = True
                index += 1
            limited |= not closed
        elif source[index] == '/' and (not previous or previous in '=([{,:;!?&|'
                                       or word in {'return', 'throw', 'case'}):
            # Regex literals are data too. Division after an operand is left.
            index += 1
            in_class, closed = False, False
            while index < length and source[index] != '\n':
                char = source[index]
                if char == '\\':
                    index += 2
                    continue
                if char == '[':
                    in_class = True
                elif char == ']':
                    in_class = False
                elif char == '/' and not in_class:
                    index += 1
                    while index < length and source[index].isalpha():
                        index += 1
                    closed = True
                    break
                index += 1
            limited |= not closed
        else:
            char = source[index]
            if not char.isspace():
                if char.isalnum() or char in '_$':
                    continuing = index > 0 and (source[index - 1].isalnum() or source[index - 1] in '_$')
                    word = (word + char)[-16:] if continuing else char
                    previous = 'operand'
                else:
                    previous, word = char, ''
            index += 1
            continue
        for offset in range(start, min(index, length)):
            if source[offset] != '\n':
                result[offset] = ' '
        if not comment:
            previous, word = 'operand', ''
    return ''.join(result), limited


def _javascript_checks(source, add, line_at, limitations):
    masked, limited = _mask_javascript(source)
    patterns = {
        'dynamic_eval': r'(?<![\w$.])(?:eval|Function)\s*\(',
        'shell_execution': r'\bchild_process\s*\.\s*(?:exec|execSync)\s*\(',
        'unsafe_html': r'\.\s*(?:innerHTML|outerHTML)\s*=(?!=)|\bdocument\s*\.\s*write(?:ln)?\s*\(',
        'tls_verification_disabled': r'\brejectUnauthorized\s*:\s*false\b',
    }
    for rule, pattern in patterns.items():
        for match in re.finditer(pattern, masked):
            if rule == 'dynamic_eval' and re.search(r'\bfunction\s*$', masked[max(0, match.start() - 100):match.start()]):
                continue
            add(rule, line_at(match.start()), line_at(max(match.start(), match.end() - 1)))
    if limited:
        limitations.append('閉じていない記号やテンプレート式など、字句検査で読み取れない部分があります。')
    return limited


def inspect_code(source, language):
    """Inspect only the supplied text; metadata contains no values or snippets."""
    if type(source) is not str or type(language) is not str or language not in LANGUAGES:
        raise ValueError('CODE_INSPECTION_INVALID_INPUT')
    if len(source) > MAX_SOURCE_BYTES:
        raise ValueError('CODE_INSPECTION_TOO_LARGE')
    try:
        size = len(source.encode('utf-8'))
    except UnicodeEncodeError:
        raise ValueError('CODE_INSPECTION_INVALID_INPUT') from None
    source = source.replace('\r\n', '\n').replace('\r', '\n')
    if language == 'javascript':
        source = source.replace('\u2028', '\n').replace('\u2029', '\n')
    if size > MAX_SOURCE_BYTES or source.count('\n') + 1 > MAX_SOURCE_LINES:
        raise ValueError('CODE_INSPECTION_TOO_LARGE')
    limitations = [BASE_LIMITATION]
    limitations.append({
        'python': 'Pythonの一部の呼出しを構文で検査します。値の流れ・名前の再定義・外部依存は追跡しません。',
        'javascript': 'JavaScript・TypeScriptの一部を字句で検査します。構文全体・別名・値の流れ・外部依存は解析しません。',
        'text': 'テキストでは秘密情報・個人情報だけを検査します。コードの危険な処理は検査しません。',
    }[language])
    findings, priorities = [], []
    candidate_count = 0
    lines = [0] + [index + 1 for index, char in enumerate(source) if char == '\n']
    line_at = lambda offset: bisect_right(lines, offset)

    def append(rule, kind, severity, line, end_line, title, why, remediation):
        nonlocal candidate_count
        candidate_count += 1
        priority = ({'secret': 0, 'personal': 1, 'code': 2}[kind], line, end_line, rule)
        position = bisect_right(priorities, priority)
        if position < MAX_REPORT_FINDINGS:
            priorities.insert(position, priority)
            findings.insert(position, {'rule': rule, 'kind': kind, 'severity': severity,
                'line': line, 'endLine': end_line, 'title': title,
                'why': why, 'remediation': remediation})
            if len(findings) > MAX_REPORT_FINDINGS:
                findings.pop()
                priorities.pop()

    def add(rule, line, end_line):
        severity, title, why, remediation = RULES[rule]
        append(rule, 'code', severity, line, end_line, title, why, remediation)

    limited = False
    if source.strip():
        try:
            for finding in inspect_text(source):
                # These are runtime lookups, not literal credentials. Keep this
                # source-only false-positive filter out of outbound enforcement.
                if (language == 'python' and finding['kind'] == 'secret'
                        and source[finding['start'] - 1:finding['start']] not in {'"', "'", '`'}
                        and re.match(r'os\.(?:getenv|environ\.get)\s*\(', source[finding['start']:])):
                    continue
                secret = finding['kind'] == 'secret'
                append('sensitive.' + finding['kind'], finding['kind'], finding['severity'],
                    line_at(finding['start']), line_at(max(finding['start'], finding['end'] - 1)),
                    finding['label'] + 'の候補（要確認）',
                    'ソース内に秘密情報と思われる値があります。' if secret else 'ソース内に個人情報と思われる値があります。',
                    '値をコードから分離して秘密情報の保管先へ移し、漏えいしていた場合は失効・更新してください。' if secret
                    else '必要性を確認し、共有前に削除・匿名化するか、適切にアクセスを制限してください。')
        except (ValueError, RecursionError, MemoryError):
            limited = True
            limitations.append('秘密情報・個人情報の検査が上限などにより完了しませんでした。検出件数は既知の分だけです。')
        if language == 'python':
            limited |= _python_checks(source, add, limitations)
        elif language == 'javascript':
            limited |= _javascript_checks(source, add, line_at, limitations)
    if candidate_count > MAX_REPORT_FINDINGS:
        limited = True
        limitations.append('秘密情報・個人情報・コードの順に優先した100件までを表示しています。表示していない候補があります。')
    counts = {'total': len(findings), 'secret': 0, 'personal': 0, 'code': 0}
    for index, finding in enumerate(findings):
        finding['id'] = f'finding-{index + 1:04d}'
        counts[finding['kind']] += 1
    state = ('empty' if not source.strip() else 'needs_review' if findings else 'incomplete' if limited else 'no_findings')
    return {'schemaVersion': 1, 'language': language, 'state': state,
            'findings': findings, 'counts': counts, 'coverageLimited': limited, 'limitations': limitations}
