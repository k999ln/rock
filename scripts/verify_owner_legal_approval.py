#!/usr/bin/env python3
"""Verify a future detached owner decision against exact immutable candidate bytes.

Independent pins authenticate selected data, not authority or legal truth by
themselves. No approval generator, license choice, publication or signing action.
"""
import argparse
import re
from pathlib import Path
import sys
import tempfile
import time
import zlib

import release_signing as signing
from prepare_release_candidate import copy_checked

REPOSITORY = 'k999ln/rock'
ROLES = {'license', 'license_scope', 'notices', 'inventory', 'corresponding_source',
         'redistribution_instructions', 'exceptions'}
ATTESTATIONS = {'licensing_authority_and_scope_reviewed', 'third_party_conditions_reviewed',
                'notices_and_corresponding_source_reviewed', 'exceptions_reviewed'}
require = signing.require


def exact(value, fields, message):
    require(type(value) is dict and set(value) == set(fields), message)


def identity(value):
    require(type(value) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}', value),
            'explicit authority identifier required')
    return value


def validity(value, now):
    require(type(value['not_before']) is int and type(value['expires_at']) is int and
            0 < value['not_before'] <= now < value['expires_at'], 'decision or policy is not current')


def authorize(policy, approval, approval_pin, now):
    exact(policy, {'schema', 'repository', 'generation', 'not_before', 'expires_at', 'approvals'}, 'invalid current policy')
    require(policy['schema'] == 'rock-owner-legal-policy/1' and policy['repository'] == REPOSITORY and
            type(policy['generation']) is int and policy['generation'] > 0, 'wrong owner policy')
    validity(policy, now)
    require(type(policy['approvals']) is list and 1 <= len(policy['approvals']) <= 32, 'explicit decision authorization missing')
    seen, active = set(), []
    for entry in policy['approvals']:
        exact(entry, {'approval_sha256', 'authority_id', 'status'}, 'invalid policy decision entry')
        digest = signing.sha_text(entry['approval_sha256'])
        require(digest not in seen and entry['status'] in ('active', 'revoked'), 'ambiguous policy decision')
        seen.add(digest)
        identity(entry['authority_id'])
        if digest == approval_pin:
            require(entry['status'] == 'active', 'owner decision revoked')
            active.append(entry)
    require(len(active) == 1, 'owner decision not authorized by current independent policy')
    exact(approval, {'schema', 'repository', 'authority_id', 'decision', 'scope', 'not_before', 'expires_at',
        'source_commit', 'host_tools_commit', 'version', 'candidate_index_sha256', 'candidate_manifest',
        'archive', 'license_identifier', 'materials', 'attestations'}, 'invalid detached owner decision')
    require(approval['schema'] == 'rock-owner-legal-approval/1' and approval['repository'] == REPOSITORY and
            approval['decision'] == 'APPROVED' and approval['scope'] == 'LEGAL_REDISTRIBUTION_OF_IDENTIFIED_BYTES_ONLY',
            'explicit scoped owner approval required')
    require(identity(approval['authority_id']) == active[0]['authority_id'], 'approval authority differs from independent policy')
    validity(approval, now)
    exact(approval['attestations'], ATTESTATIONS, 'explicit owner review statements required')
    require(all(value is True for value in approval['attestations'].values()), 'incomplete owner review statement')
    label = approval['license_identifier']
    require(type(label) is str and 1 <= len(label) <= 200 and label == label.strip() and
            all(32 <= ord(char) < 127 for char in label) and
            label.upper() not in {'UNSET', 'UNDECIDED', 'UNKNOWN', 'NOASSERTION', 'NOT_CLEARED'},
            'explicit owner-selected license identifier required')


def record(value):
    exact(value, {'name', 'sha256', 'bytes'}, 'invalid exact material record')
    signing.sha_text(value['sha256'])
    require(type(value['bytes']) is int and 0 < value['bytes'] <= signing.MAX_ASSET, 'invalid material byte count')
    return {'sha256': value['sha256'], 'bytes': value['bytes']}


def bind(approval, index, manifest, index_pin, source, version):
    require(approval['source_commit'] == approval['host_tools_commit'] == signing.sha_text(source, 40) and
            approval['version'] == index['version'] == version and
            approval['candidate_index_sha256'] == signing.sha_text(index_pin), 'approved candidate identity differs')
    require(index['issued_at'] <= approval['not_before'], 'owner decision predates candidate issuance')
    manifest_record = record(approval['candidate_manifest'])
    require(approval['candidate_manifest']['name'] == 'candidate-manifest.json' and
            manifest_record == index['assets'].get('candidate-manifest.json'), 'approved manifest differs')
    archive_record = record(approval['archive'])
    require(approval['archive'] == manifest['archive'] and
            archive_record == index['assets'].get(approval['archive']['name']), 'approved archive differs')
    exact(approval['materials'], ROLES, 'all license, scope, NOTICE, inventory, source and exception materials required')
    for role, entries in approval['materials'].items():
        require(type(entries) is list and 1 <= len(entries) <= 32, 'missing or excessive reviewed materials')
        seen = set()
        for entry in entries:
            exact(entry, {'location', 'name', 'sha256', 'bytes'}, 'invalid reviewed material identity')
            require(entry['location'] in ('asset', 'archive-member'), 'unknown material location')
            material = record({k: entry[k] for k in ('name', 'sha256', 'bytes')})
            name = entry['name']
            require(type(name) is str and (entry['location'], name) not in seen, 'duplicate reviewed material')
            seen.add((entry['location'], name))
            if entry['location'] == 'asset':
                signing.asset_name(name)
                actual = index['assets'].get(name)
            else:
                actual = manifest['files'].get(name)
                if type(actual) is dict:
                    actual = {k: actual[k] for k in ('sha256', 'bytes')}
            require(material == actual, 'reviewed ' + role + ' material differs from candidate inventory')


def verify(directory, index_pin, source, version, approval_path, approval_pin, policy_path, policy_pin):
    now = int(time.time())
    signing.sha_text(source, 40)
    require(type(version) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}', version), 'invalid exact version')
    approval = signing.pinned(approval_path, approval_pin)
    policy = signing.pinned(policy_path, policy_pin)
    authorize(policy, approval, approval_pin, now)
    index = signing.pinned(directory / 'candidate-index.json', index_pin)
    require(type(index) is dict and type(index.get('assets')) is dict, 'candidate inventory missing')
    signing.check_records(directory, index['assets'], ignored={'candidate-index.json'})
    # Verify private byte copies so caller-owned files cannot change between the
    # hash, archive validation, and approval binding stages. Never execute them.
    with tempfile.TemporaryDirectory(prefix='rock-owner-legal-check-') as temporary:
        copied = Path(temporary)
        for name, expected in index['assets'].items():
            copy_checked(directory / name, copied / name, expected)
        copy_checked(directory / 'candidate-index.json', copied / 'candidate-index.json',
                     signing.file_record(directory / 'candidate-index.json'))
        checked_index, manifest = signing.candidate(copied, index_pin, source, now)
        bind(approval, checked_index, manifest, index_pin, source, version)
    now = int(time.time())
    authorize(policy, approval, approval_pin, now)
    return {'status': 'OWNER_LEGAL_APPROVAL_VERIFIED_NOT_LAUNCH_ACCEPTED', 'source_commit': source,
            'version': version, 'candidate_index_sha256': index_pin, 'approval_sha256': approval_pin,
            'policy_sha256': policy_pin, 'policy_generation': policy['generation'],
            'authority_id': approval['authority_id'], 'license_identifier': approval['license_identifier'],
            'build_time_legal_status': manifest['legal'].get('status'),
            'build_time_acceptance_status': manifest['acceptance'].get('status'),
            'scope': approval['scope'], 'verified_at': now}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('directory', 'approval', 'policy'):
        parser.add_argument('--' + name, type=Path, required=True)
    for name in ('index-sha256', 'source', 'version', 'approval-sha256', 'policy-sha256'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    result = verify(args.directory, args.index_sha256, args.source, args.version,
                    args.approval, args.approval_sha256, args.policy, args.policy_sha256)
    print(signing.canonical(result).decode())


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, EOFError, zlib.error, KeyError, TypeError):
        print('Owner legal decision verification rejected; current independent pins and exact candidate bytes are required.', file=sys.stderr)
        sys.exit(1)
