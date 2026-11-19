import copy
import time
import unittest

from controller import Rejected
from linux_gate import binding, rules_for, token_name


class CompilerTests(unittest.TestCase):
    def setUp(self):
        self.now = int(time.time())
        self.b = dict(clientId='phone', lanInterface='lan0', wanInterface='wan0',
                      mac='02:00:00:00:00:02', ipv4='10.90.1.2', ipv6='fd90:1::2')
        self.g = dict(grantId='grant-1', clientId='phone', status='reserved', maxBytes=1000, expiresAt=self.now+10)

    def test_both_directions_and_families_share_one_quota(self):
        text = rules_for(self.g, self.b, self.now)
        self.assertEqual(text.count('add quota '), 1)
        self.assertEqual(text.count('quota name '), 4)
        self.assertEqual(text.count('meta time <'), 4)
        self.assertEqual(text.count('timeout 10s'), 2)
        self.assertEqual(text.count('ether saddr'), 2)
        self.assertNotIn('established', text)
        self.assertNotIn('flow add', text)
        self.assertNotIn('flush ruleset', text)

    def test_rejects_command_injection_invalid_addresses_and_multicast_mac(self):
        for key, value in [('lanInterface', 'lan0; flush ruleset'), ('wanInterface', 'wan*'),
                           ('ipv4', '127.0.0.1'), ('ipv6', 'ff02::1'), ('ipv4', 123),
                           ('mac', '01:00:00:00:00:01'), ('ipv6', 'fe80::2%lan0'),
                           ('ipv6', 'fe80::2%zone with spaces'), ('ipv6', 'fe80::2%zone\naccept')]:
            with self.subTest(key=key), self.assertRaises(Rejected):
                binding({**self.b, key:value})
        with self.assertRaises(Rejected):
            binding({**self.b, 'other':'nft command'})

    def test_boundaries_and_owner_binding(self):
        for change in [dict(maxBytes=0), dict(maxBytes=True), dict(expiresAt=self.now),
                       dict(expiresAt=self.now+61), dict(clientId='other'), dict(status='settled')]:
            with self.assertRaises(Rejected):
                rules_for({**self.g, **change}, self.b, self.now)
        self.assertIn('timeout 1s', rules_for({**self.g, 'expiresAt':self.now+1}, self.b, self.now))

    def test_identity_is_fixed_and_data_not_mutated(self):
        before = copy.deepcopy((self.g,self.b))
        rules_for(self.g,self.b,self.now)
        self.assertEqual((self.g,self.b),before)
        self.assertEqual(token_name('g'),token_name('g'))
        self.assertNotEqual(token_name('g'),token_name('other'))
        with self.assertRaises(Rejected):
            token_name('../outside')


if __name__ == '__main__':
    unittest.main()
