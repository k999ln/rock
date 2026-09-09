"""Focused proof guards and an owned host TLS/monthly rehearsal; not OS evidence."""
from copy import deepcopy
from contextlib import closing
from datetime import datetime, timezone
import importlib.util
import hashlib
import json
import multiprocessing as mp
from pathlib import Path
import sys
import sqlite3
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os')]
from entitlement.protocol import PUBLIC_TOKENS, TERMS_VERSION
from service_access import verify_offline_os as verifier
from service_access.guest_offline_probe import phase_from, reject_pin_fields
from service_access.serve import DEVICE
from wallet_auth.fixture import SoftwareTestAuthenticator
from wallet_backend.client import HTTPSWalletTransport, RemoteWalletService, BackendUnavailable


def money(count, renew=True, paid='PAID'):
    return {'authority_id': 'fixture-authority', 'simulation_only': True,
            'available_minor': 5000-888*count, 'held_minor': 0, 'billed_minor': 888*count,
            'bills': [{'period': month, 'amount_minor': 888} for month in verifier.MONTHS[:count]],
            'auto_renew': renew, 'paid_state': paid, 'device_eligible': True, 'shared_store': True,
            'billing': [{'period': month, 'status': 'paid'} for month in verifier.MONTHS[:count]]}


def proof_fixture():
    snapshots = {'september': money(1), 'october_off': money(2), 'october_restart': money(2),
                 'november_off': money(2, False, 'PAUSED')}
    boots = []
    auth = {'authenticator_request_count': 1, 'authenticator_credential_count': 1,
            'authenticator_requests_sha256': 'a'*64, 'authenticator_credentials_sha256': 'b'*64}
    for phase in (1, 2, 3):
        status = {'authority_id': 'fixture-authority', 'device_ref': DEVICE, 'consumer_id': 'alice-a',
                  'paid_state': 'PAUSED' if phase == 3 else 'PAID',
                  'allowed_actions': ['registry.index'] + (['runner.cloud.submit'] if phase != 3 else [])}
        wallet = {'available_minor': 4112 if phase == 1 else 3224, 'billed_minor': 888 if phase == 1 else 1776,
                  'bill_count': 1 if phase == 1 else 2, 'auto_renew': phase == 1, 'auth_active': True,
                  'backend': {'connected': True, 'stale': False, 'pending_reconciliation': False},
                  'credential_id_sha256': 'c'*64, 'service_access': status}
        proof = {'status': 'PASS', 'phase': phase, 'boot_id': 'boot-'+str(phase), 'wallet_final': wallet,
                 'private_evidence': {**auth, 'pending': 0, 'cache_receipts': []},
                 'children': [{'uid': 1000, 'gid': 1000, 'groups': [], 'peer_uid': 1002}],
                 'environment': {'processes': [{'uid': n} for n in (1002,1003,1004)]},
                 'platform_service_access': status}
        boots.append({'guest': proof, 'cache_receipts': [], 'authenticator': dict(auth)})
    wire = [{'kind': 'wallet', 'key': 'offline-consent', 'request_sha256': 'd'*64,
             'response_sha256': 'e'*64, 'body_cut_after_commit': n==0,
             'authority_matched': True, 'device_matched': True} for n in range(3)]
    wire.append({'kind': 'registry', 'clock': verifier.NOVEMBER, 'path': '/index.json',
                 'status': 200, 'authority_matched': True})
    return boots, snapshots, wire


def runner_fixture():
    package = verifier.remote_fixture(); endpoint = 'fixture-offline-endpoint'
    rows, calls, boots = [], [], []
    for month in ('september', 'october'):
        key = 'offline-remote-' + month
        request = {'v':1, 'op':'submit', 'key':key, 'endpoint_id':endpoint,
                   'package':package, 'text':verifier.TEXT,
                   'consent':verifier.consent_for(package,verifier.TEXT,target='cloud',endpoint_id=endpoint,key=key)}
        proof = {'kind':'actual_linux_isolated_process', 'fixture_guard_only':month}
        receipt = {'key':key, 'request_sha256':verifier.digest(request)}
        rows.append({'key':key, 'state':'succeeded', 'request_json':None, 'consumer_id':'alice-a', 'device_ref':DEVICE,
                     'request_sha256':verifier.digest(request), 'output_json':json.dumps(verifier.OUTPUT),
                     'execution_json':json.dumps(proof), 'receipt_json':json.dumps(receipt)})
        calls.append({'input_sha256':hashlib.sha256(verifier.TEXT.encode()).hexdigest(),
                      'output_sha256':hashlib.sha256(verifier.OUTPUT.encode()).hexdigest(),'execution':proof})
        boots.append({'guest':{'remote':{'remote':{'output':verifier.OUTPUT,'execution':proof}}}})
    return sorted(rows,key=lambda row:row['key']), calls, boots, package, endpoint


class OfflineProofGuards(unittest.TestCase):
    def test_three_phase_flag_is_exact(self):
        for phase in (1,2,3): self.assertEqual(phase, phase_from(f'console=x rock.purchaser-offline.verify={phase}'))
        for flag in ('', 'rock.purchaser-offline.verify=01', 'rock.purchaser-offline.verify=4',
                     'rock.purchaser-offline.verify=1 rock.purchaser-offline.verify=2'):
            with self.assertRaises(AssertionError): phase_from(flag)

    def test_nested_pin_metadata_is_rejected(self):
        reject_pin_fields({'request': [{'challenge': 'public-fixture'}]})
        for key in ('pin','PIN','test_pin'):
            with self.assertRaises(AssertionError): reject_pin_fields({'receipts': [{'metadata': {key:'0000'}}]})

    def test_all_current_sources_compile(self):
        for name in verifier.OWN_SOURCES: compile((ROOT/name).read_text(), name, 'exec')

    def test_well_formed_proof_fixture(self): verifier.validate_proofs(*proof_fixture())

    def reject(self, change):
        boot, snapshots, wire = proof_fixture(); change(boot, snapshots, wire)
        with self.assertRaises(AssertionError): verifier.validate_proofs(boot, snapshots, wire)

    def test_reused_boot_identity(self): self.reject(lambda b,s,w: b[2]['guest'].update(boot_id='boot-1'))
    def test_stale_cache_does_not_prove_reconnection(self): self.reject(lambda b,s,w: b[1]['guest']['wallet_final']['backend'].update(stale=True))
    def test_second_debit_same_period(self): self.reject(lambda b,s,w: s['october_off']['bills'][1].update(period='2026-09'))
    def test_cancelled_month_cannot_renew(self): self.reject(lambda b,s,w: s['november_off'].update(auto_renew=True))
    def test_monthly_new_signature_rejected(self): self.reject(lambda b,s,w: b[1]['guest']['private_evidence'].update(authenticator_request_count=2))
    def test_credential_replaced_on_reboot_rejected(self): self.reject(lambda b,s,w: b[1]['guest']['wallet_final'].update(credential_id_sha256='z'*64))
    def test_unknown_replay_changed_payload(self): self.reject(lambda b,s,w: w[1].update(request_sha256='z'*64))
    def test_unknown_replay_changed_receipt(self): self.reject(lambda b,s,w: w[1].update(response_sha256='z'*64))
    def test_missing_actual_cut_rejected(self): self.reject(lambda b,s,w: w[0].update(body_cut_after_commit=False))
    def test_pending_mutation_cannot_be_ignored(self): self.reject(lambda b,s,w: b[1]['guest']['private_evidence'].update(pending=1))
    def test_wrong_peer_rejected(self): self.reject(lambda b,s,w: b[1]['guest']['children'][0].update(uid=0))
    def test_wrong_authority_paid_view(self): self.reject(lambda b,s,w: b[1]['guest']['platform_service_access'].update(authority_id='other-authority'))
    def test_closed_authenticator_must_match(self): self.reject(lambda b,s,w: b[1]['authenticator'].update(authenticator_requests_sha256='z'*64))
    def test_missing_november_store_read(self): self.reject(lambda b,s,w: w.pop())

    def test_exact_runner_join(self): self.assertEqual(2,len(verifier.validate_runner(*runner_fixture())))

    def test_other_consent_request_cannot_join(self):
        args=runner_fixture();args[0][0]['request_sha256']='0'*64
        with self.assertRaises(AssertionError):verifier.validate_runner(*args)

    def test_other_execution_cannot_join(self):
        args=runner_fixture();args[1][0]['execution']={'kind':'actual_linux_isolated_process','other_job':True}
        with self.assertRaises(AssertionError):verifier.validate_runner(*args)

    def test_unrelated_terminal_receipt_cannot_join(self):
        args=runner_fixture();args[0][0]['receipt_json']=json.dumps({'key':'other','request_sha256':'0'*64})
        with self.assertRaises(AssertionError):verifier.validate_runner(*args)

    def test_enrollment_response_must_join_stopped_cache(self):
        cache=[{'key':key,'op':op,'request_sha256':'a'*64,'response_sha256':'b'*64} for key,op in
               [('offline-auth-begin','wallet.auth.begin'),('offline-auth-enroll','wallet.auth.enroll'),('offline-terms','wallet.terms')]]
        closed={'membership_receipts':[], 'authentication':{'credential_id_sha256':'c'*64},
                'wallet_receipts':{row['key']:{'operation':row['op'],'request_sha256':'a'*64,'result_sha256':'b'*64} for row in cache}}
        verifier.validate_wallet_receipts(cache,closed,'c'*64)
        closed['wallet_receipts']['offline-auth-enroll']['result_sha256']='d'*64
        with self.assertRaises(AssertionError):verifier.validate_wallet_receipts(cache,closed,'c'*64)

    def test_failed_child_exit_retains_exact_diagnostics(self):
        class Ended:
            pid=2147483647
            exitcode=-9
            def join(self, _):pass
            def is_alive(self):return False
        record={}
        with self.assertRaises(AssertionError):verifier.join_authority(Ended(),record)
        self.assertEqual(-9,record['exit_code']);self.assertFalse(record['alive_after_join'])
        self.assertIn('join_finished_utc',record)


class UnusedExecutor:
    def execute(self, *_):
        raise AssertionError('host billing rehearsal must not execute a Runner job')


def host_authority(state, log, clock, ports, identity, cut, pipe):
    # Explicit host fixture: the real authority/TLS/scheduler runs, while no
    # Linux executor or OS is claimed or invoked by this test.
    verifier.executor = lambda _: UnusedExecutor()
    verifier.authority_process(state, log, clock, ports, identity, cut, pipe)


class HostTLSMonthlyRehearsal(unittest.TestCase):
    def test_unknown_consent_monthly_once_and_backend_restart(self):
        with tempfile.TemporaryDirectory(prefix='rock-offline-host-only-') as tmp:
            root = Path(tmp); child = pipe = wallet = authenticator = None
            now = int(datetime(2026,9,8,20,tzinfo=timezone.utc).timestamp())
            def start(generation, ports=None, identity=None, cut=False):
                nonlocal child,pipe
                ctx=mp.get_context('spawn');pipe,peer=ctx.Pipe()
                child=ctx.Process(target=host_authority,args=(str(root/'backend'),str(root/f'authority-{generation}.log'),now,ports,identity,cut,peer))
                child.start();peer.close();return verifier.receive(pipe)
            def stop():
                nonlocal child,pipe
                result=verifier.rpc(pipe,'stop');child.join(15)
                self.assertFalse(child.is_alive());self.assertEqual(0,child.exitcode)
                pipe.close();child=pipe=None;return result
            try:
                ready=start(1,cut=True);ports={p:ready['metadata'][p] for p in ('registry_port','runner_port','wallet_port')}
                token=root/'PUBLIC-token';token.write_text(PUBLIC_TOKENS['alice']);token.chmod(0o600)
                transport=HTTPSWalletTransport(f"https://127.0.0.1:{ports['wallet_port']}",ROOT/'os/registry/fixtures/development-ca.pem',token,authority_id=ready['metadata']['authority_id'],device_ref=DEVICE)
                wallet=RemoteWalletService(root/'cache',transport)
                def call(op,key=None,**fields):
                    request={'v':1,'op':op,**fields}
                    if key:request['key']=key
                    reply=wallet.dispatch(request,peer_uid=1002);self.assertTrue(reply['ok']);return reply.get('result',reply.get('snapshot'))
                call('wallet.register','offline-register')
                begin=call('wallet.auth.begin','offline-auth-begin')
                authenticator=SoftwareTestAuthenticator(root/'authenticator',DEVICE)
                credential=authenticator.make_credential(begin['options'],'0000','offline-auth-create')
                call('wallet.auth.enroll','offline-auth-enroll',challenge_id=begin['challenge_id'],credential=credential)
                call('wallet.terms','offline-terms',accepted=True,terms_version='rock-wallet-development/1')
                verifier.rpc(pipe,'seed')
                request={'v':1,'op':'wallet.consent','key':'offline-consent','accepted':True,'terms_version':TERMS_VERSION}
                with self.assertRaises(BackendUnavailable):wallet.dispatch(request,peer_uid=1002)
                consent=wallet.dispatch(request,peer_uid=1002);self.assertTrue(consent['ok'])
                verifier.wait_money(pipe,1,True,'PAID')
                wallet.close();wallet=None
                now=verifier.OCTOBER;verifier.rpc(pipe,'clock',now=now);verifier.wait_money(pipe,2,True,'PAID')
                first=stop();self.assertEqual(1,sum(w.get('body_cut_after_commit',False) for w in first['wire']))
                again=start(2,ports,ready['metadata']['authority_id'])
                self.assertEqual(ready['metadata'],again['metadata'])
                verifier.wait_money(pipe,2,True,'PAID')
                wallet=RemoteWalletService(root/'cache',transport)
                self.assertEqual(consent,wallet.dispatch(request,peer_uid=1002))
                snapshot=call('snapshot');self.assertEqual((3224,1776),(snapshot['available_minor'],snapshot['billed_minor']))
                self.assertEqual('PAID',snapshot['service_access']['paid_state'])
                call('wallet.consent','offline-cancel',accepted=False,terms_version=TERMS_VERSION)
                now=verifier.NOVEMBER;verifier.rpc(pipe,'clock',now=now);verifier.wait_money(pipe,2,False,'PAUSED')
                self.assertEqual('PAUSED',call('snapshot')['service_access']['paid_state'])
                stop();closed=verifier.closed_authority(root/'backend')
                self.assertEqual(2,len(closed['authorizations']))
                with closing(sqlite3.connect('file:'+str(root/'cache/remote-cache.db')+'?mode=ro',uri=True)) as db:
                    db.row_factory=sqlite3.Row;db.execute('PRAGMA query_only=ON')
                    rows=db.execute('SELECT key,payload,response FROM requests ORDER BY key').fetchall()
                    cached=[{'key':r['key'],'op':json.loads(r['payload'])['op'],
                             'request_sha256':verifier.digest(json.loads(r['payload'])),
                             'response_sha256':verifier.digest(json.loads(r['response']))} for r in rows]
                verifier.validate_wallet_receipts(cached,closed,verifier.digest(snapshot['auth']['credential_id']))
            finally:
                if wallet is not None:wallet.close()
                if authenticator is not None:authenticator.close()
                if child is not None:
                    if child.is_alive():
                        try:pipe.send({'op':'stop'})
                        except (OSError,EOFError):pass
                    child.join(15)
                    if child.is_alive():child.terminate();child.join(5)
                    if child.is_alive():child.kill();child.join(5)
                    pipe.close()


if __name__=='__main__':unittest.main()
