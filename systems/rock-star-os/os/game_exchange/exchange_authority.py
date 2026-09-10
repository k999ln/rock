"""Independent public Game asset journal and permanent terminal tombstones."""
from dataclasses import asdict
import json
import time
import uuid
from blackberryrock import deadline as request_deadline
from . import protocol as p
from . import exchange_protocol as x
from .connections import encoded,loaded
from .exchange_signer import PublicExchangeSigner

SCHEMA=(
    'CREATE TABLE grant_schema (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version=1))',
    '''CREATE TABLE grant_issuers (wallet_authority_id TEXT PRIMARY KEY, ledger_uuid TEXT NOT NULL,
       current_epoch INTEGER NOT NULL CHECK(current_epoch>0), keys_json TEXT NOT NULL)''',
    '''CREATE TABLE grant_decisions (id TEXT PRIMARY KEY,wallet_authority_id TEXT NOT NULL,ledger_uuid TEXT NOT NULL,
       connection_id TEXT NOT NULL,exchange_id TEXT NOT NULL,apply_bytes BLOB NOT NULL CHECK(typeof(apply_bytes)='blob'),
       receipt TEXT NOT NULL,UNIQUE(wallet_authority_id,ledger_uuid,connection_id,exchange_id))''',
    '''CREATE TABLE asset_journals (id TEXT PRIMARY KEY,decision_id TEXT UNIQUE NOT NULL REFERENCES grant_decisions(id),
       kind TEXT NOT NULL CHECK(kind='PURCHASED'),asset TEXT NOT NULL,player_id TEXT NOT NULL,units INTEGER NOT NULL CHECK(units>0))''',
    '''CREATE TABLE asset_postings (id INTEGER PRIMARY KEY AUTOINCREMENT,journal_id TEXT NOT NULL REFERENCES asset_journals(id),
       account TEXT NOT NULL CHECK(account IN ('ISSUANCE_CLEARING','PLAYER_PURCHASED')),delta_units INTEGER NOT NULL CHECK(typeof(delta_units)='integer' AND delta_units!=0))''',
    '''CREATE TABLE grant_epoch_receipts (restore_id TEXT PRIMARY KEY,wallet_authority_id TEXT NOT NULL,
       old_epoch INTEGER NOT NULL,new_epoch INTEGER NOT NULL,receipt TEXT NOT NULL)''',
)

class GameGrantAuthority:
    def __init__(self,authority,*,prepare=False):
        from .fixture import PublicGameAuthority
        p.require(type(authority) is PublicGameAuthority,'actual independent public Game authority required')
        self.authority,self.store=authority,authority.store
        self.signer=PublicExchangeSigner(authority.game.game_authority_id,'terminal')
        self.asset='COIN_'+authority.name.upper()
        with self.store.transaction() as db:
            found=db.execute("SELECT 1 FROM sqlite_master WHERE name='grant_schema'").fetchone()
            if not found:
                p.require(prepare is True,'explicit stopped Game grant schema preparation required')
                for statement in SCHEMA:db.execute(statement)
                db.execute('INSERT INTO grant_schema VALUES (1,1)')
                for table in ('grant_schema','grant_decisions','asset_journals','asset_postings','grant_epoch_receipts'):
                    for action in ('UPDATE','DELETE'):
                        db.execute(f"CREATE TRIGGER {table}_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'permanent Game journal/terminal'); END")
            p.require([tuple(r) for r in db.execute('SELECT * FROM grant_schema')]==[(1,1)],'unsupported Game schema')
            self.verify(db)

    def register_runtime(self,runtime):
        """Protected admin bootstrap; no wire endpoint can register an issuer."""
        from wallet_backend.contract_runtime import ContractRuntime
        p.require(type(runtime) is ContractRuntime,'real C-managed runtime required')
        with runtime.admit_write(runtime.descriptor.writer_epoch):
            runtime._ensure_account_binding();d=runtime.descriptor
            keys=[PublicExchangeSigner(d.wallet_authority_id,k).record for k in ('apply','status','reject')]
            key_json=encoded({'keys':[{'issuer':k.issuer,'purpose':k.purpose,'key_id':k.key_id,'revision':k.revision,'public_key':k.public_key.hex()} for k in keys]})
        with self.store.transaction() as db:
            old=db.execute('SELECT * FROM grant_issuers WHERE wallet_authority_id=?',(d.wallet_authority_id,)).fetchone()
            if old:
                p.require((old['ledger_uuid'],old['current_epoch'],old['keys_json'])==(d.ledger_uuid,d.writer_epoch,key_json),
                    'Game issuer epoch differs; explicit verified current restore handover required')
            else:db.execute('INSERT INTO grant_issuers VALUES (?,?,?,?)',(d.wallet_authority_id,d.ledger_uuid,d.writer_epoch,key_json))

    @staticmethod
    def keys(row):
        return x.KeyRegistry(tuple(p.KeyRecord(k['key_id'],k['revision'],k['purpose'],k['issuer'],bytes.fromhex(k['public_key']),1,p.MAX_INT,None,None)
            for k in loaded(row['keys_json'])['keys']))

    def dispatch(self,request,*,deadline):
        operation=request.get('operation') if type(request) is dict else None
        p.require(operation in ('grant.apply','grant.status','grant.reject_if_unapplied'),'fixed grant operation required')
        kind={'grant.apply':'apply','grant.status':'status','grant.reject_if_unapplied':'reject'}[operation]
        apply=x.command(request) if kind=='apply' else x.wrapper(request,kind)['apply']
        b=apply['binding'];p.require((b['game_authority_id'],b['game_id'],b['destination_asset'])==
            (self.authority.game.game_authority_id,self.authority.game.game_id,self.asset),'command belongs to another game/asset')
        with request_deadline.scope(deadline),self.store.transaction() as db:
            issuer=db.execute('SELECT * FROM grant_issuers WHERE wallet_authority_id=?',(b['wallet_authority_id'],)).fetchone()
            p.require(issuer is not None and issuer['ledger_uuid']==b['issuer_ledger_alias'],'registered Wallet issuer required')
            keys=self.keys(issuer);keys.verify('apply',apply,b['wallet_authority_id'])
            if kind!='apply':keys.verify(kind,request,b['wallet_authority_id'])
            epoch=b['writer_epoch'] if kind=='apply' else request['current_epoch']
            p.require(epoch==issuer['current_epoch'],'stale Wallet writer epoch rejected')
            p.require(apply['issued_at']<b['expires_at'],'apply was not approved within the exact quote lifetime')
            key=(b['wallet_authority_id'],b['issuer_ledger_alias'],b['connection_id'],b['exchange_id'])
            old=db.execute('SELECT * FROM grant_decisions WHERE wallet_authority_id=? AND ledger_uuid=? AND connection_id=? AND exchange_id=?',key).fetchone()
            if old:
                p.require(bytes(old['apply_bytes'])==p.canonical(apply),'exchange id already binds another original apply')
                return {'ok':True,'result':loaded(old['receipt'])}
            if kind=='status':
                return {'ok':True,'result':{'schema':'rock-game-grant-lookup/1','state':'NOT_FOUND',
                    'apply_sha256':x.command_digest(apply),'simulation_only':True}}
            p.require(db.execute('SELECT count(*) FROM grant_decisions').fetchone()[0]<x.MAX_ROWS,'Game terminal capacity')
            now=p.integer(int(self.authority.clock()),1);self.store.observe_time(db,now)
            receipt=self.signer.sign({'schema':'rock-game-grant-receipt/1','environment':'synthetic','binding':b,
                'binding_sha256':apply['binding_sha256'],'quote_sha256':apply['quote_sha256'],'approval_sha256':apply['approval_sha256'],
                'apply_sha256':x.command_digest(apply),'terminal_state':'APPLIED' if kind=='apply' else 'REJECTED',
                'decision_id':str(uuid.uuid4()),'decision_revision':1,'decided_at':now,'simulation_only':True,**self.signer.fields()})
            db.execute('INSERT INTO grant_decisions VALUES (?,?,?,?,?,?,?)',(receipt['decision_id'],*key,p.canonical(apply),encoded(receipt)))
            if kind=='apply':
                journal=str(uuid.uuid4());db.execute("INSERT INTO asset_journals VALUES (?,?,'PURCHASED',?,?,?)",
                    (journal,receipt['decision_id'],self.asset,b['player_id'],b['units']))
                db.executemany('INSERT INTO asset_postings(journal_id,account,delta_units) VALUES (?,?,?)',
                    [(journal,'ISSUANCE_CLEARING',-b['units']),(journal,'PLAYER_PURCHASED',b['units'])])
            self.verify(db);return {'ok':True,'result':receipt}

    def verify(self,db):
        for row in db.execute('SELECT * FROM grant_decisions'):
            receipt=x.terminal(loaded(row['receipt']));apply=x.command(p.decode(bytes(row['apply_bytes'])))
            x.match_terminal(receipt,apply,x.KeyRegistry((self.signer.record,)))
            journal=db.execute('SELECT * FROM asset_journals WHERE decision_id=?',(row['id'],)).fetchall()
            if receipt['terminal_state']=='REJECTED':p.require(not journal,'rejected exchange cannot grant assets');continue
            p.require(len(journal)==1,'applied exchange must have one asset journal');j=journal[0];b=apply['binding']
            p.require((j['asset'],j['player_id'],j['units'])==(self.asset,b['player_id'],b['units']),'Game journal binding mismatch')
            postings=[tuple(r) for r in db.execute('SELECT account,delta_units FROM asset_postings WHERE journal_id=?',(j['id'],))]
            p.require(sorted(postings)==sorted([('ISSUANCE_CLEARING',-b['units']),('PLAYER_PURCHASED',b['units'])]),'Game asset journal imbalance')
        p.require(not db.execute('PRAGMA foreign_key_check').fetchall(),'Game ledger foreign key failure')

    def balance(self,player):
        with self.store.transaction() as db:
            return db.execute('SELECT coalesce(sum(units),0) FROM asset_journals WHERE player_id=?',(player,)).fetchone()[0]
