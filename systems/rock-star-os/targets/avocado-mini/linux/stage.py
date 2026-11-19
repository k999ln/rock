"""Create a reviewable rootfs overlay; never install into the running host."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

def stage(output):
    output = Path(output).absolute()
    if output.exists():
        raise ValueError('Use a new empty output path; existing directories are never overwritten.')
    source = Path(__file__).resolve().parent
    shutil.copytree(source / 'rootfs', output)
    library = output / 'usr/lib/rockstaros-mini'
    library.mkdir(parents=True)
    for name in ('supervisor_driver.py', 'start_supervisor.py', 'launch_eve.py'):
        shutil.copyfile(source / name, library / name)
    configuration = output / 'etc/rockstaros-mini'
    configuration.mkdir()
    (configuration / 'supervisor-device.example.json').write_text(json.dumps({
        'device': 'REPLACE_WITH_ACTUAL_/dev/ttyACM_NUMBER',
        'expectedUsbSerial': 'REPLACE_WITH_ACTUAL_BOARD_SERIAL', 'benchOnly': True}, indent=2) + '\n')
    files = {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(output.rglob('*')) if p.is_file()}
    manifest = {'schema': 'rockstaros.mini-rootfs-overlay/1', 'target': 'cm5-linux-aarch64-development',
                'bootableOsImage': False, 'serviceEnabled': False,
                'physicalAcceptance': False, 'factoryRelease': False,
                'billing': 'existing-owner-contract-no-new-device-base-fee', 'files': files}
    (output / 'overlay-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--output', required=True)
    print(json.dumps(stage(parser.parse_args().output), indent=2))
