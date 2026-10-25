"""Real Linux packets in disposable network namespaces; no external traffic.
Run explicitly as root on a dedicated Linux test VM. Missing prerequisites FAIL.
"""
import json
import threading
import concurrent.futures
import multiprocessing
import os
from pathlib import Path
import shutil
import select
import signal
import shlex
import subprocess
import sys
import tempfile
import time
import unittest
import uuid

from controller import Controller, Rejected
from linux_gate import LinuxGate


def command(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True, timeout=10)


def prepare(controller, gate, clients, max_grant_seconds=30):
    def rev(): return controller.snapshot(int(time.time()))['revision']
    for client in clients:
        gate.owner_command('fixture-owner', rev(), dict(op='allow', clientId=client, byteCap=controller.snapshot(int(time.time()))['policy']['byteCap']))
    gate.owner_command('fixture-owner', rev(), dict(op='enable'))
    observe_ready(controller,gate)


def observe_ready(controller,gate):
    now = int(time.time())
    clients=list(controller.snapshot(now)['clients'])
    gate.observe(controller.snapshot(now)['revision'], dict(bootId='fixture-boot', linkId='fixture-link', providerId='fixture',
                 contractVersion='v1', region='US', observedAt=now, validUntil=now+60,
                 powerSafe=True,batteryReady=True,apIsolated=True,meterReady=True,hardQuotaReady=True,
                 satelliteRegistered=True,twoWayIp=True,internetReachable=True,sharingEntitled=True,
                 connectedClientIds=clients))


def create_controller(directory, seconds=30, byte_cap=100000, cost_cap=100000):
    c=Controller(directory)
    c.initialize(dict(ownerId='fixture-owner',deviceId='fixture-mini',periodId='fixture-period',currency='USD',
       byteCap=byte_cap,costCapMinor=cost_cap,maxClients=4,expiresAt=int(time.time())+300,
       providerId='fixture',contractVersion='v1',region='US',blockBytes=1,blockPriceMinor=1,
       grantFeeMinor=0,maxGrantBytes=min(byte_cap,50000),maxGrantSeconds=seconds),int(time.time()))
    return c


def crash_install(directory, ns, client):
    c=create_controller(directory,seconds=3)
    g=LinuxGate(c,ns)
    prepare(c,g,['phone'])
    g.open(c.snapshot(int(time.time()))['revision'],'crash',client,10000)
    os._exit(0)  # Deliberately no cleanup: test persistent kernel expiration.


def delayed_install(directory, ns, client, marker):
    c=create_controller(directory)
    g=LinuxGate(c,ns)
    prepare(c,g,['phone'])
    real_run=subprocess.run
    def delayed_run(command_args, **kwargs):
        if 'add quota' in (kwargs.get('input') or ''):
            # Test-only delay AFTER nsenter has inherited production pass_fds.
            command_args=command_args[:3]+['/bin/sh','-c',
                'touch '+shlex.quote(marker)+'; sleep 2; exec /usr/sbin/nft -f -']
        return real_run(command_args, **kwargs)
    subprocess.run=delayed_run
    g.open(c.snapshot(int(time.time()))['revision'],'delayed',client,10000)


class PacketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not sys.platform.startswith('linux') or os.geteuid()!=0:
            raise RuntimeError('Explicit Linux root packet test required; not a skipped success')
        for name in ['ip','nft','ping','sysctl','nsenter']:
            if not shutil.which(name): raise RuntimeError('Missing prerequisite: '+name)

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='mini-tether-test-')
        self.prefix='mini-tether-'+uuid.uuid4().hex[:8]
        self.router=self.prefix+'-r'
        self.clients=[self.prefix+'-c1',self.prefix+'-c2']
        self.wan=self.prefix+'-w'
        self.names=[self.router,*self.clients,self.wan]
        self.gate=None
        self.bindings=[]
        for name in self.names: command('ip','netns','add',name)
        original_ns=os.stat('/run/netns/'+self.router)
        self.fixture_claim=Path('/run/mini-tether-gates')/f'{original_ns.st_dev}-{original_ns.st_ino}.json'
        for index,remote in enumerate([*self.clients,self.wan],1):
            local_if='wan0' if index==3 else f'lan{index-1}'
            peer='peer0'
            command('ip','link','add','mt-a','type','veth','peer','name','mt-b')
            command('ip','link','set','mt-a','netns',self.router)
            command('ip','link','set','mt-b','netns',remote)
            command('ip','-n',self.router,'link','set','mt-a','name',local_if)
            command('ip','-n',remote,'link','set','mt-b','name',peer)
            for ns,iface,host in [(self.router,local_if,1),(remote,peer,2)]:
                mac=f'02:00:00:{index:02x}:00:{host:02x}'
                command('ip','-n',ns,'link','set',iface,'address',mac)
                command('ip','-n',ns,'addr','add',f'10.91.{index}.{host}/24','dev',iface)
                command('ip','-n',ns,'-6','addr','add',f'fd91:{index}::{host}/64','dev',iface,'nodad')
                command('ip','-n',ns,'link','set',iface,'up')
                command('ip','-n',ns,'link','set','lo','up')
                opposite=3-host
                command('ip','-n',ns,'neigh','replace',f'10.91.{index}.{opposite}',
                        'lladdr',f'02:00:00:{index:02x}:00:{opposite:02x}','nud','permanent','dev',iface)
                command('ip','-n',ns,'-6','neigh','replace',f'fd91:{index}::{opposite}',
                        'lladdr',f'02:00:00:{index:02x}:00:{opposite:02x}','nud','permanent','dev',iface)
            command('ip','-n',remote,'route','add','default','via',f'10.91.{index}.1')
            command('ip','-n',remote,'-6','route','add','default','via',f'fd91:{index}::1')
            if index<3:
                self.bindings.append(dict(clientId=['phone','laptop'][index-1],lanInterface=local_if,
                    wanInterface='wan0',mac=f'02:00:00:{index:02x}:00:02',ipv4=f'10.91.{index}.2',ipv6=f'fd91:{index}::2'))
        command('ip','netns','exec',self.router,'sysctl','-qw','net.ipv4.ip_forward=1','net.ipv6.conf.all.forwarding=1')

    def tearDown(self):
        if self.gate:
            self.gate.shutdown()
        for ns in reversed(self.names):
            command('ip','netns','del',ns,check=False)
        # This fixture deliberately destroys its DB and namespace together.
        # Production claims are never deleted by LinuxGate. Remove only this
        # test's own claim after all namespace references/processes are closed;
        # leave the lock inode intact so kernel inode reuse cannot split locks.
        if self.fixture_claim.exists():
            claim=json.loads(self.fixture_claim.read_text())
            if claim.get('binding',{}).get('directory','').startswith(self.temp.name+'/'):
                self.fixture_claim.unlink()
        self.temp.cleanup()

    def start(self,byte_cap=100000,cost_cap=100000,seconds=30):
        self.c=create_controller(Path(self.temp.name)/'private',seconds,byte_cap,cost_cap)
        self.gate=LinuxGate(self.c,self.router)
        prepare(self.c,self.gate,['phone','laptop'])

    def revision(self): return self.c.snapshot(int(time.time()))['revision']

    def ping(self,client=0,v=4,destination=None):
        target=destination or ('10.91.3.2' if v==4 else 'fd91:3::2')
        return command('ip','netns','exec',self.clients[client],'ping',f'-{v}','-n','-c','1','-W','0.3','-s','8',target,check=False).returncode==0

    def open(self,key='grant',index=0,size=1000):
        return self.gate.open(self.revision(),key,self.bindings[index],size)

    def test_default_deny_and_dual_stack_same_quota(self):
        self.start()
        self.assertFalse(self.ping())
        self.assertFalse(self.ping(v=6))
        self.open(size=184)  # IPv4 36x2 + IPv6 56x2 bytes.
        self.assertTrue(self.ping())
        self.assertTrue(self.ping(v=6))
        counters=self.gate.counters('grant')
        self.assertEqual(counters['txBytes']+counters['rxBytes'],184)
        self.assertFalse(self.ping())
        self.assertFalse(self.ping(v=6))
        self.assertEqual(self.gate.counters('grant'),counters)

    def test_unauthorized_client_spoof_and_local_management_blocked(self):
        self.start()
        self.open(size=1000)
        self.assertTrue(self.ping())
        self.assertFalse(self.ping(client=1))
        self.assertFalse(self.ping(destination='10.91.1.1'))
        self.assertFalse(self.ping(destination='10.91.2.2'))
        command('ip','-n',self.clients[0],'link','set','peer0','address','02:00:00:ff:00:02')
        self.assertFalse(self.ping())
        self.assertFalse(self.ping(v=6))

    def test_two_clients_and_shared_reservation_cap(self):
        self.start(byte_cap=144)
        self.open('phone-grant',0,72)
        self.open('laptop-grant',1,72)
        self.assertTrue(self.ping(0))
        self.assertTrue(self.ping(1))
        self.assertFalse(self.ping(0))
        self.assertFalse(self.ping(1))
        self.gate.close('phone-grant')
        with self.assertRaisesRegex(Rejected,'byte_cap'):
            self.open('extra',0,1)
        self.assertEqual(self.c.snapshot(int(time.time()))['summary']['reservedBytes'],144)

    def test_packet_larger_than_remaining_is_not_forwarded(self):
        self.start()
        self.open(size=35)  # First IP packet is 36 bytes; must not overshoot.
        self.assertFalse(self.ping())
        counters=self.gate.counters('grant')
        self.assertEqual(counters['txBytes']+counters['rxBytes'],0)

    def test_close_revoke_detach_and_replay(self):
        self.start()
        self.open()
        self.assertTrue(self.ping())
        receipt=self.gate.close('grant')
        self.assertTrue(receipt['forwardRulesRemoved'])
        self.assertTrue(receipt['reservationRetained'])
        self.assertFalse(receipt['snapshotFinal'])
        self.assertFalse(self.ping())
        with self.assertRaisesRegex(Rejected,'grant_replay_not_installable'):
            self.open()
        self.open('new')
        self.gate.owner_command('fixture-owner',self.revision(),dict(op='revoke',clientId='phone'))
        self.assertFalse(self.ping())
        self.gate.attachment(self.revision(),'dock')
        self.assertFalse(self.ping(v=6))
        self.assertEqual(self.c.snapshot(int(time.time()))['summary']['reservedBytes'],2000)

    def test_owner_mismatch_does_not_stop_authorized_packets(self):
        self.start()
        self.open()
        with self.assertRaisesRegex(Rejected,'owner_mismatch'):
            self.gate.owner_command('other',self.revision(),dict(op='disable'))
        self.assertTrue(self.ping())

    def test_process_exit_leaves_kernel_quota_and_expiry(self):
        directory=str(Path(self.temp.name)/'crash-private')
        proc=multiprocessing.Process(target=crash_install,args=(directory,self.router,self.bindings[0]))
        proc.start(); proc.join(10)
        self.assertEqual(proc.exitcode,0)
        self.assertTrue(self.ping())
        time.sleep(3.1)
        self.assertFalse(self.ping())
        self.assertFalse(self.ping(v=6))
        c=Controller(directory)
        self.gate=LinuxGate(c,self.router)
        self.assertFalse(c.snapshot(int(time.time()))['enabled'])
        self.assertEqual(c.snapshot(int(time.time()))['summary']['reservedBytes'],10000)

    def test_parent_kill_during_nft_keeps_child_ownership(self):
        directory=str(Path(self.temp.name)/'delayed-private')
        marker=str(Path(self.temp.name)/'nft-child-started')
        proc=multiprocessing.Process(target=delayed_install,args=(directory,self.router,self.bindings[0],marker))
        proc.start()
        deadline=time.monotonic()+5
        while not Path(marker).exists() and time.monotonic()<deadline:
            time.sleep(0.02)
        self.assertTrue(Path(marker).exists())
        os.kill(proc.pid,signal.SIGKILL); proc.join(5)
        self.assertEqual(proc.exitcode,-signal.SIGKILL)
        c=Controller(directory)
        with self.assertRaises(BlockingIOError):
            LinuxGate(c,self.router)
        time.sleep(2.2)
        self.gate=LinuxGate(c,self.router)
        self.assertFalse(self.ping())
        self.assertFalse(c.snapshot(int(time.time()))['enabled'])
        self.assertEqual(c.snapshot(int(time.time()))['summary']['reservedBytes'],10000)

    def test_existing_tcp_connection_stops_without_established_bypass(self):
        self.start()
        self.open(size=5000)
        server_code="import socket; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(('10.91.3.2',43210)); s.listen(); print('ready',flush=True); c,_=s.accept();\nwhile True:\n d=c.recv(1024)\n if not d: break\n c.sendall(d)"
        client_code="import socket,sys; c=socket.create_connection(('10.91.3.2',43210),1); c.settimeout(.4);\nfor line in sys.stdin:\n try:\n  c.sendall(line.encode()); print(c.recv(len(line)).decode().strip(),flush=True)\n except socket.timeout: print('blocked',flush=True)"
        server=subprocess.Popen(['ip','netns','exec',self.wan,'python3','-u','-c',server_code],stdout=subprocess.PIPE,text=True)
        client=None
        try:
            self.assertTrue(select.select([server.stdout],[],[],3)[0]); self.assertEqual(server.stdout.readline().strip(),'ready')
            client=subprocess.Popen(['ip','netns','exec',self.clients[0],'python3','-u','-c',client_code],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
            client.stdin.write('one\n'); client.stdin.flush()
            self.assertTrue(select.select([client.stdout],[],[],3)[0]); self.assertEqual(client.stdout.readline().strip(),'one')
            self.gate.owner_command('fixture-owner',self.revision(),dict(op='disable'))
            client.stdin.write('two\n'); client.stdin.flush()
            self.assertTrue(select.select([client.stdout],[],[],3)[0]); self.assertEqual(client.stdout.readline().strip(),'blocked')
        finally:
            for process in [client,server]:
                if process:
                    process.kill(); process.wait(3)
                    for stream in [process.stdin,process.stdout]:
                        if stream: stream.close()

    def test_udp_burst_cannot_overshoot_packet_quota(self):
        self.start()
        self.open(size=200)
        receiver="import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.bind(('10.91.3.2',43211)); s.settimeout(.5); print('ready',flush=True); n=0;\ntry:\n while True: s.recvfrom(1024); n+=1\nexcept socket.timeout: print(n,flush=True)"
        server=subprocess.Popen(['ip','netns','exec',self.wan,'python3','-u','-c',receiver],stdout=subprocess.PIPE,text=True)
        try:
            self.assertTrue(select.select([server.stdout],[],[],3)[0]); self.assertEqual(server.stdout.readline().strip(),'ready')
            sender="import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); [s.sendto(b'x',('10.91.3.2',43211)) for _ in range(200)]"
            command('ip','netns','exec',self.clients[0],'python3','-c',sender)
            self.assertTrue(select.select([server.stdout],[],[],3)[0]); count=int(server.stdout.readline().strip())
            self.assertEqual(count,6)
            self.assertEqual(self.gate.counters('grant')['txBytes'],174)
            self.assertLessEqual(self.gate.counters('grant')['txBytes'],200)
        finally:
            if server.poll() is None: server.kill()
            server.wait(3); server.stdout.close()

    def test_alias_of_same_namespace_cannot_get_second_owner(self):
        self.start()
        self.open()
        alias=self.prefix+'-alias'
        command('touch','/run/netns/'+alias)
        command('mount','--bind','/run/netns/'+self.router,'/run/netns/'+alias)
        self.names.append(alias)
        other=create_controller(Path(self.temp.name)/'other-alias')
        with self.assertRaises(BlockingIOError):
            LinuxGate(other,alias)
        self.assertTrue(self.ping())
        self.gate.shutdown(); self.gate=None
        with self.assertRaisesRegex(Rejected,'namespace_owner_mismatch'):
            LinuxGate(other,alias)

    def test_cost_cap_and_detach_keep_existing_reservation(self):
        self.start(cost_cap=72)
        self.open(size=72)
        self.assertTrue(self.ping())
        self.gate.close('grant')
        with self.assertRaisesRegex(Rejected,'cost_cap'):
            self.open('extra',size=1)
        self.gate.attachment(self.revision(),'dock')
        self.gate.attachment(self.revision(),None)
        self.assertEqual(self.c.snapshot(int(time.time()))['summary']['reservedCostMinor'],72)
        self.assertFalse(self.ping())

    def test_portable_reobservation_after_detach(self):
        self.start()
        self.gate.attachment(self.revision(),'dock')
        observe_ready(self.c,self.gate)
        self.open('docked')
        self.assertTrue(self.ping())
        self.gate.attachment(self.revision(),None)
        self.assertFalse(self.ping())
        observe_ready(self.c,self.gate)
        self.open('portable')
        self.assertTrue(self.ping(v=6))
        self.assertIsNone(self.c.snapshot(int(time.time()))['dockId'])
        self.assertEqual(self.c.snapshot(int(time.time()))['summary']['reservedBytes'],2000)

    def test_namespace_name_replacement_cannot_redirect_operations(self):
        self.start()
        self.open()
        self.assertTrue(self.ping())
        command('ip','netns','del',self.router)
        command('ip','netns','add',self.router)
        self.gate.close('grant')  # Must still close the original FD-bound netns.
        self.assertFalse(self.ping())
        readback=command('ip','netns','exec',self.router,'nft','-j','list','ruleset').stdout
        self.assertNotIn('mini_tether',readback)

    def test_closed_object_cannot_write_after_lock_transfer(self):
        self.start()
        old=self.gate
        old.shutdown()
        self.gate=LinuxGate(self.c,self.router)
        for action in [lambda: old.owner_command('fixture-owner',self.revision(),dict(op='enable')),
                       lambda: old.close('unused'), lambda: old.counters('unused'),
                       lambda: old.open(self.revision(),'unused',self.bindings[0],10),
                       lambda: old.attachment(self.revision(),None), lambda: old.observe(self.revision(),{})]:
            with self.assertRaisesRegex(Rejected,'gate_closed'):
                action()

    def test_open_stop_are_serialized_in_one_process(self):
        self.start()
        original=self.gate._nft
        installing=threading.Event(); release=threading.Event(); stopped=threading.Event()
        def delayed(script=None,args=None):
            if script and 'add quota' in script:
                installing.set()
                if not release.wait(5): raise RuntimeError('test release timeout')
            return original(script,args)
        self.gate._nft=delayed
        def stop():
            # Revision is obtained after reserve, while install is paused.
            result=self.gate.owner_command('fixture-owner',self.revision(),dict(op='disable'))
            stopped.set()
            return result
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            opening=pool.submit(self.open)
            self.assertTrue(installing.wait(5))
            stopping=pool.submit(stop)
            self.assertFalse(stopped.wait(0.1))
            release.set()
            opening.result(5); stopping.result(5)
        self.gate._nft=original
        self.assertTrue(stopped.is_set())
        self.assertFalse(self.ping())

    def test_foreign_same_name_table_is_not_adopted(self):
        command('ip','netns','exec',self.router,'nft','add','table','inet','mini_tether')
        self.c=create_controller(Path(self.temp.name)/'private')
        for _ in range(2):
            with self.assertRaisesRegex(Rejected,'unowned_existing_table'):
                LinuxGate(self.c,self.router)

    def test_restart_rejects_modified_input_chain(self):
        self.start()
        self.gate.shutdown(); self.gate=None
        command('ip','netns','exec',self.router,'nft','add','rule','inet','mini_tether','input','accept')
        with self.assertRaisesRegex(Rejected,'unexpected_local_rule'):
            LinuxGate(self.c,self.router)

    def test_different_database_cannot_claim_same_namespace(self):
        self.start()
        self.open()
        other=create_controller(Path(self.temp.name)/'other')
        with self.assertRaises(BlockingIOError):
            LinuxGate(other,self.router)
        self.assertTrue(self.ping())
        self.gate.shutdown()
        self.gate=None
        with self.assertRaisesRegex(Rejected,'namespace_owner_mismatch'):
            LinuxGate(other,self.router)
        self.assertFalse(self.ping())

    def test_second_writer_rejected_and_failed_install_retains_hold(self):
        self.start()
        with self.assertRaises(BlockingIOError):
            LinuxGate(self.c,self.router)
        original=self.gate._nft
        def lost_ack(script=None,args=None):
            value=original(script,args)
            if script and 'add quota' in script:
                raise RuntimeError('simulated netlink acknowledgement loss')
            return value
        self.gate._nft=lost_ack
        with self.assertRaisesRegex(RuntimeError,'acknowledgement loss'):
            self.open()
        self.gate._nft=original
        self.assertFalse(self.ping())
        self.assertEqual(self.c.snapshot(int(time.time()))['summary']['reservedBytes'],1000)
        with self.assertRaisesRegex(Rejected,'grant_replay_not_installable'):
            self.open()


if __name__=='__main__':
    unittest.main(verbosity=2)
