"""Offline JP/US protocol fixtures; no radio, provider account or live billing."""
import base64
import concurrent.futures
import copy
import hashlib
import json
from pathlib import Path
import secrets
import tempfile
import unittest

from controller import Controller, Rejected
from fixture_access import ReferenceNetwork
from message_adapter import Codec, MessageAdapter, Reassembler
from network_quota import NetworkQuota
from test_controller import policy, observation


def profile(**changes):
    return dict(profileId='fixture-us-v1', region='US', senderId='mini', recipientId='si-peer',
        maxWireBytes=1200, maxAckBytes=512, overheadBytes=128, maxMessageBytes=65536,
        maxQueueBytes=131072, maxRecords=16, maxAttempts=3, retrySeconds=2, maxTtlSeconds=3600, **changes)


class OfflineTransport:
    def __init__(self, receiver, carrier, clock):
        self.receiver, self.carrier, self.clock = receiver, carrier, clock
        self.frames, self.mode, self.before = [], None, None

    def exchange(self, frame, grant):
        if self.before: self.before()
        self.frames.append(frame)
        # The reference carrier enforces bytes+expiry before each side effect.
        self.carrier.charge(grant['grantId'], tx=len(frame)+128, cost=grant['costUpperMinor'])
        if self.mode == 'loss': raise TimeoutError('synthetic loss')
        ack = self.receiver.receive(frame)
        self.carrier.charge(grant['grantId'], rx=len(ack))
        if self.mode == 'lost_ack': raise TimeoutError('synthetic lost ack')
        if self.mode == 'bad_ack': return b'{}'
        return ack


class MessageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        self.now = 100; self.key = secrets.token_bytes(32)
        self.p = policy(byteCap=1000000, costCapMinor=100000, maxGrantBytes=4000, blockBytes=1024, blockPriceMinor=2)
        self.profile = profile()
        self.c = Controller(self.root/'mini'); self.c.initialize(self.p, self.now)
        self.c.owner_command('owner-1', self.rev, dict(op='allow', clientId='phone', byteCap=1000000), self.now)
        self.provider = ReferenceNetwork(self.root/'carrier.sqlite', self.p, self.key, lambda:self.now)
        self.net = NetworkQuota(self.c.directory/'network', self.p, self.key, self.provider, management_exempt=True, clock=lambda:self.now)
        self.receiver = Reassembler(self.root/'peer', self.profile, self.p, self.key, lambda:self.now)
        self.transport = OfflineTransport(self.receiver, self.provider, lambda:self.now)
        self.a = self.adapter()
        self.ready()

    def tearDown(self):
        self.now = max(self.now, self.c.snapshot(self.now)['lastTime'])
        self.a.shutdown(); self.tmp.cleanup()
    @property
    def rev(self): return self.c.snapshot(self.now)['revision']
    def adapter(self): return MessageAdapter(self.c, self.profile, self.key, self.net, self.transport, lambda:self.now)
    def ready(self):
        self.a.owner_command('owner-1', self.rev, dict(op='enable'))
        self.a.observe('owner-1', self.rev, observation(self.now, twoWayIp=False, internetReachable=False))
        self.a.mark_link('owner-1', self.rev, self.a.codec.binding)
    def queue(self, data=b'hello', key='r1', ttl=100):
        return self.a.enqueue('owner-1', self.rev, 'phone', key, 'si', data, ttl)
    def send(self, key='r1'): return self.a.dispatch('owner-1', self.rev, key)
    def drive(self, key='r1'):
        for _ in range(500):
            result = self.send(key)
            if result['state'] != 'queued': return result
            self.now += 2
            self.ready()
        self.fail('bounded fixture failed to complete')
    def records(self):
        with self.c._db() as db: return self.a._load(db)['records']
    def receiver_state(self):
        with self.receiver._db() as (s, _): return copy.deepcopy(s)

    def test_256_1k_16k_exact_payloads_delivered_without_ip_or_dock(self):
        self.assertIsNone(self.c.snapshot(self.now)['dockId'])
        for size in (256, 1024, 16384):
            data = bytes(i % 251 for i in range(size)); key = f'r{size}'
            self.queue(data, key, ttl=800)
            self.assertEqual(self.drive(key)['state'], 'delivered')
            self.assertEqual(self.receiver.take('si-peer', key), data)
        self.assertTrue(all(len(f) <= 1200 for f in self.transport.frames))
        self.assertGreater(len(self.transport.frames), 3)
        with self.assertRaisesRegex(Rejected, 'satellite_unavailable'):
            self.c.reserve(self.rev, 'ip', 'phone', 20, self.now)
        self.assertGreater(self.c.snapshot(self.now)['summary']['reservedCostMinor'], 0)

    def test_both_country_profiles_are_independent(self):
        jp = {**self.profile, 'profileId':'fixture-jp-v1', 'region':'JP'}
        jp_policy = {**self.p, 'region':'JP', 'currency':'JPY'}
        codec = Codec(jp, jp_policy, self.key)
        rx = Reassembler(self.root/'jp-peer', jp, jp_policy, self.key, lambda:self.now)
        r = codec.chunks('jp', 'message', '日米'.encode(), 200)
        ack = rx.receive(codec.frame(r, 0, 'attempt'))
        self.assertTrue(codec.unpack('mini-message-ack/1', ack, 512)['delivered'])
        self.assertEqual(rx.take('si-peer', 'jp'), '日米'.encode())
        with self.assertRaisesRegex(Rejected, 'message_route_mismatch'):
            self.receiver.receive(codec.frame(r, 0, 'attempt'))
        self.a.shutdown()
        with self.assertRaisesRegex(Rejected, 'message_profile_changed'):
            MessageAdapter(self.c, {**self.profile,'recipientId':'other'},self.key,self.net,self.transport,lambda:self.now)

    def test_offline_enqueue_and_expiry_never_transmit(self):
        self.c.owner_command('owner-1',self.rev,dict(op='disable'),self.now)
        self.queue(ttl=3)
        with self.assertRaisesRegex(Rejected, 'sharing_off'): self.send()
        self.now += 3
        self.assertEqual(self.send()['state'],'expired')
        self.assertFalse(self.records()['r1']['chunks'])
        self.assertEqual(len(self.transport.frames),0)

    def test_missing_chunk_does_not_deliver_and_reorder_duplicate_is_safe(self):
        r=self.a.codec.chunks('order','file',b'x'*1024,200)
        frames=[self.a.codec.frame(r,i,f'a{i}') for i in range(len(r['chunks']))]
        self.receiver.receive(frames[-1]); self.receiver.receive(frames[-1])
        with self.assertRaisesRegex(Rejected, 'not_deliverable'): self.receiver.take('si-peer','order')
        for f in frames[:-1][::-1]: self.receiver.receive(f)
        self.assertEqual(self.receiver.take('si-peer','order'),b'x'*1024)
        self.receiver.acknowledge('si-peer','order','saved-order')
        self.receiver.receive(frames[-1])
        with self.assertRaisesRegex(Rejected, 'not_deliverable'): self.receiver.take('si-peer','order')

    def test_lost_ack_retry_new_reservation_same_delivery(self):
        self.queue(); self.transport.mode='lost_ack'
        self.assertEqual(self.send()['state'],'unknown')
        held=self.c.snapshot(self.now)['summary']['reservedBytes']
        self.assertEqual(self.receiver.take('si-peer','r1'),b'hello')
        self.receiver.acknowledge('si-peer','r1','saved-r1')
        with self.assertRaisesRegex(Rejected,'retry_not_due'): self.send()
        self.transport.mode=None; self.now+=2
        self.assertEqual(self.send()['state'],'delivered')
        self.assertEqual(len(self.c.snapshot(self.now)['grants']),2)
        self.assertEqual(self.c.snapshot(self.now)['summary']['reservedBytes'],held*2)
        with self.assertRaises(Rejected): self.receiver.take('si-peer','r1')

    def test_restart_retains_attempt_budget_and_requires_fresh_link(self):
        self.queue();self.transport.mode='lost_ack';self.send()
        before=self.c.snapshot(self.now)['summary']['reservedBytes']
        self.a.shutdown();self.a=self.adapter();self.a.recover('owner-1',self.rev);self.now+=2
        with self.assertRaisesRegex(Rejected,'sharing_off'):self.send()
        self.ready();self.transport.mode=None
        self.assertEqual(self.send()['state'],'delivered')
        self.assertEqual(self.c.snapshot(self.now)['summary']['reservedBytes'],before*2)

    def test_finite_retries_including_loss_and_bad_ack(self):
        for mode in ('loss','bad_ack'):
            key=mode;self.queue(key=key);self.transport.mode=mode
            for _ in range(3):
                self.assertEqual(self.send(key)['state'],'unknown');self.now+=2
            self.assertEqual(self.send(key)['state'],'retry_exhausted')
            self.assertFalse(self.records()[key]['chunks'])
        self.assertEqual(len(self.transport.frames),6)

    def test_ttl_purges_partial_receiver_and_sender_but_not_holds(self):
        self.queue(b'x'*1024,ttl=3);self.send()
        before=self.c.snapshot(self.now)['summary']['reservedBytes'];self.now+=3
        self.a.sweep('owner-1');self.receiver.sweep()
        self.assertEqual(self.records()['r1']['state'],'expired')
        self.assertFalse(self.records()['r1']['chunks'])
        self.assertFalse(self.receiver_state()['records']['r1']['parts'])
        self.assertEqual(self.c.snapshot(self.now)['summary']['reservedBytes'],before)

    def test_owner_recipient_and_client_revocation(self):
        with self.assertRaisesRegex(Rejected,'owner_mismatch'):
            self.a.enqueue('other',self.rev,'phone','r1','si',b'a',100)
        self.queue();self.send()
        with self.assertRaisesRegex(Rejected,'recipient_denied'):self.receiver.take('wrong','r1')
        self.queue(key='r2')
        self.c.owner_command('owner-1',self.rev,dict(op='revoke',clientId='phone'),self.now)
        self.assertEqual(self.send('r2')['state'],'revoked')
        self.assertFalse(self.records()['r2']['chunks'])

    def test_idempotency_cas_and_no_ttl_extension(self):
        self.queue();self.now+=1
        self.assertTrue(self.queue()['result']['replay'])
        self.assertEqual(self.records()['r1']['expiresAt'],200)
        for data,ttl in ((b'different',100),(b'hello',200)):
            with self.assertRaisesRegex(Rejected,'idempotency_conflict'): self.queue(data,ttl=ttl)
        with self.assertRaisesRegex(Rejected,'revision_conflict'):
            self.a.enqueue('owner-1',0,'phone','r2','si',b'a',100)

    def test_shared_byte_and_cost_reservations_block_next_attempt(self):
        self.queue();self.transport.mode='loss';self.send();self.now+=2
        with self.c._db() as db:
            s=self.c._read(db);held=self.c._held(s)
            # Test boundary through existing independent IP ledger usage; policy
            # remains immutable and NetworkQuota still uses the same account.
            s['txBytes']=s['policy']['byteCap']-sum(g['maxBytes'] for g in held)
            db.execute('UPDATE state SET body=?',(json.dumps(s),))
        with self.assertRaisesRegex(Rejected,'byte_cap'):self.send()
        self.assertEqual(len(self.transport.frames),1)
        with self.c._db() as db:
            s=self.c._read(db);s['txBytes']=0;s['costUpperMinor']=s['policy']['costCapMinor']
            db.execute('UPDATE state SET body=?',(json.dumps(s),))
        with self.assertRaisesRegex(Rejected,'cost_cap'):self.send()
        self.assertEqual(len(self.transport.frames),1)

    def test_concurrent_dispatch_single_reservation(self):
        self.queue();rev=self.rev
        def run(_):
            try:return self.a.dispatch('owner-1',rev,'r1')['state']
            except Rejected:return 'rejected'
        with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(run,range(2)))
        self.assertEqual(sorted(results),['delivered','rejected'])
        self.assertEqual(len(self.c.snapshot(self.now)['grants']),1)

    def test_provider_lost_reserve_ack_never_sends_and_keeps_reservation(self):
        self.queue();self.provider.fail_after_effect=True
        self.assertEqual(self.send()['state'],'unknown')
        self.assertEqual(len(self.transport.frames),0)
        self.assertGreater(self.c.snapshot(self.now)['summary']['reservedBytes'],0)

    def test_clock_regression_rejected_and_no_new_send(self):
        self.queue();self.now-=1
        with self.assertRaisesRegex(Rejected,'clock_regressed'):self.send()
        self.assertEqual(self.transport.frames,[])

    def test_old_epoch_or_expired_grant_cannot_send(self):
        self.queue();self.c.attachment(self.rev,'dock',self.now)
        with self.assertRaises(Rejected):self.send()
        self.ready()
        self.transport.before=lambda:setattr(self,'now',self.now+30)
        self.assertEqual(self.send()['state'],'unknown')
        self.assertEqual(self.receiver_state()['records'],{})

    def test_exact_envelope_and_return_traffic_reserved(self):
        self.queue();self.send();g=next(iter(self.c.snapshot(self.now)['grants'].values()))
        self.assertEqual(g['maxBytes'],len(self.transport.frames[0])+512+128)
        self.assertEqual(g['costUpperMinor'],((g['maxBytes']+1023)//1024)*2)

    def test_forged_tampered_duplicate_json_and_oversize_frames(self):
        r=self.a.codec.chunks('evil','si',b'hi',200);frame=self.a.codec.frame(r,0,'attempt')
        for value in (frame.replace(b'"si"',b'"file"'), frame+b' '*1200,
                      b'{"body":{},"body":{},"signature":"x"}'):
            with self.assertRaises((Rejected,ValueError)):self.receiver.receive(value)
        b=json.loads(frame)['body'];b['sha256']='a'*64
        with self.assertRaisesRegex(Rejected,'reassembly_digest'):
            self.receiver.receive(self.a.codec.pack('mini-message/1',b))

    def test_inconsistent_authenticated_chunk_rejected(self):
        r=self.a.codec.chunks('conflict','file',b'a'*1024,200)
        self.receiver.receive(self.a.codec.frame(r,0,'a1'))
        r['chunks'][0]=base64.b64encode(b'other').decode()
        with self.assertRaisesRegex(Rejected,'chunk_conflict'):
            self.receiver.receive(self.a.codec.frame(r,0,'a2'))

    def test_period_expiry_and_profile_change_do_not_reuse_budget(self):
        self.queue(ttl=3600);self.assertEqual(self.records()['r1']['expiresAt'],1000)
        self.send();before=self.c.snapshot(self.now)['summary']['reservedCostMinor'];self.now=1000
        self.assertEqual(self.send()['state'],'expired')
        self.assertEqual(self.c.snapshot(self.now)['summary']['reservedCostMinor'],before)
        self.a.shutdown()
        with self.assertRaisesRegex(Rejected,'message_profile_changed'):
            MessageAdapter(self.c,{**self.profile,'profileId':'new-period'},self.key,self.net,self.transport,lambda:self.now)

    def test_queue_capacity_and_tombstones_are_bounded(self):
        for i in range(16):self.queue(key=f'r{i}',ttl=1)
        self.now+=1;self.a.sweep('owner-1')
        with self.assertRaisesRegex(Rejected,'queue_record_limit'):self.queue(key='overflow')
        self.assertTrue(all(not r['chunks'] for r in self.records().values()))

    def test_receiver_restart_and_once_only_take(self):
        self.queue();self.send()
        self.receiver=Reassembler(self.root/'peer',self.profile,self.p,self.key,lambda:self.now)
        self.assertEqual(self.receiver.take('si-peer','r1'),b'hello')
        self.assertEqual(self.receiver.take('si-peer','r1'),b'hello')
        self.receiver.acknowledge('si-peer','r1','saved-r1')
        self.receiver.acknowledge('si-peer','r1','saved-r1')
        with self.assertRaisesRegex(Rejected,'not_deliverable'):self.receiver.take('si-peer','r1')

    def test_invalid_payload_ttl_key_and_network_context(self):
        for payload in (b'',b'a'*65537,'text'):
            with self.assertRaises(Rejected):self.queue(payload)
        for ttl in (True,0,3601):
            with self.assertRaises(Rejected):self.queue(ttl=ttl)
        with self.assertRaisesRegex(Rejected,'invalid_message_key'):Codec(self.profile,self.p,b'x')
        old=self.net.policy;self.net.policy={**old,'region':'JP'}
        with self.assertRaisesRegex(Rejected,'network_policy_mismatch'):self.adapter()
        self.net.policy=old

    def test_service_excludes_other_sessions_and_constructor_fences(self):
        import fcntl
        import os
        fd=os.open(self.c.directory/'lock',os.O_RDWR)
        try:
            with self.assertRaises(BlockingIOError):fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):self.adapter()
        finally:os.close(fd)
        self.queue();self.a.shutdown();self.a=self.adapter()
        with self.assertRaisesRegex(Rejected,'sharing_off'):self.send()
        self.ready();self.assertEqual(self.send()['state'],'delivered')

    def test_none_and_boolean_revisions_are_not_public_cas(self):
        for rev in (None,True):
            for call in (lambda:self.a.enqueue('owner-1',rev,'phone','r','si',b'x',10),
                         lambda:self.a.dispatch('owner-1',rev,'r'),
                         lambda:self.a.mark_link('owner-1',rev,self.a.codec.binding),
                         lambda:self.a.recover('owner-1',rev)):
                with self.assertRaisesRegex(Rejected,'invalid_integer'):call()

    def test_revoked_payload_never_revives_on_reallow(self):
        self.queue()
        self.a.owner_command('owner-1',self.rev,dict(op='revoke',clientId='phone'))
        self.a.owner_command('owner-1',self.rev,dict(op='reallow',clientId='phone'))
        self.ready()
        self.assertEqual(self.send()['state'],'revoked')
        self.assertEqual(self.transport.frames,[])

    def test_stop_serializes_with_send_and_no_post_stop_dispatch(self):
        import threading
        entered, release, stopped = threading.Event(), threading.Event(), threading.Event()
        self.queue()
        def pause():
            entered.set();release.wait(5)
        self.transport.before=pause
        def stop():
            self.a.owner_command('owner-1',self.rev,dict(op='disable'));stopped.set()
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            sending=pool.submit(self.send);self.assertTrue(entered.wait(5))
            stopping=pool.submit(stop)
            self.assertFalse(stopped.wait(.05));release.set();sending.result()
            # CAS may change during the in-flight send; owner retries fresh state.
            try:stopping.result()
            except Rejected:self.a.owner_command('owner-1',self.rev,dict(op='disable'))
        count=len(self.transport.frames);self.queue(key='r2')
        with self.assertRaisesRegex(Rejected,'sharing_off'):self.send('r2')
        self.assertEqual(len(self.transport.frames),count)

    def test_shutdown_waiter_cannot_send_after_closed(self):
        self.queue();self.a.shutdown()
        with self.assertRaisesRegex(Rejected,'message_service_closed'):self.send()

    def test_transport_callback_reentry_fails_without_deadlock(self):
        self.queue()
        for call in (lambda:self.a.owner_command('owner-1',self.rev,dict(op='disable')),
                     self.a.shutdown):
            def reenter():
                with self.assertRaisesRegex(Rejected,'message_api_reentry'):call()
                raise TimeoutError('stop callback rejected; no effect')
            self.transport.before=reenter
            self.assertEqual(self.send()['state'],'unknown');self.now+=2
        self.assertEqual(self.transport.frames,[])
