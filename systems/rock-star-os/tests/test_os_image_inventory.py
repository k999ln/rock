"""Negative derivation boundaries; synthetic metadata never counts as a boot."""
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'os/desktop'))
import image_inventory as inventory


class ProfileInventory(unittest.TestCase):
    def setUp(self):
        self.before = {'paths': {'/usr/bin/rock-ui':{'kind':'file','inode':50,'uid':0,'gid':0,'mode':0o755,'size':5,'sha256':'a'*64}}}
        self.after = copy.deepcopy(self.before)
        self.after['paths']['/etc/rock-wallet'] = {'kind':'directory','inode':51,'uid':0,'gid':0,'mode':0o755}
        self.injected = []
        for index,name in enumerate(('backend.json','backend-token')):
            path = '/etc/rock-wallet/'+name
            self.after['paths'][path] = {'kind':'file','inode':52+index,'uid':1003,'gid':1003,'mode':0o600,'size':index+1,'sha256':str(index)*64}
            self.injected.append({'path':path,'size':index+1,'sha256':str(index)*64})

    def check(self): return inventory.compare(self.before,self.after,self.injected)

    def test_exact_private_additions(self): self.assertEqual(3,len(self.check()))

    def test_nonzero_inodes_and_valid_listing_are_required(self):
        self.assertEqual([('data',14,0o100600,1003,1003,2)],inventory.listing('/14/100600/1003/1003/data/2/\n/0/000000/0/0//0/'))
        for value in ('/0/100600/1/1/x/2/','/4/100600/1/1/x/2/extra','/4/100600/1/1/x\t/2/'):
            with self.subTest(value=value),self.assertRaises(ValueError): inventory.listing(value)

    def test_undeclared_file_change_is_rejected(self):
        self.after['paths']['/usr/bin/rock-ui']['sha256']='b'*64
        with self.assertRaisesRegex(ValueError,'undeclared'): self.check()

    def test_undeclared_owner_or_inode_changes_are_rejected(self):
        for field in ('uid','gid','inode','mode'):
            original=self.after['paths']['/usr/bin/rock-ui'][field]
            self.after['paths']['/usr/bin/rock-ui'][field]=original+1
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'undeclared'): self.check()
            self.after['paths']['/usr/bin/rock-ui'][field]=original

    def test_removed_or_extra_path_is_rejected(self):
        del self.after['paths']['/usr/bin/rock-ui']
        with self.assertRaisesRegex(ValueError,'undeclared'): self.check()

    def test_existing_wallet_configuration_is_not_replaced(self):
        self.before['paths']['/etc/rock-wallet/backend.json']={'old':True}
        with self.assertRaisesRegex(ValueError,'replaced'): self.check()

    def test_token_must_remain_private_owned_and_identical(self):
        path='/etc/rock-wallet/backend-token'
        for field,value in (('uid',0),('gid',0),('mode',0o644),('size',8),('sha256','f'*64)):
            original=self.after['paths'][path][field];self.after['paths'][path][field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'payload'): self.check()
            self.after['paths'][path][field]=original

    def test_wrong_directory_owner_is_rejected(self):
        self.after['paths']['/etc/rock-wallet']['uid']=1003
        with self.assertRaisesRegex(ValueError,'directory ownership'): self.check()


if __name__ == '__main__': unittest.main()
