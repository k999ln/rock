"""Start only after the actual owner's bench board identity is configured."""
import json
import os
from pathlib import Path
import stat

def start():
    path = Path('/etc/rockstaros-mini/supervisor-device.json')
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) & 0o022:
        raise RuntimeError('Root-owned, non-writable bench device configuration required.')
    value = json.loads(path.read_text())
    if set(value) != {'device', 'expectedUsbSerial', 'benchOnly'} or value['benchOnly'] is not True:
        raise RuntimeError('Only the LED/logic bench profile is supported.')
    if not all(isinstance(value[key], str) and value[key] for key in ('device', 'expectedUsbSerial')):
        raise RuntimeError('Actual board path and serial required; no default board is assumed.')
    driver = Path(__file__).with_name('supervisor_driver.py')
    os.execv('/usr/bin/python3', ['/usr/bin/python3', '-B', str(driver),
                                '--device', value['device'], '--expected-usb-serial', value['expectedUsbSerial'],
                                '--state-dir', '/run/rockstaros-mini-supervisor'])

if __name__ == '__main__':
    start()
