"""A-only protocol/lifetime guards using explicit component/permit test doubles.

These do not prove C storage/fencing, TLS owner routing, Wallet authentication or
money semantics. Those require integration with actual coordinator and services.
"""
from contextlib import contextmanager
from pathlib import Path
import sys
import threading
import time
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))
from wallet_backend.contract_runtime import ContractRuntime, platform_service
from wallet_backend.runtime_contracts import (ContractDescriptor, ContractIdentity,
    FreshContractSpec, AuthenticatedDevicePrincipal, RuntimeAdmissionRejected, RuntimeUnavailable, RuntimeCleanupRequired)

DESCRIPTOR = ContractDescriptor('fixture-ledger-a', '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222', 'alice', 'fixture-owner-alice',
    'fixture-device-a', Path('/protocol-test-only/never-created'), 1)
PRINCIPAL = AuthenticatedDevicePrincipal(DESCRIPTOR.ledger_ref, 'alice', 'fixture-owner-alice', 'fixture-device-a', 1)


class PermitFixture:
    def __init__(self):
        self.descriptor = DESCRIPTOR
        self.hooks = self
        self.local = threading.local()
        self.gate = threading.RLock()
        self.active = 0
        self.quiesced = self.released = False
        self.events = []
        self.fail_binding = False

    def held_by_current_thread(self):
        return getattr(self.local, 'depth', 0) > 0

    def require_held(self):
        if not self.held_by_current_thread():
            raise RuntimeUnavailable('test capability absent')

    @contextmanager
    def admit_write(self, expected_epoch):
        with self.gate:
            if expected_epoch != 1 or self.released or self.quiesced and not self.held_by_current_thread():
                raise RuntimeUnavailable('test admission closed')
            depth = getattr(self.local, 'depth', 0)
            self.local.depth = depth + 1
            self.active += 1
            self.events.append('enter')
            try:
                yield
            finally:
                self.events.append('exit')
                self.active -= 1
                self.local.depth = depth

    def initialize(self):
        self.events.append('initialize')
        return self.admit_write(1)

    def activate(self, observed):
        if self.held_by_current_thread():
            raise AssertionError('activation requires completed bootstrap scope')
        if observed != ContractIdentity(DESCRIPTOR, None):
            raise AssertionError('unexpected observed fixture identity')
        self.events.append('activate')
        return self

    def abort(self):
        self.events.append('abort')

    def bind_registered_account(self, account):
        self.require_held()
        self.events.append(('bind', account))
        if self.fail_binding:
            raise RuntimeUnavailable('fixture interrupted binding')

    def quiesce(self):
        self.events.append('quiesce')
        self.quiesced = True

    def release(self):
        self.events.append('release-attempt')
        if self.active or not self.quiesced:
            raise RuntimeUnavailable('test action still active')
        self.released = True
        self.events.append('released')


class RuntimeLifetimeTests(unittest.TestCase):
    def setUp(self):
        # This protocol-only fixture deliberately owns no storage. Actual
        # pre-constructor game guards are covered by the real-DB restore suite.
        probe=patch('game_exchange.current_restore.require_normal_open',return_value=False)
        probe.start();self.addCleanup(probe.stop)

    def make_runtime(self):
        permit = PermitFixture()
        callback = lambda _: {'fixture': True}
        service = Mock()
        service.membership.thread = None
        service.close.side_effect = lambda: permit.events.append('service-close')
        service.membership.start.side_effect = lambda: permit.events.append('scheduler-start')
        verifier = Mock(spec=['assert_current'])
        verifier.assert_current.side_effect = lambda *_: (permit.require_held(), permit.events.append('verified'))
        def construct(*args, **kwargs):
            permit.require_held()
            self.assertEqual(args, (DESCRIPTOR.canonical_state,))
            self.assertFalse(kwargs['start_scheduler'])
            self.assertTrue(kwargs['contract_devices'])
            self.assertTrue(kwargs['authentication_required'])
            self.assertIs(kwargs['managed_write_hooks'], permit)
            self.assertEqual(kwargs['authority_id'], DESCRIPTOR.wallet_authority_id)
            permit.events.append('construct')
            return service
        with patch.object(platform_service, 'WalletService', side_effect=construct) as factory, \
                patch.object(ContractRuntime, '_observe_identity', return_value=ContractIdentity(DESCRIPTOR, None)):
            runtime = ContractRuntime._open_with_permit(permit, provisioning_file='explicit-fixture',
                verifier=verifier, service_status_provider=callback)
        self.assertEqual(factory.call_count, 1)
        runtime._observe_identity = Mock(return_value=ContractIdentity(DESCRIPTOR, None))
        @contextmanager
        def scope(device, owner):
            permit.require_held()
            self.assertEqual((device, owner), ('fixture-device-a', 'alice'))
            permit.events.append('device-enter')
            try: yield
            finally: permit.events.append('device-exit')
        service.membership.device_scope.side_effect = scope
        service.dispatch.return_value = {'ok': True, 'result': {'fixture': True}}
        self.addCleanup(runtime.close)
        return runtime, permit, service, verifier, callback

    def test_bootstrap_constructs_once_before_activate_and_no_early_scheduler(self):
        runtime, permit, service, _, _ = self.make_runtime()
        self.assertEqual(permit.events, ['initialize', 'enter', 'construct', 'exit', 'activate'])
        service.membership.start.assert_not_called()
        runtime.start_scheduler(); runtime.start_scheduler()
        self.assertEqual(service.membership.start.call_count, 1)

    def test_constructor_failure_aborts_without_activation_or_scheduler(self):
        permit = PermitFixture()
        with patch.object(platform_service, 'WalletService', side_effect=ValueError('fixture constructor failure')):
            with self.assertRaisesRegex(ValueError, 'fixture constructor failure'):
                ContractRuntime._open_with_permit(permit, provisioning_file='fixture', verifier=Mock())
        self.assertEqual(permit.events, ['initialize', 'enter', 'exit', 'abort'])

    def test_partial_open_cleanup_failure_retains_retryable_handle_and_permit(self):
        permit=PermitFixture();service=Mock();service.membership.thread=None
        service.close.side_effect=RuntimeError('fixture cleanup failed')
        with patch.object(platform_service,'WalletService',return_value=service), \
                patch.object(ContractRuntime,'_observe_identity',side_effect=ValueError('fixture identity mismatch')):
            with self.assertRaises(RuntimeCleanupRequired) as caught:
                ContractRuntime._open_with_permit(permit,provisioning_file='fixture',verifier=Mock())
        runtime=caught.exception.runtime
        self.assertEqual(runtime._state,'CLOSING')
        self.assertNotIn('abort',permit.events)
        service.close.side_effect=None
        runtime.close()
        self.assertEqual(runtime._state,'CLOSED')
        self.assertEqual(permit.events.count('abort'),1)

    def test_option_factory_or_auth_bypass_rejected_before_coordinator(self):
        coordinator = Mock()
        for option in ({'authentication_required': False}, {'service_factory': object()}):
            with self.assertRaises(ValueError):
                ContractRuntime.open_fresh(FreshContractSpec('a',Path('/unused'),'alice','a','a'),
                    coordinator=coordinator, provisioning_file='fixture', verifier=Mock(), **option)
        coordinator.prepare_fresh.assert_not_called()

    def test_all_public_opens_bind_protected_registry_before_any_storage_permit(self):
        events=[]
        class Verifier:
            def registry_identity(self):events.append('registry-read');return Path('/fixture-registry'), 'fixture-registry-uuid'
            def assert_current(self,*args):pass
        class Coordinator:
            def bind_owner_registry(self,*identity):
                self.identity=identity;events.append('registry-bind')
            def prepare_fresh(self,*args):events.append('fresh');return object()
            def open_active(self,*args):events.append('active');return object()
            def prepare_legacy(self,*args):events.append('legacy');return object()
        for method,name in ((ContractRuntime.open_fresh,'fresh'),(ContractRuntime.open_active,'active'),
                            (ContractRuntime.open_adopted,'legacy')):
            events.clear();coordinator=Coordinator()
            with patch.object(ContractRuntime,'_open_with_permit',return_value='fixture-owned-runtime'):
                self.assertEqual(method(object(),coordinator=coordinator,verifier=Verifier(),
                    provisioning_file='fixture'),'fixture-owned-runtime')
            self.assertEqual(events,['registry-read','registry-bind',name])
            self.assertEqual(coordinator.identity,(Path('/fixture-registry'),'fixture-registry-uuid'))
            coordinator.bind_owner_registry=Mock(side_effect=ValueError('wrong protected registry'))
            with patch.object(ContractRuntime,'_open_with_permit') as opened:
                with self.assertRaises(ValueError):
                    method(object(),coordinator=coordinator,verifier=Verifier(),provisioning_file='fixture')
                opened.assert_not_called()

    def test_dispatch_verifies_inside_admission_and_releases_context_after_exception(self):
        runtime, permit, service, verifier, _ = self.make_runtime()
        permit.events.clear()
        service.dispatch.side_effect = ValueError('fixture policy denial')
        with self.assertRaisesRegex(ValueError, 'fixture policy denial'):
            runtime.dispatch(PRINCIPAL, {'v':1,'op':'health'}, deadline=time.monotonic()+1)
        self.assertEqual(permit.events, ['enter','verified','device-enter','device-exit','exit'])
        self.assertFalse(permit.held_by_current_thread())
        verifier.assert_current.assert_called_once_with(PRINCIPAL, DESCRIPTOR)

    def test_wrong_principal_and_body_override_rejected_before_any_admission(self):
        runtime, permit, service, _, _ = self.make_runtime()
        permit.events.clear()
        wrong = AuthenticatedDevicePrincipal('fixture-other-ledger','bob','fixture-owner-bob','fixture-device-b',1)
        with self.assertRaises(RuntimeAdmissionRejected):
            runtime.dispatch(wrong,{'v':1,'op':'health'},deadline=time.monotonic()+1)
        with self.assertRaises(ValueError):
            runtime.dispatch(PRINCIPAL,{'v':1,'op':'health','owner_ref':'fixture-owner-bob'},deadline=time.monotonic()+1)
        self.assertEqual(permit.events,[]);service.dispatch.assert_not_called()

    def test_expiry_after_waiting_for_admission_never_dispatches(self):
        runtime, _, service, verifier, _ = self.make_runtime()
        # Isolate the clock double to this module; the time module is shared by
        # unrelated server/deadline threads in the native test process.
        with patch('wallet_backend.contract_runtime.time', wraps=time) as clock:
            clock.monotonic.side_effect = [0.0, 2.0]
            with self.assertRaises(TimeoutError):
                runtime.dispatch(PRINCIPAL,{'v':1,'op':'health'},deadline=1.0)
        service.dispatch.assert_not_called()
        verifier.assert_current.assert_called_once()

    def test_interrupted_account_binding_blocks_new_mutation_until_same_binding_repairs(self):
        runtime, permit, service, _, _ = self.make_runtime()
        runtime._observe_identity.side_effect = [ContractIdentity(DESCRIPTOR,None),
            ContractIdentity(DESCRIPTOR,'fixture-account'),ContractIdentity(DESCRIPTOR,'fixture-account')]
        permit.fail_binding = True
        with self.assertRaises(RuntimeUnavailable):
            runtime.dispatch(PRINCIPAL,{'v':1,'op':'wallet.register','key':'same-key'},deadline=time.monotonic()+1)
        with self.assertRaises(RuntimeUnavailable):
            runtime.dispatch(PRINCIPAL,{'v':1,'op':'health'},deadline=time.monotonic()+1)
        self.assertEqual(service.dispatch.call_count,1)
        self.assertIsNone(runtime._bound_account)
        runtime._observe_identity.side_effect = None
        runtime._observe_identity.return_value = ContractIdentity(DESCRIPTOR,'fixture-account')
        permit.fail_binding = False
        runtime.dispatch(PRINCIPAL,{'v':1,'op':'wallet.register','key':'same-key'},deadline=time.monotonic()+1)
        self.assertEqual(runtime._bound_account,'fixture-account')

    def test_close_failure_retains_callback_and_writer_for_explicit_retry(self):
        runtime, permit, service, _, callback = self.make_runtime()
        service.close.side_effect = RuntimeError('fixture close incomplete')
        with self.assertRaises(RuntimeError):runtime.close()
        self.assertFalse(permit.released)
        self.assertIs(runtime._service_status_provider,callback)
        self.assertEqual(runtime._state,'CLOSING')
        service.close.side_effect = None
        runtime.close();runtime.close()
        self.assertTrue(permit.released)
        self.assertIsNone(runtime._service_status_provider)
        self.assertEqual(permit.events.count('released'),1)

    def test_actual_live_thread_prevents_release_until_it_has_stopped(self):
        runtime, permit, service, _, _ = self.make_runtime()
        stop = threading.Event()
        thread = threading.Thread(target=stop.wait)
        thread.start()
        service.membership.thread = thread
        try:
            with self.assertRaises(RuntimeUnavailable):runtime.close()
            self.assertFalse(permit.released)
        finally:
            stop.set();thread.join(1)
        runtime.close()
        self.assertTrue(permit.released)

    def test_existing_admission_can_finish_nested_work_while_close_refuses_release(self):
        runtime, permit, _, _, _ = self.make_runtime()
        with runtime.admit_write(1):
            with self.assertRaises(RuntimeUnavailable):runtime.close()
            with runtime.admit_write(1):permit.require_held()
            self.assertFalse(permit.released)
        with self.assertRaises(RuntimeUnavailable):
            with runtime.admit_write(1):self.fail('new closed admission')
        runtime.close()
        self.assertTrue(permit.released)


if __name__ == '__main__':unittest.main()
