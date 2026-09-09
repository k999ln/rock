"""Lock-held evidence of this coordinator's completed current-copy restore.

These internal contexts do not import a backup, retag an index, or authorize an
arbitrary caller-created proof. The protected C record is rejoined every time.
"""
from contextlib import contextmanager, ExitStack
from dataclasses import dataclass, replace
import fcntl
import hashlib
import os
import re

from .authority_fence import (DB_NAMES, _Permit, _TLS, canonical, descriptor_value,
    file_identity, identifier, parse_descriptor, private_file, read_json, require,
    uuid_text)
from .adopt_legacy import digest_file, no_sidecars
from .runtime_contracts import ContractDescriptor


@dataclass(frozen=True, slots=True)
class CurrentCopyFile:
    name: str
    sha256: str
    source_identity: tuple[int, int]
    destination_identity: tuple[int, int]


@dataclass(frozen=True, slots=True)
class CompletedCurrentRestoreProof:
    """Inspection result only; constructing or retaining it confers no access."""
    restore_id: str
    coordinator_id: str
    record_sha256: str
    old_descriptor: ContractDescriptor
    new_descriptor: ContractDescriptor
    account_id: str | None
    copies: tuple[CurrentCopyFile, ...]


def _equal(left, right):
    return canonical(left) == canonical(right)


def _record(coordinator, restore_id, expected_digest=None):
    uuid_text(restore_id)
    coordinator._check_registry()
    coordinator._require_owner_registry()
    record = coordinator.registry['restores'].get(restore_id)
    require(type(record) is dict and set(record) == {
        'restore_id', 'ledger_ref', 'source_descriptor', 'source_marker_sha256',
        'source_files', 'source_marker', 'destination', 'copies', 'stage',
        'destination_files', 'next_descriptor'}, 'unknown current restore record')
    require(record['restore_id'] == restore_id and record['stage'] == 'DONE',
            'completed current restore required')
    digest = hashlib.sha256(canonical(record)).hexdigest()
    if expected_digest is not None:
        require(type(expected_digest) is str and re.fullmatch('[0-9a-f]{64}', expected_digest)
                and digest == expected_digest, 'current restore record differs from protected plan')
    old, new = parse_descriptor(record['source_descriptor']), parse_descriptor(record['next_descriptor'])
    require(record['ledger_ref'] == old.ledger_ref == new.ledger_ref and
            new == replace(old, canonical_state=new.canonical_state, writer_epoch=old.writer_epoch+1) and
            old.canonical_state != new.canonical_state and record['destination'] == str(new.canonical_state),
            'completed restore mixes identity, path or next epoch')
    coordinator._separate_state(old.canonical_state)
    coordinator._separate_state(new.canonical_state)
    require(old.canonical_state not in new.canonical_state.parents and
            new.canonical_state not in old.canonical_state.parents, 'restore states overlap')
    copies = record['copies']
    require(type(copies) is dict and set(copies) in (set(DB_NAMES), set(DB_NAMES) | {'DEVICE-CREDENTIALS.json'})
            and all(type(v) is str and re.fullmatch('[0-9a-f]{64}', v) for v in copies.values()),
            'complete fixed copy members required')
    for field in ('source_files', 'destination_files'):
        files = record[field]
        require(type(files) is dict and set(files) == set(DB_NAMES) and
                all(type(v) is list and len(v) == 2 and all(type(i) is int and i >= 0 for i in v) for v in files.values()),
                'strict source/destination file identity required')
    source_marker = record['source_marker']
    require(type(source_marker) is dict and source_marker.get('state') == 'ACTIVE' and
            _equal(source_marker.get('descriptor'), descriptor_value(old)) and
            source_marker.get('coordinator_id') == coordinator.registry['coordinator_id'], 'source marker binding differs')
    require(type(record['source_marker_sha256']) is str and
            re.fullmatch('[0-9a-f]{64}', record['source_marker_sha256']) and
            hashlib.sha256(canonical(source_marker)+b'\n').hexdigest() == record['source_marker_sha256'],
            'original canonical marker hash differs')
    row = coordinator.registry['contracts'].get(old.ledger_ref)
    require(type(row) is dict and row.get('state') == 'ACTIVE' and
            _equal(row.get('descriptor'), descriptor_value(new)) and
            _equal(row.get('files'), record['destination_files']) and
            row.get('account_id') == source_marker.get('account_id') and
            row.get('migration_id') == source_marker.get('migration_id'), 'restore is not the current registered generation')
    if row['account_id'] is not None: identifier(row['account_id'])
    return record, old, new, digest, row['account_id']


@contextmanager
def _state_lock(state):
    # Completed states already have locks. Missing locks must not be recreated.
    descriptor = private_file(state/'authority.lock')
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield descriptor
    finally:
        os.close(descriptor)


def _inspect(coordinator, record, old, new, digest, account, source_fd, destination_fd, *, initial):
    for state, fd in ((old.canonical_state, source_fd), (new.canonical_state, destination_fd)):
        info = os.fstat(fd)
        require(file_identity(state/'authority.lock') == [info.st_dev, info.st_ino], 'held state lock was replaced')
    require(_equal(read_json(old.canonical_state/'AUTHORITY.json'), {**record['source_marker'], 'state':'RETIRED'}),
            'original authority is not the exact retired generation')
    marker = {**record['source_marker'], 'state':'ACTIVE', 'descriptor':record['next_descriptor']}
    require(_equal(read_json(new.canonical_state/'AUTHORITY.json'), marker), 'current restored authority marker differs')
    require(_equal(read_json(new.canonical_state/'GX00-RESTORE.json'), record), 'completed restore receipt differs')
    require(_equal(coordinator._files(old), record['source_files']) and
            _equal(coordinator._files(new), record['destination_files']), 'restored database identity changed')
    all_source = {tuple(value) for value in record['source_files'].values()}
    all_destination = {tuple(value) for value in record['destination_files'].values()}
    require(len(all_source) == len(all_destination) == len(DB_NAMES) and not all_source & all_destination,
            'source and destination files alias')
    allowed = set(record['copies']) | {'authority.lock', 'device.lock', 'AUTHORITY.json',
                                      'GX00-RESTORE.json', 'GX00-MIGRATION.json'}
    allowed |= {name+suffix for name in DB_NAMES for suffix in ('-wal','-shm','-journal')}
    for state in (old.canonical_state, new.canonical_state):
        require({path.name for path in state.iterdir()} <= allowed, 'unknown completed restore member')
        if state == old.canonical_state or initial: no_sidecars(state)
    files = []
    for name, expected in sorted(record['copies'].items()):
        source, destination = old.canonical_state/name, new.canonical_state/name
        a, b = tuple(file_identity(source)), tuple(file_identity(destination))
        require(a != b, 'copy member aliases original')
        require(digest_file(source) == expected, 'retired source no longer matches completed copy')
        if initial or name not in DB_NAMES:
            require(digest_file(destination) == expected, 'current destination changed after copy')
        files.append(CurrentCopyFile(name, expected, a, b))
    # Exact stable identity is required even after the new Wallet has appended
    # an authorized handover row. The original closed source never changes.
    coordinator._validate_identity(_Permit(coordinator, old, record['source_marker'], source_fd), account)
    current = _Permit(coordinator, new, marker, destination_fd)
    coordinator._verify_marker(current, immutable=initial)
    coordinator._validate_identity(current, account, immutable=initial)
    return CompletedCurrentRestoreProof(record['restore_id'], coordinator.registry['coordinator_id'],
                                       digest, old, new, account, tuple(files))


@contextmanager
def verified_completed_current_restore(coordinator, restore_id):
    """Keep all real C/state locks until the caller commits its initial plan."""
    with coordinator.mutex:
        coordinator._check_registry()
        require(not coordinator.permits, 'all runtime/worker/opening permits must close before initial copy evidence')
        require(all(row.get('stage') == 'DONE' for row in coordinator.registry['restores'].values()),
                'unfinished restore prevents initial current-copy evidence')
        record, old, new, digest, account = _record(coordinator, restore_id)
        with ExitStack() as stack:
            source_fd = stack.enter_context(_state_lock(old.canonical_state))
            destination_fd = stack.enter_context(_state_lock(new.canonical_state))
            proof = _inspect(coordinator, record, old, new, digest, account, source_fd, destination_fd, initial=True)
            yield proof
            require(not coordinator.permits, 'a runtime opened during initial copy evidence')
            checked = _record(coordinator, restore_id, digest)
            require(_inspect(coordinator, *checked[:3], checked[3], checked[4], source_fd, destination_fd, initial=True) == proof,
                    'current copy changed during plan preparation')


@contextmanager
def current_restore_generation(coordinator, restore_id, *, record_sha256):
    """Join a protected plan to C under the current thread's real held permit.

The destination DB may now contain a handover append. Its allowed table delta
is the caller's separate index/Wallet obligation, not a whole-copy claim here.
An open_active initialization is allowed only for its existing ACTIVE marker;
fresh PREPARED, an idle opening, and caller-constructed permits are rejected.
"""
    permit = getattr(_TLS, 'permit', None)
    require(type(permit) is _Permit and permit.coordinator is coordinator and not permit.released and
            permit.hooks.held_by_current_thread() and
            ((permit.opening and permit.initializing) or (not permit.opening and permit.inflight > 0)),
            'actual held current writer/open-active initialization required')
    with coordinator.mutex:
        record, old, new, digest, account = _record(coordinator, restore_id, record_sha256)
        require(coordinator.permits.get(new.ledger_ref) is permit and permit.descriptor == new and
                permit.marker['state'] == 'ACTIVE', 'registered current restore permit required')
        coordinator._verify_marker(permit, immutable=False)
        with _state_lock(old.canonical_state) as source_fd:
            proof = _inspect(coordinator, record, old, new, digest, account, source_fd, permit.lock_fd, initial=False)
            yield proof
            require(coordinator.permits.get(new.ledger_ref) is permit and not permit.released and
                    permit.hooks.held_by_current_thread(), 'current restore permit ended during mutation')
            checked = _record(coordinator, restore_id, digest)
            coordinator._verify_marker(permit, immutable=False)
            require(_inspect(coordinator, *checked[:3], checked[3], checked[4], source_fd, permit.lock_fd, initial=False) == proof,
                    'current generation changed during joined mutation')
