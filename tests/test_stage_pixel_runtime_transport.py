import importlib.util
from pathlib import Path
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('stage_transport',ROOT/'scripts/stage-pixel-runtime-transport.py')
stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)
SOURCE='''private volatile String peer="",stage="starting",lastError="",protocol="";
.put("protocol",instance.protocol)
JSONObject hello=read(socket.getInputStream());if(!"sky.pixel-linux-bridge/1".equals(hello.optString("schema")))throw new IOException("Protocol mismatch");
if(!task.command.optString("action").startsWith("export")&&!"sky.private-linux-deployment/1".equals(value.optString("schema")))throw new IOException("Response schema mismatch");
finally{peer="";}
'''
class StageTests(unittest.TestCase):
 def fixture(self,root):
  a=root/'android';d=a/'shell/src/debug/java/dev/rock/shell';d.mkdir(parents=True);(d/'SkyLinuxBridge.java').write_text(SOURCE)
  r=a/'shell/src/main/AndroidManifest.xml';r.parent.mkdir(parents=True);r.write_text('<manifest/>');return a,d,r
 def test_stage_is_debug_only_and_refuses_repeat(self):
  with tempfile.TemporaryDirectory() as folder:
   a,d,r=self.fixture(Path(folder));before=r.read_bytes();result=stage.stage(a)
   self.assertTrue(result['releaseManifestUnchanged']);self.assertFalse(result['credentialBridge']);self.assertFalse(result['newPermissions']);self.assertEqual(before,r.read_bytes());self.assertTrue((d/'PixelPortableBridgeProtocol.java').is_file());self.assertIn('PixelPortableBridgeProtocol.validate',(d/'SkyLinuxBridge.java').read_text())
   existing=(d/'SkyLinuxBridge.java').read_bytes()
   with self.assertRaises(ValueError):stage.stage(a)
   self.assertEqual(existing,(d/'SkyLinuxBridge.java').read_bytes())
 def test_unknown_native_source_is_not_overwritten(self):
  with tempfile.TemporaryDirectory() as folder:
   a,d,r=self.fixture(Path(folder));p=d/'SkyLinuxBridge.java';p.write_text(SOURCE.replace('Protocol mismatch','different'));before=p.read_bytes()
   with self.assertRaises(ValueError):stage.stage(a)
   self.assertEqual(before,p.read_bytes());self.assertFalse((d/'PixelPortableBridgeProtocol.java').exists())
if __name__=='__main__':unittest.main()
