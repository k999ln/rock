#!/usr/bin/env python3
"""Rock star adapters for pinned Mr. utilities. Local files only; no network or installation."""
from __future__ import annotations
import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import sys
import stat
import tempfile
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / 'vendor' / 'mr'
if not VENDOR.is_dir():
    VENDOR = ROOT.parents[1] / 'vendor' / 'mr'
LIMIT = 1_000_000

def load_module(name):
    meta = json.loads((VENDOR / 'provenance.json').read_text(encoding='utf-8'))
    record = next((r for r in meta['files'] if r['file'] == name + '.py'), None)
    if record is None:
        raise ValueError('Unknown utility')
    path = VENDOR / record['file']
    if hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
        raise ValueError('Bundled source hash mismatch')
    spec = importlib.util.spec_from_file_location('loop_mr_' + name.replace('-', '_'), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def read_text(path):
    p = Path(path)
    if not p.is_file() or p.stat().st_size > LIMIT:
        raise ValueError('Input must be an existing UTF-8 file of at most 1 MB')
    return p.read_text(encoding='utf-8')

def emit(text, output):
    if output:
        # Never silently replace the source or an earlier result.
        with Path(output).open('x', encoding='utf-8') as handle:
            handle.write(text)
    else:
        sys.stdout.write(text)

def protected_citations(text):
    module = load_module('citation-strip')
    marker = '\ue000ROCK_STAR_CODE_'
    while marker in text:
        marker += 'X'
    values = []
    def keep(value):
        token = marker + str(len(values)) + '\ue001'
        values.append(value)
        return token
    lines, output, i = text.split('\n'), [], 0
    while i < len(lines):
        m = re.match(r'^\s*(`{3,}|~{3,})', lines[i])
        if m:
            block = [lines[i]]
            i += 1
            close = re.compile(r'^\s*' + re.escape(m[1][0]) + '{' + str(len(m[1])) + r',}\s*$')
            while i < len(lines):
                line = lines[i]
                block.append(line)
                i += 1
                if close.match(line):
                    break
            output.append(keep('\n'.join(block)))
        else:
            output.append(re.sub(r'(`+)([^\n]*?)\1(?!`)', lambda m: keep(m[0]), lines[i]))
            i += 1
    masked = '\n'.join(output)
    masked = module.CITATION_RE.sub(lambda m: m[0] if module.LINK_RE.search(m[0]) else keep(m[0]), masked)
    out = module.transform(masked)
    for index, value in enumerate(values):
        out = out.replace(marker + str(index) + '\ue001', value)
    return out

def separate_sources(body):
    lines, start, level, fence = body.split('\n'), None, 0, None
    for i, line in enumerate(lines):
        s = line.strip()
        if fence:
            if fence.match(s):
                fence = None
            continue
        fm = re.match(r'^(`{3,}|~{3,})', s)
        if fm:
            fence = re.compile('^' + re.escape(fm[1][0]) + '{' + str(len(fm[1])) + r',}\s*$')
            continue
        match = re.match(r'^(#{1,6})\s*(Sources|出典)\s*$', s, re.I)
        if match:
            start, level = i, len(match[1])
            break
    if start is None:
        return body, None
    end, fence = len(lines), None
    for i in range(start + 1, len(lines)):
        s = lines[i].strip()
        if fence:
            if fence.match(s):
                fence = None
            continue
        fm = re.match(r'^(`{3,}|~{3,})', s)
        if fm:
            fence = re.compile('^' + re.escape(fm[1][0]) + '{' + str(len(fm[1])) + r',}\s*$')
            continue
        match = re.match(r'^(#{1,6})\s', s)
        if match and len(match[1]) <= level:
            end = i
            break
    if fence:
        raise ValueError('Close the code fence in the source section')
    return '\n'.join(lines[:start] + lines[end:]), '\n'.join(lines[start:end]).rstrip()

def free_article(args):
    module = load_module('make-free-version')
    text = read_text(args.input).replace('\r\n', '\n')
    if not text.strip() or len(text) > 100_000:
        raise ValueError('Article must contain 1 to 100,000 characters')
    target = urlparse(args.note_url)
    if target.scheme != 'https' or target.hostname != 'note.com' or target.username or target.password or not re.match(r'^/[^/]+/n/[^/]+', target.path):
        raise ValueError('Use an HTTPS note.com article URL')
    if not 1 <= args.after_chars <= 100_000 or not 1 <= args.price <= 1_000_000 or not args.paid_contents.strip():
        raise ValueError('Invalid character budget, price, or paid contents')
    lines = text.split('\n')
    title = lines.pop(0) if lines and re.match(r'^#\s+', lines[0].strip()) else None
    body, sources = separate_sources('\n'.join(lines))
    opened = False
    for line in body.split('\n'):
        if line.strip().startswith('```'):
            opened = not opened
    if opened:
        raise ValueError('Close the article code fence')
    segs, total, cut = module.parse_segments(body), 0, None
    for i, segment in enumerate(segs):
        if segment['type'] != 'code':
            total += len(module.plain(segment['raw']))
            if total >= args.after_chars:
                cut = i
                break
    if cut is None or not any(s['type'] in ('sentence', 'bullet', 'code') for s in segs[cut + 1:]):
        raise ValueError('Shorten the free range so paid body content remains')
    # Use the verified original assembler with sources separated from the paid-body budget.
    with tempfile.TemporaryDirectory(prefix='rock-star-mr-') as temporary:
        draft = Path(temporary) / 'article.md'
        draft.write_text((title + '\n' if title else '') + body, encoding='utf-8')
        namespace = argparse.Namespace(markdown_file=str(draft), note_url=args.note_url.strip(), price=args.price, paid_contents=args.paid_contents.strip(), summary_file=args.summary, after_chars=args.after_chars)
        # The upstream diagnostic includes article text; do not forward it into shared logs.
        with contextlib.redirect_stderr(io.StringIO()):
            result = module.build(namespace)
    if sources:
        footer = '\n---\n\nこの記事は無料版です。'
        at = result.rfind(footer)
        result = result[:at].rstrip() + '\n\n' + sources + '\n' + result[at:]
    module.check_no_teaser_heading(result)
    module.check_no_fullwidth_dash(result)
    return result

def _delivery_flags():
    names = ('O_DIRECTORY', 'O_NOFOLLOW', 'O_NONBLOCK')
    if (os.name != 'posix' or not all(getattr(os, name, 0) for name in names)
            or not _DELIVERY_DIR_FD):
        raise ValueError('Protected delivery reads are unavailable')
    return os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK

_DELIVERY_DIR_FD = os.open in os.supports_dir_fd

def _delivery_parts(raw):
    if not isinstance(raw, str) or not raw or '\x00' in raw or len(raw.encode('utf-8')) > 4096:
        raise ValueError('Invalid artifact path')
    relative = Path(raw)
    if relative.is_absolute() or '..' in relative.parts or not 1 <= len(relative.parts) <= 64:
        raise ValueError('Artifact must stay within the workspace')
    return relative.parts

def _delivery_read(root_fd, parts, maximum, flags):
    directory = os.dup(root_fd)
    try:
        for part in parts[:-1]:
            child = os.open(part, flags | os.O_DIRECTORY, dir_fd=directory)
            os.close(directory)
            directory = child
        descriptor = os.open(parts[-1], flags, dir_fd=directory)
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_size > maximum:
                raise ValueError('Delivery file is not regular or exceeds its limit')
            content = bytearray()
            while len(content) <= maximum:
                chunk = os.read(descriptor, min(65536, maximum + 1 - len(content)))
                if not chunk:
                    return bytes(content)
                content.extend(chunk)
            raise ValueError('Delivery file exceeds its limit')
        finally:
            os.close(descriptor)
    finally:
        os.close(directory)

def verify_delivery(args, data):
    if not isinstance(data, dict):
        raise ValueError('Review input must be a JSON object')
    receipt = data.get('execution_receipt')
    if not isinstance(receipt, dict) or not re.fullmatch(r'[0-9a-f]{64}', str(receipt.get('revision_sha256', ''))):
        raise ValueError('Invalid contract revision')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', str(receipt.get('execution_id', ''))):
        raise ValueError('Invalid execution ID')
    artifacts = receipt.get('artifacts')
    if not isinstance(artifacts, list) or not 1 <= len(artifacts) <= 100:
        raise ValueError('Provide 1 to 100 artifact records')
    paths = []
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            raise ValueError('Invalid artifact path')
        paths.append(_delivery_parts(artifact.get('path')))
    flags = _delivery_flags()
    try:
        root_fd = os.open(Path(args.workspace), flags | os.O_DIRECTORY)
        try:
            # The pinned verifier sees only these bounded copies, never host paths.
            with tempfile.TemporaryDirectory(prefix='rock-star-delivery-') as temporary:
                snapshot = Path(temporary)
                copied = {}
                def stage(parts, maximum, optional=False):
                    if parts in copied:
                        if copied[parts] > maximum:
                            raise ValueError('Delivery file exceeds its limit')
                        return copied[parts]
                    try:
                        content = _delivery_read(root_fd, parts, maximum, flags)
                    except FileNotFoundError:
                        if optional:
                            return 0  # Preserve the verifier's missing-record BLOCKED result.
                        raise
                    target = snapshot.joinpath(*parts)
                    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    with os.fdopen(descriptor, 'wb') as handle:
                        handle.write(content)
                    copied[parts] = len(content)
                    return len(content)
                total = 0
                for parts in paths:
                    total += stage(parts, 10_000_000 - total)
                stage(('requirements', 'revisions', str(receipt['revision_sha256']) + '.json'), LIMIT, True)
                stage(('artifacts', 'execution-receipts', str(receipt['execution_id']) + '.json'), LIMIT, True)
                return load_module('deliverable_verifier').verify_deliverables(
                    workspace=snapshot, execution_receipt=receipt,
                    reviewer_context_id=data.get('reviewer_context_id'), review=data.get('review'))
        finally:
            os.close(root_fd)
    except OSError:
        raise ValueError('Delivery workspace could not be read safely') from None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('citations', 'coconala-check', 'free-article', 'verify-delivery'):
        child = sub.add_parser(name)
        child.add_argument('--input', required=True)
        child.add_argument('--output', help='New output file; existing files are not overwritten')
        if name == 'free-article':
            child.add_argument('--summary', required=True)
            child.add_argument('--after-chars', type=int, default=2500)
            child.add_argument('--price', type=int, required=True)
            child.add_argument('--paid-contents', required=True)
            child.add_argument('--note-url', required=True)
        if name == 'verify-delivery':
            child.add_argument('--workspace', required=True)
    args = parser.parse_args()
    try:
        if args.command == 'citations':
            result = protected_citations(read_text(args.input))
        elif args.command == 'free-article':
            result = free_article(args)
        else:
            data = json.loads(read_text(args.input))
            if args.command == 'verify-delivery':
                obj = verify_delivery(args, data)
            else:
                if not isinstance(data, dict) or not isinstance(data.get('brief'), str) or not data['brief'].strip() or not isinstance(data.get('proposal'), str) or not data['proposal'].strip():
                    raise ValueError('Provide brief and proposal text')
                rate = data.get('orderRate')
                if rate is not None and (isinstance(rate, bool) or not isinstance(rate, (int, float)) or not 0 <= rate <= 100):
                    raise ValueError('orderRate must be null or 0 to 100')
                module = load_module('application_eligibility')
                module.min_client_order_rate = lambda: 40.0
                obj = module.evaluate_application(data['brief'], data['proposal'], bucket=data.get('bucket', 'single'), market=None if rate is None else {'client_order_rate': rate})
            result = json.dumps(obj, ensure_ascii=False, indent=2) + '\n'
        emit(result, args.output)
        return 0
    except (ValueError, OSError, TypeError, KeyError, SystemExit) as error:
        # Input fragments are intentionally excluded from diagnostic output.
        print('Could not run the tool. Check the input fields, source hashes, and output path.', file=sys.stderr)
        return 2

if __name__ == '__main__':
    sys.exit(main())
