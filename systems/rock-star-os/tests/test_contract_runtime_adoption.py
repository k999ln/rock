"""Actual A.open_adopted composition on C's nonempty stopped-host fixture.

The original fixture includes a CLAIMED monthly receipt, hold, quote, revoked
credential and unknown table. Principal verification here is explicit test-only;
real owner-router TLS has a separate integration suite.
"""
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os')]
import test_adopt_legacy as legacy_fixture
from wallet_backend.contract_runtime import ContractRuntime
from wallet_backend.runtime_contracts import RuntimeAdmissionRejected


class PreservedRegistryVerifier:
    def __init__(self, coordinator):
        self.identity = coordinator.registry['owner_registry']
    def registry_identity(self):
        return Path(self.identity['canonical_path']), self.identity['registry_uuid']
    def assert_current(self, principal, descriptor):
        # This fixture never exercises network/authenticated dispatch.
        raise RuntimeAdmissionRejected('no network principal supplied by this fixture')


class RuntimeAdoptionCompositionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = legacy_fixture.AdoptionTests('test_preserves_nonempty_hold_claimed_bill_credentials_and_every_extra_table')
        self.addCleanup(lambda:self.assertTrue(self.fixture.doCleanups(), 'legacy fixture cleanup failed'))
        self.fixture.setUp()
        self.verifier = PreservedRegistryVerifier(self.fixture.coordinator)

    def test_actual_runtime_adopts_nonempty_legacy_without_reposting_or_early_scheduler(self):
        f = self.fixture
        runtime = ContractRuntime.open_adopted(f.plan,coordinator=f.coordinator,
            provisioning_file=ROOT/'os/entitlement/fixtures/device-handoff.json',
            verifier=self.verifier,clock=lambda:f.now)
        try:
            self.assertIsNone(runtime._service.membership.thread)
            identity = runtime.identity()
            self.assertEqual(identity.account_id,f.account)
            self.assertEqual(runtime.descriptor.wallet_authority_id,f.plan.authority_id)
            f.assert_original()
            self.assertEqual(runtime._service.wallet.snapshot(),f.snapshot)
        finally: runtime.close()
        reopened = ContractRuntime.open_active(f.spec.ledger_ref,coordinator=f.coordinator,
            provisioning_file=ROOT/'os/entitlement/fixtures/device-handoff.json',
            verifier=self.verifier,clock=lambda:f.now)
        try:
            self.assertEqual(reopened.identity(),identity)
            self.assertEqual(reopened._service.wallet.snapshot(),f.snapshot)
            f.assert_original()
        finally: reopened.close()


if __name__ == '__main__': unittest.main()
