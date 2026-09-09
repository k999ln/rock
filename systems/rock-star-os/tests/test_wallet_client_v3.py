"""Explicit transport/cache profile guards; actual managed TLS is tested separately."""
import hashlib
from email.message import Message
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import uuid

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os')]
from blackberryrock.packages import canonical
from wallet_backend import client as client_module
from wallet_backend.client import BackendUnavailable, HTTPSWalletTransport, RemoteWalletService, configured_service


class WalletClientV3Guards(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.token=self.root/'token'
        self.token.write_text('PUBLIC-FIXTURE-GX00-CLIENT-v1');self.token.chmod(0o600)
        self.authority=str(uuid.uuid4());self.device='fixture-v3-client'
        self.ca=ROOT/'os/registry/fixtures/development-ca.pem'

    def transport(self, **options):
        return HTTPSWalletTransport('https://127.0.0.1:443',self.ca,self.token,authority_id=self.authority,**options)

    def test_v3_requires_explicit_version_and_device_and_keeps_legacy_fingerprints(self):
        identity=['https://127.0.0.1:443',self.authority,hashlib.sha256(self.ca.read_bytes()).hexdigest(),
                  hashlib.sha256(self.token.read_bytes()).hexdigest()]
        legacy=self.transport();bound=self.transport(device_ref=self.device)
        self.assertEqual(legacy.fingerprint,hashlib.sha256(canonical(identity)).hexdigest())
        self.assertEqual(bound.fingerprint,hashlib.sha256(canonical(identity+['device-bound/2',self.device])).hexdigest())
        managed=self.transport(device_ref=self.device,protocol_version=3)
        self.assertEqual(managed.endpoint,'/v3/wallet')
        self.assertNotIn(managed.fingerprint,(legacy.fingerprint,bound.fingerprint))
        for options in ({'protocol_version':3},{'protocol_version':True},{'device_ref':self.device,'protocol_version':4}):
            with self.subTest(options=options),self.assertRaises(ValueError):self.transport(**options)

    def test_old_cache_cannot_be_relabelled_v3_even_at_same_origin_authority_and_device(self):
        cache=self.root/'cache';old=RemoteWalletService(cache,self.transport(device_ref=self.device));old.close()
        with self.assertRaisesRegex(ValueError,'authority changed'):
            RemoteWalletService(cache,self.transport(device_ref=self.device,protocol_version=3))

    def test_strict_v3_config_has_no_owner_ledger_account_or_endpoint_override(self):
        config=self.root/'config.json'
        value={'schema_version':3,'mode':'development-remote-authority','origin':'https://127.0.0.1:443',
               'ca_file':str(self.ca),'token_file':str(self.token),'authority_id':self.authority,'device_ref':self.device}
        def write(body):config.write_text(json.dumps(body));config.chmod(0o600)
        write(value)
        client=configured_service(config,self.root/'state');self.addCleanup(client.close)
        self.assertEqual(client.transport.endpoint,'/v3/wallet')
        for field in ('owner_actor','owner_ref','ledger_ref','account_id','endpoint','peer_uid'):
            write(dict(value,**{field:'self-claimed'}))
            with self.subTest(field=field),self.assertRaises(ValueError):configured_service(config,self.root/field)
        write({key:value for key,value in value.items() if key!='device_ref'})
        with self.assertRaises(ValueError):configured_service(config,self.root/'missing')

    def test_v3_token_and_profile_must_be_private(self):
        self.token.chmod(0o644)
        with self.assertRaises(ValueError):self.transport(device_ref=self.device,protocol_version=3)
        # Legacy's existing protected-public fixture semantics remain valid.
        self.transport(device_ref=self.device)

    def test_private_v3_profile_and_local_authority_remnants_refuse_new_proxy(self):
        config=self.root/'profile.json'
        value={'schema_version':3,'mode':'development-remote-authority','origin':'https://127.0.0.1:443',
               'ca_file':str(self.ca),'token_file':str(self.token),'authority_id':self.authority,'device_ref':self.device}
        config.write_text(json.dumps(value));config.chmod(0o644)
        with self.assertRaises(ValueError):configured_service(config,self.root/'broad-profile')
        config.chmod(0o600);linked=self.root/'linked-profile';os.link(config,linked)
        with self.assertRaises(ValueError):configured_service(config,self.root/'linked')
        linked.unlink()
        for name in ('wallet-simulator.db','entitlement.db','wallet-simulator.db-wal','entitlement.db-shm',
                     'AUTHORITY.json','GX00-MIGRATION.json','authority.lock'):
            state=self.root/('old-'+name);state.mkdir(mode=0o700)
            # Dangling storage entries are interrupted state, not a fresh device.
            (state/name).symlink_to(state/'missing-original')
            with self.subTest(name=name),self.assertRaises(ValueError):
                unexpected=configured_service(config,state);self.addCleanup(unexpected.close)
            self.assertFalse((state/'backend-cache').exists())

    def wire_reply(self, transport, status, result, headers=()):
        # HTTP framing unit fixture only; no TLS success is inferred here.
        raw=canonical(result);response=Mock();response.status=status;response.headers=Message()
        response.headers['Content-Length']=str(len(raw))
        for name,value in headers:response.headers[name]=value
        content=io.BytesIO(raw);response.read1=content.read
        connection=Mock();connection.getresponse.return_value=response
        with patch.object(client_module.http.client,'HTTPSConnection',return_value=connection), \
             patch.object(client_module,'DeadlineConnection',return_value=Mock()):
            return transport.exchange({'v':1,'op':'snapshot'})

    def test_only_v3_exact_unbound_authentication_denial_can_hide_cached_data(self):
        v3=self.transport(device_ref=self.device,protocol_version=3)
        denied={'ok':False,'code':'unauthorized','error':'purchased device credential required'}
        for status in (401,403):self.assertEqual(self.wire_reply(v3,status,denied),denied)
        invalid=[(200,denied,()),(400,denied,()),(503,denied,()),
                 (401,dict(denied,code='unavailable'),()),(401,dict(denied,snapshot={}),()),
                 (401,{'ok':True},()),
                 (401,denied,(('X-Rock-Wallet-Authority',self.authority),)),
                 (401,denied,(('X-Rock-Wallet-Device',self.device),))]
        for status,reply,headers in invalid:
            with self.subTest(status=status,reply=reply,headers=headers),self.assertRaises(BackendUnavailable):
                self.wire_reply(v3,status,reply,headers)
        for legacy in (self.transport(),self.transport(device_ref=self.device)):
            with self.assertRaises(BackendUnavailable):self.wire_reply(legacy,401,denied)


if __name__=='__main__':unittest.main()
