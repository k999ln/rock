"""Bounded thread/event tests; no live network or financial operation."""
import copy
import importlib.util
from pathlib import Path
import threading
import time
import unittest
from test_operations_device import wallet_fixture
from wallet_backend.client import BackendUnavailable

SPEC=importlib.util.spec_from_file_location('rock_platform_wallet_view',Path(__file__).resolve().parents[1]/'os/platform/wallet_view.py')
MODULE=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(MODULE)
WalletView=MODULE.WalletView


class PlatformWalletViewTests(unittest.TestCase):
    def start(self,read,**fields):
        view=WalletView(read,interval=.1,ttl=.3,**fields);self.addCleanup(view.close);return view

    def until(self,predicate):
        deadline=time.monotonic()+2
        while not predicate():
            if time.monotonic()>=deadline:self.fail('bounded reader condition not reached')
            time.sleep(.005)

    def test_initial_unknown_and_slow_reader_never_block_snapshot_or_duplicate_worker(self):
        entered=threading.Event();release=threading.Event();calls=[]
        def read():calls.append(1);entered.set();release.wait(2);return wallet_fixture()
        view=self.start(read);self.addCleanup(release.set)
        self.assertTrue(entered.wait(1));start=time.monotonic()
        for _ in range(50):self.assertIsNone(view.snapshot())
        self.assertLess(time.monotonic()-start,.1);self.assertEqual(len(calls),1)
        release.set();self.until(lambda:view.snapshot() is not None)
        snapshot=view.snapshot();snapshot['available_minor']=0;snapshot['service_access']['device_eligible']=False
        self.assertEqual(view.snapshot()['available_minor'],5000)
        self.assertTrue(view.snapshot()['service_access']['device_eligible'])

    def test_ttl_and_clock_rollback_mark_stale_preserving_money_and_original_sync_time(self):
        now=[10.0];view=self.start(wallet_fixture,clock=lambda:now[0])
        self.until(lambda:view.snapshot() is not None)
        now[0]=10.3;self.assertFalse(view.snapshot()['backend']['connected'])
        self.assertTrue(view.snapshot()['backend']['stale']);self.assertEqual(view.snapshot()['available_minor'],5000)
        now[0]=9;self.assertFalse(view.snapshot()['backend']['view_fresh'])

    def test_failure_and_malformed_read_retain_last_value_as_stale_then_recover(self):
        mode=['valid']
        def read():
            if mode[0]=='denied':raise PermissionError('fixture peer identity mismatch')
            if mode[0]=='malformed':return {'ok':True}
            return wallet_fixture()
        view=self.start(read);self.until(lambda:view.snapshot() is not None)
        for failure in ('denied','malformed'):
            mode[0]=failure;view.invalidate();self.until(lambda:not view.pending)
            self.assertFalse(view.snapshot()['backend']['connected']);self.assertEqual(view.snapshot()['available_minor'],5000)
        mode[0]='valid';view.invalidate();self.until(lambda:view.snapshot()['backend']['view_fresh'])

    def test_inflight_pre_mutation_reply_is_discarded_after_invalidation(self):
        entered=threading.Event();release=threading.Event();calls=[]
        def read():
            calls.append(1)
            if len(calls)==1:entered.set();release.wait(2)
            result=wallet_fixture();result['available_minor']=5000 if len(calls)==1 else 4112;return result
        view=self.start(read);self.addCleanup(release.set);self.assertTrue(entered.wait(1))
        view.invalidate();release.set()
        self.until(lambda:view.snapshot() is not None)
        self.assertEqual(view.snapshot()['available_minor'],4112);self.assertGreaterEqual(len(calls),2)

    def test_close_joins_owned_worker_and_failure_does_not_claim_stopped(self):
        entered=threading.Event();release=threading.Event()
        def read():entered.set();release.wait(2);return wallet_fixture()
        view=self.start(read,close_timeout=.02);self.addCleanup(release.set);self.assertTrue(entered.wait(1))
        with self.assertRaises(RuntimeError):view.close()
        self.assertTrue(view.thread.is_alive());release.set();view.thread.join(1);view.close()
        self.assertFalse(view.thread.is_alive());self.assertIsNone(view.snapshot())

    def test_periodic_refresh_stays_single_and_auth_failure_before_first_read_is_unknown(self):
        calls=[]
        def read():calls.append(threading.get_ident());raise PermissionError('fixture wrong peer')
        view=self.start(read);self.until(lambda:len(calls)>=2)
        self.assertEqual(len(set(calls)),1);self.assertIsNone(view.snapshot())

    def test_invalid_timing_and_oversized_or_nonfinite_values_are_rejected(self):
        for fields in ({'ttl':float('nan')},{'interval':0},{'interval':6,'ttl':5},{'close_timeout':True}):
            with self.subTest(fields=fields),self.assertRaises(ValueError):WalletView(wallet_fixture,**fields)
        value=wallet_fixture();value['huge']='x'*(1024*1024)
        with self.assertRaises(ValueError):WalletView._checked(value)
        value=wallet_fixture();value['available_minor']=True
        with self.assertRaises(BackendUnavailable):WalletView._checked(value)


if __name__=='__main__':unittest.main()
