"""Real TLS client/authority contract; all state is newly created public fixtures."""
from contextlib import closing
import importlib.util
from pathlib import Path
import json
import socket
import sqlite3
import sys
import tempfile
import threading
import unittest
import uuid

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'os'))
from entitlement.protocol import PUBLIC_TOKENS
from wallet_backend.client import HTTPSWalletTransport, RemoteWalletService, BackendUnavailable
from wallet_backend.server import WalletBackendServer, Handler
from blackberryrock.packages import canonical


class WalletBackendWireContractTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.server=WalletBackendServer(('127.0.0.1',0),self.root/'authority',start_scheduler=False,clock=lambda:1788856800,
                                       authentication_required=False)
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':.01})
        self.thread.start()
        self.addCleanup(self.stop)
        self.token=self.root/'public-token';self.token.write_text(PUBLIC_TOKENS['alice']);self.token.chmod(0o600)
        self.client=self.make_client(self.server.authority_id)
        self.addCleanup(self.client.close)

    def stop(self):
        self.server.shutdown();self.thread.join(5);self.server.server_close()

    def make_client(self,authority_id):
        transport=HTTPSWalletTransport('https://127.0.0.1:'+str(self.server.server_port),
            ROOT/'os/registry/fixtures/development-ca.pem',self.token,authority_id=authority_id)
        return RemoteWalletService(self.root/('cache-'+authority_id),transport)

    def request(self,op,**fields):
        return self.client.dispatch({'v':1,'op':op,**fields},peer_uid=1002)

    def test_real_policy_rejection_is_terminal_and_does_not_block_new_consent(self):
        self.assertTrue(self.request('wallet.register',key='register')['ok'])
        # A validly framed but financially impossible withdrawal is a definite
        # rejection, not an unknown charge that blocks cancellation forever.
        rejected=self.request('wallet.atm.issue',key='no-funds',amount_minor=1000,atm_id='SIM-ATM-001')
        self.assertFalse(rejected['ok']);self.assertEqual(rejected['code'],'rejected')
        self.assertIsNone(self.client._pending())
        self.assertEqual(rejected,self.request('wallet.atm.issue',key='no-funds',amount_minor=1000,atm_id='SIM-ATM-001'))
        self.assertTrue(self.request('wallet.consent',key='cancel',accepted=False,
            terms_version='simulator-monthly-usd-8.88-v1')['ok'])
        self.assertEqual(self.server.service.wallet.snapshot()['held_minor'],0)

    def test_wrong_authority_is_rejected_before_financial_dispatch(self):
        wrong=self.make_client(str(uuid.uuid4()))
        try:
            with self.assertRaises(BackendUnavailable):
                wrong.dispatch({'v':1,'op':'wallet.register','key':'wrong-authority'},peer_uid=1002)
            self.assertFalse(self.server.service.membership.membership()['registered'])
        finally:
            wrong.close()

    def test_snapshot_is_real_authority_data_with_read_only_local_cache(self):
        self.request('wallet.register',key='register')
        state=self.request('snapshot')['snapshot']
        self.assertTrue(state['backend']['connected']);self.assertFalse(state['backend']['stale'])
        self.assertFalse(state['backend']['cache_is_spendable'])
        self.assertTrue(state['membership']['registered']);self.assertEqual(state['available_minor'],0)
        self.assertEqual(self.server.service.wallet.snapshot()['billed_minor'],0)
        with closing(sqlite3.connect(self.client.path)) as db:
            names={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertEqual(names,{'identity','requests','snapshot'})

    def test_actual_tls_ack_truncation_recovers_exact_receipt_after_proxy_restart(self):
        class CutOneAcknowledgement(Handler):
            def respond(handler, status, response):
                if not getattr(handler.server, 'cut_ack_once', False):
                    return super().respond(status, response)
                handler.server.cut_ack_once = False
                handler.server.cut_reply = response
                raw = canonical(response)
                handler.send_response(status)
                handler.send_header('Content-Type', 'application/json')
                handler.send_header('Content-Length', str(len(raw)))
                handler.send_header('X-Rock-Wallet-Authority', handler.server.authority_id)
                handler.send_header('Connection', 'close')
                handler.end_headers()
                handler.wfile.write(raw[:len(raw)//2])
                handler.wfile.flush()
                handler.server.cut_sizes = (len(raw)//2, len(raw))
                handler.close_connection = True
                handler.connection.shutdown(socket.SHUT_RDWR)

        self.server.RequestHandlerClass = CutOneAcknowledgement
        requests = [
            {'v':1,'op':'wallet.register','key':'wire-register'},
            {'v':1,'op':'wallet.consent','key':'wire-consent','accepted':True,
             'terms_version':'simulator-monthly-usd-8.88-v1'},
            {'v':1,'op':'wallet.bill','key':'wire-bill','period':'2026-09'},
            {'v':1,'op':'wallet.consent','key':'wire-cancel','accepted':False,
             'terms_version':'simulator-monthly-usd-8.88-v1'},
        ]
        service = self.server.service
        for index, request in enumerate(requests):
            with self.subTest(op=request['op'], key=request['key']):
                self.server.cut_ack_once = True
                with self.assertRaises(BackendUnavailable):
                    self.client.dispatch(request, peer_uid=1002)
                sent, expected = self.server.cut_sizes
                self.assertGreater(sent, 0)
                self.assertLess(sent, expected)
                reply = self.server.cut_reply
                self.assertTrue(reply['ok'])  # Service committed before the real TLS cut.
                with closing(sqlite3.connect(self.client.path)) as db:
                    saved = db.execute('SELECT payload,response FROM requests WHERE key=?',
                                       (request['key'],)).fetchone()
                self.assertEqual(request, json.loads(saved[0]))
                self.assertIsNone(saved[1])
                self.client.close()
                self.client = self.make_client(self.server.authority_id)
                self.addCleanup(self.client.close)
                with self.assertRaises(BackendUnavailable):
                    self.request('wallet.consent',key='cannot-replace-'+str(index),
                                 accepted=False,terms_version='simulator-monthly-usd-8.88-v1')
                if request['op'] == 'wallet.bill':
                    # The authority can finish the already accepted debit before
                    # the restarted device recovers its lost acceptance receipt.
                    service.membership.tick()
                    self.assertEqual(service.wallet.snapshot()['billed_minor'], 888)
                state = self.request('snapshot')['snapshot']
                self.assertFalse(state['backend']['stale'])
                self.assertIsNone(self.client._pending())
                self.assertEqual(reply, self.client.dispatch(request, peer_uid=1002))
                with service.membership.store._transaction() as db:
                    self.assertEqual(index+1, db.execute('SELECT COUNT(*) FROM device_api_receipts').fetchone()[0])
                if index == 0:
                    sale = service.dispatch({'v':1,'op':'wallet.sale','key':'private-fixture-sale',
                                             'amount_minor':5000},peer_uid=1002)
                    service.dispatch({'v':1,'op':'wallet.settle','key':'private-fixture-settlement',
                                      'id':sale['result']['id']},peer_uid=1002)
        service.membership.tick()
        final = service.wallet.snapshot()
        self.assertEqual((final['available_minor'], final['billed_minor'], len(final['bills'])), (4112,888,1))
        self.assertFalse(service.membership.membership()['entitlement']['auto_renew'])
