"""Closed Game SDK evidence: only declared read clocks may advance.

Callers still hash every schema object, table, sequence and complete row. This
adds typed projections for the two tables whose whole-row hash includes a read
clock; no authoritative state or financial receipt is excluded.
"""
import copy
import hashlib
import json
import re

MAX_INT = 2**53 - 1
ROLES = ('game_exchange_cache', 'game_connection_a', 'game_connection_b')
IDENTITY = ['singleton', 'uuid', 'path', 'configuration', 'maximum_time']
BINDINGS = ['intent_id', 'connection_id', 'intent', 'consent', 'generation', 'as_of', 'shared']
POLICY = {
    'schema': 'rock-game-cache-read-policy/1', 'database_roles': list(ROLES),
    'identity': {'columns': IDENTITY, 'mutable': 'maximum_time', 'row_count': 1},
    'bindings': {'roles': list(ROLES[1:]), 'columns': BINDINGS, 'mutable': 'as_of'},
    'type': 'SQLite INTEGER; 0 <= value <= 9007199254740991',
    'order': 'each after >= before; each bindings.as_of <= identity.maximum_time',
    'unchanged': 'every other typed cell, row identity/count, generation, schema, sequence, request, receipt and additional table',
    'authority': 'SDK observations only; every external authoritative table remains separately invariant',
}


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                    ensure_ascii=True, allow_nan=False).encode()).hexdigest()


def cell(value):
    if value is None:
        return ['null', None]
    if type(value) is bytes:
        return ['blob', value.hex()]
    if type(value) is float:
        return ['real', value.hex()]
    require(type(value) in (int, str), 'unknown Game SQLite cell type')
    return ['integer' if type(value) is int else 'text', value]


def clock(value, sql_type):
    require(type(value) is int and sql_type == 'integer' and 0 <= value <= MAX_INT,
            'Game read clock must be bounded SQLite INTEGER')


def observe(db, role):
    require(role in ROLES, 'unknown Game cache role')
    require([r[1] for r in db.execute('PRAGMA table_info(identity)')] == IDENTITY,
            'Game identity columns differ from declared read policy')
    rows = db.execute('SELECT rowid,*,typeof(maximum_time) FROM identity LIMIT 2').fetchall()
    require(len(rows) == 1, 'one Game identity row required')
    row = tuple(rows[0]); maximum = row[-2]
    require(type(row[0]) is int and type(row[1]) is int and row[0] == row[1] == 1,
            'Game identity singleton or intrinsic row identity changed')
    clock(maximum, row[-1])
    result = {'schema': 'rock-game-cache-read-sync/1', 'role': role,
              'identity': {'stable_sha256': digest([cell(v) for v in row[:-2]]),
                           'maximum_time': maximum, 'sqlite_type': row[-1]}, 'bindings': []}
    if role != 'game_exchange_cache':
        require([r[1] for r in db.execute('PRAGMA table_info(bindings)')] == BINDINGS,
                'Game bindings columns differ from declared read policy')
        rows = db.execute('SELECT rowid,*,typeof(as_of) FROM bindings ORDER BY intent_id LIMIT 20001').fetchall()
        require(len(rows) <= 20000, 'bounded Game binding observation exceeded')
        for record in rows:
            row = tuple(record); as_of = row[-3]
            require(type(row[0]) is int and type(row[1]) is str and row[1],
                    'Game binding row identity required')
            clock(as_of, row[-1])
            require(as_of <= maximum, 'Game binding observation is ahead of its clock')
            result['bindings'].append({'key_sha256': digest(cell(row[1])),
                'stable_sha256': digest([cell(v) for v in row[:-3] + row[-2:-1]]),
                'as_of': as_of, 'sqlite_type': row[-1]})
    return result


def compare(before, after, role):
    require(role in ROLES, 'unknown Game cache role')
    for value in (before, after):
        sync = value.get('game_read_sync')
        require(type(sync) is dict and set(sync) == {'schema', 'role', 'identity', 'bindings'} and
                sync['schema'] == 'rock-game-cache-read-sync/1' and sync['role'] == role,
                'complete Game read-sync observation required')
        identity = sync['identity']
        require(type(identity) is dict and set(identity) == {'stable_sha256', 'maximum_time', 'sqlite_type'},
                'complete Game identity projection required')
        clock(identity['maximum_time'], identity['sqlite_type'])
        require(type(identity['stable_sha256']) is str and re.fullmatch('[0-9a-f]{64}', identity['stable_sha256']),
                'Game identity typed projection hash required')
        require(value['tables']['identity']['rows'] == 1, 'Game identity row count changed')
        bindings = sync['bindings']
        require(type(bindings) is list and len(bindings) <= 20000, 'bounded Game bindings projection required')
        require((not bindings) if role == 'game_exchange_cache' else
                value['tables']['bindings']['rows'] == len(bindings), 'Game bindings row count changed')
        keys = set()
        for binding in bindings:
            require(type(binding) is dict and set(binding) == {'key_sha256', 'stable_sha256', 'as_of', 'sqlite_type'},
                    'complete Game binding projection required')
            for key in ('key_sha256', 'stable_sha256'):
                require(type(binding[key]) is str and re.fullmatch('[0-9a-f]{64}', binding[key]),
                        'Game binding typed projection hash required')
            require(binding['key_sha256'] not in keys, 'duplicate Game binding key')
            keys.add(binding['key_sha256'])
            clock(binding['as_of'], binding['sqlite_type'])
            require(binding['as_of'] <= identity['maximum_time'], 'Game binding observation is ahead of its clock')
    first, second = before['game_read_sync'], after['game_read_sync']
    require(second['identity']['maximum_time'] >= first['identity']['maximum_time'],
            'Game identity read clock moved backwards')
    require([r['key_sha256'] for r in first['bindings']] == [r['key_sha256'] for r in second['bindings']],
            'Game binding row identities changed')
    for one, two in zip(first['bindings'], second['bindings']):
        require(two['as_of'] >= one['as_of'], 'Game binding read clock moved backwards')
    normalized = []
    for original in (before, after):
        value = copy.deepcopy(original)
        del value['game_read_sync']['identity']['maximum_time']
        del value['tables']['identity']['logical_sha256']
        for binding in value['game_read_sync']['bindings']:
            del binding['as_of']
        if role != 'game_exchange_cache':
            del value['tables']['bindings']['logical_sha256']
        normalized.append(value)
    require(normalized[0] == normalized[1], 'Game cache changed outside declared read clocks')
