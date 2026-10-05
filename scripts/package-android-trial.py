#!/usr/bin/env python3
"""Collect the three verified P1 debug APKs after the emulator job succeeds."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

TRIAL_PACKAGES = (
    ('automation', 'dev.rock.automation'),
    ('shell', 'dev.rock.shell'),
    ('article-tool', 'dev.rock.tools.article'),
)


def validate_badging(module, package, badging):
    if (module, package) not in TRIAL_PACKAGES:
        raise ValueError('Unknown Android P1 trial package')
    expected = (f"package: name='{package}' versionCode='1'", "sdkVersion:'35'", "targetSdkVersion:'35'", 'application-debuggable')
    if any(part not in badging for part in expected):
        raise ValueError('APK identity, SDK or debug mode differs from the Android P1 trial contract')
    permissions = set(re.findall(r"^uses-permission(?:-sdk-23)?: name='([^']+)'", badging, re.M))
    internet = 'android.permission.INTERNET' in permissions
    if internet != (module == 'automation'):
        raise ValueError('Only the authenticated service Broker may request INTERNET; Shell and Tool must remain network-denied')
    return internet


def validate_cleartext_manifest(manifest_tree):
    values = re.findall(r'^\s*A: android:usesCleartextTraffic\([^)]*\)=\(type 0x12\)(0x[0-9a-fA-F]+)\s*$', manifest_tree, re.M)
    if values != ['0x0']:
        raise ValueError('Every Android P1 APK must explicitly disable cleartext traffic')


def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    sdk = Path(os.environ['ANDROID_HOME']) / 'build-tools' / '35.0.0'
    commit = run('git', '-C', str(root), 'rev-parse', 'HEAD').strip()
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Exact checked-out commit required')
    if run('git', '-C', str(root), 'status', '--porcelain', '--untracked-files=all').strip():
        raise ValueError('Refusing to label APKs with HEAD while tracked or untracked source changes exist')
    records = []
    for module, package in TRIAL_PACKAGES:
        apk = root / 'android' / module / 'build/outputs/apk/debug' / (module + '-debug.apk')
        signature = run(str(sdk / 'apksigner'), 'verify', '--verbose', '--print-certs', str(apk))
        signers = re.findall(r'^Signer #[0-9]+ certificate SHA-256 digest: ([0-9a-fA-F]{64})$', signature, re.M)
        if len(signers) != 1:
            raise ValueError('One verified APK signer required')
        badging = run(str(sdk / 'aapt'), 'dump', 'badging', str(apk))
        internet = validate_badging(module, package, badging)
        manifest_tree = run(str(sdk / 'aapt'), 'dump', 'xmltree', str(apk), 'AndroidManifest.xml')
        validate_cleartext_manifest(manifest_tree)
        records.append({'file': apk.name, 'package': package, 'sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
                        'signer_sha256': signers[0].lower(), 'min_sdk': 35, 'target_sdk': 35,
                        'debuggable': True, 'internet_permission': internet, 'cleartext_traffic': False,
                        'source': apk, 'signature_report': signature})
    if len({record['signer_sha256'] for record in records}) != 1:
        raise ValueError('Broker, Shell and Tool must have the same signing certificate')
    args.output.mkdir(parents=True, exist_ok=False)
    for record in records:
        shutil.copyfile(record.pop('source'), args.output / record['file'])
        (args.output / (record['file'] + '.signature.txt')).write_text(record.pop('signature_report'))
    report = {'schema': 'rock-android-trial/1', 'checked_out_commit': commit,
              'requested_head_commit': os.environ.get('ROCK_REQUESTED_HEAD'),
              'workflow_run': os.environ.get('GITHUB_RUN_ID'), 'artifacts': records,
              'scope': 'Existing-OS Android P1 debug application trial; no native/full-OS SELinux or production financial acceptance',
              'physical_device': 'NOT_RUN', 'release_signing': 'NOT_CONFIGURED'}
    (args.output / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    (args.output / 'SHA256SUMS').write_text(''.join(f"{row['sha256']}  {row['file']}\n" for row in records))
    shutil.copyfile(root / 'docs/android-trial.md', args.output / 'README.md')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
