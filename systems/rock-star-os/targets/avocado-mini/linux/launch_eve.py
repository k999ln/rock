"""Graphical-session entry to the existing Eve account and billing contract."""
import os
from pathlib import Path
import platform
import stat

EVE_URL = 'https://avoado.si/os/eve'

def launch():
    if platform.system() != 'Linux' or platform.machine() not in ('aarch64', 'arm64'):
        raise RuntimeError('This development image targets CM5 Linux aarch64.')
    if os.geteuid() == 0:
        raise RuntimeError('Eve must run in the owner graphical session, not as root.')
    if not (os.environ.get('WAYLAND_DISPLAY') or os.environ.get('DISPLAY')):
        raise RuntimeError('A graphical session/display is required; no spatial display driver is accepted yet.')
    browser = Path('/usr/bin/chromium')
    if not browser.is_file():
        raise RuntimeError('The selected OS must supply its maintained Chromium package.')
    profile = Path.home() / '.config/rockstaros-mini/browser'
    profile.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = profile.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise RuntimeError('The owner browser profile must be private (0700).')
    # Browser owns credentials, passkeys, CSRF and the current Eve surface.
    # No token is copied to MCU, logs, firmware or a second billing system.
    os.execv(str(browser), [str(browser), '--no-first-run',
                           '--user-data-dir=' + str(profile), '--app=' + EVE_URL])

if __name__ == '__main__':
    launch()
