"""Synthetic protected files and real public signatures, not hardware attestation."""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from test_operations import signed, AUTHORITY
from operations.device import DeviceActivation, BOOT_SCHEMA, validate_boot_facts, protected_json
from operations.state import digest
from service_access import os_client
from service_access.status import SCHEMA
from service_access.controller import ACTIONS
from entitlement.protocol import TERMS_VERSION


def wallet_fixture():
    return {'simulation_only':True,'membership':{},'billing':{},'ledger_balance_minor':0,
        'available_minor':5000,'held_minor':0,'billed_minor':0,
        'backend':{'connected':True,'stale':False,'pending_reconciliation':False},
        'service_access':{'schema':SCHEMA,'authority_id':AUTHORITY,'consumer_id':'alice-a',
        'device_ref':'fixture-device-a','policy_id':'service-policy-'+'e'*64,'paid_services':['runner.cloud'],
        'monthly_fee_minor':888,'currency':'USD','terms_version':TERMS_VERSION,'paid_state':'PAUSED',
        'access_until':0,'grace_until':0,'auto_renew':False,'reconciliation_pending':False,
        'device_eligible':True,'purchase_reason':None,'paid_state_reason':'WALLET_UNREGISTERED',
        'evaluated_at':100,'clock_rollback':False,
        'allowed_actions':sorted(a for a in ACTIONS if a.rpartition('.')[0]!='runner.cloud' or a.endswith('.recover')),
        'simulation_only':True}}


class OperationsDeviceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.release=signed(2,'b')

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.config_path=self.root/'service-access.json'
        self.binding_path=self.root/'binding.json';self.boot_path=self.root/'boot.json'
        self.boot_id_path=self.root/'boot-id';self.boot_id_path.write_text(AUTHORITY+'\n')
        self.boot_id_path.chmod(0o444)  # Model the read-only kernel file independently of host umask.
        self.config={'schema':os_client.CONFIG_SCHEMA,'authority_id':AUTHORITY,'consumer_id':'alice-a',
            'device_ref':'fixture-device-a','token':'PUBLIC-FIXTURE-service-alice-a',
            'registry_origin':'https://10.0.2.2:9743','runner_origin':'https://10.0.2.2:9744',
            'runner_endpoint_id':'fixture-runner'}
        self.write(self.config_path,self.config)
        required=self.config_path.with_suffix('.required');required.write_text(os_client.CONFIG_SCHEMA+'\n');required.chmod(0o444)
        self.write(self.binding_path,os_client.binding(self.config),0o600)
        self.facts={'schema':BOOT_SCHEMA,'boot_id':AUTHORITY,'hardware_id':'rock-virt-aarch64',
            'slot':'A','sequence':2,'image_sha256':'b'*64,'release':self.release,
            'local_health_confirmed':True,'root_readonly':True,'data_policy_verified':True}
        self.publish();self.wallet=wallet_fixture();self.calls=0;self.adapter=self.open()

    def write(self,path,value,mode=0o444):
        if path.exists():path.chmod(0o600)
        path.write_text(json.dumps(value));path.chmod(mode)

    def publish(self):
        self.facts['facts_sha256']=digest({k:v for k,v in self.facts.items() if k!='facts_sha256'})
        self.write(self.boot_path,self.facts)

    def read_wallet(self):self.calls+=1;return copy.deepcopy(self.wallet)

    def open(self):
        return DeviceActivation(self.root/'activation',wallet_snapshot=self.read_wallet,
            config_path=self.config_path,binding_path=self.binding_path,boot_path=self.boot_path,
            boot_id_path=self.boot_id_path,root_uid=os.geteuid(),private_uid=os.geteuid(),clock=lambda:100)

    def tap(self,key='tap',uid=1000,**extra):
        return self.adapter.dispatch({'v':1,'op':'device.activation.activate','key':key,**extra},peer_uid=uid)

    def test_eligible_unregistered_unpaid_device_can_activate_without_wallet_mutation(self):
        before=copy.deepcopy(self.wallet)
        view=self.adapter.snapshot(wallet=self.wallet);self.assertTrue(view['can_activate']);self.assertEqual(self.calls,0)
        result=self.tap()['result'];self.assertEqual(result['request_key'],'tap')
        self.assertEqual(result['state'],'ACTIVE');self.assertFalse(result['can_activate']);self.assertFalse(result['recovery_required'])
        for name in ('wallet_registration_requested','wallet_terms_accepted','monthly_consent_accepted','os_write_performed'):
            self.assertIs(result[name],False)
        self.assertEqual(self.calls,1);self.assertEqual(before,self.wallet)
        self.assertNotIn(self.config['token'],json.dumps(result))
        self.assertEqual(result['identity_reference_kind'],'authenticated_service_scope_digest')

    def test_cached_snapshot_none_does_not_trigger_second_network_request(self):
        self.assertEqual(self.adapter.snapshot(wallet=None)['state'],'UNAVAILABLE')
        self.assertEqual(self.calls,0);self.assertFalse((self.root/'activation').exists())

    def test_restart_exact_retry_and_new_key_preserve_receipt_but_echo_each_request(self):
        first=self.tap()['result'];self.adapter=self.open()
        self.assertEqual(first,self.tap()['result'])
        second=self.tap('again')['result'];self.assertEqual(second['request_key'],'again')
        self.assertEqual(first['receipt'],second['receipt'])

    def test_current_revocation_stale_or_pending_rejects_replay_without_erasing_activation(self):
        receipt=self.tap()['result']['receipt'];original=copy.deepcopy(self.wallet)
        cases=[{'connected':False},{'stale':True},{'pending_reconciliation':True}]
        for change in cases:
            self.wallet=copy.deepcopy(original);self.wallet['backend'].update(change)
            with self.subTest(change=change),self.assertRaises(ValueError):self.tap()
        self.wallet=copy.deepcopy(original)
        self.wallet['service_access'].update(device_eligible=False,purchase_reason='DEVICE_SUSPENDED',allowed_actions=[])
        with self.assertRaises(PermissionError):self.tap()
        view=self.adapter.snapshot(wallet=self.wallet);self.assertEqual(view['state'],'ACTIVE');self.assertTrue(view['recovery_required'])
        self.wallet=original;self.assertEqual(receipt,self.tap()['result']['receipt'])

    def test_uid_and_json_cannot_supply_trusted_binding_or_override_authorization(self):
        for uid in (0,1002,True,None):
            with self.subTest(uid=uid),self.assertRaises(PermissionError):self.tap(uid=uid)
        with self.assertRaises(ValueError):self.tap(device_ref='fixture-device-b')
        self.assertFalse((self.root/'activation').exists())

    def test_missing_stage0_facts_stays_unknown_and_can_become_available_later(self):
        self.boot_path.unlink();self.assertEqual(self.adapter.snapshot(wallet=self.wallet)['state'],'UNAVAILABLE')
        self.publish();self.assertTrue(self.adapter.snapshot(wallet=self.wallet)['can_activate'])

    def test_wrong_current_boot_signed_image_hash_or_health_cannot_activate(self):
        original=copy.deepcopy(self.facts)
        for name,value in [('boot_id','22222222-2222-4222-8222-222222222222'),('image_sha256','a'*64),
                           ('sequence',3),('local_health_confirmed',False),('root_readonly',False),
                           ('data_policy_verified',False),('hardware_id','blackberry-unknown')]:
            self.facts=copy.deepcopy(original);self.facts[name]=value;self.publish()
            with self.subTest(field=name):self.assertFalse(self.adapter.snapshot(wallet=self.wallet)['can_activate'])
        self.facts=copy.deepcopy(original);self.facts['release']=copy.deepcopy(self.release)
        self.facts['release']['signature']='0'*128;self.publish()
        self.assertFalse(self.adapter.snapshot(wallet=self.wallet)['can_activate'])

    def test_file_symlink_permissions_duplicate_oversize_and_configuration_loss_fail_closed(self):
        for path,mode in [(self.boot_path,0o644),(self.binding_path,0o644),
                          (self.config_path,0o644),(self.config_path.with_suffix('.required'),0o644)]:
            original=path.stat().st_mode&0o777;path.chmod(mode)
            with self.subTest(path=path.name):self.assertEqual(self.adapter.snapshot(wallet=self.wallet)['state'],'UNAVAILABLE')
            path.chmod(original)
        self.boot_path.unlink();self.boot_path.symlink_to(self.binding_path)
        self.assertEqual(self.adapter.snapshot(wallet=self.wallet)['state'],'UNAVAILABLE')
        self.boot_path.unlink();self.boot_path.write_text('{"x":1,"x":2}');self.boot_path.chmod(0o444)
        with self.assertRaises(ValueError):protected_json(self.boot_path,uid=os.geteuid(),mode=0o444)
        self.boot_path.chmod(0o600);self.boot_path.write_text('x'*17000);self.boot_path.chmod(0o444)
        self.assertEqual(self.adapter.snapshot(wallet=self.wallet)['state'],'UNAVAILABLE')
        self.publish();self.config_path.with_suffix('.required').unlink()
        self.assertEqual(self.adapter.snapshot(wallet=self.wallet)['state'],'UNAVAILABLE')

    def test_changed_authority_device_or_live_projection_does_not_replace_retained_binding(self):
        self.tap();before=self.binding_path.read_bytes()
        self.wallet['service_access']['device_ref']='fixture-device-b'
        self.assertEqual(self.adapter.snapshot(wallet=self.wallet)['state'],'UNAVAILABLE')
        self.wallet=wallet_fixture();self.config['authority_id']='22222222-2222-4222-8222-222222222222'
        self.write(self.config_path,self.config)
        self.assertEqual(self.adapter.snapshot(wallet=self.wallet)['state'],'UNAVAILABLE')
        self.assertEqual(before,self.binding_path.read_bytes())

    def test_same_protected_binding_new_signed_image_preserves_activation(self):
        receipt=self.tap()['result']['receipt'];self.facts.update(sequence=3,image_sha256='d'*64,release=signed(3,'d'))
        self.publish();view=self.adapter.snapshot(wallet=self.wallet)
        self.assertEqual(view['state'],'ACTIVE');self.assertFalse(view['recovery_required'])
        self.assertEqual(receipt,self.tap()['result']['receipt'])


if __name__=='__main__':unittest.main()
