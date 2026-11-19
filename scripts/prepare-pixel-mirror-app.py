"""Give an existing official Homebrew scrcpy binary a reusable macOS app identity.

No download, new executable code, signing key or device configuration is created.
Start with the returned command, then select appPath through the computer-use tool.
"""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import shutil
import sys


def prepare(output):
    if sys.platform != 'darwin':
        raise ValueError('This helper is for the existing macOS development host.')
    installed = shutil.which('scrcpy')
    if not installed:
        raise ValueError('Existing official scrcpy installation is required; nothing was downloaded.')
    source = Path(installed).resolve()
    if not any(str(source).startswith(prefix) for prefix in ['/opt/homebrew/Cellar/scrcpy/', '/usr/local/Cellar/scrcpy/']):
        raise ValueError('Review the existing binary source before preparing an app.')
    server = source.parent.parent / 'share/scrcpy/scrcpy-server'
    if not server.is_file():
        raise ValueError('The matching existing scrcpy server is missing.')
    app = Path(output).resolve()
    info = app / 'Contents/Info.plist'
    identifier = 'dev.rock.pixel-eve-mirror'
    if app.exists() and (not info.is_file() or plistlib.loads(info.read_bytes()).get('CFBundleIdentifier') != identifier):
        raise ValueError('Existing unrelated output was preserved.')
    binary = app / 'Contents/MacOS/scrcpy'
    binary.parent.mkdir(parents=True, exist_ok=True)
    if not binary.is_file() or binary.read_bytes() != source.read_bytes():
        shutil.copy2(source, binary)
    info.write_bytes(plistlib.dumps({'CFBundleName': 'Pixel Eve', 'CFBundleDisplayName': 'Pixel Eve',
        'CFBundleIdentifier': identifier, 'CFBundleExecutable': 'scrcpy', 'CFBundlePackageType': 'APPL',
        'CFBundleVersion': source.parent.parent.name, 'NSHighResolutionCapable': True, 'LSUIElement': False}))
    expected = hashlib.sha256(source.read_bytes()).hexdigest()
    if hashlib.sha256(binary.read_bytes()).hexdigest() != expected:
        raise ValueError('Existing binary copy did not match.')
    return {'appPath': str(app), 'binarySha256': expected, 'downloaded': False,
        'command': ['env', 'SCRCPY_SERVER_PATH=' + str(server), str(binary), '--no-audio',
                    '--no-clipboard-autosync', '--window-title=Pixel-Eve', '--max-size=1000']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='work/pixel-mirror/Pixel Eve.app')
    print(json.dumps(prepare(parser.parse_args().output), ensure_ascii=False))
