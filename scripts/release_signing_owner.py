#!/usr/bin/env python3
"""Owner-manual signing proposal. No GitHub policy bypass or offline attestation.

prepare writes PENDING approval only. The owner edits and independently pins it.
The external DER file must be unlocked by its owner before sign; no key generator
or decryption/secret-store integration is provided. See owner-manual-signing.md.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import time
import zlib
import subprocess

import release_signing as signing

KEY_ENV = 'ROCK_RELEASE_SIGNING_KEY_PKCS8_B64'
ATTESTATIONS = {'single_owner_mode_accepted', 'external_key_custody_accepted',
                'isolated_signing_environment_checked_by_owner'}
require = signing.require


def private_parent(path):
    require(path.is_absolute() and path.parent.resolve(strict=True) == path.parent,
            'canonical absolute parent required')
    info = path.parent.stat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and not info.st_mode & 0o077,
            'owner-private parent directory required')


def secure_read(path, limit):
    private_parent(path)
    before = path.lstat()
    def identity(info):
        return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
                info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid() and
            stat.S_IMODE(before.st_mode) in (0o400, 0o600) and before.st_nlink == 1 and
            0 < before.st_size <= limit, 'bounded owner-private regular file required')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb', buffering=0) as stream:
        require(identity(os.fstat(stream.fileno())) == identity(before), 'input replaced before read')
        raw = stream.read(before.st_size + 1)
        require(len(raw) == before.st_size and identity(os.fstat(stream.fileno())) ==
                identity(before) == identity(path.lstat()), 'input changed during read')
    return raw


def code_pins():
    return {name: hashlib.sha256(signing.read_file(path)).hexdigest() for name, path in (
        ('release_signing_owner.py', Path(__file__).resolve()),
        ('release_signing.py', Path(signing.__file__).resolve()))}


def checked_inputs(directory, source, index_pin, trust, trust_pin, fingerprint):
    require(directory.is_absolute() and directory.resolve(strict=True) == directory and directory.is_dir(),
            'canonical candidate directory required')
    index, manifest = signing.candidate(directory, index_pin, source, int(time.time()))
    signing.trust_identity(signing.pinned(trust, trust_pin), fingerprint, int(time.time()))
    return {'source_commit': source, 'host_tools_commit': index['host_tools_commit'], 'version': index['version'],
            'candidate_index_sha256': index_pin, 'candidate_manifest': index['assets']['candidate-manifest.json'],
            'archive': manifest['archive'], 'trust_bundle_sha256': trust_pin, 'fingerprint': fingerprint,
            'signer_sha256': code_pins()}


def prepare(directory, source, index_pin, trust, trust_pin, fingerprint, owner_id, approval_path, output):
    require(type(owner_id) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}', owner_id),
            'explicit owner identifier required')
    private_parent(approval_path); private_parent(output)
    require(not os.path.lexists(approval_path) and not os.path.lexists(output), 'new approval and output paths required')
    require(not approval_path.is_relative_to(directory) and not output.is_relative_to(directory),
            'approval/output must be outside candidate data')
    inputs = checked_inputs(directory, source, index_pin, trust, trust_pin, fingerprint)
    now = int(time.time())
    approval = {'schema': 'rock-owner-manual-signing/1', 'mode': 'OWNER_MANUAL',
                'scope': 'PACKAGE_AUTHENTICATION_ONLY', 'owner_id': owner_id,
                'decision': 'PENDING_OWNER_APPROVAL', 'prepared_at': now, 'approved_at': None,
                'expires_at': now + 86400, 'output_directory': str(output), 'inputs': inputs,
                'attestations': {name: False for name in sorted(ATTESTATIONS)}}
    raw = signing.canonical(approval) + b'\n'
    signing.write_private(approval_path, raw)
    return {'status': 'PENDING_OWNER_APPROVAL_NOT_SIGNED', 'approval_sha256': hashlib.sha256(raw).hexdigest()}


def load_approval(path, pin, output):
    raw = secure_read(path, 64 * 1024)
    require(hashlib.sha256(raw).hexdigest() == signing.sha_text(pin), 'owner approval pin differs')
    value = signing.decode(raw)
    require(type(value) is dict and set(value) == {'schema', 'mode', 'scope', 'owner_id', 'decision',
            'prepared_at', 'approved_at', 'expires_at', 'output_directory', 'inputs', 'attestations'},
            'unexpected owner approval fields')
    require(value['schema'] == 'rock-owner-manual-signing/1' and value['mode'] == 'OWNER_MANUAL' and
            value['scope'] == 'PACKAGE_AUTHENTICATION_ONLY' and value['decision'] == 'APPROVED',
            'explicit owner approval required')
    require(type(value['owner_id']) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}', value['owner_id']),
            'explicit owner identifier required')
    now = int(time.time())
    require(all(type(value[k]) is int for k in ('prepared_at', 'approved_at', 'expires_at')) and
            0 < value['prepared_at'] <= value['approved_at'] <= now < value['expires_at'] <= value['prepared_at'] + 86400,
            'owner approval expired, pending, or not yet valid')
    require(type(value['attestations']) is dict and set(value['attestations']) == ATTESTATIONS and
            all(v is True for v in value['attestations'].values()), 'owner custody/isolation statements incomplete')
    require(value['output_directory'] == str(output), 'approval belongs to another output attempt')
    return raw, value


def read_external_key(path):
    # No hash, logging, command substitution, key generation or persistent copy.
    return secure_read(path, 48)


def sign_owner(directory, trust, approval_path, approval_pin, key_file, output):
    require(KEY_ENV not in os.environ, 'environment signing key is forbidden in owner-file mode')
    private_parent(output)
    require(not os.path.lexists(output), 'output attempt already exists; prepare a fresh owner decision')
    raw, approval = load_approval(approval_path, approval_pin, output)
    inputs = approval['inputs']
    require(type(inputs) is dict and set(inputs) == {'source_commit', 'host_tools_commit', 'version',
            'candidate_index_sha256', 'candidate_manifest', 'archive', 'trust_bundle_sha256', 'fingerprint',
            'signer_sha256'}, 'unexpected approved input fields')
    require(not output.is_relative_to(directory) and not approval_path.is_relative_to(directory),
            'approval/output must be outside candidate data')
    # Full asset and USTAR checks, trust validity and code pins BEFORE any key read.
    actual = checked_inputs(directory, inputs['source_commit'], inputs['candidate_index_sha256'], trust,
                            inputs['trust_bundle_sha256'], inputs['fingerprint'])
    require(actual == inputs, 'approved candidate, trust or signer bytes differ')
    private_parent(key_file)
    code_root = Path(__file__).resolve().parents[1]
    require(not any(key_file.is_relative_to(root) for root in (directory, output, code_root)),
            'external key must be outside candidate/output/code checkout')
    require(load_approval(approval_path, approval_pin, output)[0] == raw, 'approval changed after validation')
    # Atomic reservation: failure leaves this attempt present, never overwritten.
    output.mkdir(mode=0o700)
    signing.write_private(output / 'owner-approval.json', raw)
    signing.write_private(output / 'ATTEMPT.json', signing.canonical({
        'status': 'OWNER_APPROVED_ATTEMPT_RESERVED_NOT_SIGNED', 'approval_sha256': approval_pin,
        'isolation': 'OWNER_ATTESTED_NOT_SOFTWARE_PROVEN', 'independent_human_approval': False}) + b'\n')
    previous_temp = os.environ.get('RUNNER_TEMP')
    try:
        private = read_external_key(key_file)
        os.environ['RUNNER_TEMP'] = str(key_file.parent)
        os.environ[KEY_ENV] = base64.b64encode(private).decode('ascii')
        # Existing signer consumes/pops the env value before spawning OpenSSL;
        # it validates the key/derived public identity and cleans its temp files.
        result = signing.sign(directory, output / 'signed-metadata', inputs['candidate_index_sha256'], trust,
                              inputs['trust_bundle_sha256'], inputs['fingerprint'], inputs['source_commit'])
    finally:
        os.environ.pop(KEY_ENV, None)
        if previous_temp is None: os.environ.pop('RUNNER_TEMP', None)
        else: os.environ['RUNNER_TEMP'] = previous_temp
    # Final asset assembly and the existing independent verify remain required.
    receipt = {'schema': 'rock-owner-manual-signing-result/1',
               'status': 'SIGNED_NOT_LAUNCH_ACCEPTED_FINAL_VERIFY_REQUIRED', 'owner_id': approval['owner_id'],
               'approval_sha256': approval_pin, 'inputs': inputs, 'signer_result': result,
               'isolation': 'OWNER_ATTESTED_NOT_SOFTWARE_PROVEN', 'independent_human_approval': False,
               'github_policy_changed': False, 'original_key_file_retained': True,
               'metadata': {p.name: signing.file_record(p) for p in sorted((output / 'signed-metadata').iterdir())}}
    require(set(receipt['metadata']) == signing.OUTPUT_NAMES, 'signer output roster differs')
    signing.write_private(output / 'OWNER-SIGNING-RESULT.json', signing.canonical(receipt) + b'\n')
    return {'status': receipt['status'], 'approval_sha256': approval_pin, 'key_fingerprint': inputs['fingerprint']}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('prepare', 'sign'):
        p = sub.add_parser(name)
        for flag in ('directory', 'trust-bundle', 'approval', 'output'):
            p.add_argument('--' + flag, type=Path, required=True)
        if name == 'prepare':
            for flag in ('source', 'index-sha256', 'trust-sha256', 'fingerprint', 'owner-id'):
                p.add_argument('--' + flag, required=True)
        else:
            p.add_argument('--approval-sha256', required=True)
            p.add_argument('--key-file', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'prepare':
        result = prepare(args.directory, args.source, args.index_sha256, args.trust_bundle, args.trust_sha256,
                         args.fingerprint, args.owner_id, args.approval, args.output)
    else:
        result = sign_owner(args.directory, args.trust_bundle, args.approval, args.approval_sha256, args.key_file, args.output)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        main()
    except (ValueError, OSError, EOFError, zlib.error, subprocess.SubprocessError, KeyboardInterrupt, KeyError, TypeError):
        print('Owner signing refused; check approval, fixed inputs and private file custody.', file=sys.stderr)
        sys.exit(1)
