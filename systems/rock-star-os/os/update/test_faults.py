"""Explicit development guest fault injection; omitted from normal OS installs."""
import os
from pathlib import Path
import sys
import time

POINTS = {'install.payload_synced', 'install.pending_saved', 'boot.attempts_saved', 'confirm.committed_saved'}


def kernel_fault():
    if os.geteuid() != 0 or os.uname().machine != 'aarch64':
        return None
    words = Path('/proc/cmdline').read_text().split()
    phases = [word.split('=', 1)[1] for word in words if word.startswith('rock.abtest=')]
    values = [word.split('=', 1)[1] for word in words if word.startswith('rock.abfault=')]
    if not values:
        return None
    if len(phases) != 1 or not phases[0].startswith('fault-') or len(values) != 1 or values[0] not in POINTS:
        raise RuntimeError('invalid explicit A/B fault-test boot configuration')
    def fault(point):
        if point == values[0]:
            # Stage0 captures selector stdout as the chosen device; stderr is
            # the console evidence channel even before switch_root.
            print('ROCK_AB_FAULT_READY point=' + point, file=sys.stderr, flush=True)
            # The host kills only its disposable QEMU after this exact marker.
            while True:
                time.sleep(1)
    return fault
