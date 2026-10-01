"""Bounded host observation of a stopped, owned development Game authority.

The sandbox owns its writer lifecycle and holds every lifetime fence during
snapshot. This caller neither opens its databases nor repairs or restores them.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import uuid

SCHEMA = 'rock-game-sandbox-snapshot/1'
REQUIRED_DATABASES = frozenset(('contracts/alice/wallet-simulator.db', 'contracts/alice/entitlement.db',
                               'game-a/game.sqlite3', 'game-b/game.sqlite3', 'game-index/game.sqlite3'))
REQUIRED_IDENTITIES = frozenset(('coordinator/registry.json', 'router/OWNER-DEVICES.json'))
LIMITS = {'start_seconds': 30, 'stop_seconds': 30, 'snapshot_seconds': 30,
          'stdout_bytes': 2 * 1024**2, 'stderr_bytes': 256 * 1024,
          'databases': 64, 'tables_per_database': 2048, 'rows_per_table': 100000}
EMPTY_TABLES = {
    'wallet-simulator.db': (
        'wallet_journals', 'wallet_postings', 'wallet_sales', 'wallet_bills',
        'wallet_consents', 'wallet_withdrawals', 'wallet_idempotency', 'atm_credentials',
        'wallet_auth_credentials', 'wallet_auth_credential_state',
        'wallet_auth_challenges', 'wallet_auth_terms', 'wallet_auth_quotes', 'wallet_auth_approvals'),
    'entitlement.db': ('accounts', 'consents', 'authorizations', 'device_monthly_due', 'device_api_receipts'),
}


def require(value, message):
    if not value:
        raise ValueError(message)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def sha(value):
    return type(value) is str and re.fullmatch('[0-9a-f]{64}', value) is not None


def validate(snapshot, authority_id):
    require(type(snapshot) is dict and set(snapshot) == {
        'schema', 'authority_id', 'databases', 'identities', 'simulation_only'},
        'complete stopped authority snapshot required')
    require(snapshot['schema'] == SCHEMA and snapshot['simulation_only'] is True and
            snapshot['authority_id'] == authority_id and str(uuid.UUID(authority_id)) == authority_id,
            'stopped authority identity or development scope differs')
    databases = snapshot['databases']
    require(type(databases) is dict and 1 <= len(databases) <= LIMITS['databases'],
            'bounded complete authority database inventory required')
    require(REQUIRED_DATABASES <= set(databases), 'required Wallet, Game or index database is missing')
    for path, database in databases.items():
        require(type(path) is str and 1 <= len(path) <= 512 and '\\' not in path and
                not PurePosixPath(path).is_absolute() and all(part not in ('', '.', '..') for part in path.split('/')),
                'canonical relative authority database path required')
        require(type(database) is dict and set(database) == {'schema_sha256', 'tables', 'pragmas'} and
                sha(database['schema_sha256']), 'complete authority SQLite schema observation required')
        tables = database['tables']
        require(type(tables) is list and 1 <= len(tables) <= LIMITS['tables_per_database'], 'bounded authority table inventory required')
        names = set()
        for table in tables:
            require(type(table) is dict and set(table) == {
                'name', 'columns_sha256', 'intrinsic_rowid', 'row_count', 'rows_sha256'},
                'complete typed authority table observation required')
            name = table['name']
            require(type(name) is str and 1 <= len(name) <= 1024 and name not in names,
                    'duplicate or invalid authority table')
            names.add(name)
            require(sha(table['columns_sha256']) and sha(table['rows_sha256']) and
                    table['intrinsic_rowid'] in (None, '_rowid_', 'rowid', 'oid') and
                    type(table['row_count']) is int and 0 <= table['row_count'] <= LIMITS['rows_per_table'],
                    'invalid typed authority table evidence')
        require(type(database['pragmas']) is dict and set(database['pragmas']) == {
            'application_id', 'user_version', 'encoding', 'auto_vacuum'}, 'complete authority pragma observation required')
    require(type(snapshot['identities']) is dict and REQUIRED_IDENTITIES <= set(snapshot['identities']),
            'authority identities and protected JSON inventory required')
    require(len(canonical(snapshot)) <= LIMITS['stdout_bytes'], 'authority snapshot exceeds evidence bound')
    return snapshot


def empty_baseline(snapshot):
    """Registration, authorization and monetary rows must precede no UI input."""
    matched = set()
    for path, database in snapshot['databases'].items():
        filename = PurePosixPath(path).name
        if filename not in EMPTY_TABLES:
            continue
        matched.add(filename)
        tables = {table['name']: table for table in database['tables']}
        require(set(EMPTY_TABLES[filename]) <= set(tables), 'missing baseline Wallet or membership table')
        require(all(tables[name]['row_count'] == 0 for name in EMPTY_TABLES[filename]),
                'authority baseline already contains financial, credential or membership actions')
    require(matched == set(EMPTY_TABLES), 'both authoritative Wallet and membership databases are required')
    return {'status': 'EMPTY_BEFORE_UI', 'required_empty_tables': EMPTY_TABLES,
            'authority_snapshot_sha256': digest(snapshot)}


def unchanged(before, after):
    require(canonical(before) == canonical(after),
            'authoritative schema, typed rows, sequences, identities or protected JSON changed')


def fixed_file(path, maximum, *, private=False):
    path = Path(path)
    require(path.is_absolute() and path == path.resolve(strict=True), 'canonical fixed observer input required')
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1 and
            not info.st_mode & (0o077 if private else 0o022) and 0 < info.st_size <= maximum,
            'protected owned bounded observer input required')
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Observer:
    def __init__(self, cli, config, authority_id, output):
        self.cli, self.config, self.output = map(Path, (cli, config, output))
        self.authority_id = authority_id
        self.input_hashes = self._inputs()
        self.sequence = 0

    def _inputs(self):
        return {'sandbox_cli_sha256': fixed_file(self.cli, 1024**2),
                'sandbox_config_sha256': fixed_file(self.config, 65536, private=True)}

    def invoke(self, action):
        require(action in ('start', 'stop', 'snapshot'), 'unknown authority observer action')
        require(self._inputs() == self.input_hashes, 'frozen authority observation input changed')
        self.sequence += 1
        result = subprocess.run([sys.executable, '-I', '-B', str(self.cli), action, '--config', str(self.config)],
                                capture_output=True, timeout=LIMITS[action + '_seconds'])
        require(len(result.stdout) <= LIMITS['stdout_bytes'] and len(result.stderr) <= LIMITS['stderr_bytes'],
                'authority observer output exceeds frozen bound')
        require(self._inputs() == self.input_hashes, 'authority observation input changed during command')
        if result.returncode:
            # Preserve bounded original diagnostics privately, never include
            # configuration or credential bytes in the public exception.
            for suffix, raw in (('stdout', result.stdout), ('stderr', result.stderr)):
                path = self.output / f'authority-{self.sequence:02d}-{action}.{suffix}'
                with path.open('xb') as stream:
                    stream.write(raw)
                path.chmod(0o600)
            raise ValueError('authority ' + action + ' failed; private diagnostics retained')
        if action == 'snapshot':
            def unique(pairs):
                value = {}
                for key, item in pairs:
                    require(key not in value, 'duplicate authority snapshot JSON field')
                    value[key] = item
                return value
            snapshot = json.loads(result.stdout, object_pairs_hook=unique)
            return validate(snapshot, self.authority_id)
        return {'action': action, 'exit_code': result.returncode}
