"""Explicit UI-read retention policy; never used by D6/default unchanged().

Capture the complete sandbox under all its writer fences. Only the index's
anti-rollback INTEGER clock may advance between otherwise identical snapshots.
"""
import argparse
from contextlib import closing
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import uuid

import game_authority_observer as observer

SCHEMA = 'rock-game-authority-ui-retention/1'
POLICY = 'index-identity-maximum-time-only/1'
INDEX = 'game-index/game.sqlite3'
COLUMNS = ['singleton', 'uuid', 'path', 'configuration', 'maximum_time']
require = observer.require


def row_digest(cells):
    raw = json.dumps(cells, ensure_ascii=True, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
    return hashlib.sha256(len(raw).to_bytes(8, 'big') + raw).hexdigest()


def identity_table(snapshot):
    matches = [table for table in snapshot['databases'][INDEX]['tables'] if table['name'] == 'identity']
    require(len(matches) == 1, 'exactly one index identity table required')
    return matches[0]


def validate(record):
    require(type(record) is dict and set(record) == {'schema', 'policy', 'config_sha256', 'snapshot', 'index_identity'},
            'complete explicit UI retention observation required')
    require(record['schema'] == SCHEMA and record['policy'] == POLICY and observer.sha(record['config_sha256']),
            'explicit UI retention policy and configuration binding required')
    snapshot = observer.validate(record['snapshot'], record['snapshot']['authority_id'])
    item = record['index_identity']
    require(type(item) is dict and set(item) == {'columns', 'fixed_cells', 'maximum_time'} and item['columns'] == COLUMNS,
            'exact index identity columns required')
    cells, maximum = item['fixed_cells'], item['maximum_time']
    require(type(cells) is list and len(cells) == 5 and cells[:2] == [['intrinsic-rowid', '1'], ['int', '1']],
            'one typed singleton identity with original rowid required')
    require(all(type(cell) is list and len(cell) == 2 and cell[0] == 'text' and type(cell[1]) is str for cell in cells[2:]),
            'typed index UUID, path and configuration required')
    require(str(uuid.UUID(cells[2][1])) == cells[2][1] and Path(cells[3][1]).is_absolute() and
            0 < len(cells[4][1].encode()) <= 1024**2, 'bounded canonical index identity required')
    require(type(maximum) is int and 0 <= maximum <= 2**63 - 1, 'index maximum_time must remain a nonnegative SQLite INTEGER')
    table = identity_table(snapshot)
    require(table['row_count'] == 1 and table['intrinsic_rowid'] == '_rowid_' and
            table['columns_sha256'] == observer.digest(COLUMNS) and
            table['rows_sha256'] == row_digest([*cells, ['int', str(maximum)]]),
            'typed index row projection is not bound to the complete authority snapshot')
    return record


def capture(config, *, policy):
    require(policy == POLICY, 'UI clock retention must be explicitly selected; default snapshots stay exact')
    native = Path(__file__).resolve().parents[2]
    sys.path[:0] = [str(native/'os'), str(native/'src')]
    from game_exchange import sandbox
    from game_exchange.current_restore import _cell
    # No Runtime, connection/status request, repair, or SQLite write is used.
    with sandbox.stopped_snapshot(config) as (state, contract):
        snapshot = sandbox.observe_stopped(state, contract)
        path = state/INDEX
        with closing(sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1', uri=True, isolation_level=None)) as db:
            db.execute('PRAGMA query_only=ON')
            cursor = db.execute('SELECT * FROM identity')
            columns = [column[0] for column in cursor.description]
            require(columns == COLUMNS, 'unknown index identity columns cannot be excluded')
            rows = db.execute('SELECT _rowid_, * FROM identity').fetchmany(2)
            require(len(rows) == 1, 'unknown or missing index identity rows cannot be excluded')
            row = rows[0]
            require(type(row[-1]) is int, 'index maximum_time must retain INTEGER storage type')
            require(row[3] == str(state/'game-index'), 'index identity path differs from fenced authority')
            item = {'columns': columns, 'fixed_cells': [['intrinsic-rowid', str(row[0])], *[_cell(v) for v in row[1:-1]]],
                    'maximum_time': row[-1]}
        # Re-observe inside the same complete fence; any side effect is a failure.
        require(snapshot == sandbox.observe_stopped(state, contract), 'UI retention capture changed retained authority state')
        return validate({'schema': SCHEMA, 'policy': policy, 'config_sha256': sandbox.config_digest(config),
                         'snapshot': snapshot, 'index_identity': item})


def compare(before, after, *, policy):
    require(policy == POLICY, 'UI clock retention must be explicitly selected; default snapshots stay exact')
    validate(before); validate(after)
    require(before['config_sha256'] == after['config_sha256'], 'authority configuration changed')
    require(before['index_identity']['fixed_cells'] == after['index_identity']['fixed_cells'],
            'index UUID, path, configuration, singleton or rowid changed')
    old = before['index_identity']['maximum_time']; new = after['index_identity']['maximum_time']
    require(new >= old, 'index anti-rollback clock regressed')
    projected = []
    for record in (before, after):
        full = copy.deepcopy(record['snapshot'])
        identity_table(full)['rows_sha256'] = row_digest([*record['index_identity']['fixed_cells'], ['int', '0']])
        projected.append(full)
    observer.unchanged(*projected)
    return {'schema': 'rock-game-authority-ui-retention-result/1', 'status': 'PASS', 'policy': policy,
            'before_sha256': observer.digest(before), 'after_sha256': observer.digest(after),
            'database_count': len(before['snapshot']['databases']),
            'table_count': sum(len(db['tables']) for db in before['snapshot']['databases'].values()),
            'maximum_time_before': old, 'maximum_time_after': new,
            'other_typed_rows_schema_sequences_and_identities': 'EXACTLY_UNCHANGED', 'default_unchanged_policy_modified': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['capture', 'compare'])
    parser.add_argument('--policy', choices=[POLICY], required=True)
    parser.add_argument('--config', type=Path)
    parser.add_argument('--before', type=Path)
    parser.add_argument('--after', type=Path)
    args = parser.parse_args()
    if args.action == 'capture':
        require(args.config is not None and args.before is None and args.after is None, 'capture needs only protected sandbox config')
        native = Path(__file__).resolve().parents[2]
        sys.path[:0] = [str(native/'os'), str(native/'src')]
        from game_exchange import sandbox
        result = capture(sandbox.load(args.config), policy=args.policy)
    else:
        require(args.before is not None and args.after is not None and args.config is None, 'compare needs two prior observations')
        def read(path):
            observer.fixed_file(path.resolve(strict=True), observer.LIMITS['stdout_bytes'], private=True)
            return json.loads(path.read_bytes())
        result = compare(read(args.before), read(args.after), policy=args.policy)
    print(json.dumps(result, sort_keys=True, separators=(',', ':'), allow_nan=False))


if __name__ == '__main__':
    main()
