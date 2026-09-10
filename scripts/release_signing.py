#!/usr/bin/env python3
"""Offline, independently pinned release authentication. Standard library + OpenSSL 3.

This does not run an archive's code, replace preview.py's compatibility checks,
change embedded OS trust, or decide legal/runtime acceptance.
"""
import argparse
import base64
import hashlib
import gzip
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import stat
import subprocess
import sys
import zlib
import tempfile
import time

DER_PREFIX = bytes.fromhex('302a300506032b6570032100')
PRIVATE_PREFIX = bytes.fromhex('302e020100300506032b657004220420')
# All distinct Ed25519 keys in RFC8032 sections 7.1, 7.2 and 7.3.
RFC8032_KEYS = frozenset(bytes.fromhex(x) for x in (
    'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
    '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
    'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025',
    '278117fc144c72340f67d0f2316e8386ceffbf2b2428c9c51fef7c597f1d426e',
    'ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf',
    'dfc9425e4f968f7f0c29f0259cf5f9aed6851c2bb4ad8bfb860cfee0ab248292',
    '0f1d1274943b91415889152e893d80e93275a1fc0b65fd71b4b0dda10ad7d772',
))
MAX_METADATA = 4 * 1024**2
MAX_ASSET = 4 * 1024**3
MAX_TOTAL = 12 * 1024**3
MAX_EXPANDED = 6 * 1024**3
OUTPUT_NAMES = {'release-manifest.json', 'release-key.der', 'release-authentication.json', 'SIGNED-SHA256SUMS'}


def require(value, message):
    if not value:
        raise ValueError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def decode(raw):
    require(0 < len(raw) <= MAX_METADATA, 'metadata size rejected')
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    def constant(_):
        raise ValueError('nonfinite JSON number')
    return json.loads(raw, object_pairs_hook=unique, parse_constant=constant)


def sha_text(value, length=64):
    require(type(value) is str and re.fullmatch('[0-9a-f]{' + str(length) + '}', value), 'invalid digest or commit')
    return value


def asset_name(name):
    require(type(name) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._+-]{0,159}', name), 'invalid asset name')
    return name


def read_file(path, limit=MAX_METADATA):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 0 <= info.st_size <= limit, 'unsafe input file')
        raw = stream.read(limit + 1)
        require(len(raw) == info.st_size and len(raw) <= limit, 'input file changed')
        return raw


def file_record(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and 0 <= before.st_size <= MAX_ASSET, 'unsafe asset')
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        after = os.fstat(stream.fileno())
        require((before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'asset changed during hash')
        return {'sha256': digest, 'bytes': before.st_size}


def pinned(path, expected):
    raw = read_file(path)
    require(hashlib.sha256(raw).hexdigest() == sha_text(expected), 'independent metadata pin differs')
    return decode(raw)


def openssl(*arguments):
    executable = shutil.which('openssl')
    require(executable is not None, 'OpenSSL 3 required')
    version = subprocess.run([executable, 'version'], capture_output=True, timeout=15)
    require(version.returncode == 0 and version.stdout.startswith(b'OpenSSL 3.'), 'OpenSSL 3 required')
    result = subprocess.run([executable, *map(str, arguments)], capture_output=True, timeout=30)
    require(result.returncode == 0, 'cryptographic operation rejected')
    return result.stdout


def public_identity(public, fingerprint):
    require(len(public) == 44 and public.startswith(DER_PREFIX), 'Ed25519 SPKI DER required')
    require(public[12:] not in RFC8032_KEYS, 'public RFC8032 test identity rejected')
    require(hashlib.sha256(public).hexdigest() == sha_text(fingerprint), 'public fingerprint differs')


def trust_identity(bundle, fingerprint, now):
    require(type(bundle) is dict and set(bundle) == {'schema', 'generation', 'not_before', 'expires_at', 'identities'}, 'invalid trust bundle')
    require(bundle['schema'] == 'rock-release-trust/1' and type(bundle['generation']) is int and bundle['generation'] > 0, 'invalid trust generation')
    require(type(bundle['not_before']) is int and type(bundle['expires_at']) is int and
            bundle['not_before'] <= now < bundle['expires_at'], 'trust bundle expired or not yet valid')
    require(type(bundle['identities']) is list and 1 <= len(bundle['identities']) <= 32, 'no configured release identities')
    matches = []
    seen = set()
    for identity in bundle['identities']:
        require(type(identity) is dict and set(identity) == {'fingerprint', 'public_der_hex', 'status', 'not_before', 'expires_at'}, 'invalid release identity')
        item_fingerprint = sha_text(identity['fingerprint'])
        require(item_fingerprint not in seen, 'duplicate release identity')
        seen.add(item_fingerprint)
        require(identity['status'] in ('active', 'revoked'), 'invalid identity status')
        require(type(identity['not_before']) is int and type(identity['expires_at']) is int and identity['not_before'] < identity['expires_at'], 'invalid identity validity')
        if item_fingerprint == fingerprint:
            matches.append(identity)
    require(len(matches) == 1, 'release identity absent from pinned trust')
    identity = matches[0]
    require(identity['status'] == 'active' and identity['not_before'] <= now < identity['expires_at'], 'release identity revoked or expired')
    raw_hex = identity['public_der_hex']
    require(type(raw_hex) is str and re.fullmatch('[0-9a-f]{88}', raw_hex), 'invalid public DER')
    public = bytes.fromhex(raw_hex)
    public_identity(public, fingerprint)
    return public


def check_records(directory, records, *, ignored=()):
    require(type(records) is dict and 1 <= len(records) <= 128, 'invalid asset inventory')
    require(set(p.name for p in directory.iterdir()) == set(records) | set(ignored), 'extra or missing candidate asset')
    total = 0
    for name, record in records.items():
        asset_name(name)
        require(type(record) is dict and set(record) == {'sha256', 'bytes'}, 'invalid asset record')
        sha_text(record['sha256'])
        require(type(record['bytes']) is int and 0 <= record['bytes'] <= MAX_ASSET, 'asset bound exceeded')
        total += record['bytes']
        require(total <= MAX_TOTAL, 'aggregate asset bound exceeded')
        require(file_record(directory / name) == record, 'asset hash or size differs')


def check_manifest(value, index):
    fields = {'schema', 'product', 'version', 'source_commit', 'host_tools_commit', 'host', 'archive', 'files',
              'image_sha256', 'factory_sha256', 'trust', 'legal', 'acceptance', 'display', 'boot', 'game'}
    require(type(value) is dict and set(value) == fields, 'expected existing v2 manifest payload')
    require(value['schema'] == 'rockstaros-preview-release/2' and value['product'] == 'RockstarOS 1.0 Developer Preview', 'unexpected product or schema')
    require(value['trust'] == 'EXTERNAL_RELEASE_KEY', 'test-key candidate cannot be silently relabelled')
    for key in ('source_commit', 'host_tools_commit'):
        require(sha_text(value[key], 40) == index[key], 'source or host tools commit differs')
    require(value['version'] == index['version'] and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}', value['version']), 'version differs')
    archive = value['archive']
    require(type(archive) is dict and set(archive) == {'name', 'sha256', 'bytes'}, 'invalid archive identity')
    asset_name(archive['name'])
    require(archive['name'] == 'rockstaros-' + value['version'] + '-macos-arm64.tar.gz', 'archive version/name differs')
    require(index['assets'].get(archive['name']) == {'sha256': archive['sha256'], 'bytes': archive['bytes']}, 'archive/index identity differs')
    require(type(value['files']) is dict and 1 <= len(value['files']) <= 20000, 'invalid expanded inventory')
    require(type(value['image_sha256']) is dict and set(value['image_sha256']) == {'Image', 'rootfs.ext4', 'stage0.cpio.gz'}, 'missing image triple')
    for name, digest in value['image_sha256'].items():
        require(value['files'].get('images/' + name, {}).get('sha256') == sha_text(digest), 'image inventory differs')
    require(type(value['boot']) is dict and value['boot'].get('factory_sha256') == sha_text(value['factory_sha256']), 'factory binding differs')
    require(type(value['legal']) is dict and type(value['acceptance']) is dict, 'acceptance metadata required')


def check_tar(path, inventory):
    """Validate every uncompressed byte and reject links/devices; never extract."""
    require(type(inventory) is dict and 1 <= len(inventory) <= 20000, 'invalid archive inventory')
    expected_total = 0
    for name, record in inventory.items():
        require(type(name) is str and re.fullmatch(r'[A-Za-z0-9_./+@ -]{1,1024}', name) and not name.startswith('/') and
                '..' not in PurePosixPath(name).parts and str(PurePosixPath(name)) == name, 'unsafe archive path')
        require(type(record) is dict and set(record) == {'sha256', 'bytes', 'mode'} and type(record['bytes']) is int and
                0 <= record['bytes'] <= MAX_ASSET and type(record['mode']) is int and record['mode'] in (0o444, 0o555), 'invalid archive member record')
        sha_text(record['sha256'])
        expected_total += record['bytes']
        require(expected_total <= MAX_EXPANDED, 'expanded size bound exceeded')
    seen = set()
    # The packager emits deterministic USTAR. Do not let tarfile allocate
    # attacker-controlled PAX/GNU extension payloads before yielding a member.
    def octal(field):
        require(re.fullmatch(rb' *[0-7]+[\x00 ]*', field) is not None, 'non-octal tar field')
        return int(field.strip(b' \0') or b'0', 8)
    def text_field(field):
        value, _, padding = field.partition(b'\0')
        require(not padding.strip(b'\0'), 'noncanonical tar text')
        return value.decode('ascii')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as compressed, gzip.GzipFile(fileobj=compressed) as incoming:
        while True:
            header = incoming.read(512)
            require(len(header) == 512, 'truncated tar header')
            if header == b'\0' * 512:
                require(incoming.read(512) == b'\0' * 512, 'tar end marker differs')
                trailer = incoming.read(10241)
                require(len(trailer) <= 10240 and not trailer.strip(b'\0'), 'extra tar stream or excessive trailer')
                break
            require(header[156:157] in (b'0', b'\0') and header[257:263] == b'ustar\0' and header[263:265] == b'00',
                    'only regular USTAR headers accepted; extensions and links rejected')
            require(octal(header[148:156]) == sum(header[:148]) + 256 + sum(header[156:]), 'tar checksum differs')
            name = text_field(header[:100])
            prefix = text_field(header[345:500])
            if prefix:
                name = prefix + '/' + name
            require(name in inventory and name not in seen, 'extra or duplicate archive member')
            seen.add(name)
            record = inventory[name]
            size = octal(header[124:136])
            require(size == record['bytes'] and octal(header[100:108]) == record['mode'] and
                    octal(header[108:116]) == 0 and octal(header[116:124]) == 0 and
                    not header[157:257].strip(b'\0'), 'archive metadata differs')
            digest = hashlib.sha256()
            remaining = size
            while remaining:
                chunk = incoming.read(min(1024**2, remaining))
                require(chunk, 'truncated archive member')
                remaining -= len(chunk)
                digest.update(chunk)
            padding_size = (-size) % 512
            require(incoming.read(padding_size) == b'\0' * padding_size, 'archive padding differs')
            require(digest.hexdigest() == record['sha256'], 'archive member hash differs')
    require(seen == set(inventory), 'archive member missing')


def candidate(directory, index_pin, expected_source, now):
    index = pinned(directory / 'candidate-index.json', index_pin)
    require(type(index) is dict and set(index) == {'schema', 'source_commit', 'host_tools_commit', 'version', 'issued_at', 'assets'}, 'invalid candidate index')
    require(index['schema'] == 'rock-release-candidate-inputs/1' and index['source_commit'] == sha_text(expected_source, 40), 'candidate source differs')
    sha_text(index['host_tools_commit'], 40)
    require(type(index['issued_at']) is int and 0 < index['issued_at'] <= now, 'candidate issue time invalid')
    require(not (set(index['assets']) & OUTPUT_NAMES) and 'candidate-manifest.json' in index['assets'], 'candidate uses signing output names')
    check_records(directory, index['assets'], ignored={'candidate-index.json'})
    value = decode(read_file(directory / 'candidate-manifest.json'))
    check_manifest(value, index)
    check_tar(directory / value['archive']['name'], value['files'])
    return index, value


def write_private(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)


def crypto_sign(value, key, temporary):
    payload = temporary / 'payload.json'
    payload.write_bytes(canonical(value))
    signature = openssl('pkeyutl', '-sign', '-keyform', 'DER', '-inkey', key, '-rawin', '-in', payload)
    require(len(signature) == 64, 'invalid Ed25519 signature length')
    return {'manifest': value, 'signature': signature.hex()}


def crypto_verify(envelope, public):
    require(type(envelope) is dict and set(envelope) == {'manifest', 'signature'} and
            type(envelope['signature']) is str and re.fullmatch('[0-9a-f]{128}', envelope['signature']), 'invalid signed envelope')
    with tempfile.TemporaryDirectory(prefix='rock-offline-verify-') as directory:
        temp = Path(directory)
        (temp / 'key.der').write_bytes(public)
        (temp / 'payload').write_bytes(canonical(envelope['manifest']))
        (temp / 'signature').write_bytes(bytes.fromhex(envelope['signature']))
        openssl('pkeyutl', '-verify', '-pubin', '-keyform', 'DER', '-inkey', temp / 'key.der', '-rawin',
                '-in', temp / 'payload', '-sigfile', temp / 'signature')
    return envelope['manifest']


def sign(directory, output, index_pin, trust_path, trust_pin, fingerprint, expected_source):
    # Pop immediately: OpenSSL child processes never inherit the encoded key.
    encoded = os.environ.pop('ROCK_RELEASE_SIGNING_KEY_PKCS8_B64', '')
    require(0 < len(encoded) <= 4096, 'managed signing key not configured')
    private = base64.b64decode(encoded, validate=True)
    require(len(private) == 48 and private.startswith(PRIVATE_PREFIX), 'Ed25519 PKCS8 DER key required')
    now = int(time.time())
    trust = pinned(trust_path, trust_pin)
    public = trust_identity(trust, fingerprint, now)
    index, value = candidate(directory, index_pin, expected_source, now)
    require(not output.exists(), 'output already exists')
    with tempfile.TemporaryDirectory(prefix='rock-protected-sign-', dir=os.environ.get('RUNNER_TEMP')) as temporary:
        temp = Path(temporary)
        key = temp / 'key.der'
        write_private(key, private)
        derived = openssl('pkey', '-inform', 'DER', '-in', key, '-pubout', '-outform', 'DER')
        public_identity(derived, fingerprint)
        require(derived == public, 'managed key differs from approved identity')
        release = crypto_sign(value, key, temp)
        output.mkdir(mode=0o700)
        (output / 'release-manifest.json').write_bytes(canonical(release) + b'\n')
        (output / 'release-key.der').write_bytes(public)
        records = {name: record for name, record in index['assets'].items() if name != 'candidate-manifest.json'}
        records.update({name: file_record(output / name) for name in ('release-manifest.json', 'release-key.der')})
        auth = {'schema': 'rock-release-authentication/1', 'scope': 'PACKAGE_AUTHENTICATION_ONLY',
                'candidate_index_sha256': index_pin, 'trust_bundle_sha256': trust_pin, 'key_fingerprint': fingerprint,
                'source_commit': value['source_commit'], 'host_tools_commit': value['host_tools_commit'],
                'version': value['version'], 'issued_at': index['issued_at'], 'assets': records}
        (output / 'release-authentication.json').write_bytes(canonical(crypto_sign(auth, key, temp)) + b'\n')
        # Manifest signature is checked before producing a success result.
        crypto_verify(release, public)
        sums = records | {'release-authentication.json': file_record(output / 'release-authentication.json')}
        (output / 'SIGNED-SHA256SUMS').write_text(''.join(record['sha256'] + '  ' + name + '\n' for name, record in sorted(sums.items())))
    return {'status': 'SIGNED_NOT_LAUNCH_ACCEPTED', 'key_fingerprint': fingerprint,
            'source_commit': value['source_commit'], 'legal_status': value['legal'].get('status'),
            'acceptance_status': value['acceptance'].get('status')}


def verify(directory, trust_path, trust_pin, fingerprint, manifest_pin, expected_source):
    now = int(time.time())
    public = trust_identity(pinned(trust_path, trust_pin), fingerprint, now)
    envelope = decode(read_file(directory / 'release-authentication.json'))
    auth = crypto_verify(envelope, public)
    require(type(auth) is dict and set(auth) == {'schema', 'scope', 'candidate_index_sha256', 'trust_bundle_sha256',
        'key_fingerprint', 'source_commit', 'host_tools_commit', 'version', 'issued_at', 'assets'}, 'invalid authentication statement')
    require(auth['schema'] == 'rock-release-authentication/1' and auth['scope'] == 'PACKAGE_AUTHENTICATION_ONLY', 'invalid authentication scope')
    # Current independently pinned trust decides revocation. The signed original
    # bundle hash is provenance, not a demand to keep using an obsolete bundle.
    sha_text(auth['trust_bundle_sha256'])
    require(auth['key_fingerprint'] == fingerprint and
            auth['source_commit'] == sha_text(expected_source, 40), 'authentication pins differ')
    sha_text(auth['candidate_index_sha256'])
    require(type(auth['issued_at']) is int and 0 < auth['issued_at'] <= now, 'future release rejected')
    check_records(directory, auth['assets'], ignored={'release-authentication.json', 'SIGNED-SHA256SUMS'})
    require(read_file(directory / 'release-key.der', 44) == public, 'included key differs')
    release_envelope = pinned(directory / 'release-manifest.json', manifest_pin)
    value = crypto_verify(release_envelope, public)
    check_manifest(value, auth)
    check_tar(directory / value['archive']['name'], value['files'])
    expected_sums = auth['assets'] | {'release-authentication.json': file_record(directory / 'release-authentication.json')}
    expected = ''.join(record['sha256'] + '  ' + name + '\n' for name, record in sorted(expected_sums.items())).encode()
    require(read_file(directory / 'SIGNED-SHA256SUMS') == expected, 'checksums list differs')
    return {'status': 'AUTHENTICATED_NOT_LAUNCH_ACCEPTED', 'source_commit': value['source_commit'], 'key_fingerprint': fingerprint}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('check-candidate', 'sign', 'verify'):
        item = sub.add_parser(name)
        item.add_argument('--directory', type=Path, required=True)
        item.add_argument('--source', required=True)
        if name in ('check-candidate', 'sign'):
            item.add_argument('--index-sha256', required=True)
        if name in ('sign', 'verify'):
            item.add_argument('--trust-bundle', type=Path, required=True)
            item.add_argument('--trust-sha256', required=True)
            item.add_argument('--fingerprint', required=True)
        if name == 'sign':
            item.add_argument('--output', type=Path, required=True)
        if name == 'verify':
            item.add_argument('--manifest-sha256', required=True)
    args = parser.parse_args()
    if args.command == 'check-candidate':
        candidate(args.directory, args.index_sha256, args.source, int(time.time()))
        result = {'status': 'CANDIDATE_BYTES_CHECKED_NOT_ACCEPTED'}
    elif args.command == 'sign':
        result = sign(args.directory, args.output, args.index_sha256, args.trust_bundle, args.trust_sha256, args.fingerprint, args.source)
    else:
        result = verify(args.directory, args.trust_bundle, args.trust_sha256, args.fingerprint, args.manifest_sha256, args.source)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        main()
    except (ValueError, OSError, EOFError, zlib.error, subprocess.SubprocessError, KeyboardInterrupt, KeyError, TypeError):
        # Never print input, key data, environment, OpenSSL stderr, or a traceback.
        print('Release authentication rejected; check configured pins and protected inputs.', file=sys.stderr)
        sys.exit(1)
