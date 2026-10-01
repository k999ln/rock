"""Literal wire vectors from actual TLS grants; strict fields/types and domains."""
import copy
from dataclasses import replace
import hashlib
import json
from pathlib import Path
import unittest
from game_exchange import protocol as p,exchange_protocol as x
from game_exchange.device_client import key_records
ROOT=Path(__file__).resolve().parents[1]

class ExchangeGolden(unittest.TestCase):
    def setUp(self):
        self.values={path.stem:json.loads(path.read_text()) for path in (ROOT/'os/game_exchange/fixtures/exchange-v1').glob('*.json')}
        self.assertEqual(set(self.values),set(x.DOMAINS))
        self.keys=x.KeyRegistry(tuple(key_records([v['record']])[0] for v in self.values.values()))
    def test_six_literal_signed_messages_match_exact_bytes_digests_and_distinct_domains(self):
        for kind,vector in self.values.items():
            with self.subTest(kind=kind):
                value=vector['message'];payload=x.signature_payload(kind,value)
                self.assertEqual(payload.hex(),vector['signing_bytes_hex'])
                self.assertEqual(hashlib.sha256(payload).hexdigest(),vector['signing_bytes_sha256'])
                self.assertEqual(hashlib.sha256(p.canonical(value)).hexdigest(),vector['canonical_sha256'])
                self.keys.verify(kind,value,vector['record']['issuer'])
                with self.assertRaises(ValueError):self.keys.verify(kind,value,'public-foreign-authority')
                for other in self.values:
                    if other!=kind:
                        with self.assertRaises(ValueError):self.keys.verify(other,value,vector['record']['issuer'])
        x.match_terminal(self.values['terminal']['message'],self.values['apply']['message'],self.keys)
    def test_unknown_fields_wrong_scalar_types_and_changed_policy_rejected(self):
        quote=self.values['quote']['message']
        for field,value in (('writer_epoch',True),('principal_minor',True),('source_scale',2.0),('denominator',0),
            ('units',11),('asset_class','EARNED'),('destination_asset','COIN_B'),('total_minor',100),('external_cost_minor',1),
            ('expires_at',quote['binding']['issued_at']+121)):
            with self.subTest(field=field):
                changed=copy.deepcopy(quote);changed['binding'][field]=value
                with self.assertRaises(ValueError):x.quote(changed)
        for kind,vector in self.values.items():
            changed=copy.deepcopy(vector['message']);changed['unknown']='forbidden'
            with self.assertRaises(ValueError):x.signature_payload(kind,changed)
            changed=copy.deepcopy(vector['message']);changed['credential_revision']=True
            with self.assertRaises(ValueError):x.signature_payload(kind,changed)
        record=key_records([self.values['quote']['record']])[0]
        for field in ('revision','not_before','not_after'):
            with self.assertRaises(ValueError):x.KeyRegistry((replace(record,**{field:True}),))
    def test_same_id_changed_amount_never_has_the_original_command_or_terminal_digest(self):
        original=self.values['apply']['message'];changed=copy.deepcopy(original)
        changed['binding']['principal_minor']=200
        with self.assertRaises(ValueError):x.command(changed)
        terminal=copy.deepcopy(self.values['terminal']['message']);terminal['apply_sha256']='0'*64
        with self.assertRaises(ValueError):x.match_terminal(terminal,original,self.keys)
        for principal in (True,100.0,0,-10,11,9991,10000):
            with self.assertRaises(ValueError):x.amounts(principal)
        self.assertEqual(x.amounts(100),{'principal_minor':100,'game_fee_minor':3,'external_cost_minor':0,'total_minor':103,'units':10})

if __name__=='__main__':unittest.main()
