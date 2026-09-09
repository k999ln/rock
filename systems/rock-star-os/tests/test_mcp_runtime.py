"""Persistent optional MCP lifecycle with actual local TLS/HTTP and public funds.

These are host integration tests, not native UI or physical-device evidence.
"""
import hashlib
from pathlib import Path
import shutil
import socket
import sys
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'os'))
import test_mcp_service_access as foundation
import test_service_access_authority as combined
from mcp_broker import Unavailable
from mcp_broker.device_client import HubClient
from mcp_broker.runtime import PersistentMCPRuntime, SCHEMA, validate
from service_access import serve
from blackberryrock.packages import canonical

FIXTURES = ROOT/'os/registry/fixtures'
TEXT = 'PUBLIC persistent selected text'


def free_ports(number):
    sockets = []
    try:
        for _ in range(number):
            sock = socket.socket(); sockets.append(sock); sock.bind(('127.0.0.1',0))
        return [sock.getsockname()[1] for sock in sockets]
    finally:
        for sock in sockets: sock.close()


def configuration():
    gateway,provider = free_ports(2)
    return {'schema':SCHEMA,'gateway_port':gateway,'provider_port':provider,
            'consumer_id':'alice-a','alias':'memo'}


def call(client,op,**fields):
    return client.request({'v':1,'op':op,**fields})


def execute(client,key='one-job'):
    call(client,'mcp.connect',alias='memo',key='connect-'+key)
    preview = call(client,'mcp.prepare',alias='memo',text=TEXT,key=key)
    call(client,'mcp.submit',key=key,consent=preview['consent'],text=TEXT)
    return preview


def await_state(client,key,expected):
    deadline = time.monotonic()+4
    while True:
        result = call(client,'mcp.status',key=key)
        if result['state'] == expected: return result
        if time.monotonic() >= deadline:
            raise AssertionError('expected '+expected+', observed '+result['state'])
        time.sleep(.02)


class RuntimePersistenceTests(unittest.TestCase):
    def setUp(self):
        self.fx = foundation.MCPServiceAccessTests(methodName='runTest')
        self.addCleanup(lambda:self.assertTrue(self.fx.doCleanups()))
        self.fx.setUp(); self.fx.paid()
        self.config = configuration()
        self.directory = self.fx.root/'persistent-runtime'

    def runtime(self,*,create=False,directory=None,config=None):
        runtime = PersistentMCPRuntime(directory or self.directory,self.fx.access,
            FIXTURES/'development-ca.pem',FIXTURES/'PUBLIC-FIXTURE-KEY.pem',config or self.config,
            create=create,clock=lambda:self.fx.now)
        self.addCleanup(runtime.close)
        return runtime

    def client(self,**changes):
        row = foundation.CONSUMERS['alice-a']
        params = {'authority_id':foundation.AUTHORITY,'consumer_id':'alice-a',
                  'device_ref':row['device_ref'],'token':row['token']}
        params.update(changes)
        return HubClient(f'https://127.0.0.1:{self.config["gateway_port"]}',FIXTURES/'development-ca.pem',**params)

    def test_restart_preserves_result_connection_and_disconnect_generation_without_resend(self):
        before = self.fx.wallet.snapshot()
        first = self.runtime(create=True); self.assertTrue(first.start())
        client = self.client(); execute(client)
        done = await_state(client,'one-job','succeeded')
        first.close()
        second = self.runtime(); self.assertTrue(second.start())
        self.assertEqual(call(client,'mcp.status',key='one-job'),done)
        snapshot = call(client,'mcp.snapshot')
        self.assertEqual(snapshot['connections'][0]['state'],'connected')
        self.assertEqual(second.provider.count(),1)
        self.assertFalse(any(row.get('tool') == 'text.upper' for row in second.provider.wire))
        call(client,'mcp.disconnect',alias='memo',key='disconnect')
        second.close()
        third = self.runtime(); self.assertTrue(third.start())
        self.assertEqual(call(client,'mcp.snapshot')['connections'][0]['state'],'closed')
        self.assertEqual(call(client,'mcp.status',key='one-job'),done)
        self.assertEqual(third.provider.count(),1)
        self.assertEqual(before,self.fx.wallet.snapshot())

    def test_lost_effect_reply_recovers_by_original_status_after_both_sides_restart(self):
        first = self.runtime(create=True); self.assertTrue(first.start())
        client = self.client()
        call(client,'mcp.connect',alias='memo',key='connect')
        preview = call(client,'mcp.prepare',alias='memo',text=TEXT,key='lost-ack')
        first.provider.fault = 'drop_after_commit'
        call(client,'mcp.submit',key='lost-ack',consent=preview['consent'],text=TEXT)
        await_state(client,'lost-ack','unknown')
        self.assertEqual(first.provider.count(),1)
        first.close()
        second = self.runtime(); self.assertTrue(second.start())
        result = call(client,'mcp.reconcile',key='lost-ack')
        # Reconcile wakes the existing worker and returns its current snapshot.
        # Only the original receipt status may be requested after a sent claim.
        self.assertIn(result['state'],('unknown','sending','succeeded'))
        done = await_state(client,'lost-ack','succeeded')
        self.assertEqual(done['result']['output']['text'],TEXT.upper())
        self.assertEqual(second.provider.count(),1)
        self.assertEqual([r.get('tool') for r in second.provider.wire if r['method']=='tools/call'],['effect.status'])

    def test_unpaid_restart_denies_new_work_but_keeps_owned_result_and_disconnect(self):
        first = self.runtime(create=True); self.assertTrue(first.start())
        client = self.client(); execute(client)
        done = await_state(client,'one-job','succeeded'); first.close()
        self.fx.now = 1790812800
        second = self.runtime(); self.assertTrue(second.start())
        self.assertFalse(call(client,'mcp.snapshot')['can_submit'])
        with self.assertRaises(PermissionError):call(client,'mcp.connect',alias='memo',key='unpaid-new')
        self.assertEqual(call(client,'mcp.status',key='one-job'),done)
        receipt = call(client,'mcp.disconnect',alias='memo',key='unpaid-disconnect')
        self.assertEqual(receipt['event'],'disconnected')
        self.assertEqual(call(client,'mcp.snapshot')['connections'][0]['state'],'closed')
        self.assertEqual(second.provider.count(),1)

    def test_empty_retained_component_is_not_recreated(self):
        for number,component in enumerate(('provider','gateway','gateway/alice-a')):
            with self.subTest(component=component):
                directory = self.fx.root/('missing-'+str(number))
                first = self.runtime(create=True,directory=directory); self.assertTrue(first.start())
                execute(self.client()); await_state(self.client(),'one-job','succeeded'); first.close()
                target = directory/component
                for child in target.iterdir():
                    if child.is_dir():shutil.rmtree(child)
                    else:child.unlink()
                second = self.runtime(directory=directory); self.assertFalse(second.start())
                self.assertEqual(second.metadata()['status'],'UNAVAILABLE')
                self.assertEqual(list(target.iterdir()),[])
                self.assertIsNone(second.provider)

    def test_missing_runtime_lock_or_binding_never_starts_fresh_history(self):
        first = self.runtime(create=True); self.assertTrue(first.start());first.close()
        for name in ('runtime.lock','binding.json'):
            path = self.directory/name; old = path.read_bytes(); path.unlink()
            try:
                second = self.runtime();self.assertFalse(second.start())
                self.assertFalse(path.exists())
            finally:path.write_bytes(old);path.chmod(0o600)

    def test_config_change_and_create_again_preserve_existing_bytes(self):
        first = self.runtime(create=True);self.assertTrue(first.start());first.close()
        original = {str(p.relative_to(self.directory)):hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in self.directory.rglob('*') if p.is_file()}
        changed = self.runtime(config={**self.config,'alias':'different'})
        self.assertFalse(changed.start())
        recreated = self.runtime(create=True);self.assertFalse(recreated.start())
        after = {str(p.relative_to(self.directory)):hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in self.directory.rglob('*') if p.is_file()}
        self.assertEqual(original,after)

    def test_duplicate_owner_failure_does_not_stop_original_and_auth_remains_scoped(self):
        first = self.runtime(create=True);self.assertTrue(first.start())
        duplicate = self.runtime();self.assertFalse(duplicate.start());duplicate.close()
        self.assertEqual(first.metadata()['status'],'READY')
        self.assertEqual(call(self.client(),'mcp.snapshot')['history'],[])
        for changes in ({'token':'PUBLIC-FIXTURE-WRONG-OWNER'}, {'device_ref':'other-device'}):
            with self.subTest(changes=changes),self.assertRaises(PermissionError):
                call(self.client(**changes),'mcp.connect',alias='memo',key='wrong-auth')
        self.assertEqual(first.provider.count(),0)

    def test_failed_gateway_drain_retains_provider_and_outer_lock_until_retry(self):
        first = self.runtime(create=True);self.assertTrue(first.start())
        gateway,provider = first.gateway,first.provider
        with patch.object(gateway,'close',side_effect=Unavailable('controlled busy worker')):
            with self.assertRaises(Unavailable):first.close()
            self.assertTrue(provider.thread.is_alive());self.assertIsNotNone(first.fd)
            duplicate = self.runtime();self.assertFalse(duplicate.start())
        first.close()
        self.assertFalse(provider.thread.is_alive());self.assertIsNone(first.fd)
        second = self.runtime();self.assertTrue(second.start())

    def test_unexpected_listener_exit_marks_unavailable_and_drains_remaining_resources(self):
        first = self.runtime(create=True);self.assertTrue(first.start())
        provider = first.provider
        first.server.shutdown();first.thread.join(3)
        self.assertEqual(first.poll()['status'],'UNAVAILABLE')
        self.assertFalse(provider.thread.is_alive());self.assertIsNone(first.fd)
        with self.assertRaises(ValueError):first.start()
        second = self.runtime();self.assertTrue(second.start())

    def test_configuration_bounds_precede_any_filesystem_or_network_setup(self):
        for changes in ({'gateway_port':True},{'provider_port':80}, {'alias':'../escape'},
                        {'gateway_port':self.config['provider_port']}, {'extra':False}):
            with self.subTest(changes=changes),self.assertRaises(ValueError):
                self.runtime(config={**self.config,**changes})
        with self.assertRaises(ValueError):validate(self.config,occupied_ports=[self.config['provider_port']])
        self.assertFalse(self.directory.exists())


class PurchaserOptionalMCPTests(unittest.TestCase):
    def setUp(self):
        self.fx = combined.CombinedAuthorityTests(methodName='runTest')
        self.addCleanup(lambda:self.assertTrue(self.fx.doCleanups()))
        self.fx.setUp();self.fx.activate()
        self.ports = {name+'_port':getattr(self.fx.authority,name).server_port
                      for name in ('registry','runner','wallet')}
        self.config = configuration()
        self.fx.authority.close()
        self.reopen(create=True)

    def reopen(self,*,create=False):
        self.fx.authority = self.fx.make_authority(self.fx.root/'authority',**self.ports,
            mcp_configuration=self.config,mcp_create=create)
        self.fx.authority.start()
        return self.fx.authority

    def client(self):
        config = self.fx.authority.device_configuration('alice-a',host='127.0.0.1')
        return HubClient(f'https://127.0.0.1:{self.config["gateway_port"]}',FIXTURES/'development-ca.pem',
            authority_id=config['authority_id'],consumer_id=config['consumer_id'],
            device_ref=config['device_ref'],token=config['token'])

    def test_entire_authority_restart_keeps_shared_paid_state_and_single_mcp_result(self):
        authority = self.fx.authority;self.assertEqual(authority.metadata()['mcp']['status'],'READY')
        before = self.fx.call('snapshot');client = self.client();execute(client)
        done = await_state(client,'one-job','succeeded');original_id = authority.authority_id
        authority.close();self.reopen()
        self.assertEqual(self.fx.authority.authority_id,original_id)
        self.assertEqual(call(client,'mcp.status',key='one-job'),done)
        self.assertEqual(self.fx.authority.mcp.provider.count(),1)
        self.assertEqual(self.fx.call('snapshot')['available_minor'],before['available_minor'])
        self.assertEqual(self.fx.call('snapshot')['billed_minor'],888)
        self.assertIs(self.fx.authority.mcp.controller.store,self.fx.authority.access.store)

    def test_optional_provider_port_failure_keeps_actual_wallet_and_registry_recovery_alive(self):
        self.fx.authority.close()
        with socket.socket() as occupied:
            occupied.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
            occupied.bind(('127.0.0.1',self.config['provider_port']));occupied.listen(1)
            authority = self.reopen()
            self.assertEqual(authority.metadata()['mcp']['status'],'UNAVAILABLE')
            self.assertTrue(all(thread.is_alive() for _,thread in authority.threads))
            self.assertEqual(self.fx.call('snapshot')['billed_minor'],888)
            self.assertTrue(self.fx.registry.refresh())
            authority.close()
        self.assertEqual(self.reopen().metadata()['mcp']['status'],'READY')

    def test_empty_retained_provider_keeps_wallet_alive_without_new_database(self):
        self.fx.authority.close();provider = self.fx.root/'authority/mcp/provider'
        for child in provider.iterdir():child.unlink()
        authority = self.reopen()
        self.assertEqual(authority.metadata()['mcp']['status'],'UNAVAILABLE')
        self.assertEqual(list(provider.iterdir()),[])
        self.assertEqual(self.fx.call('snapshot')['available_minor'],4112)
        authority.close()
        with self.assertRaises(ValueError):
            self.fx.make_authority(self.fx.root/'authority',**self.ports)


class OptionalMCPConfigurationTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform == 'linux','saved backend path belongs to Linux')
    def test_legacy_canonical_bytes_and_new_config_are_strict_and_distinct(self):
        old = {'schema':serve.SCHEMA,'state':'/var/tmp/rock-star-closed-services/mcp-test',
               'authority_id':foundation.AUTHORITY,'registry_port':9743,'runner_port':9744,
               'wallet_port':9745,'grace_seconds':0,'max_automatic_failures':3}
        self.assertEqual(canonical(serve.validate(old)),canonical(old))
        mcp = {'schema':SCHEMA,'gateway_port':9746,'provider_port':9747,'consumer_id':'alice-a','alias':'memo'}
        new = {**old,'mcp':mcp};self.assertEqual(serve.validate(new),new)
        for changed in (None,{**mcp,'provider_port':9743},{**mcp,'consumer_id':'bob'},
                        {**mcp,'gateway_port':True},{**mcp,'unknown':'ignored'}):
            with self.subTest(changed=changed),self.assertRaises(ValueError):serve.validate({**old,'mcp':changed})


if __name__ == '__main__':unittest.main()
