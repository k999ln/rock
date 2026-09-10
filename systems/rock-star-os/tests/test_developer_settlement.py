"""Real owned loopback provider HTTP and durable per-developer SQLite accounting."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import hashlib
import http.client
import json
import os
from pathlib import Path
import socket
import sqlite3
import sys
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os')]
from entitlement.protocol import PUBLIC_TOKENS
from settlement import SettlementStore, Denied, Conflict, Unavailable
from settlement.fixture import FixtureIdentity, FixtureProviderServer, FixtureProviderTransport, BINDINGS, DEVELOPERS, sale_event
from settlement.protocol import canonical, signed, MAX_BYTES

A, B = PUBLIC_TOKENS['alice'], PUBLIC_TOKENS['bob']
AUTHORITY = 'fixture-settlement-authority-1'


class DeveloperSettlementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.provider = FixtureProviderServer(self.root/'provider', authority_id=AUTHORITY)
        self.thread = threading.Thread(target=self.provider.serve_forever, kwargs={'poll_interval': .01})
        self.thread.start(); self.addCleanup(self.stop_provider)
        self.identity = FixtureIdentity()
        self.transport = FixtureProviderTransport('http://127.0.0.1:'+str(self.provider.server_port), allow_public_fixture=True)
        self.store = self.open_store(); self.addCleanup(lambda: self.store.close())

    def open_store(self):
        return SettlementStore(self.root/'ledger', authority_id=AUTHORITY, bindings=BINDINGS,
                               identity=self.identity, provider=self.transport)

    def stop_provider(self):
        self.provider.shutdown(); self.provider.server_close(); self.thread.join(3)
        self.assertFalse(self.thread.is_alive())

    def ingest_sale(self, value=1000, *, developer='alice', sale='sale-1', fee=0, settle=True):
        envelopes=[]
        for kind in ('sale', 'settled') if settle else ('sale',):
            envelope = sale_event(AUTHORITY, DEVELOPERS[developer], sale, sale+'-'+kind,
                                  gross_minor=value+fee, fee_minor=fee, kind=kind)
            self.provider.publish(envelope)
            received = self.transport.event(sale+'-'+kind)
            self.assertEqual(envelope, received)
            self.store.ingest(received); envelopes.append(envelope)
        return envelopes

    def balances(self, actor=A): return self.store.balance(auth=actor)['balances']
    def requests(self, action): return [r for r in self.provider.requests if r['action']==action]

    def test_pending_settled_reserved_and_actual_provider_paid(self):
        self.ingest_sale(1000, fee=123, settle=False)
        self.assertEqual(1000,self.balances()['PENDING'])
        with self.assertRaises(Denied): self.store.reserve(1,key='too-early',auth=A)
        self.ingest_sale(1000,fee=123)
        receipt=self.store.reserve(800,key='payout-1',auth=A)
        self.assertFalse(receipt['provider_payment_confirmed'])
        self.assertEqual((200,800),(self.balances()['AVAILABLE'],self.balances()['PAYOUT_HOLD']))
        self.assertTrue(self.store.process_one())
        self.assertEqual('PAID',self.store.status('payout-1',auth=A)['state'])
        self.assertEqual((200,0,800),(self.balances()['AVAILABLE'],self.balances()['PAYOUT_HOLD'],self.balances()['PAID']))
        self.assertEqual(1,len(self.requests('create')))
        self.store.close();self.store=self.open_store()
        self.assertEqual(receipt,self.store.reserve(800,key='payout-1',auth=A))
        self.assertFalse(self.store.process_one());self.assertEqual(1,len(self.requests('create')))

    def test_same_event_and_distinct_event_same_sale_do_not_credit_twice(self):
        events=self.ingest_sale()
        first=self.store.ingest(events[1]);self.assertEqual(first,self.store.ingest(events[1]))
        alternate=json.loads(json.dumps(events[1]['payload']));alternate['event_id']='alternate-delivery'
        self.store.ingest(signed(alternate));self.assertEqual(1000,self.balances()['AVAILABLE'])
        alternate['record']['net_minor']=999;alternate['record']['gross_minor']=999
        with self.assertRaises(Conflict):self.store.ingest(signed(alternate))
        self.assertEqual(1000,self.balances()['AVAILABLE'])

    def test_changed_business_payload_and_cross_operation_key_rejected(self):
        self.ingest_sale();first=self.store.reserve(100,key='one',auth=A)
        self.assertEqual(first,self.store.reserve(100,key='one',auth=A))
        with self.assertRaises(Conflict):self.store.reserve(101,key='one',auth=A)
        with self.assertRaises(Conflict):self.store.disconnect(key='one',auth=A)

    def test_response_cut_unknown_recovery_survives_disconnect_and_restart(self):
        self.ingest_sale();self.provider.drop_next_create_response=True
        receipt=self.store.reserve(800,key='cut',auth=A)
        self.assertFalse(self.store.process_one())
        self.assertEqual('UNKNOWN',self.store.status('cut',auth=A)['state'])
        self.assertEqual(800,self.balances()['PAYOUT_HOLD'])
        with self.assertRaises(Denied):self.store.cancel('cut',key='bad-cancel',auth=A)
        self.store.disconnect(key='disconnect',auth=A)
        self.store.close();self.store=self.open_store()
        self.assertTrue(self.store.process_one());self.assertEqual('PAID',self.store.status('cut',auth=A)['state'])
        self.assertEqual(1,len(self.requests('create')));self.assertEqual(1,len(self.requests('status')))
        self.assertEqual(receipt,self.store.reserve(800,key='cut',auth=A))
        with self.assertRaises(Denied):self.store.reserve(1,key='new',auth=A)

    def test_unknown_provider_status_keeps_hold_until_confirmed_no_transfer(self):
        self.ingest_sale();self.provider.next_state='pending'
        receipt=self.store.reserve(800,key='pending',auth=A);self.store.process_one()
        for _ in range(3):self.store.process_one()
        self.assertEqual(1,len(self.requests('create')));self.assertEqual(800,self.balances()['PAYOUT_HOLD'])
        self.provider.resolve(receipt['business_key'],'failed_no_transfer');self.store.process_one()
        self.assertEqual('FAILED',self.store.status('pending',auth=A)['state'])
        self.assertEqual((1000,0,0),(self.balances()['AVAILABLE'],self.balances()['PAYOUT_HOLD'],self.balances()['PAID']))

    def test_disconnect_before_claim_does_not_send_and_allows_local_cancel(self):
        self.ingest_sale();self.store.reserve(800,key='unclaimed',auth=A)
        self.store.disconnect(key='disconnect',auth=A);self.assertFalse(self.store.process_one())
        self.store.cancel('unclaimed',key='cancel',auth=A)
        self.assertEqual(1000,self.balances()['AVAILABLE']);self.assertEqual([],self.provider.requests)

    def test_current_eligibility_rechecked_at_start(self):
        self.ingest_sale();self.store.reserve(800,key='blocked',auth=A)
        self.identity.set_eligible(DEVELOPERS['alice'],False)
        self.assertFalse(self.store.process_one());self.assertEqual([],self.provider.requests)
        self.assertFalse(self.store.status('blocked',auth=A)['send_claimed'])
        self.store.cancel('blocked',key='cancel',auth=A);self.assertEqual(1000,self.balances()['AVAILABLE'])

    def test_multiple_developers_are_isolated(self):
        self.ingest_sale(1000);self.ingest_sale(2000,developer='bob',sale='bob-sale')
        self.store.reserve(800,key='same-key',auth=A)
        with self.assertRaises(Denied):self.store.status('same-key',auth=B)
        with self.assertRaises(Denied):self.store.cancel('same-key',key='cancel',auth=B)
        self.store.reserve(1800,key='same-key',auth=B)
        self.store.process_one();self.store.process_one()
        self.assertEqual(800,self.balances(A)['PAID']);self.assertEqual(1800,self.balances(B)['PAID'])
        self.assertEqual(2,len({r['business_key'] for r in self.requests('create')}))

    def test_unknown_developer_does_not_starve_another_developer(self):
        self.ingest_sale();self.ingest_sale(1000,developer='bob',sale='bob')
        self.provider.next_state='pending';self.store.reserve(100,key='alice-pending',auth=A)
        self.store.process_one();self.provider.next_state='paid'
        self.store.reserve(100,key='bob-paid',auth=B);self.store.process_one()
        self.assertEqual('PAID',self.store.status('bob-paid',auth=B)['state'])
        self.assertEqual('UNKNOWN',self.store.status('alice-pending',auth=A)['state'])
        self.assertEqual((100,0),(self.balances(A)['PAYOUT_HOLD'],self.balances(B)['PAYOUT_HOLD']))

    def test_concurrent_balance_reservations_do_not_overspend(self):
        self.ingest_sale()
        def reserve(key):
            try:self.store.reserve(800,key=key,auth=A);return True
            except Denied:return False
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(reserve,['one','two']))
        self.assertEqual([False,True],sorted(results));self.assertEqual(800,self.balances()['PAYOUT_HOLD'])

    def test_concurrent_same_key_and_workers_execute_once(self):
        self.ingest_sale()
        with ThreadPoolExecutor(max_workers=4) as pool:receipts=list(pool.map(lambda _:self.store.reserve(800,key='one',auth=A),range(4)))
        self.assertTrue(all(r==receipts[0] for r in receipts))
        with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda _:self.store.process_one(),range(4)))
        self.assertEqual(1,len(self.requests('create')));self.assertEqual(800,self.balances()['PAID'])

    def test_real_sqlite_failure_before_claim_sends_nothing_then_recovers(self):
        self.ingest_sale();self.store.reserve(800,key='claim',auth=A)
        with closing(sqlite3.connect(self.store.path)) as db:
            db.execute("CREATE TRIGGER inject_claim_failure BEFORE UPDATE OF claimed ON payouts BEGIN SELECT RAISE(ABORT,'injected SQLite write fault'); END");db.commit()
        self.assertFalse(self.store.process_one());self.assertFalse(self.store.status('claim',auth=A)['send_claimed'])
        self.assertEqual([],self.provider.requests);self.assertEqual(800,self.balances()['PAYOUT_HOLD'])
        with closing(sqlite3.connect(self.store.path)) as db:db.execute('DROP TRIGGER inject_claim_failure');db.commit()
        self.assertTrue(self.store.process_one());self.assertEqual(800,self.balances()['PAID'])

    def test_real_sqlite_failure_after_provider_paid_uses_status_only(self):
        self.ingest_sale();self.store.reserve(800,key='paid',auth=A)
        with closing(sqlite3.connect(self.store.path)) as db:
            db.execute("CREATE TRIGGER inject_result_failure BEFORE UPDATE OF state ON payouts WHEN NEW.state='PAID' BEGIN SELECT RAISE(ABORT,'injected SQLite write fault'); END");db.commit()
        self.assertFalse(self.store.process_one());self.assertEqual(800,self.balances()['PAYOUT_HOLD'])
        with closing(sqlite3.connect(self.store.path)) as db:db.execute('DROP TRIGGER inject_result_failure');db.commit()
        self.assertTrue(self.store.process_one());self.assertEqual(1,len(self.requests('create')));self.assertEqual(1,len(self.requests('status')))
        self.assertEqual(800,self.balances()['PAID'])

    def test_crash_after_claim_before_http_never_resends_effect(self):
        self.ingest_sale();self.store.reserve(800,key='claim-crash',auth=A)
        # Test-only crash boundary: durable claim exists, no provider effect happened.
        with closing(sqlite3.connect(self.store.path)) as db:db.execute("UPDATE payouts SET claimed=1,state='SENDING'");db.commit()
        self.store.close();self.store=self.open_store();self.store.process_one();self.store.process_one()
        self.assertEqual([],self.requests('create'));self.assertEqual(2,len(self.requests('status')))
        self.assertEqual('UNKNOWN',self.store.status('claim-crash',auth=A)['state']);self.assertEqual(800,self.balances()['PAYOUT_HOLD'])

    def test_one_cent_net_is_exact_without_rounding(self):
        self.ingest_sale(1,fee=99);self.store.reserve(1,key='one-cent',auth=A);self.store.process_one()
        self.assertEqual(1,self.balances()['PAID']);self.assertEqual(0,self.balances()['AVAILABLE'])

    def test_malformed_amount_currency_fee_and_tool_success_never_credit(self):
        base=sale_event(AUTHORITY,DEVELOPERS['alice'],'invalid-sale','invalid',gross_minor=100,fee_minor=1)['payload']
        variants=[]
        for value in (-1,0,True,1.0,100000001):
            item=json.loads(json.dumps(base));item['record']['net_minor']=value;variants.append(item)
        for change in ({'currency':'EUR'},{'kind':'tool.success'}):variants.append(base|change)
        item=json.loads(json.dumps(base));item['record']['fee_minor']=2;variants.append(item)
        for payload in variants:
            with self.subTest(payload=payload):
                with self.assertRaises((ValueError,Denied)):self.store.ingest(signed(payload))
        self.assertEqual(0,self.balances()['AVAILABLE']);self.assertEqual(0,self.balances()['PENDING'])

    def test_signature_authority_developer_and_provider_account_binding(self):
        event=sale_event(AUTHORITY,DEVELOPERS['alice'],'one','one',gross_minor=100,fee_minor=0)
        altered=json.loads(json.dumps(event));altered['payload']['record']['gross_minor']=200
        with self.assertRaises(Denied):self.store.ingest(altered)
        for change in ({'authority_id':'other-authority'},{'provider_id':'other-provider'},
                       {'provider_account':BINDINGS[DEVELOPERS['bob']]},{'developer_id':'unknown-developer'}):
            with self.assertRaises(Denied):self.store.ingest(signed(event['payload']|change))
        self.assertEqual(0,self.balances()['PENDING'])

    def test_settlement_before_sale_is_not_accepted_or_lost(self):
        event=sale_event(AUTHORITY,DEVELOPERS['alice'],'late','settlement',gross_minor=100,fee_minor=0,kind='settled')
        with self.assertRaises(Conflict):self.store.ingest(event)
        self.store.ingest(sale_event(AUTHORITY,DEVELOPERS['alice'],'late','sale',gross_minor=100,fee_minor=0))
        self.store.ingest(event);self.assertEqual(100,self.balances()['AVAILABLE'])

    def test_default_adapters_and_bad_owner_deny(self):
        with self.assertRaises(Denied):self.store.balance(auth='wrong')
        with self.assertRaises(Denied):self.store.balance(auth='非公開')
        denied=SettlementStore(self.root/'denied',authority_id=AUTHORITY,bindings=BINDINGS)
        try:
            with self.assertRaises(Denied):denied.reserve(1,key='one',auth=A)
            with self.assertRaises(Denied):denied.ingest(sale_event(AUTHORITY,DEVELOPERS['alice'],'one','one',gross_minor=100,fee_minor=0))
        finally:denied.close()

    def test_existing_state_cannot_change_authority_provider_or_bindings(self):
        self.ingest_sale();self.store.close()
        variants=({'authority_id':'other'}, {'provider':None}, {'bindings':{DEVELOPERS['alice']:'replacement-account'}})
        for changes in variants:
            args={'authority_id':AUTHORITY,'bindings':BINDINGS,'identity':self.identity,'provider':self.transport}|changes
            with self.assertRaises(ValueError):SettlementStore(self.root/'ledger',**args)
        self.store=self.open_store();self.assertEqual(1000,self.balances()['AVAILABLE'])

    def test_single_owner_private_paths_and_missing_marker_fail_closed(self):
        with self.assertRaises((OSError,BlockingIOError)):self.open_store()
        self.store.close()
        with closing(sqlite3.connect(self.store.path)) as db:
            db.execute('DROP TRIGGER mode_no_delete');db.execute('DELETE FROM mode');db.commit()
        with self.assertRaises(ValueError):self.open_store()
        outside=self.root/'outside';outside.write_bytes(b'untouched')
        directory=self.root/'bad';directory.mkdir(mode=0o700);(directory/'settlement.sqlite3').symlink_to(outside)
        with self.assertRaises(ValueError):SettlementStore(directory,authority_id=AUTHORITY,bindings=BINDINGS)
        self.assertEqual(b'untouched',outside.read_bytes())

    def test_missing_database_with_retained_state_never_initializes_empty_ledger(self):
        self.ingest_sale();self.provider.next_state='pending';self.store.reserve(800,key='unknown',auth=A)
        self.store.process_one();self.store.close();self.store.path.unlink()
        with self.assertRaises(ValueError):self.open_store()
        self.assertFalse(self.store.path.exists())
        directory=self.root/'partial';directory.mkdir(mode=0o700);(directory/'retained-proof').write_text('existing authority')
        with self.assertRaises(ValueError):SettlementStore(directory,authority_id=AUTHORITY,bindings=BINDINGS)
        self.assertFalse((directory/'settlement.sqlite3').exists())

    def test_fixture_http_auth_duplicate_json_and_oversize_are_rejected(self):
        connection=http.client.HTTPConnection('127.0.0.1',self.provider.server_port,timeout=2)
        try:
            connection.request('POST','/events/get',b'{"payload":{},"signature":"bad"}',{'Content-Type':'application/json'})
            response=connection.getresponse();self.assertEqual(403,response.status);response.read()
        finally:connection.close()
        for raw in (b'{"payload":{},"payload":{},"signature":"bad"}',b'x'*(MAX_BYTES+1)):
            c=http.client.HTTPConnection('127.0.0.1',self.provider.server_port,timeout=2)
            try:
                c.request('POST','/events/get',raw,{'Content-Type':'application/json'});r=c.getresponse();self.assertEqual(400,r.status);r.read()
            finally:c.close()
        self.assertEqual([],self.provider.requests)

    def test_no_unapproved_remote_endpoint_or_personal_wallet_link(self):
        for origin in ('http://example.com','https://example.com','http://127.0.0.1:1234/path','http://user@127.0.0.1:1234'):
            with self.assertRaises(ValueError):FixtureProviderTransport(origin,allow_public_fixture=True)
        self.assertEqual('NOT_CONNECTED',self.store.balance(auth=A)['personal_wallet_link'])
        self.assertFalse(any(self.root.rglob('wallet-simulator.db')))

    def test_signed_wrong_result_binding_and_bad_signature_retain_hold(self):
        self.ingest_sale(1000)
        original=self.provider.handle_payload
        for index,change in enumerate(('account','amount','signature')):
            def wrong(path,payload,change=change):
                result=original(path,payload)
                if path!='/payout/create':return result
                value=json.loads(json.dumps(result['payload']))
                if change=='account':value['provider_account']=BINDINGS[DEVELOPERS['bob']]
                if change=='amount':value['record']['amount_minor']=value['record']['paid_minor']=101
                changed=signed(value)
                if change=='signature':changed['signature']='0'*64
                return changed
            self.provider.handle_payload=wrong
            self.store.reserve(100,key='bad-'+str(index),auth=A);self.assertFalse(self.store.process_one())
            self.provider.handle_payload=original
            # Recover this exact operation before starting the next, because the
            # bounded worker processes retained unknowns in insertion order.
            self.assertTrue(self.store.process_one())
        self.assertEqual(300,self.balances()['PAID']);self.assertEqual(0,self.balances()['PAYOUT_HOLD'])
        self.assertEqual(3,len(self.requests('create')));self.assertEqual(3,len(self.requests('status')))

    def test_owned_provider_delay_is_bounded_and_does_not_release_hold(self):
        self.ingest_sale();self.store.reserve(100,key='slow',auth=A)
        original=self.provider.handle_payload
        def slow(path,payload):
            result=original(path,payload)
            if path=='/payout/create':time.sleep(2.5)
            return result
        self.provider.handle_payload=slow;started=time.monotonic()
        self.assertFalse(self.store.process_one());self.assertLess(time.monotonic()-started,2.4)
        self.assertEqual(100,self.balances()['PAYOUT_HOLD'])
        self.provider.handle_payload=original
        self.assertTrue(self.store.process_one());self.assertEqual(1,len(self.requests('create')))


if __name__=='__main__': unittest.main()
