"""Test-only S96 fault injector, copied ONLY into disposable signed images.

Not installed by Buildroot. Never alters health/updater logic or persistent
state. A freeze/crash is applied to the real checked UI through its pidfd.
"""
import json
import os
from pathlib import Path
import select
import signal
import sys
import time

sys.path.insert(0, '/usr/lib/rock-update')
import ui_health


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ('ready', 'absent', 'freeze', 'crash'):
        raise ValueError('fixed UI startup fixture mode required')
    if os.geteuid() != 0:
        raise ValueError('root guest fixture required')
    mode = sys.argv[1]
    if mode == 'absent':
        if Path('/run/rock-ui.pid').exists() or Path('/run/rock-ui-health/ready.sock').exists():
            raise ValueError('pre-readiness fixture unexpectedly launched a UI')
        print('ROCK_UI_STARTUP_FAULT ' + json.dumps({'mode': mode, 'ui_started': False}), flush=True)
        return
    deadline = time.monotonic() + 35
    while True:
        try:
            proof = ui_health.check()
            break
        except (OSError, ValueError) as error:
            if time.monotonic() >= deadline:
                raise RuntimeError('real UI never became ready before fault injection') from error
            time.sleep(0.2)
    fd = os.pidfd_open(proof['pid'], 0)
    try:
        # Revalidate after opening the signal handle; never signal a reused PID.
        confirmed = ui_health.check()
        if (confirmed['pid'], confirmed['process_start_ticks']) != (proof['pid'], proof['process_start_ticks']):
            raise ValueError('UI identity changed before injection')
        if select.select([fd], [], [], 0)[0]:
            raise ValueError('UI exited before injection')
        print('ROCK_UI_STARTUP_FIXTURE_READY ' + json.dumps(confirmed, separators=(',', ':')), flush=True)
        time.sleep(3)  # Bounded window for host QMP framebuffer evidence.
        if mode == 'ready':
            return
        signal.pidfd_send_signal(fd, signal.SIGSTOP if mode == 'freeze' else signal.SIGKILL)
        deadline = time.monotonic() + 5
        while True:
            exited = bool(select.select([fd], [], [], 0)[0])
            stopped = False
            if not exited:
                raw = Path('/proc', str(proof['pid']), 'stat').read_bytes()
                stopped = raw[raw.rfind(b') ') + 2:].split()[0] in (b'T', b't')
            if (mode == 'freeze' and stopped) or (mode == 'crash' and exited):
                break
            if time.monotonic() >= deadline:
                raise RuntimeError('signal did not create the requested real process fault')
            time.sleep(0.05)
        print('ROCK_UI_STARTUP_FAULT ' + json.dumps({'mode': mode, 'pid': proof['pid'],
              'process_start_ticks': proof['process_start_ticks'], 'stopped': stopped,
              'exited': exited}, separators=(',', ':')), flush=True)
    finally:
        os.close(fd)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print('ROCK_UI_STARTUP_FIXTURE_FAILED ' + type(error).__name__ + ': ' + str(error), flush=True)
        raise
