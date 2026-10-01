#!/usr/bin/env python3
"""Bind a completed native build to its tested Git archive; never boot a guest.

This records one build, including cache reuse. It does not assert that a build
is reproducible, accepted for release, licensed for distribution, or deployed.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import stat
import subprocess
import sys
import tarfile


IMAGE_NAMES = ('Image', 'rootfs.ext4', 'stage0.cpio.gz')


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def exact_sha(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{40}', value) is not None


def verify_source(source, archive_path, commit):
    require(exact_sha(commit), 'exact 40-character source commit required')
    require(source.resolve(strict=True) == source, 'canonical source directory required')
    files = {}
    with tarfile.open(archive_path) as archive:
        require(archive.pax_headers.get('comment') == commit, 'Git archive commit mismatch')
        for member in archive:
            path = Path(member.name)
            require(not path.is_absolute() and '..' not in path.parts and member.name not in files,
                    'unsafe or duplicate source archive path')
            actual = source / path
            require(actual.parent.resolve(strict=True) == actual.parent, 'source parent is an alias')
            if member.isfile():
                require(actual.is_file() and not actual.is_symlink(), 'source missing or aliased: ' + member.name)
                require(not actual.stat().st_mode & 0o022, 'source is group/world writable: ' + member.name)
                with archive.extractfile(member) as stream:
                    expected = hashlib.file_digest(stream, 'sha256').hexdigest()
                require(digest(actual) == expected, 'source changed: ' + member.name)
                files[member.name] = expected
            elif member.isdir():
                require(actual.is_dir() and not actual.is_symlink(), 'source directory changed')
                require(not actual.stat().st_mode & 0o022, 'source directory is group/world writable')
            elif member.issym():
                require(actual.is_symlink() and os.readlink(actual) == member.linkname, 'source link changed')
            else:
                raise ValueError('unsupported source archive member')
    require(bool(files), 'source archive is empty')
    return files


def verify_regressions(source, report_path, source_files):
    report = json.loads(report_path.read_text())
    require(report.get('schema') == 'rock-native-regressions/1' and report.get('status') == 'PASS' and
            report.get('source_unchanged') is True and report.get('changed_inputs') == [],
            'completed clean native regression report required')
    checks = report.get('checks')
    require(isinstance(checks, list) and checks and all(
        check.get('passed') is True and type(check.get('exit_code')) is int and check['exit_code'] == 0 and
        check.get('skipped') is False and check.get('unclean_log') is False for check in checks),
        'all native checks must pass without skips or unclean logs')
    count = report.get('total_python_test_executions')
    require(type(count) is int and count > 0 and count == sum(check['tests'] for check in checks),
            'native test totals differ')
    inputs = report.get('input_sha256')
    require(isinstance(inputs, dict) and 'scripts/test-native.py' in inputs and
            '.github/workflows/native-os.yml' in inputs, 'native report lacks source inventory')
    required_inputs = {name: value for name, value in source_files.items() if
        name in ('scripts/test-native.py', '.github/workflows/native-os.yml') or
        (name.startswith('systems/rock-star-os/') and Path(name).suffix not in ('.pyc', '.o') and
         not any(part in ('artifacts', '__pycache__', '.venv', '.git', 'build') or
                 part.endswith('.egg-info') for part in Path(name).parts[2:]))}
    require(inputs == required_inputs, 'native regression inventory does not cover the source archive')
    for name, expected in inputs.items():
        require(source_files.get(name) == expected and digest(source / name) == expected,
                'native report belongs to another input: ' + name)
    require(report.get('started_utc') and report.get('finished_utc'), 'native report has no completed interval')
    return report


def environment(build):
    def command(argv):
        return subprocess.check_output(argv, text=True, timeout=30).strip()
    return {'host_os_release': Path('/etc/os-release').read_text(),
            'host_kernel': platform.release(), 'architecture': platform.machine(),
            'compiler': command([str(build/'output/host/bin/aarch64-buildroot-linux-musl-gcc'), '--version']),
            'qemu': command(['qemu-system-aarch64', '--version']), 'python': platform.python_version()}


def freeze(source, archive_path, commit, report_path, build, images, cache_origin=None):
    output = images / 'freeze-manifest.json'
    require(not os.path.lexists(output), 'freeze manifest already exists; use a new candidate')
    require(images.resolve(strict=True) == images and build.resolve(strict=True) == build,
            'canonical build and image directories required')
    require(cache_origin is None or exact_sha(cache_origin), 'exact cache-origin commit required')
    source_files = verify_source(source, archive_path, commit)
    regressions = verify_regressions(source, report_path, source_files)
    log = (images/'build.log').read_text()
    started = re.findall(r'^Build started: (.+)$', log, re.M)
    finished = re.findall(r'^Build finished: (.+)$', log, re.M)
    require(len(started) == len(finished) == 1 and finished[0] >= started[0],
            'one completed build interval required')
    files, identities = {}, {}
    for name in IMAGE_NAMES:
        path = images / name
        before = path.lstat()
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_uid == os.getuid() and
                before.st_size > 1024*1024, 'owned, single-link image required: ' + name)
        files[name] = digest(path)
        after = path.lstat()
        identity = lambda info: (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)
        require(identity(before) == identity(after), 'image changed while measured')
        identities[name] = dict(zip(('device', 'inode', 'size', 'mtime_ns'), identity(after)))
    sums = {}
    for line in (images/'SHA256SUMS').read_text().splitlines():
        checksum, name = line.split()
        require(name not in sums, 'duplicate built checksum')
        sums[name] = checksum
    require(sums == files, 'built checksums do not match the exact image triple')
    with (images/'Image').open('rb') as stream:
        stream.seek(56)
        require(stream.read(4) == b'ARM\x64', 'kernel is not an ARM64 Image')
    with (images/'rootfs.ext4').open('rb') as stream:
        stream.seek(1080)
        require(stream.read(2) == b'\x53\xef', 'rootfs is not ext4')
    lock = json.loads((images/'source-lock.json').read_text())
    version = lock['linux']['version']
    require(re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version), 'invalid locked kernel version')
    require(digest(images/'source-lock.json') == digest(source/'systems/rock-star-os/os/source-lock.json'),
            'image source lock is from another input')
    require(digest(images/'buildroot.config') == digest(build/'output/.config') and
            digest(images/'linux.config') == digest(build/('output/build/linux-'+version+'/.config')),
            'copied build configuration differs')
    manifest = {'schema': 'rock-build-freeze/2', 'status': 'BUILD_COMPLETE_FROZEN',
        'measured_utc': datetime.now(timezone.utc).isoformat(), 'source_commit': commit,
        'source_archive_sha256': digest(archive_path), 'archive_commit_verified': True,
        'archive_files_verified': len(source_files), 'source_files_sha256': source_files,
        'source_report_sha256': digest(report_path),
        'source_tests': {'status': 'PASS', 'python_executions': regressions['total_python_test_executions'],
                         'checks': len(regressions['checks']), 'source_unchanged': True},
        'files_sha256': files, 'file_identities': identities,
        'configuration_sha256': {name: digest(images/name) for name in
                                ('buildroot.config', 'linux.config', 'source-lock.json', 'SHA256SUMS')},
        'build_log_sha256': digest(images/'build.log'), 'build_started_utc': started[0],
        'build_finished_utc': finished[0], 'build_directory': str(build),
        'build_started_empty': False if cache_origin else 'NOT_VERIFIED',
        'old_build_outputs_reused': True if cache_origin else 'NOT_VERIFIED',
        'cache_origin_commit': cache_origin, 'environment': environment(build),
        'reproducibility': 'one measured build; separate-host bit-identical rebuild NOT_RUN',
        'target': 'RockstarOS 1.0 Developer Preview, QEMU ARM64 virt-10.0 only',
        'key_scope': 'public synthetic development fixtures', 'qemu_boot': 'NOT_RUN',
        'acceptance_D0_D6': 'NOT_RUN', 'physical_device': 'NOT_RUN', 'real_funds': 'NOT_RUN',
        'distribution_conditions': 'NOT_DETERMINED; legal-info, product license and release acceptance are separate'}
    for name in IMAGE_NAMES:
        (images/name).chmod(0o444)
    require({name: digest(images/name) for name in IMAGE_NAMES} == files, 'freeze changed image bytes')
    with output.open('x') as stream:
        json.dump(manifest, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('source-root', 'source-archive', 'source-report', 'build-dir', 'images-dir'):
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--cache-origin-commit')
    args = parser.parse_args()
    require(sys.platform == 'linux', 'run on the actual Linux build host')
    result = freeze(args.source_root.absolute(), args.source_archive.absolute(), args.source_commit,
        args.source_report.absolute(), args.build_dir.absolute(), args.images_dir.absolute(), args.cache_origin_commit)
    print(json.dumps({key: result[key] for key in ('status', 'source_commit', 'files_sha256',
                                                  'source_tests', 'old_build_outputs_reused')}, indent=2))


if __name__ == '__main__':
    main()
