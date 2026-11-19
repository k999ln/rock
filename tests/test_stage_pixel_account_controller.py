import importlib.util
from pathlib import Path
import json
import hashlib
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('controller_stage',ROOT/'scripts/stage-pixel-account-controller.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
SYNC='''    static JSONObject request(Context c,String path,String method,JSONObject body,boolean authenticated)throws Exception {
String base=endpoint(c);origin(base);
String auth=authenticated?sessions(c).authorizationHeader():null;
byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);
if(code==401&&auth!=null){sessions(c).clearIfAuthorizationMatches(auth);
throw new IOException("Account authorization expired");
JSONObject result=new JSONObject(out.toString("UTF-8"));if(code<200||code>=300)throw new IOException(result.optString("error","Account request failed"));return result;
sync(c,snapshot);notice="同期済み。同じアカウントでWebから続きを使えます。";
sync(c,snapshot,continuing);notice="同期済み。同じアカウントでWebから続きを使えます。";
    private static void continueSync(
        final boolean contextSupported=
static synchronized void disconnect(Context c){sessions(c).clearLocal();
if(syncing||!linked(c)||android.os.SystemClock.elapsedRealtime()-lastTick<3500)
'''
class StageTests(unittest.TestCase):
    def fixture(self,base):
        a=base/'android';d=a/'shell/src/debug/java/dev/rock/shell';d.mkdir(parents=True)
        (d/'EveAccountSync.java').write_text(SYNC)
        (d/'SkyLinuxBridge.java').write_text('byte[] bytes=(value.toString()+"\\n").getBytes(StandardCharsets.UTF_8);')
        (d/'EvePixelHostService.java').write_text('''                JSONObject snapshot = SkyLinuxBridge.request(this, new JSONObject().put("action", "status"));
if (!PixelHostPrerequisites.available(this) || !EveAccountSync.linked(this)) { stopSelf(); return START_NOT_STICKY; }
message = "アカウント接続を再確認してください。保存済みデータは残っています。";''')
        for name in ['EvePortableCommands.java','EvePortableClaimJournal.java']:(d/name).write_text('previous accepted revision')
        r=a/'shell/src/main/AndroidManifest.xml';r.parent.mkdir(parents=True);r.write_text('<release/>')
        hashes={str(p.relative_to(base)):hashlib.sha256(p.read_bytes()).hexdigest() for p in a.rglob('*') if p.is_file()}
        (base/'portable-claim-journal-stage.json').write_text(json.dumps({'filesSha256':hashes}));return a,d
    def test_connects_existing_exclusion_captured_http_and_account_only_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            a,d=self.fixture(Path(folder));result=module.stage(a)
            self.assertTrue(result['controllerConnected']);self.assertFalse(result['installed']);self.assertFalse(result['newKeysCreated']);self.assertFalse(result['newPermissions'])
            http=(d/'EveAccountSync.java').read_text();self.assertNotIn('requestCaptured',http);self.assertIn('EvePortableHttpClient',(d/'EvePortableAccountBinding.java').read_text());self.assertIn('EvePortableAccountSync.sync(c,snapshot,continuing)',http)
            service=(d/'EvePixelHostService.java').read_text();self.assertLess(service.index('reconcilePortableForeground'),service.index('SkyLinuxBridge.request'))
            self.assertEqual(2,service.count('EvePortableAccountSync.requestStop(this)'))
            self.assertIn('sessions(c).clearLocal();EvePortableAccountSync.requestStop(c)',http)
            self.assertIn('if(!linked(c)){EvePortableAccountSync.requestStop(c);return;}',http)
            self.assertTrue((d/'EvePortableStopHandles.java').is_file())
            bridge=(d/'SkyLinuxBridge.java').read_text();self.assertIn('isRuntime',bridge);self.assertIn('EvePortableCommands.canonical',bridge);self.assertIn(':value.toString()',bridge)
            self.assertEqual('<release/>',(a/'shell/src/main/AndroidManifest.xml').read_text())
            with self.assertRaises(ValueError):module.stage(a)
    def test_drift_and_unknown_anchor_fail_before_any_write(self):
        for unknown in [False,True]:
            with tempfile.TemporaryDirectory() as folder:
                a,d=self.fixture(Path(folder));p=d/'EveAccountSync.java';p.write_text(p.read_text().replace('        final boolean contextSupported=','changed context anchor'))
                if unknown:
                    prior=Path(folder)/'portable-claim-journal-stage.json';data=json.loads(prior.read_text());data['filesSha256'][str(p.relative_to(Path(folder)))]=hashlib.sha256(p.read_bytes()).hexdigest();prior.write_text(json.dumps(data))
                before={str(p):p.read_bytes() for p in a.rglob('*') if p.is_file()}
                with self.assertRaises(ValueError):module.stage(a)
                self.assertEqual(before,{str(p):p.read_bytes() for p in a.rglob('*') if p.is_file()})
if __name__=='__main__':unittest.main()
