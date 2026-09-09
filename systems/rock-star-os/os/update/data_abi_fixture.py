"""Fixed, derived-image-only ABI refusal observer; not installed in the OS.

The production Updater and stage0 are unchanged. No metadata repair, signature
override, network, Wallet operation or host-selected slot is used here.
"""
import hashlib
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, '/usr/lib/rock-update')
from rock_update import DATA_ABI, Updater, UpdateError, canonical, digest_stream, require

PROOF = Path('/data/rock-data-abi-proof.json')
BUNDLE = Path('/run/rock-data-abi/foreign-abi.rock')


def measure(updater):
    slots = {}
    for name in ('A', 'B'):
        with updater.slot_stream(name) as (stream, size):
            slots[name] = digest_stream(stream, size)
    return {'state_sha256': hashlib.sha256(updater.state_path.read_bytes()).hexdigest(),
            'slot_sha256': slots}


def main():
    require(os.geteuid() == 0 and DATA_ABI == 'rock-data-v1', 'fixed guest profile required')
    require(Path('/proc/cmdline').read_text().split().count('rock.data-abi.verify=1') == 1,
            'explicit development ABI observer required')
    updater = Updater()
    boot = json.loads(Path('/run/rock-boot.json').read_text())
    state = updater.read_state()
    require(boot['slot'] == 'B' and boot['sequence'] == 2 and state['committed'] == 'B'
            and state['floor'] == 2 and state['pending'] is None and updater.running_slot(state) == 'B',
            'real stage0 and health must first select and confirm the valid B release')
    before = measure(updater)
    if PROOF.exists():
        proof = json.loads(PROOF.read_text())
        require(proof['schema'] == 'rock-data-abi-refusal/1' and proof['status'] == 'PASS'
                and proof['after'] == before and proof['attempts'] == 1,
                'refused update state or slots changed across actual normal reboot')
        proof = dict(proof, reboot_retained=True)
    else:
        try:
            updater.install(BUNDLE)
        except UpdateError as error:
            require(str(error) == 'incompatible persistent data ABI', 'different failure is not ABI evidence')
        else:
            raise UpdateError('foreign ABI was accepted')
        after = measure(updater)
        require(before == after, 'ABI refusal changed a slot or boot metadata')
        with BUNDLE.open('rb') as stream:
            bundle_digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        proof = {'schema': 'rock-data-abi-refusal/1', 'status': 'PASS', 'attempts': 1,
                 'expected_error': 'incompatible persistent data ABI', 'before': before, 'after': after,
                 'data_abi': DATA_ABI, 'reboot_retained': False,
                 'foreign_bundle_sha256': bundle_digest}
        with PROOF.open('xb') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(canonical(proof) + b'\n'); stream.flush(); os.fsync(stream.fileno())
        fd = os.open('/data', os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(fd)
        finally: os.close(fd)
    print('ROCK_DATA_ABI_PROOF ' + canonical(proof).decode(), flush=True)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print('ROCK_DATA_ABI_FAIL ' + type(error).__name__ + ': ' + str(error), flush=True)
        raise
