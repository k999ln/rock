"""Real A/C Wallet/ATM/Auth composition with explicit test principal verification.

This uses actual coordinator storage and permits. Owner-router TLS has separate
integration tests; this does not claim adoption, OS boot or provider safety.
"""
from contextlib import closing
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'os'))
from entitlement.protocol import sign_fixture_event
from wallet_auth.fixture import SoftwareTestAuthenticator
from wallet_backend.contract_runtime import ContractRuntime
from wallet_backend.runtime_contracts import (FreshContractSpec, AuthenticatedDevicePrincipal, RuntimeAdmissionRejected)
from wallet_backend.authority_fence import AuthorityFenceCoordinator

NOW = 1788856800


class VerifiedFixturePrincipal:
    def __init__(self, principal, identity):self.principal=principal;self.revoked=False;self.registry=identity
    def registry_identity(self):return self.registry
    def assert_current(self, principal, descriptor):
        if self.revoked or principal != self.principal or principal.ledger_ref != descriptor.ledger_ref:
            raise RuntimeAdmissionRejected('fixture principal no longer current')


class RuntimeWalletCompositionTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory(prefix='rock-runtime-wallet-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name).resolve();self.runtimes=[]
        owner_registry=self.root/'owner-registry';owner_registry.mkdir(mode=0o700)
        self.registry_identity=(owner_registry,str(uuid.uuid4()))
        self.coordinator=AuthorityFenceCoordinator(self.root/'coordinator')
        self.addCleanup(self.close_runtimes)

    def close_runtimes(self):
        for runtime in reversed(self.runtimes):runtime.close()
        self.coordinator.close()

    def open_runtime(self, owner):
        state=self.root/owner
        device='fixture-runtime-'+owner
        spec=FreshContractSpec('fixture-ledger-'+owner,state,owner,'fixture-owner-'+owner,device)
        principal=AuthenticatedDevicePrincipal(spec.ledger_ref,owner,spec.owner_ref,device,1)
        event=json.loads((ROOT/'os/entitlement/fixtures/device-handoff.json').read_text())['events'][0]
        payload={**event['payload'],'device_ref':device,'owner_ref':spec.owner_ref,
            'purchase_ref':'fixture-runtime-purchase-'+owner,'verification_ref':'fixture-runtime-verification-'+owner}
        envelope=sign_fixture_event('fulfillment','fixture-runtime-handoff-'+owner,'device:'+device,1,
            event['occurred_at'],'handoff',payload)
        provisioning=self.root/(owner+'-handoff.json')
        provisioning.write_text(json.dumps({'schema_version':1,'kind':'public-development-fixture','events':[envelope]}))
        provisioning.chmod(0o600)
        verifier=VerifiedFixturePrincipal(principal,self.registry_identity)
        runtime=ContractRuntime.open_fresh(spec,coordinator=self.coordinator,provisioning_file=provisioning,
            verifier=verifier,clock=lambda:NOW)
        permit=runtime._writer
        self.runtimes.append(runtime)
        return runtime,principal,permit,verifier

    def call(self,runtime,principal,op,**fields):
        result=runtime.dispatch(principal,{'v':1,'op':op,**fields},deadline=time.monotonic()+5)
        self.assertTrue(result['ok'],result)
        return result.get('result',result.get('snapshot'))

    def activate(self,runtime,principal):
        account=self.call(runtime,principal,'wallet.register',key='same-register')['account_id']
        begin=self.call(runtime,principal,'wallet.auth.begin',key='same-auth-begin')
        authenticator=SoftwareTestAuthenticator(self.root/(principal.owner_actor+'-authenticator'),principal.device_ref)
        self.addCleanup(authenticator.close)
        credential=authenticator.make_credential(begin['options'],'0000','same-create')
        self.call(runtime,principal,'wallet.auth.enroll',key='same-auth-enroll',challenge_id=begin['challenge_id'],credential=credential)
        self.call(runtime,principal,'wallet.terms',key='same-terms',accepted=True,terms_version='rock-wallet-development/1')
        sale=runtime.seed_fixture_sale(5000,'same-fixture-sale')
        runtime.settle_fixture_sale(sale['id'],'same-fixture-settle')
        return account,authenticator

    def test_two_real_services_reuse_auth_monthly_atm_with_independent_same_keys(self):
        outcomes=[]
        for owner in ('alice','bob'):
            runtime,principal,permit,_=self.open_runtime(owner)
            self.assertIsNone(runtime.identity().account_id)
            account,authenticator=self.activate(runtime,principal)
            self.assertEqual(runtime.identity().account_id,account)
            self.call(runtime,principal,'wallet.consent',key='same-monthly-consent',accepted=True,
                terms_version='simulator-monthly-usd-8.88-v1')
            with runtime.admit_write(1):runtime._service.membership.tick()
            quote=self.call(runtime,principal,'wallet.atm.quote',key='same-quote',issue_key='same-issue',
                amount_minor=1000,atm_id='SIM-ATM-001')
            credential=authenticator.get_assertion(quote['options'],'0000','same-assertion')
            issue={'key':'same-issue','quote_id':quote['quote_id'],'credential':credential}
            issued=self.call(runtime,principal,'wallet.atm.issue',**issue)
            self.assertEqual(issued,self.call(runtime,principal,'wallet.atm.issue',**issue))
            self.assertEqual((issued['amount_minor'],issued['total_debit_minor'],issued['cash_received_minor']),
                             (1000,1000,1000))
            snapshot=self.call(runtime,principal,'snapshot')
            self.assertEqual((snapshot['available_minor'],snapshot['held_minor'],snapshot['billed_minor']),
                             (3112,1000,888))
            self.assertEqual(permit.marker['account_id'],account)
            outcomes.append((account,runtime.descriptor.wallet_authority_id,runtime.descriptor.canonical_state))
        for index in range(3):self.assertNotEqual(outcomes[0][index],outcomes[1][index])

    def test_actual_mutators_without_ticket_refuse_and_foreign_fulfillment_leaves_db_unchanged(self):
        runtime,principal,_,_=self.open_runtime('alice')
        self.activate(runtime,principal)
        before=self.call(runtime,principal,'snapshot')
        for operation in (lambda:runtime._service.wallet.simulate_sale(1,'bypass'),
                lambda:runtime._service.dispatch({'v':1,'op':'health'},peer_uid=1002),
                lambda:runtime._service.authentication.revoke_credential('fixture-missing','bypass')):
            with self.assertRaises((PermissionError,RuntimeError)):operation()
        store=runtime._service.membership.store
        with closing(store._connect()) as db:before_events=db.execute('SELECT COUNT(*) FROM events').fetchone()[0]
        original=json.loads((self.root/'alice-handoff.json').read_text())['events'][0]
        event=sign_fixture_event('fulfillment','fixture-foreign-handoff','device:fixture-foreign-device',1,
            original['occurred_at'],'handoff',{**original['payload'],'owner_ref':'fixture-owner-bob',
                'device_ref':'fixture-foreign-device','purchase_ref':'fixture-foreign-purchase'})
        with self.assertRaises(RuntimeAdmissionRejected):runtime.ingest_fulfillment(event)
        with closing(store._connect()) as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM events').fetchone()[0],before_events)
        self.assertEqual(self.call(runtime,principal,'snapshot'),before)

    def test_wrong_owner_and_revoked_current_revision_do_not_read_or_mutate_other_contract(self):
        alice,a,_,verifier=self.open_runtime('alice');bob,b,_,_=self.open_runtime('bob')
        self.activate(alice,a);self.activate(bob,b)
        before=self.call(bob,b,'snapshot')
        with self.assertRaises(RuntimeAdmissionRejected):
            alice.dispatch(b,{'v':1,'op':'wallet.register','key':'same-register'},deadline=time.monotonic()+1)
        verifier.revoked=True
        with self.assertRaises(RuntimeAdmissionRejected):
            alice.dispatch(a,{'v':1,'op':'snapshot'},deadline=time.monotonic()+1)
        self.assertEqual(self.call(bob,b,'snapshot'),before)


if __name__=='__main__':unittest.main()
