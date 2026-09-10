"""Reference owner SDK: per-game connection journals and v1 exchange namespaces.

No local balance authority, Wallet signing secret or Game asset ledger. Every
read is fresh TLS; every mutation is durably recorded before sending. The old
GX00 client remains a deliberately narrower independently supported API.
"""
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import threading
import time
from wallet_backend.client import HTTPSWalletTransport,BackendUnavailable
from . import protocol as p
from . import exchange_protocol as x
from .client import OwnerConnectionClient,ConnectionUnavailable,_encoded,_loaded
from .storage import PrivateStore

class ReferenceOwnerClient:
    def __init__(self,state,transport,*,games,connection_keys,exchange_keys,clock=time.time):
        p.require(type(transport) is HTTPSWalletTransport and transport.protocol_version==3,'fixed real owner v3 TLS transport required')
        self.transport,self.clock=transport,clock;self.games={g.game_id:g for g in games}
        p.require(type(games) is tuple and len(self.games)==len(games) and 1<=len(games)<=2,'explicit synthetic games required')
        self.keys=x.KeyRegistry(tuple(exchange_keys.records.values()));self.connection_keys=connection_keys
        self.connections={};self.locks={g:threading.RLock() for g in self.games};self.locks['*']=threading.RLock()
        state=Path(state);state.mkdir(mode=0o700,exist_ok=True)
        self.pin=transport.fingerprint
        keyrecords=[dict(asdict(k),public_key=p.b64(k.public_key)) for k in self.keys.records.values()]
        self.store=PrivateStore(state/'exchange-journal',{'schema':'rock-game-reference-owner-sdk/1','transport':self.pin,
            'games':sorted(self.games),'keys_sha256':hashlib.sha256(p.canonical(keyrecords)).hexdigest(),'simulation_only':True})
        try:
            with self.store.transaction() as db:
                db.execute('CREATE TABLE IF NOT EXISTS requests (namespace TEXT PRIMARY KEY,game_id TEXT NOT NULL,operation TEXT NOT NULL,key TEXT NOT NULL,request TEXT NOT NULL,receipt TEXT,last_contact TEXT NOT NULL)')
                db.execute('CREATE TABLE IF NOT EXISTS quotes (quote_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,quote TEXT NOT NULL)')
                db.execute('CREATE TABLE IF NOT EXISTS intents (attempt_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,intent TEXT NOT NULL)')
                db.execute('CREATE TABLE IF NOT EXISTS player_proofs (game_id TEXT NOT NULL,key TEXT NOT NULL,request TEXT NOT NULL,proof TEXT,PRIMARY KEY(game_id,key))')
                db.execute('CREATE TABLE IF NOT EXISTS migrations (source_uuid TEXT PRIMARY KEY,receipt TEXT NOT NULL)')
                for table in ('requests','quotes','intents','player_proofs','migrations'):
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS {table}_retain BEFORE DELETE ON {table} BEGIN SELECT RAISE(ABORT,'retained SDK journal'); END")
                for table,columns in (('requests','namespace,game_id,operation,key,request'),('quotes','quote_id,game_id,quote'),
                        ('intents','attempt_id,game_id,intent'),('player_proofs','game_id,key,request'),('migrations','source_uuid,receipt')):
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS {table}_binding BEFORE UPDATE OF {columns} ON {table} BEGIN SELECT RAISE(ABORT,'immutable SDK binding'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS sdk_receipt BEFORE UPDATE OF receipt ON requests WHEN OLD.receipt IS NOT NULL AND NEW.receipt IS NOT OLD.receipt BEGIN SELECT RAISE(ABORT,'immutable SDK acknowledgement'); END")
            for game in games:
                self.connections[game.game_id]=OwnerConnectionClient(state/('connection-'+game.game_id),transport,games=(game,),keys=connection_keys,clock=clock)
        except BaseException:self.close();raise

    def _check(self):
        p.require(self.transport.fingerprint==self.pin,'SDK transport changed')
        for client in self.connections.values():client._check()
        self.store.check()
    def close(self):
        for client in self.connections.values():client.close()
        if getattr(self,'store',None) is not None:self.store.close()
    def _namespace(self,game,request):
        return hashlib.sha256(p.canonical(['reference-owner-v1',self.transport.authority_id,self.transport.device_ref,game,request['op'],request['key']])).hexdigest()
    def game_for(self,request):
        if request['op']=='game.connection.begin':return request['proof']['game_id']
        if request['op'] in ('game.exchange.list','game.sandbox.credit'):return '*'
        column='intent_id' if 'intent_id' in request else 'connection_id'
        if column in request:
            found=[]
            for game,client in self.connections.items():
                with client.store.transaction() as db:
                    if db.execute('SELECT 1 FROM bindings WHERE '+column+'=?',(request[column],)).fetchone():found.append(game)
            p.require(len(found)==1,'original connection journal required for this request');return found[0]
        column,table=('quote_id','quotes') if 'quote_id' in request else ('attempt_id','intents')
        with self.store.transaction() as db:
            row=db.execute('SELECT game_id FROM '+table+' WHERE '+column+'=?',(request[column],)).fetchone()
            p.require(row is not None,'original quote/approval journal required');return row[0]

    def _quote(self,game,value):
        x.quote(value);b=value['binding'];self.keys.verify('quote',value,self.transport.authority_id)
        p.require(b['wallet_authority_id']==self.transport.authority_id and b['game_id']==game and
            b['game_authority_id']==self.games[game].game_authority_id,'quote authority/game mismatch')
        client=self.connections[game]
        with client.store.transaction() as db:
            row=client._binding(db,'connection_id',b['connection_id']);intent=_loaded(row['intent']);owner=client._owner(db)
            p.require(row['consent'] is not None and value['owner_ref']==owner.owner_ref and value['account_id']==owner.account_id and
                b['player_id']==intent['binding']['player_id'],'quote owner/player differs from retained consent')
        return value

    def _state(self,game,value):
        p.fields(value,{'schema','id','connection_id','exchange_id','quote','state','held_minor','committed_minor','released_minor','approval','terminal_receipt','simulation_only'})
        p.require(value['schema']=='rock-game-exchange-state/1' and value['simulation_only'] is True,'strict exchange state required')
        p.uuid_value(value['id']);q=self._quote(game,value['quote']);b=q['binding']
        p.require((value['connection_id'],value['exchange_id'])==(b['connection_id'],b['exchange_id']),'state target mismatch')
        approval=x.approval(value['approval']);self.keys.verify('approval',approval,self.transport.authority_id)
        p.require(approval['decision']=='APPROVED' and approval['hold_id']==value['id'] and approval['quote_sha256']==x.quote_digest(q) and
            approval['binding_sha256']==q['binding_sha256'] and approval['quote_id']==b['quote_id'],'state owner approval mismatch')
        for k in ('held_minor','committed_minor','released_minor'):p.integer(value[k],0,x.MAX_TOTAL)
        p.require(sum(value[k] for k in ('held_minor','committed_minor','released_minor'))==b['total_minor'],'state amount conservation failed')
        state=value['state'];terminal=value['terminal_receipt']
        if state in ('QUEUED','CONFIRMING','REVIEW_REQUIRED'):
            p.require(value['held_minor']==b['total_minor'] and terminal is None,'unresolved exchange must retain the whole hold')
        elif state=='CANCELLED':p.require(value['released_minor']==b['total_minor'] and terminal is None,'unsent cancellation mismatch')
        else:
            p.require(state in ('COMPLETED','REVERSED'),'unknown exchange state');x.terminal(terminal)
            self.keys.verify('terminal',terminal,b['game_authority_id'])
            p.require(terminal['binding']==b and terminal['quote_sha256']==x.quote_digest(q) and terminal['approval_sha256']==x.approval_digest(approval) and
                terminal['terminal_state']==('APPLIED' if state=='COMPLETED' else 'REJECTED'),'terminal belongs to another purchase')
            p.require(value['committed_minor' if state=='COMPLETED' else 'released_minor']==b['total_minor'],'terminal amount mismatch')
        return value

    def _accept(self,db,game,request,reply):
        if reply.get('ok') is False:OwnerConnectionClient._denial(reply);return
        p.fields(reply,{'ok','result'});p.require(reply['ok'] is True,'strict SDK acknowledgement required');value=reply['result'];op=request['op']
        if op=='game.sandbox.credit':
            p.fields(value,{'schema','amount_minor','sale_id','settled','simulation_only'})
            p.require(value['schema']=='rock-game-sandbox-credit/1' and value['amount_minor']==10000 and value['settled'] is True and value['simulation_only'] is True,'invalid public fixture credit receipt')
            p.uuid_value(value['sale_id'])
        elif op=='game.exchange.quote':
            self._quote(game,value);b=value['binding']
            p.require((b['connection_id'],b['exchange_id'],b['principal_minor'])==(request['connection_id'],request['exchange_id'],request['principal_minor']), 'quote request mismatch')
            old=db.execute('SELECT quote FROM quotes WHERE quote_id=?',(b['quote_id'],)).fetchone()
            p.require(old is None or old[0]==_encoded(value),'immutable quote changed')
            db.execute('INSERT OR IGNORE INTO quotes VALUES (?,?,?)',(b['quote_id'],game,_encoded(value)))
        elif op=='game.exchange.approval.begin':
            x.intent(value);self._quote(game,value['quote'])
            row=db.execute('SELECT quote FROM quotes WHERE quote_id=?',(request['quote_id'],)).fetchone()
            p.require(row is not None and _loaded(row[0])==value['quote'] and value['device_ref']==self.transport.device_ref,'purchase intent changed quote/device')
            old=db.execute('SELECT intent FROM intents WHERE attempt_id=?',(value['attempt_id'],)).fetchone()
            p.require(old is None or old[0]==_encoded(value),'immutable purchase intent changed')
            db.execute('INSERT OR IGNORE INTO intents VALUES (?,?,?)',(value['attempt_id'],game,_encoded(value)))
        elif op=='game.exchange.approve':
            x.approval(value);self.keys.verify('approval',value,self.transport.authority_id)
            row=db.execute('SELECT intent FROM intents WHERE attempt_id=?',(request['attempt_id'],)).fetchone();p.require(row is not None,'retained purchase intent required')
            intent=_loaded(row[0]);p.require(value['attempt_id']==request['attempt_id'] and value['quote_sha256']==intent['quote_sha256']==request['quote_sha256'] and
                value['binding_sha256']==intent['quote']['binding_sha256'] and value['device_ref']==intent['device_ref'] and
                value['device_credential_revision']==intent['device_credential_revision'] and value['request_sha256']==x.request_digest(request) and
                value['owner_credential_id']==intent['credential_id'],'approval acknowledgement mismatch')
        elif op=='game.exchange.list':
            p.fields(value,{'schema','items','next_after','simulation_only'})
            p.require(value['schema']=='rock-game-exchange-list/1' and value['simulation_only'] is True and type(value['items']) is list and len(value['items'])<=request['limit'],'bounded exchange history required')
            for item in value['items']:self._state(item['quote']['binding']['game_id'],item)
            if value['next_after'] is not None:p.uuid_value(value['next_after'])
        else:
            self._state(game,value);p.require((value['connection_id'],value['exchange_id'])==(request['connection_id'],request['exchange_id']),'state request mismatch')

    def dispatch(self,game,request):
        request=p.decode(p.canonical(request));p.require(game in self.locks,'SDK registered game required')
        if request.get('op')=='game.exchange.connection':
            x.request(request);return self.recover_connection(game,request['connection_id'])
        if request['op'].startswith('game.connection.'):
            p.require(game!='*' and self.game_for(request)==game,'connection request game mismatch')
            return self.connections[game].dispatch(request)
        x.request(request);p.require(self.game_for(request)==game,'purchase request game mismatch')
        write='key' in request;namespace=self._namespace(game,request) if write else None
        with self.locks[game]:
            self._check()
            with self.store.transaction() as db:
                self.store.observe_time(db,p.integer(int(self.clock()),1))
                if write:
                    row=db.execute('SELECT request FROM requests WHERE namespace=?',(namespace,)).fetchone()
                    p.require(row is None or row[0]==_encoded(request),'SDK key already binds different bytes')
                    if row is None:
                        p.require(db.execute('SELECT count(*) FROM requests').fetchone()[0]<x.MAX_ROWS,'SDK request capacity')
                        db.execute("INSERT INTO requests VALUES (?,?,?,?,?,NULL,'PREPARED')",(namespace,game,request['op'],request['key'],_encoded(request)))
            try:
                reply=p.decode(p.canonical(self.transport.exchange(request)));self._check()
                with self.store.transaction() as db:
                    self._accept(db,game,request,reply)
                    if write:
                        row=db.execute('SELECT receipt FROM requests WHERE namespace=?',(namespace,)).fetchone()
                        if reply['ok']:
                            p.require(row[0] is None or row[0]==_encoded(reply),'SDK immutable receipt changed')
                            db.execute("UPDATE requests SET receipt=?,last_contact='ACKNOWLEDGED' WHERE namespace=?",(_encoded(reply),namespace))
                        else:db.execute("UPDATE requests SET last_contact='DENIED' WHERE namespace=?",(namespace,))
                return reply
            except (ValueError,OSError,BackendUnavailable) as exc:
                if write:
                    with self.store.transaction() as db:db.execute("UPDATE requests SET last_contact='UNKNOWN' WHERE namespace=?",(namespace,))
                raise ConnectionUnavailable('purchase outcome unknown; retain exact original request and reconcile') from exc

    def retry(self,game,operation,key):
        p.identifier(key,128);namespace=self._namespace(game,{'op':operation,'key':key})
        with self.store.transaction() as db:
            row=db.execute('SELECT request FROM requests WHERE namespace=?',(namespace,)).fetchone()
            p.require(row is not None,'original saved SDK request required');request=_loaded(row[0])
        return self.dispatch(game,request)

    def recover_connection(self,game,connection_id):
        """Learn an existing same-owner connection through current owner TLS.

        This imports no assertion and cannot move the original device's
        challenge. A later purchase needs this device's new approval ceremony.
        The narrow GX00 client API and original receipt bytes stay unchanged.
        """
        p.require(game in self.connections,'registered Game required');p.uuid_value(connection_id)
        client=self.connections[game]
        with self.locks[game],client._mutex:
            self._check()
            reply=p.decode(p.canonical(self.transport.exchange({'v':1,'op':'game.exchange.connection','connection_id':connection_id})))
            self._check()
            if reply.get('ok') is False:OwnerConnectionClient._denial(reply);return reply
            p.fields(reply,{'ok','result'});p.require(reply['ok'] is True,'current authenticated connection recovery required')
            value=reply['result'];p.fields(value,{'schema','owner','intent','consent','shared','as_of','simulation_only'})
            p.require(value['schema']=='rock-game-exchange-connection/1' and value['simulation_only'] is True,'connection recovery schema required')
            p.fields(value['owner'],{'wallet_authority_id','owner_ref','account_id','device_ref','credential_revision'})
            owner=p.OwnerContext(**value['owner']);p.owner_context(owner);p.integer(value['as_of'],1)
            p.require(owner.wallet_authority_id==self.transport.authority_id and owner.device_ref==self.transport.device_ref,'recovery has another authenticated device/authority')
            intent=p.validate_intent(value['intent']);consent=p.validate_consent(value['consent']);binding=intent['binding']
            p.require(consent['binding']==binding and binding['connection_id']==connection_id and binding['game_id']==game and
                binding['game_authority_id']==self.games[game].game_authority_id,'recovered consent/binding differs')
            p.admit_intent_action(intent,owner,'status',now=value['as_of'])
            shared=p.verify_shared(value['shared'],self.connection_keys,now=value['as_of']);p.match_consent(shared,consent)
            public=shared['publication']
            with client.store.transaction() as db:
                now=client._now(db);p.require(value['as_of']<=now and public['decided_at']<=value['as_of'],'connection recovery time is from the future')
                previous=db.execute('SELECT context FROM owner WHERE singleton=1').fetchone()
                p.require(previous is None or previous[0]==_encoded(value['owner']),'current owner identity changed')
                row=db.execute('SELECT * FROM bindings WHERE connection_id=?',(connection_id,)).fetchone()
                if row:
                    p.require(row['intent']==_encoded(intent) and row['consent'] in (None,_encoded(consent)) and
                        row['generation']<=public['revocation_generation'] and row['as_of']<=value['as_of'],'recovered original receipt regressed or changed')
                    if row['shared'] is not None:p.require(row['shared']==_encoded(shared),'retained signed revocation differs')
                db.execute('INSERT OR IGNORE INTO owner VALUES(1,?)',(_encoded(value['owner']),))
                db.execute('INSERT OR IGNORE INTO bindings(intent_id,connection_id,intent) VALUES(?,?,?)',
                    (binding['intent_id'],connection_id,_encoded(intent)))
                db.execute('UPDATE bindings SET consent=?,generation=?,as_of=?,shared=? WHERE connection_id=?',
                    (_encoded(consent),public['revocation_generation'],value['as_of'],_encoded(shared) if public['state']=='REVOKED' else None,connection_id))
            return reply

    def pending(self,*,limit=50):
        p.integer(limit,1,50)
        with self.store.transaction() as db:
            rows=db.execute("SELECT game_id,operation,key,request,last_contact FROM requests WHERE last_contact!='ACKNOWLEDGED' ORDER BY namespace LIMIT ?",(limit,)).fetchall()
            return [{'game_id':r[0],'operation':r[1],'key':r[2],'request_sha256':hashlib.sha256(r[3].encode()).hexdigest(),'last_contact':r[4]} for r in rows]

    def begin_connection(self,game,key,proof_transport):
        p.require(game in self.games,'registered synthetic game required');p.identifier(key,128);client=self.connections[game]
        with self.locks[game]:
            with client.store.transaction() as db:
                prior=db.execute("SELECT key FROM requests WHERE operation='game.connection.begin' ORDER BY rowid LIMIT 1").fetchone()
            if prior:return client.retry('game.connection.begin',prior[0])
            request={'v':1,'op':'connection.proof','key':key,'audience':self.transport.authority_id,'scopes':list(p.SCOPES)}
            with self.store.transaction() as db:
                old=db.execute('SELECT request,proof FROM player_proofs WHERE game_id=? AND key=?',(game,key)).fetchone()
                p.require(old is None or old[0]==_encoded(request),'player proof key changed')
                if old is None:db.execute('INSERT INTO player_proofs VALUES (?,?,?,NULL)',(game,key,_encoded(request)))
            reply=proof_transport.exchange(request)
            p.require(reply.get('ok') is True,'current public player session proof unavailable');proof=reply['result']
            p.verify_proof(proof,self.connection_keys,self.games[game],audience=self.transport.authority_id,now=int(self.clock()))
            with self.store.transaction() as db:
                old=db.execute('SELECT proof FROM player_proofs WHERE game_id=? AND key=?',(game,key)).fetchone()
                p.require(old[0] is None or old[0]==_encoded(proof),'player proof changed its retained request')
                db.execute('UPDATE player_proofs SET proof=? WHERE game_id=? AND key=?',(_encoded(proof),game,key))
            return client.dispatch({'v':1,'op':'game.connection.begin','key':key,'proof':proof,'scopes':list(p.SCOPES),
                'terms_version':p.TERMS,'connection_expires_at':int(self.clock())+3600})

    def import_legacy_connection_client(self,source):
        """Explicit stopped old-client import; keep original requests verbatim.

        Source remains intact and exclusively locked throughout. Repeating an
        interrupted import is exact/idempotent; no HTTP request is performed.
        Unsupported extra tables are refused for a separate reviewed migration.
        """
        source=Path(source)
        p.require(source.resolve()==source and all(source!=c.store.path for c in self.connections.values()),'distinct canonical legacy source required')
        legacy=OwnerConnectionClient(source,self.transport,games=tuple(self.games.values()),keys=self.connection_keys,clock=self.clock)
        try:
            with legacy._mutex,legacy.store.transaction() as old:
                legacy._check()
                tables={r[0] for r in old.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                p.require(tables=={'identity','owner','requests','bindings'},'unknown legacy client table requires explicit migration review')
                bindings=[dict(r) for r in old.execute('SELECT * FROM bindings ORDER BY rowid')]
                requests=[dict(r) for r in old.execute('SELECT * FROM requests ORDER BY rowid')]
                owner=old.execute('SELECT context FROM owner WHERE singleton=1').fetchone()
                maximum=old.execute('SELECT maximum_time FROM identity').fetchone()[0]
                evidence={'source_uuid':legacy.store.uuid,'transport':self.pin,'bindings':bindings,'requests':requests,
                    'owner':owner[0] if owner else None,'maximum_time':maximum}
                fingerprint=hashlib.sha256(p.canonical(evidence)).hexdigest()
                for game,client in self.connections.items():
                    selected=[r for r in bindings if _loaded(r['intent'])['binding']['game_id']==game]
                    intent_ids={r['intent_id'] for r in selected};connection_ids={r['connection_id'] for r in selected}
                    selected_requests=[]
                    for row in requests:
                        request=_loaded(row['request']);target=request.get('proof',{}).get('game_id')
                        if target==game or request.get('intent_id') in intent_ids or request.get('connection_id') in connection_ids:selected_requests.append(row)
                    with client.store.transaction() as db:
                        if owner and selected:
                            existing=db.execute('SELECT context FROM owner').fetchone()
                            p.require(existing is None or existing[0]==owner[0],'new SDK already learned another owner')
                            db.execute('INSERT OR IGNORE INTO owner VALUES (1,?)',(owner[0],))
                        for table,rows,primary in (('bindings',selected,('intent_id',)),('requests',selected_requests,('operation','key'))):
                            for row in rows:
                                where=' AND '.join(column+'=?' for column in primary)
                                existing=db.execute('SELECT * FROM '+table+' WHERE '+where,tuple(row[c] for c in primary)).fetchone()
                                p.require(existing is None or dict(existing)==row,'destination differs from exact legacy journal')
                                columns=list(row);db.execute('INSERT OR IGNORE INTO '+table+'('+','.join(columns)+') VALUES ('+','.join('?' for _ in columns)+')',tuple(row[c] for c in columns))
                        stored=db.execute('SELECT maximum_time FROM identity').fetchone()[0]
                        db.execute('UPDATE identity SET maximum_time=?',(max(stored,maximum),))
                receipt={'schema':'rock-game-sdk-legacy-import/1','source_uuid':legacy.store.uuid,'source_sha256':fingerprint,
                    'request_count':len(requests),'original_keys_preserved':True,'simulation_only':True}
                with self.store.transaction() as db:
                    previous=db.execute('SELECT receipt FROM migrations WHERE source_uuid=?',(legacy.store.uuid,)).fetchone()
                    p.require(previous is None or previous[0]==_encoded(receipt),'legacy source changed after import')
                    db.execute('INSERT OR IGNORE INTO migrations VALUES (?,?)',(legacy.store.uuid,_encoded(receipt)))
                return receipt
        finally:legacy.close()


class ReferenceAuthorClient:
    """Separate author role: quote/status only, never approval or Wallet credit."""
    def __init__(self,state,transport,*,game,wallet_authority_id,terminal_key,additional_wallet_authority_ids=()):
        from .http import GameTransport
        p.require(type(transport) is GameTransport and transport.endpoint=='/v1/game-exchange' and transport.game_id==game.game_id,
            'dedicated author TLS transport required')
        p.game_record(game);p.uuid_value(wallet_authority_id)
        p.require(type(additional_wallet_authority_ids) is tuple and len(additional_wallet_authority_ids)<=63,'explicit bounded additional Wallet authority pins required')
        for value in additional_wallet_authority_ids:p.uuid_value(value)
        authorities=(wallet_authority_id,)+additional_wallet_authority_ids
        p.require(len(set(authorities))==len(authorities),'distinct pinned Wallet authorities required')
        self.wallet_authority_ids=frozenset(authorities)
        self.transport,self.game,self.wallet_authority_id=transport,game,wallet_authority_id
        self.keys=x.KeyRegistry((terminal_key,));self.pin=transport.fingerprint;self.mutex=threading.RLock()
        configuration={'schema':'rock-game-reference-author-sdk/1','transport':self.pin,
            'game_id':game.game_id,'game_authority_id':game.game_authority_id,'wallet_authority_id':wallet_authority_id,'simulation_only':True}
        if additional_wallet_authority_ids:configuration['additional_wallet_authority_ids']=sorted(additional_wallet_authority_ids)
        self.store=PrivateStore(Path(state),configuration)
        with self.store.transaction() as db:
            db.execute('CREATE TABLE IF NOT EXISTS requests (namespace TEXT PRIMARY KEY,request TEXT NOT NULL,receipt TEXT,last_contact TEXT NOT NULL)')
            db.execute("CREATE TRIGGER IF NOT EXISTS author_requests_retained BEFORE DELETE ON requests BEGIN SELECT RAISE(ABORT,'retained author request'); END")
            db.execute("CREATE TRIGGER IF NOT EXISTS author_request_binding BEFORE UPDATE OF namespace,request ON requests BEGIN SELECT RAISE(ABORT,'immutable author request'); END")
            db.execute("CREATE TRIGGER IF NOT EXISTS author_receipt_binding BEFORE UPDATE OF receipt ON requests WHEN OLD.receipt IS NOT NULL AND NEW.receipt IS NOT OLD.receipt BEGIN SELECT RAISE(ABORT,'immutable author receipt'); END")
    def close(self):self.store.close()
    def _legacy_namespace(self,request):return hashlib.sha256(p.canonical(['reference-author-v1',self.pin,self.game.game_authority_id,self.game.game_id,request['op'],request['key']])).hexdigest()
    def _namespace(self,request):return hashlib.sha256(p.canonical(['reference-author-v2',self.pin,self.game.game_authority_id,self.game.game_id,request['connection_id'],request['op'],request['key']])).hexdigest()
    def _accept(self,request,reply):
        if reply.get('ok') is False:OwnerConnectionClient._denial(reply);return
        p.fields(reply,{'ok','result'});p.require(reply['ok'] is True,'author acknowledgement required');value=reply['result']
        if request['op']=='exchange.quote':
            p.fields(value,{'schema','quote_id','binding','quote_sha256','simulation_only'})
            p.require(value['schema']=='rock-game-exchange-author-quote/1' and value['simulation_only'] is True,'author quote projection required')
            p.digest(value['quote_sha256']);p.uuid_value(value['quote_id'])
        else:
            p.fields(value,{'schema','connection_id','exchange_id','binding','state','terminal_receipt','simulation_only'})
            p.require(value['schema']=='rock-game-exchange-author-state/1' and value['simulation_only'] is True and value['state'] in
                ('QUEUED','CONFIRMING','REVIEW_REQUIRED','COMPLETED','REVERSED','CANCELLED'),'author state projection required')
        b=x.binding(value['binding'])
        p.require(b['wallet_authority_id'] in self.wallet_authority_ids and
            (b['game_authority_id'],b['game_id'],b['connection_id'],b['exchange_id'])==
            (self.game.game_authority_id,self.game.game_id,request['connection_id'],request['exchange_id']),'author acknowledgement scope mismatch')
        if request['op']=='exchange.quote':p.require(value['quote_id']==b['quote_id'] and request['principal_minor']==b['principal_minor'],'author quote amount mismatch')
        elif value['terminal_receipt'] is not None:
            terminal=x.terminal(value['terminal_receipt']);self.keys.verify('terminal',terminal,self.game.game_authority_id)
            p.require(terminal['binding']==b and terminal['terminal_state']==('APPLIED' if value['state']=='COMPLETED' else 'REJECTED'),'author terminal scope mismatch')
    def dispatch(self,request):
        request=p.decode(p.canonical(request));x.request(request,author=True);namespace=self._namespace(request) if 'key' in request else None
        with self.mutex:
            p.require(self.transport.fingerprint==self.pin,'author transport changed');self.transport.check();self.store.check()
            if namespace:
                with self.store.transaction() as db:
                    legacy=self._legacy_namespace(request)
                    previous=db.execute('SELECT request FROM requests WHERE namespace=?',(legacy,)).fetchone()
                    if previous is not None and _loaded(previous[0])['connection_id']==request['connection_id']:
                        p.require(previous[0]==_encoded(request),'legacy author key already binds another request');namespace=legacy
                    old=db.execute('SELECT request FROM requests WHERE namespace=?',(namespace,)).fetchone()
                    p.require(old is None or old[0]==_encoded(request),'author connection/key already binds another request')
                    if old is None:
                        p.require(db.execute('SELECT count(*) FROM requests').fetchone()[0]<x.MAX_ROWS,'author SDK capacity')
                        db.execute("INSERT INTO requests VALUES (?, ?,NULL,'PREPARED')",(namespace,_encoded(request)))
            try:
                reply=p.decode(p.canonical(self.transport.exchange(request)));self._accept(request,reply)
                if namespace:
                    with self.store.transaction() as db:
                        row=db.execute('SELECT receipt FROM requests WHERE namespace=?',(namespace,)).fetchone()
                        if reply['ok']:
                            p.require(row[0] is None or row[0]==_encoded(reply),'author immutable receipt changed')
                            db.execute("UPDATE requests SET receipt=?,last_contact='ACKNOWLEDGED' WHERE namespace=?",(_encoded(reply),namespace))
                        else:db.execute("UPDATE requests SET last_contact='DENIED' WHERE namespace=?",(namespace,))
                return reply
            except (ValueError,OSError,BackendUnavailable) as exc:
                if namespace:
                    with self.store.transaction() as db:db.execute("UPDATE requests SET last_contact='UNKNOWN' WHERE namespace=?",(namespace,))
                raise ConnectionUnavailable('author result unknown; retain exact request') from exc
    def retry(self,key,*,connection_id=None):
        p.identifier(key,128)
        if connection_id is not None:p.uuid_value(connection_id)
        with self.store.transaction() as db:
            rows=db.execute('SELECT request FROM requests ORDER BY namespace LIMIT ?',(x.MAX_ROWS+1,)).fetchall()
            p.require(len(rows)<=x.MAX_ROWS,'author SDK capacity')
            found=[_loaded(row[0]) for row in rows if _loaded(row[0])['key']==key and
                (connection_id is None or _loaded(row[0])['connection_id']==connection_id)]
            p.require(len(found)==1,'one original author quote required; specify connection_id for a shared key')
        return self.dispatch(found[0])
    def pending(self,*,limit=50):
        p.integer(limit,1,50)
        with self.store.transaction() as db:
            rows=db.execute("SELECT namespace,request,last_contact FROM requests WHERE last_contact!='ACKNOWLEDGED' ORDER BY namespace LIMIT ?",(limit,)).fetchall()
            return [dict(namespace=row[0],last_contact=row[2],**{k:_loaded(row[1])[k] for k in ('connection_id','exchange_id','key')}) for row in rows]
