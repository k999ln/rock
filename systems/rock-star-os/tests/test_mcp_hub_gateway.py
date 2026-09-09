"""Host Platform boundary -> pinned TLS -> authority -> actual owned MCP HTTP.

peer_uid=1000 is the tested Platform argument, not a guest SO_PEERCRED/GUI proof.
All stores, listeners and signed purchase/payment fixtures are disposable. No
existing OS/backend, external MCP provider or real financial transfer is used.
"""
from contextlib import closing
import fcntl
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import ssl
import sys
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))
# Import the module, never a TestCase into this module's discovery namespace.
import test_mcp_service_access as foundation
from mcp_broker import MCPHttpClient, Unavailable
from mcp_broker.fixture import FixtureServer, PUBLIC_TOKEN
from mcp_broker.gateway import HubGateway, HubGatewayServer, MAX_WIRE, REQUEST_SCHEMA
from mcp_broker.device_client import HubClient, HubUnavailable
from mcp_broker.http import canonical
from service_access.controller import ServiceConfigurationError

spec = importlib.util.spec_from_file_location('rock_mcp_gateway_platform_test', ROOT / 'os/platform/service.py')
platform_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(platform_module)
FIXTURE = ROOT / 'os/registry/fixtures'
TEXT = 'PUBLIC selected memo: keep exact scope.'


class MCPHubGatewayTests(unittest.TestCase):
    def setUp(self):
        self.fx = foundation.MCPServiceAccessTests(methodName='runTest')
        self.addCleanup(self.cleanup_foundation)
        self.fx.setUp()
        self.fx.paid()
        self.fx.event('bob')
        self.bob_server = FixtureServer(self.fx.root / 'bob-upstream')
        self.addCleanup(self.bob_server.close)
        bob_route = MCPHttpClient(self.bob_server.origin, [self.bob_server.policy],
            authorization='Bearer ' + PUBLIC_TOKEN, allow_http_fixture=True,
            upstream_principal='PUBLIC-FIXTURE-BOB')
        self.connections = {
            'alice-a': {'memo': {'label': 'Public memo fixture', 'tool': 'text.upper', 'client': self.fx.client}},
            'bob': {'bob-only': {'label': 'Separate public fixture', 'tool': 'text.upper', 'client': bob_route}},
        }
        self.gateway = self.open_gateway()
        self.addCleanup(lambda: self.gateway.close())
        self.server = HubGatewayServer(('127.0.0.1', 0), self.gateway,
            FIXTURE / 'development-ca.pem', FIXTURE / 'PUBLIC-FIXTURE-KEY.pem')
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': .02})
        self.thread.start()
        self.addCleanup(self.stop_server)
        self.client = self.make_client()
        self.platform = platform_module.Platform(self.fx.root / 'platform', ROOT / 'examples/registry',
            start_registry=False, start_runner=False, mcp_client=self.client)
        self.addCleanup(self.platform.close)

    def cleanup_foundation(self):
        # A composed TestCase records cleanup failures instead of raising them.
        # Propagate its result so an unreaped fixture cannot silently pass.
        self.assertTrue(self.fx.doCleanups(), 'composed fixture cleanup failed')

    def open_gateway(self):
        return HubGateway(self.fx.root / 'gateway', self.fx.access, self.connections,
                          clock=lambda: self.fx.now, start_worker=False)

    def stop_server(self):
        try:
            self.server.shutdown()
        finally:
            try: self.server.server_close()
            finally: self.thread.join(4)
        self.assertFalse(self.thread.is_alive())

    def make_client(self, alias='alice-a', **changes):
        item = foundation.CONSUMERS[alias]
        args = {'authority_id': foundation.AUTHORITY, 'consumer_id': alias,
                'device_ref': item['device_ref'], 'token': item['token']}
        args.update(changes)
        return HubClient(f'https://127.0.0.1:{self.server.server_port}',
                         FIXTURE / 'development-ca.pem', **args)

    @property
    def broker(self):
        return self.gateway.brokers['alice-a']

    def call(self, op, **fields):
        result = self.platform.dispatch({'v': 1, 'op': op, **fields}, peer_uid=1000)
        self.assertIs(result['ok'], True)
        return result['result']

    def connect(self):
        return self.call('mcp.connect', alias='memo', key='connect')

    def prepare(self, key='job'):
        return self.call('mcp.prepare', alias='memo', text=TEXT, key=key)

    def submit(self, key='job'):
        preview = self.prepare(key)
        request = {'v': 1, 'op': 'mcp.submit', 'key': key, 'consent': preview['consent'], 'text': TEXT}
        result = self.platform.dispatch(request, peer_uid=1000)['result']
        return preview, request, result

    def rows(self):
        with closing(sqlite3.connect(self.broker.path)) as db:
            db.row_factory = sqlite3.Row
            return [dict(row) for row in db.execute('SELECT * FROM operations')]

    def envelope(self, request, **changes):
        return {'schema': REQUEST_SCHEMA, 'authority_id': foundation.AUTHORITY,
                'consumer_id': 'alice-a', 'device_ref': 'fixture-a', 'request': request, **changes}

    def http(self, body, *, headers=(), length=None, path='/v1/mcp-hub', default_auth=True):
        context = ssl.create_default_context(cafile=str(FIXTURE / 'development-ca.pem'))
        connection = http.client.HTTPSConnection('127.0.0.1', self.server.server_port, context=context, timeout=3)
        try:
            connection.putrequest('POST', path)
            connection.putheader('Content-Type', 'application/json')
            connection.putheader('Content-Length', str(len(body) if length is None else length))
            connection.putheader('Connection', 'close')
            if default_auth:
                connection.putheader('Authorization', 'Bearer ' + foundation.CONSUMERS['alice-a']['token'])
            for name, value in headers: connection.putheader(name, value)
            connection.endheaders(body)
            response = connection.getresponse()
            if response.status == 400:
                # Framing is rejected before request-body consumption; closing
                # unread TLS input may reset the stream. This guard observes
                # complete HTTP status/headers, not a complete error body.
                return response.status, b''
            raw = response.read(MAX_WIRE + 1)
            self.assertLessEqual(len(raw), MAX_WIRE)
            return response.status, raw
        finally:
            connection.close()

    def test_platform_to_tls_preview_no_text_then_explicit_exact_effect(self):
        before = self.fx.wallet.snapshot()
        wire = []
        dispatch = self.gateway.dispatch
        def observed(envelope, auth):
            wire.append(canonical(envelope))
            return dispatch(envelope, auth)
        with patch.object(self.gateway, 'dispatch', side_effect=observed):
            self.connect(); preview = self.prepare()
            self.assertEqual(self.fx.server.count(), 0)
            self.assertEqual([item['method'] for item in self.fx.server.wire], ['server/discover'])
            row = self.rows()[0]
            self.assertEqual(row['state'], 'prepared')
            self.assertIsNone(row['input_text'])
            self.assertNotIn(TEXT, canonical(row).decode())
            self.assertTrue(all(TEXT.encode() not in raw for raw in wire))
            transmitted = json.loads(wire[-1])['request']
            self.assertNotIn('text', transmitted)
            self.assertEqual(transmitted['input_sha256'], hashlib.sha256(TEXT.encode()).hexdigest())
            self.assertEqual(transmitted['input_bytes'], len(TEXT.encode()))
            self.assertEqual(preview['plan']['input_transfer'], 'explicit_submit_only')
            receipt = self.call('mcp.submit', key='job', consent=preview['consent'], text=TEXT)
            self.assertFalse(receipt['remote_execution_confirmed'])
            self.assertEqual(self.fx.server.count(), 0)
        self.assertTrue(self.broker.process_one())
        detail = self.call('mcp.status', key='job')
        self.assertEqual(detail['state'], 'succeeded')
        self.assertEqual(detail['result']['output'], {'text': TEXT.upper()})
        self.assertFalse(detail['financial_transaction'])
        self.assertEqual(self.call('mcp.submit', key='job', consent=preview['consent'], text=TEXT), receipt)
        self.assertFalse(self.broker.process_one())
        self.assertEqual(self.fx.server.count(), 1)
        self.assertEqual(self.platform.hub.state()['jobs'], [])
        self.assertEqual(self.fx.wallet.snapshot(), before)

    def test_exact_text_and_consent_mismatch_cannot_admit_effect(self):
        self.connect(); preview = self.prepare()
        for changed in (TEXT.swapcase(), TEXT + '!', ''):
            with self.assertRaises(PermissionError):
                self.call('mcp.submit', key='job', consent=preview['consent'], text=changed)
        with self.assertRaises(PermissionError):
            self.call('mcp.submit', key='job', consent={'approved': True, 'digest': '0' * 64}, text=TEXT)
        row = self.rows()[0]
        self.assertEqual(row['state'], 'prepared'); self.assertIsNone(row['input_text'])
        self.assertIsNone(row['submit_receipt']); self.assertEqual(self.fx.server.count(), 0)

    def test_disconnect_prevents_queued_send_and_does_not_reactivate_old_receipt(self):
        connected = self.connect(); _, request, receipt = self.submit()
        result = self.call('mcp.disconnect', alias='memo', key='disconnect')
        self.assertTrue(result['new_admissions_stopped'])
        self.assertFalse(self.broker.process_one())
        self.assertEqual(self.call('mcp.status', key='job')['state'], 'cancelled')
        self.assertIsNone(self.rows()[0]['input_text'])
        self.assertEqual(self.connect(), connected)
        self.assertEqual(self.call('mcp.snapshot')['connections'][0]['state'], 'closed')
        self.assertEqual(self.platform.dispatch(request, peer_uid=1000)['result'], receipt)
        with self.assertRaises(PermissionError): self.prepare('another')
        self.assertEqual(self.fx.server.count(), 0)

    def test_purchase_revoke_after_queue_denies_worker_before_upstream(self):
        self.connect(); self.submit(); self.fx.event(kind='suspend')
        self.assertTrue(self.broker.process_one())
        self.assertEqual(self.rows()[0]['state'], 'cancelled')
        self.assertEqual(self.fx.server.count(), 0)
        with self.assertRaises(PermissionError): self.call('mcp.status', key='job')
        with self.assertRaises(PermissionError): self.call('mcp.snapshot')

    def test_lost_upstream_ack_gateway_restart_unpaid_recovery_never_reexecutes(self):
        self.connect(); self.submit()
        self.fx.server.fault = 'drop_after_commit'; self.broker.process_one()
        self.assertEqual(self.call('mcp.status', key='job')['state'], 'unknown')
        self.assertEqual(self.fx.server.count(), 1)
        self.fx.now = self.fx.access.snapshot('alice-a')['access_until']
        self.call('mcp.disconnect', alias='memo', key='disconnect')
        self.gateway.close(); self.gateway = self.open_gateway(); self.server.gateway = self.gateway
        with self.assertRaises(PermissionError): self.call('mcp.connect', alias='memo', key='new-connect')
        self.assertEqual(self.call('mcp.snapshot')['history'][0]['state'], 'unknown')
        self.call('mcp.reconcile', key='job'); self.broker.process_one()
        self.assertEqual(self.call('mcp.status', key='job')['state'], 'succeeded')
        calls = [row for row in self.fx.server.wire if row['method'] == 'tools/call']
        self.assertEqual([row['tool'] for row in calls], ['text.upper', 'effect.status'])
        self.assertEqual(calls[0]['business_key'], calls[1]['business_key'])
        self.assertEqual(len(self.rows()), 1)

    def test_http503_after_submit_commit_preserves_exact_key_without_auto_retry(self):
        self.connect(); preview = self.prepare()
        request = {'v': 1, 'op': 'mcp.submit', 'key': 'job', 'consent': preview['consent'], 'text': TEXT}
        original = canonical(request)
        dispatch = self.gateway.dispatch
        observed = []
        def lost(envelope, auth):
            result = dispatch(envelope, auth)
            observed.append(envelope['request']['key'])
            raise OSError('owned test response failure after local commit')
        with patch.object(self.gateway, 'dispatch', side_effect=lost), self.assertRaises(HubUnavailable):
            self.platform.dispatch(request, peer_uid=1000)
        self.assertEqual(observed, ['job'])
        self.assertEqual(canonical(request), original)
        self.assertEqual(self.rows()[0]['state'], 'queued')
        self.assertEqual(self.fx.server.count(), 0)
        receipt = self.platform.dispatch(request, peer_uid=1000)['result']
        self.assertEqual(receipt['key'], 'job'); self.assertEqual(len(self.rows()), 1)
        self.broker.process_one()
        self.assertEqual(self.fx.server.count(), 1)

    def test_consumer_device_authority_and_connection_scopes_cannot_be_supplied(self):
        self.connect(); self.submit(); self.broker.process_one()
        bob = self.make_client('bob')
        snapshot = bob.request({'v': 1, 'op': 'mcp.snapshot'})
        self.assertEqual([row['alias'] for row in snapshot['connections']], ['bob-only'])
        self.assertEqual(snapshot['history'], [])
        for request in ({'v': 1, 'op': 'mcp.connect', 'alias': 'memo', 'key': 'connect'},
                        {'v': 1, 'op': 'mcp.status', 'key': 'job'}):
            with self.assertRaises(PermissionError): bob.request(request)
        with self.assertRaises(PermissionError): self.call('mcp.connect', alias='bob-only', key='wrong-route')
        for changes in ({'device_ref': 'fixture-b'}, {'consumer_id': 'bob'},
                        {'authority_id': '00000000-0000-4000-8000-000000000002'},
                        {'token': foundation.CONSUMERS['bob']['token']}):
            with self.assertRaises(PermissionError):
                self.make_client(**changes).request({'v': 1, 'op': 'mcp.snapshot'})
        self.assertEqual(self.bob_server.count(), 0)
        self.assertEqual(self.fx.server.count(), 1)

    def test_platform_owner_peer_required_and_missing_client_no_fallback(self):
        request = {'v': 1, 'op': 'mcp.snapshot'}
        for uid in (None, 0, 999, 1001, True):
            with self.assertRaises(PermissionError): self.platform.dispatch(request, peer_uid=uid)
        self.platform.mcp_client = None
        with self.assertRaises(platform_module.ServiceUnavailable):
            self.platform.dispatch(request, peer_uid=1000)
        self.assertEqual(self.platform.hub.state()['jobs'], [])
        self.assertEqual(self.fx.server.wire, [])

    def test_malformed_http_rejected_before_business_dispatch(self):
        raw = canonical(self.envelope({'v': 1, 'op': 'mcp.snapshot'}))
        for kwargs in ({'headers': [('Authorization', 'Bearer duplicate')]},
                       {'headers': [('Origin', 'https://example.invalid')]},
                       {'length': MAX_WIRE + 1}, {'headers': [('Transfer-Encoding', 'chunked')]},
                       {'headers': [('Content-Type', 'application/json')]}, {'path': '/other'},
                       {'default_auth': False}):
            with self.subTest(kwargs=tuple(kwargs)), \
                    patch.object(self.gateway, 'dispatch', wraps=self.gateway.dispatch) as dispatch:
                # Linux may reset rejected unread TLS input before a status is
                # received. Record that exact observation, never invent 400.
                try:
                    status, _ = self.http(raw, **kwargs)
                    self.assertEqual(status, 400)
                    observed = 'HTTP400'
                except ConnectionResetError:
                    observed = 'CONNECTION_RESET_WITHOUT_HTTP_STATUS'
                except http.client.RemoteDisconnected:
                    observed = 'REMOTE_DISCONNECTED_WITHOUT_HTTP_STATUS'
                self.assertIn(observed, {'HTTP400', 'CONNECTION_RESET_WITHOUT_HTTP_STATUS',
                                         'REMOTE_DISCONNECTED_WITHOUT_HTTP_STATUS'})
                print('Rejected framing observation:', observed)
                dispatch.assert_not_called()
                self.assertEqual(self.fx.server.count(), 0)
                with closing(sqlite3.connect(self.broker.path)) as db:
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM operations').fetchone()[0], 0)
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM control_receipts').fetchone()[0], 0)
        for request in ({'v': 1, 'op': 'mcp.prepare', 'alias': 'memo', 'key': 'job', 'text': TEXT},
                        {'v': 1, 'op': 'mcp.connect', 'alias': 'memo', 'key': 'connect', 'url': self.fx.server.origin},
                        {'v': 1, 'op': 'mcp.snapshot', 'owner_ref': 'fixture-owner-alice'}):
            self.assertEqual(self.http(canonical(self.envelope(request)))[0], 400)
        duplicate = b'{"schema":"bad","schema":"duplicate"}'
        self.assertEqual(self.http(duplicate)[0], 400)
        self.assertEqual(self.fx.server.wire, [])
        self.assertEqual(self.rows(), [])

    def test_tls_authenticated_but_wrong_reply_binding_remains_unknown(self):
        dispatch = self.gateway.dispatch
        def wrong(envelope, auth):
            result = dispatch(envelope, auth)
            result['device_ref'] = 'fixture-b'
            return result
        with patch.object(self.gateway, 'dispatch', side_effect=wrong), self.assertRaises(HubUnavailable):
            self.call('mcp.snapshot')
        self.assertEqual(self.fx.server.wire, [])

    def test_cross_owner_shared_upstream_account_configuration_rejected_before_effect(self):
        shared = {'label': 'Shared fixture account', 'tool': 'text.upper', 'client': self.fx.client}
        with self.assertRaisesRegex(ValueError, 'share an upstream'):
            HubGateway(self.fx.root / 'bad-gateway', self.fx.access,
                       {'alice-a': {'memo': shared}, 'bob': {'other': shared}}, start_worker=False)
        self.assertFalse((self.fx.root / 'bad-gateway' / 'binding.json').exists())
        self.assertFalse((self.fx.root / 'bad-gateway' / 'alice-a').exists())
        self.assertEqual(self.fx.server.wire, [])
        self.assertEqual(self.fx.server.count(), 0)

    def test_configuration_outage_is_http503_while_invalid_request_is400(self):
        request = {'v': 1, 'op': 'mcp.snapshot'}
        with patch.object(self.gateway.adapter, 'authenticate',
                          side_effect=ServiceConfigurationError('owned damaged fixture mode')):
            self.assertEqual(self.http(canonical(self.envelope(request)))[0], 503)
            with self.assertRaises(HubUnavailable): self.client.request(request)
        self.assertEqual(self.http(canonical(self.envelope({'v': '1', 'op': 'mcp.snapshot'})))[0], 400)
        self.assertEqual(self.fx.server.wire, [])

    def test_close_failure_attempts_all_brokers_and_keeps_gateway_lock(self):
        alice, bob = self.gateway.brokers['alice-a'], self.gateway.brokers['bob']
        with patch.object(alice, 'close', side_effect=Unavailable('owned unfinished worker')), \
                patch.object(bob, 'close', wraps=bob.close) as other_close:
            with self.assertRaises(Unavailable): self.gateway.close()
            other_close.assert_called_once()
            self.assertTrue(bob._closed)
            self.assertFalse(alice._closed)
            self.assertIsNotNone(self.gateway._fd)
            fd = os.open(self.gateway.directory / 'gateway.lock', os.O_RDWR)
            try:
                with self.assertRaises(BlockingIOError): fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                os.close(fd)
        self.gateway.close()
        self.assertTrue(alice._closed)
        self.assertIsNone(self.gateway._fd)


if __name__ == '__main__':
    unittest.main()
