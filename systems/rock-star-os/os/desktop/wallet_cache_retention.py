"""Closed SQLite evidence for the one declared remote-cache refresh field.

This never restores a cache or treats it as a spendable Wallet authority. The
caller must separately fence and compare every authoritative database.
"""
import copy
import hashlib
import math
import re


POLICY = {
    'database_role': 'wallet_cache',
    'table': 'snapshot',
    'column': 'received_at',
    'type': 'SQLite REAL, finite and positive',
    'order': 'after >= before',
    'row_count': 1,
    'unchanged': 'singleton, exact payload bytes, schema, sequences, identity, requests and every additional table',
    'authority': 'cache is not spendable; all external authority state needs separate complete observation',
}


def require(value, message):
    if not value:
        raise ValueError(message)


def observe(db):
    """Use the caller's already-open read-only snapshot transaction."""
    columns = [row[1] for row in db.execute('PRAGMA table_info(snapshot)')]
    require(columns == ['singleton', 'payload', 'received_at'],
            'remote cache snapshot columns differ from declared refresh policy')
    rows = db.execute('SELECT singleton,payload,received_at,typeof(received_at) FROM snapshot LIMIT 2').fetchall()
    require(len(rows) == 1, 'one synchronized remote cache snapshot required')
    singleton, payload, received_at, sql_type = rows[0]
    require(type(singleton) is int and singleton == 1 and type(payload) is str and payload,
            'invalid remote cache singleton or payload')
    require(sql_type == 'real' and type(received_at) is float and math.isfinite(received_at) and received_at > 0,
            'remote cache received_at must be a finite positive SQLite REAL')
    return {'schema': 'rock-cache-read-sync/1', 'singleton': singleton,
            'payload_sha256': hashlib.sha256(payload.encode()).hexdigest(),
            'received_at': received_at, 'received_at_sqlite_type': sql_type}


def compare(before, after):
    """Permit only the declared time change; all other observation fields match."""
    for value in (before, after):
        sync = value.get('read_sync')
        require(type(sync) is dict and set(sync) == {
            'schema', 'singleton', 'payload_sha256', 'received_at', 'received_at_sqlite_type'},
            'complete remote cache refresh observation required')
        require(sync['schema'] == 'rock-cache-read-sync/1' and sync['singleton'] == 1 and
                type(sync['singleton']) is int and sync['received_at_sqlite_type'] == 'real' and
                type(sync['payload_sha256']) is str and re.fullmatch('[0-9a-f]{64}', sync['payload_sha256']) and
                type(sync['received_at']) is float and math.isfinite(sync['received_at']) and sync['received_at'] > 0,
                'remote cache refresh type or value changed')
        require(value['tables']['snapshot']['rows'] == 1, 'remote cache snapshot row count changed')
    require(after['read_sync']['received_at'] >= before['read_sync']['received_at'],
            'remote cache refresh time moved backwards')
    normalized = []
    for value in (before, after):
        value = copy.deepcopy(value)
        del value['read_sync']['received_at']
        # The whole-row hash changes when its declared timestamp changes. The
        # exact payload hash and singleton remain in read_sync, while every
        # other table (including future tables) keeps its original row hash.
        del value['tables']['snapshot']['logical_sha256']
        normalized.append(value)
    require(normalized[0] == normalized[1],
            'remote cache changed outside the declared read-sync timestamp')
