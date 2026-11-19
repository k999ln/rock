import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('android_bridge_unicode',ROOT/'toolkits/sky-linux-local/android-bridge.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Peer:
    captured=None
    path=None
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def settimeout(self,*args):pass
    def connect(self,path):self.path=path
    def sendall(self,data):self.captured=data
    def makefile(self,*args):return io.BytesIO(b'{"schema":"rockstaros.pixel-runtime-response/1","state":"not_found"}\n')
class UnicodeTests(unittest.TestCase):
    def test_surrogates_and_utf8_retain_exact_json_values_with_compact_frame(self):
        fixture=json.loads((ROOT/'toolkits/sky-linux-local/owner-jvm-tests/portable-command-fixture.json').read_text())
        command=fixture['command'];peer=Peer()
        with patch.object(module.socket,'socket',return_value=peer),patch.object(module.Path,'read_text',return_value='11111111-2222-4333-8444-555555555555\n'):module.runtime_request(command)
        self.assertEqual(command,json.loads(peer.captured.decode('utf-8')));self.assertIn(b'\\ud800',peer.captured);self.assertIn('合成'.encode(),peer.captured);self.assertLess(len(peer.captured),24000)
        self.assertEqual(str(module.ROOT/'runtime-11111111-2222-4333-8444-555555555555.sock'),peer.path)
    def test_boot_namespace_changes_but_stays_in_same_private_directory(self):
        with patch.object(module.Path,'read_text',return_value='11111111-2222-4333-8444-555555555555\n'):before=module.runtime_socket_path()
        with patch.object(module.Path,'read_text',return_value='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\n'):after=module.runtime_socket_path()
        self.assertNotEqual(before,after);self.assertEqual(module.ROOT,before.parent);self.assertEqual(before.parent,after.parent)
        for invalid in ['','../runtime.sock','A'*36,'11111111-2222-4333-8444-555555555555/../runtime.sock']:
            with patch.object(module.Path,'read_text',return_value=invalid):
                with self.assertRaises(ValueError):module.runtime_socket_path()
    def test_oversize_frame_is_rejected_before_socket_creation(self):
        with patch.object(module.socket,'socket') as create:
            with self.assertRaises(ValueError):module.runtime_request({'input':'x'*24000})
            create.assert_not_called()
if __name__=='__main__':unittest.main()
