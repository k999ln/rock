"""Real legacy/managed TLS and durable owner-client connection recovery."""
from contextlib import contextmanager, closing
from dataclasses import replace
import copy
import json
import os
from pathlib import Path
import socket
import sqlite3
import ssl
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch
import uuid

from game_legacy_basis import LegacyGameBasis, A1, A2, B1, DEVICE_OWNER, ROOT, rows
from game_exchange import protocol as gp
from game_exchange.client import OwnerConnectionClient, ConnectionUnavailable
from game_exchange.connections import GameGateway
from wallet_backend.client import HTTPSWalletTransport
from wallet_backend.contract_runtime import ContractRuntime
from wallet_backend.owner_router import OwnerRouter
from wallet_backend.server import ManagedHandler, ManagedWalletBackendServer


class OwnerClientTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve()
        self.b=LegacyGameBasis(self.root);self.clients={}
        self.addCleanup(self.temp.cleanup);self.addCleanup(self.b.close);self.addCleanup(self.close_clients)
        self.b.create_legacy();self.b.adopt();self.b.start_managed();self.b.activate_new_devices()
        self.before=self.b.business_evidence()
        for device in (A2,B1):self.clients[device]=self.make_client(device)

    def make_client(self,device,**changes):
        arguments={'transport':self.b.transports[device],
            'games':tuple(a.game for a in self.b.authorities),'keys':self.b.gateway.keys,'clock':lambda:self.b.now}
        arguments.update(changes)
        return OwnerConnectionClient(self.root/('client-'+device),**arguments)

    def close_clients(self):
        for client in self.clients.values():client.close()
        self.clients={}

    @contextmanager
    def drop(self,operation):
        original=ManagedHandler.respond;observed=[]
        def respond(handler,status,reply):
            if status==200 and reply.get('ok') is True and reply.get('result',{}).get('operation')==operation:
                observed.append(copy.deepcopy(reply))
                try:handler.connection.shutdown(socket.SHUT_RDWR)
                except OSError:pass
                return
            return original(handler,status,reply)
        with patch.object(ManagedHandler,'respond',respond):yield observed

    def restart(self):
        port=self.b.server.server_port;self.close_clients();self.b.stop_listener()
        self.b.router=OwnerRouter(self.root/'owner-router',self.b.credentials,clock=lambda:self.b.now)
        self.b.runtimes={owner:ContractRuntime.open_active(ledger,coordinator=self.b.coordinator,
            provisioning_file=ROOT/'os/entitlement/fixtures/device-handoff.json' if owner=='alice' else self.root/'bob-handoff.json',
            verifier=self.b.router,clock=lambda:self.b.now)
            for owner,ledger in (('alice','legacy-alice'),('bob','current-bob'))}
        self.b.gateway=GameGateway(self.root/'game-index',tuple(self.b.authorities),clock=lambda:self.b.now)
        self.b.serve(ManagedWalletBackendServer(('127.0.0.1',port),router=self.b.router,
            runtimes=tuple(self.b.runtimes.values()),game_gateway=self.b.gateway,start_scheduler=False,timeout=3))
        for device,owner in DEVICE_OWNER.items():
            self.b.transports[device]=self.b.make_transport(device,self.b.runtimes[owner].descriptor.wallet_authority_id)
        for device in (A2,B1):self.clients[device]=self.make_client(device)

    def begin(self,device=A2,game='a',key=None):
        req=self.b.begin_request(device,game,key or 'begin-'+game)
        return req,self.clients[device].dispatch(req)['result']

    def approval(self,device,intent,key):
        credential=self.b.authenticators[device].get_game_assertion(intent,'0000','client-'+key)
        return {'v':1,'op':'game.connection.approve','key':key,'intent_id':intent['binding']['intent_id'],
            'challenge_id':intent['challenge_id'],'binding_sha256':intent['binding_sha256'],'credential':credential}

    def counters(self):
        return {owner:rows(runtime.descriptor.canonical_state/'wallet-simulator.db','wallet_auth_credential_state')
            for owner,runtime in self.b.runtimes.items()}

    def test_four_connections_lost_real_responses_restart_same_ids_once(self):
        requests={};begins={}
        with self.drop('game.connection.begin') as dropped:
            for device in (A2,B1):
                for game in ('a','b'):
                    req=self.b.begin_request(device,game,'same-begin-'+game);requests[device,game]=req
                    with self.assertRaises(ConnectionUnavailable):self.clients[device].dispatch(req)
            self.assertEqual(len(dropped),4)
        ids={reply['result']['binding']['connection_id'] for reply in dropped}
        self.restart()
        for pair,req in requests.items():
            intent=self.clients[pair[0]].retry(req['op'],req['key'])['result'];begins[pair]=intent
            self.assertIn(intent['binding']['connection_id'],ids)
        approvals={}
        with self.drop('game.connection.approve') as dropped:
            for pair,intent in begins.items():
                req=self.approval(pair[0],intent,'same-approve-'+pair[1]);approvals[pair]=req
                with self.assertRaises(ConnectionUnavailable):self.clients[pair[0]].dispatch(req)
            self.assertEqual(len(dropped),4)
        committed=self.counters();self.assertEqual(self.b.game_counts(),{'alice':2,'bob':2})
        self.restart()
        for pair,req in approvals.items():
            client=self.clients[pair[0]];reply=client.retry(req['op'],req['key'])
            self.assertEqual(client.dispatch(req),reply)
            view=client.dispatch({'v':1,'op':'game.connection.status','connection_id':reply['result']['binding']['connection_id']})
            self.assertEqual(view['result']['current_state'],'ACTIVE')
        self.assertEqual(self.counters(),committed)
        revokes={}
        with self.drop('connection.publish') as dropped:
            for pair,intent in begins.items():
                req={'v':1,'op':'game.connection.revoke','key':'same-revoke-'+pair[1],
                    'connection_id':intent['binding']['connection_id']};revokes[pair]=req
                with self.assertRaises(ConnectionUnavailable):self.clients[pair[0]].dispatch(req)
            self.assertEqual(len(dropped),4)
        self.restart()
        for pair,req in revokes.items():
            reply=self.clients[pair[0]].retry(req['op'],req['key'])
            self.assertEqual(reply['result']['publication']['state'],'REVOKED')
            self.assertEqual(self.clients[pair[0]].dispatch({'v':1,'op':'game.connection.status',
                'connection_id':req['connection_id']})['result']['current_state'],'REVOKED')
        self.assertEqual(self.b.game_counts(),{'alice':2,'bob':2});self.assertEqual(self.counters(),committed)
        self.assertEqual(self.b.business_evidence(),self.before);self.b.assert_retained(self,claimed=True)

    def test_before_send_durable_and_new_key_does_not_replace_unknown(self):
        client=self.clients[A2];req=self.b.begin_request(A2,'a','pending')
        original=HTTPSWalletTransport.exchange
        def observe(transport,request):
            with closing(sqlite3.connect(client.store.path/'game.sqlite3')) as db:
                saved=db.execute('SELECT request FROM requests WHERE operation=? AND key=?',(req['op'],req['key'])).fetchone()
            self.assertEqual(gp.decode(saved[0].encode()),req)
            return original(transport,request)
        with patch.object(HTTPSWalletTransport,'exchange',observe),self.drop('game.connection.begin'):
            with self.assertRaises(ConnectionUnavailable):client.dispatch(req)
        for changed in (dict(req,key='another-id'),dict(req,connection_expires_at=req['connection_expires_at']+1)):
            with self.assertRaises(gp.ProtocolError):client.dispatch(changed)
        self.assertEqual(len(client.pending()),1)
        self.assertFalse(client.pending()[0]['has_receipt'])
        self.assertEqual(client.retry(req['op'],req['key'])['result']['key'],'pending')

    def test_namespace_operation_key_and_denial_never_returns_old_receipt(self):
        _,intent=self.begin(key='shared')
        req=self.approval(A2,intent,'shared');client=self.clients[A2]
        success=client.dispatch(req);credential=success['result']['credential_id']
        self.b.runtimes['alice'].revoke_credential(credential,'revoke-client-credential')
        denial=client.dispatch(req);self.assertFalse(denial['ok'])
        self.assertIn(denial['code'],('rejected','unauthorized'))
        with client.store.transaction() as db:
            row=db.execute('SELECT receipt,last_contact FROM requests WHERE operation=? AND key=?',(req['op'],req['key'])).fetchone()
            self.assertEqual(gp.decode(row[0].encode()),success);self.assertIn(row[1],('DENIED','REJECTED'))

    def test_fingerprint_other_device_owner_token_ca_protocol_and_keys_rejected(self):
        self.begin();self.clients[A2].close()
        for device in (A1,B1):
            with self.assertRaises(gp.ProtocolError):self.make_client(A2,transport=self.b.transports[device])
        transport=self.b.transports[A2]
        token=self.b.token_file('wrong-token','PUBLIC-DIFFERENT-OWNER-TOKEN-0001')
        ca=self.root/'other-ca.pem';ca.write_bytes((ROOT/'os/registry/fixtures/development-ca.pem').read_bytes()+b'\n');ca.chmod(0o600)
        for custom in (
            HTTPSWalletTransport(transport.origin,ROOT/'os/registry/fixtures/development-ca.pem',token,authority_id=transport.authority_id,device_ref=A2,protocol_version=3),
            HTTPSWalletTransport(transport.origin,ca,self.root/(A2+'-token'),authority_id=transport.authority_id,device_ref=A2,protocol_version=3),
            HTTPSWalletTransport(transport.origin,ROOT/'os/registry/fixtures/development-ca.pem',self.root/(A2+'-token'),authority_id=transport.authority_id,device_ref=A2)):
            with self.assertRaises(gp.ProtocolError):self.make_client(A2,transport=custom)
        records=tuple(self.b.gateway.keys.records.values())
        with self.assertRaises(gp.ProtocolError):self.make_client(A2,keys=gp.KeyRegistry((replace(records[0],not_after=records[0].not_after+1),)+records[1:]))
        self.clients[A2]=self.make_client(A2)

    def test_foreign_game_and_modified_consent_or_stored_receipt_refused(self):
        client=self.clients[A2];original=ManagedHandler.respond
        def wrong_game(handler,status,reply):
            if status==200 and reply.get('result',{}).get('operation')=='game.connection.begin':
                reply=copy.deepcopy(reply);reply['result']['binding']['game_id']='foreign-game'
                reply['result']['binding_sha256']=gp.binding_digest(reply['result']['binding'])
            return original(handler,status,reply)
        req=self.b.begin_request(A2,'a','altered-begin')
        with patch.object(ManagedHandler,'respond',wrong_game):
            with self.assertRaises(ConnectionUnavailable):client.dispatch(req)
        intent=client.retry(req['op'],req['key'])['result'];approval=self.approval(A2,intent,'approval')
        def wrong_counter(handler,status,reply):
            if status==200 and reply.get('result',{}).get('operation')=='game.connection.approve':
                reply=copy.deepcopy(reply);reply['result']['credential_sign_count']+=1
            return original(handler,status,reply)
        with patch.object(ManagedHandler,'respond',wrong_counter):
            with self.assertRaises(ConnectionUnavailable):client.dispatch(approval)
        accepted=client.retry(approval['op'],approval['key'])
        def another_receipt(handler,status,reply):
            if status==200 and reply.get('result',{}).get('operation')=='game.connection.approve':
                reply=copy.deepcopy(reply);reply['result']['receipt_id']=str(uuid.uuid4())
            return original(handler,status,reply)
        with patch.object(ManagedHandler,'respond',another_receipt):
            with self.assertRaises(ConnectionUnavailable):client.dispatch(approval)
        self.assertEqual(client.retry(approval['op'],approval['key']),accepted)

    def test_bad_signed_revoke_and_status_never_fall_back_to_cache(self):
        client=self.clients[A2];_,intent=self.begin();approval=self.approval(A2,intent,'approve');client.dispatch(approval)
        req={'v':1,'op':'game.connection.revoke','key':'revoke','connection_id':intent['binding']['connection_id']}
        original=ManagedHandler.respond
        def corrupt(handler,status,reply):
            if status==200 and reply.get('result',{}).get('operation')=='connection.publish':
                reply=copy.deepcopy(reply);reply['result']['signature']=gp.b64(bytes(64))
            return original(handler,status,reply)
        with patch.object(ManagedHandler,'respond',corrupt):
            with self.assertRaises(ConnectionUnavailable):client.dispatch(req)
        client.retry(req['op'],req['key']);status={'v':1,'op':'game.connection.status','connection_id':req['connection_id']}
        self.assertEqual(client.dispatch(status)['result']['current_state'],'REVOKED')
        self.b.stop_listener()
        with self.assertRaises(ConnectionUnavailable):client.dispatch(status)

    def test_owned_lock_unlink_capacity_and_close_fail_before_send(self):
        client=self.clients[A2]
        with self.assertRaises(BlockingIOError):self.make_client(A2)
        req,intent=self.begin()
        with client.store.transaction() as db:
            for number in range(9999):
                fake={'v':1,'op':'game.connection.revoke','key':'capacity-'+str(number),'connection_id':str(uuid.uuid4())}
                db.execute('INSERT INTO requests VALUES (?,?,?,?,NULL,?)',(fake['op'],fake['key'],gp.canonical(fake).decode(),
                    'revoke:'+fake['connection_id'],'PREPARED'))
        with self.assertRaises(gp.ProtocolError):client.dispatch(self.approval(A2,intent,'capacity-approve'))
        first=client.pending();self.assertEqual(len(first),50);self.assertLess(len(gp.canonical(first)),65536)
        second=client.pending(after=(first[-1]['operation'],first[-1]['key']))
        self.assertEqual(len(second),50);self.assertNotEqual(first[0]['key'],second[0]['key'])
        (client.store.path/'game.lock').unlink()
        with self.assertRaises((OSError,gp.ProtocolError)):client.dispatch(req)
        client.close()
        with self.assertRaises(gp.ProtocolError):client.dispatch(req)

    def test_expired_unknown_begin_replays_but_new_proof_request_does_not(self):
        client=self.clients[A2];request=self.b.begin_request(A2,'a','expiring')
        with self.drop('game.connection.begin'):
            with self.assertRaises(ConnectionUnavailable):client.dispatch(request)
        self.b.now+=121;self.restart();client=self.clients[A2]
        intent=client.retry(request['op'],request['key'])['result']
        self.assertLess(intent['binding']['intent_expires_at'],self.b.now)
        altered=dict(request,key='new-expired-attempt')
        with self.assertRaises(gp.ProtocolError):client.dispatch(altered)
        self.assertEqual(self.b.game_counts(),{'alice':0,'bob':0})

    def test_transport_revocation_denial_after_receipt_and_live_pin_change(self):
        request,_=self.begin();client=self.clients[A2]
        self.b.router.revoke_device_credential(A2,1)
        denied=client.dispatch(request);self.assertEqual(denied['code'],'unauthorized')
        self.assertFalse(denied['ok']);self.assertTrue(client.pending()[0]['has_receipt'])
        self.assertEqual(client.pending()[0]['last_contact'],'DENIED')
        original=client.transport.authority_id;client.transport.authority_id=str(uuid.uuid4())
        try:
            with self.assertRaises(gp.ProtocolError):client.dispatch(request)
        finally:client.transport.authority_id=original

    def test_response_after_local_receipt_storage_failure_remains_unknown(self):
        request,intent=self.begin();client=self.clients[A2]
        approval=self.approval(A2,intent,'storage-failure')
        with client.store.transaction() as db:
            db.execute("CREATE TRIGGER fail_receipt BEFORE UPDATE OF receipt ON requests BEGIN SELECT RAISE(ABORT,'injected local receipt storage failure'); END")
        with self.assertRaises(ConnectionUnavailable):client.dispatch(approval)
        self.assertEqual(self.b.game_counts()['alice'],1);counter=self.counters()
        self.assertFalse(client.pending()[0]['has_receipt'])
        with client.store.transaction() as db:db.execute('DROP TRIGGER fail_receipt')
        self.restart();self.assertTrue(self.clients[A2].retry(approval['op'],approval['key'])['ok'])
        self.assertEqual(self.counters(),counter);self.assertEqual(self.b.game_counts()['alice'],1)

    def test_actual_ca_tls_and_registry_changes_rejected_with_same_fingerprint(self):
        req,_=self.begin();client=self.clients[A2];transport=client.transport;fingerprint=transport.fingerprint
        extra=self.root/'extra-ca.pem'
        subprocess.run(['openssl','req','-new','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1',
            '-nodes','-subj','/CN=PUBLIC-SYNTHETIC-CLIENT-NEGATIVE-CA','-days','1',
            '-addext','basicConstraints=critical,CA:TRUE','-keyout',str(self.root/'extra-ca.key'),'-out',str(extra)],
            check=True,capture_output=True,timeout=5)
        (self.root/'extra-ca.key').chmod(0o600)
        def fail_before_send():
            self.assertEqual(transport.fingerprint,fingerprint)
            with patch.object(HTTPSWalletTransport,'exchange',side_effect=AssertionError('unexpected send')):
                with self.assertRaises(gp.ProtocolError):client.dispatch(req)
        transport.context.load_verify_locations(cafile=str(extra));fail_before_send()
        transport.context=self.b.make_transport(A2,transport.authority_id).context
        transport.context.minimum_version=ssl.TLSVersion.TLSv1_3;fail_before_send()
        transport.context=self.b.make_transport(A2,transport.authority_id).context
        oldkeys=client.keys;records=tuple(oldkeys.records.values())
        client.keys=gp.KeyRegistry((replace(records[0],not_after=records[0].not_after-1),)+records[1:]);fail_before_send()
        client.keys=oldkeys;identity=next(iter(client.games));oldgame=client.games[identity]
        client.games[identity]=replace(oldgame,game_name='Different pinned display');fail_before_send()
        client.games[identity]=oldgame;self.assertTrue(client.dispatch(req)['ok'])

    def test_prepare_commit_failure_sends_zero_requests(self):
        client=self.clients[A2];request=self.b.begin_request(A2,'a','before-send')
        with client.store.transaction() as db:
            db.execute("CREATE TRIGGER fail_prepare BEFORE INSERT ON requests BEGIN SELECT RAISE(ABORT,'injected prepare failure'); END")
        with patch.object(HTTPSWalletTransport,'exchange',side_effect=AssertionError('unexpected send')):
            with self.assertRaises(sqlite3.Error):client.dispatch(request)
        self.assertEqual(client.pending(),[]);self.assertEqual(self.b.game_counts(),{'alice':0,'bob':0})

    def test_prepare_directory_fsync_failure_sends_zero_and_retains_request(self):
        client=self.clients[A2];request=self.b.begin_request(A2,'a','before-fsync')
        identity=client.store.path.stat().st_ino;original=os.fsync
        def fail_own_directory(fd):
            if os.fstat(fd).st_ino==identity:raise OSError('injected client directory sync failure')
            return original(fd)
        with patch('game_exchange.storage.os.fsync',side_effect=fail_own_directory),\
                patch.object(HTTPSWalletTransport,'exchange',side_effect=AssertionError('unexpected send')):
            with self.assertRaises(OSError):client.dispatch(request)
        self.assertEqual(client.pending()[0]['last_contact'],'PREPARED')
        self.assertTrue(client.retry(request['op'],request['key'])['ok'])

    def test_post_response_directory_fsync_failure_is_unknown_with_receipt_retained(self):
        client=self.clients[A2];_,intent=self.begin();request=self.approval(A2,intent,'after-fsync')
        identity=client.store.path.stat().st_ino;original_sync=os.fsync;original_exchange=HTTPSWalletTransport.exchange
        returned=False;failed=False
        def exchange(transport,body):
            nonlocal returned
            reply=original_exchange(transport,body);returned=True;return reply
        def fail_after_reply(fd):
            nonlocal failed
            if returned and not failed and os.fstat(fd).st_ino==identity:
                failed=True;raise OSError('injected post-response client sync failure')
            return original_sync(fd)
        with patch.object(HTTPSWalletTransport,'exchange',exchange),patch('game_exchange.storage.os.fsync',side_effect=fail_after_reply):
            with self.assertRaises(ConnectionUnavailable):client.dispatch(request)
        self.assertTrue(failed);self.assertEqual(self.b.game_counts()['alice'],1);counter=self.counters()
        pending=client.pending()[0];self.assertTrue(pending['has_receipt']);self.assertEqual(pending['last_contact'],'UNKNOWN')
        self.restart();self.assertTrue(self.clients[A2].retry(request['op'],request['key'])['ok'])
        self.assertEqual(self.counters(),counter)

    def test_timeout_changes_are_rejected_before_send(self):
        client=self.clients[A2];request,_=self.begin();original=client.transport.timeout
        for timeout in (None,True,0,60,float('inf'),float('nan'),.5):
            with self.subTest(timeout=timeout):
                client.transport.timeout=timeout
                with patch.object(HTTPSWalletTransport,'exchange',side_effect=AssertionError('unexpected send')):
                    with self.assertRaises(gp.ProtocolError):client.dispatch(request)
        client.transport.timeout=original
        self.assertTrue(client.dispatch(request)['ok'])


if __name__=='__main__':unittest.main()
