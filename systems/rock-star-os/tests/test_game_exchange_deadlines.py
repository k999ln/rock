"""Actual TLS stalled Game A cannot retain Wallet/C locks or block Game B/ATM."""
import copy
import ssl
import threading
import time
import unittest
import test_game_reference_sdk as support
from game_exchange.http import GameTransport

class IndependentGameDeadlines(unittest.TestCase):
    def setUp(self):
        self.case=support.ReferenceSDK();self.case.setUp();self.addCleanup(self.case.doCleanups);self.f=self.case.f

    def test_actual_stalled_tls_keeps_hold_while_other_game_and_atm_finish(self):
        a=self.case.connect('a');b=self.case.connect('b');self.case.purchase('a',a);self.case.purchase('b',b)
        worker=self.case.workers['a'];grant=self.f.grants['a'];original=grant.dispatch
        entered=threading.Event();release=threading.Event();finished=threading.Event();results=[];errors=[]
        def stall(request,*,deadline):
            entered.set()
            try:
                if not release.wait(4):raise TimeoutError('test stalled TLS peer deadline')
                return original(request,deadline=deadline)
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
        self.assertEqual(self.f.balances()['GAME_HOLD'],103)
        self.f.now+=2;self.assertTrue(worker.once()) # original apply, one durable grant
        self.assertEqual(self.f.grants['a'].balance('alice'),10);self.assertEqual(self.f.balances()['GAME_HOLD'],0)

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
