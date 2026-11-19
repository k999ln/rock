"""Reviewed owner provisioning; exchanges public certificates only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import ssl
import sys
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--server-certificate', required=True)
    parser.add_argument('--server-sha256', required=True)
    parser.add_argument('--replace-server-sha256')
    args = parser.parse_args()
    if sys.platform != 'linux' or os.uname().machine != 'aarch64':
        raise ValueError('Only the owner Pixel Linux guest is supported')
    os.umask(0o077)
    root = Path.home() / 'sky-private'
    directory = root / 'android-bridge'
    directory.mkdir(mode=0o700, exist_ok=True)
    certificate = Path(args.server_certificate).read_text()
    digest = hashlib.sha256(ssl.PEM_cert_to_DER_cert(certificate)).hexdigest()
    if digest != args.server_sha256:
        raise ValueError('Android certificate does not match owner-approved bytes')
    pairing = directory / 'pairing.json'
    if pairing.exists() and json.loads(pairing.read_text())['serverSha256'] != digest:
        old = json.loads(pairing.read_text())['serverSha256']
        if args.replace_server_sha256 != old:
            raise ValueError('Changing the paired Android identity requires exact owner re-pairing')
        shutil.copyfile(directory / 'server.pem', directory / 'previous-server.pem')
    if not (directory / 'client.key').exists():
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '365',
                        '-subj', '/CN=RockstarOS owner Pixel Linux', '-keyout', str(directory / 'client.key'),
                        '-out', str(directory / 'client.pem')], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.chmod(directory / 'client.key', 0o600)
    (directory / 'server.pem').write_text(certificate)
    pairing.write_text(json.dumps({'schema': 'sky.pixel-linux-peer/1', 'serverSha256': digest}))
    source = Path(__file__).resolve().parent / 'android-bridge.py'
    shutil.copyfile(source, directory / 'client.py')
    user = pwd.getpwuid(os.getuid()).pw_name
    unit = f'''[Unit]
Description=Owner Pixel Android bridge
After=network-online.target sky-private.service
Requires=sky-private.service

[Service]
Type=simple
User={user}
ExecStart=/usr/bin/python3 {directory}/client.py
Restart=on-failure
RestartSec=2
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths={directory}
MemoryMax=64M
TasksMax=16

[Install]
WantedBy=multi-user.target
'''
    unit_file = directory / 'sky-android-bridge.service'
    unit_file.write_text(unit)
    subprocess.run(['sudo', '-n', 'install', '-m', '644', str(unit_file), '/etc/systemd/system/sky-android-bridge.service'], check=True)
    subprocess.run(['sudo', '-n', 'systemctl', 'daemon-reload'], check=True)
    subprocess.run(['sudo', '-n', 'systemctl', 'enable', 'sky-android-bridge.service'], check=True)
    subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'sky-android-bridge.service'], check=True)
    client = (directory / 'client.pem').read_text()
    print(json.dumps({'schema': 'sky.pixel-linux-peer/1', 'clientSha256': hashlib.sha256(ssl.PEM_cert_to_DER_cert(client)).hexdigest(),
                      'clientCertificatePem': client, 'privateKeyExported': False}))


if __name__ == '__main__':
    main()
