#!/usr/bin/env python3
"""Bind a signed Game profile derivation to its already frozen native build.

The base build remains intact. Read-only filesystem inventories independently
limit the derivation to its two declared private Wallet files and directory.
This freezes provenance; it does not mark any guest acceptance gate passed.
"""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('native_build_freeze', Path(__file__).with_name('freeze-native-build.py'))
build_freeze = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_freeze)
require, digest = build_freeze.require, build_freeze.digest
NAMES = build_freeze.IMAGE_NAMES
METADATA = ('buildroot.config', 'linux.config', 'source-lock.json', 'build.log')


def read(path, maximum=4*1024*1024):
    info = path.lstat()
    require(path == path.resolve(strict=True) and stat.S_ISREG(info.st_mode) and
            info.st_nlink == 1 and info.st_uid == os.geteuid() and not info.st_mode & 0o022 and
            0 < info.st_size <= maximum, 'owned bounded metadata file required: ' + str(path))
    return path.read_bytes()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()


def write(path, raw):
    with path.open('xb') as stream:
        stream.write(raw); stream.flush(); os.fsync(stream.fileno())
    path.chmod(0o444)


def verify_base(manifest, source_files, archive, commit, report, images):
    require(manifest.get('schema') == 'rock-build-freeze/2' and
            manifest.get('status') == 'BUILD_COMPLETE_FROZEN' and 'profile_derivation' not in manifest,
            'original native base freeze required')
    require(manifest.get('source_commit') == commit and manifest.get('source_files_sha256') == source_files and
            manifest.get('source_archive_sha256') == digest(archive) and
            manifest.get('source_report_sha256') == digest(report), 'base freeze belongs to another tested source')
    require(manifest.get('files_sha256') == {name: digest(images/name) for name in NAMES}, 'base image triple changed')
    for name in NAMES:
        info = (images/name).lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.geteuid() and
                not info.st_mode & 0o222 and info.st_size == manifest['file_identities'][name]['size'],
                'base image is not an immutable owned single-link file')
    expected = dict(manifest['configuration_sha256'], **{'build.log': manifest['build_log_sha256']})
    require(set(expected) == set(METADATA) | {'SHA256SUMS'} and
            all(digest(images/name) == value for name, value in expected.items()), 'base build metadata changed')


def freeze(source, archive, commit, report, base, images, evidence):
    require(sys.platform == 'linux', 'actual Linux image host required')
    for path in (source, base, images):
        require(path == path.resolve(strict=True), 'canonical input directories required')
    require(Path(__file__).resolve() == source/'scripts/freeze-native-profile.py', 'execute the tool from the frozen source')
    require(not images.is_relative_to(base) and images != base, 'separate derived image directory required')
    require(not os.path.lexists(evidence) and evidence.parent == evidence.parent.resolve(strict=True), 'fresh evidence directory required')
    require(not os.path.lexists(images/'freeze-manifest.json') and
            not os.path.lexists(images/'base-freeze-manifest.json'), 'candidate is already frozen')
    files = build_freeze.verify_source(source, archive, commit)
    build_freeze.verify_regressions(source, report, files)
    base_raw = read(base/'freeze-manifest.json')
    original = json.loads(base_raw)
    verify_base(original, files, archive, commit, report, base)
    profile_raw = read(images/'profile.json')
    profile_record = json.loads(profile_raw)
    require(profile_record.get('source_commit') == commit and profile_record.get('base_images_unchanged') is True and
            profile_record.get('device_data_created') is False and profile_record.get('initial_state') == 'empty-unregistered-no-consent',
            'profile source, untouched base and empty initial-state record required')
    require({name: profile_record['base_images'][name]['sha256'] for name in NAMES} == original['files_sha256'] and
            all(Path(profile_record['base_images'][name]['path']) == base/name for name in NAMES),
            'profile derives from another base')
    sys.path[:0] = [str(source/'systems/rock-star-os/os'), str(source/'systems/rock-star-os/os/desktop')]
    from game_exchange import profile
    import image_inventory
    binding = profile.verified(profile.device_config(images, 'frozen-profile-verification'))
    require(profile.source_guard(base/'rootfs.ext4', configured=False) == binding['source_sha256'], 'base and profile embedded source differ')
    initial = profile.base._stage0(base/'stage0.cpio.gz')
    final = profile.base._stage0(images/'stage0.cpio.gz')
    require(initial['other_entries_sha256'] == final['other_entries_sha256'] == profile_record['stage0']['other_entries_sha256'] and
            initial['entry_count'] == final['entry_count'] == profile_record['stage0']['entry_count'] and
            hashlib.sha256(initial['factory']).hexdigest() == profile_record['stage0']['input_factory_sha256'],
            'stage0 changed outside the signed factory')
    require(digest(images/'Image') == original['files_sha256']['Image'], 'profile changed the kernel')
    evidence.mkdir(mode=0o700)
    before = image_inventory.inventory(base/'rootfs.ext4', evidence)
    after = image_inventory.inventory(images/'rootfs.ext4', evidence)
    changes = image_inventory.compare(before, after, profile_record['injected_files'])
    inventories = {}
    for name, value in (('base-rootfs-inventory.json', before), ('profile-rootfs-inventory.json', after)):
        write(evidence/name, canonical(value)+b'\n')
        inventories[name] = {'sha256': digest(evidence/name), 'path_count': value['path_count'], 'content_bytes': value['content_bytes']}
    for name in METADATA:
        write(images/name, read(base/name, 16*1024*1024))
    current = {name: digest(images/name) for name in NAMES}
    write(images/'SHA256SUMS', ''.join(current[name]+'  '+name+'\n' for name in NAMES).encode())
    write(images/'base-freeze-manifest.json', base_raw)
    result = copy.deepcopy(original)
    result.update(measured_utc=datetime.now(timezone.utc).isoformat(), files_sha256=current,
        file_identities={name: dict(zip(('device','inode','size','mtime_ns'),
            ((info := (images/name).stat()).st_dev,info.st_ino,info.st_size,info.st_mtime_ns))) for name in NAMES},
        configuration_sha256={name: digest(images/name) for name in ('buildroot.config','linux.config','source-lock.json','SHA256SUMS')},
        base_build={'manifest_sha256': hashlib.sha256(base_raw).hexdigest(), 'manifest': original},
        profile_derivation={'schema':'rock-native-profile-derivation/1', 'status':'DERIVATION_VERIFIED_FROZEN',
            'profile':'development-game-authority', 'profile_sha256': hashlib.sha256(profile_raw).hexdigest(),
            'base_images_sha256': original['files_sha256'], 'images_sha256': current,
            'source_guard':'PASS_EXACT_BYTES', 'base_images_unchanged':True,
            'stage0_other_entries_sha256':initial['other_entries_sha256'],
            'filesystem_comparison':{'status':'PASS_EXACT_DECLARED_ADDITIONS','changes':changes,'inventories':inventories,
                'coverage':'all filesystem paths, inode number, uid/gid, mode, regular file bytes and symlink targets',
                'excluded_metadata':'filesystem allocation and timestamps; directory byte size'},
            'initial_state':profile_record['initial_state'], 'authority_id':profile_record['authority_id'],
            'sandbox_configuration_sha256':profile_record['sandbox_configuration_sha256'], 'guest_acceptance':'NOT_RUN'})
    verify_base(original, files, archive, commit, report, base)
    require(read(images/'profile.json') == profile_raw and current == {name:digest(images/name) for name in NAMES}, 'profile changed while frozen')
    for name in NAMES: (images/name).chmod(0o444)
    write(images/'freeze-manifest.json', json.dumps(result, ensure_ascii=False, indent=2).encode()+b'\n')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('source-root','source-archive','source-report','base-images','images-dir','evidence-dir'):
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--source-commit', required=True)
    args = parser.parse_args()
    result = freeze(args.source_root.absolute(), args.source_archive.absolute(), args.source_commit,
        args.source_report.absolute(), args.base_images.absolute(), args.images_dir.absolute(), args.evidence_dir.absolute())
    print(json.dumps({key:result[key] for key in ('status','source_commit','files_sha256','profile_derivation')}, indent=2))


if __name__ == '__main__':
    main()
