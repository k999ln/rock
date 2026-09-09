"""Protected registry and principal unit tests; dummy runtimes do not attest fencing."""
from contextlib import contextmanager
from dataclasses import replace
import json
import os
import shutil
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os')]
from wallet_backend.owner_router import OwnerRouter
from wallet_backend.runtime_contracts import ContractDescriptor, RuntimeAdmissionRejected

NOW = 1789000000


def device(owner, suffix):
    return {'ledger_ref':'ledger-'+owner, 'owner_actor':owner, 'owner_ref':'fixture-owner-'+owner,
            'device_ref':'fixture-'+suffix, 'credential_revision':1,'active':True,'expires_at':NOW+1000,
            'token':'PUBLIC-FIXTURE-GX00-'+suffix+'-v1'}


class DummyRuntime:
    def __init__(self, root, owner):
        self.descriptor = ContractDescriptor('ledger-'+owner,str(uuid.uuid4()),str(uuid.uuid4()),owner,
            'fixture-owner-'+owner,'fixture-'+owner+'-1',(root/owner).resolve(),1)
        self.entered = False

    @contextmanager
    def admit_write(self, expected_epoch):
        if expected_epoch != self.descriptor.writer_epoch: raise PermissionError('stale')
        self.entered = True
        try: yield
        finally: self.entered = False


class OwnerRouterGuards(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.now=NOW
        self.rows=[device('alice','alice-1'),device('alice','alice-2'),device('bob','bob-1')]
        self.config=self.root/'credentials.json';self.write(self.rows)
        self.runtimes=[DummyRuntime(self.root,owner) for owner in ('alice','bob')]
        self.router=OwnerRouter(self.root/'router',self.config,clock=lambda:self.now)
        self.addCleanup(self.router.close)

    def write(self, rows):
        self.config.write_text(json.dumps({'schema_version':3,'kind':'public-development-owner-device-credentials','devices':rows}))
        self.config.chmod(0o600)

    def bind(self): self.router.bind_runtimes(tuple(self.runtimes))

    def authenticate(self, index=0, **change):
        row=dict(self.rows[index],**change)
        runtime=self.runtimes[0 if row['owner_actor']=='alice' else 1]
        return self.router.authenticate(row['device_ref'],row['token'],runtime.descriptor.wallet_authority_id)

    def test_two_owners_three_devices_derive_only_the_registered_contract(self):
        with self.assertRaises(RuntimeError): self.authenticate()
        self.bind()
        for index,expected in enumerate((self.runtimes[0],self.runtimes[0],self.runtimes[1])):
            principal=self.authenticate(index)
            self.assertIs(self.router.resolve(principal),expected)
            self.router.assert_current(principal,expected.descriptor)
            self.assertFalse(hasattr(principal,'token'))
        with self.assertRaises(ValueError): self.bind()

    def test_other_token_device_authority_and_claimed_principal_are_rejected(self):
        self.bind();alice=self.authenticate()
        for values in [('fixture-unknown',self.rows[0]['token'],self.runtimes[0].descriptor.wallet_authority_id),
                       (self.rows[0]['device_ref'],self.rows[2]['token'],self.runtimes[0].descriptor.wallet_authority_id),
                       (self.rows[0]['device_ref'],self.rows[0]['token'],self.runtimes[1].descriptor.wallet_authority_id),
                       (self.rows[0]['device_ref'],self.rows[0]['token'],'あ'*36),(None,None,None)]:
            with self.assertRaises(PermissionError):self.router.authenticate(*values)
        for principal in (replace(alice,ledger_ref='ledger-bob'),replace(alice,owner_actor='bob'),
                          replace(alice,credential_revision=True)):
            with self.assertRaises(PermissionError):self.router.resolve(principal)
        with self.assertRaises(PermissionError):self.router.assert_current(alice,self.runtimes[1].descriptor)

    def test_expiry_and_revocation_invalidate_previously_authenticated_principal(self):
        self.bind();principal=self.authenticate()
        self.now=NOW+1000
        with self.assertRaises(PermissionError):self.authenticate()
        with self.assertRaises(PermissionError):self.router.assert_current(principal,self.runtimes[0].descriptor)
        self.now=NOW
        result=self.router.revoke_device_credential(self.rows[0]['device_ref'],1)
        self.assertEqual(result['credential_revision'],2)
        with self.assertRaises(PermissionError):self.authenticate()
        with self.assertRaises(PermissionError):self.router.resolve(principal)
        self.assertEqual(self.router.revoke_device_credential(self.rows[0]['device_ref'],1),result)
        self.assertEqual(self.authenticate(1).owner_actor,'alice');self.assertEqual(self.authenticate(2).owner_actor,'bob')

    def test_restart_preserves_bindings_and_refuses_credential_rollback_or_missing_marker(self):
        self.bind();before=self.authenticate();self.router.close()
        reopened=OwnerRouter(self.root/'router',self.config,clock=lambda:self.now);self.addCleanup(reopened.close)
        reopened.bind_runtimes(tuple(self.runtimes));self.assertEqual(reopened.authenticate(self.rows[0]['device_ref'],self.rows[0]['token'],self.runtimes[0].descriptor.wallet_authority_id),before)
        reopened.revoke_device_credential(self.rows[0]['device_ref'],1);reopened.close()
        with self.assertRaises(ValueError):OwnerRouter(self.root/'router',self.config,clock=lambda:self.now)
        marker=self.root/'router/OWNER-DEVICES.json';self.assertTrue(marker.exists());marker.unlink()
        with self.assertRaises(ValueError):OwnerRouter(self.root/'router',self.config,clock=lambda:self.now)

    def test_rebinding_or_duplicate_tokens_and_owner_pairs_fail_before_runtime_open(self):
        self.bind();self.router.close()
        changes=[lambda rows:rows[0].update(ledger_ref='ledger-bob',owner_actor='bob',owner_ref='fixture-owner-bob'),
                 lambda rows:rows[1].update(token=rows[0]['token']),
                 lambda rows:rows[2].update(owner_ref='fixture-owner-alice'),
                 lambda rows:rows[0].update(credential_revision=True),
                 lambda rows:rows[0].update(expires_at=float('inf'))]
        for change in changes:
            rows=[dict(row) for row in self.rows];change(rows);self.write(rows)
            with self.subTest(rows=rows),self.assertRaises(ValueError):OwnerRouter(self.root/'router',self.config,clock=lambda:self.now)

    def test_bind_is_complete_unique_and_does_not_accept_changed_authority_on_restart(self):
        for runtimes in ((self.runtimes[0],),(self.runtimes[0],self.runtimes[0]),tuple(reversed(self.runtimes))):
            if len(runtimes)==2 and runtimes[0] is self.runtimes[1]:continue
            with self.assertRaises(ValueError):self.router.bind_runtimes(runtimes)
        self.bind();self.router.close()
        self.runtimes[0].descriptor=replace(self.runtimes[0].descriptor,wallet_authority_id=str(uuid.uuid4()))
        reopened=OwnerRouter(self.root/'router',self.config,clock=lambda:self.now);self.addCleanup(reopened.close)
        with self.assertRaises(ValueError):reopened.bind_runtimes(tuple(self.runtimes))

    def test_lifetime_lock_closed_router_and_private_marker_do_not_leak_token(self):
        with self.assertRaises((OSError,ValueError)):OwnerRouter(self.root/'router',self.config,clock=lambda:self.now)
        self.bind();principal=self.authenticate()
        raw=(self.root/'router/OWNER-DEVICES.json').read_text()
        self.assertTrue(all(row['token'] not in raw for row in self.rows))
        self.router.close()
        with self.assertRaises(RuntimeError):self.router.resolve(principal)

    def test_protected_file_symlink_hardlink_and_overbroad_modes_are_rejected(self):
        for mode in ('symlink','hardlink','mode'):
            path=self.root/('credentials-'+mode)
            if mode=='symlink':path.symlink_to(self.config)
            elif mode=='hardlink':os.link(self.config,path)
            else:path.write_bytes(self.config.read_bytes());path.chmod(0o666)
            with self.subTest(mode=mode),self.assertRaises((ValueError,OSError)):
                OwnerRouter(self.root/('router-'+mode),path,clock=lambda:self.now)
            path.unlink()

    def test_transport_revocation_commits_only_under_its_contract_admission(self):
        self.bind();saved=self.router._save;observed=[]
        def inspect(*values):
            observed.append((self.runtimes[0].entered,self.runtimes[1].entered))
            return saved(*values)
        self.router._save=inspect
        self.router.revoke_device_credential(self.rows[0]['device_ref'],1)
        self.assertEqual(observed,[(True,False)])
        self.rows[0].update(active=False,credential_revision=2);self.write(self.rows);self.router.close()
        reopened=OwnerRouter(self.root/'router',self.config,clock=lambda:self.now);self.addCleanup(reopened.close)
        reopened.bind_runtimes(tuple(self.runtimes))
        with self.assertRaises(PermissionError):
            reopened.authenticate(self.rows[0]['device_ref'],self.rows[0]['token'],self.runtimes[0].descriptor.wallet_authority_id)

    def test_registry_identity_survives_restart_but_a_different_path_copy_is_refused(self):
        self.bind()
        identity=self.router.registry_identity()
        self.assertEqual(identity[0],(self.root/'router').resolve())
        self.assertEqual(str(uuid.UUID(identity[1])),identity[1])
        self.router.close()
        copied=self.root/'copied-router';shutil.copytree(self.root/'router',copied)
        with self.assertRaises(ValueError):OwnerRouter(copied,self.config,clock=lambda:self.now)
        reopened=OwnerRouter(self.root/'router',self.config,clock=lambda:self.now);self.addCleanup(reopened.close)
        self.assertEqual(reopened.registry_identity(),identity)
        reopened.close()
        with self.assertRaises(RuntimeError):reopened.registry_identity()
        fresh=OwnerRouter(self.root/'fresh-router',self.config,clock=lambda:self.now);self.addCleanup(fresh.close)
        self.assertNotEqual(fresh.registry_identity()[1],identity[1])

    def test_a_mutated_runtime_descriptor_or_reused_old_rotation_token_is_refused(self):
        self.bind();principal=self.authenticate()
        self.runtimes[0].descriptor=replace(self.runtimes[0].descriptor,writer_epoch=2)
        with self.assertRaises(PermissionError):self.router.resolve(principal)
        self.runtimes[0].descriptor=replace(self.runtimes[0].descriptor,writer_epoch=1)
        self.router.close()
        first=self.rows[0]['token'];self.rows[0].update(token=first+'-new',credential_revision=2);self.write(self.rows)
        rotated=OwnerRouter(self.root/'router',self.config,clock=lambda:self.now);rotated.bind_runtimes(tuple(self.runtimes));rotated.close()
        self.rows[0].update(token=first,credential_revision=3);self.write(self.rows)
        with self.assertRaises(ValueError):OwnerRouter(self.root/'router',self.config,clock=lambda:self.now)


if __name__=='__main__':unittest.main()
