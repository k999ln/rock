"""Private durable GX00 owner connection requests, not a local authority/cache.

All returned receipts come from a fresh authenticated v3 exchange. Local records
are immutable retry material and never establish current connection access.
Only explicitly provisioned public synthetic game/key snapshots are supported.
"""
from dataclasses import asdict
import hashlib
import math
import sqlite3
import ssl
import threading
import time

from wallet_backend.client import HTTPSWalletTransport, BackendUnavailable
from . import protocol as p
from .storage import PrivateStore

MAX_REQUESTS = 10000
WRITES = frozenset(('game.connection.begin','game.connection.approve','game.connection.revoke'))


class ConnectionUnavailable(BackendUnavailable):
    """Result unknown or not verifiable; exact saved request must be retained."""


def _encoded(value):
    return p.canonical(value).decode('utf-8')


def _loaded(value):
    return p.decode(value.encode('utf-8'))


class OwnerConnectionClient:
    def __init__(self, state, transport, *, games, keys, clock=time.time):
        p.require(type(transport) is HTTPSWalletTransport and transport.protocol_version == 3,
                  'explicit fixed v3 Wallet transport required')
        p.require(type(games) is tuple and 1 <= len(games) <= 64, 'fixed bounded game registry required')
        p.require(type(keys) is p.KeyRegistry, 'fixed signing-key registry required')
        self.transport=transport;self.clock=clock;self._mutex=threading.RLock();self._closed=False
        mapping={}
        for game in games:
            p.game_record(game);identity=(game.game_authority_id,game.game_id)
            p.require(identity not in mapping,'duplicate game registry identity');mapping[identity]=game
        self.games=mapping;self.keys=p.KeyRegistry(tuple(keys.records.values()))
        self._transport_pin=self._transport_identity()
        self._registry_pin=self._registry_identity()
        configuration={'schema':'rock-game-owner-client/1','environment':'synthetic',
            'transport':self._transport_pin,**self._registry_pin,
            'connection_protocol':'rock-game-connection/1','capacity':MAX_REQUESTS}
        self.store=PrivateStore(state,configuration)
        try:
            with self.store.transaction() as db:
                db.execute('CREATE TABLE IF NOT EXISTS owner (singleton INTEGER PRIMARY KEY CHECK(singleton=1), context TEXT NOT NULL)')
                db.execute('''CREATE TABLE IF NOT EXISTS requests (
                    operation TEXT NOT NULL, key TEXT NOT NULL, request TEXT NOT NULL, target TEXT NOT NULL UNIQUE,
                    receipt TEXT, last_contact TEXT NOT NULL CHECK(last_contact IN ('PREPARED','UNKNOWN','ACKNOWLEDGED','DENIED','REJECTED')),
                    PRIMARY KEY(operation,key))''')
                db.execute('''CREATE TABLE IF NOT EXISTS bindings (
                    intent_id TEXT PRIMARY KEY, connection_id TEXT NOT NULL UNIQUE, intent TEXT NOT NULL,
                    consent TEXT, generation INTEGER NOT NULL DEFAULT 0, as_of INTEGER NOT NULL DEFAULT 0,
                    shared TEXT)''')
                for table in ('owner','requests','bindings'):
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS {table}_retain BEFORE DELETE ON {table} BEGIN SELECT RAISE(ABORT,'retained owner journal'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS owner_immutable BEFORE UPDATE ON owner BEGIN SELECT RAISE(ABORT,'fixed authenticated owner'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS requests_binding BEFORE UPDATE OF operation,key,request,target ON requests BEGIN SELECT RAISE(ABORT,'immutable exact request'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS requests_receipt BEFORE UPDATE OF receipt ON requests WHEN OLD.receipt IS NOT NULL AND NEW.receipt IS NOT OLD.receipt BEGIN SELECT RAISE(ABORT,'immutable acknowledgement'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS bindings_intent BEFORE UPDATE OF intent_id,connection_id,intent ON bindings BEGIN SELECT RAISE(ABORT,'immutable intent'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS bindings_consent BEFORE UPDATE OF consent ON bindings WHEN OLD.consent IS NOT NULL AND NEW.consent IS NOT OLD.consent BEGIN SELECT RAISE(ABORT,'immutable consent'); END")
                p.require(db.execute('SELECT count(*) FROM requests').fetchone()[0]<=MAX_REQUESTS,'owner journal exceeds capacity')
        except BaseException:self.close();raise

    def _transport_identity(self):
        t=self.transport
        p.require(type(t) is HTTPSWalletTransport and t.protocol_version==3 and t.endpoint=='/v3/wallet'
                  and t.context.check_hostname is True and t.context.verify_mode==ssl.CERT_REQUIRED,
                  'verified fixed v3 transport required')
        p.require(type(t.timeout) in (int,float) and math.isfinite(t.timeout) and .05<=t.timeout<=3,
                  'fixed finite bounded Wallet timeout required')
        p.require(t.context.minimum_version>=ssl.TLSVersion.TLSv1_2,'minimum TLS 1.2 required')
        p.require(t.host in ('127.0.0.1','localhost','10.0.2.2') and type(t.port) is int and 1<=t.port<=65535
                  and t.origin==f'https://{t.host}:{t.port}','fixed owned development origin required')
        p.uuid_value(t.authority_id);p.identifier(t.device_ref)
        certificates=t.context.get_ca_certs(binary_form=True)
        p.require(1<=len(certificates)<=64,'bounded actual TLS CA set required')
        return {'fingerprint':t.fingerprint,'origin':t.origin,'authority_id':t.authority_id,
            'device_ref':t.device_ref,'protocol_version':t.protocol_version,'endpoint':t.endpoint,
            'host':t.host,'port':t.port,'token_sha256':hashlib.sha256(t.token.encode('ascii')).hexdigest(),
            'ca_der_sha256':sorted(hashlib.sha256(certificate).hexdigest() for certificate in certificates),
            'minimum_tls':t.context.minimum_version.name,'maximum_tls':t.context.maximum_version.name,
            'verify_mode':int(t.context.verify_mode),'verify_flags':int(t.context.verify_flags),
            'ssl_options':int(t.context.options),'check_hostname':t.context.check_hostname,
            'timeout_seconds_hex':float(t.timeout).hex()}

    def _registry_identity(self):
        p.require(type(self.keys) is p.KeyRegistry and type(self.games) is dict and 1<=len(self.games)<=64,
                  'fixed actual key/game snapshots required')
        checked=p.KeyRegistry(tuple(self.keys.records.values()))
        p.require(dict(checked.records)==dict(self.keys.records),'signing-key identity mapping changed')
        records=[]
        for key in sorted(self.keys.records):
            record=asdict(self.keys.records[key]);record['public_key']=p.b64(record['public_key']);records.append(record)
        games=[]
        for key in sorted(self.games):
            game=self.games[key];p.game_record(game)
            p.require(key==(game.game_authority_id,game.game_id),'game identity mapping changed')
            games.append(dict(asdict(game),scopes=list(game.scopes)))
        return {'games':games,'key_registry_sha256':p.hash_object(b'RockGameClientKeys-v1\0',records)}

    def _check(self):
        p.require(not self._closed,'owner connection client is closed')
        p.require(self._transport_identity()==self._transport_pin,'owner transport changed after binding')
        p.require(self._registry_identity()==self._registry_pin,'actual game/signing-key snapshot changed')
        self.store.check()

    def _now(self,db):
        value=self.clock()
        p.require(type(value) in (int,float) and math.isfinite(value) and 1<=value<=p.MAX_INT,'finite client clock required')
        now=p.integer(int(value),1);self.store.observe_time(db,now);return now

    def _game(self,proof):
        game=self.games.get((proof['game_authority_id'],proof['game_id']))
        p.require(game is not None,'game is not in the pinned registry');return game

    def _owner(self,db,binding=None):
        row=db.execute('SELECT context FROM owner WHERE singleton=1').fetchone()
        if binding is None:
            p.require(row is not None,'no authenticated owner receipt has been observed')
            value=_loaded(row[0])
        else:
            # These fields are learned only from the actual authenticated TLS
            # begin response, never a caller-supplied owner/account argument.
            value={key:binding[key] for key in ('wallet_authority_id','owner_ref','account_id','device_ref','credential_revision')}
            p.require(value['wallet_authority_id']==self.transport.authority_id and value['device_ref']==self.transport.device_ref,
                      'begin receipt has another authenticated authority/device')
            p.require(row is None or row[0]==_encoded(value),'authenticated owner/account/revision changed')
        owner=p.OwnerContext(**value);p.owner_context(owner);return owner

    @staticmethod
    def _binding(db,column,value):
        p.require(column in ('intent_id','connection_id'),'fixed binding lookup required')
        row=db.execute('SELECT * FROM bindings WHERE '+column+'=?',(value,)).fetchone()
        p.require(row is not None,'request requires a retained authenticated begin receipt')
        return row

    def _target(self,db,request,*,retained,now):
        op=request['op']
        if op=='game.connection.begin':
            proof=request['proof'];game=self._game(proof)
            if retained:
                p.verify_signature('proof',proof,self.keys,issuer=game.game_authority_id,
                    signed_at=proof['issued_at'],now=now,current=False)
            else:p.verify_proof(proof,self.keys,game,audience=self.transport.authority_id,now=now)
            p.require(proof['audience']==self.transport.authority_id,'proof has another Wallet audience')
            return p.hash_object(b'RockGameClientBeginTarget-v1\0',
                [game.game_authority_id,game.game_id,proof['player_id']])
        row=self._binding(db,'intent_id' if op.endswith('.approve') else 'connection_id',
                          request.get('intent_id',request.get('connection_id')))
        intent=_loaded(row['intent']);owner=self._owner(db)
        p.admit_intent_action(intent,owner,'status',now=now)
        if op.endswith('.approve'):
            p.require(request['challenge_id']==intent['challenge_id'] and request['binding_sha256']==intent['binding_sha256'],
                      'approval differs from retained challenge/binding')
            p.require(request['credential']['id'] in {r['id'] for r in intent['options']['publicKey']['allowCredentials']},
                      'approval uses another credential')
            return 'approve:'+request['intent_id']
        p.require(row['consent'] is not None,'exact approval must be recovered before revoke/status')
        return 'revoke:'+request['connection_id']

    @staticmethod
    def _denial(reply):
        p.fields(reply,{'ok','code','error'})
        p.require(reply['ok'] is False and reply['code'] in ('rejected','unauthorized') and
                  type(reply['error']) is str and 1<=len(reply['error'])<=300,'invalid bounded denial')

    def _accept(self,db,request,reply,now):
        p.fields(reply,{'ok','result'});p.require(reply['ok'] is True,'invalid success envelope')
        result=reply['result'];op=request['op']
        if op.endswith('.begin'):
            p.validate_intent(result);owner=self._owner(db,result['binding']);game=self._game(request['proof'])
            p.match_begin_intent(result,request,game,owner)
            p.require(result['binding']['created_at']<=now,'intent is from the future')
            p.verify_proof(request['proof'],self.keys,game,audience=owner.wallet_authority_id,now=result['binding']['created_at'])
            old=db.execute('SELECT intent FROM bindings WHERE intent_id=? OR connection_id=?',
                (result['binding']['intent_id'],result['binding']['connection_id'])).fetchone()
            p.require(old is None or old[0]==_encoded(result),'begin changed a retained intent')
            db.execute('INSERT OR IGNORE INTO owner VALUES(1,?)',(_encoded(asdict(owner)),))
            db.execute('INSERT OR IGNORE INTO bindings(intent_id,connection_id,intent) VALUES(?,?,?)',
                (result['binding']['intent_id'],result['binding']['connection_id'],_encoded(result)))
        elif op.endswith('.approve'):
            row=self._binding(db,'intent_id',request['intent_id']);intent=_loaded(row['intent'])
            p.match_owner_consent(result,intent,request);p.require(result['committed_at']<=now,'consent is from the future')
            p.require(row['consent'] is None or row['consent']==_encoded(result),'approval changed a retained consent')
            db.execute('UPDATE bindings SET consent=? WHERE intent_id=?',(_encoded(result),request['intent_id']))
        else:
            row=self._binding(db,'connection_id',request['connection_id']);consent=_loaded(row['consent'])
            p.verify_shared(result,self.keys,now=now);p.match_consent(result,consent)
            public=result['publication']
            p.require(public['connection_id']==request['connection_id'] and public['state']=='REVOKED'
                      and public['revocation_generation']>=row['generation'],'invalid or regressed revoke receipt')
            p.require(row['shared'] is None or row['shared']==_encoded(result),'revoke changed a retained signed head')
            db.execute('UPDATE bindings SET generation=?,shared=? WHERE connection_id=?',
                (public['revocation_generation'],_encoded(result),request['connection_id']))

    def _status(self,request):
        with self.store.transaction() as db:
            now=self._now(db);self._target(db,request,retained=False,now=now)
        try:
            self._check()
            reply=p.decode(p.canonical(self.transport.exchange(request)))
            self._check()
            if reply.get('ok') is False:self._denial(reply);return reply
            p.fields(reply,{'ok','result'});p.require(reply['ok'] is True,'status success required')
            value=reply['result'];p.fields(value,{'schema','connection','current_state','as_of','consent_receipt_id',
                'approved_device_ref','receipt_sha256','simulation_only'})
            p.require(value['schema']=='rock-game-owner-connection-view/1' and value['simulation_only'] is True,'owner status schema required')
            p.validate_publication(value['connection']);p.digest(value['receipt_sha256']);p.integer(value['as_of'],1)
            with self.store.transaction() as db:
                now=self._now(db);row=self._binding(db,'connection_id',request['connection_id'])
                consent=_loaded(row['consent']);binding=consent['binding'];public=value['connection']
                expected=p.publication(consent,receipt_id=str(consent['receipt_id']),key_id='unused-view-key',key_revision=1)['publication']
                p.require(all(public[k]==v for k,v in expected.items() if k not in ('state','revocation_generation','decided_at')),
                          'status belongs to another retained consent')
                state=public['state'] if public['state']=='REVOKED' or value['as_of']<public['expires_at'] else 'EXPIRED'
                p.require(value['current_state']==state and row['as_of']<=value['as_of']<=now and
                    public['decided_at']<=value['as_of'] and public['revocation_generation']>=row['generation'] and
                    value['consent_receipt_id']==consent['receipt_id'] and value['approved_device_ref']==binding['device_ref'],
                    'current owner status regressed or mismatched')
                if row['shared'] is not None:
                    shared=_loaded(row['shared']);p.require(public==shared['publication'] and
                        value['receipt_sha256']==p.hash_object(b'RockGameSharedReceipt-v1\0',shared),'current status differs from retained signed revocation')
                db.execute('UPDATE bindings SET generation=?,as_of=? WHERE connection_id=?',
                    (public['revocation_generation'],value['as_of'],request['connection_id']))
            return reply
        except (OSError,ValueError,sqlite3.Error,p.VerificationUnavailable) as exc:
            raise ConnectionUnavailable('current connection status unavailable; no cached state returned') from exc

    def dispatch(self,request):
        request=p.decode(p.canonical(request));p.validate_owner_request(request)
        p.require(request['op'] in WRITES or request['op']=='game.connection.status','owner client operation disabled')
        with self._mutex:
            self._check()
            if request['op']=='game.connection.status':return self._status(request)
            operation,key=request['op'],request['key'];encoded=_encoded(request)
            with self.store.transaction() as db:
                now=self._now(db)
                old=db.execute('SELECT * FROM requests WHERE operation=? AND key=?',(operation,key)).fetchone()
                if old:p.exact_retry(_loaded(old['request']),request)
                target=self._target(db,request,retained=old is not None,now=now)
                if old is None:
                    p.require(db.execute('SELECT 1 FROM requests WHERE target=?',(target,)).fetchone() is None,
                              'logical operation already retained; retry its original key')
                    p.require(db.execute('SELECT count(*) FROM requests').fetchone()[0]<MAX_REQUESTS,'owner journal capacity reached')
                    db.execute('INSERT INTO requests VALUES(?,?,?,?,NULL,?)',(operation,key,encoded,target,'PREPARED'))
            # PrivateStore commits and directory-fsyncs before any network call.
            try:
                self._check()
                reply=p.decode(p.canonical(self.transport.exchange(request)))
                self._check()
                with self.store.transaction() as db:
                    now=self._now(db)
                    if reply.get('ok') is False:
                        self._denial(reply)
                        db.execute('UPDATE requests SET last_contact=? WHERE operation=? AND key=?',
                            ('DENIED' if reply['code']=='unauthorized' else 'REJECTED',operation,key))
                    else:
                        row=db.execute('SELECT receipt FROM requests WHERE operation=? AND key=?',(operation,key)).fetchone()
                        p.require(row[0] is None or row[0]==_encoded(reply),'acknowledgement differs from retained immutable receipt')
                        self._accept(db,request,reply,now)
                        db.execute('UPDATE requests SET receipt=?,last_contact=? WHERE operation=? AND key=?',
                            (_encoded(reply),'ACKNOWLEDGED',operation,key))
                return reply
            except (OSError,ValueError,sqlite3.Error,p.VerificationUnavailable) as exc:
                try:
                    with self.store.transaction() as db:
                        db.execute('UPDATE requests SET last_contact=? WHERE operation=? AND key=?',('UNKNOWN',operation,key))
                except (OSError,ValueError,sqlite3.Error):pass
                raise ConnectionUnavailable('connection outcome unknown; retain and retry the exact saved request') from exc

    def retry(self,operation,key):
        p.require(operation in WRITES,'retry requires an existing owner write operation');p.identifier(key,128)
        with self._mutex:
            self._check()
            with self.store.transaction() as db:
                row=db.execute('SELECT request FROM requests WHERE operation=? AND key=?',(operation,key)).fetchone()
                p.require(row is not None,'no saved request for this operation/key');request=_loaded(row[0])
            return self.dispatch(request)

    def pending(self,*,limit=50,after=None):
        """Local retry inventory only; it is never a current connection view."""
        p.integer(limit,1,50)
        if after is not None:
            p.require(type(after) is tuple and len(after)==2 and after[0] in WRITES,'invalid local inventory position')
            p.identifier(after[1],128)
        with self._mutex:
            self._check()
            with self.store.transaction() as db:
                query="SELECT operation,key,request,receipt,last_contact FROM requests WHERE last_contact!='ACKNOWLEDGED'"
                arguments=()
                if after is not None:query+=' AND (operation,key)>(?,?)';arguments=after
                rows=db.execute(query+' ORDER BY operation,key LIMIT ?',arguments+(limit,)).fetchall()
                return [{'operation':row[0],'key':row[1],'request_sha256':p.owner_request_digest(_loaded(row[2])),
                         'has_receipt':row[3] is not None,'last_contact':row[4]} for row in rows]

    def close(self):
        with self._mutex:
            if not self._closed:
                if getattr(self,'store',None) is not None:self.store.close()
                self._closed=True
