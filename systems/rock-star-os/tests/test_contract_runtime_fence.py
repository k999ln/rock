"""Actual A/C ownership lifetime with real B credentials and Wallet services.

This complements TLS business tests with deterministic in-flight close and
partial-open failure boundaries. No OS/QEMU or legacy-adoption claim.
"""
import fcntl
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os')]
from entitlement.protocol import sign_fixture_event
from wallet_backend.authority_fence import AuthorityFenceCoordinator
from wallet_backend.contract_runtime import ContractRuntime, platform_service
from wallet_backend.owner_router import OwnerRouter
from wallet_backend.runtime_contracts import FreshContractSpec, RuntimeUnavailable, RuntimeCleanupRequired

NOW = 1789000000
DEVICE = 'fixture-lifetime-alice'
TOKEN = 'PUBLIC-FIXTURE-LIFETIME-ALICE-v1'


class ActualRuntimeFenceLifetimeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='gx00-runtime-lifetime-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.runtimes = []
        config = self.root/'credentials.json'
        config.write_text(json.dumps({'schema_version':3,
            'kind':'public-development-owner-device-credentials','devices':[{
                'ledger_ref':'ledger-alice','owner_actor':'alice','owner_ref':'fixture-owner-alice',
                'device_ref':DEVICE,'credential_revision':1,'active':True,'expires_at':NOW+7776000,'token':TOKEN}]}))
        config.chmod(0o600)
        self.router = OwnerRouter(self.root/'router', config, clock=lambda:NOW)
        self.coordinator = AuthorityFenceCoordinator(self.root/'coordinator')
        self.addCleanup(self.close_owned)
        payload = {'device_ref':DEVICE,'owner_ref':'fixture-owner-alice','purchase_ref':'fixture-lifetime-purchase',
            'verification_ref':'fixture-lifetime-verification','verified_at':NOW,'valid_until':NOW+7776000}
        event = sign_fixture_event('fulfillment','fixture-lifetime-handoff','device:'+DEVICE,1,NOW,'handoff',payload)
        self.handoff = self.root/'handoff.json'
        self.handoff.write_text(json.dumps({'schema_version':1,'kind':'public-development-fixture','events':[event]}))
        self.handoff.chmod(0o600)
        self.spec = FreshContractSpec('ledger-alice',self.root/'contract','alice','fixture-owner-alice',DEVICE)

    def close_owned(self):
        for runtime in reversed(self.runtimes): runtime.close()
        self.router.close()
        self.coordinator.close()

    def open_runtime(self):
        runtime = ContractRuntime.open_fresh(self.spec,coordinator=self.coordinator,
            provisioning_file=self.handoff,verifier=self.router,clock=lambda:NOW)
        self.runtimes.append(runtime)
        self.router.bind_runtimes((runtime,))
        principal = self.router.authenticate(DEVICE,TOKEN,runtime.descriptor.wallet_authority_id)
        return runtime, principal

    def authority_lock_is_owned(self):
        descriptor = os.open(self.spec.canonical_state/'authority.lock',os.O_RDWR|os.O_NOFOLLOW)
        try:
            with self.assertRaises(BlockingIOError):
                fcntl.flock(descriptor,fcntl.LOCK_EX|fcntl.LOCK_NB)
        finally: os.close(descriptor)

    def test_close_retains_actual_writer_until_admitted_registration_finishes(self):
        runtime, principal = self.open_runtime()
        entered, finish = threading.Event(), threading.Event()
        replies, errors = [], []
        def admitted_operation():
            try:
                with runtime.admit_write(runtime.descriptor.writer_epoch):
                    entered.set()
                    if not finish.wait(5): raise AssertionError('fixture was not released')
                    # The action was already admitted before close. Nested real
                    # registration must finish under that same retained ticket.
                    replies.append(runtime.dispatch(principal,{'v':1,'op':'wallet.register','key':'inflight-register'},
                        deadline=time.monotonic()+5))
            except BaseException as error: errors.append(error)
        worker = threading.Thread(target=admitted_operation)
        worker.start()
        try:
            self.assertTrue(entered.wait(5))
            with self.assertRaises(RuntimeUnavailable): runtime.close()
            self.assertEqual(runtime._state,'CLOSING')
            self.authority_lock_is_owned()
            with self.assertRaises(RuntimeUnavailable): self.coordinator.close()
            with self.assertRaises(RuntimeUnavailable): self.coordinator.open_active('ledger-alice')
            with self.assertRaises(RuntimeUnavailable):
                runtime.dispatch(principal,{'v':1,'op':'health'},deadline=time.monotonic()+1)
        finally:
            finish.set(); worker.join(5)
        self.assertFalse(worker.is_alive()); self.assertEqual(errors,[])
        self.assertEqual(len(replies),1); self.assertTrue(replies[0]['ok'])
        account = replies[0]['result']['account_id']
        runtime.close()
        reopened = ContractRuntime.open_active('ledger-alice',coordinator=self.coordinator,
            provisioning_file=self.handoff,verifier=self.router,clock=lambda:NOW)
        self.runtimes.append(reopened)
        self.assertEqual(reopened.identity().account_id,account)
        self.assertEqual(reopened.descriptor,runtime.descriptor)
        with reopened.admit_write(reopened.descriptor.writer_epoch):
            rows = reopened._service.membership.store._connect()
            try: self.assertEqual(rows.execute('SELECT COUNT(*) FROM accounts').fetchone()[0],1)
            finally: rows.close()

    def test_partial_open_close_failure_keeps_actual_prepared_permit_until_retry(self):
        # Inject after constructing the actual service; only its identity probe
        # and first close result fail. Every DB, marker and lock is real.
        with patch.object(ContractRuntime,'_observe_identity',side_effect=RuntimeUnavailable('injected identity failure')), \
             patch.object(platform_service.WalletService,'close',side_effect=RuntimeUnavailable('injected close failure')):
            with self.assertRaises(RuntimeCleanupRequired) as caught:
                ContractRuntime.open_fresh(self.spec,coordinator=self.coordinator,
                    provisioning_file=self.handoff,verifier=self.router,clock=lambda:NOW)
        runtime = caught.exception.runtime
        self.runtimes.append(runtime)
        self.assertEqual(runtime._state,'CLOSING')
        self.assertIsNone(runtime._service.membership.thread)
        self.authority_lock_is_owned()
        with self.assertRaises(RuntimeUnavailable): self.coordinator.close()
        runtime.close()
        self.assertEqual(runtime._state,'CLOSED')
        # Incomplete initialization cannot silently become an ACTIVE contract.
        marker = json.loads((self.spec.canonical_state/'AUTHORITY.json').read_text())
        self.assertEqual(marker['state'],'PREPARED')
        with self.assertRaises(RuntimeUnavailable): self.coordinator.open_active('ledger-alice')
        self.assertEqual(self.coordinator.permits,{})
        self.coordinator.close()

    def test_real_scheduler_stops_before_actual_authority_lock_release(self):
        runtime, _ = self.open_runtime()
        runtime.start_scheduler()
        worker = runtime._service.membership.thread
        self.assertIsNotNone(worker); self.assertTrue(worker.is_alive())
        runtime.close()
        self.assertFalse(worker.is_alive())
        self.assertEqual(self.coordinator.permits,{})
        descriptor = os.open(self.spec.canonical_state/'authority.lock',os.O_RDWR|os.O_NOFOLLOW)
        try: fcntl.flock(descriptor,fcntl.LOCK_EX|fcntl.LOCK_NB)
        finally: os.close(descriptor)
        with self.assertRaises(RuntimeUnavailable): runtime.start_scheduler()


if __name__ == '__main__': unittest.main()
