#!/usr/bin/env python3
"""Reproducible macOS/ARM64 Developer Preview candidate packager.

Packages tracked source from an explicit commit and an immutable image triple.
No user state, Lima image, generated secret, private key or build cache is copied.
Packaging is not an OS/fresh-install acceptance or a redistribution clearance.
"""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile

sys.dont_write_bytecode = True
import preview

NATIVE_PREFIX = 'systems/rock-star-os/'
PUBLIC_TEST_SEED = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'


def sign(value, key=None, *, development=False):
    preview.require((key is None) == development, 'choose an existing Ed25519 signing key OR explicit public test signing')
    with tempfile.TemporaryDirectory(prefix='rock-preview-sign-') as directory:
        temp = Path(directory)
        if development:
            key = temp / 'public-test-seed.der'
            key.write_bytes(bytes.fromhex('302e020100300506032b657004220420' + PUBLIC_TEST_SEED))
            key.chmod(0o600)
            key_args = ['-keyform', 'DER']
        else:
            preview.require(Path(key).is_file() and not Path(key).is_symlink(), 'existing signing key required; no key is generated')
            key_args = []
        (temp / 'manifest').write_bytes(preview.canonical(value))
        binary = preview.openssl()
        public = subprocess.check_output([binary, 'pkey', *(['-inform', 'DER'] if development else []),
                                          '-in', str(key), '-pubout', '-outform', 'DER'], timeout=30)
        preview.require(len(public) == 44 and public[:12] == bytes.fromhex('302a300506032b6570032100'), 'Ed25519 release key required')
        signature = subprocess.check_output([binary, 'pkeyutl', '-sign', *key_args, '-inkey', str(key),
                                             '-rawin', '-in', str(temp / 'manifest')], timeout=30)
    preview.require(len(signature) == 64, 'Ed25519 signature required')
    return {'manifest': value, 'signature': signature.hex()}, public


def add_file(archive, path, name, files, epoch):
    preview.safe_member(name)
    info = path.lstat()
    preview.require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= preview.MAX_ARCHIVE,
                    'packager accepts bounded single-link regular files only')
    mode = 0o555 if info.st_mode & 0o111 else 0o444
    entry = tarfile.TarInfo(name)
    entry.size, entry.mode, entry.mtime = info.st_size, mode, epoch
    entry.uid = entry.gid = 0
    entry.uname = entry.gname = ''
    before = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
    with path.open('rb') as source:
        archive.addfile(entry, source)
    after = path.lstat()
    preview.require(before == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
                    'package input changed during archive creation')
    files[name] = {'bytes': info.st_size, 'mode': mode, 'sha256': preview.digest(path)}


def source_tree(repository, commit, target):
    """git archive selects only committed files; never package arbitrary checkout contents."""
    raw = subprocess.check_output(['git', '-C', str(repository), 'archive', '--format=tar', commit + ':' + NATIVE_PREFIX[:-1]])
    target.mkdir(mode=0o755)
    with tarfile.open(fileobj=io.BytesIO(raw)) as source:
        for member in source:
            name = preview.safe_member(member.name.rstrip('/'))
            path = target / name
            if member.isdir():
                path.mkdir(parents=True, exist_ok=True)
            else:
                preview.require(member.isfile(), 'tracked native symlinks/devices require an explicit packaging design')
                path.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(member) as incoming, path.open('xb') as output:
                    shutil.copyfileobj(incoming, output)
                path.chmod(0o755 if member.mode & 0o111 else 0o644)


def frozen_native_inputs(tree, inventory):
    """Select committed inputs, even if validation imports create local caches."""
    result = []
    for name, expected in sorted(inventory.items()):
        preview.require(name.startswith(NATIVE_PREFIX), 'native inventory prefix required')
        relative = preview.safe_member(name[len(NATIVE_PREFIX):])
        path = tree / 'native' / relative
        preview.require(preview.digest(path) == expected, 'native source changed during validation')
        result.append(('native/' + relative, path))
    return result


def release_profile(tree, images, commit, raw_factory, profile_name, freeze):
    factory_sha256 = hashlib.sha256(raw_factory).hexdigest()
    boot = {'mode': 'signed-stage0', 'profile': profile_name, 'factory_sha256': factory_sha256}
    if profile_name == 'local-development':
        preview.require(not (images / 'profile.json').exists(),
                        'configured images cannot be relabelled as a local-only release')
        return boot, None, []
    preview.require(profile_name == 'development-game-authority', 'unsupported release boot profile')
    profile_path = images / 'profile.json'
    info = profile_path.lstat()
    preview.require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and not info.st_mode & 0o222,
                    'immutable single-link Game image profile required')
    record = preview.decode(preview.read(profile_path))
    preview.require(record.get('schema') == 'rock-game-authority-image-profile/1' and
                    record.get('status') == 'PREPARED' and record.get('profile') == profile_name and
                    record.get('source_commit') == commit and record.get('authority_id') == preview.GAME_AUTHORITY and
                    record.get('simulation_only') is True and record.get('device_data_created') is False and
                    record.get('base_images_unchanged') is True and
                    record.get('initial_state') == 'empty-unregistered-no-consent',
                    'exact source-bound empty public Game profile required')
    preview.require(record.get('stage0', {}).get('output_factory_sha256') == factory_sha256 and
                    record['stage0'].get('output_factory') == preview.decode(raw_factory),
                    'Game profile and signed factory differ')
    for name in preview.IMAGE_NAMES:
        item = record.get('images', {}).get(name, {})
        preview.require(item.get('sha256') == preview.digest(images / name) and
                        item.get('size') == (images / name).stat().st_size,
                        'Game profile and image triple differ')
    config_path = tree / preview.GAME_CONFIG_MEMBER
    raw_config = preview.read(config_path)
    configuration = preview.decode(raw_config)
    preview.require(raw_config == preview.canonical(configuration) + b'\n' and
                    configuration == record.get('sandbox_configuration') and
                    configuration.get('state') == preview.GAME_STATE and
                    configuration.get('authority_id') == preview.GAME_AUTHORITY and
                    configuration.get('simulation_only') is True and
                    hashlib.sha256(raw_config).hexdigest() == record.get('sandbox_configuration_sha256'),
                    'committed public sandbox config differs from the prepared image')
    boot['profile_sha256'] = preview.digest(profile_path)
    base_path = images / 'base-freeze-manifest.json'
    base_raw = preview.read(base_path)
    base_record = preview.decode(base_raw)
    preview.require(type(freeze.get('base_build')) is dict and
                    freeze['base_build'].get('manifest_sha256') == hashlib.sha256(base_raw).hexdigest() and
                    freeze['base_build'].get('manifest') == base_record and
                    base_record.get('schema') == 'rock-build-freeze/2' and
                    base_record.get('status') == 'BUILD_COMPLETE_FROZEN' and base_record.get('source_commit') == commit and
                    freeze.get('profile_derivation', {}).get('profile_sha256') == boot['profile_sha256'],
                    'exact base-build bytes and explicit profile derivation binding required')
    preview.require({name: record.get('base_images', {}).get(name, {}).get('sha256') for name in preview.IMAGE_NAMES} ==
                    base_record.get('files_sha256'), 'profile base image identities differ from the original frozen build')
    game = {'authority_id': preview.GAME_AUTHORITY, 'config': preview.GAME_CONFIG,
            'sha256': record['sandbox_configuration_sha256'], 'config_member': preview.GAME_CONFIG_MEMBER}
    return boot, game, [('images/profile.json', profile_path), ('provenance/base-freeze-manifest.json', base_path)]


def export_unsigned(args, value, tree):
    """Emit unsigned inputs only; signature/installer acceptance remains downstream."""
    preview.require(value['trust'] == 'EXTERNAL_RELEASE_KEY' and
                    value['legal']['status'] == 'NOT_CLEARED' and value['acceptance']['status'] == 'CANDIDATE',
                    'unsigned export cannot change trust or acceptance')
    (args.output / 'candidate-manifest.json').write_bytes(preview.canonical(value) + b'\n')
    shutil.copyfile(tree / 'native/os/desktop/preview.py', args.output / 'preview.py')
    for name in ('preview-installation-ja.md', 'preview-release-notes.md', 'preview-legal-notice.md'):
        shutil.copyfile(tree / 'docs' / name, args.output / name)
    assets = {path.name: {'sha256': preview.digest(path), 'bytes': path.stat().st_size}
              for path in sorted(args.output.iterdir())}
    result = {'schema': 'rock-preview-unsigned-export/1', 'status': 'UNSIGNED_PACKAGE_NOT_ACCEPTED',
              'source_commit': value['source_commit'], 'host_tools_commit': value['host_tools_commit'],
              'version': value['version'],
              'producer': {'path': NATIVE_PREFIX + 'os/desktop/package_preview.py',
                           'sha256': preview.digest(Path(__file__))},
              'assets': assets}
    (args.output / 'candidate-export.json').write_bytes(preview.canonical(result) + b'\n')
    return result


def make(args):
    repository = args.repository.resolve(strict=True)
    commit = subprocess.check_output(['git', '-C', str(repository), 'rev-parse', args.source + '^{commit}'], text=True).strip()
    preview.require(commit == args.source, '--source must be the complete immutable 40-character commit')
    if getattr(args, 'unsigned_external', False):
        preview.require(not getattr(args, 'public_test_signature', False) and getattr(args, 'signing_key', None) is None,
                        'unsigned export is mutually exclusive with every signing mode')
        preview.require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}', args.version), 'safe explicit new version required')
    preview.require(not args.output.exists(), 'output already exists; select a new release directory')
    images = args.images.resolve(strict=True)
    image_hashes = {name: preview.digest(images / name) for name in preview.IMAGE_NAMES}
    freeze = preview.decode(preview.read(images / 'freeze-manifest.json'))
    preview.require(freeze.get('schema') == 'rock-build-freeze/2' and
                    freeze.get('status') == 'BUILD_COMPLETE_FROZEN' and freeze.get('source_commit') == commit and
                    freeze.get('files_sha256') == image_hashes and freeze.get('archive_commit_verified') is True and
                    freeze.get('source_tests', {}).get('status') == 'PASS' and
                    freeze.get('source_tests', {}).get('source_unchanged') is True,
                    'an exact source-tested frozen build record is required; do not relabel an older image')
    for path in (Path(__file__), Path(preview.__file__)):
        field = NATIVE_PREFIX + 'os/desktop/' + path.name
        preview.require(freeze.get('source_files_sha256', {}).get(field) == preview.digest(path),
                        'running packager/bootstrap differs from the frozen host tools')
    epoch = int(subprocess.check_output(['git', '-C', str(repository), 'show', '-s', '--format=%ct', commit], text=True))
    args.output.mkdir(parents=True, mode=0o700)
    with tempfile.TemporaryDirectory(prefix='rock-preview-package-') as temporary:
        tree = Path(temporary)
        source_tree(repository, commit, tree / 'native')
        actual_source = {NATIVE_PREFIX + str(path.relative_to(tree / 'native')): preview.digest(path)
                         for path in (tree / 'native').rglob('*') if path.is_file()}
        frozen_source = {name: value for name, value in freeze.get('source_files_sha256', {}).items()
                         if name.startswith(NATIVE_PREFIX)}
        preview.require(actual_source == frozen_source, 'frozen native sources and host tools are from different bytes')
        # Reuse the original bounded stage0 decoder and Ed25519 verifier from
        # this exact source. Full embedded-source preflight runs in the new VM.
        sys.path[:0] = [str(tree / 'native/src'), str(tree / 'native/os')]
        os.environ['PATH'] = str(Path(preview.openssl()).parent) + os.pathsep + os.environ.get('PATH', '')
        from service_access import profile
        raw_factory = profile._stage0(images / 'stage0.cpio.gz')['factory']
        _, update = profile._update_helpers()
        factory = update.verify_envelope(update.decode(raw_factory, 8192))
        preview.require(factory['sha256'] == image_hashes['rootfs.ext4'] and
                        factory['size'] == (images / 'rootfs.ext4').stat().st_size,
                        'signed stage0 factory does not match the package rootfs')
        boot, game, profile_inputs = release_profile(tree, images, commit, raw_factory, args.boot_profile, freeze)
        docs = tree / 'docs'
        docs.mkdir()
        for name in ('preview-installation-ja.md', 'preview-release-notes.md', 'preview-legal-notice.md'):
            raw = subprocess.check_output(['git', '-C', str(repository), 'show', commit + ':docs/' + name])
            (docs / name).write_bytes(raw)
        archive_name = 'rockstaros-' + args.version + '-macos-arm64.tar.gz'
        archive_path = args.output / archive_name
        files = {}
        with archive_path.open('xb') as raw_output, gzip.GzipFile(filename='', mode='wb', fileobj=raw_output, mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode='w|', format=tarfile.USTAR_FORMAT) as archive:
                inputs = frozen_native_inputs(tree, frozen_source)
                inputs += [('docs/' + path.name, path) for path in docs.iterdir()]
                inputs += [('images/' + name, images / name) for name in preview.IMAGE_NAMES]
                inputs += profile_inputs
                inputs += [('provenance/freeze-manifest.json', images / 'freeze-manifest.json')]
                for name, expected in freeze['configuration_sha256'].items():
                    preview.safe_member(name)
                    preview.require('/' not in name and preview.digest(images / name) == expected,
                                    'frozen build configuration differs')
                    inputs += [('provenance/' + name, images / name)]
                if args.legal_info:
                    inputs += [('legal/buildroot-legal-info.tar.gz', args.legal_info.resolve(strict=True))]
                for name, path in sorted(inputs):
                    add_file(archive, path, name, files, epoch)
        preview.require(image_hashes == {name: preview.digest(images / name) for name in preview.IMAGE_NAMES},
                        'input image triple changed during packaging')
        value = {'schema': preview.SCHEMA, 'product': preview.TITLE, 'version': args.version,
                 'source_commit': commit, 'host_tools_commit': commit,
                 'host': {'os': 'macOS', 'tested_version': '15.7.4', 'architecture': 'arm64',
                          'lima_version': '2.2.0', 'vm_type': 'vz', 'base_image': preview.BASE_IMAGE},
                 'archive': {'name': archive_name, 'sha256': preview.digest(archive_path), 'bytes': archive_path.stat().st_size},
                 'files': files, 'image_sha256': image_hashes, 'factory_sha256': hashlib.sha256(raw_factory).hexdigest(),
                 'boot': boot, 'game': game,
                 'display': preview.PREVIEW_DISPLAY,
                 'trust': 'PUBLIC_RFC8032_DEVELOPMENT_ONLY' if args.public_test_signature else 'EXTERNAL_RELEASE_KEY',
                 'legal': {'status': 'NOT_CLEARED', 'product_license': 'not specified in source; no new terms invented',
                           'buildroot_legal_info_included': args.legal_info is not None,
                           'notice': 'docs/preview-legal-notice.md'},
                 'acceptance': {'status': 'CANDIDATE', 'meaning': 'Build/package integrity only. Immutable archive must be bound to separate D0-D6, Game/SDK and fresh-install acceptance.'}}
        if getattr(args, 'unsigned_external', False):
            return export_unsigned(args, value, tree)
        envelope, public = sign(value, args.signing_key, development=args.public_test_signature)
        (args.output / 'release-manifest.json').write_bytes(preview.canonical(envelope) + b'\n')
        (args.output / 'release-key.der').write_bytes(public)
        for name in ('preview.py',):
            shutil.copyfile(tree / 'native/os/desktop' / name, args.output / name)
        for path in docs.iterdir():
            shutil.copyfile(path, args.output / path.name)
        checked = preview.verify_release(args.output / 'release-manifest.json', archive_path,
                   args.output / 'release-key.der', preview.digest(args.output / 'release-key.der'),
                   manifest_sha256=preview.digest(args.output / 'release-manifest.json'),
                   allow_public_test_key=args.public_test_signature)
        result = {'status': 'PACKAGED_NOT_ACCEPTED', 'source_commit': commit, 'archive': checked['archive'],
                  'manifest_sha256': preview.digest(args.output / 'release-manifest.json'),
                  'key_sha256': preview.digest(args.output / 'release-key.der'), 'trust': checked['trust'],
                  'legal_status': 'NOT_CLEARED', 'files': len(files)}
        preview.save(args.output / 'packaging-result.json', result)
        with (args.output / 'SHA256SUMS').open('x') as output:
            for path in sorted(args.output.iterdir()):
                if path.name != 'SHA256SUMS':
                    output.write(preview.digest(path) + '  ' + path.name + '\n')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--images', type=Path, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--boot-profile', choices=('local-development', 'development-game-authority'), required=True)
    parser.add_argument('--output', type=Path, required=True)
    signer = parser.add_mutually_exclusive_group(required=True)
    signer.add_argument('--public-test-signature', action='store_true')
    signer.add_argument('--signing-key', type=Path)
    signer.add_argument('--unsigned-external', action='store_true',
                        help='export unsigned external-key candidate inputs; no signature or acceptance claim')
    parser.add_argument('--legal-info', type=Path)
    args = parser.parse_args()
    print(json.dumps(make(args), indent=2))


if __name__ == '__main__':
    main()
