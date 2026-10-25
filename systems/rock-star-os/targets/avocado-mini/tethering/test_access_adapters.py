"""Control-socket/TLS/reference-provider tests, NOT RF or carrier acceptance."""
import copy
import http.server
import json
import os
from pathlib import Path
import secrets
import ssl
import subprocess
import tempfile
import threading
import unittest

from ap_control import ManagedAP, HostapdControl, read_private, write_private
from controller import Rejected
from fixture_access import ReferenceAP, ReferenceNetwork
from network_quota import NetworkQuota, HTTPSQuotaTransport, canonical
from test_controller import policy


class APTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ma-', dir='/tmp')
        self.root = Path(self.temp.name)
        self.server = ReferenceAP(self.root/'ctl', 'lan0', self.root/'ap')
        self.ap = ManagedAP(self.root/'ap', self.server)
        self.b = dict(clientId='phone', lanInterface='lan0', wanInterface='wan0',
                      mac='02:00:00:00:00:02', ipv4='10.90.1.2', ipv6='fd90:1::2')

    def tearDown(self):
        self.server.reply_override = None
        self.ap.shutdown(); self.server.close(); self.temp.cleanup()

    def enroll(self):
        return self.ap.provision('phone', self.b)

    def test_only_matching_individual_key_and_pmf_authenticate(self):
        key = self.enroll(); self.ap.enable()
        self.assertFalse(self.server.associate(self.b['mac'], 'f'*64))
        self.assertFalse(self.server.associate(self.b['mac'], key, pmf=False))
        self.assertFalse(self.server.associate('02:00:00:00:00:03', key))
        with self.assertRaises(Rejected): self.ap.authenticated('phone')
        self.assertTrue(self.server.associate(self.b['mac'], key))
        self.assertEqual(self.ap.authenticated('phone'), self.b)
        with self.assertRaises(Rejected): self.ap.authenticated('stranger')
        self.assertEqual((self.root/'ap/clients.json').stat().st_mode & 0o777, 0o600)

    def test_disabling_twice_and_restart_never_reenable(self):
        key = self.enroll(); self.ap.enable()
        self.ap.disable(); self.ap.disable()
        self.ap.shutdown(); self.ap = ManagedAP(self.root/'ap', self.server)
        self.assertFalse(self.server.enabled)
        self.assertFalse(self.server.associate(self.b['mac'], key))

    def test_bad_status_after_enable_stops_daemon(self):
        self.enroll()
        self.server.reply_override = lambda cmd, reply: reply.replace('ssid[0]=Mini', 'ssid[0]=wrong') if cmd == 'STATUS' else reply
        with self.assertRaises(Rejected): self.ap.enable()
        self.assertFalse(self.server.enabled); self.assertFalse(self.ap.enabled)

    def test_unconfirmed_stop_is_error(self):
        self.enroll(); self.ap.enable()
        self.server.reply_override = lambda cmd, reply: 'state=UNKNOWN' if cmd == 'STATUS' else reply
        with self.assertRaisesRegex(Rejected, 'ap_stop_unconfirmed'): self.ap.disable()

    def test_unmanaged_daemon_and_other_owner_cannot_be_adopted(self):
        with self.assertRaisesRegex(Rejected, 'managed_ap_supervisor_required'):
            ManagedAP(self.root/'other', HostapdControl(self.root/'ctl','lan0'))
        with self.assertRaises(BlockingIOError): ManagedAP(self.root/'other', self.server)
        self.ap.shutdown()
        with self.assertRaisesRegex(Rejected, 'ap_owner_mismatch'): ManagedAP(self.root/'other', self.server)

    def test_generation_and_on_disk_key_changes_rejected(self):
        key=self.enroll(); self.ap.enable(); self.server.associate(self.b['mac'], key)
        self.server.generation = (b'other config', b'shared key')
        with self.assertRaisesRegex(Rejected, 'ap_generation_unproven'): self.ap.authenticated('phone')
        self.server.deploy(self.root/'ap/hostapd.conf', self.root/'ap/clients.psk')
        write_private(self.root/'ap/clients.psk', b'00:00:00:00:00:00 bad-key')
        with self.assertRaisesRegex(Rejected, 'ap_configuration_changed'): self.ap.authenticated('phone')

    def test_revoke_removes_key_and_requires_explicit_new_enable(self):
        key=self.enroll(); self.ap.enable(); self.server.associate(self.b['mac'], key)
        self.ap.revoke('phone')
        self.assertEqual(self.ap.client_ids(), [])
        self.assertFalse(self.server.associate(self.b['mac'], key))
        self.assertNotIn(key, read_private(self.root/'ap/clients.psk').decode())
        with self.assertRaisesRegex(Rejected, 'ap_no_credentials'): self.ap.enable()

    def test_duplicate_and_malformed_registry_rejected(self):
        key=self.enroll()
        for changes in ({'clientId':'other'}, {'clientId':'other','mac':'02:00:00:00:00:03','ipv4':'10.90.1.3','ipv6':'fd90:1::3'}):
            with self.assertRaises(Rejected): self.ap.provision('other', {**self.b, **changes}, key)
        data=json.loads(read_private(self.ap.path)); data['phone']['psk']='key\nextra'
        write_private(self.ap.path, canonical(data))
        with self.assertRaises(Rejected): self.ap.client_ids()


class NetworkTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='mq-', dir='/tmp'); self.root=Path(self.temp.name)
        self.now=100; self.p=policy(); self.key=secrets.token_bytes(32)
        self.provider=ReferenceNetwork(self.root/'carrier.sqlite', self.p, self.key, lambda:self.now)
        self.q=NetworkQuota(self.root/'network', self.p, self.key, self.provider, management_exempt=True, clock=lambda:self.now)
        self.g=dict(grantId='g1', status='reserved', clientId='phone', maxBytes=100, costUpperMinor=10, expiresAt=130)

    def tearDown(self): self.temp.cleanup()

    def restart(self):
        self.q=NetworkQuota(self.root/'network', self.p, self.key, self.provider, management_exempt=True, clock=lambda:self.now)

    def test_tx_rx_cost_and_close_preserve_usage(self):
        self.q.account(); self.q.reserve(self.g)
        self.provider.charge('g1',tx=30,rx=70,cost=10)
        g=self.q.read('g1')['grant']; self.assertEqual((g['txBytes'],g['rxBytes'],g['costMinor']),(30,70,10))
        for delta in ({'tx':1},{'rx':1},{'cost':1}):
            with self.assertRaisesRegex(Rejected,'fixture_network_cap'): self.provider.charge('g1',**delta)
        self.assertEqual(self.q.close('g1')['grant']['state'],'closed')
        with self.assertRaises(Rejected): self.provider.charge('g1',rx=1)
        self.restart(); self.assertEqual(self.q.account()['account']['usedBytes'],100)

    def test_lost_ack_survives_restart_and_can_be_read_closed(self):
        self.provider.fail_after_effect=True
        with self.assertRaises(TimeoutError): self.q.reserve(self.g)
        self.assertEqual(self.q._state()['grants']['g1']['state'],'unknown')
        self.restart(); self.provider.fail_after_effect=False
        with self.assertRaisesRegex(Rejected,'provider_grant_replay'): self.q.reserve(self.g)
        self.assertEqual(self.q.read('g1')['grant']['state'],'reserved')
        self.assertEqual(self.q.close('g1')['account']['heldBytes'],0)
        self.assertEqual(self.q.close('g1')['grant']['state'],'closed')

    def test_lost_close_ack_reconciliation_is_idempotent(self):
        self.q.reserve(self.g); self.provider.fail_after_effect=True
        with self.assertRaises(TimeoutError): self.q.close('g1')
        self.restart(); self.provider.fail_after_effect=False
        self.assertEqual(self.q.close('g1')['grant']['state'],'closed')

    def test_expiry_stops_new_reservations_but_allows_reconciliation(self):
        self.q.reserve(self.g); self.now=1001
        with self.assertRaises(Rejected): self.q.account()
        with self.assertRaises(Rejected): self.provider.charge('g1',rx=1)
        self.assertEqual(self.q.close('g1')['grant']['state'],'closed')

    def test_account_caps_cannot_be_raised_by_new_grants(self):
        for i in range(2): self.q.reserve({**self.g,'grantId':f'g{i}','maxBytes':500,'costUpperMinor':50})
        with self.assertRaisesRegex(Rejected,'fixture_byte_cap'): self.q.reserve({**self.g,'grantId':'excess'})
        self.assertEqual(self.q.account()['account']['heldBytes'],1000)
        # Reservation with a cheaper price is rejected even if it fits bytes.
        self.q.close('g0')
        with self.assertRaisesRegex(Rejected,'fixture_grant_terms'):
            self.q.reserve({**self.g,'grantId':'cheap','costUpperMinor':0})

    def test_cost_cap_is_independent_of_byte_cap(self):
        p=policy(byteCap=10000,costCapMinor=10)
        provider=ReferenceNetwork(self.root/'other.sqlite',p,self.key,lambda:self.now)
        q=NetworkQuota(self.root/'other',p,self.key,provider,management_exempt=True,clock=lambda:self.now)
        q.reserve(self.g)
        with self.assertRaisesRegex(Rejected,'fixture_cost_cap'): q.reserve({**self.g,'grantId':'g2'})

    def test_bad_signature_does_not_authorize_and_journals_unknown(self):
        real=self.provider.exchange
        def bad(raw,auth):
            value=json.loads(real(raw,auth)); value['signature']='0'*64; return canonical(value)
        self.provider.exchange=bad
        with self.assertRaisesRegex(Rejected,'provider_signature_invalid'): self.q.reserve(self.g)
        self.assertEqual(self.q._state()['grants']['g1']['state'],'unknown')
        self.provider.exchange=real; self.assertEqual(self.q.read('g1')['grant']['state'],'reserved')

    def test_signed_stale_replay_terms_and_overrun_latch_fault(self):
        mutations=[lambda b:b.update(requestSha256='0'*64), lambda b:b.update(policySha256='f'*64),
                   lambda b:b.update(observedAt=90),lambda b:b.update(validUntil=100),
                   lambda b:b['account'].update(byteCap=2000), lambda b:b['account'].update(allTrafficHardStop=False),
                   lambda b:b['account'].update(managementExempt=False),lambda b:b['account'].update(usedBytes=1001),
                   lambda b:b['account'].update(usedCostMinor=101),lambda b:b['grant'].update(maxBytes=101)]
        for i,mutate in enumerate(mutations):
            q=NetworkQuota(self.root/f'case{i}',self.p,self.key,self.provider,management_exempt=True,clock=lambda:self.now)
            def corrupt(body): mutate(body); return body
            self.provider.transform=corrupt
            with self.subTest(case=i), self.assertRaises(Rejected): q.reserve({**self.g,'grantId':f'case{i}'})
            with self.assertRaisesRegex(Rejected,'provider_fault_latched'): q.account()
            with self.assertRaisesRegex(Rejected,'provider_fault_latched'):
                NetworkQuota(q.directory,self.p,self.key,self.provider,management_exempt=True,clock=lambda:self.now)
            self.provider.transform=None
            # Reference account limits remain in force; close without reusing faulty client state.
            self.provider._mutate(lambda s:s['grants'][f'case{i}'].update(state='closed'))

    def test_counter_rollback_and_same_revision_conflict(self):
        self.q.reserve(self.g); self.provider.charge('g1',tx=20,cost=2); self.q.read('g1')
        def corrupt(b): b['grant']['txBytes']=19; return b
        self.provider.transform=corrupt
        with self.assertRaisesRegex(Rejected,'provider_grant_changed'): self.q.read('g1')
        self.provider.transform=None
        q=NetworkQuota(self.root/'other',self.p,self.key,self.provider,management_exempt=True,clock=lambda:self.now)
        q.account()
        def same_revision(b): b['account']['heldBytes']-=1; return b
        self.provider.transform=same_revision
        with self.assertRaisesRegex(Rejected,'provider_revision_conflict'): q.account()

    def test_interrupted_atomic_write_does_not_block_new_journal(self):
        stale = self.q.path.with_name(self.q.path.name + '.crashed.pending')
        stale.write_bytes(b'partial'); os.chmod(stale, 0o600)
        self.restart(); self.assertEqual(self.q.account()['account']['usedBytes'],0)
        self.assertEqual(stale.read_bytes(),b'partial')

    def test_unbounded_management_and_changed_policy_rejected(self):
        with self.assertRaisesRegex(Rejected,'management_charges_not_bounded'):
            NetworkQuota(self.root/'bad',self.p,self.key,self.provider,management_exempt=False)
        with self.assertRaisesRegex(Rejected,'provider_policy_changed'):
            NetworkQuota(self.q.directory,{**self.p,'periodId':'other'},self.key,self.provider,management_exempt=True)


class TLSTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='mt-',dir='/tmp'); root=Path(cls.temp.name)
        cls.cert=root/'cert.pem'; cls.key=root/'key.pem'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(cls.key),
            '-out',str(cls.cert),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],
            check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        os.chmod(cls.key,0o600)
        cls.requests=[]; cls.reply=b'{}'; cls.code=200
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self,*args): pass
            def do_POST(self):
                body=self.rfile.read(int(self.headers['Content-Length']))
                cls.requests.append((self.path,self.headers.get('X-Mini-Auth'),body))
                self.send_response(cls.code); self.send_header('Content-Type','application/json')
                self.send_header('Content-Length',str(len(cls.reply))); self.end_headers()
                try: self.wfile.write(cls.reply)
                except OSError: pass
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); context.load_cert_chain(cls.cert,cls.key)
        cls.server.socket=context.wrap_socket(cls.server.socket,server_side=True)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True); cls.thread.start()

    @classmethod
    def tearDownClass(cls): cls.server.shutdown(); cls.server.server_close(); cls.thread.join(); cls.temp.cleanup()

    def setUp(self):
        type(self).reply=b'{}'; type(self).code=200; self.requests.clear()
        self.origin=f'https://localhost:{self.server.server_port}'
        self.trust=ssl.create_default_context(cafile=str(self.cert))

    def test_authenticated_https_request_to_fixed_path(self):
        t=HTTPSQuotaTransport(self.origin,self.trust)
        self.assertEqual(t.exchange(b'{"request":1}','fixture-auth'),b'{}')
        self.assertEqual(self.requests,[('/v1/mini/quota','fixture-auth',b'{"request":1}')])

    def test_wrong_ca_hostname_and_disabled_validation_rejected(self):
        with self.assertRaises(ssl.SSLCertVerificationError): HTTPSQuotaTransport(self.origin).exchange(b'{}','x')
        with self.assertRaises(ssl.SSLCertVerificationError):
            HTTPSQuotaTransport(self.origin.replace('localhost','127.0.0.1'),self.trust).exchange(b'{}','x')
        with self.assertRaises(Rejected): HTTPSQuotaTransport(self.origin,ssl._create_unverified_context())
        self.assertEqual(self.requests,[])

    def test_no_redirect_or_retry_and_bounded_response(self):
        type(self).code=302
        with self.assertRaises(Rejected): HTTPSQuotaTransport(self.origin,self.trust).exchange(b'{}','x')
        self.assertEqual(len(self.requests),1)
        type(self).code=200; type(self).reply=b'x'*65537
        with self.assertRaisesRegex(Rejected,'oversize_provider_response'):
            HTTPSQuotaTransport(self.origin,self.trust).exchange(b'{}','x')

    def test_invalid_origin_and_oversize_request_never_sent(self):
        for origin in ('http://localhost','https://a:b@localhost','https://localhost/path','https://localhost/#frag'):
            with self.assertRaises(Rejected): HTTPSQuotaTransport(origin)
        with self.assertRaises(Rejected): HTTPSQuotaTransport(self.origin,self.trust).exchange(b'x'*16385,'x')
        self.assertEqual(self.requests,[])


if __name__ == '__main__': unittest.main()
