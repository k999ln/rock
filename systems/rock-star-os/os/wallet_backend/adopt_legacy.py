"""Explicit stopped host-backend adoption; never imports an OS local Wallet.

The plan pins all original rows/schema, metadata bytes and original DB inodes.
Only the two additive identity schemas may differ while this plan resumes.
"""
from contextlib import closing
from dataclasses import dataclass, replace
import fcntl
import hashlib
import json
import os
from pathlib import Path
import tempfile
import uuid

from .authority_fence import (DB_NAMES, MARKER_SCHEMA, _Permit, canonical,
    descriptor_value, file_identity, fsync_directory, identifier, parse_descriptor, private_directory,
    read_json, readonly, require, uuid_text, wallet_identity, write_json)
from .runtime_contracts import ContractDescriptor, FreshContractSpec

IDENTITY_TABLES = {'wallet_storage_identity', 'wallet_bindings_v2'}
IDENTITY_OBJECTS = IDENTITY_TABLES | {'wallet_storage_identity_immutable',
    'wallet_storage_account_immutable', 'wallet_storage_identity_no_delete',
    'wallet_bindings_v2_no_update', 'wallet_bindings_v2_no_delete'}


def digest_file(path):
    file_identity(path)
    require(path.stat().st_size <= 64 * 1024 * 1024, 'database/metadata exceeds adoption bound')
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''): result.update(chunk)
    return result.hexdigest()


def original_tables(path):
    """Every original user table and schema object, including unknown extras."""
    with closing(readonly(path, immutable=True)) as db:
        require(db.execute('PRAGMA integrity_check').fetchall()[0][0] == 'ok', 'database integrity differs')
        require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'database foreign keys differ')
        objects = db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
        result = {'objects': {}, 'tables': {}}
        require(len(objects) <= 2048, 'database schema exceeds adoption bound')
        for obj in objects:
            kind, name, table, sql = obj
            if name in IDENTITY_OBJECTS: continue
            require(sql is not None, 'explicit database schema required')
            result['objects'][name] = {'type':kind, 'table':table, 'sql_sha256':hashlib.sha256(sql.encode()).hexdigest()}
            if kind != 'table': continue
            quote = '"' + name.replace('"', '""') + '"'
            cursor = db.execute('SELECT * FROM ' + quote)
            rows = cursor.fetchmany(100001)
            require(len(rows) <= 100000, 'database table exceeds adoption bound')
            def cell(value):
                return {'blob': value.hex()} if type(value) is bytes else {'type':type(value).__name__, 'value':value}
            encoded = sorted(canonical([cell(value) for value in row]) for row in rows)
            digest = hashlib.sha256()
            for row in encoded: digest.update(len(row).to_bytes(8, 'big')); digest.update(row)
            result['tables'][name] = {'columns':[column[0] for column in cursor.description],
                                     'rows':len(rows), 'sha256':digest.hexdigest()}
        return result


def no_sidecars(state):
    for name in DB_NAMES:
        for suffix in ('-wal', '-shm', '-journal'):
            sidecar = state / (name + suffix)
            if sidecar.exists():
                file_identity(sidecar)
                require(suffix == '-shm' or sidecar.stat().st_size == 0,
                        'closed checkpointed database required before adoption/restore')


@dataclass(frozen=True, slots=True)
class LegacyAdoptionPlan:
    spec: FreshContractSpec
    migration_id: str
    authority_id: str
    account_id: str
    inputs_json: str


def inspect_legacy(coordinator, spec, *, migration_id):
    """Read-only DB inspection under the stopped legacy server's actual lock."""
    require(type(spec) is FreshContractSpec, 'explicit host contract specification required')
    for value in (spec.ledger_ref, spec.owner_actor, spec.owner_ref, spec.primary_device_ref): identifier(value)
    uuid_text(migration_id)
    state = private_directory(spec.canonical_state)
    with coordinator.mutex:
        coordinator._check_registry(); coordinator._separate_state(state)
        fd = coordinator._lock_state(state)
        try:
            no_sidecars(state)
            marker = read_json(state / 'AUTHORITY.json')
            fields = {'schema','owner','migration','authority_id'}
            require(set(marker) in (fields, fields | {'device_bound'}) and
                    marker['schema'] == 'public-wallet-authority/1' and marker['owner'] == spec.owner_actor == 'alice' and
                    marker['migration'] is False and marker.get('device_bound', True) is True,
                    'only an explicit stopped legacy Alice backend may be adopted')
            uuid_text(marker['authority_id'])
            wallet, store = (state / name for name in DB_NAMES)
            files = {name: {'identity':file_identity(state/name), 'sha256':digest_file(state/name)} for name in DB_NAMES}
            require(files[DB_NAMES[0]]['identity'] != files[DB_NAMES[1]]['identity'], 'distinct databases required')
            tables = {name:original_tables(state/name) for name in DB_NAMES}
            with closing(readonly(store, immutable=True)) as db:
                rows = db.execute('SELECT account_id,owner_ref FROM accounts').fetchall()
                require(len(rows) == 1 and rows[0]['owner_ref'] == spec.owner_ref, 'one original owner/account required')
                account = rows[0]['account_id']; identifier(account)
                binding = db.execute('SELECT * FROM device_binding').fetchall()
                require(len(binding) == 1 and binding[0]['device_ref'] == spec.primary_device_ref and
                        binding[0]['owner_actor'] == spec.owner_actor, 'primary legacy device binding differs')
                links = db.execute('SELECT * FROM wallet_bindings').fetchall()
                original = hashlib.sha256(canonical(files[DB_NAMES[0]]['identity'])).hexdigest()
                require(len(links) == 1 and links[0]['account_id'] == account and links[0]['wallet_identity'] == original,
                        'legacy Wallet inode binding differs; copied legacy restore is not supported')
                require(not db.execute("SELECT 1 FROM sqlite_master WHERE name='wallet_bindings_v2'").fetchone(), 'already managed contract')
            with closing(readonly(wallet, immutable=True)) as db:
                from blackberryrock.wallet import Wallet
                Wallet._verify(db)
                require(not db.execute("SELECT 1 FROM sqlite_master WHERE name='wallet_storage_identity'").fetchone(), 'already managed Wallet')
                auth = db.execute('SELECT * FROM wallet_auth_mode').fetchall()
                require(len(auth) == 1 and auth[0]['authority_id'] == marker['authority_id'] and auth[0]['account_id'] in (None, account),
                        'legacy Wallet authentication identity differs')
                atm = db.execute('SELECT * FROM atm_wallet_binding').fetchall()
                require(not atm or len(atm) == 1 and atm[0]['owner_id'] == account and atm[0]['device_id'] == spec.primary_device_ref,
                        'legacy ATM binding differs')
                for table, column in (('wallet_auth_credentials','account_id'), ('atm_credentials','owner_id')):
                    require(not db.execute(f'SELECT 1 FROM {table} WHERE {column} != ? LIMIT 1', (account,)).fetchone(),
                            'credential belongs to another original account')
            device = state / 'DEVICE-CREDENTIALS.json'
            credential_hash = digest_file(device) if device.exists() else None
            if marker.get('device_bound'):
                require(credential_hash is not None, 'legacy device credential history missing')
                credentials = read_json(device)
                require(credentials.get('authority_id') == marker['authority_id'], 'legacy transport authority differs')
            inputs = {'authority':marker, 'authority_sha256':digest_file(state/'AUTHORITY.json'),
                      'device_credentials_sha256':credential_hash, 'files':files, 'tables':tables}
            return LegacyAdoptionPlan(spec, migration_id, marker['authority_id'], account, canonical(inputs).decode())
        finally: fcntl.flock(fd, fcntl.LOCK_UN); os.close(fd)


def verify_original(permit):
    """Resume never grants permission to repair or silently rewrite old rows."""
    inputs = permit.marker['legacy_inputs']
    if inputs is None: return
    state = permit.descriptor.canonical_state; no_sidecars(state)
    for name in DB_NAMES:
        require(file_identity(state/name) == inputs['files'][name]['identity'], 'original database inode changed during adoption')
        require(original_tables(state/name) == inputs['tables'][name], 'original database rows/schema changed during adoption')
    device = state / 'DEVICE-CREDENTIALS.json'
    require((digest_file(device) if device.exists() else None) == inputs['device_credentials_sha256'],
            'legacy transport credential history changed during adoption')


def prepare(coordinator, plan):
    require(type(plan) is LegacyAdoptionPlan and type(plan.spec) is FreshContractSpec, 'inspected legacy plan required')
    uuid_text(plan.migration_id); uuid_text(plan.authority_id); identifier(plan.account_id)
    inputs = json.loads(plan.inputs_json)
    require(canonical(inputs).decode() == plan.inputs_json, 'canonical inspected legacy inputs required')
    spec = plan.spec; state = private_directory(spec.canonical_state)
    with coordinator.mutex:
        coordinator._check_registry(); coordinator._separate_state(state)
        require(spec.ledger_ref not in coordinator.permits, 'legacy runtime still owns its writer')
        fd = coordinator._lock_state(state)
        try:
            marker = read_json(state/'AUTHORITY.json')
            if marker.get('schema') == MARKER_SCHEMA:
                descriptor = parse_descriptor(marker['descriptor'])
                require(marker['state'] in ('PREPARED', 'ACTIVE') and marker['migration_id'] == plan.migration_id and
                        marker['coordinator_id'] == coordinator.registry['coordinator_id'] and
                        marker['account_id'] == plan.account_id and marker['legacy_inputs'] == inputs and
                        descriptor.wallet_authority_id == plan.authority_id and
                        descriptor_value(descriptor) == {**descriptor_value(descriptor), **{
                            'ledger_ref':spec.ledger_ref,'canonical_state':str(state),'owner_actor':spec.owner_actor,
                            'owner_ref':spec.owner_ref,'primary_device_ref':spec.primary_device_ref}},
                        'only the same prepared adoption may resume')
            else:
                require(marker == inputs['authority'] and digest_file(state/'AUTHORITY.json') == inputs['authority_sha256'],
                        'original authority changed after inspection')
                for name in DB_NAMES:
                    require(digest_file(state/name) == inputs['files'][name]['sha256'], 'original database changed after inspection')
                require(spec.ledger_ref not in coordinator.registry['contracts'], 'ledger already registered')
                require(not any(row['descriptor']['owner_ref'] == spec.owner_ref for row in coordinator.registry['contracts'].values()),
                        'owner already has a contract')
                require(len(coordinator.registry['contracts']) < 64, 'managed contract capacity exceeded')
                descriptor = ContractDescriptor(spec.ledger_ref, str(uuid.uuid4()), plan.authority_id,
                    spec.owner_actor, spec.owner_ref, spec.primary_device_ref, state, 1)
                marker = {'schema':MARKER_SCHEMA, 'minimum_writer_version':2, 'state':'PREPARED',
                    'coordinator_id':coordinator.registry['coordinator_id'], 'descriptor':descriptor_value(descriptor),
                    'migration_id':plan.migration_id, 'account_id':plan.account_id, 'legacy_inputs':inputs}
            row = {'descriptor':descriptor_value(descriptor), 'account_id':plan.account_id,
                   'state':'PREPARED', 'files':None, 'migration_id':plan.migration_id}
            previous = coordinator.registry['contracts'].get(spec.ledger_ref)
            require(previous is None or previous == row, 'existing adoption registry differs; ACTIVE uses open_active')
            marker['state'] = 'PREPARED'
            permit = _Permit(coordinator, descriptor, marker, fd)
            verify_original(permit)
            # This fsync happens before registry/journal writes and any DB DDL.
            write_json(state/'AUTHORITY.json', marker)
            coordinator.registry['contracts'][spec.ledger_ref] = row; coordinator._save_registry()
            coordinator._journal(permit, 'PREPARED')
            coordinator.permits[spec.ledger_ref] = permit
            return permit
        except BaseException: fcntl.flock(fd, fcntl.LOCK_UN); os.close(fd); raise


def _copy_exact(source, destination, expected):
    require(digest_file(source) == expected, 'restore source changed')
    if destination.exists():
        require(digest_file(destination) == expected, 'partial restored file differs; no overwrite recovery')
        return
    fd, temporary = tempfile.mkstemp(prefix='.gx00-copy-', dir=destination.parent)
    try:
        with os.fdopen(fd, 'wb') as stream, source.open('rb') as reader:
            for chunk in iter(lambda: reader.read(1024*1024), b''): stream.write(chunk)
            stream.flush(); os.fsync(stream.fileno())
        require(digest_file(Path(temporary)) == expected, 'restore copy hash differs')
        os.replace(temporary,destination); fsync_directory(destination.parent)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def _source_permit(coordinator, row, *, active=True):
    descriptor = parse_descriptor(row['descriptor'])
    fd = coordinator._lock_state(descriptor.canonical_state)
    try:
        marker = read_json(descriptor.canonical_state/'AUTHORITY.json')
        permit = _Permit(coordinator,descriptor,marker,fd)
        if active: coordinator._verify_marker(permit)
        return permit
    except BaseException: fcntl.flock(fd,fcntl.LOCK_UN); os.close(fd); raise


def stage_restore(coordinator, ledger_ref, destination, *, restore_id):
    """Copy this coordinator's stopped current Wallet to a fenced destination.

    Arbitrary historical backup rollback, old-inode legacy import and transport
    registry restore are intentionally not interfaces of this first profile.
    """
    identifier(ledger_ref); uuid_text(restore_id)
    destination = Path(destination)
    with coordinator.mutex:
        coordinator._check_registry(); coordinator._separate_state(destination)
        require(ledger_ref not in coordinator.permits, 'source runtime/workers must close before restore')
        row = coordinator.registry['contracts'].get(ledger_ref)
        require(row and row['state'] == 'ACTIVE', 'source contract must be ACTIVE and stopped')
        descriptor = parse_descriptor(row['descriptor']); source = descriptor.canonical_state
        require(destination != source and destination.is_absolute() and destination == destination.resolve(), 'new canonical restore destination required')
        require(not any(Path(value['descriptor']['canonical_state']) == destination for value in coordinator.registry['contracts'].values()),
                'restore destination is an existing contract')
        old = coordinator.registry['restores'].get(restore_id)
        if old:
            require(old['ledger_ref'] == ledger_ref and old['destination'] == str(destination) and
                    old['source_descriptor'] == descriptor_value(descriptor) and old['stage'] in ('COPYING','READY'),
                    'only the same unfinished restore can resume')
        else:
            require(len(coordinator.registry['restores']) < 64, 'restore evidence capacity exceeded')
            require(not any(value['ledger_ref'] == ledger_ref and value['stage'] != 'DONE'
                            for value in coordinator.registry['restores'].values()), 'another restore is pending')
            if destination.exists(): require(not list(private_directory(destination).iterdir()), 'restore destination must be empty')
        permit = _source_permit(coordinator,row)
        target_fd = None
        try:
            no_sidecars(source)
            allowed = set(DB_NAMES) | {'AUTHORITY.json','GX00-MIGRATION.json','GX00-RESTORE.json','DEVICE-CREDENTIALS.json','authority.lock','device.lock'}
            allowed |= {name+suffix for name in DB_NAMES for suffix in ('-wal','-shm','-journal')}
            require({path.name for path in source.iterdir()} <= allowed, 'unknown source file needs explicit backup coverage')
            copies = list(DB_NAMES) + (['DEVICE-CREDENTIALS.json'] if (source/'DEVICE-CREDENTIALS.json').exists() else [])
            hashes = {name:digest_file(source/name) for name in copies}
            source_marker = digest_file(source/'AUTHORITY.json')
            if old:
                require(old['copies'] == hashes and old['source_marker_sha256'] == source_marker and old['source_files'] == coordinator._files(descriptor),
                        'source changed since staged restore')
                record = old
            else:
                record = {'restore_id':restore_id,'ledger_ref':ledger_ref,'source_descriptor':descriptor_value(descriptor),
                    'source_marker_sha256':source_marker,'source_files':coordinator._files(descriptor),
                    'source_marker':permit.marker,'destination':str(destination),'copies':hashes,'stage':'COPYING',
                    'destination_files':None,'next_descriptor':None}
                coordinator.registry['restores'][restore_id] = record; coordinator._save_registry()
            private_directory(destination,create=True); target_fd = coordinator._lock_state(destination)
            target_allowed = set(copies) | {'authority.lock','AUTHORITY.json','GX00-RESTORE.json'}
            require({path.name for path in destination.iterdir()} <= target_allowed, 'unknown pending restore file')
            pending = {**permit.marker, 'state':'RESTORE_PENDING', 'restore_id':restore_id,
                       'descriptor':descriptor_value(replace(descriptor,canonical_state=destination))}
            if (destination/'AUTHORITY.json').exists():
                require(read_json(destination/'AUTHORITY.json') == pending, 'restore destination marker differs')
            else: write_json(destination/'AUTHORITY.json',pending)
            for name in copies: _copy_exact(source/name,destination/name,hashes[name])
            # The original source journal remains immutable evidence in source;
            # a dedicated restore record provides destination lineage.
            write_json(destination/'GX00-RESTORE.json', record)
            record['destination_files'] = {name:file_identity(destination/name) for name in DB_NAMES}
            require(not set(map(tuple,record['destination_files'].values())) & set(map(tuple,record['source_files'].values())),
                    'restored database must not alias source')
            record['stage'] = 'READY'; coordinator._save_registry()
            return {'restore_id':restore_id,'state':'RESTORE_PENDING','writer_enabled':False,'destination':str(destination)}
        finally:
            if target_fd is not None: fcntl.flock(target_fd,fcntl.LOCK_UN); os.close(target_fd)
            fcntl.flock(permit.lock_fd,fcntl.LOCK_UN); os.close(permit.lock_fd)


def promote_restore(coordinator, restore_id):
    """Retire the stopped original before activating a higher-epoch copy.

    The protected coordinator is the current authority. Its registry and the
    independent live transport registry are never copied or rolled back.
    """
    uuid_text(restore_id)
    with coordinator.mutex:
        coordinator._check_registry(); coordinator._require_owner_registry()
        record = coordinator.registry['restores'].get(restore_id)
        require(record and record['stage'] in ('READY','PROMOTING','DONE'), 'a complete pending restore is required')
        ref = record['ledger_ref']; require(ref not in coordinator.permits, 'original runtime or unfinished workers still own the contract')
        if record['stage'] == 'DONE':
            descriptor = parse_descriptor(record['next_descriptor'])
            row = coordinator.registry['contracts'][ref]
            require(row['state'] == 'ACTIVE' and row['descriptor'] == record['next_descriptor'],
                    'completed restore is no longer the current generation')
            checked = _source_permit(coordinator,row)
            try:
                require(checked.marker == {**record['source_marker'],'state':'ACTIVE','descriptor':record['next_descriptor']},
                        'completed restore marker differs')
                write_json(descriptor.canonical_state/'GX00-RESTORE.json',record)
            finally: fcntl.flock(checked.lock_fd,fcntl.LOCK_UN); os.close(checked.lock_fd)
            return descriptor
        old = parse_descriptor(record['source_descriptor']); destination = private_directory(record['destination'])
        coordinator._separate_state(destination)
        row = coordinator.registry['contracts'][ref]
        require(row['descriptor'] == record['source_descriptor'] and row['state'] in ('ACTIVE','HANDOVER'), 'source generation changed')
        source_fd = coordinator._lock_state(old.canonical_state)
        target_fd = None
        try:
            target_fd = coordinator._lock_state(destination)
            source_marker = read_json(old.canonical_state/'AUTHORITY.json')
            require(source_marker in (record['source_marker'],{**record['source_marker'],'state':'RETIRED'}), 'source marker changed since restore')
            require(coordinator._files(old) == record['source_files'], 'source database identity changed')
            no_sidecars(old.canonical_state); no_sidecars(destination)
            allowed = set(record['copies']) | {'authority.lock','AUTHORITY.json','GX00-RESTORE.json','GX00-MIGRATION.json'}
            allowed |= {name+suffix for name in DB_NAMES for suffix in ('-wal','-shm','-journal')}
            require({path.name for path in destination.iterdir()} <= allowed, 'unknown pending restore file')
            for name, digest in record['copies'].items():
                require(digest_file(old.canonical_state/name) == digest and digest_file(destination/name) == digest,
                        'source or pending data changed; historical rollback is not supported')
            require({name:file_identity(destination/name) for name in DB_NAMES} == record['destination_files'], 'pending database identity changed')
            next_descriptor = replace(old,canonical_state=destination,writer_epoch=old.writer_epoch+1)
            require(next_descriptor.writer_epoch < 2**63, 'writer epoch exhausted')
            active_marker = {**record['source_marker'],'state':'ACTIVE','descriptor':descriptor_value(next_descriptor)}
            pending = {**record['source_marker'],'state':'RESTORE_PENDING','restore_id':restore_id,
                       'descriptor':descriptor_value(replace(old,canonical_state=destination))}
            require(read_json(destination/'AUTHORITY.json') in (pending,active_marker), 'pending restore marker differs')
            # Validate stable identity on the copy without rewriting inode receipts.
            checked = _Permit(coordinator,next_descriptor,active_marker,target_fd)
            coordinator._validate_identity(checked,row['account_id'])
            record['stage'] = 'PROMOTING'; record['next_descriptor'] = descriptor_value(next_descriptor)
            row['state'] = 'HANDOVER'; coordinator._save_registry()
            # From this durable point every ordinary open is fenced, even if
            # the process stops before either destination marker write.
            write_json(old.canonical_state/'AUTHORITY.json',{**record['source_marker'],'state':'RETIRED'})
            coordinator._journal(checked,'ACTIVE')
            write_json(destination/'AUTHORITY.json',active_marker)
            row.update(descriptor=descriptor_value(next_descriptor),state='ACTIVE',files=record['destination_files'])
            record['stage'] = 'DONE'; coordinator._save_registry()
            write_json(destination/'GX00-RESTORE.json',record)
            return next_descriptor
        finally:
            if target_fd is not None: fcntl.flock(target_fd,fcntl.LOCK_UN); os.close(target_fd)
            fcntl.flock(source_fd,fcntl.LOCK_UN); os.close(source_fd)
