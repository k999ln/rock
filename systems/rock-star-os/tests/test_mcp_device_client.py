"""Actual owned TLS wire and private configuration fixtures; no MCP provider.

The fixture responds as the thin gateway protocol, not as an entitlement or
Broker implementation. No OS/VM/user backend, funds, credentials or new keys.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import copy
import hashlib
import json
import os
from pathlib import Path
import socket
import ssl
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os')]
from mcp_broker.device_client import (HubClient, HubUnavailable, resolve, MARKER,
    CONFIG_SCHEMA, REQUEST_SCHEMA, RESPONSE_SCHEMA, MAX_WIRE)
from service_access.os_client import Profile, CONFIG_SCHEMA as PROFILE_SCHEMA
from mcp_broker.http import ToolPolicy, VERSION, MAX_BODY, digest

CA = ROOT/'os/registry/fixtures/development-ca.pem'
KEY = ROOT/'os/registry/fixtures/PUBLIC-FIXTURE-KEY.pem'
AUTHORITY = '3c2fc4a0-98d2-435e-bb46-34e2601221da'
TOKEN = 'PUBLIC-FIXTURE-SERVICE-ALICE-A-v1'
BINDING = {'authority_id': AUTHORITY, 'consumer_id': 'alice-a', 'device_ref': 'fixture-rock-arm64-001'}


def fixture_result(request):
    """Examples of the real gateway contract; this server has no business state."""
    contract = ToolPolicy('text.upper','effect.status').contract()
    route = {'protocol':VERSION,'origin':'http://127.0.0.1:19747','path':'/mcp',
        'upstream_principal':'PUBLIC-FIXTURE-OWNER','transport':'loopback_http_fixture','ca_sha256':None,
        'tools':{'text.upper':contract},'timeout_seconds':2.0,'max_response_bytes':MAX_BODY}
    op = request['op']
    if op == 'mcp.prepare':
        plan = {'schema':'rock-mcp-consent/1','subject':'mcp-public-fixture','device_ref':BINDING['device_ref'],
            'key':request['key'],'alias':request['alias'],'epoch':1,'route_id':request['alias'],'route':route,
            'tool':'text.upper','contract':contract,'input_sha256':request['input_sha256'],
            'input_bytes':request['input_bytes'],'data_scope':'user_selected_text','price':contract['price'],
            'issued_at':1000,'expires_at':1120,'input_transfer':'explicit_submit_only',
            'business_key':'op-'+digest(['mcp-public-fixture',BINDING['device_ref'],request['alias'],request['key']])}
        return {'prepared':True,'submitted':False,'state':'prepared','plan':plan,
                'consent':{'approved':True,'digest':digest(plan)},'meaning':'preview is not consent or permission to send'}
    if op == 'mcp.submit':
        return {'key':request['key'],'consent_digest':request['consent']['digest'],'accepted_locally':True,
                'remote_execution_confirmed':False,'financial_transaction':False}
    if op in ('mcp.connect','mcp.disconnect'):
        result = {'alias':request['alias'],'epoch':1,'event':'connected','historical_receipt':True}
        if op == 'mcp.disconnect':
            result.update(event='disconnected',new_admissions_stopped=True,
                upstream_credential_revocation='NOT_IMPLEMENTED',sent_operations='reconciliation_only')
        return result
    if op in ('mcp.status','mcp.reconcile'):
        return {'key':request['key'],'alias':'notes','epoch':1,'state':'unknown','send_claimed':True,
            'recovery_only':True,'consent_digest':'c'*64,'attempts':1,'error':'provider result not yet confirmed',
            'result':None,'financial_transaction':False}
    assert op == 'mcp.snapshot'
    return {'connections':[{'alias':'notes','label':'Public fixture','tool':'text.upper','state':'unconnected',
                            'epoch':0,'route':route,'contract':contract}], 'history':[], 'simulation_only':True,
            'can_submit':True,'paid_state':'PAID',
            'provider_connected':False,'financial_transaction':False,'upstream_credential_revocation':'NOT_IMPLEMENTED'}


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_): pass

    def do_POST(self):
        raw = self.rfile.read(int(self.headers['Content-Length']))
        self.server.seen.append({'path': self.path, 'raw': raw, 'authorization': self.headers.get('Authorization')})
        try:
            request = json.loads(raw)
            self.server.requests.append(request)
            status = 200 if self.headers.get('Authorization') == 'Bearer '+TOKEN else 403
            if self.server.status is not None: status = self.server.status
            result = fixture_result(request['request'])
            if self.server.transform is not None: result = self.server.transform(copy.deepcopy(result))
            response = {'ok': True, 'schema': RESPONSE_SCHEMA, **BINDING, 'result': result}
            response.update(self.server.change)
            body = self.server.body if self.server.body is not None else json.dumps(response).encode()
            if status != 200: body = b'{"error":"PUBLIC-FIXTURE-DO-NOT-EXPOSE"}'
            if self.server.slow_headers:
                for fragment in (b'HTTP/1.1 200 OK\r\n', b'X-Test: a\r\n', b'X-Test2: b\r\n', b'X-Test3: c\r\n'):
                    self.wfile.write(fragment); self.wfile.flush(); time.sleep(0.08)
                return
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(self.server.length if self.server.length is not None else len(body)))
            if self.server.duplicate_length: self.send_header('Content-Length', str(len(body)))
            if self.server.transfer: self.send_header('Transfer-Encoding', 'chunked')
            self.send_header('Connection', 'close'); self.end_headers()
            if self.server.half:
                self.wfile.write(body[:max(1,len(body)//2)]); self.wfile.flush()
                self.connection.shutdown(socket.SHUT_RDWR)
            else:
                self.wfile.write(body); self.wfile.flush()
        except (OSError, ValueError):
            pass
        finally:
            self.close_connection = True


class HubClientTLSTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.daemon_threads = False
        self.server.seen, self.server.requests = [], []
        self.server.status = self.server.body = self.server.length = None
        self.server.change = {}
        self.server.transform = None
        self.server.half = self.server.slow_headers = self.server.duplicate_length = self.server.transfer = False
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(str(CA), str(KEY))
        self.server.socket = context.wrap_socket(self.server.socket, server_side=True)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': 0.01})
        self.thread.start(); self.addCleanup(self.stop)
        self.origin = 'https://127.0.0.1:'+str(self.server.server_address[1])

    def stop(self):
        self.server.shutdown(); self.thread.join(3); self.server.server_close()
        self.assertFalse(self.thread.is_alive())

    def client(self, **kwargs):
        return HubClient(self.origin, CA, **{**BINDING, 'token': TOKEN, **kwargs})

    def request(self, **kwargs):
        return self.client(**kwargs).request({'v': 1, 'op': 'mcp.snapshot'})

    def test_actual_tls_pinned_envelope_and_result_only(self):
        self.assertEqual(self.request(), fixture_result({'v':1,'op':'mcp.snapshot'}))
        self.assertEqual(self.server.requests, [{'schema': REQUEST_SCHEMA, **BINDING, 'request': {'v':1,'op':'mcp.snapshot'}}])
        self.assertEqual(self.server.seen[0]['path'], '/v1/mcp-hub')
        self.assertEqual(self.server.seen[0]['authorization'], 'Bearer '+TOKEN)
        self.assertNotIn(TOKEN.encode(), self.server.seen[0]['raw'])

    def test_preview_never_sends_selected_text_then_exact_consent_submit_does(self):
        text = 'PUBLIC-FIXTURE selected \u65e5\u672c\u8a9e\nonly'
        prepare = {'v':1, 'op':'mcp.prepare', 'alias':'notes', 'key':'intent-1', 'text':text}
        client = self.client(); client.request(prepare)
        wire = self.server.requests[-1]['request']
        self.assertEqual(wire, {'v':1, 'op':'mcp.prepare', 'alias':'notes', 'key':'intent-1',
            'input_sha256':hashlib.sha256(text.encode()).hexdigest(), 'input_bytes':len(text.encode())})
        self.assertNotIn(text.encode(), self.server.seen[0]['raw'])
        self.assertEqual(prepare['text'], text)
        submit = {'v':1, 'op':'mcp.submit', 'key':'intent-1', 'text':text,
                  'consent':{'approved':True,'digest':'a'*64}}
        client.request(submit)
        self.assertEqual(self.server.requests[-1]['request'], submit)
        self.assertEqual(len(self.server.seen), 2)

    def test_half_reply_unknown_never_automatically_retries(self):
        self.server.half = True
        request = {'v':1,'op':'mcp.submit','key':'lost-ack','text':'public fixture',
                   'consent':{'approved':True,'digest':'a'*64}}
        client = self.client()
        with self.assertRaises(HubUnavailable): client.request(request)
        self.assertEqual(len(self.server.requests), 1)
        self.server.half = False
        client.request(request)  # Explicit caller retry, exact key and payload.
        self.assertEqual(self.server.requests[0], self.server.requests[1])

    def test_wrong_reply_authority_consumer_device_or_schema_is_unknown(self):
        for field in ('authority_id', 'consumer_id', 'device_ref', 'schema'):
            with self.subTest(field=field):
                self.server.change = {field:'another'}
                with self.assertRaises(HubUnavailable): self.request()
        self.assertEqual(len(self.server.seen), 4)

    def test_duplicate_json_extra_fields_or_wrong_result_type_are_unknown(self):
        good = {'ok': True, 'schema':RESPONSE_SCHEMA, **BINDING, 'result':{}}
        bodies = [json.dumps(good)[:-1]+',"ok":true}', json.dumps({**good,'result':[]}),
                  json.dumps({**good,'extra':'PUBLIC-FIXTURE-DO-NOT-EXPOSE'}), '{"value":NaN}']
        for body in bodies:
            with self.subTest(body=body[:16]):
                self.server.body = body.encode()
                with self.assertRaises(HubUnavailable) as caught: self.request()
                self.assertNotIn('DO-NOT-EXPOSE', str(caught.exception))

    def test_known_rejections_and_unavailable_never_expose_error_body(self):
        for status, exception in ((400,ValueError),(401,PermissionError),(403,PermissionError),
                                  (302,HubUnavailable),(500,HubUnavailable),(503,HubUnavailable)):
            with self.subTest(status=status):
                self.server.status = status
                with self.assertRaises(exception) as caught: self.request()
                self.assertNotIn('DO-NOT-EXPOSE', str(caught.exception))
        self.assertEqual(len(self.server.seen), 6)

    def test_oversized_duplicate_or_chunked_response_is_unknown(self):
        for mode in ('length','duplicate_length','transfer'):
            with self.subTest(mode=mode):
                self.server.length = MAX_WIRE+1 if mode == 'length' else None
                self.server.duplicate_length = mode == 'duplicate_length'
                self.server.transfer = mode == 'transfer'
                with self.assertRaises(HubUnavailable): self.request()

    def test_slow_headers_respect_total_deadline(self):
        self.server.slow_headers = True; start = time.monotonic()
        with self.assertRaises(HubUnavailable): self.request(timeout=0.12)
        self.assertLess(time.monotonic()-start, 0.5)
        self.assertEqual(len(self.server.seen), 1)

    def test_invalid_or_overbound_input_has_zero_network(self):
        bad = [{'v':True,'op':'mcp.snapshot'}, {'v':1,'op':'mcp.snapshot','token':TOKEN},
               {'v':1,'op':'mcp.connect','alias':'notes','key':'a','origin':'https://127.0.0.1:1'},
               {'v':1,'op':'mcp.prepare','alias':'notes','key':'a','text':'x'*65537},
               {'v':1,'op':'mcp.submit','key':'a','text':'abc','consent':{'approved':1,'digest':'a'*64}},
               {'v':1,'op':'mcp.submit','key':'a','text':'\x01'*65536,'consent':{'approved':True,'digest':'a'*64}}]
        client = self.client()
        for request in bad:
            with self.subTest(op=request['op']):
                with self.assertRaises(ValueError): client.request(request)
        self.assertEqual(self.server.seen, [])

    def test_real_tls_all_operation_shapes_and_terminal_receipt(self):
        client=self.client()
        for op in ('mcp.connect','mcp.disconnect'):
            request={'v':1,'op':op,'alias':'notes','key':op}
            self.assertEqual(client.request(request),fixture_result(request))
        for op in ('mcp.status','mcp.reconcile'):
            request={'v':1,'op':op,'key':'retained-key'}
            self.assertEqual(client.request(request),fixture_result(request))
        def terminal(value):
            value.update(state='succeeded',error=None,result={'schema':'rock-mcp-effect-receipt/1',
                'business_key':'op-public-fixture','consent_digest':value['consent_digest'],'state':'succeeded',
                'output':{'text':'PUBLIC RESULT'},'settlement_correlation':'corr-public-fixture'})
            return value
        self.server.transform=terminal
        self.assertEqual(client.request({'v':1,'op':'mcp.status','key':'retained-key'})['result']['output']['text'],'PUBLIC RESULT')

    def test_prepare_mismatched_or_expanded_plan_is_unknown_even_with_recomputed_digest(self):
        request={'v':1,'op':'mcp.prepare','alias':'notes','key':'plan-key','text':'exact selected input'}
        changes=[('key','another-key'),('alias','another-alias'),('device_ref','another-device'),
                 ('input_sha256','0'*64),('input_bytes',21),('input_transfer','already_sent'),
                 ('epoch',True),('issued_at',-1),('expires_at',999),('data_scope','all_files'),
                 ('price',{'currency':'USD','amount_minor':1,'version':'public-fixture-1'}),
                 ('selected_text','PUBLIC-FIXTURE-DO-NOT-EXPOSE')]
        for field,value in changes:
            def change(result):
                result['plan'][field]=value
                result['consent']['digest']=digest(result['plan'])
                return result
            self.server.transform=change
            with self.subTest(field=field),self.assertRaises(HubUnavailable): self.client().request(request)
        self.assertEqual(len(self.server.seen),len(changes))
        self.assertTrue(all('text' not in row['request'] for row in self.server.requests))

    def test_prepare_contract_route_or_consent_does_not_inherit_old_approval(self):
        request={'v':1,'op':'mcp.prepare','alias':'notes','key':'plan-key','text':'x'}
        def wrong_contract(value):
            value['plan']['contract']['input_schema']['additionalProperties']=0
            value['consent']['digest']=digest(value['plan']); return value
        def wrong_route(value):
            value['plan']['route']['authorization']='PUBLIC-FIXTURE-DO-NOT-EXPOSE'
            value['consent']['digest']=digest(value['plan']); return value
        for transform in (wrong_contract,wrong_route,
                          lambda value:{**value,'consent':{'approved':True,'digest':'a'*64}},
                          lambda value:{**value,'consent':{'approved':1,'digest':value['consent']['digest']}}):
            self.server.transform=transform
            with self.assertRaises(HubUnavailable) as caught:self.client().request(request)
            self.assertNotIn('DO-NOT-EXPOSE',str(caught.exception))

    def test_malformed_submit_never_completes_or_retries_the_original_request(self):
        request={'v':1,'op':'mcp.submit','key':'exact-request-key','text':'PUBLIC selected text',
                 'consent':{'approved':True,'digest':'a'*64}}
        for field,value in [('key','different'),('consent_digest','b'*64),('accepted_locally',1),
                            ('remote_execution_confirmed',True),('financial_transaction',True)]:
            self.server.transform=lambda result:{**result,field:value}
            before=len(self.server.requests)
            with self.subTest(field=field),self.assertRaises(HubUnavailable):self.client().request(request)
            self.assertEqual(len(self.server.requests),before+1)
        self.server.transform=None
        result=self.client().request(request)
        self.assertEqual(result,fixture_result(request))
        self.assertTrue(all(row['request']==request for row in self.server.requests))

    def test_status_control_and_snapshot_unknown_or_secret_fields_are_rejected(self):
        cases=[({'v':1,'op':'mcp.status','key':'job'},'key','another'),
               ({'v':1,'op':'mcp.reconcile','key':'job'},'state','new_unknown_state'),
               ({'v':1,'op':'mcp.status','key':'job'},'consent_digest','not-a-hash'),
               ({'v':1,'op':'mcp.status','key':'job'},'attempts',True),
               ({'v':1,'op':'mcp.connect','alias':'notes','key':'connect'},'alias','another'),
               ({'v':1,'op':'mcp.disconnect','alias':'notes','key':'disconnect'},'new_admissions_stopped',False),
               ({'v':1,'op':'mcp.snapshot'},'token','PUBLIC-FIXTURE-DO-NOT-EXPOSE'),
               ({'v':1,'op':'mcp.snapshot'},'can_submit',1),
               ({'v':1,'op':'mcp.snapshot'},'paid_state','UNKNOWN_NEW_VALUE'),
               ({'v':1,'op':'mcp.snapshot'},'history',[{}]*21)]
        for request,field,value in cases:
            self.server.transform=lambda result:{**result,field:value}
            with self.subTest(op=request['op'],field=field),self.assertRaises(HubUnavailable):self.client().request(request)

    def test_snapshot_route_secret_duplicate_alias_and_false_success_flags_fail(self):
        def secret(value):
            value['connections'][0]['route']['token']='PUBLIC-FIXTURE-DO-NOT-EXPOSE';return value
        def duplicate(value):
            value['connections']*=2;return value
        def bad_flags(value):
            value['provider_connected']=True;return value
        for transform in (secret,duplicate,bad_flags):
            self.server.transform=transform
            with self.assertRaises(HubUnavailable):self.request()
        # The authority's configured policy, not this thin client, determines
        # whether unpaid service access is allowed. Both fields stay checked.
        self.server.transform=lambda value:{**value,'can_submit':True,'paid_state':'PAUSED'}
        self.assertTrue(self.request()['can_submit'])


class HubDeviceConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.state = self.root/'state'; self.path = self.root/'mcp-hub.json'
        self.value = {'schema':CONFIG_SCHEMA,'gateway_origin':'https://10.0.2.2:9746'}
        self.purchaser = {'schema':PROFILE_SCHEMA, **BINDING, 'token':TOKEN,
            'registry_origin':'https://10.0.2.2:9743','runner_origin':'https://10.0.2.2:9744','runner_endpoint_id':'runner-cloud'}
        self.profile = Profile(self.purchaser, {'mode':'purchaser-fixture','state':'configured'})

    def write(self, value=None):
        self.path.write_text(json.dumps(self.value if value is None else value)); self.path.chmod(0o600)

    def resolve(self): return resolve(self.state, self.profile, self.path, CA)

    def test_exact_restart_keeps_only_pins_and_resolve_never_connects(self):
        self.write()
        with patch('socket.create_connection', side_effect=AssertionError('resolve must not use network')):
            client, status = self.resolve(); marker = self.state/MARKER; before = marker.read_bytes()
            self.assertEqual(status['state'], 'configured'); self.assertIsInstance(client, HubClient)
            self.assertEqual(self.resolve()[1], status); self.assertEqual(marker.read_bytes(), before)
        self.assertNotIn(TOKEN, before.decode()); self.assertNotIn(TOKEN, json.dumps(status))
        self.assertEqual(marker.stat().st_mode & 0o777, 0o600)

    def test_fresh_absence_is_unconfigured_but_lost_bound_config_is_unavailable(self):
        self.assertEqual(self.resolve()[1]['state'], 'unconfigured')
        self.write(); self.resolve(); before=(self.state/MARKER).read_bytes()
        retained=self.state/'saved-result'; retained.write_text('retained')
        self.path.unlink(); client,status=self.resolve()
        self.assertIsNone(client); self.assertEqual(status['state'],'unavailable')
        self.assertEqual((self.state/MARKER).read_bytes(),before); self.assertEqual(retained.read_text(),'retained')

    def test_malformed_first_config_latches_and_same_good_config_repairs(self):
        self.write({'unexpected':'PUBLIC-FIXTURE-DO-NOT-EXPOSE'})
        self.assertEqual(self.resolve()[1]['state'],'unavailable')
        self.path.unlink(); self.assertEqual(self.resolve()[1]['state'],'unavailable')
        self.write(); self.assertEqual(self.resolve()[1]['state'],'configured')

    def test_gateway_or_full_profile_rebinding_cannot_replace_marker(self):
        self.write(); self.resolve(); before=(self.state/MARKER).read_bytes()
        for field,value in [('authority_id','5a30bbed-c339-4cb8-bb2f-b754cf27dc7b'),
                            ('device_ref','another-device'),('token','PUBLIC-FIXTURE-SERVICE-ALICE-B-v1'),
                            ('runner_origin','https://10.0.2.2:9747')]:
            with self.subTest(field=field):
                self.profile=Profile({**self.purchaser,field:value},{'mode':'purchaser-fixture','state':'configured'})
                self.assertIsNone(self.resolve()[0]); self.assertEqual((self.state/MARKER).read_bytes(),before)
        self.profile=Profile(self.purchaser,{'mode':'purchaser-fixture','state':'configured'})
        self.write({**self.value,'gateway_origin':'https://10.0.2.2:9748'})
        self.assertIsNone(self.resolve()[0]); self.assertEqual((self.state/MARKER).read_bytes(),before)

    def test_bad_profile_symlink_writable_and_duplicate_config_are_unavailable(self):
        self.write(); self.profile=Profile(None,{'mode':'purchaser-fixture','state':'unavailable'})
        self.assertIsNone(self.resolve()[0])
        self.profile=Profile(self.purchaser,{'mode':'purchaser-fixture','state':'configured'})
        self.path.chmod(0o666); self.assertIsNone(self.resolve()[0]); self.path.chmod(0o600)
        target=self.root/'other.json'; self.path.rename(target); self.path.symlink_to(target)
        self.assertIsNone(self.resolve()[0]); self.path.unlink()
        self.path.write_text(json.dumps(self.value)[:-1]+',"schema":"again"}'); self.path.chmod(0o600)
        self.assertIsNone(self.resolve()[0])

    def test_origin_credentials_bounds_and_ca_symlink_rejected_before_network(self):
        for origin in ('http://127.0.0.1:9746','https://localhost:9746','https://example.com:9746',
                       'https://127.0.0.1:9746/path','https://name:secret@127.0.0.1:9746',
                       'https://127.0.0.1:9746/#fragment'):
            with self.subTest(origin=origin):
                with self.assertRaises(ValueError): HubClient(origin,CA,**BINDING,token=TOKEN)
        for timeout in (True,0,4,float('nan')):
            with self.assertRaises(ValueError): HubClient(self.value['gateway_origin'],CA,**BINDING,token=TOKEN,timeout=timeout)
        ca=self.root/'ca.pem';ca.symlink_to(CA)
        with self.assertRaises(OSError): HubClient(self.value['gateway_origin'],ca,**BINDING,token=TOKEN)

    def test_required_marker_and_bad_binding_never_select_legacy(self):
        self.path.with_suffix('.required').write_text('required')
        self.assertEqual(self.resolve()[1]['state'],'unavailable')
        self.write(); self.resolve(); marker=self.state/MARKER
        target=self.root/'retain.txt';target.write_text('private retained')
        marker.unlink();marker.symlink_to(target)
        self.assertIsNone(self.resolve()[0]); self.assertEqual(target.read_text(),'private retained')


if __name__ == '__main__': unittest.main()
