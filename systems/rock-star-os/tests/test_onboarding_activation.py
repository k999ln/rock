"""Trusted observation fixture only; no physical device or Wallet mutation."""
from concurrent.futures import ThreadPoolExecutor
import copy
from pathlib import Path
import sqlite3
import tempfile
import unittest
from test_operations import signed
from operations.onboarding import ActivationStore, OnboardingPlanner, DEFAULT_CATALOG
from operations.state import OperationError


class OnboardingActivationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.release=signed(2,'b')

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)/'activation'
        self.profile={'device_ref':'device-a','hardware_id':'rock-virt-aarch64',
                      'release':self.release,'protected_binding_sha256':'c'*64}
        self.current={'device_ref':'device-a','hardware_id':'rock-virt-aarch64','bootloader_state':'locked',
                      'preinstalled_os':True,'measured_image_sha256':'b'*64,'protected_binding_sha256':'c'*64,
                      'local_health_ready':True,'observation_verified':True,'oem_install_authorized':False,
                      'purchase_current':True,'identity_current':True,'identity_reference':'opaque-contract-alice'}
        self.now=100;self.store=self.open()

    def observe(self, context):
        if context!='owner':raise PermissionError('fixture owner denied')
        return copy.deepcopy(self.current)

    def open(self):return ActivationStore(self.path,self.profile,observe=self.observe,clock=lambda:self.now)

    def test_verified_preinstalled_device_has_single_activation_step_and_no_wallet_consent(self):
        before=self.store.snapshot('owner');self.assertEqual(before['state'],'NOT_ACTIVATED')
        self.assertEqual([s['id'] for s in before['onboarding']['steps']],['activate_device'])
        reply=self.store.activate('tap',context='owner')
        self.assertEqual(reply['result']['state'],'ACTIVE')
        for name in ('wallet_registration_requested','wallet_terms_accepted','monthly_consent_accepted'):
            self.assertIs(reply['result'][name],False)
        self.assertFalse(reply['hardware_action_performed'])
        self.assertEqual({p.name for p in self.path.iterdir()},{'state.sqlite3','state.required'})

    def test_lost_ack_restart_same_key_or_new_tap_retains_one_activation(self):
        reply=self.store.activate('tap',context='owner');self.now=500;self.store=self.open()
        self.assertEqual(reply,self.store.activate('tap',context='owner'))
        self.assertEqual(reply,self.store.activate('new-tap',context='owner'))
        with self.store.db.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM objects WHERE kind='activation'").fetchone()[0],1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM receipts').fetchone()[0],2)

    def test_parallel_taps_create_one_original_timestamp(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            replies=list(pool.map(lambda key:self.store.activate(key,context='owner'),['one','two']))
        self.assertEqual(replies[0]['result'],replies[1]['result'])
        with self.store.db.connection() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM objects').fetchone()[0],1)

    def test_interruption_before_receipt_commits_nothing_and_retry_recovers(self):
        with self.store.db.connection() as db,db:db.execute("CREATE TRIGGER fail BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'fixture interruption'); END")
        with self.assertRaises(sqlite3.IntegrityError):self.store.activate('tap',context='owner')
        self.assertEqual(self.store.snapshot('owner')['state'],'NOT_ACTIVATED')
        with self.store.db.connection() as db,db:db.execute('DROP TRIGGER fail')
        self.assertEqual(self.open().activate('tap',context='owner')['result']['state'],'ACTIVE')

    def test_current_revocation_denies_saved_success_replay_preserves_record(self):
        self.store.activate('tap',context='owner');self.current['identity_current']=False
        with self.assertRaises(PermissionError):self.store.activate('tap',context='owner')
        view=self.open().snapshot('owner')
        self.assertEqual(view['state'],'ACTIVE');self.assertTrue(view['recovery_required'])
        self.current['identity_current']=True
        self.assertEqual(self.store.activate('tap',context='owner')['result']['activated_at'],100)

    def test_different_inherited_owner_cannot_replay_or_replace_activation(self):
        self.store.activate('tap',context='owner');self.current['identity_reference']='opaque-contract-bob'
        for key in ('tap','new-owner'):
            with self.subTest(key=key),self.assertRaises(OperationError):self.store.activate(key,context='owner')
        view=self.store.snapshot('owner')
        self.assertEqual(view['onboarding']['reason'],'INHERITED_OWNER_BINDING_CHANGED')
        self.assertIsNone(view['identity_reference_sha256'])

    def test_wrong_owner_and_unknown_fields_are_not_trusted_observations(self):
        with self.assertRaises(PermissionError):self.store.activate('tap',context='stranger')
        self.current['role']='verified'
        with self.assertRaises(OperationError):self.store.activate('tap',context='owner')

    def test_wrong_image_config_health_or_unverified_measurement_never_offers_tap(self):
        cases={'measured_image_sha256':'e'*64,'protected_binding_sha256':'e'*64,
               'local_health_ready':False,'observation_verified':False,'purchase_current':False}
        for field,value in cases.items():
            observed=copy.deepcopy(self.current);observed[field]=value
            with self.subTest(field=field):
                self.assertEqual(self.store.planner.plan(observed)['route'],'BLOCKED')
        observed=copy.deepcopy(self.current);observed['identity_current']=1
        with self.assertRaises(OperationError):self.store.planner.plan(observed)

    def test_unknown_blackberry_and_locked_stock_are_specific_blockers(self):
        observed=copy.deepcopy(self.current);observed.update(preinstalled_os=False,hardware_id='blackberry-unknown')
        self.assertEqual(self.store.planner.plan(observed)['reason'],'HARDWARE_NOT_VERIFIED')
        observed['hardware_id']='rock-virt-aarch64'
        self.assertEqual(self.store.planner.plan(observed)['reason'],'LOCKED_WITHOUT_AUTHORIZED_INSTALL_ROUTE')
        observed['bootloader_state']='unknown'
        self.assertEqual(self.store.planner.plan(observed)['reason'],'BOOTLOADER_STATE_REQUIRED')

    def test_supported_unlocked_or_oem_route_is_review_only_not_os_install(self):
        observed=copy.deepcopy(self.current);observed.update(preinstalled_os=False,bootloader_state='unlocked')
        plan=self.store.planner.plan(observed);self.assertEqual(plan['route'],'UNLOCKED_INSTALL_REVIEW')
        self.assertFalse(plan['os_write_performed']);self.assertFalse(plan['shortcut_is_os_installation'])
        catalog=copy.deepcopy(DEFAULT_CATALOG);catalog['rock-virt-aarch64']['install_routes']=['oem_signed']
        observed.update(bootloader_state='locked',oem_install_authorized=True)
        plan=OnboardingPlanner(self.profile,catalog=catalog).plan(observed)
        self.assertEqual(plan['route'],'OEM_INSTALL_REVIEW');self.assertTrue(plan['requires_separate_device_write_approval'])

    def test_existing_profile_binding_and_clock_rollback_cannot_be_replaced(self):
        self.store.activate('tap',context='owner')
        changed=copy.deepcopy(self.profile);changed['protected_binding_sha256']='f'*64
        with self.assertRaises(OperationError):ActivationStore(self.path,changed,observe=self.observe)
        self.now=99
        with self.assertRaises(OperationError):self.store.activate('new',context='owner')
        self.assertEqual(self.store.activate('tap',context='owner')['result']['activated_at'],100)

    def test_signed_upgrade_retains_original_activation_and_rejects_counter_rollback(self):
        original=self.store.activate('tap',context='owner')
        upgraded=copy.deepcopy(self.profile);upgraded['release']=signed(3,'d')
        self.current['measured_image_sha256']='d'*64
        updated=ActivationStore(self.path,upgraded,observe=self.observe,clock=lambda:self.now)
        self.assertEqual(original,updated.activate('tap',context='owner'))
        view=updated.snapshot('owner');self.assertEqual(view['state'],'ACTIVE')
        self.assertNotEqual(view['activated_profile_sha256'],view['current_profile_sha256'])
        self.assertFalse(view['recovery_required'])
        with self.assertRaises(OperationError):self.open()


if __name__=='__main__':unittest.main()
