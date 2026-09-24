import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from alink.__main__ import load_key
from alink.protocol import Codec
from alink.storage import record_digest

class LabCLI(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.key=self.root/"key.bin"
        self.call("new-lab-key",self.key)
        self.codec=Codec("bench",load_key(self.key))
        now=time.time()
        self.record={"id":"cli-notice","created_at":now,"expires_at":now+3600,"payload":"通知本文"}
        self.record_file=self.root/"record.json"
        self.record_file.write_text(json.dumps(self.record))
    def tearDown(self):self.temp.cleanup()
    def call(self,*args,ok=True):
        p=subprocess.run([sys.executable,"-m","alink",*[str(x) for x in args]],capture_output=True,text=True)
        self.assertEqual(p.returncode,0 if ok else 2,p.stderr)
        return p
    def test_new_key_is_private_and_cannot_overwrite(self):
        self.assertEqual(len(self.key.read_bytes()),32)
        self.assertEqual(self.key.stat().st_mode & 0o077,0)
        before=self.key.read_bytes();self.call("new-lab-key",self.key,ok=False)
        self.assertEqual(self.key.read_bytes(),before)
    def test_delivery_packet_contains_no_plaintext_and_decodes(self):
        out=self.root/"delivery.packet"
        p=self.call("make-delivery","--record",self.record_file,"--key",self.key,"--device","bench","--output",out)
        self.assertNotIn(self.record["payload"].encode(),out.read_bytes())
        self.assertEqual(self.codec.open(out.read_bytes(),"delivery"),{"records":[self.record]})
        self.assertFalse(json.loads(p.stdout)["sent_to_provider"])
    def test_confirm_only_receipt_matching_original_record(self):
        receipt=self.root/"receipt.packet"
        body={"receipts":[{"id":self.record["id"],"digest":record_digest(self.record),"status":"stored"}]}
        receipt.write_bytes(self.codec.seal(body,"receipt"))
        out=self.root/"confirmation.packet"
        self.call("confirm-receipt","--receipt",receipt,"--record",self.record_file,"--key",self.key,"--device","bench","--output",out)
        self.assertEqual(self.codec.open(out.read_bytes(),"delivery"),{"confirmed_receipts":["cli-notice"]})
    def test_wrong_receipt_is_rejected_without_confirmation(self):
        receipt=self.root/"receipt.packet"
        receipt.write_bytes(self.codec.seal({"receipts":[{"id":"cli-notice","digest":"0"*64,"status":"stored"}]},"receipt"))
        out=self.root/"confirmation.packet"
        self.call("confirm-receipt","--receipt",receipt,"--record",self.record_file,"--key",self.key,"--device","bench","--output",out,ok=False)
        self.assertFalse(out.exists())
    @unittest.skipUnless(os.name=="posix","POSIX permissions")
    def test_readable_by_other_users_key_is_rejected(self):
        self.key.chmod(0o644)
        with self.assertRaises(ValueError):load_key(self.key)

if __name__=="__main__":unittest.main()
