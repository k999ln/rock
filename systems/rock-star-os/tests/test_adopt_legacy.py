"""Stopped disposable backend adoption, preserving actual synthetic activity."""
from contextlib import closing
from dataclasses import replace
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os')]
from wallet_backend.server import WalletBackendServer
from wallet_backend.authority_fence import AuthorityFenceCoordinator, RuntimeUnavailable, read_json
from wallet_backend.runtime_contracts import FreshContractSpec, ContractIdentity
from wallet_backend.adopt_legacy import inspect_legacy, original_tables, digest_file
from blackberryrock.wallet import Wallet
from entitlement.store import EntitlementStore
from entitlement.wallet_bridge import WalletBridge
from entitlement.protocol import PUBLIC_TOKENS
from wallet_auth.fixture import SoftwareTestAuthenticator
from wallet_auth.service import WalletAuthorization
from atm import CardlessATMSimulator


class AdoptionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name).resolve()
        self.addCleanup(self.temp.cleanup); self.now = 1788856800
        self.state = self.root/'legacy'
        server = WalletBackendServer(('127.0.0.1', 0), self.state, start_scheduler=False, clock=lambda:self.now)
        self.server = server
        self.addCleanup(lambda: server.server_close())
        auth = SoftwareTestAuthenticator(self.root/'authenticator', 'fixture-rock-arm64-001')
        self.addCleanup(auth.close)
        count = 0
        def call(op, **fields):
            nonlocal count
            count += 1
            reply = server.service.dispatch({'v':1,'op':op,'key':'adopt-'+str(count),**fields}, peer_uid=1002)
            self.assertTrue(reply['ok'], reply); return reply.get('result', reply.get('snapshot'))
        self.account = call('wallet.register')['account_id']
        begin = call('wallet.auth.begin')
        credential = auth.make_credential(begin['options'], '0000', 'adopt-create')
        enrolled = call('wallet.auth.enroll', challenge_id=begin['challenge_id'], credential=credential)
        call('wallet.terms', accepted=True, terms_version='rock-wallet-development/1')
        sale = server.service.wallet.simulate_sale(5000, 'credit'); server.service.wallet.settle_sale(sale['id'], 'settle')
        call('wallet.consent', accepted=True, terms_version='simulator-monthly-usd-8.88-v1')
        bill = server.service.wallet.bill
        def lost_bill(*args, **kwargs):
            bill(*args, **kwargs); raise OSError('fixture loses acknowledgement after actual bill commit')
        with patch.object(server.service.wallet, 'bill', side_effect=lost_bill):
            with self.assertRaises(OSError): server.service.membership.tick()
        quote = call('wallet.atm.quote', amount_minor=1000, atm_id='SIM-ATM-001', issue_key='retained-hold')
        assertion = auth.get_assertion(quote['options'], '0000', 'adopt-sign')
        call('wallet.atm.issue', key='retained-hold', quote_id=quote['quote_id'], credential=assertion)
        call('wallet.atm.quote', amount_minor=1000, atm_id='SIM-ATM-001', issue_key='unresolved-quote')
        server.service.authentication.revoke_credential(enrolled['credential_id'], 'retained-revocation')
        with server.service.membership.store._transaction() as db:
            db.execute('CREATE TABLE extra_business_evidence (value BLOB NOT NULL)')
            db.execute('INSERT INTO extra_business_evidence VALUES (?)', (b'\x00extra\xff',))
        self.snapshot = server.service.wallet.snapshot()
        self.assertEqual((self.snapshot['available_minor'],self.snapshot['held_minor'],self.snapshot['billed_minor']), (3112,1000,888))
        with closing(server.service.membership.store._connect()) as db:
            self.assertEqual(db.execute('SELECT state FROM authorizations').fetchone()[0], 'CLAIMED')
            owner = db.execute('SELECT owner_ref FROM accounts').fetchone()[0]
        server.server_close()
        self.coordinator = AuthorityFenceCoordinator(self.root/'coordinator')
        registry = self.root/'owner-registry'; registry.mkdir(mode=0o700)
        self.coordinator.bind_owner_registry(registry, str(uuid.uuid4()))
        self.permits = []; self.addCleanup(self.cleanup)
        self.spec = FreshContractSpec('legacy-ledger', self.state, 'alice', owner, 'fixture-rock-arm64-001')
        self.plan = inspect_legacy(self.coordinator, self.spec, migration_id=str(uuid.uuid4()))
        self.original = {name:original_tables(self.state/name) for name in ('wallet-simulator.db','entitlement.db')}

    def cleanup(self):
        for permit in self.permits:
            if permit.released: continue
            if permit.opening: permit.abort()
            else: permit.quiesce(); permit.release()
        self.coordinator.close()

    def initialize(self, permit):
        with permit.initialize():
            wallet = Wallet(self.state/'wallet-simulator.db', managed_write_hooks=permit.hooks)
            store = EntitlementStore(self.state/'entitlement.db', clock=lambda:self.now, managed_write_hooks=permit.hooks)
            WalletAuthorization(wallet, CardlessATMSimulator(wallet), authority_id=permit.descriptor.wallet_authority_id, clock=lambda:self.now)
            WalletBridge(store, wallet, self.account, PUBLIC_TOKENS['wallet'])
        return wallet

    def prepared(self):
        permit = self.coordinator.prepare_legacy(self.plan); self.permits.append(permit); return permit

    def assert_original(self):
        self.assertEqual({name:original_tables(self.state/name) for name in self.original}, self.original)

    def test_preserves_nonempty_hold_claimed_bill_credentials_and_every_extra_table(self):
        permit = self.prepared(); wallet = self.initialize(permit)
        permit.activate(ContractIdentity(permit.descriptor, self.account))
        self.assert_original(); self.assertEqual(wallet.snapshot(), self.snapshot)
        self.assertEqual(permit.descriptor.wallet_authority_id, self.plan.authority_id)
        permit.quiesce(); permit.release()
        with self.assertRaisesRegex(ValueError, 'authority marker'): WalletBackendServer(('127.0.0.1',0), self.state, start_scheduler=False)

    def test_every_committed_identity_stage_resumes_same_migration_without_reposting(self):
        for stage in ('WALLET_IDENTITY_COMMITTED','ENTITLEMENT_BINDING_COMMITTED','ROUTER_REGISTERED'):
            with self.subTest(stage=stage):
                permit = self.prepared(); journal = self.coordinator._journal
                def fail(actual, value):
                    journal(actual, value)
                    if value == stage: raise OSError('fixture stops after durable stage')
                with patch.object(self.coordinator, '_journal', side_effect=fail):
                    with self.assertRaises(OSError): self.initialize(permit)
                descriptor = permit.descriptor; permit.abort(); self.assert_original()
                with self.assertRaises(RuntimeUnavailable):
                    self.coordinator.prepare_legacy(replace(self.plan, migration_id=str(uuid.uuid4())))
                resumed = self.prepared(); self.assertEqual(resumed.descriptor, descriptor)
                self.initialize(resumed); resumed.abort(); self.assert_original()
        final = self.prepared(); self.initialize(final); final.activate(ContractIdentity(final.descriptor,self.account)); self.assert_original()

    def test_marker_without_journal_resumes_same_identity_after_coordinator_restart(self):
        with patch.object(self.coordinator, '_journal', side_effect=OSError('fixture before first journal')):
            with self.assertRaises(OSError): self.prepared()
        marker = read_json(self.state/'AUTHORITY.json'); self.assertEqual(marker['state'], 'PREPARED')
        self.assertFalse((self.state/'GX00-MIGRATION.json').exists()); self.assert_original()
        self.coordinator.close(); self.coordinator = AuthorityFenceCoordinator(self.root/'coordinator')
        permit = self.prepared(); self.assertEqual(permit.descriptor.ledger_uuid, marker['descriptor']['ledger_uuid'])
        self.initialize(permit); permit.activate(ContractIdentity(permit.descriptor,self.account)); self.assert_original()

    def test_active_marker_before_registry_commit_resumes_without_reposting(self):
        from wallet_backend import authority_fence
        permit = self.prepared(); self.initialize(permit)
        write = authority_fence.write_json
        def fail(path, value):
            if path == self.root/'coordinator'/'registry.json': raise OSError('fixture before ACTIVE registry commit')
            write(path,value)
        with patch.object(authority_fence,'write_json',side_effect=fail):
            with self.assertRaises(OSError): permit.activate(ContractIdentity(permit.descriptor,self.account))
        self.assertEqual(read_json(self.state/'AUTHORITY.json')['state'],'ACTIVE')
        permit.abort(); self.coordinator.close(); self.coordinator=AuthorityFenceCoordinator(self.root/'coordinator')
        resumed=self.prepared(); self.initialize(resumed)
        resumed.activate(ContractIdentity(resumed.descriptor,self.account)); self.assert_original()

    def test_active_readoption_refuses_without_downgrading_marker_or_registry(self):
        permit = self.prepared(); self.initialize(permit)
        permit.activate(ContractIdentity(permit.descriptor,self.account)); permit.quiesce(); permit.release()
        marker = (self.state/'AUTHORITY.json').read_bytes()
        registry = (self.root/'coordinator'/'registry.json').read_bytes()
        with self.assertRaises(RuntimeUnavailable): self.prepared()
        self.assertEqual((self.state/'AUTHORITY.json').read_bytes(),marker)
        self.assertEqual((self.root/'coordinator'/'registry.json').read_bytes(),registry)
        self.assert_original()

    def test_changed_original_rows_or_copied_legacy_inode_refuse_before_marker_mutation(self):
        clone = self.root/'copied-legacy'; shutil.copytree(self.state,clone)
        with self.assertRaises(RuntimeUnavailable):
            inspect_legacy(self.coordinator, replace(self.spec,canonical_state=clone), migration_id=str(uuid.uuid4()))
        marker = digest_file(self.state/'AUTHORITY.json')
        with closing(sqlite3.connect(self.state/'entitlement.db')) as db:
            db.execute("INSERT INTO extra_business_evidence VALUES (X'1234')"); db.commit()
        with self.assertRaises(RuntimeUnavailable): self.prepared()
        self.assertEqual(digest_file(self.state/'AUTHORITY.json'),marker)


if __name__ == '__main__': unittest.main()
