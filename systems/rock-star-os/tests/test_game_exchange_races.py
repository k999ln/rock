"""Approval/claim revocation boundaries and real independent Game SQL races."""
from concurrent.futures import ThreadPoolExecutor
import threading
import time
import unittest
import test_game_exchange_tls as support
from game_exchange import protocol as p,exchange_protocol as x
from game_exchange.connections import loaded

class ExchangeRaces(unittest.TestCase):
    def setUp(self):
        self.f=support.ExchangeTLS();self.f.setUp();self.addCleanup(self.f.doCleanups)
        self.conn=self.f.ready();self.worker=self.f.live_games()['alice']['a']
    def approved(self):
        quote,intent=self.f.quoted(self.conn);request=self.f.signed(quote,intent)
        receipt=self.f.transports[support.A1].exchange(request);self.assertTrue(receipt['ok'],receipt)
        return quote,intent,request,receipt
    def state(self):
        runtime=self.f.runtimes['alice']
        with runtime.admit_write(1),runtime._service.wallet._transaction() as db:
            row=runtime._exchanges.row(db,self.conn,'same-external');return runtime._exchanges.project(db,row)
    def test_connection_revoked_before_first_claim_creates_only_signed_rejection(self):
        self.approved();reply=self.f.owner(support.A1,'revoke',key='revoke-before-claim',connection_id=self.conn);self.assertTrue(reply['ok'],reply)
        self.assertTrue(self.worker.once());state=self.state()
        self.assertEqual(state['state'],'REVERSED');self.assertEqual(self.f.grants['a'].balance('alice'),0)
        self.assertEqual((self.f.balances()['AVAILABLE'],self.f.balances()['GAME_HOLD']),(5000,0))
        self.assertEqual(state['terminal_receipt']['terminal_state'],'REJECTED')
    def test_owner_transport_revoked_before_first_claim_cannot_dispatch_new_apply(self):
        self.approved();self.f.router.revoke_device_credential(support.A1,1)
        self.assertTrue(self.worker.once());self.assertEqual(self.state()['state'],'REVERSED');self.assertEqual(self.f.grants['a'].balance('alice'),0)
    def test_owner_assertion_credential_revoked_before_first_claim_cannot_dispatch_new_apply(self):
        _,intent,_,_=self.approved();self.f.runtimes['alice'].revoke_credential(intent['credential_id'],'revoke-before-claim')
        self.assertTrue(self.worker.once());self.assertEqual(self.state()['state'],'REVERSED');self.assertEqual(self.f.grants['a'].balance('alice'),0)
    def test_author_revoked_before_first_claim_cannot_dispatch_new_apply(self):
        self.approved();self.f.gateway.revoke_author('a',1)
        self.assertTrue(self.worker.once());self.assertEqual(self.state()['state'],'REVERSED');self.assertEqual(self.f.grants['a'].balance('alice'),0)
    def test_expired_connection_and_reversed_clock_cannot_start_new_apply(self):
        self.approved();self.f.now-=1
        with self.assertRaises(ValueError):self.worker.once()
        self.assertEqual(self.state()['state'],'QUEUED');self.assertEqual(self.f.balances()['GAME_HOLD'],103)
        self.f.now+=3602;self.assertTrue(self.worker.once())
        self.assertEqual(self.state()['state'],'REVERSED');self.assertEqual(self.f.grants['a'].balance('alice'),0)
    def test_simultaneous_atm_month888_and_two_game_approvals_share_only_available(self):
        from test_wallet_managed_tls import MONTHLY
        self.f.register_activate(support.A2)
        begun=self.f.begin(support.A1,'b',key='concurrent-b');_,consent=self.f.approve(support.A1,begun['result'],key='concurrent-b')
        self.assertTrue(consent['ok'],consent);b=consent['result']['binding']['connection_id']
        a_quote,a_intent=self.f.quoted(self.conn,principal=2000);b_quote,b_intent=self.f.quoted(b,device=support.A2,principal=2000)
        a_request=self.f.signed(a_quote,a_intent,key='concurrent-a');b_request=self.f.signed(b_quote,b_intent,device=support.A2,key='concurrent-b')
        atm=self.f.call(support.A1,'wallet.atm.quote',key='concurrent-atm-quote',issue_key='concurrent-atm',amount_minor=3000,atm_id='SIM-ATM-001')
        assertion=self.f.authenticators[support.A1].get_assertion(atm['options'],'0000','concurrent-atm')
        atm_request={'v':1,'op':'wallet.atm.issue','key':'concurrent-atm','quote_id':atm['quote_id'],'credential':assertion}
        self.f.call(support.A1,'wallet.consent',key='concurrent-month-consent',accepted=True,terms_version=MONTHLY)
        self.assertEqual(self.f.balances()['SERVICE_FEES'],0)
        bob=self.f.runtimes['bob']
        with bob.admit_write(1),bob._service.wallet._transaction() as db:other_before=support.snapshot(db)
        barrier=threading.Barrier(4)
        def send(device,request):barrier.wait(3);return self.f.transports[device].exchange(request)
        def month():
            barrier.wait(3)
            reply=self.f.transports[support.A1].exchange({'v':1,'op':'wallet.bill','key':'concurrent-month','period':'2026-09'})
            with self.f.runtimes['alice'].admit_write(1):self.f.runtimes['alice']._service.membership.tick()
            return reply
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures=[pool.submit(send,support.A1,a_request),pool.submit(send,support.A2,b_request),pool.submit(send,support.A1,atm_request),pool.submit(month)]
            replies=[f.result(5) for f in futures]
        self.assertTrue(replies[3]['ok'],replies[3])
        if replies[2]['ok']:self.assertEqual(replies[2]['result']['fee_minor'],0)
        balances=self.f.balances();self.assertEqual(balances['SERVICE_FEES'],888);self.assertEqual(balances['PENDING_SETTLEMENT'],200)
        self.assertGreaterEqual(balances['AVAILABLE'],0)
        self.assertEqual(sum(balances[k] for k in ('AVAILABLE','WITHDRAW_HOLD','GAME_HOLD','GAME_PURCHASES','GAME_FEES','SERVICE_FEES')),5000)
        runtime=self.f.runtimes['alice']
        with runtime.admit_write(1),runtime._service.wallet._transaction() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM wallet_bills').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT coalesce(sum(held_minor),0) FROM wallet_game_exchanges').fetchone()[0],balances['GAME_HOLD'])
        with bob.admit_write(1),bob._service.wallet._transaction() as db:self.assertEqual(support.snapshot(db),other_before)
        self.f.transports[support.A2].exchange({'v':1,'op':'wallet.bill','key':'same-period-second-device','period':'2026-09'})
        with runtime.admit_write(1):runtime._service.membership.tick()
        self.assertEqual(self.f.balances()['SERVICE_FEES'],888)

    def test_revocation_after_claim_keeps_original_apply_authorized_and_receipt_recoverable(self):
        self.approved();claim=self.worker.claim(time.monotonic()+3)
        self.f.owner(support.A1,'revoke',key='revoke-after-claim',connection_id=self.conn)
        reply=self.worker.peer.transport.exchange(claim['request']);self.assertEqual(reply['result']['terminal_state'],'APPLIED')
        self.worker.complete(claim,reply,time.monotonic()+3)
        self.assertEqual(self.state()['state'],'COMPLETED');self.assertEqual(self.f.grants['a'].balance('alice'),10)
        self.assertEqual(self.f.balances()['GAME_HOLD'],0)
    def test_real_apply_and_conditional_reject_race_has_one_durable_outcome(self):
        self.approved();apply=self.worker.claim(time.monotonic()+3)
        self.f.exchange(support.A1,'cancel',key='cancel-in-flight',connection_id=self.conn,exchange_id='same-external')
        reject=self.worker.claim(time.monotonic()+3);self.assertEqual(reject['operation'],'reject')
        barrier=threading.Barrier(2)
        def send(request):barrier.wait(2);return self.worker.peer.transport.exchange(request)
        with ThreadPoolExecutor(max_workers=2) as pool:
            a=pool.submit(send,apply['request']);b=pool.submit(send,reject['request']);first,second=a.result(4),b.result(4)
        self.assertEqual(first,second);self.worker.complete(reject,second,time.monotonic()+3)
        terminal=second['result'];applied=terminal['terminal_state']=='APPLIED'
        self.assertEqual(self.f.grants['a'].balance('alice'),10 if applied else 0)
        self.assertEqual((self.f.balances()['AVAILABLE'],self.f.balances()['GAME_HOLD']),(4897 if applied else 5000,0))
        self.assertEqual(self.worker.peer.transport.exchange(apply['request']),first)
    def test_expired_signed_approval_denial_is_permanent_then_explicit_new_quote_version(self):
        quote,intent=self.f.quoted(self.conn);request=self.f.signed(quote,intent);self.f.now+=121
        denied=self.f.transports[support.A1].exchange(request);self.assertTrue(denied['ok'],denied)
        self.assertEqual((denied['result']['decision'],denied['result']['reason']),('DENIED','QUOTE_EXPIRED'))
        self.assertEqual(self.f.transports[support.A1].exchange(request),denied);self.assertEqual(self.f.balances()['GAME_HOLD'],0)
        new=self.f.exchange(support.A1,'quote',key='new-explicit-quote',connection_id=self.conn,exchange_id='same-external',principal_minor=100)['result']
        self.assertEqual(new['binding']['quote_version'],2);self.assertNotEqual(x.quote_digest(new),x.quote_digest(quote))
        fresh=self.f.exchange(support.A1,'approval.begin',key='new-explicit-attempt',quote_id=new['binding']['quote_id'])['result']
        result=self.f.transports[support.A1].exchange(self.f.signed(new,fresh,key='new-explicit-approval'));self.assertTrue(result['ok'],result)
        self.assertTrue(self.worker.once());self.assertEqual(self.f.grants['a'].balance('alice'),10)

if __name__=='__main__':unittest.main()
