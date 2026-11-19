#!/usr/bin/env python3
"""Check design artifacts only. No app routes, production D1, or provider calls.

The small schema evaluator below covers the keywords used by our payload examples;
it is not advertised as a complete OpenAPI/JSON Schema conformance validator.
"""
import json
from pathlib import Path
import re
import sqlite3
import tempfile

BASE = Path(__file__).resolve().parent
API = json.loads((BASE / 'connection-sharing.openapi.json').read_text())
COUNTS = {'references': 0, 'payload_examples': 0, 'sqlite_assertions': 0}


def resolve(ref):
    assert ref.startswith('#/'), ref
    value = API
    for part in ref[2:].split('/'):
        value = value[part.replace('~1', '/').replace('~0', '~')]
    return value


def walk(value):
    if isinstance(value, dict):
        if '$ref' in value:
            resolve(value['$ref'])
            COUNTS['references'] += 1
        for child in value.values():
            walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)


def valid(value, schema):
    if '$ref' in schema:
        return valid(value, resolve(schema['$ref']))
    if 'oneOf' in schema and sum(valid(value, x) for x in schema['oneOf']) != 1:
        return False
    if not all(valid(value, x) for x in schema.get('allOf', [])):
        return False
    if 'not' in schema and valid(value, schema['not']):
        return False
    if 'if' in schema:
        branch = 'then' if valid(value, schema['if']) else 'else'
        if branch in schema and not valid(value, schema[branch]):
            return False
    if 'const' in schema and (type(value) is not type(schema['const']) or value != schema['const']):
        return False
    if 'enum' in schema and value not in schema['enum']:
        return False
    kind = schema.get('type')
    kinds = {'object': dict, 'array': list, 'string': str, 'integer': int, 'boolean': bool}
    if kind and type(value) is not kinds[kind]:
        return False
    if isinstance(value, dict):
        props = schema.get('properties', {})
        if any(key not in value for key in schema.get('required', [])):
            return False
        if schema.get('additionalProperties') is False and set(value) - set(props):
            return False
        if any(not valid(child, props[key]) for key, child in value.items() if key in props):
            return False
    if isinstance(value, list):
        if not schema.get('minItems', 0) <= len(value) <= schema.get('maxItems', float('inf')):
            return False
        if schema.get('uniqueItems') and len({json.dumps(x, sort_keys=True) for x in value}) != len(value):
            return False
        if any(not valid(x, schema.get('items', {})) for x in value):
            return False
    if isinstance(value, str):
        if len(value) > schema.get('maxLength', float('inf')):
            return False
        if 'pattern' in schema and re.search(schema['pattern'], value) is None:
            return False
    if type(value) is int:
        if not schema.get('minimum', -float('inf')) <= value <= schema.get('maximum', float('inf')):
            return False
    return True


def example(name, value, expected):
    assert valid(value, API['components']['schemas'][name]) == expected, (name, value, expected)
    COUNTS['payload_examples'] += 1


walk(API)
assert API['openapi'] == '3.1.0'
ops = [op for path in API['paths'].values() for op in path.values()]
assert len(ops) == len({x['operationId'] for x in ops}) == 26
assert len(API['paths']) == 20
for op in ops:
    for response in op['responses'].values():
        response = resolve(response['$ref']) if '$ref' in response else response
        assert response['headers']['Cache-Control']['schema']['const'] == 'private, no-store'
    assert all(str(code) in op['responses'] for code in (401, 403, 404, 409, 503))

uuid = '11111111-1111-4111-8111-111111111111'
token = 'a' * 43
content = {'schema': 'noah.draft/1', 'text': '未送信です', 'autoSave': False,
           'entryKind': 'new', 'sourceRefs': [], 'restrictedDerived': False}
create = {'id': uuid, 'expectedRevision': 0, 'content': content, 'createNonce': token}
example('DraftCreate', create, True)
example('DraftCreate', {**create, 'ownerId': 'other'}, False)
example('DraftCreate', {**create, 'expectedRevision': 1}, False)
example('DraftContent', {**content, 'text': 'あ' * 2000}, True)
example('DraftContent', {**content, 'text': 'あ' * 2001}, False)
example('DraftContent', {**content, 'entryKind': 'thread'}, False)
example('DraftContent', {**content, 'restrictedDerived': True}, False)
example('DraftContent', {**content, 'apiKey': 'not-allowed'}, False)
example('PolicyWrite', {'expectedRevision': 0, 'mode': 'deny', 'destinationIds': []}, True)
example('PolicyWrite', {'expectedRevision': 0, 'mode': 'deny', 'destinationIds': ['x']}, False)
example('PolicyWrite', {'expectedRevision': 0, 'mode': 'allow_list', 'destinationIds': []}, False)
example('PolicyWrite', {'expectedRevision': 0, 'mode': 'allow_list', 'destinationIds': ['x', 'x']}, False)
example('PreviewApproval', {'expectedRevision': 1, 'approvalDigest': 'a' * 64, 'consent': True}, True)
example('PreviewApproval', {'expectedRevision': 1, 'approvalDigest': 'a' * 64, 'consent': False}, False)
for lifetime, ok in [(299, False), (300, True), (86400, True), (604800, True), (604801, False)]:
    example('InviteIssue', {'createNonce': token, 'lifetimeSeconds': lifetime}, ok)
example('InviteRedeem', {'token': token, 'rulesVersion': 0, 'consent': True}, True)
example('InviteRedeem', {'token': token, 'rulesVersion': 0, 'consent': False}, False)
example('NonceResponse', {'expiresAt': 1000, 'nonceAvailable': False}, True)
example('NonceResponse', {'expiresAt': 1000, 'nonceAvailable': False, 'nonce': token}, False)
example('NonceRequest', {'purpose': 'draft.create', 'targetId': uuid,
        'intent': {k: v for k, v in create.items() if k != 'createNonce'}}, True)
example('NonceRequest', {'purpose': 'invite.issue', 'targetId': 'c', 'intent': {}}, True)


def expect_integrity(db, sql, args=()):
    try:
        with db:
            db.execute(sql, args)
    except sqlite3.IntegrityError:
        COUNTS['sqlite_assertions'] += 1
    else:
        raise AssertionError('Expected integrity failure: ' + sql)


with tempfile.TemporaryDirectory(prefix='noah-contract-') as tmp:
    path = str(Path(tmp) / 'reference.sqlite')
    db = sqlite3.connect(path)
    db.execute('PRAGMA foreign_keys=ON')
    # Stubs are only the existing parent keys needed to compile reference DDL.
    db.executescript('CREATE TABLE sky_communities(id TEXT PRIMARY KEY);'
                     'CREATE TABLE remote_ai_text_executions(id TEXT PRIMARY KEY);'
                     "INSERT INTO sky_communities VALUES('c');"
                     "INSERT INTO remote_ai_text_executions VALUES('e');")
    db.executescript((BASE / 'connection-sharing.schema.sql').read_text())
    assert len(db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()) == 14
    COUNTS['sqlite_assertions'] += 1
    with db:
        db.execute("INSERT INTO sky_community_egress_policies VALUES('c',1,'deny','[]','p',1)")
        db.execute("INSERT INTO sky_community_egress_heads VALUES('c',1,1)")
    expect_integrity(db, "UPDATE sky_community_egress_heads SET revision=2 WHERE community_id='c'")
    expect_integrity(db, "UPDATE sky_community_egress_policies SET mode='allow_list'")
    expect_integrity(db, "INSERT INTO sky_community_egress_policies VALUES('c',2,'allow_list','[]','p',2)")
    expect_integrity(db, "INSERT INTO sky_community_egress_policies VALUES('missing',1,'deny','[]','p',1)")
    draft_sql = '''INSERT INTO eve_composer_drafts
        (owner_id,id,revision,state,envelope,created_at,updated_at,expires_at,last_operation_id)
        VALUES(?,?,1,'editable','encrypted-fixture',1,1,100000,'create')'''
    with db:
        db.execute(draft_sql, ('owner', uuid))
        db.execute(draft_sql, ('other', uuid))
    expect_integrity(db, draft_sql, ('owner', uuid))
    expect_integrity(db, "UPDATE eve_composer_drafts SET envelope=NULL WHERE owner_id='owner'")
    expect_integrity(db, "UPDATE eve_composer_drafts SET envelope=? WHERE owner_id='owner'", ('x' * 24577,))
    # False postcondition rolls back the preceding successful write as well.
    try:
        with db:
            db.execute("UPDATE eve_composer_drafts SET revision=2 WHERE owner_id='owner'")
            db.execute("UPDATE eve_composer_drafts SET revision=3 WHERE owner_id='missing'")
            db.execute("INSERT INTO noah_tx_guards VALUES('g',CASE WHEN changes()=1 THEN 1 ELSE 0 END)")
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError('Expected batch rollback')
    assert db.execute("SELECT revision FROM eve_composer_drafts WHERE owner_id='owner'").fetchone()[0] == 1
    COUNTS['sqlite_assertions'] += 1
    # Two connections observed revision 1. Winner advances it; stale CAS must roll back.
    second = sqlite3.connect(path)
    second.execute('PRAGMA foreign_keys=ON')
    for conn, wins in [(db, True), (second, False)]:
        succeeded = True
        try:
            with conn:
                conn.execute("UPDATE eve_composer_drafts SET revision=2 WHERE owner_id='owner' AND revision=1")
                conn.execute("INSERT INTO noah_tx_guards VALUES('cas',CASE WHEN changes()=1 THEN 1 ELSE 0 END)")
                conn.execute("DELETE FROM noah_tx_guards WHERE id='cas'")
        except sqlite3.IntegrityError:
            succeeded = False
        assert succeeded == wins
        COUNTS['sqlite_assertions'] += 1
    assert db.execute("SELECT revision FROM eve_composer_drafts WHERE owner_id='other'").fetchone()[0] == 1
    with db:
        db.execute("UPDATE eve_composer_drafts SET state='deleted',envelope=NULL,terminal_at=2,retain_until=7776000002 WHERE owner_id='owner'")
    expect_integrity(db, "UPDATE eve_composer_drafts SET state='editable',envelope='x',terminal_at=NULL,retain_until=NULL WHERE owner_id='owner'")
    with db:
        db.execute("INSERT INTO sky_community_invite_controls VALUES('c',2,1,1,1,1)")
    invite_sql = '''INSERT INTO sky_community_invites
        (id,community_id,issuer_owner_id,issuer_profile_id,epoch,token_hash,state,created_at,expires_at,issue_operation_id)
        VALUES(?,'c','owner','p',1,?,'active',1,?,?)'''
    with db:
        db.execute(invite_sql, ('i', 'b' * 64, 300001, 'issue'))
    expect_integrity(db, invite_sql, ('too-short', 'c' * 64, 300000, 'short'))
    expect_integrity(db, invite_sql, ('too-long', 'c' * 64, 604800002, 'long'))
    expect_integrity(db, invite_sql, ('duplicate-token', 'b' * 64, 300001, 'dup'))
    expect_integrity(db, "UPDATE sky_community_invites SET state='redeemed' WHERE id='i'")
    with db:
        db.execute("UPDATE sky_community_invites SET state='revoked',revoked_at=2,terminal_at=2,retain_until=7776000002 WHERE id='i'")
    expect_integrity(db, "UPDATE sky_community_invites SET state='active',terminal_at=NULL,retain_until=NULL WHERE id='i'")
    assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    assert db.execute('SELECT COUNT(*) FROM noah_tx_guards').fetchone()[0] == 0
    COUNTS['sqlite_assertions'] += 2
    second.close()
    db.close()

print(json.dumps({'status': 'pass', 'scope': 'design_artifacts_only', 'paths': 20,
                  'operations': len(ops), 'tables': 12, **COUNTS,
                  'not_tested': ['complete OpenAPI meta-schema conformance', 'product API',
                                 'D1 batch/runtime', 'network concurrency', 'provider', 'browser']}, indent=2))
