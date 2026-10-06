"""Observer diagnostics expose only validated simulation metadata; no guest is used."""
from contextlib import ExitStack, redirect_stderr, redirect_stdout
import copy
from datetime import datetime
import hashlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch


SOURCE = Path(__file__).resolve().parents[1] / 'guest_observer.py'
SPEC = importlib.util.spec_from_file_location('rock_guest_observer_privacy_test', SOURCE)
observer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(observer)

READ_OPERATIONS = ['wallet.membership', 'wallet.billing.status', 'snapshot']
OUTPUT_KEYS = {
    'observed_utc', 'simulation_only', 'read_operations', 'registration_status',
    'monthly_periods_observed', 'wallet_billed_minor', 'worker_alive',
    'new_money_or_identity_actions',
}
PRIVATE_MARKER = 'SYNTHETIC_OBSERVER_PRIVATE_MARKER'


def responses():
    common = {'simulation_only': True, 'monthly_fee_minor': 888, 'currency': 'USD'}
    return {
        'wallet.membership': {'ok': True, 'result': {
            **common, 'backend_connected': False, 'real_identity_verified': False,
            'registration_input_fields': [], 'registration_status': 'REGISTERED',
        }},
        'wallet.billing.status': {'ok': True, 'result': {
            **common, 'history': [
                {'period': '2026-10', 'status': 'retry_wait'},
                {'period': '2026-09', 'status': 'paid'},
            ], 'worker_alive': True,
        }},
        'snapshot': {'ok': True, 'snapshot': {
            **common, 'bills': [{'period': '2026-09', 'amount_minor': 888}],
            'ledger_balance_minor': 0, 'billed_minor': 888,
        }},
    }


class GuestObserverPrivacyTests(unittest.TestCase):
    def read_observation(self, payloads):
        operations = []
        def read(operation):
            operations.append(operation)
            return copy.deepcopy(payloads[operation])
        before = copy.deepcopy(payloads)
        result = observer.observe(read)
        self.assertEqual(operations, READ_OPERATIONS)
        self.assertEqual(payloads, before)
        return result

    def assert_safe_rejection(self, payloads):
        operations = []
        def read(operation):
            operations.append(operation)
            return copy.deepcopy(payloads[operation])
        output, errors = io.StringIO(), io.StringIO()
        with redirect_stdout(output), redirect_stderr(errors):
            with self.assertRaises(ValueError) as raised:
                observer.observe(read)
        self.assertNotIn(PRIVATE_MARKER, str(raised.exception))
        self.assertNotIn(PRIVATE_MARKER, output.getvalue() + errors.getvalue())
        self.assertNotIn('ROCK_ENTITLEMENT_OBSERVER_PASS', output.getvalue())
        self.assertTrue(set(operations) <= set(READ_OPERATIONS))

    def invoke_main(self, payloads, expected_failure=False, read_error=False):
        operations = []
        service_bytes = b'unit fixture service source, not an installed guest service'
        def call(path, request, uid):
            self.assertEqual(path, '/synthetic/wallet.sock')
            self.assertEqual(uid, 1002)
            self.assertEqual(set(request), {'v', 'op'})
            self.assertEqual(request['v'], 1)
            operations.append(request['op'])
            if read_error:
                raise RuntimeError(PRIVATE_MARKER)
            return copy.deepcopy(payloads[request['op']])
        service = SimpleNamespace(WALLET_SOCKET='/synthetic/wallet.sock', WALLET_UID=1002, call=call)
        loaded = []
        def load(module):
            self.assertIs(module, service)
            loaded.append(True)
        spec = SimpleNamespace(loader=SimpleNamespace(exec_module=load))
        output, errors = io.StringIO(), io.StringIO()
        with ExitStack() as stack:
            stack.enter_context(patch.object(observer.platform, 'system', return_value='Linux'))
            stack.enter_context(patch.object(observer.platform, 'machine', return_value='aarch64'))
            stack.enter_context(patch.object(observer.os, 'geteuid', return_value=0))
            source_spec = stack.enter_context(patch.object(observer.importlib.util, 'spec_from_file_location', return_value=spec))
            stack.enter_context(patch.object(observer.importlib.util, 'module_from_spec', return_value=service))
            source_read = stack.enter_context(patch.object(observer.Path, 'read_bytes', return_value=service_bytes))
            stack.enter_context(redirect_stdout(output))
            stack.enter_context(redirect_stderr(errors))
            if expected_failure:
                with self.assertRaises(SystemExit) as raised:
                    observer.main()
                self.assertNotIn(PRIVATE_MARKER, str(raised.exception))
                self.assertEqual(raised.exception.code, 'Wallet observer report unavailable')
                source_read.assert_not_called()
            else:
                observer.main()
                source_read.assert_called_once_with()
            source_spec.assert_called_once_with(
                'rock_entitlement_readonly_observer_service', Path('/usr/lib/rock-platform/service.py'))
        self.assertEqual(loaded, [True])
        self.assertEqual(operations, READ_OPERATIONS[:1] if read_error else READ_OPERATIONS)
        self.assertNotIn(PRIVATE_MARKER, output.getvalue() + errors.getvalue())
        self.assertEqual(errors.getvalue(), '')
        return output.getvalue(), hashlib.sha256(service_bytes).hexdigest()

    def test_legitimate_values_preserve_exact_read_only_output(self):
        for status in ('HANDOFF_REQUIRED', 'REGISTRATION_REQUIRED', 'REGISTERED'):
            for worker in (False, True):
                for billed in (0, 888, 1776):
                    with self.subTest(status=status, worker=worker, billed=billed):
                        payloads = responses()
                        payloads['wallet.membership']['result']['registration_status'] = status
                        payloads['wallet.billing.status']['result']['worker_alive'] = worker
                        payloads['snapshot']['snapshot']['billed_minor'] = billed
                        result = self.read_observation(payloads)
                        self.assertEqual(set(result), OUTPUT_KEYS)
                        self.assertEqual(result['registration_status'], status)
                        self.assertIs(result['worker_alive'], worker)
                        self.assertEqual(result['wallet_billed_minor'], billed)
                        self.assertIs(type(result['wallet_billed_minor']), int)
                        self.assertEqual(result['monthly_periods_observed'], ['2026-10', '2026-09'])
                        self.assertEqual(result['read_operations'], READ_OPERATIONS)
                        self.assertIs(result['simulation_only'], True)
                        self.assertIs(result['new_money_or_identity_actions'], False)
                        self.assertIsNotNone(datetime.fromisoformat(result['observed_utc']).tzinfo)

    def test_unrecognized_private_fields_never_enter_report(self):
        payloads = responses()
        for operation, container in (
            ('wallet.membership', 'result'), ('wallet.billing.status', 'result'), ('snapshot', 'snapshot'),
        ):
            payloads[operation]['private_metadata'] = PRIVATE_MARKER
            payloads[operation][container]['private_metadata'] = {'nested': PRIVATE_MARKER}
        for record in payloads['wallet.billing.status']['result']['history']:
            record['private_metadata'] = PRIVATE_MARKER
        payloads['snapshot']['snapshot']['bills'][0]['private_metadata'] = PRIVATE_MARKER
        result = self.read_observation(payloads)
        self.assertEqual(set(result), OUTPUT_KEYS)
        self.assertNotIn(PRIVATE_MARKER, json.dumps(result))

    def test_registration_status_rejects_unknown_and_nonscalar_values(self):
        for value in (PRIVATE_MARKER, 'registered', '', None, True, 1, [PRIVATE_MARKER], {'private': PRIVATE_MARKER}):
            with self.subTest(value_type=type(value).__name__):
                payloads = responses()
                payloads['wallet.membership']['result']['registration_status'] = value
                self.assert_safe_rejection(payloads)

    def test_worker_state_rejects_truthy_and_nonscalar_values(self):
        for value in (PRIVATE_MARKER, 'false', '', None, 0, 1, [], [PRIVATE_MARKER], {'private': PRIVATE_MARKER}):
            with self.subTest(value_type=type(value).__name__):
                payloads = responses()
                payloads['wallet.billing.status']['result']['worker_alive'] = value
                self.assert_safe_rejection(payloads)

    def test_billed_amount_rejects_bool_negative_float_and_nonscalar_values(self):
        for value in (PRIVATE_MARKER, '888', None, True, False, -1, 888.0, [], {'private': PRIVATE_MARKER}):
            with self.subTest(value_type=type(value).__name__):
                payloads = responses()
                payloads['snapshot']['snapshot']['billed_minor'] = value
                self.assert_safe_rejection(payloads)

    def test_missing_output_fields_fail_with_safe_errors(self):
        for operation, container, field in (
            ('wallet.membership', 'result', 'registration_status'),
            ('wallet.billing.status', 'result', 'worker_alive'),
            ('snapshot', 'snapshot', 'billed_minor'),
        ):
            with self.subTest(field=field):
                payloads = responses()
                del payloads[operation][container][field]
                self.assert_safe_rejection(payloads)

    def test_response_and_result_containers_fail_closed(self):
        for operation, container in (
            ('wallet.membership', 'result'), ('wallet.billing.status', 'result'), ('snapshot', 'snapshot'),
        ):
            for value in (None, PRIVATE_MARKER, [PRIVATE_MARKER], True):
                with self.subTest(operation=operation, level='response', value_type=type(value).__name__):
                    payloads = responses()
                    payloads[operation] = value
                    self.assert_safe_rejection(payloads)
                with self.subTest(operation=operation, level='result', value_type=type(value).__name__):
                    payloads = responses()
                    payloads[operation][container] = value
                    self.assert_safe_rejection(payloads)
            with self.subTest(operation=operation, level='missing_result'):
                payloads = responses()
                del payloads[operation][container]
                self.assert_safe_rejection(payloads)

    def test_response_ok_must_be_true(self):
        for operation in READ_OPERATIONS:
            for value in (False, 1, PRIVATE_MARKER, None):
                with self.subTest(operation=operation, value_type=type(value).__name__):
                    payloads = responses()
                    payloads[operation]['ok'] = value
                    self.assert_safe_rejection(payloads)

    def test_history_container_rows_and_periods_fail_with_safe_errors(self):
        histories = [
            None, PRIVATE_MARKER, {},
            [{'period': '2026-01', 'status': 'due'}] * 13,
            [None], [PRIVATE_MARKER], [{'status': 'due'}],
            [{'period': value, 'status': 'due'} for value in ('2026-01', '2026-01')],
        ]
        for value in (None, 202609, True, [], {'private': PRIVATE_MARKER}, PRIVATE_MARKER, '2026-13', '2026-9'):
            histories.append([{'period': value, 'status': 'due'}])
        for index, history in enumerate(histories):
            with self.subTest(case=index):
                payloads = responses()
                payloads['wallet.billing.status']['result']['history'] = history
                self.assert_safe_rejection(payloads)

    def test_existing_simulation_fee_identity_and_ledger_guards_remain(self):
        cases = [
            ('wallet.membership', 'result', 'simulation_only', False),
            ('wallet.billing.status', 'result', 'monthly_fee_minor', 889),
            ('snapshot', 'snapshot', 'currency', 'EUR'),
            ('wallet.membership', 'result', 'backend_connected', True),
            ('wallet.membership', 'result', 'real_identity_verified', True),
            ('wallet.membership', 'result', 'registration_input_fields', [PRIVATE_MARKER]),
            ('snapshot', 'snapshot', 'ledger_balance_minor', 1),
            ('snapshot', 'snapshot', 'bills', []),
        ]
        for operation, container, field, value in cases:
            with self.subTest(field=field):
                payloads = responses()
                payloads[operation][container][field] = value
                self.assert_safe_rejection(payloads)

    def test_main_success_emits_only_validated_report_then_pass_marker(self):
        payloads = responses()
        payloads['wallet.membership']['result']['private_metadata'] = PRIVATE_MARKER
        output, service_hash = self.invoke_main(payloads)
        self.assertTrue(output.endswith('\nROCK_ENTITLEMENT_OBSERVER_PASS\n'))
        body, marker = output.rsplit('\n', 2)[:2]
        self.assertEqual(marker, 'ROCK_ENTITLEMENT_OBSERVER_PASS')
        result = json.loads(body)
        self.assertEqual(set(result), OUTPUT_KEYS | {'guest_executed', 'service_sha256'})
        self.assertIs(result['guest_executed'], True)
        self.assertEqual(result['service_sha256'], service_hash)
        self.assertEqual(result['wallet_billed_minor'], 888)

    def test_main_rejects_private_payloads_before_any_output_or_pass_marker(self):
        for operation, container, field in (
            ('wallet.membership', 'result', 'registration_status'),
            ('wallet.billing.status', 'result', 'worker_alive'),
            ('snapshot', 'snapshot', 'billed_minor'),
        ):
            with self.subTest(field=field):
                payloads = responses()
                payloads[operation][container][field] = {'private': PRIVATE_MARKER}
                output, _ = self.invoke_main(payloads, expected_failure=True)
                self.assertEqual(output, '')

    def test_main_masks_service_exception_without_a_report_or_pass_marker(self):
        output, _ = self.invoke_main(responses(), expected_failure=True, read_error=True)
        self.assertEqual(output, '')


if __name__ == '__main__':
    unittest.main()
