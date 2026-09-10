"""Owner-approved game purchases on the existing managed Wallet transaction."""
from contextlib import closing
import json
import secrets
import time
import uuid
from dataclasses import asdict

from . import protocol as p
from . import exchange_protocol as x
from . import exchange_ledger as ledger
from .connections import encoded,loaded
from .exchange_signer import PublicExchangeSigner
from wallet_auth import protocol as auth


class WalletExchanges:
    def __init__(self,runtime,peers):
        self.runtime=runtime;self.wallet=runtime._service.wallet;self.auth=runtime._service.authentication
        self.connections=runtime._games;self.gateway=self.connections.gateway;self.descriptor=runtime.descriptor
        self.peers=peers;self.workers=[]
        self.signers={kind:PublicExchangeSigner(self.descriptor.wallet_authority_id,kind)
                      for kind in ('quote','approval','apply','status','reject')}
        self.keys=x.KeyRegistry(tuple(s.record for s in self.signers.values())+tuple(peer.terminal_key for peer in peers.values()))
        with self.wallet._transaction() as db:
            p.require(ledger.installed(db),'game ledger migration must be explicitly completed before enabling exchange')

    def now(self,deadline):return self.connections.check(deadline)

    def connection(self,connection_id,deadline,*,active):
        row=self.gateway.index.get('connection_id',connection_id)
        p.require(row is not None and row['ledger_ref']==self.descriptor.ledger_ref,'owner connection unavailable')
        intent=loaded(row['intent']);pair=self.connections.synchronize(intent,deadline)
        p.require(pair is not None,'owner connection consent is required')
        consent,shared=pair
        current=shared['publication']
        if active:p.require(current['state']=='ACTIVE' and self.now(deadline)<current['expires_at'],'connection is inactive or expired')
        return intent,consent,shared

    def _scope(self,principal,request,game_id):
        return ledger.namespace('owner',[principal.device_ref,game_id],request['op'],request['key'])

    def _quote(self,connection_id,exchange_id,principal_minor,deadline):
        intent,consent,shared=self.connection(connection_id,deadline,active=True)
        now=self.now(deadline);b=intent['binding'];peer=self.peers.get(b['game_id'])
        p.require(peer is not None,'game exchange is not registered')
        binding={'wallet_authority_id':self.descriptor.wallet_authority_id,'issuer_ledger_alias':self.descriptor.ledger_uuid,
            'writer_epoch':self.descriptor.writer_epoch,'game_authority_id':b['game_authority_id'],'game_id':b['game_id'],
            'player_id':b['player_id'],'connection_id':connection_id,'connection_generation':shared['publication']['revocation_generation'],
            'exchange_id':exchange_id,'quote_id':str(uuid.uuid4()),'quote_version':1,'source_asset':'synthetic:usd','source_scale':2,
            'destination_asset':peer.asset,'destination_scale':0,'asset_class':'PURCHASED',**x.amounts(principal_minor),
            'numerator':1,'denominator':10,'rounding':'REJECT_REMAINDER','policy':x.POLICY,'terms':x.TERMS,'issued_at':now,'expires_at':now+120}
        signer=self.signers['quote']
        with self.wallet._transaction(deadline=deadline) as db:
            head=db.execute('SELECT q.quote FROM wallet_game_quote_heads h JOIN wallet_game_quotes q USING(quote_id) WHERE h.connection_id=? AND h.exchange_id=?',
                (connection_id,exchange_id)).fetchone()
            existing=db.execute('SELECT id FROM wallet_game_exchanges WHERE connection_id=? AND exchange_id=?',(connection_id,exchange_id)).fetchone()
            if head:
                old=loaded(head[0]);old_binding=old['binding']
                if existing is not None or old_binding['expires_at']>now:
                    p.require(old_binding['principal_minor']==principal_minor,'exchange already has a different quote')
                    return old
                binding['quote_version']=old_binding['quote_version']+1
            p.require(db.execute('SELECT count(*) FROM wallet_game_quotes').fetchone()[0]<x.MAX_ROWS,'quote capacity')
            value=signer.sign({'schema':'rock-game-exchange-quote/1','environment':'synthetic','binding':binding,
                'binding_sha256':x.binding_digest(binding),'owner_ref':self.descriptor.owner_ref,'account_id':b['account_id'],
                'simulation_only':True,**signer.fields()})
            db.execute('INSERT INTO wallet_game_quotes VALUES (?,?,?,?,?)',(binding['quote_id'],connection_id,exchange_id,binding['quote_version'],encoded(value)))
            db.execute('INSERT INTO wallet_game_quote_heads VALUES (?,?,?) ON CONFLICT(connection_id,exchange_id) DO UPDATE SET quote_id=excluded.quote_id',
                       (connection_id,exchange_id,binding['quote_id']))
            return value

    def owner(self,principal,request,context,*,deadline):
        x.request(request);op=request['op'];self.now(deadline)
        # Current device and credential are checked before retained receipts.
        with self.wallet._transaction(deadline=deadline) as db:
            credential=self.auth._credential(db,context)
            p.require(credential is not None and credential['revoked_at'] is None,'current enrolled owner credential required')
        if op in ('game.exchange.quote','game.exchange.approval.begin','game.exchange.approve','game.sandbox.credit'):
            self.auth.require_active(context)
        if op=='game.sandbox.credit':return {'ok':True,'result':self.fixture_credit(request,context,deadline)}
        if op=='game.exchange.connection':
            intent,consent,shared=self.connection(request['connection_id'],deadline,active=False)
            owner=p.OwnerContext(self.descriptor.wallet_authority_id,self.descriptor.owner_ref,context.owner_id,principal.device_ref,principal.credential_revision)
            p.admit_intent_action(intent,owner,'status',now=self.now(deadline))
            return {'ok':True,'result':{'schema':'rock-game-exchange-connection/1','owner':asdict(owner),
                'intent':intent,'consent':consent,'shared':shared,'as_of':self.now(deadline),'simulation_only':True}}
        if op=='game.exchange.list':return {'ok':True,'result':self.list(request,deadline)}
        if op=='game.exchange.quote':
            row=self.gateway.index.get('connection_id',request['connection_id'])
            p.require(row is not None and row['ledger_ref']==self.descriptor.ledger_ref,'owner connection unavailable')
            scope=self._scope(principal,request,row['game_id'])
            with self.wallet._transaction(deadline=deadline) as db:old=ledger.cached(db,scope,request)
            if old is not None:return {'ok':True,'result':old}
            value=self._quote(request['connection_id'],request['exchange_id'],request['principal_minor'],deadline)
            with self.wallet._transaction(deadline=deadline) as db:ledger.remember(db,scope,request,value)
            return {'ok':True,'result':value}
        if op=='game.exchange.approval.begin':return {'ok':True,'result':self.begin(principal,request,context,deadline)}
        if op=='game.exchange.approve':return {'ok':True,'result':self.approve(principal,request,context,deadline)}
        self.connection(request['connection_id'],deadline,active=False)
        with self.wallet._transaction(deadline=deadline) as db:
            row=self.row(db,request['connection_id'],request['exchange_id'])
            scope=None
            if op in ('game.exchange.cancel','game.exchange.reconcile'):
                quote=loaded(db.execute('SELECT quote FROM wallet_game_quotes WHERE quote_id=?',(row['quote_id'],)).fetchone()[0])
                scope=self._scope(principal,request,quote['binding']['game_id'])
                old=ledger.cached(db,scope,request)
                if old is not None: return {'ok':True,'result':old}
            if op in ('game.exchange.cancel','game.exchange.reconcile') and row['state'] not in ('COMPLETED','REVERSED','CANCELLED'):
                if op=='game.exchange.cancel' and not ledger.cancel_unsent(db,self.wallet,row):
                    db.execute('UPDATE wallet_game_outbox SET cancel_requested=1,next_at=0 WHERE exchange_row=?',(row['id'],))
                    db.execute("UPDATE wallet_game_exchanges SET state='CONFIRMING' WHERE id=?",(row['id'],))
                elif op=='game.exchange.reconcile':
                    db.execute('UPDATE wallet_game_outbox SET next_at=0 WHERE exchange_row=?',(row['id'],))
                row=self.row(db,request['connection_id'],request['exchange_id'])
            result=self.project(db,row)
            if scope is not None: ledger.remember(db,scope,request,result)
        self.wake();return {'ok':True,'result':result}

    def fixture_credit(self,request,context,deadline):
        # This separate, visibly public-fixture operation is one explicit fixed
        # credit per owner. It is not available to either Game author credential.
        p.require(request['amount_minor']==10000,'fixed public fixture amount required')
        scope=ledger.namespace('public-fixture',[self.descriptor.owner_ref],'game.sandbox.credit','one-credit-v1')
        with self.wallet._transaction(deadline=deadline) as db:
            row=db.execute('SELECT result FROM wallet_game_exchange_requests WHERE namespace=?',(scope,)).fetchone()
            if row:return loaded(row[0])
        sale=self.wallet.simulate_sale(10000,'game-public-fixture-credit-v1')
        settled=self.wallet.settle_sale(sale['id'],'game-public-fixture-settle-v1')
        p.require(settled['status']=='SETTLED','fixture settlement unresolved')
        result={'schema':'rock-game-sandbox-credit/1','amount_minor':10000,'sale_id':sale['id'],'settled':True,'simulation_only':True}
        with self.wallet._transaction(deadline=deadline) as db:ledger.remember(db,scope,request,result)
        return result

    def author(self,principal,request,deadline):
        x.request(request,author=True)
        intent,_,_=self.connection(request['connection_id'],deadline,active=request['op']=='exchange.quote')
        p.require((intent['binding']['game_authority_id'],intent['binding']['game_id'])==
            (principal.game_authority_id,principal.game_id),'author game binding mismatch')
        if request['op']=='exchange.quote':
            namespace=ledger.namespace('author',[principal.game_authority_id,principal.game_id,principal.revision],request['op'],request['key'])
            with self.wallet._transaction(deadline=deadline) as db:old=ledger.cached(db,namespace,request)
            if old is not None:return {'ok':True,'result':old}
            quote=self._quote(request['connection_id'],request['exchange_id'],request['principal_minor'],deadline)
            result=x.author_projection(quote)
            with self.wallet._transaction(deadline=deadline) as db:ledger.remember(db,namespace,request,result)
            return {'ok':True,'result':result}
        with self.wallet._transaction(deadline=deadline) as db:
            row=self.row(db,request['connection_id'],request['exchange_id']);state=self.project(db,row)
            return {'ok':True,'result':{'schema':'rock-game-exchange-author-state/1','connection_id':row['connection_id'],
                'exchange_id':row['exchange_id'],'binding':state['quote']['binding'],'state':row['state'],
                'terminal_receipt':state['terminal_receipt'],'simulation_only':True}}

    def begin(self,principal,request,context,deadline):
        now=self.now(deadline)
        with self.wallet._transaction(deadline=deadline) as db:
            row=db.execute('SELECT quote FROM wallet_game_quotes WHERE quote_id=?',(request['quote_id'],)).fetchone()
            p.require(row is not None,'owner quote unavailable');quote=loaded(row[0]);b=quote['binding']
            scope=self._scope(principal,request,b['game_id']);old=ledger.cached(db,scope,request)
            if old is not None:return old
            p.require(quote['account_id']==context.owner_id and quote['owner_ref']==self.descriptor.owner_ref,'owner quote mismatch')
            p.require(b['expires_at']>now,'quote expired; request an explicit new quote version')
            p.require(db.execute('SELECT quote_id FROM wallet_game_quote_heads WHERE connection_id=? AND exchange_id=?',(b['connection_id'],b['exchange_id'])).fetchone()[0]==b['quote_id'],
                      'quote was superseded')
            p.require(db.execute('SELECT 1 FROM wallet_game_exchanges WHERE connection_id=? AND exchange_id=?',(b['connection_id'],b['exchange_id'])).fetchone() is None,'exchange already reserved')
            prior=db.execute("SELECT intent FROM wallet_game_exchange_attempts WHERE quote_id=? AND status='OPEN'",(b['quote_id'],)).fetchone()
            if prior:
                value=loaded(prior[0]);p.require((value['device_ref'],value['device_credential_revision'])==(principal.device_ref,principal.credential_revision),
                    'active purchase attempt belongs to another device')
                return ledger.remember(db,scope,request,value)
            credential=self.auth._credential(db,context)
            value={'schema':'rock-game-exchange-approval-intent/1','environment':'synthetic','attempt_id':str(uuid.uuid4()),
                'quote':quote,'quote_sha256':x.quote_digest(quote),'device_ref':principal.device_ref,
                'device_credential_revision':principal.credential_revision,'credential_id':credential['credential_id'],
                'issued_at':now,'expires_at':b['expires_at'],'options':{'schema_version':1,'device_ref':principal.device_ref,
                    'purpose':'wallet.game.exchange','publicKey':{'challenge':p.b64(secrets.token_bytes(32)),
                        'timeout':(b['expires_at']-now)*1000,'rpId':auth.RP_ID,'allowCredentials':[{'type':'public-key','id':credential['credential_id']}],
                        'userVerification':'required'}},'simulation_only':True}
            x.intent(value)
            p.require(db.execute('SELECT count(*) FROM wallet_game_exchange_attempts').fetchone()[0]<x.MAX_ROWS,'approval attempt capacity')
            db.execute("INSERT INTO wallet_game_exchange_attempts VALUES (?,?,?,'OPEN')",(value['attempt_id'],b['quote_id'],encoded(value)))
            return ledger.remember(db,scope,request,value)

    def approve(self,principal,request,context,deadline):
        self.auth._observe_time()
        # Synchronize index/Wallet publication before opening the atomic approval
        # transaction. The caller holds C and the author gate throughout.
        with self.wallet._transaction(deadline=deadline) as db:
            found=db.execute('SELECT intent FROM wallet_game_exchange_attempts WHERE attempt_id=?',(request['attempt_id'],)).fetchone()
            p.require(found is not None,'owner approval attempt unavailable')
            connection_id=loaded(found[0])['quote']['binding']['connection_id']
        _,_,head=self.connection(connection_id,deadline,active=False)
        with self.wallet._transaction(deadline=deadline) as db:
            row=db.execute('SELECT * FROM wallet_game_exchange_attempts WHERE attempt_id=?',(request['attempt_id'],)).fetchone()
            p.require(row is not None,'owner approval attempt unavailable')
            intent=x.intent(loaded(row['intent']));quote=intent['quote'];b=quote['binding']
            p.require(intent['device_ref']==principal.device_ref and intent['device_credential_revision']==principal.credential_revision and
                quote['account_id']==context.owner_id and request['quote_sha256']==intent['quote_sha256'],'approval device/quote mismatch')
            scope=self._scope(principal,request,b['game_id']);old=ledger.cached(db,scope,request)
            if old is not None:return old
            p.require(row['status']=='OPEN','approval attempt already has a different immutable request')
            credential=self.auth._credential(db,context)
            p.require(credential is not None and credential['revoked_at'] is None and credential['credential_id']==intent['credential_id'],'current original owner credential required')
            updated=auth.verify_assertion(request['credential'],challenge=intent['options']['publicKey']['challenge'],rp_id=auth.RP_ID,
                origin=auth.ORIGIN,record=json.loads(credential['current_record']),user_handle=self.auth._user_handle(context.owner_id))
            # A correctly signed denial consumes counter/challenge and commits
            # an immutable receipt. It never becomes approval after a top-up.
            now=self.now(deadline);reason=None
            if now>=intent['expires_at']:reason='QUOTE_EXPIRED'
            elif b['writer_epoch']!=self.descriptor.writer_epoch or db.execute('SELECT quote_id FROM wallet_game_quote_heads WHERE connection_id=? AND exchange_id=?',(b['connection_id'],b['exchange_id'])).fetchone()[0]!=b['quote_id']:
                reason='QUOTE_SUPERSEDED'
            else:
                if head['publication']['state']!='ACTIVE' or head['publication']['revocation_generation']!=b['connection_generation'] or now>=head['publication']['expires_at']:
                    reason='CONNECTION_INACTIVE'
                elif self.wallet._balances(db)['AVAILABLE']<b['total_minor']:reason='INSUFFICIENT_FUNDS'
            p.require(db.execute('SELECT 1 FROM wallet_game_exchanges WHERE connection_id=? AND exchange_id=?',(b['connection_id'],b['exchange_id'])).fetchone() is None,
                      'exchange has already been approved')
            self.auth._time(db)
            signer=self.signers['approval']
            receipt=signer.sign({'schema':'rock-game-exchange-approval-receipt/1','environment':'synthetic','attempt_id':intent['attempt_id'],
                'quote_id':b['quote_id'],'binding_sha256':quote['binding_sha256'],'quote_sha256':intent['quote_sha256'],
                'device_ref':principal.device_ref,'device_credential_revision':principal.credential_revision,
                'owner_credential_id':credential['credential_id'],'sign_count':updated['sign_count'],'request_sha256':x.request_digest(request),
                'decision':'DENIED' if reason else 'APPROVED','reason':reason,'hold_id':None if reason else str(uuid.uuid4()),
                'outbox_id':None if reason else str(uuid.uuid4()),'committed_at':now,'simulation_only':True,**signer.fields()})
            db.execute('UPDATE wallet_auth_credential_state SET record_json=? WHERE credential_id=?',
                (json.dumps(updated,sort_keys=True,separators=(',',':')),credential['credential_id']))
            db.execute('UPDATE wallet_game_exchange_attempts SET status=? WHERE attempt_id=?',(receipt['decision'],intent['attempt_id']))
            if not reason:
                signer=self.signers['apply']
                command=signer.sign({'schema':'rock-game-grant-apply/1','environment':'synthetic','operation':'grant.apply',
                    'command_id':receipt['outbox_id'],'key':'apply:'+receipt['outbox_id'],'binding':b,'binding_sha256':quote['binding_sha256'],
                    'quote_sha256':intent['quote_sha256'],'approval_sha256':x.approval_digest(receipt),'issued_at':now,'simulation_only':True,**signer.fields()})
                ledger.reserve(db,self.wallet,quote,receipt,command)
            ledger.remember(db,scope,request,receipt)
        self.wake();return receipt

    @staticmethod
    def row(db,connection_id,exchange_id):
        row=db.execute('SELECT * FROM wallet_game_exchanges WHERE connection_id=? AND exchange_id=?',(connection_id,exchange_id)).fetchone()
        p.require(row is not None,'owner exchange unavailable');return row

    def project(self,db,row):
        quote=loaded(db.execute('SELECT quote FROM wallet_game_quotes WHERE quote_id=?',(row['quote_id'],)).fetchone()[0])
        terminal=db.execute('SELECT receipt FROM wallet_game_exchange_receipts WHERE exchange_row=?',(row['id'],)).fetchone()
        return {'schema':'rock-game-exchange-state/1','id':row['id'],'connection_id':row['connection_id'],'exchange_id':row['exchange_id'],
            'quote':quote,'state':row['state'],'held_minor':row['held_minor'],'committed_minor':row['committed_minor'],
            'released_minor':row['released_minor'],'approval':loaded(row['approval']),
            'terminal_receipt':loaded(terminal[0]) if terminal else None,'simulation_only':True}

    def list(self,request,deadline):
        with self.wallet._transaction(deadline=deadline) as db:
            rows=db.execute('SELECT * FROM wallet_game_exchanges WHERE id>? ORDER BY id LIMIT ?',
                (request['after'] or '',request['limit']+1)).fetchall()
            result=[]
            for row in rows[:request['limit']]:
                candidate=result+[self.project(db,row)]
                if len(p.canonical({'items':candidate}))>48000:break
                result=candidate
            return {'schema':'rock-game-exchange-list/1','items':result,
                'next_after':result[-1]['id'] if len(rows)>len(result) else None,'simulation_only':True}

    def admit_first_apply(self,db,row,apply,deadline):
        # Called only beneath C -> author gate -> this Wallet transaction.
        # Revocation and first dispatch claim are serialized; no network or
        # automatic hold release occurs here. An already claimed authorization
        # remains resolvable through its original command and terminal receipt.
        from types import SimpleNamespace
        from wallet_backend.runtime_contracts import AuthenticatedDevicePrincipal,RuntimeAdmissionRejected
        self.runtime._hooks.require_held();d=self.descriptor;b=apply['binding'];now=self.now(deadline)
        approval=x.approval(loaded(row['approval']));self.keys.verify('approval',approval,d.wallet_authority_id)
        quote=x.quote(loaded(db.execute('SELECT quote FROM wallet_game_quotes WHERE quote_id=?',(row['quote_id'],)).fetchone()[0]))
        self.keys.verify('quote',quote,d.wallet_authority_id)
        p.require(apply['approval_sha256']==x.approval_digest(approval) and quote['binding']==b,'original approval/quote required for first claim')
        head=db.execute('SELECT shared FROM wallet_game_heads WHERE connection_id=?',(b['connection_id'],)).fetchone()
        p.require(head is not None,'original committed connection head required')
        public=p.verify_shared(loaded(head[0]),self.gateway.keys,now=now)['publication']
        p.require(all(public[k]==b[k] for k in ('wallet_authority_id','game_authority_id','game_id','connection_id','player_id')),'claim connection identity mismatch')
        if public['state']!='ACTIVE' or public['revocation_generation']!=b['connection_generation'] or now>=public['expires_at']:return False
        context=SimpleNamespace(device_id=approval['device_ref'],owner_id=quote['account_id'])
        credential=self.auth._credential(db,context)
        if credential is None or credential['credential_id']!=approval['owner_credential_id'] or credential['revoked_at'] is not None or not self.auth._terms(db,context.owner_id):return False
        principal=AuthenticatedDevicePrincipal(d.ledger_ref,d.owner_actor,d.owner_ref,approval['device_ref'],approval['device_credential_revision'])
        try:self.runtime._verifier.assert_current(principal,d)
        except RuntimeAdmissionRejected:return False
        game=self.gateway.game(b['game_authority_id'],b['game_id'])
        author=p.GamePrincipal(game.author_id,game.game_authority_id,game.game_id,game.revision,game.scopes,1893456000,False)
        try:self.gateway.current_author(author)
        except p.ProtocolError:return False
        return True

    def wake(self):
        for worker in self.workers:worker.wake()

    def close(self):
        for worker in self.workers:worker.stop()
        for worker in self.workers:worker.join()
