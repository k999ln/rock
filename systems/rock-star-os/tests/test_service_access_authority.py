"""One real TLS Wallet/Store/Runner authority; public fixture funds/auth only."""
from contextlib import closing
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))
from blackberryrock.packages import canonical
from entitlement.protocol import PUBLIC_TOKENS, sign_fixture_event
from registry.common import RegistryError
from runner.build_fixture import remote_fixture
from runner.client import consent_for
from runner.protocol import RunnerError, TransportError
from service_access.authority import ClosedServiceAuthority
from service_access.os_client import resolve, clients
from service_access.serve import CONSUMERS, DEVICE, seed, executor, validate, SCHEMA
from wallet_auth.fixture import SoftwareTestAuthenticator
from wallet_backend.client import HTTPSWalletTransport, RemoteWalletService
from wallet_backend.server import platform_service


class Callback:
    def __init__(self): self.calls = 0
    def execute(self, text, recipe, cancel):
        self.calls += 1
        return text.strip(), {'kind': 'fake_callback', 'isolation': 'NOT_RUN'}


class CombinedAuthorityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.now = 1788856800
        self.credential_file = self.root / 'credentials.json'
        self.credential_file.write_bytes(canonical({'schema_version': 1,
            'kind': 'public-development-device-credentials',
            'devices': [{'device_ref': DEVICE, 'owner_actor': 'alice', 'token': PUBLIC_TOKENS['alice']}]}))
        self.credential_file.chmod(0o600)
        self.execution = Callback()
        self.authority = self.make_authority(self.root / 'authority')
        self.addCleanup(lambda: self.authority.close())
        self.authority.start()
        seed(self.authority)
        self.sequence = 0
        self.service_path = self.root / 'service-access.json'
        self.service_path.write_bytes(canonical(self.authority.device_configuration('alice-a', host='127.0.0.1')))
        self.service_path.chmod(0o600)
        self.cache = self.root / 'device'
        self.registry, self.runner_clients = clients(resolve(self.cache, self.service_path), self.cache,
                                                     self.authority.ca_file)
        self.runner = self.runner_clients['cloud']
        token = self.root / 'PUBLIC-wallet-token'
        token.write_text(PUBLIC_TOKENS['alice']); token.chmod(0o600)
        self.wallet_transport = HTTPSWalletTransport(
            f'https://127.0.0.1:{self.authority.wallet.server_port}', self.authority.ca_file, token,
            authority_id=self.authority.authority_id, device_ref=DEVICE)
        self.wallet = RemoteWalletService(self.root / 'wallet-cache', self.wallet_transport, clock=lambda: self.now)
        self.addCleanup(self.wallet.close)
        self.auth = SoftwareTestAuthenticator(self.root / 'authenticator', DEVICE)
        self.addCleanup(self.auth.close)

    def make_authority(self, state, **kwargs):
        return ClosedServiceAuthority(state, consumers=CONSUMERS, device_credentials_file=self.credential_file,
            executor=self.execution, clock=lambda: self.now, start_scheduler=False, start_worker=False, **kwargs)

    def call(self, op, **fields):
        self.sequence += 1
        request = {'v': 1, 'op': op, **fields}
        if op not in ('snapshot', 'wallet.auth.status'):
            request.setdefault('key', f'combined-{self.sequence}')
        response = self.wallet.dispatch(request, peer_uid=1002)
        self.assertTrue(response['ok'], response)
        return response.get('result', response.get('snapshot'))

    def activate(self):
        self.call('wallet.register')
        options = self.call('wallet.auth.begin')
        credential = self.auth.make_credential(options['options'], '0000', 'combined-create')
        self.call('wallet.auth.enroll', challenge_id=options['challenge_id'], credential=credential)
        self.call('wallet.terms', accepted=True, terms_version='rock-wallet-development/1')
        self.call('wallet.consent', accepted=True, terms_version='simulator-monthly-usd-8.88-v1')
        wallet = self.authority.wallet.service.wallet
        sale = wallet.simulate_sale(5000, 'trusted-credit')
        wallet.settle_sale(sale['id'], 'trusted-settlement')
        self.authority.wallet.service.membership.tick()
        self.assertEqual(wallet.snapshot()['billed_minor'], 888)

    def submit(self, key='remote-key'):
        package = remote_fixture()
        return self.runner.submit(package, '  hello  ', key, consent=consent_for(
            package, '  hello  ', target='cloud', endpoint_id=self.runner.endpoint_id, key=key))

    def test_same_authority_store_and_purchaser_registry_before_wallet_registration(self):
        self.assertIs(self.authority.access.store, self.authority.wallet.service.membership.store)
        self.assertIs(self.authority.registry_store.service_access, self.authority.access)
        self.assertIs(self.authority.runner_store.service_access, self.authority.access)
        self.registry.refresh()
        package = self.registry.download('org.rockstar.remote-text', '1.0.0')
        self.assertEqual(package, remote_fixture())
        self.assertFalse(self.call('snapshot')['membership']['registered'])
        with self.assertRaises(RunnerError): self.submit()
        self.assertEqual(self.execution.calls, 0)

    def platform_view(self, wallet):
        platform = object.__new__(platform_service.Platform)
        platform.service_status = resolve(self.cache, self.service_path).status
        return platform.purchaser_service_view(wallet)

    def test_live_paid_status_is_scoped_without_private_owner_or_wallet_data(self):
        state = self.call('snapshot')
        view = self.platform_view(state)
        self.assertTrue(view['fresh'])
        current = view['current']
        self.assertEqual(current['authority_id'], self.authority.authority_id)
        self.assertEqual(current['device_ref'], DEVICE)
        self.assertEqual(current['consumer_id'], 'alice-a')
        self.assertEqual(current['monthly_fee_minor'], 888)
        self.assertEqual(current['paid_state_reason'], 'WALLET_UNREGISTERED')
        self.assertNotIn('runner.cloud.submit', current['allowed_actions'])
        self.assertTrue({'owner_ref','account_id','tenant','token','available_minor'}.isdisjoint(current))
        self.activate()
        current = self.platform_view(self.call('snapshot'))['current']
        self.assertEqual(current['paid_state'], 'PAID')
        self.assertIn('runner.cloud.submit', current['allowed_actions'])
        self.call('wallet.consent', accepted=False, terms_version='simulator-monthly-usd-8.88-v1')
        current = self.platform_view(self.call('snapshot'))['current']
        self.assertFalse(current['auto_renew'])
        self.assertEqual(current['paid_state'], 'PAID')
        self.now = 1790812800
        current = self.platform_view(self.call('snapshot'))['current']
        self.assertEqual(current['paid_state_reason'], 'SUBSCRIPTION_CANCELED')
        self.assertNotIn('runner.cloud.submit', current['allowed_actions'])
        self.assertIn('runner.cloud.recover', current['allowed_actions'])
        self.assertEqual(self.call('snapshot')['billed_minor'], 888)

    def test_malformed_live_tls_status_preserves_cache_without_paid_ui_grant(self):
        self.activate()
        original = self.authority.wallet.service_status_provider
        paid = self.call('snapshot')['service_access']
        try:
            for changed in ({'authority_id':'00000000-0000-4000-8000-000000000001'},
                            {'device_ref':'fixture-different-device'},
                            {'monthly_fee_minor':True}, {'unexpected':'secret'}):
                with self.subTest(changed=changed):
                    self.authority.wallet.service_status_provider = lambda _ref: {**paid, **changed}
                    state = self.call('snapshot')
                    self.assertTrue(state['backend']['stale'])
                    self.assertEqual(state['available_minor'], 4112)
                    self.assertIsNone(self.platform_view(state)['current'])
            self.authority.wallet.service_status_provider = original
            self.assertTrue(self.platform_view(self.call('snapshot'))['fresh'])
        finally:
            self.authority.wallet.service_status_provider = original

    def test_missing_or_foreign_consumer_projection_never_infers_paid_from_balance(self):
        self.activate()
        original = self.authority.wallet.service_status_provider
        paid = self.call('snapshot')['service_access']
        try:
            for projection in (None, {**paid, 'consumer_id':'alice-b'}):
                self.authority.wallet.service_status_provider = lambda _ref: projection
                state = self.call('snapshot')
                self.assertTrue(state['backend']['connected'])
                self.assertEqual(state['available_minor'], 4112)
                self.assertIsNone(self.platform_view(state)['current'])
                self.assertFalse(self.platform_view(state)['fresh'])
        finally:
            self.authority.wallet.service_status_provider = original

    def test_service_projection_failure_keeps_wallet_registration_readable(self):
        def failure(_ref): raise ValueError('unavailable local policy')
        self.authority.wallet.service_status_provider = failure
        state = self.call('snapshot')
        self.assertFalse(state['membership']['registered'])
        self.assertIsNone(state['service_access'])
        self.assertIsNone(self.platform_view(state)['current'])
        self.call('wallet.register')
        self.assertTrue(self.call('snapshot')['membership']['registered'])
        self.assertEqual(self.call('snapshot')['billed_minor'], 0)

    def test_wrong_wallet_credential_cannot_read_service_projection(self):
        self.call('snapshot')
        self.wallet_transport.token = CONSUMERS['alice-a']['token']
        with self.assertRaises(PermissionError):
            self.call('snapshot')

    def test_actual_tls_auth_and_confirmed_888_enable_paid_execution_once(self):
        self.activate()
        receipt = self.submit()
        self.assertTrue(receipt['accepted'])
        self.assertEqual(self.runner.status('remote-key')['state'], 'queued')
        self.authority.runner_store.tick()
        done = self.runner.status('remote-key')
        self.assertEqual(done['state'], 'succeeded')
        self.assertEqual(self.submit(), receipt)
        self.assertEqual(self.execution.calls, 1)
        self.assertEqual(self.call('snapshot')['billed_minor'], 888)

    def test_month_expiry_blocks_new_execution_but_keeps_store_and_receipt_recovery(self):
        self.activate(); receipt = self.submit(); self.authority.runner_store.tick()
        self.now = 1790812800  # 2026-10-01 00:00:00 UTC; default grace is zero.
        self.assertEqual(self.runner.status('remote-key')['state'], 'succeeded')
        self.assertEqual(self.submit(), receipt)
        with self.assertRaises(RunnerError): self.submit('new-after-expiry')
        self.registry.refresh()
        self.assertEqual(self.execution.calls, 1)
        self.assertEqual(self.call('snapshot')['billed_minor'], 888)

    def test_cancel_preserves_paid_period_and_unknown_reply_recovers_original_receipt(self):
        self.activate()
        self.call('wallet.consent', accepted=False, terms_version='simulator-monthly-usd-8.88-v1')
        original = self.runner.transport.exchange
        calls = []
        def dropped(envelope):
            result = original(envelope)
            calls.append(envelope['request']['op'])
            if len(calls) == 1: raise TransportError('controlled lost reply after real TLS commit')
            return result
        self.runner.transport.exchange = dropped
        receipt = self.submit('drop-once')
        self.assertTrue(receipt['accepted'])
        self.assertEqual(calls, ['submit', 'status'])
        self.authority.runner_store.tick()
        self.assertEqual(self.runner.status('drop-once')['state'], 'succeeded')
        self.assertEqual(self.execution.calls, 1)

    def test_queue_admitted_before_expiry_is_rechecked_before_actual_start(self):
        self.activate(); self.submit()
        self.now = 1790812800
        self.authority.runner_store.tick()
        self.assertEqual(self.execution.calls, 0)
        self.assertEqual(self.runner.status('remote-key')['state'], 'failed')

    def test_device_revocation_denies_registry_and_runner_without_changing_paid_ledger(self):
        self.activate(); self.submit()
        event = sign_fixture_event('fulfillment', 'combined-revoke', 'device:' + DEVICE, 2,
                                   self.now, 'suspend', {'device_ref': DEVICE})
        self.authority.access.store.ingest(event)
        with self.assertRaises(RegistryError): self.registry.refresh()
        with self.assertRaises(RunnerError): self.runner.status('remote-key')
        self.authority.runner_store.tick()
        self.assertEqual(self.execution.calls, 0)
        self.assertEqual(self.authority.wallet.service.wallet.snapshot()['billed_minor'], 888)

    def test_same_origin_replacement_authority_is_rejected_by_both_pinned_clients(self):
        ports = dict(registry_port=self.authority.registry.server_port, runner_port=self.authority.runner.server_port,
                     wallet_port=self.authority.wallet.server_port)
        old_id = self.authority.authority_id
        self.authority.close()
        self.authority = self.make_authority(self.root / 'other-authority', **ports)
        self.authority.start(); seed(self.authority)
        self.assertNotEqual(old_id, self.authority.authority_id)
        with self.assertRaises(RegistryError): self.registry.refresh()
        with self.assertRaises((RunnerError, TransportError)): self.runner.status('absent')
        with closing(self.authority.runner_store.connect()) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0], 0)

    def test_close_retry_does_not_close_runner_fd_twice_after_wallet_shutdown_failure(self):
        original = self.authority.wallet.server_close
        attempts = []
        def fail_once():
            attempts.append(True)
            if len(attempts) == 1: raise RuntimeError('controlled still-running Wallet scheduler')
            original()
        with patch.object(self.authority.runner_store, 'close', wraps=self.authority.runner_store.close) as runner_close, \
                patch.object(self.authority.wallet, 'server_close', side_effect=fail_once):
            with self.assertRaises(RuntimeError): self.authority.close()
            self.assertFalse(self.authority.closed)
            self.authority.close(); self.authority.close()
            self.assertEqual(runner_close.call_count, 1)
            self.assertEqual(len(attempts), 2)

    @unittest.skipUnless(sys.platform == 'linux', 'actual Linux process isolation only')
    def test_real_linux_executor_in_same_authority(self):
        self.authority.runner_store.executor = executor(self.root)
        self.activate(); self.submit(); self.authority.runner_store.tick()
        receipt = self.runner.status('remote-key')
        self.assertEqual(receipt['state'], 'succeeded')
        self.assertEqual(receipt['output'], 'hello')
        self.assertEqual(receipt['execution']['kind'], 'actual_linux_isolated_process')


class BackendConfigurationBoundsTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform == 'linux', 'fixed backend filesystem belongs to Linux')
    def test_ports_path_and_retry_bounds(self):
        valid = {'schema': SCHEMA, 'state': '/var/tmp/rock-star-closed-services/fixture',
            'authority_id': '11111111-1111-4111-8111-111111111111',
            'registry_port': 9743, 'runner_port': 9744, 'wallet_port': 9745,
            'grace_seconds': 0, 'max_automatic_failures': 3}
        self.assertEqual(validate(valid), valid)
        for field, value in [('state', '/tmp/foreign'), ('runner_port', 9743), ('wallet_port', True),
                             ('max_automatic_failures', 0), ('grace_seconds', 604801)]:
            with self.subTest(field=field):
                with self.assertRaises((ValueError, TypeError)): validate({**valid, field: value})


if __name__ == '__main__': unittest.main()
