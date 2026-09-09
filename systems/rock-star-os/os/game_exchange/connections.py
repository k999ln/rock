"""Explicit synthetic connection admission on existing managed Wallet runtimes.

One Wallet DB owns the challenge, credential counter and immutable consent.
The independently locked subject index retains reservations forever. There is
no index/Wallet restore, epoch adoption, asset/history API or exchange here.
"""
from dataclasses import asdict
import hashlib
import hmac
import json
import math
from pathlib import Path
import secrets
import time
import threading
import uuid
from . import protocol as p
from .fixture import PublicGameAuthority, PublicReceiptSigner
from .storage import PrivateStore


def encoded(value):return p.canonical(value).decode()
def loaded(value):return p.decode(value.encode())
def identity(descriptor):
    return {key:str(value) if isinstance(value,Path) else value for key,value in asdict(descriptor).items()}
def namespace(*values):return hashlib.sha256(p.canonical(list(values))).hexdigest()
def overlap(a,b):return a==b or a in b.parents or b in a.parents
def available(condition,message):
    if not condition:raise p.VerificationUnavailable(message)


class GameIndex(PrivateStore):
    def __init__(self,path,authorities):
        config=[]
        for authority in authorities:
            game=asdict(authority.game);game['scopes']=list(game['scopes'])
            config.append({'game':game,'proof_public_key':authority.record.public_key.hex(),
                'author_token_sha256':hashlib.sha256(authority.public_author_token.encode()).hexdigest()})
        super().__init__(path,{'kind':'rock-game-index/1','games':config})
        try:
            with self.transaction() as db:
                db.execute('CREATE TABLE IF NOT EXISTS contracts (ledger_ref TEXT PRIMARY KEY, descriptor TEXT NOT NULL)')
                db.execute('CREATE TABLE IF NOT EXISTS authors (game_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, revoked INTEGER NOT NULL)')
                db.execute('''CREATE TABLE IF NOT EXISTS connections (
                    connection_id TEXT PRIMARY KEY, intent_id TEXT UNIQUE NOT NULL, ledger_ref TEXT NOT NULL,
                    game_authority_id TEXT NOT NULL, game_id TEXT NOT NULL, player_id TEXT NOT NULL, nonce TEXT NOT NULL,
                    request_key TEXT UNIQUE NOT NULL, request TEXT NOT NULL, intent TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state IN ('RESERVED','ACTIVE','REVOKED')), head TEXT,
                    UNIQUE(game_authority_id,nonce), UNIQUE(game_authority_id,game_id,player_id))''')
                for authority in authorities:db.execute('INSERT OR IGNORE INTO authors VALUES (?,1,0)',(authority.game.game_id,))
                for table in ('connections','contracts'):
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS {table}_retained BEFORE DELETE ON {table} BEGIN SELECT RAISE(ABORT,'retained game authority'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS connection_binding_immutable BEFORE UPDATE OF connection_id,intent_id,ledger_ref,game_authority_id,game_id,player_id,nonce,request_key,request,intent ON connections BEGIN SELECT RAISE(ABORT,'immutable game binding'); END")
        except BaseException:
            self.close()
            raise
    def bind(self,descriptor,*,wallet_mode):
        descriptor_value=encoded(identity(descriptor))
        with self.transaction() as db:
            row=db.execute('SELECT descriptor FROM contracts WHERE ledger_ref=?',(descriptor.ledger_ref,)).fetchone()
            if row:
                available(row[0]==descriptor_value,'Wallet/index descriptor mismatch; restore reconciliation is not implemented')
                available(wallet_mode is not None or db.execute('SELECT 1 FROM connections WHERE ledger_ref=? LIMIT 1',(descriptor.ledger_ref,)).fetchone() is None,'Wallet predates retained index reservations')
            else:
                p.require(wallet_mode is None,'existing Wallet game authority cannot be attached to a new index')
                db.execute('INSERT INTO contracts VALUES (?,?)',(descriptor.ledger_ref,descriptor_value))
    def check_contract(self,descriptor):
        with self.transaction() as db:
            row=db.execute('SELECT descriptor FROM contracts WHERE ledger_ref=?',(descriptor.ledger_ref,)).fetchone()
            available(row is not None and row[0]==encoded(identity(descriptor)),'game contract epoch/binding unavailable')
    def get(self,field,value):
        p.require(field in ('connection_id','intent_id','request_key'),'fixed index selector')
        with self.transaction() as db:
            row=db.execute('SELECT * FROM connections WHERE '+field+'=?',(value,)).fetchone()
            return dict(row) if row else None
    def reserve(self,descriptor,request_key,request,intent):
        p.validate_intent(intent);b=intent['binding']
        with self.transaction() as db:
            self.observe_time(db,b['created_at'])
            p.require(db.execute('SELECT count(*) FROM connections').fetchone()[0]<10000,'connection index capacity')
            p.require(db.execute('SELECT 1 FROM connections WHERE (game_authority_id=? AND nonce=?) OR (game_authority_id=? AND game_id=? AND player_id=?) OR request_key=?',
                (b['game_authority_id'],b['proof_nonce'],b['game_authority_id'],b['game_id'],b['player_id'],request_key)).fetchone() is None,
                'subject/nonce/request already reserved; transfer is not implemented')
            db.execute('INSERT INTO connections VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)',(b['connection_id'],b['intent_id'],descriptor.ledger_ref,
                b['game_authority_id'],b['game_id'],b['player_id'],b['proof_nonce'],request_key,encoded(request),encoded(intent),'RESERVED'))
    def publish(self,descriptor,intent,consent,shared,keys,now):
        p.match_consent(shared,consent);p.verify_shared(shared,keys,now=now);b=intent['binding'];public=shared['publication']
        with self.transaction() as db:
            self.observe_time(db,now)
            row=db.execute('SELECT * FROM connections WHERE connection_id=?',(b['connection_id'],)).fetchone()
            p.require(row is not None and row['ledger_ref']==descriptor.ledger_ref and row['intent']==encoded(intent),'missing/different reserved subject')
            p.require(db.execute('SELECT descriptor FROM contracts WHERE ledger_ref=?',(descriptor.ledger_ref,)).fetchone()[0]==encoded(identity(descriptor)),'changed index contract')
            old=loaded(row['head']) if row['head'] else None
            if old is not None:
                previous=old['publication']
                if encoded(old)==encoded(shared):return
                p.require(previous['state']=='ACTIVE' and public['state']=='REVOKED' and
                    public['revocation_generation']==previous['revocation_generation']+1 and
                    all(public[k]==v for k,v in previous.items() if k not in ('state','revocation_generation','decided_at')),
                    'index head cannot move backward or change consent')
            else:p.require(public['state']=='ACTIVE' and public['revocation_generation']==0,'first published head must be original consent')
            db.execute('UPDATE connections SET state=?,head=? WHERE connection_id=?',(public['state'],encoded(shared),b['connection_id']))
    def head(self,descriptor,intent,shared):
        row=self.get('connection_id',intent['binding']['connection_id'])
        available(row and row['ledger_ref']==descriptor.ledger_ref and row['intent']==encoded(intent) and row['head']==encoded(shared),'index and Wallet head do not match')
        public=shared['publication']
        return p.ConnectionHead(**{k:public[k] for k in ('wallet_authority_id','game_authority_id','game_id','connection_id','revocation_generation','state')},
            receipt_sha256=p.hash_object(b'RockGameSharedReceipt-v1\0',shared))


class GameGateway:
    """Trusted bootstrap supplies independent public fixture authorities only."""
    def __init__(self,state,authorities,*,clock=time.time):
        p.require(type(authorities) is tuple and len(authorities)==2 and all(type(a) is PublicGameAuthority for a in authorities),'two explicit independent public game authorities required')
        p.require({a.name for a in authorities}=={'a','b'},'distinct public game authorities')
        self.authorities={a.game.game_id:a for a in authorities};self.clock=clock;self.runtimes={};self.bound=False
        self.author_gate=threading.RLock()
        self.index=GameIndex(Path(state),authorities);self.keys=None
    def now(self):
        value=self.clock();p.require(type(value) in (int,float) and math.isfinite(value) and 1<=value<=p.MAX_INT,'finite synthetic Unix-second clock required')
        now=p.integer(int(value),1)
        with self.index.transaction() as db:self.index.observe_time(db,now)
        return now
    def bind_runtimes(self,runtimes):
        p.require(not self.bound and not self.runtimes,'game gateway already bound')
        keys=[a.record for a in self.authorities.values()]
        services=[]
        for runtime in runtimes:
            descriptor=runtime.descriptor
            # Index cannot be hidden inside Wallet, C/B authority state, or fixture authority state.
            excluded=[descriptor.canonical_state,runtime._verifier.registry_identity()[0],runtime._writer.coordinator.registry_dir]
            excluded.extend(a.store.path for a in self.authorities.values())
            p.require(all(not overlap(self.index.path,Path(path)) for path in excluded),'game index must be a separate authority directory')
            signer=PublicReceiptSigner(descriptor.wallet_authority_id,'shared');cursor=PublicReceiptSigner(descriptor.wallet_authority_id,'cursor')
            keys.extend((signer.record,cursor.record));services.append((runtime,signer,cursor))
        self.keys=p.KeyRegistry(tuple(keys))
        for runtime,signer,cursor in services:
            runtime.bind_game_connections(self,signer,cursor)
            self.runtimes[runtime.descriptor.ledger_ref]=runtime
        self.bound=True
    def game(self,authority,game):
        selected=self.authorities.get(game)
        p.require(selected is not None and selected.game.game_authority_id==authority,'unknown game authority mapping')
        return selected.game
    def current_author(self,principal):
        p.require(type(principal) is p.GamePrincipal,'authenticated author principal required')
        game=self.game(principal.game_authority_id,principal.game_id);now=self.now()
        with self.index.transaction() as db:
            row=db.execute('SELECT revision,revoked FROM authors WHERE game_id=?',(game.game_id,)).fetchone()
            p.require(row and row[0]==principal.credential_revision and row[1]==0 and principal.expires_at>now and
                principal.author_id==game.author_id and not principal.revoked and principal.scopes==game.scopes,'current author credential required')
        return game
    def authenticate(self,game_id,token):
        p.require(self.bound and type(token) is str and len(token)<=240,'bounded current game authentication required')
        authority=self.authorities.get(game_id)
        p.require(authority is not None and hmac.compare_digest(token,authority.public_author_token),'author authentication rejected')
        game=authority.game
        # This fixed public fixture credential has a documented finite expiry.
        principal=p.GamePrincipal(game.author_id,game.game_authority_id,game.game_id,1,game.scopes,1893456000,False)
        self.current_author(principal);return principal
    def revoke_author(self,name,revision):
        game=next(a.game for a in self.authorities.values() if a.name==name)
        with self.author_gate, self.index.transaction() as db:
            row=db.execute('SELECT revision FROM authors WHERE game_id=?',(game.game_id,)).fetchone()
            p.require(type(revision) is int and row[0]==revision,'current author revision required')
            db.execute('UPDATE authors SET revoked=1 WHERE game_id=?',(game.game_id,))
    def dispatch_author(self,principal,request,*,deadline):
        p.validate_game_request(request);self.current_author(principal)
        row=self.index.get('connection_id',request['connection_id'])
        p.require(row is not None and (row['game_authority_id'],row['game_id'])==(principal.game_authority_id,principal.game_id),'connection unavailable to this game')
        runtime=self.runtimes.get(row['ledger_ref']);p.require(runtime is not None,'connection runtime unavailable')
        return runtime.dispatch_game_author(self,principal,request,deadline=deadline)
    def capabilities(self):
        return p.capabilities() | {'connections':self.bound and bool(self.runtimes)}
    def close(self):self.index.close();self.bound=False;self.runtimes={}


class WalletConnections:
    def __init__(self,runtime,gateway,signer,cursor):
        self.runtime,self.gateway,self.signer,self.cursor=runtime,gateway,signer,cursor
        self.wallet=runtime._service.wallet;self.authentication=runtime._service.authentication
        self.descriptor=runtime.descriptor
        with self.wallet._transaction() as db:
            tables={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            mode=db.execute('SELECT * FROM wallet_game_mode').fetchone() if 'wallet_game_mode' in tables else None
            expected={'index_path':str(gateway.index.path),'index_uuid':gateway.index.uuid,'descriptor':identity(self.descriptor)}
            if mode:p.require(mode['binding']==encoded(expected),'Wallet has another game index/epoch')
            gateway.index.bind(self.descriptor,wallet_mode=mode)
            db.execute('CREATE TABLE IF NOT EXISTS wallet_game_mode (singleton INTEGER PRIMARY KEY CHECK(singleton=1), binding TEXT NOT NULL)')
            if mode is None:db.execute('INSERT INTO wallet_game_mode VALUES (1,?)',(encoded(expected),))
            db.execute('CREATE TABLE IF NOT EXISTS wallet_game_intents (intent_id TEXT PRIMARY KEY, connection_id TEXT UNIQUE NOT NULL, intent TEXT NOT NULL, request TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)')
            db.execute('CREATE TABLE IF NOT EXISTS wallet_game_consents (intent_id TEXT PRIMARY KEY, consent TEXT NOT NULL, approve_request TEXT NOT NULL, initial_shared TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS wallet_game_heads (connection_id TEXT PRIMARY KEY, shared TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS wallet_game_requests (key TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL)')
            for table in ('wallet_game_mode','wallet_game_consents','wallet_game_requests'):
                for action in ('UPDATE','DELETE'):
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS {table}_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'immutable game record'); END")
            db.execute("CREATE TRIGGER IF NOT EXISTS wallet_game_intent_binding BEFORE UPDATE OF intent_id,connection_id,intent,request ON wallet_game_intents BEGIN SELECT RAISE(ABORT,'immutable game intent'); END")
            db.execute("CREATE TRIGGER IF NOT EXISTS wallet_game_intent_retained BEFORE DELETE ON wallet_game_intents BEGIN SELECT RAISE(ABORT,'retained game intent'); END")
        # Audit every retained local intent before any listener can serve a
        # different contract. Missing/advanced index data never becomes a cache
        # miss that would permit a duplicate subject to be allocated elsewhere.
        with self.wallet._transaction() as db:
            local=db.execute('SELECT * FROM wallet_game_intents').fetchall()
            for row in local:
                indexed=gateway.index.get('intent_id',row['intent_id'])
                available(indexed and indexed['ledger_ref']==self.descriptor.ledger_ref and indexed['intent']==row['intent'],
                    'retained Wallet intent is missing from current index')
                consent=db.execute('SELECT initial_shared FROM wallet_game_consents WHERE intent_id=?',(row['intent_id'],)).fetchone()
                head=db.execute('SELECT shared FROM wallet_game_heads WHERE connection_id=?',(row['connection_id'],)).fetchone()
                available((consent is None)==(head is None),'Wallet consent/head mismatch')
                if indexed['head']:
                    available(consent is not None,'index is ahead of Wallet consent')
                    current=loaded(head[0]);old=loaded(indexed['head'])
                    available(current==old or (old==loaded(consent[0]) and current['publication']['state']=='REVOKED' and
                        current['publication']['revocation_generation']==1),'index/Wallet history cannot be reconciled forward')
            with gateway.index.transaction() as index_db:
                indexed_rows=index_db.execute('SELECT intent_id,head FROM connections WHERE ledger_ref=?',(self.descriptor.ledger_ref,)).fetchall()
            for indexed in indexed_rows:
                if indexed['head'] is not None:
                    available(db.execute('SELECT 1 FROM wallet_game_consents WHERE intent_id=?',(indexed['intent_id'],)).fetchone() is not None,
                        'current index points to a consent absent from Wallet')
    def check(self,deadline):
        if time.monotonic()>=deadline:raise TimeoutError('game operation deadline expired')
        self.gateway.index.check_contract(self.descriptor)
        return self.gateway.now()
    def owner(self,principal,request,context,*,deadline):
        p.validate_owner_request(request);now=self.check(deadline)
        auth=self.authentication;auth.require_active(context)
        owner=p.OwnerContext(self.descriptor.wallet_authority_id,self.descriptor.owner_ref,context.owner_id,principal.device_ref,principal.credential_revision)
        op=request['op'].removeprefix('game.connection.')
        if op=='begin':return self.begin(owner,request,context,deadline)
        if op in ('approve','reconcile'):
            row=self.gateway.index.get('intent_id',request['intent_id'])
        elif op in ('status','revoke'):row=self.gateway.index.get('connection_id',request['connection_id'])
        else:return self.list(owner,request,deadline)
        p.require(row and row['ledger_ref']==self.descriptor.ledger_ref,'owner connection unavailable')
        intent=loaded(row['intent']);p.admit_intent_action(intent,owner,'reconcile' if op!='approve' else 'status',now=now)
        if op=='approve':
            self.approve(owner,request,intent,context,deadline)
            consent,_=self.synchronize(intent,deadline)
            return {'ok':True,'result':consent}
        if op=='revoke':
            shared=self.revoke(request,intent,namespace('owner',owner.device_ref),deadline)
            self.synchronize(intent,deadline)
            return {'ok':True,'result':shared}
        if op=='reconcile':
            self.synchronize(intent,deadline)
            key=namespace('owner-reconcile',owner.device_ref,request['op'],request['key'])
            with self.wallet._transaction() as db:
                row=db.execute('SELECT request,result FROM wallet_game_requests WHERE key=?',(key,)).fetchone()
                if row:
                    p.require(row['request']==encoded(request),'reconcile request conflict')
                    return {'ok':True,'result':loaded(row['result'])}
                row=db.execute('SELECT consent FROM wallet_game_consents WHERE intent_id=?',(request['intent_id'],)).fetchone()
                result=loaded(row[0]) if row else {'state':'AWAITING_OWNER_CONSENT','intent_id':request['intent_id'],'simulation_only':True}
                p.require(db.execute('SELECT count(*) FROM wallet_game_requests').fetchone()[0]<10000,'game request capacity')
                db.execute('INSERT INTO wallet_game_requests VALUES (?,?,?)',(key,encoded(request),encoded(result)))
                self.check(deadline)
                return {'ok':True,'result':result}
        return self.result(owner,intent,deadline)
    def begin(self,owner,request,context,deadline):
        now=self.check(deadline);proof=request['proof'];game=self.gateway.game(proof['game_authority_id'],proof['game_id'])
        request_key=namespace(owner.wallet_authority_id,owner.device_ref,game.game_authority_id,game.game_id,request['op'],request['key'])
        saved=self.gateway.index.get('request_key',request_key)
        authority=self.gateway.authorities[game.game_id]
        self.gateway.authenticate(game.game_id,authority.public_author_token)
        if saved:
            p.exact_retry(loaded(saved['request']),request);intent=loaded(saved['intent'])
            p.match_begin_intent(intent,request,game,owner)
        else:
            p.verify_proof(proof,self.gateway.keys,game,audience=owner.wallet_authority_id,now=now)
            with self.wallet._transaction() as db:
                credential=self.authentication._credential(db,context)
                p.require(credential and credential['revoked_at'] is None,'current owner credential')
                binding=p.make_binding(proof,game,owner,intent_id=str(uuid.uuid4()),connection_id=str(uuid.uuid4()),scopes=request['scopes'],
                    terms_version=request['terms_version'],now=now,connection_expires_at=request['connection_expires_at'])
                intent={'schema':'rock-game-connection-intent/1','environment':'synthetic','state':'AWAITING_OWNER_CONSENT',
                    'operation':request['op'],'key':request['key'],'request_sha256':p.owner_request_digest(request),'receipt_id':str(uuid.uuid4()),
                    'binding':binding,'binding_sha256':p.binding_digest(binding),'challenge_id':str(uuid.uuid4()),
                    'options':{'schema_version':1,'purpose':'wallet.game.connect','device_ref':owner.device_ref,'publicKey':{
                        'challenge':p.b64(secrets.token_bytes(32)),'timeout':(binding['intent_expires_at']-now)*1000,'rpId':p.RP_ID,
                        'allowCredentials':[{'type':'public-key','id':credential['credential_id']}],'userVerification':'required'}},'simulation_only':True}
            self.check(deadline);self.gateway.index.reserve(self.descriptor,request_key,request,intent)
        with self.wallet._transaction() as db:
            old=db.execute('SELECT intent,request FROM wallet_game_intents WHERE intent_id=?',(intent['binding']['intent_id'],)).fetchone()
            if old:p.require(tuple(old)==(encoded(intent),encoded(request)),'Wallet/index intent differs')
            else:
                p.require(db.execute('SELECT count(*) FROM wallet_game_intents').fetchone()[0]<10000,'game intent capacity')
                db.execute('INSERT INTO wallet_game_intents VALUES (?,?,?,?,0)',(intent['binding']['intent_id'],intent['binding']['connection_id'],encoded(intent),encoded(request)))
            self.check(deadline)
        return {'ok':True,'result':intent}
    def approve(self,owner,request,intent,context,deadline):
        now=self.check(deadline);auth=self.authentication;auth._observe_time()
        p.require((owner.device_ref,owner.credential_revision)==(intent['binding']['device_ref'],intent['binding']['credential_revision']),'only the originating authenticated device may replay an approval')
        with self.wallet._transaction() as db:
            prior=db.execute('SELECT * FROM wallet_game_consents WHERE intent_id=?',(request['intent_id'],)).fetchone()
            if prior:
                p.require(prior['approve_request']==encoded(request),'approval already has a different immutable request');return
            p.admit_intent_action(intent,owner,'approve',now=now)
            row=db.execute('SELECT * FROM wallet_game_intents WHERE intent_id=?',(request['intent_id'],)).fetchone()
            p.require(row and row['intent']==encoded(intent) and row['used']==0,'unused exact Wallet game challenge required')
            credential=auth._credential(db,context);p.require(credential and credential['revoked_at'] is None,'current owner credential')
            updated=p.verify_owner_approval(request,intent,owner,json.loads(credential['current_record']),auth._user_handle(owner.account_id),now=now)
            committed=self.check(deadline);p.require(committed<intent['binding']['intent_expires_at'],'game intent expired during signature verification')
            auth._time(db)
            consent={'schema':'rock-game-owner-consent/1','environment':'synthetic','operation':request['op'],'key':request['key'],
                'request_sha256':p.owner_request_digest(request),'receipt_id':str(uuid.uuid4()),'binding':intent['binding'],'binding_sha256':intent['binding_sha256'],
                'challenge_id':intent['challenge_id'],'credential_id':credential['credential_id'],
                'assertion_sha256':p.hash_object(b'RockGameOwnerAssertion-v1\0',request['credential']),
                'credential_sign_count':updated['sign_count'],'committed_at':committed,'decision':'APPROVED','simulation_only':True}
            p.match_owner_consent(consent,intent,request)
            shared=self.signer.sign(p.publication(consent,receipt_id=str(uuid.uuid4()),key_id=self.signer.key_id,key_revision=1))
            self.check(deadline);p.require(self.gateway.now()<intent['binding']['intent_expires_at'],'game consent expired before commit')
            db.execute('UPDATE wallet_auth_credential_state SET record_json=? WHERE credential_id=?',(json.dumps(updated,sort_keys=True,separators=(',',':')),credential['credential_id']))
            db.execute('UPDATE wallet_game_intents SET used=1 WHERE intent_id=?',(request['intent_id'],))
            db.execute('INSERT INTO wallet_game_consents VALUES (?,?,?,?)',(request['intent_id'],encoded(consent),encoded(request),encoded(shared)))
            db.execute('INSERT INTO wallet_game_heads VALUES (?,?)',(intent['binding']['connection_id'],encoded(shared)))
    def durable(self,intent):
        with self.wallet._transaction() as db:
            stored=db.execute('SELECT intent FROM wallet_game_intents WHERE intent_id=?',(intent['binding']['intent_id'],)).fetchone()
            p.require(stored and stored[0]==encoded(intent),'Wallet intent missing or changed')
            consent=db.execute('SELECT * FROM wallet_game_consents WHERE intent_id=?',(intent['binding']['intent_id'],)).fetchone()
            if consent is None:return None
            head=db.execute('SELECT shared FROM wallet_game_heads WHERE connection_id=?',(intent['binding']['connection_id'],)).fetchone()
            p.require(head is not None,'Wallet connection head missing')
            consent_value=loaded(consent['consent']);p.match_owner_consent(consent_value,intent,loaded(consent['approve_request']))
            shared=loaded(head[0]);p.match_consent(shared,consent_value)
            return consent_value,shared
    def synchronize(self,intent,deadline):
        now=self.check(deadline);pair=self.durable(intent)
        if pair:
            consent,shared=pair
            try:self.gateway.index.publish(self.descriptor,intent,consent,shared,self.gateway.keys,now)
            except (ValueError,LookupError) as exc:
                raise p.VerificationUnavailable('committed consent publication is unresolved; retain the exact request') from exc
        else:
            row=self.gateway.index.get('intent_id',intent['binding']['intent_id'])
            available(row and row['head'] is None,'index has consent missing from Wallet')
        return pair
    def result(self,owner,intent,deadline):
        pair=self.synchronize(intent,deadline)
        if pair is None:return {'ok':True,'result':{'state':'AWAITING_OWNER_CONSENT','intent_id':intent['binding']['intent_id'],'simulation_only':True}}
        consent,shared=pair;head=self.gateway.index.head(self.descriptor,intent,shared)
        return {'ok':True,'result':p.project_owner(shared,consent,self.gateway.keys,owner,current=head,now=self.check(deadline))}
    def revoke(self,request,intent,actor,deadline,principal=None):
        pair=self.synchronize(intent,deadline);p.require(pair,'cannot revoke an unapproved intent')
        key=namespace(intent['binding']['game_authority_id'],intent['binding']['game_id'],intent['binding']['connection_id'],actor,request['op'],request['key'])
        with self.wallet._transaction() as db:
            old=db.execute('SELECT request FROM wallet_game_requests WHERE key=?',(key,)).fetchone()
            if old:
                p.require(old[0]==encoded(request),'revocation request conflict')
                return loaded(db.execute('SELECT result FROM wallet_game_requests WHERE key=?',(key,)).fetchone()[0])
            consent,shared=pair;public=shared['publication']
            if public['state']!='REVOKED':
                shared=loaded(encoded(shared));public=shared['publication'];public.update(state='REVOKED',revocation_generation=public['revocation_generation']+1,decided_at=self.check(deadline))
                shared.update(key='publish:'+public['connection_id']+':'+str(public['revocation_generation']),receipt_id=str(uuid.uuid4()),
                    request_sha256=p.hash_object(b'RockGameConnectionPublication-v1\0',public))
                shared=self.signer.sign(shared);self.check(deadline)
                db.execute('UPDATE wallet_game_heads SET shared=? WHERE connection_id=?',(encoded(shared),public['connection_id']))
            if principal is not None:self.gateway.current_author(principal)
            self.check(deadline)
            p.require(db.execute('SELECT count(*) FROM wallet_game_requests').fetchone()[0]<10000,'game request capacity')
            db.execute('INSERT INTO wallet_game_requests VALUES (?,?,?)',(key,encoded(request),encoded(shared)))
            return shared
    def author(self,principal,request,deadline):
        game=self.gateway.current_author(principal);self.check(deadline)
        row=self.gateway.index.get('connection_id',request['connection_id'])
        p.require(row and row['ledger_ref']==self.descriptor.ledger_ref and (row['game_authority_id'],row['game_id'])==(game.game_authority_id,game.game_id),'current game index route mismatch')
        p.require(p.required_game_scope(request['op']) in principal.scopes,'author scope rejected')
        intent=loaded(row['intent']);pair=self.synchronize(intent,deadline);p.require(pair,'connection consent is not committed')
        consent,shared=pair
        p.require(p.required_game_scope(request['op']) in consent['binding']['scopes'],'owner did not grant scope')
        if request['op']=='connection.revoke':
            self.revoke(request,intent,namespace('author',principal.author_id,principal.credential_revision),deadline,principal)
            consent,shared=self.synchronize(intent,deadline)
        self.gateway.current_author(principal)
        head=self.gateway.index.head(self.descriptor,intent,shared)
        return {'ok':True,'result':p.project_author(shared,self.gateway.keys,principal,game=game,current=head,now=self.check(deadline))}
    def list(self,owner,request,deadline):
        now=self.check(deadline)
        scope={key:getattr(owner,key) for key in ('wallet_authority_id','owner_ref','account_id','device_ref','credential_revision')}
        scope.update(operation=request['op'],limit=request['limit'],filter='all')
        after=''
        if request['cursor'] is not None:
            after=p.verify_cursor(request['cursor'],self.gateway.keys,scope,now=now)['after_id']
        with self.wallet._transaction() as db:
            rows=db.execute('SELECT intent FROM wallet_game_intents WHERE connection_id>? ORDER BY connection_id LIMIT ?',
                (after,request['limit']+1)).fetchall()
        intents=[loaded(row[0]) for row in rows];items=[];consumed=0
        for intent in intents[:request['limit']]:
            p.admit_intent_action(intent,owner,'status',now=now)
            result=self.result(owner,intent,deadline)['result']
            candidate=items+[result]
            if len(json.dumps(candidate,ensure_ascii=False,separators=(',',':')).encode())>48000:break
            items=candidate;consumed+=1
        cursor=None
        if len(intents)>consumed:
            value={'schema':'rock-game-connection-cursor/1','environment':'synthetic','issuer':owner.wallet_authority_id,
                'scope_sha256':p.scope_digest(scope),'after_id':intents[consumed-1]['binding']['connection_id'],
                'issued_at':now,'expires_at':now+120,'algorithm':'Ed25519','credential_id':self.cursor.key_id,
                'credential_revision':1,'signature':p.b64(bytes(64))}
            cursor=p.encode_cursor(self.cursor.sign(value))
        self.check(deadline)
        return {'ok':True,'result':{'schema':'rock-game-owner-connection-list/1','items':items,'next_cursor':cursor,
            'as_of':now,'simulation_only':True}}
