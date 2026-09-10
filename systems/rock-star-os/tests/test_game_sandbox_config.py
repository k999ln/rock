"""Fixed public profile contract rejects implicit endpoints and money policy."""
import copy
from pathlib import Path
import unittest
from game_exchange import sandbox
from game_exchange.device_client import configuration

class SandboxConfiguration(unittest.TestCase):
    def test_committed_sample_is_exact_public_configuration(self):
        raw=(Path(sandbox.__file__).parent/'fixtures/sandbox-20260910.json').read_bytes()
        self.assertEqual(raw,(sandbox.encoded(sandbox.sample())+'\n').encode())
        self.assertEqual(sandbox.validate(sandbox.sample()),sandbox.sample())
        self.assertEqual(len(sandbox.public_device_config()['games']),2)
        configuration(sandbox.public_device_config())
    def test_no_implicit_identity_port_or_policy_change(self):
        for mutation in ({'authority_id':'another'}, {'ports':{'wallet':9644,'game_a':9642,'game_b':9643}},
                         {'simulation_only':False},{'fixture_date':0},{'initial_balance':10000}):
            value=sandbox.sample();value.update(mutation)
            with self.assertRaises(ValueError):sandbox.validate(value)
    def test_no_other_device_profile_authority_endpoint_or_key_purpose(self):
        for field,value in [('mode','development-local'),('schema_version',True),('authority_id','other'),
                            ('origin','http://10.0.2.2:9641'),('token_file','/tmp/credential')]:
            config=copy.deepcopy(sandbox.public_device_config());config[field]=value
            with self.assertRaises(ValueError):configuration(config)
        config=copy.deepcopy(sandbox.public_device_config());config['exchange_keys'][0]['purpose']='tool.execution'
        with self.assertRaises(ValueError):configuration(config)

if __name__=='__main__':unittest.main()
