#!/usr/bin/env python3
"""Inspect build outputs without executing tools, extracting images or accepting flash."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile

MODULES = ('RockAutomationPrototype', 'RockShell', 'RockArticleToolPrototype',
           'RockLocalActionAssistant')
TOOLS = ('bin/ota_from_target_files', 'bin/sign_target_files_apks', 'bin/avbtool')
IMAGES = ('IMAGES/boot.img', 'IMAGES/init_boot.img', 'IMAGES/vendor_boot.img',
          'IMAGES/vbmeta.img', 'IMAGES/system.img', 'IMAGES/product.img')


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return {'name': path.name, 'sizeBytes': path.stat().st_size, 'sha256': h.hexdigest()}


def members(archive):
    result = {}
    for info in archive.infolist():
        name = info.filename
        if (name in result or name.startswith('/') or '\\' in name
                or '..' in PurePosixPath(name).parts):
            raise ValueError('duplicate or unsafe ZIP member: ' + name)
        result[name] = info
    return result


def required(index, name):
    info = index.get(name)
    if (info is None or info.is_dir() or info.file_size == 0
            or stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1):
        raise ValueError('missing, empty or non-regular member: ' + name)
    return info


def properties(archive, index, name):
    info = required(index, name)
    if info.file_size > 1024 * 1024:
        raise ValueError('oversized properties: ' + name)
    result = {}
    for line in archive.read(info).decode('utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            raise ValueError('malformed properties: ' + name)
        key, value = line.split('=', 1)
        if key in result:
            raise ValueError('duplicate property: ' + key)
        result[key] = value
    return result


def verify(target, ota, build_number, operator):
    for path in (target, ota):
        if path.is_symlink() or not path.is_file():
            raise ValueError('artifact must be a regular file: ' + str(path))
    with zipfile.ZipFile(target) as archive:
        index = members(archive)
        prop_path = 'PRODUCT/etc/build.prop' if 'PRODUCT/etc/build.prop' in index else 'PRODUCT/build.prop'
        props = properties(archive, index, prop_path)
        expected = {
            'ro.product.product.device': 'frankel',
            'ro.product.build.version.incremental': build_number,
            'ro.product.build.type': 'userdebug',
            'ro.rockstaros.stage': 'device-bringup',
            'ro.rockstaros.release_flash_allowed': 'false',
            'ro.rockstaros.financial_ready': 'false',
            'ro.rockstaros.operator_agent.stage': operator,
        }
        for key, value in expected.items():
            if props.get(key) != value:
                raise ValueError('unexpected build property: ' + key)
        misc = properties(archive, index, 'META/misc_info.txt')
        if misc.get('ab_update') != 'true' or misc.get('avb_enable') != 'true':
            raise ValueError('A/B and AVB metadata required')
        for name in IMAGES:
            required(index, name)
        modules = MODULES + (('RockOperatorAgent',) if operator == 'configured' else ())
        apks = []
        for module in modules:
            name = f'PRODUCT/app/{module}/{module}.apk'
            info = required(index, name)
            h = hashlib.sha256()
            with archive.open(info) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    h.update(block)
            apks.append({'module': module, 'path': name, 'sizeBytes': info.file_size,
                         'sha256': h.hexdigest()})
        if operator == 'excluded' and any('/RockOperatorAgent/' in n for n in index):
            raise ValueError('excluded Operator Agent present')
    with zipfile.ZipFile(ota) as archive:
        index = members(archive)
        for name in TOOLS:
            required(index, name)
    return {
        'schema': 'rock-phone-build-artifacts/1', 'status': 'ARTIFACT_STRUCTURE_VERIFIED',
        'device': 'frankel', 'buildNumber': build_number, 'operatorAgent': operator,
        'artifacts': {'targetFiles': digest(target), 'otaTools': digest(ota)},
        'applications': apks, 'imageMembers': list(IMAGES),
        'scope': 'ZIP structure, product properties, application bytes and archive hashes; not image boot or signing acceptance',
        'productionSigned': False, 'hardwareFlashPerformed': False,
        'imageBootVerified': False, 'releaseFlashAllowed': False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', required=True, type=Path)
    parser.add_argument('--build-number', required=True)
    parser.add_argument('--operator', choices=('configured', 'excluded'), required=True)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--evidence-dir', required=True, type=Path)
    args = parser.parse_args()
    # Invalidate a previous success even if the next input fails validation.
    args.output.write_text(json.dumps({'schema': 'rock-phone-build-artifacts/1',
        'status': 'VALIDATION_PENDING', 'releaseFlashAllowed': False}) + '\n')
    try:
        candidates = list(args.dist.glob('frankel-target_files*.zip'))
        if len(candidates) != 1:
            raise ValueError('exactly one frankel target-files ZIP required')
        result = verify(candidates[0], args.dist / 'otatools.zip',
                        args.build_number, args.operator)
        result['inputs'] = {}
        for name in ('source-manifest.xml', 'source-lock.json', 'rock-commit.txt',
                     'vendor-inventory.json', 'local-ai-artifact.json'):
            source = args.evidence_dir / name
            if source.is_symlink() or not source.is_file() or source.stat().st_size == 0:
                raise ValueError('missing build input evidence: ' + name)
            result['inputs'][name] = digest(source)
        args.output.write_text(json.dumps(result, indent=2) + '\n')
    except (ValueError, OSError, zipfile.BadZipFile) as error:
        parser.exit(1, str(error) + '\n')
    print('Artifact structure verified; production signing, boot and flash remain unaccepted.')


if __name__ == '__main__':
    main()
