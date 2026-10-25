"""Real development Broker/SQLite + AP control socket; no radio or paid account."""
import base64
import json
import os
from pathlib import Path
import secrets
import socket
import sys
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT/'os'), str(ROOT/'src')]
from entitlement.store import EntitlementStore
from entitlement.protocol import sign_fixture_event
from service_access.controller import ServiceAccessController, PUBLIC_SERVICE_TOKENS
from mcp_broker import AccessDenied
from ap_control import ManagedAP
from controller import Controller, Rejected
from fixture_access import ReferenceAP, ReferenceNetwork
from message_adapter import MessageAdapter, Reassembler
from message_service import MessageService, LocalModemTransport, serve, read_packet
from network_quota import NetworkQuota
from test_controller import policy, observation
from test_message_adapter import profile, OfflineTransport


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ms-', dir='/tmp')
        self.root = Path(self.tmp.name); self.now = 100; self.key = secrets.token_bytes(32)
        self.ent = EntitlementStore(self.root/'ent.sqlite', clock=lambda:self.now)
        self.authority = ServiceAccessController(self.ent,
            authority_id='00000000-0000-4000-8000-000000000001',
            consumers={'alice-a':dict(owner_actor='alice',device_ref='fixture-mini',token=PUBLIC_SERVICE_TOKENS['alice-a'])},
            paid_services=())  # Explicit free protocol fixture; production policy unchanged.
        self.event('handoff', 1)
        self.p = policy(deviceId='fixture-mini', ownerId='fixture-owner-alice', byteCap=1000000, costCapMinor=100000,
                        maxGrantBytes=4000, blockBytes=1024, blockPriceMinor=2)
        self.c = Controller(self.root/'mini'); self.c.initialize(self.p,self.now)
        self.provider = ReferenceNetwork(self.root/'carrier.sqlite',self.p,self.key,lambda:self.now)
        self.net = NetworkQuota(self.c.directory/'network',self.p,self.key,self.provider,
                                management_exempt=True,clock=lambda:self.now)
        self.rx = Reassembler(self.root/'rx',profile(),self.p,self.key,lambda:self.now)
        self.transport = OfflineTransport(self.rx,self.provider,lambda:self.now)
        self.a = MessageAdapter(self.c,profile(),self.key,self.net,self.transport,lambda:self.now)
        self.radio = ReferenceAP(self.root/'ctl','lan0',self.c.directory/'ap')
        self.ap = ManagedAP(self.c.directory/'ap',self.radio)
        self.offline = False
        self.s = MessageService(self.a,self.ap,self.authority,'alice-a',self.observe,per_tick=1)
        self.binding = dict(clientId='phone',lanInterface='lan0',wanInterface='wan0',
                            mac='02:00:00:00:00:02',ipv4='10.90.1.2',ipv6='fd90:1::2')
        self.psk = self.request('enroll',client=self.binding,byteCap=1000000)['enrollmentKey']
        self.enable()

    def event(self,kind,seq):
        payload = dict(device_ref='fixture-mini')
        if kind != 'suspend':
            payload.update(owner_ref='fixture-owner-alice',purchase_ref='fixture-purchase-mini',
                verification_ref='fixture-verification-mini',verified_at=self.now,valid_until=10000)
        self.ent.ingest(sign_fixture_event('fulfillment',f'event-{seq}','device:fixture-mini',seq,self.now,kind,payload))

    def observe(self):
        if self.offline: raise TimeoutError('synthetic offline')
        return observation(self.now,twoWayIp=False,internetReachable=False),self.a.codec.binding

    def request(self,op,**values):
        return self.s.request('Bearer '+PUBLIC_SERVICE_TOKENS['alice-a'],
            dict(op=op,**({} if op=='status' else dict(revision=self.s.revision)),**values))

    def enable(self):
        self.request('enable')
        self.assertTrue(self.radio.associate(self.binding['mac'],self.psk))

    def queue(self,key='r1',ttl=100,data=b'hello'):
        return self.request('enqueue',clientId='phone',requestId=key,kind='si',
                            payload=base64.b64encode(data).decode(),ttl=ttl)

    def tearDown(self):
        self.s.close(); self.ap.shutdown(); self.radio.close(); self.tmp.cleanup()

    def test_authenticated_broker_ap_delivery_and_no_dock(self):
        self.queue(); self.assertEqual(self.s.tick()['attempted'],1)
        self.assertEqual(self.rx.take('si-peer','r1'),b'hello')
        self.assertIsNone(self.c.snapshot(self.now)['dockId'])
        self.assertEqual(self.request('status')['messages']['r1']['state'],'delivered')

    def test_forged_owner_unknown_fields_and_wrong_token_rejected(self):
        with self.assertRaises(AccessDenied): self.s.request('Bearer wrong',dict(op='status'))
        with self.assertRaises(Rejected): self.request('status',ownerId='fixture-owner-alice')
        with self.assertRaises(Rejected): self.s.request('Bearer '+PUBLIC_SERVICE_TOKENS['alice-a'],dict(op='enable',revision=None))
        self.assertFalse(self.transport.frames)

    def test_client_not_authenticated_and_stale_cas_rejected(self):
        rev=self.s.revision; self.request('status')
        with self.assertRaisesRegex(Rejected,'revision_conflict'):
            self.s.request('Bearer '+PUBLIC_SERVICE_TOKENS['alice-a'],dict(op='stop',revision=rev))
        self.radio.stations.clear()
        with self.assertRaises(Rejected): self.queue()
        self.assertFalse(self.a.pending(self.s.owner))

    def test_disconnect_after_remote_reservation_prevents_send_keeps_charge(self):
        self.queue(); original=self.net.reserve
        def reserve(grant):
            value=original(grant); self.radio.stations.clear(); return value
        self.net.reserve=reserve
        self.s.tick()
        self.assertFalse(self.transport.frames)
        self.assertGreater(self.c.snapshot(self.now)['summary']['reservedCostMinor'],0)

    def test_suspended_device_stops_background_dispatch(self):
        self.queue(); self.event('suspend',2)
        self.assertEqual(self.s.tick()['state'],'unavailable')
        self.assertFalse(self.transport.frames)
        self.assertIsNone(self.c.snapshot(self.now)['observation'])

    def test_identity_expiry_during_reservation_prevents_send(self):
        self.ent.ingest(sign_fixture_event('fulfillment','event-short','device:fixture-mini',2,self.now,'restore',
            dict(device_ref='fixture-mini',verification_ref='fixture-verification-mini',
                 verified_at=self.now,valid_until=self.now+1)))
        self.queue(); original=self.net.reserve
        def reserve(grant):
            value=original(grant); self.now+=2; return value
        self.net.reserve=reserve
        self.s.tick()
        self.assertFalse(self.authority.snapshot('alice-a')['device_eligible'])
        self.assertFalse(self.transport.frames)
        self.assertGreater(self.c.snapshot(self.now)['summary']['reservedCostMinor'],0)

    def test_revoked_psk_cannot_rejoin_after_enable(self):
        other=dict(self.binding,clientId='other',mac='02:00:00:00:00:03',ipv4='10.90.1.3',ipv6='fd90:1::3')
        self.request('enroll',client=other,byteCap=1000)
        self.request('revoke',clientId='phone'); self.request('enable')
        self.assertFalse(self.radio.associate(self.binding['mac'],self.psk))
        with self.assertRaises(Rejected): self.ap.authenticated('phone')

    def test_slow_final_ap_query_cannot_outlive_identity(self):
        self.ent.ingest(sign_fixture_event('fulfillment','event-short','device:fixture-mini',2,self.now,'restore',
            dict(device_ref='fixture-mini',verification_ref='fixture-verification-mini',
                 verified_at=self.now,valid_until=self.now+1)))
        self.queue(); original_reserve=self.net.reserve; original_auth=self.ap.authenticated
        reserved=[]
        def reserve(grant):
            value=original_reserve(grant); reserved.append(True); return value
        def authenticate(client):
            value=original_auth(client)
            if reserved:self.now+=2
            return value
        self.net.reserve=reserve; self.ap.authenticated=authenticate
        self.s.tick(); self.assertFalse(self.transport.frames)
        self.assertGreater(self.c.snapshot(self.now)['summary']['reservedCostMinor'],0)

    def test_slow_final_ap_query_cannot_outlive_message(self):
        self.queue(ttl=1); original_reserve=self.net.reserve; original_auth=self.ap.authenticated
        reserved=[]
        def reserve(grant):
            value=original_reserve(grant); reserved.append(True); return value
        def authenticate(client):
            value=original_auth(client)
            if reserved:self.now+=2
            return value
        self.net.reserve=reserve; self.ap.authenticated=authenticate
        self.s.tick(); self.assertFalse(self.transport.frames)
        self.assertGreater(self.c.snapshot(self.now)['summary']['reservedCostMinor'],0)

    def test_offline_ttl_swept_without_status_and_no_resurrection(self):
        self.queue(ttl=2); self.offline=True; self.s.tick(); self.now+=2; self.s.tick()
        self.offline=False; self.s.tick()
        self.assertEqual(self.request('status')['messages']['r1']['state'],'expired')
        self.assertFalse(self.transport.frames)

    def test_transient_offline_automatically_recovers_with_fresh_observation(self):
        self.queue(); self.offline=True; self.s.tick(); self.now+=1; self.offline=False
        self.s.tick(); self.assertEqual(self.rx.take('si-peer','r1'),b'hello')

    def test_fair_finite_retries_exhaust_without_budget_refund(self):
        self.transport.mode='loss'; self.queue('a'); self.queue('b')
        for i in range(8):
            self.assertLessEqual(self.s.tick()['attempted'],1); self.now+=2
        self.assertEqual(len(self.transport.frames),6)
        self.assertEqual({x['state'] for x in self.request('status')['messages'].values()},{'retry_exhausted'})
        self.assertGreater(self.c.snapshot(self.now)['summary']['reservedCostMinor'],0)

    def test_byte_cap_denial_does_not_call_transport(self):
        self.request('revoke',clientId='phone')
        small=dict(self.binding,clientId='small',mac='02:00:00:00:00:03',ipv4='10.90.1.3',ipv6='fd90:1::3')
        self.psk=self.request('enroll',client=small,byteCap=1)['enrollmentKey']; self.binding=small; self.enable()
        self.request('enqueue',clientId='small',requestId='r1',kind='si',payload='aA==',ttl=20)
        self.s.tick(); self.assertFalse(self.transport.frames)

    def test_reenrollment_cannot_revive_old_queue(self):
        self.queue(); self.psk=self.request('enroll',client=self.binding,byteCap=1000000)['enrollmentKey']
        self.enable(); self.s.tick()
        self.assertEqual(self.request('status')['messages']['r1']['state'],'revoked')
        self.assertFalse(self.transport.frames)

    def test_restart_retains_queue_but_requires_enable_and_fresh_ap(self):
        self.queue(); self.s.close()
        self.a=MessageAdapter(self.c,profile(),self.key,self.net,self.transport,lambda:self.now)
        self.s=MessageService(self.a,self.ap,self.authority,'alice-a',self.observe,per_tick=1)
        self.assertEqual(self.s.tick()['state'],'disabled')
        self.assertFalse(self.transport.frames)
        self.enable(); self.s.tick(); self.assertEqual(self.rx.take('si-peer','r1'),b'hello')

    def test_stop_then_ticks_never_send(self):
        self.queue(); self.request('stop'); self.s.tick(); self.now+=100; self.s.tick()
        self.assertFalse(self.transport.frames)
        self.assertEqual(self.request('status')['messages']['r1']['state'],'expired')

    def test_period_expiry_stops_ap_without_a_user_request(self):
        self.queue(); self.now=self.p['expiresAt']
        self.assertEqual(self.s.tick()['state'],'approval_expired')
        self.assertFalse(self.c.snapshot(self.now)['enabled'])
        self.assertFalse(self.radio.enabled)
        self.assertFalse(self.transport.frames)

    def test_unix_loop_authenticates_and_ends_disabled(self):
        listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); listener.bind(str(self.root/'service.sock')); listener.listen(1)
        os.chmod(self.root/'service.sock',0o600)
        worker=threading.Thread(target=serve,args=(self.s,listener,threading.Event()),kwargs=dict(max_ticks=1))
        worker.start()
        try:
            with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as client:
                client.settimeout(3); client.connect(str(self.root/'service.sock'))
                client.sendall(json.dumps(dict(authorization='Bearer '+PUBLIC_SERVICE_TOKENS['alice-a'],request=dict(op='status'))).encode()+b'\n')
                self.assertTrue(read_packet(client,65536,time.monotonic()+3)['ok'])
        finally:
            worker.join(4); listener.close()
        self.assertFalse(worker.is_alive()); self.assertTrue(self.s.closed)
        self.assertFalse(self.c.snapshot(self.now)['enabled'])

    def test_socket_absolute_timeout_and_oversize(self):
        a,b=socket.socketpair()
        try:
            with self.assertRaises(TimeoutError): read_packet(a,10,time.monotonic()+.01)
            b.sendall(b'x'*11)
            with self.assertRaisesRegex(Rejected,'packet_limit'):read_packet(a,10,time.monotonic()+1)
        finally:a.close();b.close()


class LocalModemTests(unittest.TestCase):
    def test_framed_unix_bridge_and_timeout(self):
        from runner.protocol import read_frame, write_frame
        from runner.transport import DeadlineSocket
        from runner.protocol import TransportError
        with tempfile.TemporaryDirectory(prefix='mm-',dir='/tmp') as directory:
            path=Path(directory)/'modem.sock'
            listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
            listener.bind(str(path));os.chmod(path,0o600);listener.listen(1);listener.settimeout(3)
            seen=[]
            def peer():
                for index in range(2):
                    conn,_=listener.accept()
                    with conn:
                        wire=DeadlineSocket(conn,3); seen.append(read_frame(wire))
                        if index==0:write_frame(wire,dict(schema='mini-local-modem/1',ack='b2s='))
                        else:time.sleep(1.2)
            worker=threading.Thread(target=peer);worker.start()
            bridge=LocalModemTransport(path,lambda:100,timeout=1)
            try:
                self.assertEqual(bridge.exchange(b'frame',dict(expiresAt=102)),b'ok')
                start=time.monotonic()
                with self.assertRaises(TransportError):bridge.exchange(b'frame',dict(expiresAt=102))
                self.assertLess(time.monotonic()-start,1.8)
                with self.assertRaises(Rejected):bridge.exchange(b'frame',dict(expiresAt=100))
            finally:
                worker.join(4);listener.close()
            self.assertFalse(worker.is_alive());self.assertEqual(len(seen),2)
            self.assertEqual(seen[0]['schema'],'mini-local-modem/1')
            self.assertEqual(base64.b64decode(seen[0]['frame']),b'frame')


if __name__=='__main__':unittest.main()
