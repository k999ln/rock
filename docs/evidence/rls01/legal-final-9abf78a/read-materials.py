"""Read retained legal materials; create a new inventory, never rewrite inputs."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import tarfile


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--inspection', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    assert not args.output.exists()
    inspection_bytes = args.inspection.read_bytes()
    inspection_sha = hashlib.sha256(inspection_bytes).hexdigest()
    prior = json.loads(inspection_bytes)
    manifest = prior['corresponding_sources_manifests']['manifest.json']
    assert prior['status'] == 'REGULAR_ARCHIVE_READBACK_PASS_NOT_LICENSE_CLEARANCE'
    archive_sha = sha(args.archive)
    assert archive_sha == prior['archive_sha256']
    files = manifest['files']
    prefix = 'systems/rock-star-os/'
    selected_source = {
        'vendor/mr/LICENSE', 'docs/preview-legal-notice.md',
        'scripts/freeze-native-build.py', 'scripts/freeze-native-profile.py',
        *[prefix + n for n in (
            'os/tools/NOTICE-Mr.txt', 'os/assets/NotoSansCJK-LICENSE.txt',
            'os/desktop/browser/novnc/LICENSE.txt', 'os/desktop/browser/novnc/AUTHORS',
            'os/desktop/browser/novnc/vendor/pako/LICENSE',
            'os/desktop/browser-intake/LICENSE.txt', 'os/build-os.sh',
            'os/buildroot/configs/rock_virt_aarch64_defconfig',
            'os/buildroot/board/rock-virt/post-build.sh',
            'os/buildroot/board/rock-virt/linux.fragment',
            'os/buildroot/board/rock-virt/busybox.fragment',
            'os/game_exchange/profile.py', 'os/update/build-initramfs.py',
            *['os/buildroot/package/' + n + '/' + n + '.mk'
              for n in ('rock-core', 'rock-platform', 'rock-ui')])],
    }
    selected_outer = {
        'buildroot-legal-info/README', 'buildroot-legal-info/manifest.csv',
        'buildroot-legal-info/host-manifest.csv', 'provenance/make-legal-info.log',
        'provenance/freeze-manifest.json', 'provenance/base-freeze-manifest.json',
    }
    raw = {}
    source_items = {}
    libtool_items = {}
    with tarfile.open(args.archive, 'r|gz') as outer:
        for member in outer:
            if member.name in selected_outer:
                assert member.isfile() and member.size < 2 * 1024**2
                data = outer.extractfile(member).read()
                assert hashlib.sha256(data).hexdigest() == files[member.name]['sha256']
                raw[member.name] = data
            elif member.name == 'corresponding-source/rock-source.tar':
                with tarfile.open(fileobj=outer.extractfile(member), mode='r|') as source:
                    assert source.pax_headers['comment'] == manifest['source_commit']
                    for item in source:
                        if item.name in selected_source:
                            assert item.isfile() and item.size < 2 * 1024**2
                            data = source.extractfile(item).read()
                            source_items[item.name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                            if item.name.endswith('.mk'):
                                source_items[item.name]['license_settings'] = [
                                    line for line in data.decode().splitlines()
                                    if 'LICENSE' in line or 'REDISTRIBUTE' in line]
            elif member.name == 'corresponding-source/buildroot-2026.08.tar.xz':
                with tarfile.open(fileobj=outer.extractfile(member), mode='r|xz') as buildroot:
                    for item in buildroot:
                        if '/support/libtool/' in item.name and item.isfile():
                            assert item.size < 2 * 1024**2
                            data = buildroot.extractfile(item).read()
                            libtool_items[item.name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    assert set(raw) == selected_outer and set(source_items) == selected_source
    freeze = json.loads(raw['provenance/freeze-manifest.json'])
    assert all(freeze['source_files_sha256'][n] == v['sha256'] for n, v in source_items.items())
    assert libtool_items
    warnings = [line for line in raw['provenance/make-legal-info.log'].decode().splitlines() if line.startswith('WARNING:')]
    assert warnings == manifest['warnings']
    assert all(line in raw['buildroot-legal-info/README'].decode() for line in warnings)
    assert sha(args.archive) == archive_sha and sha(args.inspection) == inspection_sha
    report = {
        'schema': 'rock-final-legal-material-inventory/1',
        'status': 'MATERIAL_INVENTORY_ONLY_NOT_LICENSE_CLEARANCE',
        'source_commit': manifest['source_commit'], 'legal': manifest['legal'],
        'inputs': {'archive': {'bytes': args.archive.stat().st_size, 'sha256': archive_sha},
                   'prior_full_readback_sha256': inspection_sha},
        'scope': 'Original archive hash plus selected raw members and nested build/source materials re-read; complete 298-member readback is the separately bound prior report. No permission, licensing choice, legal interpretation, or public release approval is created.',
        'original_warning_lines': warnings,
        'buildroot_readme_exact': raw['buildroot-legal-info/README'].decode(),
        'selected_outer_members': {n: files[n] for n in sorted(selected_outer)},
        'nested_exact_source_members': source_items,
        'manually_collected_buildroot_libtool_members': libtool_items,
        'original_package_metadata': {name: [{k: item[k] for k in ('PACKAGE', 'VERSION', 'LICENSE', 'LICENSE FILES', 'SOURCE ARCHIVE')} for item in rows]
                                      for name, rows in manifest['package_manifests'].items()},
        'counts': {'regular_members_in_prior_full_readback': prior['file_count'],
                   'full_git_source_files_in_prior_readback': prior['full_git_archive_file_count'],
                   'category_files': dict(Counter('/'.join(n.split('/')[:2]) for n in files)),
                   'patch_files': sum(n.endswith('.patch') for n in files),
                   'patch_series_files': sum(n.endswith('/series') for n in files)},
        'build_environment_from_original_base_freeze': json.loads(raw['provenance/base-freeze-manifest.json'])['environment'],
        'archive_unchanged_after_review': True,
    }
    with args.output.open('x') as stream:
        stream.write(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'archive_unchanged': True, 'nested_source_members': len(source_items), 'libtool_members': len(libtool_items), 'output_sha256': sha(args.output)}))


if __name__ == '__main__':
    main()
