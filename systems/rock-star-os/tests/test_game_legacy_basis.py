"""One real nonempty legacy→managed TLS→game fixture, no restore/OS claim."""
from pathlib import Path
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os'),str(ROOT/'tests')]
from game_legacy_basis import LegacyGameBasis, A1, A2, B1


class LegacyGameContinuity(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory(prefix='rock-legacy-game-basis-')
        self.addCleanup(temporary.cleanup)
        self.basis=LegacyGameBasis(Path(temporary.name).resolve())
        self.addCleanup(self.basis.close)
        self.basis.create_legacy()

    def test_adopted_original_rows_then_real_three_device_four_game_connections(self):
        f=self.basis
        self.assertEqual(f.legacy_snapshot['pending_minor'],237)
        self.assertEqual((f.legacy_snapshot['available_minor'],f.legacy_snapshot['held_minor'],f.legacy_snapshot['billed_minor']),(3112,1000,888))
        self.assertEqual(f.legacy_business['monthly_authorization']['state'],'CLAIMED')
        f.adopt()
        self.assertEqual(f.original_tables(),f.legacy_tables)
        self.assertEqual(f.runtimes['alice'].identity().account_id,f.legacy_account)
        self.assertEqual(f.runtimes['alice'].descriptor.wallet_authority_id,f.legacy_authority)
        f.start_managed();f.activate_new_devices()
        evidence=f.connect_four()
        self.assertEqual(len(evidence),4)
        f.assert_retained(self,claimed=True)
        self.assertEqual(f.call(A1,'wallet.auth.status')['active'],False)
        self.assertEqual(f.call(A2,'wallet.auth.status')['active'],True)
        self.assertEqual(f.call(B1,'wallet.auth.status')['active'],True)
        self.assertEqual(f.call(A1,'wallet.membership')['entitlement']['account_id'],f.legacy_account)
        self.assertEqual(f.call(A2,'wallet.membership')['entitlement']['account_id'],f.legacy_account)
        f.reconcile_existing_month()
        f.assert_retained(self,claimed=False)
        self.assertEqual(f.call(B1,'snapshot')['billed_minor'],0)
        self.assertEqual(f.call(B1,'snapshot')['held_minor'],0)
        self.assertEqual(f.call(B1,'snapshot')['available_minor'],8000)
        self.assertEqual(f.owner_transport(A1).exchange(f.legacy_register_request),f.legacy_register_reply)
        self.assertFalse(f.owner_transport(A2).exchange(f.legacy_register_request)['ok'])
        self.assertFalse(f.owner_transport(A1).exchange(f.legacy_issue_request)['ok'])
        f.assert_retained(self,claimed=False)

    def test_stale_original_authentication_and_wrong_owner_never_create_game_consent(self):
        f=self.basis;f.adopt();f.start_managed();f.activate_new_devices()
        before=f.business_evidence()
        request=f.begin_request(A1,'a','legacy-revoked')
        self.assertFalse(f.owner_transport(A1).exchange(request)['ok'])
        self.assertFalse(f.owner_transport(B1).exchange(request)['ok'])
        self.assertEqual(f.business_evidence(),before)
        self.assertEqual(f.game_counts(),{'alice':0,'bob':0})
        good=f.begin_request(A2,'a','valid-current')
        self.assertTrue(f.owner_transport(A2).exchange(good)['ok'])
        for field in ('owner_ref','ledger_ref','account_id','device_ref','path'):
            self.assertFalse(f.owner_transport(A2).exchange(dict(good,**{field:'foreign'}))['ok'])
        self.assertEqual(f.game_counts(),{'alice':0,'bob':0})
        f.assert_retained(self,claimed=True)

if __name__=='__main__':unittest.main()
