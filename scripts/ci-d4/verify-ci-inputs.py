#!/usr/bin/env python3
"""Read-only rc2 CI admission checks. Does not fetch, extract, boot or upload.

The end-to-end transport/orchestration remains a separate reviewed integration.
Use a reviewed plan SHA; a hash calculated from an untrusted plan is not a pin.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import time

GIB = 1024 ** 3
MAX_JSON = 2 * 1024 ** 2
SOURCE = 'b7d819cd291b653d165aa124f25a52b9898bfb2e'
MATRIX = [('ui-startup', 14, 180, 3120), ('ab', 8, 300, 3000),
          ('faults', 13, 300, 4500), ('auth-health', 3, 300, 1200),
          ('data-abi', 3, 180, 840)]


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink,
            info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def record(path, maximum, *, capture=False):
    """Initial-size budget, no links, bounded final read, stable fd and path."""
    path = Path(path)
    require(path.parent.resolve(strict=True) == path.parent, 'aliased parent')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb', buffering=0) as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
                0 <= before.st_size <= maximum, 'file identity or size rejected')
        require(not capture or before.st_size <= MAX_JSON, 'metadata too large')
        remaining = before.st_size
        digest = hashlib.sha256()
        saved = []
        while remaining:
            data = stream.read(min(1024 ** 2, remaining))
            require(data, 'truncated input')
            remaining -= len(data)
            digest.update(data)
            if capture:
                saved.append(data)
        require(stream.read(1) == b'', 'input grew past initial byte budget')
        require(identity(os.fstat(stream.fileno())) == identity(before) == identity(path.lstat()),
                'input changed while hashing')
    result = {'bytes': before.st_size, 'sha256': digest.hexdigest()}
    return (result, b''.join(saved)) if capture else result


def decode(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs)


def pinned_json(path, pin):
    info, raw = record(path, MAX_JSON, capture=True)
    require(info['sha256'] == pin, 'JSON pin differs')
    return decode(raw)


def safe_relative(name):
    pure = PurePosixPath(name)
    require(name and str(pure) == name and not pure.is_absolute() and
            '..' not in pure.parts and '\\' not in name, 'unsafe relative path')
    return name


def validate_plan(plan):
    require(plan['schema'] == 'rock-rc2-d4-ci-proposal/1' and
            plan['repository'] == 'k999ln/rock' and plan['source_commit'] == SOURCE,
            'wrong proposal or source')
    require([(x['name'], x['boots'], x['native_per_boot_seconds'], x['outer_seconds'])
             for x in plan['matrix']] == MATRIX, 'original D4 matrix changed')
    limits = plan['limits']
    require(limits['boots'] == 41 and limits['outer_seconds_sum'] == 12660 and
            limits['job_minutes'] == 360 and limits['automatic_retry'] is False and
            limits['delete_local_evidence'] is False, 'run contract changed')
    require(limits['minimum_free_bytes_after_dependencies'] >= 27 * GIB and
            limits['minimum_free_bytes_before_dependencies'] >= 31 * GIB,
            'capacity admission was weakened')
    require(plan['candidate']['release_id'] == 386933271 and
            plan['candidate']['tag'] == 'v1.0.0-preview.20260911-rc2' and
            len(plan['candidate']['assets']) == 8, 'wrong candidate release')
    names = [x['name'] for x in plan['candidate']['assets']]
    require(len(set(names)) == 8 and 'candidate-index.json' in names, 'wrong asset inventory')
    for name in names:
        require('/' not in name and safe_relative(name) == name, 'unsafe asset name')


def check_candidate_release(value, plan):
    candidate = plan['candidate']
    require(value.get('id') == candidate['release_id'] and value.get('draft') is True and
            value.get('prerelease') is True and value.get('tag_name') == candidate['tag'] and
            value.get('target_commitish') == SOURCE, 'candidate release changed')
    assets = value.get('assets', [])
    require(len(assets) == 8 and {x['name'] for x in assets} ==
            {x['name'] for x in candidate['assets']}, 'candidate missing/extra assets')
    by_name = {x['name']: x for x in assets}
    for expected in candidate['assets']:
        actual = by_name[expected['name']]
        require(actual.get('id') == expected['id'] and actual.get('size') == expected['bytes'] and
                actual.get('state') == 'uploaded' and
                actual.get('digest') == 'sha256:' + expected['sha256'], 'candidate asset changed')


def check_evidence_release(value, plan, *, initial):
    expected = plan['evidence_destination']
    require(type(expected['release_id']) is int and expected['release_id'] > 0 and
            expected['release_id'] != plan['candidate']['release_id'] and
            type(expected['tag']) is str and bool(expected['tag']), 'new evidence draft is not pinned')
    require(value.get('id') == expected['release_id'] and value.get('tag_name') == expected['tag'] and
            value.get('draft') is True and value.get('prerelease') is True and
            value.get('target_commitish') == SOURCE, 'wrong, published or retargeted evidence draft')
    if initial:
        require(value.get('assets') == [], 'new evidence draft must initially be empty')


def compare_envelope(unsigned, envelope):
    require(set(envelope) == {'manifest', 'signature'}, 'existing signed test envelope required')
    test = envelope['manifest']
    require(unsigned.get('trust') == 'EXTERNAL_RELEASE_KEY' and
            test.get('trust') == 'PUBLIC_RFC8032_DEVELOPMENT_ONLY', 'wrong explicit trust labels')
    require(set(unsigned) == set(test) and
            [name for name in unsigned if unsigned[name] != test[name]] == ['trust'],
            'public test envelope differs beyond trust')


def module(path, name, expected):
    require(record(path, MAX_JSON)['sha256'] == expected, 'trusted verifier source pin differs')
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def verify_inputs(plan, directory, source, public_directory):
    require(not any(os.environ.get(k) for k in ('GH_TOKEN', 'GITHUB_TOKEN', 'ACTIONS_RUNTIME_TOKEN')),
            'verification must run without transport credentials')
    for root in (directory, source, public_directory):
        require(root.resolve(strict=True) == root, 'canonical roots required')
    assets = {x['name']: {'bytes': x['bytes'], 'sha256': x['sha256']}
              for x in plan['candidate']['assets']}
    require({p.name for p in directory.iterdir()} == set(assets), 'local candidate extra/missing file')
    for name, expected in assets.items():
        require(record(directory / name, expected['bytes']) == expected, 'local asset changed')
    index = pinned_json(directory / 'candidate-index.json', plan['candidate']['index_sha256'])
    require(index['source_commit'] == index['host_tools_commit'] == SOURCE and
            index['version'] == plan['candidate']['version'] and index['assets'] ==
            {n: r for n, r in assets.items() if n != 'candidate-index.json'}, 'index binding differs')
    # These are pinned first-party verification tools from a separate immutable
    # b7 checkout, not Python imported from a downloaded archive.
    pins = plan['frozen']['trusted_scripts_sha256']
    signing = module(source / 'scripts/release_signing.py', 'rc2_candidate_verifier',
                     pins['scripts/release_signing.py'])
    _, unsigned = signing.candidate(directory, plan['candidate']['index_sha256'], SOURCE, int(time.time()))
    public = plan['public_test_only']
    envelope_path = public_directory / public['envelope']['name']
    key_path = public_directory / public['key']['name']
    for path, expected in ((envelope_path, public['envelope']), (key_path, public['key'])):
        require(record(path, expected['bytes']) == {k: expected[k] for k in ('bytes', 'sha256')},
                'preexisting public-test input pin differs')
    envelope = pinned_json(envelope_path, public['envelope']['sha256'])
    compare_envelope(unsigned, envelope)
    preview = module(source / 'systems/rock-star-os/os/desktop/preview.py', 'rc2_frozen_preview',
                     pins['systems/rock-star-os/os/desktop/preview.py'])
    test = preview.verify_release(envelope_path, directory / unsigned['archive']['name'], key_path,
                                  public['key']['sha256'], manifest_sha256=public['envelope']['sha256'],
                                  allow_public_test_key=True)
    compare_envelope(unsigned, {'manifest': test, 'signature': envelope['signature']})
    require(test['boot']['profile_sha256'] == plan['frozen']['profile']['sha256'] and
            test['files']['provenance/freeze-manifest.json']['sha256'] == plan['frozen']['freeze']['sha256'] and
            test['image_sha256'] == plan['frozen']['files_sha256'], 'profile/freeze/image pin differs')
    require(test['legal']['status'] == 'NOT_CLEARED' and test['acceptance']['status'] == 'CANDIDATE',
            'unexpected acceptance/legal promotion')
    return {'status': 'RC2_INPUTS_CHECKED_NOT_D4_RUN', 'assets': len(assets),
            'archive_members': len(unsigned['files']), 'source_commit': SOURCE,
            'public_test_only': True, 'signature_is_production_authentication': False,
            'extracted': False, 'booted': False, 'uploaded': False}


def capacity(plan, directory, after_dependencies):
    required = plan['limits']['minimum_free_bytes_after_dependencies' if after_dependencies
                              else 'minimum_free_bytes_before_dependencies']
    free = shutil.disk_usage(directory).free
    cpus = len(os.sched_getaffinity(0)) if hasattr(os, 'sched_getaffinity') else os.cpu_count()
    ram = os.sysconf('SC_PHYS_PAGES') * os.sysconf('SC_PAGE_SIZE') if sys.platform == 'linux' else 0
    passed = (sys.platform == 'linux' and free >= required and cpus >= 4 and ram >= 4 * GIB)
    return {'status': 'CAPACITY_ONLY_PASS' if passed else 'CAPACITY_REJECTED',
            'free_bytes': free, 'minimum_free_bytes': required, 'cpus': cpus,
            'ram_bytes': ram, 'after_dependencies': after_dependencies,
            'not_native_acceptance': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('check-plan', 'capacity', 'verify-inputs'))
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--plan-sha256', required=True)
    parser.add_argument('--directory', type=Path)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--public-directory', type=Path)
    parser.add_argument('--after-dependencies', action='store_true')
    args = parser.parse_args()
    plan = pinned_json(args.plan.absolute(), args.plan_sha256)
    validate_plan(plan)
    if args.action == 'check-plan':
        result = {'status': 'RUNNER_INPUT_PLAN_CHECKED_NOT_RUN', 'boots': 41,
                  'outer_seconds': 12660, 'job_minutes': 360,
                  'independent_full_runner_review_and_actual_CI_required': True}
    elif args.action == 'capacity':
        require(args.directory is not None, 'capacity directory required')
        result = capacity(plan, args.directory, args.after_dependencies)
    else:
        require(all(x is not None for x in (args.directory, args.source, args.public_directory)),
                'all verification directories required')
        result = verify_inputs(plan, args.directory, args.source, args.public_directory)
    print(json.dumps(result, sort_keys=True))
    if result['status'] == 'CAPACITY_REJECTED':
        sys.exit(1)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        print('D4 CI admission rejected; no guest run or upload performed.', file=sys.stderr)
        sys.exit(1)
