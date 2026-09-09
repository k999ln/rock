"""Fixed guest-only stages for power-loss boundaries and real full-data recovery."""
import errno
import hashlib
import json
import os
from pathlib import Path

from rock_update import Updater, require, fsync_directory
from test_faults import kernel_fault


def state_enospc_proof(updater):
    """Use the real atomic writer and require an unchanged existing state.

    ext4 deliberately retains metadata-reserved clusters even from root data
    allocation. Nonzero f_bfree therefore cannot prove a small state can save.
    This test does not change the reservation or simulate a storage error.
    """
    with updater.lock(allow_readonly=True):
        state = updater.read_state()
        before = updater.state_path.read_bytes()
        try:
            updater.save_state(state)
        except OSError as error:
            require(error.errno == errno.ENOSPC, 'state probe failed for a reason other than actual ENOSPC')
        else:
            raise RuntimeError('state probe unexpectedly saved; disposable volume is not full for the updater')
        after = updater.state_path.read_bytes()
        require(before == after, 'failed atomic state probe changed persistent metadata')
        fsync_directory(updater.state_path.parent)
        os.sync()
        return {'errno': errno.ENOSPC, 'state_bytes': len(before),
                'state_sha256_before': hashlib.sha256(before).hexdigest(),
                'state_sha256_after': hashlib.sha256(after).hexdigest()}


def main(phase):
    updater = Updater(fault_hook=kernel_fault())
    boot = json.loads(Path('/run/rock-boot.json').read_text())
    state = updater.read_state()
    slot = updater.running_slot(state)
    require(state['committed'] == slot and state['floor'] == boot['sequence'], 'fault test must run a confirmed root')
    if phase in ('fault-stage', 'fault-full-stage'):
        require(slot == 'A' and state['floor'] == 1 and state['pending'] is None, 'fault stage requires factory A')
        updater.install(Path('/run/rock-ab-fixtures/release-2.rock'))
        if phase == 'fault-full-stage':
            filler = Path('/data/rock-update/fault-full-data')
            fd = os.open(filler, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            count = 0
            try:
                # Reserve actual ext4 blocks, not delayed-allocation dirty pages.
                # A failed 1 MiB write can leave room for the small atomic state
                # file; consume the remaining individual filesystem blocks too.
                block = os.statvfs(filler.parent).f_frsize
                require(512 <= block <= 65536, 'unexpected disposable filesystem block size')
                for chunk in (1024 * 1024, block):
                    while True:
                        require(count + chunk <= 256 * 1024 * 1024, 'fault test data volume exceeds its disposable size limit')
                        try:
                            os.posix_fallocate(fd, count, chunk)
                        except OSError as error:
                            require(error.errno == errno.ENOSPC, 'unexpected error allocating disposable data volume')
                            break
                        count += chunk
                os.fsync(fd)
                info = os.fstat(fd)
            finally:
                os.close(fd)
            require(count > 0, 'data volume was not actually filled')
            fsync_directory(filler.parent)
            os.sync()
            space = os.statvfs(filler.parent)
            reserved = int(Path('/sys/fs/ext4/vdb/reserved_clusters').read_text().strip())
            proof = {'logical_bytes': info.st_size, 'allocated_bytes': info.st_blocks * 512,
                     'block_bytes': space.f_frsize, 'free_blocks': space.f_bfree,
                     'available_blocks': space.f_bavail, 'allocation_bytes': count,
                     'allocation_errno': errno.ENOSPC, 'metadata_reserved_clusters': reserved}
            print('ROCK_AB_DATA_ALLOCATION_PROOF ' + json.dumps(proof, sort_keys=True), flush=True)
            require(space.f_bavail == 0 and reserved >= 0, 'user-available capacity remains after full-volume allocation')
            require(info.st_size == count and info.st_blocks * 512 >= count, 'filler has unallocated holes')
            proof['state_write_probe'] = state_enospc_proof(updater)
            print('ROCK_AB_DATA_FULL bytes=' + str(count), flush=True)
            print('ROCK_AB_DATA_FULL_PROOF ' + json.dumps(proof, sort_keys=True), flush=True)
    elif phase == 'fault-readback-a':
        require(slot == 'A' and state['floor'] == 1 and state['pending'] is None, 'pre-arm power loss changed committed boot')
        print('ROCK_AB_PREARM_RECOVERY_PASS', flush=True)
    elif phase == 'fault-readback-b':
        require(slot == 'B' and state['floor'] == 2 and state['pending'] is None, 'durable trial/confirmation did not recover B')
        require(Path('/etc/rock-update/build-marker').read_text().strip() == 'release-2', 'wrong actual B payload')
        print('ROCK_AB_DURABLE_STATE_RECOVERY_PASS', flush=True)
    elif phase == 'fault-full-recover':
        require(slot == 'A' and state['floor'] == 1 and state['pending'] == 'B' and
                boot['reason'] == 'state-write-failed', 'full state store did not defer trial and retain committed A')
        require(not Path('/data/rock-update/fault-full-data').exists(), 'test filler was not reclaimed before service startup')
        recovery = json.loads(Path('/run/rock-ab-full-recovery.json').read_text())
        require(recovery['slot'] == 'A' and recovery['sequence'] == 1 and recovery['pending'] == 'B' and
                recovery['reason'] == 'state-write-failed' and recovery['allocated_bytes'] > 0 and
                recovery['free_blocks_after'] > recovery['free_blocks_before'], 'early capacity recovery proof mismatch')
        print('ROCK_AB_REAL_ENOSPC_FALLBACK_PASS', flush=True)
    else:
        raise RuntimeError('unknown fixed fault test phase')
    print('ROCK_AB_PHASE_PASS phase=' + phase, flush=True)
