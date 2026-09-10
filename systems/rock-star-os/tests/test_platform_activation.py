"""Actual Platform API wiring; injected authenticated peer response fixture only."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import test_operations_device as device_fixture
from test_operations_device import wallet_fixture

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('rock_platform_activation_test',ROOT/'os/platform/service.py')
service=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(service)


class PlatformActivationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.status={'mode':'purchaser-fixture','state':'configured','simulation_only':True,
                     'authority_id':'11111111-1111-4111-8111-111111111111',
                     'consumer_id':'alice-a','device_ref':'fixture-device-a'}

    def until(self,predicate):
        deadline=time.monotonic()+2
        while not predicate():
            if time.monotonic()>=deadline:self.fail('bounded Platform cache deadline')
            time.sleep(.005)

    def platform(self,**fields):
        result=service.Platform(self.temp.name,ROOT/'examples/registry',service_status=self.status,**fields)
        self.addCleanup(result.close);return result

    def test_sync_default_snapshot_uses_one_wallet_read_and_unknown_activation(self):
        with patch.object(service,'call',return_value={'ok':True,'snapshot':wallet_fixture()}) as call:
            platform=self.platform();view=platform.snapshot()
        self.assertEqual(call.call_count,1);self.assertEqual(view['wallet']['available_minor'],5000)
        self.assertEqual(view['device_activation']['state'],'UNAVAILABLE')
        self.assertFalse(view['device_activation']['can_activate'])

    def test_slow_async_wallet_does_not_queue_basic_hub_snapshot(self):
        entered=threading.Event();release=threading.Event()
        def blocked(*args,**kwargs):entered.set();release.wait(2);return {'ok':True,'snapshot':wallet_fixture()}
        with patch.object(service,'call',side_effect=blocked):
            platform=self.platform(async_wallet_view=True)
            try:
                self.assertTrue(entered.wait(1));start=time.monotonic();view=platform.snapshot()
                self.assertLess(time.monotonic()-start,.2);self.assertIsNone(view['wallet'])
                self.assertIn('installed',view['hub']);self.assertFalse(view['device_activation']['can_activate'])
            finally:release.set();platform.close()
        self.assertFalse(platform.wallet_view.thread.is_alive())

    def test_wallet_uncertainty_invalidates_cache_and_does_not_forge_failed_receipt(self):
        block=threading.Event();second=threading.Event();allow=threading.Event()
        def call(_path,request,*args,**kwargs):
            if request['op']=='snapshot':
                if block.is_set():second.set();allow.wait(2)
                return {'ok':True,'snapshot':wallet_fixture()}
            raise TimeoutError('fixture lost response')
        with patch.object(service,'call',side_effect=call):
            platform=self.platform(async_wallet_view=True)
            try:
                self.until(lambda:platform.wallet_snapshot() is not None);block.set()
                request={'v':1,'op':'wallet.consent','accepted':False,'key':'same-key'}
                with self.assertRaises(service.ServiceUnavailable):platform.dispatch(request,peer_uid=1000)
                self.assertTrue(second.wait(1));view=platform.snapshot()
                self.assertTrue(view['wallet']['backend']['stale']);self.assertEqual(view['wallet']['available_minor'],5000)
                self.assertFalse(view['device_activation']['can_activate'])
            finally:allow.set();platform.close()

    def test_opt_in_does_not_start_reader_for_legacy_local_wallet(self):
        self.status={'mode':'development-fixture','state':'configured','simulation_only':True}
        platform=self.platform(async_wallet_view=True);self.assertIsNone(platform.wallet_view)

    def test_known_readonly_wallet_poll_does_not_invalidate_fresh_view(self):
        def call(_path,request,*args,**kwargs):
            return {'ok':True,'snapshot':wallet_fixture()} if request['op']=='snapshot' else {'ok':True,'result':{}}
        with patch.object(service,'call',side_effect=call):
            platform=self.platform(async_wallet_view=True)
            try:
                self.until(lambda:platform.wallet_snapshot() is not None)
                generation=platform.wallet_view.generation
                for op in ('wallet.membership','wallet.billing.status','wallet.auth.status','wallet.atm.status','wallet.atm.history'):
                    platform.dispatch({'v':1,'op':op},peer_uid=1000)
                self.assertEqual(platform.wallet_view.generation,generation)
                self.assertTrue(platform.wallet_snapshot()['backend']['view_fresh'])
                platform.dispatch({'v':1,'op':'wallet.future-mutation','key':'key'},peer_uid=1000)
                self.assertEqual(platform.wallet_view.generation,generation+1)
            finally:platform.close()

    def test_platform_routes_uid_and_key_echo_to_actual_activation_store(self):
        fixture=device_fixture.OperationsDeviceTests('test_eligible_unregistered_unpaid_device_can_activate_without_wallet_mutation')
        fixture.setUpClass();fixture.setUp();self.addCleanup(fixture.doCleanups)
        platform=self.platform();platform.activation=fixture.adapter
        request={'v':1,'op':'device.activation.activate','key':'native-tap'}
        with self.assertRaises(PermissionError):platform.dispatch(request,peer_uid=0)
        first=platform.dispatch(request,peer_uid=1000)
        self.assertEqual(first['result']['request_key'],'native-tap')
        self.assertEqual(first['result']['state'],'ACTIVE')
        self.assertEqual(first,platform.dispatch(request,peer_uid=1000))
        self.assertEqual(platform.dispatch({'v':1,'op':'device.activation.snapshot'},peer_uid=1000)['result']['state'],'ACTIVE')

    def test_observed_readonly_denial_or_unknown_immediately_invalidates_old_eligibility(self):
        mode=['allow'];block=threading.Event();allow=threading.Event();entered=threading.Event()
        def call(_path,request,*args,**kwargs):
            if request['op']=='snapshot':
                if block.is_set():entered.set();allow.wait(2)
                return {'ok':True,'snapshot':wallet_fixture()}
            if mode[0]=='unknown':raise TimeoutError('fixture read transport unknown')
            return {'ok':False,'code':mode[0],'error':'fixture current denial'}
        with patch.object(service,'call',side_effect=call):
            platform=self.platform(async_wallet_view=True)
            try:
                self.until(lambda:platform.wallet_snapshot() is not None);block.set()
                for reason in ('unauthorized','rejected','unknown'):
                    generation=platform.wallet_view.generation;mode[0]=reason
                    request={'v':1,'op':'wallet.auth.status'}
                    if reason=='unknown':
                        with self.assertRaises(service.ServiceUnavailable):platform.dispatch(request,peer_uid=1000)
                    else:self.assertFalse(platform.dispatch(request,peer_uid=1000)['ok'])
                    self.assertEqual(platform.wallet_view.generation,generation+1)
                    self.assertFalse(platform.wallet_snapshot()['backend']['connected'])
                    self.assertTrue(platform.wallet_snapshot()['backend']['stale'])
                self.assertTrue(entered.wait(1))
            finally:allow.set();platform.close()


if __name__=='__main__':unittest.main()
