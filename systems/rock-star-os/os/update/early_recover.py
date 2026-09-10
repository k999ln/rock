"""Development-only recovery of the one full-volume test's own filler.

Runs after the real selector chose committed A, before ordinary service startup.
It neither chooses a slot nor confirms health; S97 and S99 must still pass.
"""
import json
import os
from pathlib import Path
import stat
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rock_update import Updater, require, fsync_directory

FILLER = Path('/data/rock-update/fault-full-data')
PROOF = Path('/run/rock-ab-full-recovery.json')


def reclaim(updater, boot):
    with updater.lock(allow_readonly=True):
        state = updater.read_state()
        slot = updater.running_slot(state)
        require(slot == state['committed'] == boot['slot'] == 'A' and state['floor'] == boot['sequence'] == 1 and
                state['pending'] == 'B' and boot['reason'] == 'state-write-failed',
                'early test recovery requires the real committed-root storage fallback')
        info = FILLER.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and
                info.st_size > 0 and info.st_blocks > 0 and info.st_dev == FILLER.parent.stat().st_dev,
                'early recovery may delete only its owned allocated regular test filler')
        before = os.statvfs(FILLER.parent)
        FILLER.unlink()
        fsync_directory(FILLER.parent)
        os.sync()
        after = os.statvfs(FILLER.parent)
        require(after.f_bfree > before.f_bfree, 'test filler removal did not recover real blocks')
        proof = {'slot': slot, 'sequence': boot['sequence'], 'pending': state['pending'], 'reason': boot['reason'],
                 'logical_bytes': info.st_size, 'allocated_bytes': info.st_blocks * 512,
                 'block_bytes': before.f_frsize, 'free_blocks_before': before.f_bfree,
                 'available_blocks_before': before.f_bavail, 'free_blocks_after': after.f_bfree,
                 'available_blocks_after': after.f_bavail}
        fd = os.open(PROOF, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(json.dumps(proof, sort_keys=True) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        print('ROCK_AB_EARLY_CAPACITY_RECOVERY ' + json.dumps(proof, sort_keys=True), flush=True)


def main():
    require(os.getuid() == os.geteuid() == 0 and os.uname().machine == 'aarch64', 'guest-only root test helper')
    phases = [word for word in Path('/proc/cmdline').read_text().split() if word.startswith('rock.abtest=')]
    require(phases == ['rock.abtest=fault-full-recover'], 'explicit full-recovery test phase is required')
    reclaim(Updater(), json.loads(Path('/run/rock-boot.json').read_text()))


if __name__ == '__main__':
    main()
