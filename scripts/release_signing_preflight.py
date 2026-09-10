#!/usr/bin/env python3
"""Read GitHub protection settings and download only pinned draft asset bytes.

No branch, environment, secret, release, or key is created or mutated.
Requires gh with a read-only token able to read environment and branch policy.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zlib
from urllib.parse import quote

from release_signing import MAX_METADATA, MAX_ASSET, MAX_TOTAL, asset_name, canonical, candidate, decode, file_record, pinned, require, sha_text

REPOSITORY = 'k999ln/rock'
CONTROL = 'codex/release-signing-control'
ENVIRONMENT = 'rock-release-signing'


def api(path):
    result = subprocess.run(['gh', 'api', '-H', 'X-GitHub-Api-Version: 2022-11-28', path], capture_output=True, timeout=45)
    require(result.returncode == 0, 'GitHub policy read denied or resource missing')
    return decode(result.stdout)


def validate_protection(environment, policies, protection, policy):
    require(environment.get('name') == ENVIRONMENT, 'exact signing environment required')
    reviews = [x for x in environment.get('protection_rules', []) if x.get('type') == 'required_reviewers']
    require(len(reviews) == 1 and reviews[0].get('prevent_self_review') is True, 'environment self-review must be prevented')
    expected = {(x['type'], x['id']) for x in policy['required_reviewers']}
    require(all(kind == 'User' for kind, _ in expected), 'individually identified reviewers required')
    actual = {(x.get('type'), x.get('reviewer', {}).get('id')) for x in reviews[0].get('reviewers', [])}
    require(len(expected) >= 1 and actual == expected, 'configured independent reviewer set differs')
    require(environment.get('deployment_branch_policy') == {'protected_branches': False, 'custom_branch_policies': True}, 'exact custom deployment policy required')
    branches = policies.get('branch_policies', [])
    require(policies.get('total_count') == 1 and len(branches) == 1 and branches[0].get('name') == CONTROL and
            branches[0].get('type') == 'branch', 'environment must allow only exact control branch, no tags/wildcards')
    require(protection.get('enforce_admins', {}).get('enabled') is True, 'branch admin enforcement required')
    for field in ('allow_force_pushes', 'allow_deletions'):
        require(protection.get(field, {}).get('enabled') is False, 'branch rewrite/deletion protection required')
    require(protection.get('lock_branch', {}).get('enabled') is True, 'signing control branch must be locked')
    reviews = protection.get('required_pull_request_reviews', {})
    require(reviews.get('required_approving_review_count', 0) >= 1 and reviews.get('dismiss_stale_reviews') is True and
            reviews.get('require_last_push_approval') is True, 'reviewed control-code updates required')
    bypass = reviews.get('bypass_pull_request_allowances')
    require(type(bypass) is dict and set(bypass) == {'users', 'teams', 'apps'} and
            all(bypass[x] == [] for x in ('users', 'teams', 'apps')), 'explicit empty PR bypass allowances required')


def validate_approval(run, history, environment, policy, control_sha):
    # GitHub's environment GET does not expose the UI administrator-bypass
    # setting. Enforce an actual independent authorization before key access.
    # History has no attempt timestamp, so reruns must become fresh dispatches.
    workflow = '.github/workflows/release-signing.yml'
    allowed_paths = {workflow, workflow + '@' + CONTROL, workflow + '@refs/heads/' + CONTROL}
    require(run.get('event') == 'workflow_dispatch' and run.get('head_sha') == control_sha and
            run.get('head_branch') == CONTROL and run.get('run_attempt') == 1 and
            run.get('path') in allowed_paths, 'wrong run identity or rerun')
    allowed = {x['id'] for x in policy['required_reviewers'] if x['type'] == 'User'}
    excluded = {run.get('actor', {}).get('id'), run.get('triggering_actor', {}).get('id')}
    require(None not in excluded and environment.get('id') is not None and type(history) is list, 'approval identity unavailable')
    matching = [x for x in history if any(e.get('id') == environment['id'] and e.get('name') == ENVIRONMENT for e in x.get('environments', []))]
    require(len(matching) == 1 and matching[0].get('state') == 'approved' and
            matching[0].get('user', {}).get('id') in allowed - excluded, 'explicit independent approval absent; bypass rejected')


def preflight(control_sha, policy_path, require_approval=False):
    sha_text(control_sha, 40)
    require(os.environ.get('GITHUB_REPOSITORY') == REPOSITORY and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch' and
            os.environ.get('GITHUB_REF') == 'refs/heads/' + CONTROL and os.environ.get('GITHUB_SHA') == control_sha and
            os.environ.get('GITHUB_WORKFLOW_REF') == REPOSITORY + '/.github/workflows/release-signing.yml@refs/heads/' + CONTROL and
            os.environ.get('GITHUB_RUN_ATTEMPT') == '1',
            'wrong workflow repository/event/ref/control SHA')
    policy = decode(policy_path.read_bytes())
    require(type(policy) is dict and set(policy) == {'schema', 'required_reviewers'} and
            policy['schema'] == 'rock-release-signing-policy/1' and type(policy['required_reviewers']) is list,
            'explicit control policy required')
    for person in policy['required_reviewers']:
        require(type(person) is dict and set(person) == {'type', 'id'} and person['type'] == 'User' and
                type(person['id']) is int and person['id'] > 0, 'exact approved reviewer ID required')
    prefix = 'repos/' + REPOSITORY
    ref = api(prefix + '/git/ref/heads/' + quote(CONTROL, safe=''))
    require(ref.get('object', {}).get('sha') == control_sha and ref.get('object', {}).get('type') == 'commit', 'control ref changed')
    env = api(prefix + '/environments/' + ENVIRONMENT)
    branches = api(prefix + '/environments/' + ENVIRONMENT + '/deployment-branch-policies?per_page=100')
    protection = api(prefix + '/branches/' + quote(CONTROL, safe='') + '/protection')
    validate_protection(env, branches, protection, policy)
    if require_approval:
        run_id = os.environ.get('GITHUB_RUN_ID', '')
        require(re.fullmatch('[1-9][0-9]{0,19}', run_id), 'current run ID required')
        run = api(prefix + '/actions/runs/' + run_id)
        history = api(prefix + '/actions/runs/' + run_id + '/approvals')
        validate_approval(run, history, env, policy, control_sha)
    return {'status': 'POLICY_CHECKED', 'control_sha': control_sha, 'environment': ENVIRONMENT,
            'reviewer_count': len(policy['required_reviewers']), 'independent_approval_checked': require_approval,
            'environment_admin_bypass_setting': 'NOT_EXPOSED_BY_GITHUB_API', 'production_key_registered': 'NOT_OBSERVED'}


def download_asset(identifier, target, expected_size):
    require(type(identifier) is int and identifier > 0 and type(expected_size) is int and 0 < expected_size <= MAX_ASSET, 'asset id/size rejected')
    command = ['gh', 'api', 'repos/' + REPOSITORY + '/releases/assets/' + str(identifier), '-H', 'Accept: application/octet-stream']
    # No shell interpolation. GH API handles GitHub's asset redirect; no arbitrary URL input.
    with target.open('xb') as output:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        total = 0
        try:
            while True:
                chunk = process.stdout.read(min(1024**2, expected_size - total + 1))
                if not chunk:
                    break
                total += len(chunk)
                require(total <= expected_size, 'download exceeds approved asset size')
                output.write(chunk)
            require(process.wait(timeout=15) == 0 and total == expected_size, 'asset download incomplete')
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()


def download(release_id, directory, index_pin, source):
    require(re.fullmatch('[1-9][0-9]{0,19}', release_id), 'numeric draft release ID required')
    sha_text(index_pin)
    sha_text(source, 40)
    release = api('repos/' + REPOSITORY + '/releases/' + release_id)
    require(release.get('draft') is True and release.get('prerelease') is True and release.get('target_commitish') == source,
            'only exact source-bound Draft Prerelease accepted')
    assets = release.get('assets', [])
    require(1 <= len(assets) <= 129, 'bounded draft asset inventory required')
    names = {}
    for item in assets:
        name = asset_name(item['name'])
        require(name not in names and item.get('state') == 'uploaded', 'duplicate or incomplete draft asset')
        names[name] = item
    require('candidate-index.json' in names and names['candidate-index.json']['size'] <= MAX_METADATA, 'candidate index missing')
    require(not directory.exists(), 'download destination already exists')
    directory.mkdir(mode=0o700)
    item = names['candidate-index.json']
    download_asset(item['id'], directory / 'candidate-index.json', item['size'])
    index = pinned(directory / 'candidate-index.json', index_pin)
    require(type(index) is dict and type(index.get('assets')) is dict and set(names) == set(index['assets']) | {'candidate-index.json'}, 'draft inventory differs from pinned candidate index')
    total = 0
    for name, record in index['assets'].items():
        asset_name(name)
        require(type(record) is dict and type(record.get('bytes')) is int and 0 < record['bytes'] <= MAX_ASSET and names[name]['size'] == record['bytes'], 'asset size differs')
        sha_text(record['sha256'])
        total += record['bytes']
        require(total <= MAX_TOTAL, 'aggregate candidate too large')
        download_asset(names[name]['id'], directory / name, record['bytes'])
        require(file_record(directory / name) == record, 'downloaded asset hash differs')
    import time
    candidate(directory, index_pin, source, int(time.time()))
    return {'status': 'DRAFT_BYTES_CHECKED_NOT_ACCEPTED', 'source_commit': source, 'index_sha256': index_pin}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    check = sub.add_parser('policy')
    check.add_argument('--control-sha', required=True)
    check.add_argument('--policy', type=Path, required=True)
    check.add_argument('--require-approval', action='store_true')
    fetch = sub.add_parser('download')
    fetch.add_argument('--release-id', required=True)
    fetch.add_argument('--directory', type=Path, required=True)
    fetch.add_argument('--index-sha256', required=True)
    fetch.add_argument('--source', required=True)
    args = parser.parse_args()
    result = preflight(args.control_sha, args.policy, args.require_approval) if args.command == 'policy' else download(args.release_id, args.directory, args.index_sha256, args.source)
    print(canonical(result).decode())


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, EOFError, zlib.error, subprocess.SubprocessError, KeyError, TypeError):
        print('Signing preflight rejected: required protection, access, or pinned draft bytes are missing.', file=sys.stderr)
        sys.exit(1)
