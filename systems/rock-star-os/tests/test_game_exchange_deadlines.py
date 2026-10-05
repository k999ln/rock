"""Actual TLS stalled Game A cannot retain Wallet/C locks or block Game B/ATM."""
import copy
import json
import ssl
import threading
import time
import unittest
from unittest.mock import patch
import test_game_reference_sdk as support
from game_exchange import protocol as p
from game_exchange.http import GameTransport
from wallet_backend.client import BackendUnavailable

class IndependentGameDeadlines(unittest.TestCase):
    def setUp(self):
        self.case=support.ReferenceSDK();self.case.setUp();self.addCleanup(self.case.doCleanups);self.f=self.case.f

    def last_claim_result(self,worker):
        runtime=worker.service.runtime
        with runtime.admit_write(runtime.descriptor.writer_epoch),runtime._service.wallet._transaction() as db:
            row=db.execute('SELECT operation,result FROM wallet_game_exchange_claims ORDER BY rowid DESC LIMIT 1').fetchone()
        self.assertIsNotNone(row,'a durable Game claim must exist')
        return row['operation'],json.loads(row['result']) if row['result'] is not None else None

    def test_actual_stalled_tls_keeps_hold_while_other_game_and_atm_finish(self):
        a=self.case.connect('a');b=self.case.connect('b');self.case.purchase('a',a);self.case.purchase('b',b)
        worker=self.case.workers['a'];grant=self.f.grants['a'];original=grant.dispatch
        entered=threading.Event();release=threading.Event();finished=threading.Event();results=[];errors=[]
        def stall(request,*,deadline):
            entered.set()
            try:
                if not release.wait(4):raise TimeoutError('test stalled TLS peer deadline')
                # This case proves the unapplied recovery path. A released
                # server may still have budget after its client's deadline.
                raise TimeoutError('test stalled TLS request remains unapplied')
            finally:finished.set()
        grant.dispatch=stall
        def run():
            before=time.monotonic()
            try:results.append((worker.once(),time.monotonic()-before))
            except BaseException as exc:errors.append(exc)
        thread=threading.Thread(target=run);thread.start()
        try:
            self.assertTrue(entered.wait(2))
            started=time.monotonic();self.assertTrue(self.case.workers['b'].once())
            issued=support.support.gx.GameConnectionsTLS.issue(self.f,support.A1,1000,key='atm-during-stall')
            snapshot=self.f.call(support.A1,'snapshot')
            self.assertEqual(snapshot['held_minor'],1000)
            self.f.call(support.A1,'wallet.atm.cancel',key='cancel-during-stall',withdrawal_id=issued['withdrawal_id'])
            self.assertLess(time.monotonic()-started,2)
            self.assertFalse(finished.is_set(),'independent actions must finish while Game A remains stalled')
            self.assertEqual(self.f.grants['b'].balance('alice'),10)
            self.assertEqual(self.f.balances()['GAME_HOLD'],103)
            thread.join(3.5);self.assertFalse(thread.is_alive());self.assertEqual(errors,[])
            self.assertTrue(results[0][0]);self.assertGreaterEqual(results[0][1],2.5);self.assertLess(results[0][1],3.4)
            state=self.case.sdk.dispatch('public-game-a',{'v':1,'op':'game.exchange.status','connection_id':a,'exchange_id':'same-external'})['result']
            self.assertEqual((state['state'],state['held_minor'],state['released_minor']),('CONFIRMING',103,0))
            self.assertEqual(self.f.balances()['AVAILABLE'],4794) # exactly two 103 holds/settlements; ATM fee zero
        finally:
            release.set();thread.join(4);self.assertFalse(thread.is_alive());self.assertTrue(finished.wait(2));grant.dispatch=original
        self.f.now+=5
        self.assertTrue(worker.once()) # real NOT_FOUND keeps hold
        self.assertEqual(self.last_claim_result(worker),('status','NOT_FOUND'))
        self.assertEqual(self.f.balances()['GAME_HOLD'],103)
        self.f.now+=2;self.assertTrue(worker.once()) # original apply, one durable grant
        self.assertEqual(self.last_claim_result(worker),('apply','TERMINAL'))
        self.assertEqual(self.f.grants['a'].balance('alice'),10);self.assertEqual(self.f.balances()['GAME_HOLD'],0)

    def test_unknown_status_preserves_hold_until_verified_not_found_and_exact_apply(self):
        connection=self.case.connect('a');self.case.purchase('a',connection)
        worker=self.case.workers['a'];grant=self.f.grants['a']
        apply=worker.claim(time.monotonic()+3) # durable original claim, deliberately not sent
        self.assertEqual(apply['operation'],'apply')
        original_apply=p.canonical(apply['request'])
        self.assertEqual(self.last_claim_result(worker),('apply',None))
        self.assertEqual(self.f.balances()['GAME_HOLD'],103);self.assertEqual(grant.balance('alice'),0)
        original=worker.peer.transport.exchange;attempts=[];sent=[]
        def unavailable_once(request,*,deadline):
            attempts.append(request['operation'])
            if len(attempts)==1:
                self.assertEqual(request['operation'],'grant.status')
                raise BackendUnavailable('synthetic status unavailable before send')
            sent.append(request['operation'])
            if request['operation']=='grant.apply':
                self.assertTrue(p.canonical(request)==original_apply,'recovery must resend the exact original apply bytes')
            return original(request,deadline=deadline)
        with patch.object(worker.peer.transport,'exchange',side_effect=unavailable_once):
            self.f.now+=5;self.assertTrue(worker.once())
            self.assertEqual(self.last_claim_result(worker),('status','UNKNOWN'))
            self.assertEqual(self.f.balances()['GAME_HOLD'],103);self.assertEqual(grant.balance('alice'),0)
            self.f.now+=2;self.assertTrue(worker.once())
            self.assertEqual(self.last_claim_result(worker),('status','NOT_FOUND'))
            self.assertEqual(self.f.balances()['GAME_HOLD'],103);self.assertEqual(grant.balance('alice'),0)
            self.f.now+=2;self.assertTrue(worker.once())
            self.assertEqual(self.last_claim_result(worker),('apply','TERMINAL'))
            self.assertEqual(self.f.balances()['GAME_HOLD'],0);self.assertEqual(grant.balance('alice'),10)
            self.f.now+=2;self.assertFalse(worker.once())
        self.assertEqual(attempts,['grant.status','grant.status','grant.apply'])
        self.assertEqual(sent,['grant.status','grant.apply'])
        self.assertEqual(self.last_claim_result(worker),('apply','TERMINAL'))
        self.assertEqual(self.f.balances()['GAME_HOLD'],0);self.assertEqual(grant.balance('alice'),10)
        with grant.store.transaction() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM asset_journals').fetchone()[0],1)

    def test_late_exact_apply_is_reconciled_by_status_without_second_grant(self):
        connection=self.case.connect('a');self.case.purchase('a',connection)
        worker=self.case.workers['a'];grant=self.f.grants['a']
        original=worker.peer.transport.exchange;captured=[];attempts=[];sent=[]
        def outcome_unknown(request,*,deadline):
            attempts.append(request['operation'])
            if len(attempts)==1:
                self.assertEqual(request['operation'],'grant.apply')
                captured.append(copy.deepcopy(request))
                raise TimeoutError('synthetic original apply outcome unresolved')
            sent.append(request['operation'])
            return original(request,deadline=deadline)
        with patch.object(worker.peer.transport,'exchange',side_effect=outcome_unknown):
            self.assertTrue(worker.once())
            self.assertEqual(self.last_claim_result(worker),('apply','UNKNOWN'))
            self.assertEqual(self.f.balances()['GAME_HOLD'],103);self.assertEqual(grant.balance('alice'),0)
            self.assertEqual(len(captured),1)
            # Controlled ordering: the original request reaches the actual
            # authority after the client has already retained UNKNOWN.
            receipt=grant.dispatch(captured[0],deadline=time.monotonic()+3)
            self.assertTrue(receipt['ok']);self.assertEqual(receipt['result']['terminal_state'],'APPLIED')
            self.assertEqual(self.f.balances()['GAME_HOLD'],103);self.assertEqual(grant.balance('alice'),10)
            self.f.now+=5;self.assertTrue(worker.once()) # real TLS status recovers the original terminal
            self.assertEqual(self.last_claim_result(worker),('status','TERMINAL'))
            self.assertEqual(self.f.balances()['GAME_HOLD'],0);self.assertEqual(grant.balance('alice'),10)
            self.f.now+=2;self.assertFalse(worker.once())
        self.assertEqual(attempts,['grant.apply','grant.status']);self.assertEqual(sent,['grant.status'])
        state=self.case.sdk.dispatch('public-game-a',{'v':1,'op':'game.exchange.status',
            'connection_id':connection,'exchange_id':'same-external'})['result']
        self.assertEqual(state['state'],'COMPLETED')
        self.assertEqual(self.f.balances()['GAME_HOLD'],0);self.assertEqual(grant.balance('alice'),10)
        with grant.store.transaction() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM asset_journals').fetchone()[0],1)

    def fault_after_actual_commit(self,mode):
        from game_exchange.exchange_server import GameHandler
        a=self.case.connect('a');b=self.case.connect('b');self.case.purchase('a',a);self.case.purchase('b',b)
        server=self.f.game_servers[0];old=server.RequestHandlerClass;observed=[]
        class FaultAfterCommit(GameHandler):
            def respond(handler,status,response):
                if status!=200 or not response.get('ok') or response.get('result',{}).get('terminal_state')!='APPLIED':return super().respond(status,response)
                observed.append(response);handler.close_connection=True
                if mode=='disconnect':return
                raw=b'x'*65537 if mode=='oversized' else b'{}'
                handler.send_response(200);handler.send_header('Content-Type','application/json')
                handler.send_header('X-Rock-Game','public-game-a');handler.send_header('Connection','close')
                handler.send_header('Content-Length','65537' if mode=='oversized' else '100');handler.end_headers()
                try:handler.wfile.write(raw);handler.wfile.flush()
                except OSError:pass # the real bounded client may already close
        server.RequestHandlerClass=FaultAfterCommit
        try:
            began=time.monotonic();self.assertTrue(self.case.workers['a'].once());self.assertLess(time.monotonic()-began,3.4)
            self.assertEqual(len(observed),1);self.assertEqual(self.f.grants['a'].balance('alice'),10)
            self.assertEqual(self.f.balances()['GAME_HOLD'],206) # A outcome unknown + B unsent
            self.assertTrue(self.case.workers['b'].once());self.assertEqual(self.f.grants['b'].balance('alice'),10)
            self.assertEqual(self.f.balances()['GAME_HOLD'],103)
        finally:server.RequestHandlerClass=old
        self.f.now+=5;self.assertTrue(self.case.workers['a'].once())
        state=self.case.sdk.dispatch('public-game-a',{'v':1,'op':'game.exchange.status','connection_id':a,'exchange_id':'same-external'})['result']
        self.assertEqual(state['terminal_receipt'],observed[0]['result']);self.assertEqual(state['state'],'COMPLETED')
        self.assertEqual(self.f.grants['a'].balance('alice'),10);self.assertEqual(self.f.balances()['GAME_HOLD'],0)
    def test_actual_tls_disconnect_after_game_commit_keeps_hold_until_same_receipt(self):self.fault_after_actual_commit('disconnect')
    def test_actual_tls_oversized_receipt_after_game_commit_keeps_hold_until_same_receipt(self):self.fault_after_actual_commit('oversized')
    def test_actual_tls_truncated_receipt_after_game_commit_keeps_hold_until_same_receipt(self):self.fault_after_actual_commit('truncated')

    def test_game_transport_checks_actual_tls_and_destination_before_send(self):
        source=self.case.workers['a'].peer.transport
        def fresh():return GameTransport('https://'+source.host+':'+str(source.port),support.support.gx.ROOT/'os/registry/fixtures/development-ca.pem',source.game_id)
        mutations=(lambda t:setattr(t,'host','localhost'),lambda t:setattr(t,'port',source.port+1),
            lambda t:setattr(t,'game_id','public-game-b'),lambda t:setattr(t,'endpoint','/v1/player/proof'),
            lambda t:setattr(t,'token','PUBLIC-OTHER'),lambda t:setattr(t,'timeout',3.1),
            lambda t:setattr(t.context,'check_hostname',False),lambda t:setattr(t.context,'minimum_version',ssl.TLSVersion.TLSv1_3))
        for mutate in mutations:
            transport=fresh();mutate(transport)
            with self.assertRaises(ValueError):transport.exchange({'v':1,'op':'test.invalid'})
        self.assertEqual(self.f.grants['a'].balance('alice'),0)

if __name__=='__main__':unittest.main()
