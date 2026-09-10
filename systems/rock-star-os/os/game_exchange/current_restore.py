"""Explicit stopped-current-copy game handover; never an HTTP restore API.

C proves retained current-copy provenance. The original independent game index
is kept, with a recoverable two-commit handover. Original mode, consent, signed
receipts, reservations and credential counters are never rewritten.
"""
from contextlib import closing, contextmanager
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import sqlite3

from . import protocol as p
from .connections import identity, encoded, loaded, available, GameIndex
from wallet_backend.authority_fence import readonly, DB_NAMES, AuthorityFenceCoordinator, private_directory, file_identity

EPOCH='wallet_game_epoch_transitions'
TRANSITION='game_restore_transitions'
WALLET_SQL=(
    'CREATE TABLE '+EPOCH+' (writer_epoch INTEGER PRIMARY KEY, restore_id TEXT NOT NULL UNIQUE, plan TEXT NOT NULL)',
    "CREATE TRIGGER wallet_game_epoch_no_update BEFORE UPDATE ON "+EPOCH+" BEGIN SELECT RAISE(ABORT,'immutable game epoch'); END",
    "CREATE TRIGGER wallet_game_epoch_no_delete BEFORE DELETE ON "+EPOCH+" BEGIN SELECT RAISE(ABORT,'retained game epoch'); END")
INDEX_SQL=(
    'CREATE TABLE '+TRANSITION+" (restore_id TEXT PRIMARY KEY, ledger_ref TEXT NOT NULL, plan TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('PREPARED','DONE')), receipt TEXT)",
    "CREATE TRIGGER game_restore_no_delete BEFORE DELETE ON "+TRANSITION+" BEGIN SELECT RAISE(ABORT,'retained game restore'); END",
    "CREATE TRIGGER game_restore_plan_immutable BEFORE UPDATE OF restore_id,ledger_ref,plan ON "+TRANSITION+" BEGIN SELECT RAISE(ABORT,'immutable game restore plan'); END",
    "CREATE TRIGGER game_restore_done_immutable BEFORE UPDATE ON "+TRANSITION+" WHEN OLD.state='DONE' BEGIN SELECT RAISE(ABORT,'immutable game restore receipt'); END")
PLAN_FIELDS={'schema','restore_id','coordinator_id','c_record_sha256','old_descriptor','new_descriptor','account_id','copies',
             'index_path','index_uuid','wallet_before','index_before','wallet_epoch_schema','index_transition_schema'}


def exists(db,name):return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(name,)).fetchone() is not None

def _schema(db, table, statements, *, create=False):
    if not exists(db,table):
        if not create:return False
        for statement in statements:db.execute(statement)
    actual={row[0] for row in db.execute("SELECT sql FROM sqlite_master WHERE tbl_name=? AND sql IS NOT NULL",(table,))}
    available(actual==set(statements),'game handover schema differs')
    return True


def _canonical(value):
    return json.dumps(value,ensure_ascii=True,sort_keys=True,separators=(',',':'),allow_nan=False).encode()

def _digest(value):return hashlib.sha256(_canonical(value)).hexdigest()

def _cell(value):
    if value is None:return ['null']
    if type(value) is bytes:return ['blob',value.hex()]
    if type(value) is float:return ['float',value.hex()]
    if type(value) is int:return ['int',str(value)]
    if type(value) is str:return ['text',value]
    raise p.VerificationUnavailable('unsupported retained SQLite value')


def snapshot(db, *, omit_table=None, omit_restore_id=None, normalize_contract=None, normalize_grant_issuer=None):
    """Typed rows + every schema object, including SQLite sequence/unknown data.

    Only this one new migration row/schema and the exact descriptor CAS may be
    projected away. Every other original cell/object remains in the digest.
    """
    objects=db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY name').fetchall()
    available(len(objects)<=2048,'game handover schema bound')
    rowid_tables={row[1]:not bool(row[4]) for row in db.execute('PRAGMA table_list') if row[0]=='main'}
    kept=[];tables=[]
    for kind,name,table,sql in objects:
        if omit_table and table==omit_table:continue
        kept.append([kind,name,table,sql])
        if kind!='table':continue
        quote='"'+name.replace('"','""')+'"'
        cursor=db.execute('SELECT * FROM '+quote);columns=[column[0] for column in cursor.description]
        aliases=[alias for alias in ('_rowid_','rowid','oid') if alias not in {column.lower() for column in columns}]
        available(name in rowid_tables,'SQLite rowid metadata is unavailable')
        available(not rowid_tables[name] or bool(aliases),'all intrinsic rowid aliases are shadowed')
        intrinsic=aliases[0] if rowid_tables.get(name) and aliases else None
        if intrinsic:cursor=db.execute('SELECT '+intrinsic+', * FROM '+quote)
        rows=cursor.fetchmany(100001);available(len(rows)<=100000,'game handover table bound')
        values=[]
        for row in rows:
            row_id=row[0] if intrinsic else None
            item=dict(zip(columns,row[1:] if intrinsic else row))
            if omit_restore_id and name in (EPOCH,TRANSITION,'grant_epoch_receipts') and item.get('restore_id')==omit_restore_id:continue
            if normalize_contract and name=='contracts' and item.get('ledger_ref')==normalize_contract['ledger_ref']:
                available(item['descriptor'] in (encoded(normalize_contract['old']),encoded(normalize_contract['new'])),
                          'unexpected descriptor during game handover')
                item['descriptor']=encoded(normalize_contract['old'])
            if normalize_grant_issuer and name=='grant_issuers' and item.get('wallet_authority_id')==normalize_grant_issuer['wallet_authority_id']:
                available(item['ledger_uuid']==normalize_grant_issuer['ledger_uuid'] and
                    item['current_epoch'] in (normalize_grant_issuer['old_epoch'],normalize_grant_issuer['new_epoch']),
                    'unexpected Game issuer during exact epoch handover')
                item['current_epoch']=normalize_grant_issuer['old_epoch']
            cells=[_cell(item[column]) for column in columns]
            if intrinsic:cells.insert(0,['intrinsic-rowid',str(row_id)])
            raw=_canonical(cells);available(len(raw)<=64*1024*1024,'retained row too large')
            values.append(raw)
        digest=hashlib.sha256()
        for raw in sorted(values):digest.update(len(raw).to_bytes(8,'big'));digest.update(raw)
        tables.append({'name':name,'columns_sha256':_digest(columns),'intrinsic_rowid':intrinsic,'row_count':len(values),'rows_sha256':digest.hexdigest()})
    pragmas={name:db.execute('PRAGMA '+name).fetchone()[0] for name in ('application_id','user_version','encoding','auto_vacuum')}
    return {'schema_sha256':_digest(kept),'tables':tables,'pragmas':pragmas}


def _proof_value(proof):
    # Never accepted as an input capability: only call inside a real C context.
    return {'restore_id':proof.restore_id,'coordinator_id':proof.coordinator_id,'c_record_sha256':proof.record_sha256,
            'old_descriptor':identity(proof.old_descriptor),'new_descriptor':identity(proof.new_descriptor),
            'account_id':proof.account_id,'copies':[{'name':f.name,'sha256':f.sha256,
                'source_identity':list(f.source_identity),'destination_identity':list(f.destination_identity)} for f in proof.copies]}


def validate_plan(plan):
    p.fields(plan,PLAN_FIELDS);p.require(plan['schema']=='rock-game-current-restore-plan/1','unknown game restore plan')
    for field in ('restore_id','coordinator_id','index_uuid'):p.uuid_value(plan[field])
    p.digest(plan['c_record_sha256'])
    if plan['account_id'] is not None:p.identifier(plan['account_id'])
    for name in ('wallet_epoch_schema','index_transition_schema'):p.require(type(plan[name]) is bool,'exact schema-presence flag required')
    old,new=plan['old_descriptor'],plan['new_descriptor']
    fields={'ledger_ref','ledger_uuid','wallet_authority_id','owner_actor','owner_ref','primary_device_ref','canonical_state','writer_epoch'}
    p.fields(old,fields);p.fields(new,fields)
    p.require(all(old[key]==new[key] for key in fields-{'canonical_state','writer_epoch'}) and
              type(old['writer_epoch']) is int and type(new['writer_epoch']) is int and new['writer_epoch']==old['writer_epoch']+1,
              'game handover must preserve identity and advance exactly one epoch')
    for path in (old['canonical_state'],new['canonical_state'],plan['index_path']):
        p.require(type(path) is str and Path(path).is_absolute() and str(Path(path).resolve())==path,'canonical retained authority path required')
    p.require(old['canonical_state']!=new['canonical_state'],'game handover requires a distinct destination')
    p.canonical(plan)
    return plan


def _mode(db):
    if not exists(db,'wallet_game_mode'):return None
    rows=db.execute('SELECT singleton,binding FROM wallet_game_mode').fetchall()
    available(len(rows)==1 and rows[0][0]==1,'exact retained game mode required')
    mode=loaded(rows[0][1]);p.fields(mode,{'index_path','index_uuid','descriptor'});return mode


def effective_binding(db):
    mode=_mode(db)
    if mode is None:
        available(not exists(db,EPOCH),'game epoch exists without its original mode');return None,[]
    result=dict(mode);plans=[]
    if _schema(db,EPOCH,WALLET_SQL):
        rows=db.execute('SELECT writer_epoch,restore_id,plan FROM '+EPOCH+' ORDER BY writer_epoch').fetchall()
        available(1<=len(rows)<=64,'bounded nonempty game epoch chain required')
        seen=set()
        for epoch,restore_id,raw in rows:
            plan=validate_plan(loaded(raw))
            available(raw==encoded(plan) and restore_id==plan['restore_id'] and restore_id not in seen and
                      plan['old_descriptor']==result['descriptor'] and plan['new_descriptor']['writer_epoch']==epoch and
                      (plan['index_path'],plan['index_uuid'])==(mode['index_path'],mode['index_uuid']),
                      'game epoch chain is incomplete or belongs to another index')
            result['descriptor']=plan['new_descriptor'];seen.add(restore_id);plans.append(plan)
    return result,plans


def read_local_binding(descriptor):
    with closing(readonly(descriptor.canonical_state/DB_NAMES[0],immutable=False)) as db:return effective_binding(db)[0]


def require_normal_open(descriptor):
    with closing(readonly(descriptor.canonical_state/DB_NAMES[0],immutable=False)) as wallet:
        mode,plans=effective_binding(wallet)
    available(mode is None or mode['descriptor']==identity(descriptor),
              'game epoch handover is pending; explicit current-copy management is required')
    if mode is not None:
        # The C opening already owns this contract's actual state lock, so no
        # supported handover can CAS this contract concurrently. This initial
        # read grants no service access: real index lifetime/bind is mandatory
        # again before normal admission and listener startup.
        path=private_directory(Path(mode['index_path']))
        file_identity(path/'game.lock')
        for suffix in ('-wal','-shm','-journal'):
            sidecar=path/('game.sqlite3'+suffix)
            if sidecar.exists() or sidecar.is_symlink():file_identity(sidecar)
        with closing(readonly(path/'game.sqlite3',immutable=False)) as index:
            row=index.execute('SELECT uuid,path FROM identity WHERE singleton=1').fetchone()
            available(row and tuple(row)==(mode['index_uuid'],str(path)),'original game index identity is unavailable')
            assert_index_ready(index)
            row=index.execute('SELECT descriptor FROM contracts WHERE ledger_ref=?',(descriptor.ledger_ref,)).fetchone()
            available(row and row[0]==encoded(identity(descriptor)),'game index epoch handover is pending')
            for plan in plans:
                row=index.execute('SELECT state,plan,receipt FROM '+TRANSITION+' WHERE restore_id=?',(plan['restore_id'],)).fetchone()
                available(row and tuple(row)==('DONE',encoded(plan),encoded(_receipt(plan))),'game index completion evidence is unavailable')
    return mode is not None


def assert_index_ready(db):
    if _schema(db,TRANSITION,INDEX_SQL):
        available(db.execute('SELECT 1 FROM '+TRANSITION+" WHERE state!='DONE' LIMIT 1").fetchone() is None,
                  'game epoch handover is pending; normal binding is unavailable')


def _receipt(plan):
    return {'schema':'rock-game-current-restore-receipt/1','status':'DONE','restore_id':plan['restore_id'],
            'plan_sha256':_digest(plan),'index_uuid':plan['index_uuid'],'ledger_ref':plan['new_descriptor']['ledger_ref'],
            'writer_epoch':plan['new_descriptor']['writer_epoch'],'c_record_sha256':plan['c_record_sha256']}


def _record(index,restore_id):
    p.uuid_value(restore_id)
    with index.transaction() as db:
        available(_schema(db,TRANSITION,INDEX_SQL),'no prepared game restore')
        row=db.execute('SELECT * FROM '+TRANSITION+' WHERE restore_id=?',(restore_id,)).fetchone()
        available(row is not None,'restore ID has no protected game plan');result=dict(row)
        return _validate_record(index,result,db)


def _validate_record(index,result,db=None):
    plan=validate_plan(loaded(result['plan']))
    available(result['plan']==encoded(plan) and result['restore_id']==plan['restore_id'] and
              result['ledger_ref']==plan['new_descriptor']['ledger_ref'] and
              (str(index.path),index.uuid)==(plan['index_path'],plan['index_uuid']), 'protected game plan/index mismatch')
    available((result['state']=='PREPARED' and result['receipt'] is None) or
              (result['state']=='DONE' and result['receipt']==encoded(_receipt(plan))), 'game handover receipt differs')
    if db is not None:
        current=db.execute('SELECT descriptor FROM contracts WHERE ledger_ref=?',(result['ledger_ref'],)).fetchone()
        expected=plan['old_descriptor'] if result['state']=='PREPARED' else plan['new_descriptor']
        available(current and current[0]==encoded(expected),'index descriptor differs from its exact handover stage')
    return result,plan


def require_bound_mode(db,index,descriptor):
    mode,plans=effective_binding(db)
    available(mode and mode=={'index_path':str(index.path),'index_uuid':index.uuid,'descriptor':identity(descriptor)},
              'Wallet has another game index or incomplete epoch')
    with index.transaction() as indexed:
        assert_index_ready(indexed)
        for plan in plans:
            row=indexed.execute('SELECT state,plan,receipt FROM '+TRANSITION+' WHERE restore_id=?',(plan['restore_id'],)).fetchone()
            available(row and tuple(row)==('DONE',encoded(plan),encoded(_receipt(plan))), 'Wallet/index completed epochs do not join')
    return mode


def _retained_connections(wallet,index_db,descriptor):
    # Read-only equivalent of the current binding audit. Retain RESERVED-only
    # rows, but reject a published index head absent from the exact Wallet.
    local=wallet.execute('SELECT * FROM wallet_game_intents').fetchall()
    for row in local:
        item=dict(row);indexed=index_db.execute('SELECT * FROM connections WHERE intent_id=?',(item['intent_id'],)).fetchone()
        available(indexed and indexed['ledger_ref']==descriptor['ledger_ref'] and indexed['intent']==item['intent'] and
                  indexed['connection_id']==item['connection_id'],'retained intent/index mismatch')
        consent=wallet.execute('SELECT initial_shared FROM wallet_game_consents WHERE intent_id=?',(item['intent_id'],)).fetchone()
        head=wallet.execute('SELECT shared FROM wallet_game_heads WHERE connection_id=?',(item['connection_id'],)).fetchone()
        available((consent is None)==(head is None),'retained consent/head mismatch')
        if indexed['head']:
            available(consent and head and (indexed['head']==head[0] or
                (indexed['head']==consent[0] and loaded(head[0])['publication']['state']=='REVOKED' and
                 loaded(head[0])['publication']['revocation_generation']==1)), 'retained publication/head mismatch')
    for row in index_db.execute('SELECT intent_id,head FROM connections WHERE ledger_ref=?',(descriptor['ledger_ref'],)):
        if row['head'] is not None:
            available(wallet.execute('SELECT 1 FROM wallet_game_consents WHERE intent_id=?',(row['intent_id'],)).fetchone(),
                      'published consent absent from current copy')


def prepare_current_game_restore(index,coordinator,restore_id):
    """All runtimes/listeners stopped; C lease covers the PREPARED commit."""
    available(type(index) is GameIndex and type(coordinator) is AuthorityFenceCoordinator,'actual retained index/coordinator required')
    with coordinator.verified_completed_current_restore(restore_id) as proof, index.author_gate:
        evidence=_proof_value(proof)
        with closing(readonly(proof.new_descriptor.canonical_state/DB_NAMES[0])) as wallet:
            mode,plans=effective_binding(wallet)
            available(mode=={'index_path':str(index.path),'index_uuid':index.uuid,'descriptor':identity(proof.old_descriptor)},
                      'current copy does not retain the old game mode/index')
            with index.transaction() as db:
                if exists(db,TRANSITION):
                    prior=db.execute('SELECT * FROM '+TRANSITION+' WHERE restore_id=?',(restore_id,)).fetchone()
                    if prior:
                        row,plan=_validate_record(index,dict(prior),db)
                        available(row['state']=='PREPARED' and all(plan[k]==v for k,v in evidence.items()),'only exact prepared game restore may retry')
                        _check_snapshots(index,plan,wallet,db,remove_current=True);return plan
                    assert_index_ready(db)
                old=db.execute('SELECT descriptor FROM contracts WHERE ledger_ref=?',(proof.old_descriptor.ledger_ref,)).fetchone()
                available(old and old[0]==encoded(identity(proof.old_descriptor)),'current index is not the original exact contract')
                # Prior completed transitions must also be retained exactly.
                for prior in plans:
                    entry=db.execute('SELECT state,plan,receipt FROM '+TRANSITION+' WHERE restore_id=?',(prior['restore_id'],)).fetchone()
                    available(entry and tuple(entry)==('DONE',encoded(prior),encoded(_receipt(prior))),'previous game epoch evidence missing')
                _retained_connections(wallet,db,identity(proof.old_descriptor))
                before={}
                for name in DB_NAMES:
                    with closing(readonly(proof.new_descriptor.canonical_state/name)) as original:before[name]=snapshot(original)
                plan=validate_plan({'schema':'rock-game-current-restore-plan/1',**evidence,
                    'index_path':str(index.path),'index_uuid':index.uuid,'wallet_before':before,'index_before':snapshot(db),
                    'wallet_epoch_schema':exists(wallet,EPOCH),'index_transition_schema':exists(db,TRANSITION)})
                _schema(db,TRANSITION,INDEX_SQL,create=True)
                db.execute('INSERT INTO '+TRANSITION+' VALUES (?,?,?,\'PREPARED\',NULL)',(restore_id,proof.old_descriptor.ledger_ref,encoded(plan)))
        return plan


def _check_snapshots(index,plan,wallet,index_db,*,remove_current):
    restore_id=plan['restore_id'] if remove_current else None
    omit_wallet=EPOCH if not plan['wallet_epoch_schema'] else None
    if exists(wallet,EPOCH):
        _schema(wallet,EPOCH,WALLET_SQL)
        current_row=wallet.execute('SELECT writer_epoch,restore_id,plan FROM '+EPOCH+' WHERE restore_id=?',(plan['restore_id'],)).fetchone()
        available(current_row is None or tuple(current_row)==(plan['new_descriptor']['writer_epoch'],plan['restore_id'],encoded(plan)),
                  'Wallet epoch row differs from its prepared plan')
        if not plan['wallet_epoch_schema']:
            available(current_row is not None and wallet.execute('SELECT count(*) FROM '+EPOCH).fetchone()[0]==1,
                      'first Wallet epoch schema contains an unplanned row')
    current=snapshot(wallet,omit_table=omit_wallet,omit_restore_id=restore_id)
    available(current==plan['wallet_before'][DB_NAMES[0]],'original Wallet rows/schema changed during game handover')
    for name in DB_NAMES[1:]:
        with closing(readonly(Path(plan['new_descriptor']['canonical_state'])/name,immutable=False)) as db:
            available(snapshot(db)==plan['wallet_before'][name],'original contract rows/schema changed during game handover')
    _schema(index_db,TRANSITION,INDEX_SQL)
    current_row=index_db.execute('SELECT * FROM '+TRANSITION+' WHERE restore_id=?',(plan['restore_id'],)).fetchone()
    available(current_row is not None,'prepared index handover row is missing')
    _,current_plan=_validate_record(index,dict(current_row),index_db)
    available(current_plan==plan,'prepared index plan changed')
    if not plan['index_transition_schema']:
        available(index_db.execute('SELECT count(*) FROM '+TRANSITION).fetchone()[0]==1,
                  'first index handover schema contains an unplanned row')
    current=snapshot(index_db,omit_table=TRANSITION if not plan['index_transition_schema'] else None,
                     omit_restore_id=restore_id,normalize_contract={'ledger_ref':plan['new_descriptor']['ledger_ref'],
                     'old':plan['old_descriptor'],'new':plan['new_descriptor']})
    available(current==plan['index_before'],'retained index rows/schema changed during game handover')


@contextmanager
def validate_management_open(index,coordinator,restore_id,descriptor):
    """Call only inside open_active.initialize's C-owned current-state ticket."""
    row,plan=_record(index,restore_id)
    available(identity(descriptor)==plan['new_descriptor'],'management runtime has another destination')
    with coordinator.current_restore_generation(restore_id,record_sha256=plan['c_record_sha256']) as proof,index.author_gate:
        available(all(plan[k]==v for k,v in _proof_value(proof).items()),'current C proof differs from prepared index')
        with closing(readonly(descriptor.canonical_state/DB_NAMES[0],immutable=False)) as wallet:
            with index.transaction() as db:_check_snapshots(index,plan,wallet,db,remove_current=True)
            if row['state']=='DONE':require_bound_mode(wallet,index,descriptor)
        yield _digest(plan)


def resume_current_game_restore(runtime,index,coordinator,restore_id):
    """Explicit management runtime only; C admission -> author gate -> DBs."""
    row,plan=_record(index,restore_id)
    with runtime._current_game_restore_admission(index,coordinator,restore_id,_digest(plan)):
        with coordinator.current_restore_generation(restore_id,record_sha256=plan['c_record_sha256']) as proof,index.author_gate:
            available(all(plan[k]==v for k,v in _proof_value(proof).items()),'retained C restore proof changed')
            wallet=runtime._service.wallet
            row,actual=_record(index,restore_id);available(actual==plan,'game restore plan changed')
            if row['state']=='DONE':
                with wallet._transaction() as db:
                    with index.transaction() as indexed:_check_snapshots(index,plan,db,indexed,remove_current=True)
                    require_bound_mode(db,index,runtime.descriptor)
                return loaded(row['receipt'])
            with wallet._transaction() as db:
                with index.transaction() as indexed:_check_snapshots(index,plan,db,indexed,remove_current=True)
                _schema(db,EPOCH,WALLET_SQL,create=True)
                prior=db.execute('SELECT plan FROM '+EPOCH+' WHERE restore_id=?',(restore_id,)).fetchone()
                if prior:available(prior[0]==encoded(plan),'different Wallet epoch commit')
                else:
                    mode,_=effective_binding(db) if db.execute('SELECT 1 FROM '+EPOCH+' LIMIT 1').fetchone() else (_mode(db),[])
                    available(mode['descriptor']==plan['old_descriptor'],'Wallet epoch advanced before game handover')
                    db.execute('INSERT INTO '+EPOCH+' VALUES (?,?,?)',(plan['new_descriptor']['writer_epoch'],restore_id,encoded(plan)))
            with wallet._transaction() as db,index.transaction() as indexed:
                _check_snapshots(index,plan,db,indexed,remove_current=True)
                current=indexed.execute('SELECT state,plan,receipt FROM '+TRANSITION+' WHERE restore_id=?',(restore_id,)).fetchone()
                available(current and tuple(current)==('PREPARED',encoded(plan),None),'game restore state changed')
                mode,plans=effective_binding(db);available(mode['descriptor']==plan['new_descriptor'] and plans[-1]==plan,'Wallet epoch was not committed')
                changed=indexed.execute('UPDATE contracts SET descriptor=? WHERE ledger_ref=? AND descriptor=?',
                    (encoded(plan['new_descriptor']),plan['new_descriptor']['ledger_ref'],encoded(plan['old_descriptor'])))
                available(changed.rowcount==1,'index epoch changed before compare-and-swap')
                indexed.execute('UPDATE '+TRANSITION+" SET state='DONE',receipt=? WHERE restore_id=? AND state='PREPARED'",
                                (encoded(_receipt(plan)),restore_id))
            return _receipt(plan)
