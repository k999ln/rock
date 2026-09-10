"""Owner IPC routing and Hub availability, without substituting GX TLS tests."""
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch

from test_os_platform import ROOT, service


class PlatformGameTests(unittest.TestCase):
    def platform(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        return service.Platform(temporary.name, ROOT / 'examples/registry')

    def test_only_os_owner_can_use_even_read_game_requests(self):
        platform = self.platform()
        with patch.object(service, 'call') as call:
            for uid in (None, 0, 1001, 1002, 1003, 1004):
                with self.subTest(uid=uid), self.assertRaises(PermissionError):
                    platform.dispatch({'v': 1, 'op': 'game.sandbox.catalog'}, peer_uid=uid)
            call.assert_not_called()

    def test_unknown_author_mint_and_secret_fields_never_cross_owner_boundary(self):
        platform = self.platform()
        requests = [
            {'v': 1, 'op': 'game.author.apply', 'key': 'test'},
            {'v': 1, 'op': 'game.sandbox.mint', 'amount_minor': 10000},
            {'v': 1, 'op': 'game.sandbox.catalog', 'pin': '0000'},
            {'v': 1, 'op': 'game.sandbox.credit', 'key': 'test', 'amount_minor': 9999},
            {'v': 1, 'op': 'game.sandbox.credit', 'key': 'test', 'amount_minor': True},
            {'v': True, 'op': 'game.sandbox.catalog'},
            {'v': 1, 'op': 'game.sandbox.connection.begin', 'key': 'test', 'game_id': 'a', 'owner_ref': 'bob'},
            {'v': 1, 'op': 'game.connection.status', 'connection_id': 'not-a-uuid'},
        ]
        with patch.object(service, 'call') as call:
            for request in requests:
                with self.subTest(request=request), self.assertRaises(ValueError):
                    platform.dispatch(request, peer_uid=service.UI_UID)
            call.assert_not_called()

    def test_valid_connection_read_preserves_wire_and_expected_wallet_peer(self):
        platform = self.platform()
        request = {'v': 1, 'op': 'game.connection.status', 'connection_id': '11111111-1111-4111-8111-111111111111'}
        reply = {'ok': True, 'result': {'current_state': 'ACTIVE'}}
        platform.wallet_view = Mock()
        with patch.object(service, 'call', return_value=reply) as call:
            self.assertIs(platform.dispatch(request, peer_uid=service.UI_UID), reply)
            call.assert_called_once_with(platform.wallet_socket, request, service.WALLET_UID, return_errors=True)
        platform.wallet_view.invalidate.assert_not_called()

    def test_fixed_public_credit_is_a_wallet_mutation_not_hub_income(self):
        platform = self.platform()
        platform.wallet_view = Mock()
        request = {'v': 1, 'op': 'game.sandbox.credit', 'key': 'public-test', 'amount_minor': 10000}
        with patch.object(service, 'call', return_value={'ok': True, 'result': {}}) as call:
            platform.dispatch(request, peer_uid=service.UI_UID)
            call.assert_called_once_with(platform.wallet_socket, request, service.WALLET_UID, return_errors=True)
        platform.wallet_view.invalidate.assert_called_once_with()
        self.assertEqual(platform.hub.state()['jobs'], [])

    def test_unresolved_mutation_is_unavailable_and_invalidates_older_balance(self):
        platform = self.platform()
        platform.wallet_view = Mock()
        request = {'v': 1, 'op': 'game.sandbox.connection.begin', 'key': 'one-intent', 'game_id': 'public.game.a'}
        for failure in (OSError('response lost'), ValueError('malformed response')):
            platform.wallet_view.reset_mock()
            with self.subTest(failure=failure), patch.object(service, 'call', side_effect=failure):
                with self.assertRaisesRegex(service.ServiceUnavailable, 'same key'):
                    platform.dispatch(request, peer_uid=service.UI_UID)
            platform.wallet_view.invalidate.assert_called_once_with()

    def test_game_transport_does_not_hold_hub_lock_or_block_local_result(self):
        platform = self.platform()
        entered, release = threading.Event(), threading.Event()
        errors = []
        def call(_path, request, _uid, **_kwargs):
            if request['op'] == 'game.sandbox.catalog':
                entered.set()
                if not release.wait(2):
                    raise RuntimeError('test deadline exceeded')
                raise OSError('fixture Game stopped')
            return {'ok': True, 'snapshot': {'simulation_only': True, 'available_minor': 0}}
        def background():
            try:
                platform.dispatch({'v': 1, 'op': 'game.sandbox.catalog'}, peer_uid=service.UI_UID)
            except service.ServiceUnavailable:
                errors.append('unavailable')
        with patch.object(service, 'call', side_effect=call):
            worker = threading.Thread(target=background)
            worker.start()
            try:
                self.assertTrue(entered.wait(1))
                started = time.monotonic()
                snapshot = platform.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=service.UI_UID)['snapshot']
                self.assertLess(time.monotonic() - started, .2)
                self.assertTrue(snapshot['catalog'])
                self.assertEqual(snapshot['hub']['jobs'], [])
            finally:
                release.set()
                worker.join(2)
            self.assertFalse(worker.is_alive())
            self.assertEqual(errors, ['unavailable'])


if __name__ == '__main__':
    unittest.main()
