"""Durable bounded claims; external Game I/O never owns a Wallet/C lock."""
from contextlib import closing
from dataclasses import dataclass,field
import hashlib
import threading
import time
import uuid
from blackberryrock.deadline import scope
from . import protocol as p
from . import exchange_protocol as x
from . import exchange_ledger as ledger
from .connections import encoded,loaded

@dataclass
class GamePeer:
    game_id:str
    asset:str
    terminal_key:object
    transport:object
    gate:object=field(default_factory=threading.Lock)

class ExchangeWorker(threading.Thread):
    def __init__(self,service,peer):
        super().__init__(name='game-exchange-'+peer.game_id,daemon=False)
        self.service,self.peer=service,peer;self.signal=threading.Event();self.stopping=threading.Event()
    def wake(self):self.signal.set()
    def stop(self):self.stopping.set();self.signal.set()
    def join(self,timeout=4):
        super().join(timeout)
        if self.is_alive():raise RuntimeError('Game worker still owns its original lifetime; retain writer')
    def run(self):
        while not self.stopping.is_set():
            try:worked=self.once()
            except Exception:worked=False
            if not worked:self.signal.wait(.2);self.signal.clear()

    def claim(self,deadline):
        service=self.service;runtime=service.runtime
        with scope(deadline),runtime.admit_write(runtime.descriptor.writer_epoch,deadline=deadline),service.wallet._transaction(deadline=deadline) as db:
            # Reading no jobs does not mutate the remote authority clock or rows.
            now=p.integer(int(service.gateway.clock()),1)
            rows=db.execute("SELECT e.*,o.state AS outbox_state,o.cancel_requested,o.attempts,o.next_at,o.apply_bytes FROM wallet_game_exchanges e JOIN wallet_game_outbox o ON o.exchange_row=e.id WHERE o.state!='TERMINAL' AND o.next_at<=? ORDER BY o.next_at,e.id",(now,)).fetchall()
            row=next((r for r in rows if loaded(r['command'])['binding']['game_id']==self.peer.game_id),None)
            if row is None:return None
            apply=x.command(p.decode(bytes(row['apply_bytes'])))
            p.require(apply==loaded(row['command']),'outbox exact original command bytes differ')
            if row['cancel_requested']:kind='reject'
            elif row['outbox_state']=='UNSENT':kind='apply'
            else:
                previous=db.execute('SELECT operation,result FROM wallet_game_exchange_claims WHERE exchange_row=? ORDER BY rowid DESC LIMIT 1',(row['id'],)).fetchone()
                kind='apply' if previous and previous['operation']=='status' and previous['result']=='"NOT_FOUND"' else 'status'
            if kind=='apply' and apply['binding']['writer_epoch']!=runtime.descriptor.writer_epoch:
                # A restored writer never re-signs or replays an old apply.
                # The current-epoch conditional rejection either recovers an
                # existing APPLIED receipt or writes a permanent tombstone.
                kind='reject'
            if kind=='apply':request=apply
            else:
                signer=service.signers[kind]
                request=signer.sign({'schema':'rock-game-grant-'+kind+'/1','environment':'synthetic',
                    'operation':'grant.reject_if_unapplied' if kind=='reject' else 'grant.status','apply':apply,
                    'apply_sha256':x.command_digest(apply),'current_epoch':runtime.descriptor.writer_epoch,'issued_at':now,
                    'simulation_only':True,**signer.fields()})
            claim_id=str(uuid.uuid4())
            p.require(db.execute('SELECT count(*) FROM wallet_game_exchange_claims').fetchone()[0]<x.MAX_ROWS*16,'claim capacity')
            db.execute('INSERT INTO wallet_game_exchange_claims VALUES (?,?,?,?,?,?,NULL)',
                (claim_id,row['id'],kind,p.canonical(request),runtime.descriptor.writer_epoch,now))
            db.execute("UPDATE wallet_game_outbox SET state='DISPATCH_POSSIBLE',attempts=attempts+1,next_at=? WHERE exchange_row=?",(now+4,row['id']))
            db.execute("UPDATE wallet_game_exchanges SET state='CONFIRMING' WHERE id=?",(row['id'],))
            ledger.event(db,row['id'],'DISPATCH_CLAIMED',{'claim_id':claim_id,'operation':kind,'writer_epoch':runtime.descriptor.writer_epoch})
            return {'id':claim_id,'exchange_row':row['id'],'request':request,'operation':kind,'apply':apply,'epoch':runtime.descriptor.writer_epoch,'attempt':row['attempts']+1}

    def once(self):
        # This peer gate serializes actual external calls across owner runtimes;
        # it is never acquired beneath a C/index/Wallet/Entitlement lock.
        if self.stopping.is_set() or not self.peer.gate.acquire(blocking=False):return False
        try:
            deadline=time.monotonic()+3;claim=self.claim(deadline)
            if claim is None:return False
            runtime=self.service.runtime
            p.require(not runtime._hooks.held_by_current_thread(),'external Game I/O cannot hold a C ticket')
            try:response=self.peer.transport.exchange(claim['request'],deadline=deadline)
            except Exception:response=None
            # A spent transport budget has no permission to commit later.
            # The durable claim remains unresolved; a fresh bounded attempt
            # reads Game status and preserves the hold meanwhile.
            if time.monotonic()>=deadline or self.stopping.is_set():return True
            self.complete(claim,response,deadline);return True
        finally:self.peer.gate.release()

    def complete(self,claim,response,deadline):
        service=self.service;runtime=service.runtime;outcome='UNKNOWN';terminal=None
        if type(response) is dict and response.get('ok') is True:
            value=response.get('result')
            if type(value) is dict and value.get('schema')=='rock-game-grant-receipt/1':
                try:terminal=x.match_terminal(value,claim['apply'],service.keys);outcome='TERMINAL'
                except (ValueError,PermissionError):outcome='UNVERIFIABLE'
            elif type(value) is dict and value=={'schema':'rock-game-grant-lookup/1','state':'NOT_FOUND',
                    'apply_sha256':x.command_digest(claim['apply']),'simulation_only':True} and claim['operation']=='status':
                outcome='NOT_FOUND'
            else:outcome='UNVERIFIABLE'
        with scope(deadline),runtime.admit_write(claim['epoch'],deadline=deadline),service.wallet._transaction(deadline=deadline) as db:
            stored=db.execute('SELECT * FROM wallet_game_exchange_claims WHERE id=?',(claim['id'],)).fetchone()
            p.require(stored is not None and bytes(stored['request_bytes'])==p.canonical(claim['request']) and stored['writer_epoch']==claim['epoch'],
                      'original durable claim required')
            if stored['result'] is not None:return
            row=db.execute('SELECT * FROM wallet_game_exchanges WHERE id=?',(claim['exchange_row'],)).fetchone()
            p.require(row is not None,'original held exchange required')
            if terminal is not None:ledger.finish(db,service.wallet,row,terminal,service.keys)
            else:
                now=p.integer(int(service.gateway.clock()),1);review=outcome=='UNVERIFIABLE' or claim['attempt']>=5
                db.execute('UPDATE wallet_game_outbox SET next_at=? WHERE exchange_row=?',(p.MAX_INT if review else now+1,row['id']))
                db.execute('UPDATE wallet_game_exchanges SET state=? WHERE id=?',('REVIEW_REQUIRED' if review else 'CONFIRMING',row['id']))
                ledger.event(db,row['id'],outcome,{'claim_id':claim['id'],'hold_retained':True})
            db.execute('UPDATE wallet_game_exchange_claims SET result=? WHERE id=?',(encoded(outcome),claim['id']))
