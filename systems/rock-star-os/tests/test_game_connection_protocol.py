"""Schema/crypto only: two public fixture authors/games, no endpoint or DB pass."""
import base64
from dataclasses import replace
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os')]
from game_exchange import protocol as p

NOW=1789000000
UID=lambda number:str(uuid.UUID(int=number,version=4))
B64=lambda raw:base64.urlsafe_b64encode(raw).decode().rstrip('=')


class GameConnectionProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary=tempfile.TemporaryDirectory(prefix='public-game-protocol-')
        cls.root=Path(cls.temporary.name);cls.private={};keys=[]
        specs=[('proof-a','game.connection.proof','fixture-authority-a',1),
               ('proof-b','game.connection.proof','fixture-authority-b',2),
               ('receipt-a','wallet.connection.receipt',UID(1),3),
               ('receipt-b','wallet.connection.receipt',UID(2),4),
               ('cursor-a','wallet.connection.cursor',UID(1),5),
               ('owner-auth-a',None,UID(1),6)]
        for name,purpose,issuer,number in specs:
            # Deterministic, deliberately PUBLIC synthetic seeds, never real keys.
            private=cls.root/(name+'.der')
            private.write_bytes(bytes.fromhex('302e020100300506032b657004220420')+hashlib.sha256(('PUBLIC-GX00-'+str(number)).encode()).digest())
            result=subprocess.run(['openssl','pkey','-inform','DER','-in',str(private),'-pubout','-outform','DER'],capture_output=True,check=True,timeout=5)
            public=result.stdout;assert public[:12]==bytes.fromhex('302a300506032b6570032100') and len(public)==44
            cls.private[name]=private
            if purpose is None:cls.owner_public=public[-32:]
            else:keys.append(p.KeyRecord(name,1,purpose,issuer,public[-32:],NOW-10,NOW+1000,None,None))
        cls.records=tuple(keys);cls.keys=p.KeyRegistry(cls.records)

    @classmethod
    def tearDownClass(cls):cls.temporary.cleanup()

    def setUp(self):
        self.owner=p.OwnerContext(UID(1),'fixture-owner-alice',UID(11),'fixture-alice-a1',1)
        self.other=replace(self.owner,wallet_authority_id=UID(2),owner_ref='fixture-owner-bob',account_id=UID(12),device_ref='fixture-bob-b1')
        self.games={letter:p.GameRecord('fixture-author-'+letter,'fixture-authority-'+letter,'fixture-game-'+letter,
                          '合成ゲーム '+letter.upper(),1,('connection:read','connection:revoke')) for letter in ('a','b')}
        self.proof=self.signed('proof',self.proof_body('a'),'proof-a')
        self.binding=p.make_binding(self.proof,self.games['a'],self.owner,intent_id=UID(21),connection_id=UID(31),
            scopes=['connection:read','connection:revoke'],terms_version=p.TERMS,now=NOW,connection_expires_at=NOW+3600)
        self.intent={'schema':'rock-game-connection-intent/1','environment':'synthetic','state':'AWAITING_OWNER_CONSENT',
            'operation':'game.connection.begin','key':'begin-a','request_sha256':'a'*64,'receipt_id':UID(41),
            'binding':self.binding,'binding_sha256':p.binding_digest(self.binding),'challenge_id':UID(51),
            'options':{'schema_version':1,'purpose':'wallet.game.connect','device_ref':self.owner.device_ref,
                'publicKey':{'challenge':B64(b'c'*32),'timeout':120000,'rpId':p.RP_ID,
                    'allowCredentials':[{'type':'public-key','id':B64(b'credential-a')}],'userVerification':'required'}},
            'simulation_only':True}
        self.consent={'schema':'rock-game-owner-consent/1','environment':'synthetic','operation':'game.connection.approve',
            'key':'approve-a','request_sha256':'b'*64,'receipt_id':UID(61),'binding':self.binding,
            'binding_sha256':p.binding_digest(self.binding),'challenge_id':UID(51),'credential_id':B64(b'credential-a'),
            'assertion_sha256':'c'*64,'credential_sign_count':1,'committed_at':NOW+1,'decision':'APPROVED','simulation_only':True}
        self.begin_request={'v':1,'op':'game.connection.begin','key':'begin-a','proof':self.proof,
            'scopes':self.binding['scopes'],'terms_version':p.TERMS,'connection_expires_at':self.binding['connection_expires_at']}
        self.intent['request_sha256']=p.owner_request_digest(self.begin_request)
        self.approval_request,self.owner_record,self.user_handle=self.owner_assertion()
        self.consent.update(key=self.approval_request['key'],request_sha256=p.owner_request_digest(self.approval_request),
            assertion_sha256=p.hash_object(b'RockGameOwnerAssertion-v1\0',self.approval_request['credential']))
        self.shared=self.signed('shared',p.publication(self.consent,receipt_id=UID(71),key_id='receipt-a',key_revision=1),'receipt-a')
        self.head=self.connection_head(self.shared)

    def connection_head(self,receipt):
        public=receipt['publication']
        return p.ConnectionHead(public['wallet_authority_id'],public['game_authority_id'],public['game_id'],public['connection_id'],
            public['revocation_generation'],public['state'],p.hash_object(b'RockGameSharedReceipt-v1\0',receipt))

    def proof_body(self,letter):
        game=self.games[letter]
        return {'schema':'rock-game-connection-proof/1','environment':'synthetic','game_authority_id':game.game_authority_id,
            'game_id':game.game_id,'game_revision':game.revision,'player_id':'fixture-player-'+letter,
            'player_display':'プレイヤー '+letter.upper(),'player_display_revision':1,'audience':UID(1),
            'nonce':B64(letter.encode()*32),'issued_at':NOW,'expires_at':NOW+120,
            'requested_scopes':['connection:read','connection:revoke'],'algorithm':'Ed25519',
            'credential_id':'proof-'+letter,'credential_revision':1,'signature':B64(b'\0'*64)}

    def signed(self,kind,value,key,*,domain=None):
        value=copy.deepcopy(value);value['signature']=B64(b'\0'*64)
        payload=p.signature_payload(kind,value)
        if domain is not None:payload=domain+p.canonical({k:v for k,v in value.items() if k!='signature'})
        with tempfile.TemporaryDirectory(dir=self.root) as temp:
            body=Path(temp)/'body';body.write_bytes(payload)
            result=subprocess.run(['openssl','pkeyutl','-sign','-inkey',str(self.private[key]),'-keyform','DER','-rawin','-in',str(body)],
                                  capture_output=True,check=True,timeout=5)
        value['signature']=B64(result.stdout);return value

    def test_actual_distinct_game_signatures_and_signed_display_binding(self):
        for letter in ('a','b'):
            proof=self.signed('proof',self.proof_body(letter),'proof-'+letter)
            self.assertEqual(p.verify_proof(proof,self.keys,self.games[letter],audience=UID(1),now=NOW),proof)
            for field,value in (('player_id','fixture-other'),('player_display','別アカウント'),('player_display_revision',2)):
                bad=dict(proof,**{field:value})
                with self.subTest(letter=letter,field=field),self.assertRaises(p.ProtocolError):
                    p.verify_proof(bad,self.keys,self.games[letter],audience=UID(1),now=NOW)

    def test_four_owner_game_proof_bindings_use_distinct_authenticated_players(self):
        seen=set()
        for owner in (self.owner,self.other):
            for letter,game in self.games.items():
                proof=self.proof_body(letter);proof['audience']=owner.wallet_authority_id
                proof['player_id']='fixture-player-'+letter+'-'+owner.owner_ref
                proof['nonce']=B64(hashlib.sha256((owner.account_id+letter).encode()).digest())
                proof=self.signed('proof',proof,'proof-'+letter)
                verified=p.verify_proof(proof,self.keys,game,audience=owner.wallet_authority_id,now=NOW)
                binding=p.make_binding(verified,game,owner,intent_id=UID(100+len(seen)),connection_id=UID(200+len(seen)),
                    scopes=['connection:read'],terms_version=p.TERMS,now=NOW,connection_expires_at=NOW+3600)
                self.assertEqual(binding['owner_ref'],owner.owner_ref);self.assertEqual(binding['author_id'],game.author_id)
                seen.add((binding['wallet_authority_id'],binding['game_id'],binding['player_id']))
        self.assertEqual(len(seen),4)  # Four protocol bindings, not four active DB connections.

    def test_existing_tool_registry_entitlement_and_atm_credentials_cannot_sign_game_proofs(self):
        from blackberryrock.packages import PUBLIC_TEST_KEY
        from blackberryrock.sdk import RFC8032_PUBLIC_TEST_SEED
        from entitlement.protocol import sign_fixture_event
        reused=self.root/'public-existing-tool.der'
        reused.write_bytes(bytes.fromhex('302e020100300506032b657004220420'+RFC8032_PUBLIC_TEST_SEED))
        self.private['existing-tool']=reused
        proof=self.signed('proof',self.proof,'existing-tool')
        with self.assertRaises(p.ProtocolError):p.verify_proof(proof,self.keys,self.games['a'],audience=UID(1),now=NOW)
        with self.assertRaises(p.ProtocolError):p.KeyRegistry((replace(self.records[0],public_key=bytes.fromhex(PUBLIC_TEST_KEY)),))
        event=sign_fixture_event('wallet','fixture-game-foreign-event','fixture-game-stream',1,NOW,'not-a-proof',{})
        for signature in (event['signature'],'123456','PUBLIC-FIXTURE-REGISTRY-AUTHOR-v1'):
            with self.assertRaises(p.ProtocolError):p.validate_proof(dict(self.proof,signature=signature))

    def test_missing_unknown_duplicate_and_integer_coercions_are_rejected(self):
        for key in self.proof:
            bad=dict(self.proof);del bad[key]
            with self.subTest(missing=key),self.assertRaises(p.ProtocolError):p.validate_proof(bad)
        for bad in (dict(self.proof,owner_ref='fixture-owner-bob'),dict(self.proof,issued_at=True),
                    dict(self.proof,credential_revision=1.0),dict(self.proof,expires_at=float('inf'))):
            with self.assertRaises(p.ProtocolError):p.validate_proof(bad)
        for raw in (b'{"v":1,"v":1}',b'{"v":1.0}',b'{"v":NaN}',b'{"v":-0}',b'\xef\xbb\xbf{}'):
            with self.assertRaises(p.ProtocolError):p.decode(raw)

    def test_canonical_nul_domain_unicode_and_order_vectors(self):
        self.assertEqual(p.canonical({'z':'雪','a':1}),b'{"a":1,"z":"\xe9\x9b\xaa"}')
        self.assertEqual(p.canonical(dict(reversed(list(self.proof.items())))),p.canonical(self.proof))
        for domain in (b'RockGameConnectionProof-v1\\0',b'RockGameConnectionReceipt-v1\0',b'RockRegistryIndex-v1\0',b'RockEntitlementWebhook-v1\0'):
            wrong=self.signed('proof',self.proof,'proof-a',domain=domain)
            with self.subTest(domain=domain),self.assertRaises(p.ProtocolError):p.verify_proof(wrong,self.keys,self.games['a'],audience=UID(1),now=NOW)
        for text in ('e\u0301','a\u202eb','a\x00b','a\ud800'):
            with self.assertRaises(p.ProtocolError):p.validate_proof(dict(self.proof,player_display=text))

    def test_scope_expansion_order_duplicates_and_unimplemented_assets_exchange_fail(self):
        for scopes in ([],['connection:revoke'],['connection:read','connection:read'],['connection:revoke','connection:read'],
                       ['connection:read','assets:read'],['connection:read','exchange:quote']):
            with self.subTest(scopes=scopes),self.assertRaises(p.ProtocolError):p.validate_proof(dict(self.proof,requested_scopes=scopes))
        self.assertEqual(p.capabilities(),{'connections':False,'assets_snapshot':False,'exchange':False,'history':False,'simulation_only':True})
        for op in ('assets.snapshot','exchange.quote','exchange.apply','connection.history'):
            with self.assertRaises(p.FeatureDisabled):p.validate_game_request({'v':1,'op':op,'connection_id':UID(31)})

    def test_proof_time_audience_game_revision_key_purpose_and_revocation_fail(self):
        for now in (NOW-1,NOW+120):
            with self.assertRaises(p.ProtocolError):p.verify_proof(self.proof,self.keys,self.games['a'],audience=UID(1),now=now)
        for proof,game,audience in ((self.proof,self.games['b'],UID(1)),(self.proof,self.games['a'],UID(2)),
                (dict(self.proof,game_revision=2),self.games['a'],UID(1))):
            with self.assertRaises(p.ProtocolError):p.verify_proof(proof,self.keys,game,audience=audience,now=NOW)
        record=self.records[0]
        for changed in (replace(record,purpose='wallet.connection.receipt'),replace(record,revoked_at=NOW),replace(record,retired_at=NOW)):
            keys=p.KeyRegistry((changed,)+self.records[1:])
            with self.assertRaises(p.ProtocolError):p.verify_proof(self.proof,keys,self.games['a'],audience=UID(1),now=NOW)
        with self.assertRaises(p.ProtocolError):p.KeyRegistry(self.records+(replace(record,key_id='other-purpose',purpose='wallet.connection.cursor'),))

    def test_exact_intent_and_consent_digest_field_sets(self):
        p.validate_intent(self.intent);p.validate_consent(self.consent)
        for value,validator in ((self.intent,p.validate_intent),(self.consent,p.validate_consent)):
            for field in value:
                bad=dict(value);del bad[field]
                with self.subTest(field=field,schema=value['schema']),self.assertRaises(p.ProtocolError):validator(bad)
            with self.assertRaises(p.ProtocolError):validator(dict(value,unexpected=True))
            bad=copy.deepcopy(value);bad['binding']['account_id']=UID(99)
            with self.assertRaises(p.ProtocolError):validator(bad)
        with self.assertRaises(p.ProtocolError):p.validate_intent(dict(self.intent,binding_sha256='0'*64))

    def test_shared_receipt_preserves_binding_without_private_projection_leaks(self):
        result=p.verify_shared(self.shared,self.keys,now=NOW+2);p.match_consent(result,self.consent)
        principal=p.GamePrincipal('fixture-author-a','fixture-authority-a','fixture-game-a',1,('connection:read',),NOW+100,False)
        view=p.project_author(self.shared,self.keys,principal,game=self.games['a'],current=self.head,now=NOW+2)
        raw=p.canonical(view)
        for private in (self.owner.owner_ref,self.owner.account_id,self.owner.device_ref,self.intent['options']['publicKey']['challenge']):
            self.assertNotIn(private.encode(),raw)
        owner=p.project_owner(self.shared,self.consent,self.keys,replace(self.owner,device_ref='fixture-alice-a2'),current=self.head,now=NOW+2)
        self.assertEqual(owner['approved_device_ref'],self.owner.device_ref)
        with self.assertRaises(p.ProtocolError):p.project_owner(self.shared,self.consent,self.keys,self.other,current=self.head,now=NOW+2)
        with self.assertRaises(p.ProtocolError):p.project_author(self.shared,self.keys,replace(principal,game_id='fixture-game-b'),game=self.games['a'],current=self.head,now=NOW+2)

    def test_old_signed_active_receipt_cannot_replace_current_revoked_head(self):
        revoked=copy.deepcopy(self.shared);public=revoked['publication']
        public.update(state='REVOKED',revocation_generation=1,decided_at=NOW+2)
        revoked.update(key='publish:'+public['connection_id']+':1',receipt_id=UID(72),
                       request_sha256=p.hash_object(b'RockGameConnectionPublication-v1\0',public))
        revoked=self.signed('shared',revoked,'receipt-a');head=self.connection_head(revoked)
        principal=p.GamePrincipal('fixture-author-a','fixture-authority-a','fixture-game-a',1,('connection:read',),NOW+100,False)
        view=p.project_author(revoked,self.keys,principal,game=self.games['a'],current=head,now=NOW+3)
        self.assertEqual(view['state'],'REVOKED');self.assertNotIn('player_id',view);self.assertNotIn('scopes',view)
        with self.assertRaises(p.ProtocolError):p.project_author(self.shared,self.keys,principal,game=self.games['a'],current=head,now=NOW+3)
        with self.assertRaises(p.ProtocolError):p.project_owner(self.shared,self.consent,self.keys,self.owner,current=head,now=NOW+3)
        with self.assertRaises(p.ProtocolError):p.project_author(self.shared,self.keys,replace(principal,author_id='fixture-author-b'),game=self.games['a'],current=self.head,now=NOW+3)

    def test_current_api_auth_is_separate_from_historical_signature_verification(self):
        archived=tuple(replace(row,retired_at=NOW+10) if row.key_id=='receipt-a' else row for row in self.records)
        p.verify_shared(self.shared,p.KeyRegistry(archived),now=NOW+4000)
        principal=p.GamePrincipal('fixture-author-a','fixture-authority-a','fixture-game-a',1,('connection:read',),NOW+10,False)
        with self.assertRaises(p.ProtocolError):p.project_author(self.shared,p.KeyRegistry(archived),principal,game=self.games['a'],current=self.head,now=NOW+11)
        revoked=tuple(replace(row,revoked_at=NOW+10) if row.key_id=='receipt-a' else row for row in self.records)
        with self.assertRaises(p.ProtocolError):p.verify_shared(self.shared,p.KeyRegistry(revoked),now=NOW+4000)

    def test_exact_retry_and_no_cross_device_challenge_transfer_or_ttl_reservation_reuse(self):
        request={'v':1,'op':'game.connection.reconcile','key':'same-key','intent_id':UID(21)}
        self.assertTrue(p.exact_retry(request,copy.deepcopy(request)))
        for bad in (dict(request,key='new'),dict(request,intent_id=UID(22)),dict(request,op='game.connection.revoke')):
            with self.assertRaises(p.ProtocolError):p.exact_retry(request,bad)
        p.admit_intent_action(self.intent,self.owner,'approve',now=NOW+1)
        p.admit_intent_action(self.intent,replace(self.owner,device_ref='fixture-alice-a2'),'reconcile',now=NOW+121)
        for context,action,now in ((self.other,'reconcile',NOW),(replace(self.owner,device_ref='fixture-alice-a2'),'approve',NOW),
                (self.owner,'approve',NOW+120),(self.owner,'cancel',NOW),(self.owner,'reassign',NOW+1000)):
            with self.assertRaises(p.ProtocolError):p.admit_intent_action(self.intent,context,action,now=now)

    def owner_assertion(self):
        client=p.canonical({'type':'webauthn.get','challenge':self.intent['options']['publicKey']['challenge'],
                            'origin':p.auth.ORIGIN,'crossOrigin':False})
        raw=hashlib.sha256(p.RP_ID.encode()).digest()+bytes([5])+(1).to_bytes(4,'big')
        payload=raw+hashlib.sha256(client).digest()
        with tempfile.TemporaryDirectory(dir=self.root) as temp:
            path=Path(temp)/'payload';path.write_bytes(payload)
            signed=subprocess.run(['openssl','pkeyutl','-sign','-inkey',str(self.private['owner-auth-a']),'-keyform','DER','-rawin','-in',str(path)],
                                  capture_output=True,check=True,timeout=5).stdout
        handle=B64(b'owner-account-handle')
        credential={'id':B64(b'credential-a'),'rawId':B64(b'credential-a'),'type':'public-key','clientExtensionResults':{},
                    'response':{'clientDataJSON':B64(client),'authenticatorData':B64(raw),'signature':B64(signed),'userHandle':handle}}
        record={'credential_id':credential['id'],'public_key':self.owner_public.hex(),'sign_count':0,'aaguid':'0'*32,
                'backup_eligible':False,'backup_state':False}
        request={'v':1,'op':'game.connection.approve','key':'owner-approve-real','intent_id':UID(21),'challenge_id':UID(51),
                 'binding_sha256':self.intent['binding_sha256'],'credential':credential}
        return request,record,handle

    def test_begin_receipt_joins_the_complete_proof_request_and_trusted_context(self):
        p.match_begin_intent(self.intent,self.begin_request,self.games['a'],self.owner)
        for field,value in (('key','another-key'),('connection_expires_at',NOW+3601),('scopes',['connection:read'])):
            with self.subTest(field=field),self.assertRaises(p.ProtocolError):
                p.match_begin_intent(self.intent,dict(self.begin_request,**{field:value}),self.games['a'],self.owner)
        bad=copy.deepcopy(self.begin_request);bad['proof']['player_display']='他の表示'
        with self.assertRaises(p.ProtocolError):p.match_begin_intent(self.intent,bad,self.games['a'],self.owner)
        with self.assertRaises(p.ProtocolError):p.match_begin_intent(self.intent,self.begin_request,self.games['b'],self.owner)
        with self.assertRaises(p.ProtocolError):p.match_begin_intent(self.intent,self.begin_request,self.games['a'],self.other)
        with self.assertRaises(p.ProtocolError):p.match_begin_intent(dict(self.intent,request_sha256='0'*64),self.begin_request,self.games['a'],self.owner)

    def test_durable_consent_joins_exact_approval_request_assertion_and_saved_intent(self):
        request,record,handle=self.owner_assertion()
        updated=p.verify_owner_approval(request,self.intent,self.owner,record,handle,now=NOW+1)
        consent=copy.deepcopy(self.consent)
        consent.update(key=request['key'],request_sha256=p.owner_request_digest(request),
            assertion_sha256=p.hash_object(b'RockGameOwnerAssertion-v1\0',request['credential']),credential_sign_count=updated['sign_count'])
        p.match_owner_consent(consent,self.intent,request)
        for field,value in (('key','wrong-key'),('request_sha256','0'*64),('assertion_sha256','f'*64),('challenge_id',UID(999)),('credential_sign_count',2)):
            with self.subTest(field=field),self.assertRaises(p.ProtocolError):p.match_owner_consent(dict(consent,**{field:value}),self.intent,request)
        other=copy.deepcopy(self.intent);other['binding']['device_ref']='fixture-alice-a2';other['binding_sha256']=p.binding_digest(other['binding']);other['options']['device_ref']='fixture-alice-a2'
        with self.assertRaises(p.ProtocolError):p.match_owner_consent(consent,other,request)

    def test_actual_owner_assertion_uses_original_challenge_device_and_counter(self):
        request,record,handle=self.owner_assertion()
        updated=p.verify_owner_approval(request,self.intent,self.owner,record,handle,now=NOW+1)
        self.assertEqual(updated['sign_count'],1);self.assertEqual(record['sign_count'],0)
        for field,value in (('intent_id',UID(999)),('challenge_id',UID(888)),('binding_sha256','0'*64)):
            with self.subTest(field=field),self.assertRaises(p.ProtocolError):
                p.verify_owner_approval(dict(request,**{field:value}),self.intent,self.owner,record,handle,now=NOW+1)
        for owner,count,at in ((replace(self.owner,device_ref='fixture-alice-a2'),0,NOW+1),(self.owner,1,NOW+1),(self.owner,0,NOW+120)):
            with self.assertRaises(p.ProtocolError):
                p.verify_owner_approval(request,self.intent,owner,dict(record,sign_count=count),handle,now=at)
        changed=copy.deepcopy(self.intent);changed['options']['purpose']='wallet.atm.issue'
        with self.assertRaises(p.ProtocolError):p.verify_owner_approval(request,changed,self.owner,record,handle,now=NOW+1)

    def test_nonce_and_subject_reservation_match_only_the_original_immutable_intent(self):
        reserved={'schema':'rock-game-subject-reservation/1','environment':'synthetic','state':'RESERVED',
                  'binding':self.binding,'binding_sha256':p.binding_digest(self.binding)}
        self.assertEqual(p.reservation_keys(self.binding),
            (('fixture-authority-a',self.binding['proof_nonce']),('fixture-authority-a','fixture-game-a',self.binding['player_id'])))
        for state in ('RESERVED','WALLET_CONSENT_COMMITTED','ACTIVE','REVOKED'):
            p.match_reservation(dict(reserved,state=state),self.binding)
            for field,value in (('intent_id',UID(999)),('wallet_authority_id',UID(2)),('connection_id',UID(998)),
                                ('proof_nonce',B64(b'new-proof-nonce'.ljust(32,b'x')))):
                changed=dict(self.binding,**{field:value})
                with self.subTest(state=state,field=field),self.assertRaises(p.ProtocolError):p.match_reservation(dict(reserved,state=state),changed)
        # A time limit is absent from this matcher by design. Only the saved
        # immutable intent is replayable; expiration cannot free a reservation.
        with self.assertRaises(p.ProtocolError):p.match_reservation(dict(reserved,state='FREE_AFTER_TTL'),self.binding)

    def test_literal_cross_language_vectors_verify_and_reject_their_negative_cases(self):
        vectors=p.decode((ROOT/'os/game_exchange/fixtures/connection-v1-vectors.json').read_bytes())
        objects=vectors['objects']
        for name,value in objects.items():self.assertEqual(p.canonical(value).hex(),vectors['canonical_hex'][name])
        for name,kind in (('proof_a','proof'),('proof_b','proof'),('shared_receipt','shared'),('revoked_shared_receipt','shared'),('cursor','cursor')):
            self.assertEqual(p.signature_payload(kind,objects[name]).hex(),vectors['signing_payload_hex'][name])
        p.verify_proof(objects['proof_a'],self.keys,self.games['a'],audience=UID(1),now=NOW)
        p.verify_proof(objects['proof_b'],self.keys,self.games['b'],audience=UID(1),now=NOW)
        p.verify_shared(objects['shared_receipt'],self.keys,now=NOW+2)
        p.verify_shared(objects['revoked_shared_receipt'],self.keys,now=NOW+3)
        p.verify_cursor(vectors['cursor_token'],self.keys,objects['cursor_scope'],now=NOW+1)
        p.match_reservation(objects['subject_reservation'],objects['binding'])
        p.match_begin_intent(objects['intent'],objects['begin_request'],self.games['a'],self.owner)
        p.verify_owner_approval(objects['owner_approval'],objects['intent'],self.owner,vectors['owner_auth_record_before'],vectors['owner_user_handle'],now=NOW+1)
        p.match_owner_consent(objects['owner_consent'],objects['intent'],objects['owner_approval'])
        self.assertEqual(vectors['digests'],{'proof':p.proof_digest(objects['proof_a']),'binding':p.binding_digest(objects['binding']),
                                           'consent':p.consent_digest(objects['owner_consent'])})
        for vector in vectors['rejection_vectors']:
            proof=copy.deepcopy(objects['proof_a']);now=vector.get('now',NOW);audience=vector.get('audience',UID(1))
            if 'replacement_domain_hex' in vector:proof=self.signed('proof',proof,'proof-a',domain=bytes.fromhex(vector['replacement_domain_hex']))
            for field in ('requested_scopes','player_display'):
                if field in vector:proof[field]=vector[field]
            with self.subTest(name=vector['name']),self.assertRaises(p.ProtocolError):p.verify_proof(proof,self.keys,self.games['a'],audience=audience,now=now)

    def test_cursor_is_signed_bounded_and_bound_to_full_authorization_and_filters(self):
        scope={'wallet_authority_id':UID(1),'owner_ref':self.owner.owner_ref,'account_id':self.owner.account_id,
               'device_ref':self.owner.device_ref,'credential_revision':1,'operation':'game.connection.list','limit':20,'filter':'all'}
        cursor={'schema':'rock-game-connection-cursor/1','environment':'synthetic','issuer':UID(1),
                'scope_sha256':p.scope_digest(scope),'after_id':UID(31),'issued_at':NOW,'expires_at':NOW+120,
                'algorithm':'Ed25519','credential_id':'cursor-a','credential_revision':1,'signature':B64(b'\0'*64)}
        token=p.encode_cursor(self.signed('cursor',cursor,'cursor-a'))
        self.assertEqual(p.verify_cursor(token,self.keys,scope,now=NOW+1)['after_id'],UID(31))
        for bad in (dict(scope,limit=21),dict(scope,device_ref='fixture-alice-a2'),dict(scope,wallet_authority_id=UID(2))):
            with self.assertRaises(p.ProtocolError):p.verify_cursor(token,self.keys,bad,now=NOW+1)
        with self.assertRaises(p.ProtocolError):p.verify_cursor(token,self.keys,scope,now=NOW+120)
        with self.assertRaises(p.ProtocolError):p.verify_cursor(token+'=',self.keys,scope,now=NOW+1)


if __name__=='__main__':unittest.main()
