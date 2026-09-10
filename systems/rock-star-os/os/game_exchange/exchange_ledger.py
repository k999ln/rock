"""Explicit managed-DB migration and atomic synthetic purchase ledger.

Migration is an administrator operation before listener/scheduler attachment.
It is never performed by Wallet constructors, owner requests or SDK clients.
"""
from contextlib import closing
import hashlib
import json
import re
import sqlite3
import uuid

from . import protocol as p
from . import exchange_protocol as x
from .connections import encoded,loaded
from .current_restore import snapshot

SCHEMA=(
    'CREATE TABLE wallet_game_schema (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version=1), receipt TEXT NOT NULL)',
    '''CREATE TABLE wallet_game_quotes (quote_id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, exchange_id TEXT NOT NULL,
       version INTEGER NOT NULL CHECK(version>0), quote TEXT NOT NULL, UNIQUE(connection_id,exchange_id,version))''',
    '''CREATE TABLE wallet_game_quote_heads (connection_id TEXT NOT NULL, exchange_id TEXT NOT NULL, quote_id TEXT NOT NULL REFERENCES wallet_game_quotes(quote_id),
       PRIMARY KEY(connection_id,exchange_id))''',
    '''CREATE TABLE wallet_game_exchange_attempts (attempt_id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES wallet_game_quotes(quote_id),
       intent TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('OPEN','APPROVED','DENIED')))''',
    "CREATE UNIQUE INDEX wallet_game_one_open_attempt ON wallet_game_exchange_attempts(quote_id) WHERE status='OPEN'",
    '''CREATE TABLE wallet_game_exchange_requests (namespace TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL)''',
    '''CREATE TABLE wallet_game_exchanges (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, exchange_id TEXT NOT NULL,
       quote_id TEXT UNIQUE NOT NULL REFERENCES wallet_game_quotes(quote_id), approval TEXT NOT NULL, command TEXT NOT NULL,
       principal_minor INTEGER NOT NULL CHECK(typeof(principal_minor)='integer' AND principal_minor>0),
       fee_minor INTEGER NOT NULL CHECK(typeof(fee_minor)='integer' AND fee_minor>=0),
       held_minor INTEGER NOT NULL CHECK(typeof(held_minor)='integer' AND held_minor>=0),
       committed_minor INTEGER NOT NULL CHECK(typeof(committed_minor)='integer' AND committed_minor>=0),
       released_minor INTEGER NOT NULL CHECK(typeof(released_minor)='integer' AND released_minor>=0),
       state TEXT NOT NULL CHECK(state IN ('QUEUED','CONFIRMING','REVIEW_REQUIRED','COMPLETED','REVERSED','CANCELLED')),
       reserve_journal_id TEXT UNIQUE NOT NULL REFERENCES wallet_journals(id),
       terminal_journal_id TEXT UNIQUE REFERENCES wallet_journals(id),
       UNIQUE(connection_id,exchange_id), CHECK(principal_minor+fee_minor=held_minor+committed_minor+released_minor))''',
    '''CREATE TABLE wallet_game_outbox (id TEXT PRIMARY KEY, exchange_row TEXT UNIQUE NOT NULL REFERENCES wallet_game_exchanges(id),
       apply_bytes BLOB NOT NULL CHECK(typeof(apply_bytes)='blob'), apply_sha256 TEXT NOT NULL,
       state TEXT NOT NULL CHECK(state IN ('UNSENT','DISPATCH_POSSIBLE','TERMINAL')), cancel_requested INTEGER NOT NULL CHECK(cancel_requested IN (0,1)),
       attempts INTEGER NOT NULL CHECK(attempts>=0), next_at INTEGER NOT NULL CHECK(next_at>=0))''',
    '''CREATE TABLE wallet_game_exchange_receipts (exchange_row TEXT PRIMARY KEY REFERENCES wallet_game_exchanges(id),
       receipt TEXT NOT NULL, verification_key TEXT NOT NULL)''',
    '''CREATE TABLE wallet_game_exchange_events (id INTEGER PRIMARY KEY AUTOINCREMENT,
       exchange_row TEXT NOT NULL REFERENCES wallet_game_exchanges(id), kind TEXT NOT NULL, payload TEXT NOT NULL)''',
    '''CREATE TABLE wallet_game_exchange_claims (id TEXT PRIMARY KEY, exchange_row TEXT NOT NULL REFERENCES wallet_game_exchanges(id),
       operation TEXT NOT NULL CHECK(operation IN ('apply','status','reject')), request_bytes BLOB NOT NULL CHECK(typeof(request_bytes)='blob'),
       writer_epoch INTEGER NOT NULL CHECK(writer_epoch>0), created_at INTEGER NOT NULL, result TEXT)''',
)
IMMUTABLE=('wallet_game_schema','wallet_game_quotes','wallet_game_exchange_requests','wallet_game_exchange_receipts','wallet_game_exchange_events')
RETAINED=('wallet_game_quote_heads','wallet_game_exchange_attempts','wallet_game_exchanges','wallet_game_outbox','wallet_game_exchange_claims')


def exists(db,table):return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone() is not None


def installed(db):
    if not exists(db,'wallet_game_schema'):return False
    row=db.execute('SELECT singleton,version FROM wallet_game_schema').fetchall()
    p.require([tuple(r) for r in row]==[(1,1)],'unsupported game ledger schema; explicit migration required')
    return True


def migrate(runtime,*,migration_id):
    """Call explicitly on an exclusively opened, not-yet-served C runtime."""
    p.uuid_value(migration_id)
    p.require(runtime._state=='READY' and runtime._service.membership.thread is None and
        runtime._verifier._runtimes is None and getattr(runtime,'_games',None) is None,
        'game migration requires an exclusive runtime before listener/game/scheduler attachment')
    wallet=runtime._service.wallet
    with runtime.admit_write(runtime.descriptor.writer_epoch),wallet._transaction() as db:
        if installed(db):
            receipt=loaded(db.execute('SELECT receipt FROM wallet_game_schema').fetchone()[0])
            p.require(receipt['migration_id']==migration_id,'game schema already has a different migration receipt')
            return receipt
        before=snapshot(db)
        original=db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='wallet_postings'").fetchone()[0]
        columns=[row[1] for row in db.execute('PRAGMA table_info(wallet_postings)')]
        p.require(columns==['id','journal_id','account','delta_minor'],'unknown posting columns require explicit migration review')
        account_check=re.search(r'CHECK\(account IN \((.*?)\)\)',original,re.S)
        p.require(account_check is not None and re.findall(r"'([^']+)'",account_check[1])==
            ['AVAILABLE','PENDING_SETTLEMENT','WITHDRAW_HOLD','CASH_DISPENSED','SERVICE_FEES','SALE_CLEARING'],
            'unknown posting constraint requires explicit migration review')
        for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
            name=row[0].replace('"','""')
            p.require(not any(fk[2]=='wallet_postings' for fk in db.execute('PRAGMA foreign_key_list("'+name+'")')),
                      'external posting foreign key needs an explicit migration plan')
        old_rows=[tuple(row) for row in db.execute('SELECT * FROM wallet_postings ORDER BY id')]
        sequences=[tuple(row) for row in db.execute('SELECT rowid,name,seq FROM sqlite_sequence ORDER BY rowid')]
        objects=[row[0] for row in db.execute("SELECT sql FROM sqlite_master WHERE tbl_name='wallet_postings' AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY name")]
        changed=original[:account_check.start(1)]+account_check[1]+", 'GAME_HOLD', 'GAME_PURCHASES', 'GAME_FEES'"+original[account_check.end(1):]
        changed=changed.replace('CREATE TABLE wallet_postings','CREATE TABLE wallet_postings_game_v1',1)
        p.require('CREATE TABLE wallet_postings_game_v1' in changed,'unknown original posting table syntax')
        db.execute(changed)
        db.execute('INSERT INTO wallet_postings_game_v1(id,journal_id,account,delta_minor) SELECT id,journal_id,account,delta_minor FROM wallet_postings ORDER BY id')
        db.execute('DROP TABLE wallet_postings')
        db.execute('ALTER TABLE wallet_postings_game_v1 RENAME TO wallet_postings')
        for sql in objects:db.execute(sql)
        # Rebuilding an AUTOINCREMENT table otherwise changes the intrinsic
        # sqlite_sequence rowid even when its sequence value is identical.
        # Preserve every existing sequence row and its SQLite type/rowid.
        db.execute('DELETE FROM sqlite_sequence')
        db.executemany('INSERT INTO sqlite_sequence(rowid,name,seq) VALUES (?,?,?)',sequences)
        p.require([tuple(row) for row in db.execute('SELECT * FROM wallet_postings ORDER BY id')]==old_rows,'migration must preserve every original posting id/value')
        for statement in SCHEMA:db.execute(statement)
        for table in IMMUTABLE:
            for action in ('UPDATE','DELETE'):
                db.execute(f"CREATE TRIGGER {table}_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'immutable game exchange record'); END")
        for table in RETAINED:
            db.execute(f"CREATE TRIGGER {table}_retained BEFORE DELETE ON {table} BEGIN SELECT RAISE(ABORT,'retained game exchange record'); END")
        for table,columns in (
            ('wallet_game_exchange_attempts','attempt_id,quote_id,intent'),
            ('wallet_game_exchanges','id,connection_id,exchange_id,quote_id,approval,command,principal_minor,fee_minor,reserve_journal_id'),
            ('wallet_game_outbox','id,exchange_row,apply_bytes,apply_sha256'),
            ('wallet_game_exchange_claims','id,exchange_row,operation,request_bytes,writer_epoch,created_at')):
            db.execute(f"CREATE TRIGGER {table}_binding BEFORE UPDATE OF {columns} ON {table} BEGIN SELECT RAISE(ABORT,'immutable exchange binding'); END")
        db.execute("CREATE TRIGGER wallet_game_terminal_frozen BEFORE UPDATE ON wallet_game_exchanges WHEN OLD.state IN ('COMPLETED','REVERSED','CANCELLED') BEGIN SELECT RAISE(ABORT,'terminal exchange immutable'); END")
        db.execute("CREATE TRIGGER wallet_game_terminal_outbox BEFORE UPDATE ON wallet_game_outbox WHEN OLD.state='TERMINAL' BEGIN SELECT RAISE(ABORT,'terminal outbox immutable'); END")
        db.execute("CREATE TRIGGER wallet_game_attempt_terminal BEFORE UPDATE ON wallet_game_exchange_attempts WHEN OLD.status!='OPEN' BEGIN SELECT RAISE(ABORT,'decided owner attempt immutable'); END")
        db.execute("CREATE TRIGGER wallet_game_claim_result_frozen BEFORE UPDATE OF result ON wallet_game_exchange_claims WHEN OLD.result IS NOT NULL BEGIN SELECT RAISE(ABORT,'claim result immutable'); END")
        receipt={'schema':'rock-game-ledger-migration/1','migration_id':migration_id,'version':1,
            'ledger_uuid':runtime.descriptor.ledger_uuid,'writer_epoch':runtime.descriptor.writer_epoch,
            'old_posting_schema_sha256':hashlib.sha256(original.encode()).hexdigest(),
            'old_database_typed_sha256':hashlib.sha256(json.dumps(before,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'preserved_postings':len(old_rows),'simulation_only':True}
        db.execute('INSERT INTO wallet_game_schema VALUES (1,1,?)',(encoded(receipt),))
        p.require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok' and not db.execute('PRAGMA foreign_key_check').fetchall(),
                  'migration integrity/foreign-key failure')
        return receipt


def namespace(role,principal,operation,key):
    return hashlib.sha256(p.canonical(['game-exchange-v1',role,principal,operation,key])).hexdigest()


def cached(db,scope,request):
    row=db.execute('SELECT request,result FROM wallet_game_exchange_requests WHERE namespace=?',(scope,)).fetchone()
    if row:
        p.require(row['request']==encoded(request),'exchange request key reused with different bytes')
        return loaded(row['result'])
    return None


def remember(db,scope,request,result):
    p.require(db.execute('SELECT count(*) FROM wallet_game_exchange_requests').fetchone()[0]<x.MAX_ROWS,'exchange request capacity')
    db.execute('INSERT INTO wallet_game_exchange_requests VALUES (?,?,?)',(scope,encoded(request),encoded(result)))
    return result


def event(db,row_id,kind,payload):
    p.require(db.execute('SELECT count(*) FROM wallet_game_exchange_events').fetchone()[0]<x.MAX_ROWS*16,'exchange event capacity')
    db.execute('INSERT INTO wallet_game_exchange_events(exchange_row,kind,payload) VALUES (?,?,?)',(row_id,kind,encoded(payload)))


def reserve(db,wallet,quote,approval,command):
    x.quote(quote);x.approval(approval);x.command(command)
    b=quote['binding'];row_id=approval['hold_id']
    p.require(approval['decision']=='APPROVED' and approval['quote_id']==b['quote_id'] and
        approval['quote_sha256']==x.quote_digest(quote) and approval['binding_sha256']==quote['binding_sha256'] and
        command['binding']==b and command['quote_sha256']==approval['quote_sha256'] and
        command['approval_sha256']==x.approval_digest(approval),'exact game quote and owner approval required')
    attempt=db.execute('SELECT status FROM wallet_game_exchange_attempts WHERE attempt_id=?',(approval['attempt_id'],)).fetchone()
    p.require(attempt is not None and attempt[0]=='APPROVED','consumed game-purpose approval required before hold')
    p.require(db.execute('SELECT count(*) FROM wallet_game_exchanges').fetchone()[0]<x.MAX_ROWS,'exchange capacity')
    p.require(wallet._balances(db)['AVAILABLE']>=b['total_minor'],'insufficient available funds')
    journal=wallet._post(db,'game.reserve',row_id,'AVAILABLE','GAME_HOLD',b['total_minor'])
    db.execute('INSERT INTO wallet_game_exchanges VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)',
        (row_id,b['connection_id'],b['exchange_id'],b['quote_id'],encoded(approval),encoded(command),b['principal_minor'],b['game_fee_minor'],
         b['total_minor'],0,0,'QUEUED',journal))
    raw=p.canonical(command)
    db.execute("INSERT INTO wallet_game_outbox VALUES (?,?,?,?, 'UNSENT',0,0,0)",
        (approval['outbox_id'],row_id,raw,hashlib.sha256(raw).hexdigest()))
    event(db,row_id,'RESERVED',{'approval_sha256':x.approval_digest(approval),'journal_id':journal})


def finish(db,wallet,row,receipt,verification_key):
    apply=loaded(row['command']);x.match_terminal(receipt,apply,verification_key)
    old=db.execute('SELECT receipt FROM wallet_game_exchange_receipts WHERE exchange_row=?',(row['id'],)).fetchone()
    if old:
        p.require(old[0]==encoded(receipt),'terminal receipt changed');return
    p.require(row['state'] in ('QUEUED','CONFIRMING','REVIEW_REQUIRED') and row['held_minor']==row['principal_minor']+row['fee_minor'],
              'exchange cannot be settled twice')
    applied=receipt['terminal_state']=='APPLIED';amount=row['held_minor']
    if applied:
        journal=wallet._post(db,'game.purchase',row['id'],'GAME_HOLD','GAME_PURCHASES',row['principal_minor'])
        if row['fee_minor']:wallet._post(db,'game.fee',row['id'],'GAME_HOLD','GAME_FEES',row['fee_minor'])
    else:journal=wallet._post(db,'game.release',row['id'],'GAME_HOLD','AVAILABLE',amount)
    key=verification_key.records[(apply['binding']['game_authority_id'],x.PURPOSES['terminal'],receipt['credential_id'],receipt['credential_revision'])]
    db.execute('INSERT INTO wallet_game_exchange_receipts VALUES (?,?,?)',
        (row['id'],encoded(receipt),encoded({'issuer':key.issuer,'purpose':key.purpose,'key_id':key.key_id,'revision':key.revision,'public_key':key.public_key.hex()})))
    db.execute('UPDATE wallet_game_exchanges SET held_minor=0,committed_minor=?,released_minor=?,state=?,terminal_journal_id=? WHERE id=?',
        (amount if applied else 0,0 if applied else amount,'COMPLETED' if applied else 'REVERSED',journal,row['id']))
    db.execute("UPDATE wallet_game_outbox SET state='TERMINAL' WHERE exchange_row=?",(row['id'],))
    event(db,row['id'],'COMPLETED' if applied else 'REVERSED',{'terminal_sha256':p.hash_object(x.DOMAINS['terminal'],receipt),'journal_id':journal})


def cancel_unsent(db,wallet,row):
    outbox=db.execute('SELECT state FROM wallet_game_outbox WHERE exchange_row=?',(row['id'],)).fetchone()
    if outbox[0]!='UNSENT':return False
    journal=wallet._post(db,'game.cancel',row['id'],'GAME_HOLD','AVAILABLE',row['held_minor'])
    db.execute("UPDATE wallet_game_outbox SET state='TERMINAL',cancel_requested=1 WHERE exchange_row=? AND state='UNSENT'",(row['id'],))
    db.execute("UPDATE wallet_game_exchanges SET released_minor=held_minor,held_minor=0,state='CANCELLED',terminal_journal_id=? WHERE id=?",(journal,row['id']))
    event(db,row['id'],'CANCELLED',{'journal_id':journal,'meaning':'atomic before any dispatch claim'})
    return True
