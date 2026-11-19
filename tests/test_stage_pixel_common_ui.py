"""No device, credentials, downloads or inference. Check the owner overlay's boundaries."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('stage_pixel_common_ui', ROOT / 'scripts/stage-pixel-common-ui.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StagePixelCommonUiTest(unittest.TestCase):
    def fixture(self, directory):
        android = Path(directory) / 'android'
        shell = android / 'shell/src'
        src = shell / 'debug/java/dev/rock/shell'
        src.mkdir(parents=True)
        (shell / 'main').mkdir()
        (shell / 'main/AndroidManifest.xml').write_text('<manifest><application /></manifest>')
        (shell / 'debug/AndroidManifest.xml').write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:label="RockstarOS"><activity android:name=".SkyLinuxActivity" /></application>\n</manifest>')
        for name in ['SkyLinuxActivity', 'EveLinuxActivity', 'SkyLinuxBridge', 'EveAccountActivity', 'EveAccountSessionStore']:
            (src / (name + '.java')).write_text('// preserved ' + name)
        (src / 'EveAccountSync.java').write_text('''class EveAccountSync {
    static void sync(Context c,JSONObject snapshot)throws Exception {
        request(c,"/api/eve/device-sync","PUT",null,true);
        JSONObject remote=request(c,"/api/eve/device-sync","GET",null,true);
        if(!jobs.has(id))continue;JSONObject old=null;
            JSONObject result=SkyLinuxBridge.request(c,command);
            request(c,"/api/eve/device-sync","PUT",null,true);
            request(c,"/api/eve/device-sync","PUT",null,true);
    }
}''')
        return android, src

    def test_stages_only_debug_and_preserves_all_existing_runtime_classes(self):
        with tempfile.TemporaryDirectory() as directory:
            android, source = self.fixture(directory)
            old = {p: p.read_bytes() for p in source.glob('*.java') if p.name != 'EveAccountSync.java'}
            release = (android / 'shell/src/main/AndroidManifest.xml').read_bytes()
            report = module.stage(android)
            self.assertTrue(report['releaseManifestUnchanged'])
            self.assertEqual((ROOT / 'toolkits/sky-linux-local/common-ui-res/drawable-nodpi/company_mark.png').read_bytes(), (android / 'shell/src/debug/res/drawable-nodpi/company_mark.png').read_bytes())
            self.assertFalse(report['cookieOrCredentialBridge'])
            self.assertIsNone(report['foregroundSyncSessionMinutes'])
            self.assertEqual('android-dataSync', report['foregroundSyncLimit'])
            self.assertEqual(release, (android / 'shell/src/main/AndroidManifest.xml').read_bytes())
            for p, data in old.items(): self.assertEqual(data, p.read_bytes())
            manifest = (android / 'shell/src/debug/AndroidManifest.xml').read_text()
            self.assertIn('android:exported="false" android:foregroundServiceType="dataSync"', manifest)
            self.assertIn('tools:node="removeAll"', manifest)
            self.assertIn('syncForeground', (source / 'EveAccountSync.java').read_text())

    def test_refuses_existing_overlay_without_overwriting(self):
        with tempfile.TemporaryDirectory() as directory:
            android, source = self.fixture(directory)
            module.stage(android)
            before = {p: p.read_bytes() for p in source.glob('*.java')}
            with self.assertRaisesRegex(ValueError, 'already staged'): module.stage(android)
            for p, data in before.items(): self.assertEqual(data, p.read_bytes())

    def test_missing_bridge_fails_before_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            android, source = self.fixture(directory)
            (source / 'SkyLinuxBridge.java').unlink()
            before = (android / 'shell/src/debug/AndroidManifest.xml').read_bytes()
            with self.assertRaisesRegex(ValueError, 'restore native bridge'): module.stage(android)
            self.assertFalse((source / 'RockstarOsActivity.java').exists())
            self.assertEqual(before, (android / 'shell/src/debug/AndroidManifest.xml').read_bytes())

    def test_changed_sync_contract_fails_before_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            android, source = self.fixture(directory)
            (source / 'EveAccountSync.java').write_text('// different protocol')
            with self.assertRaisesRegex(ValueError, 'sync source differs'): module.stage(android)
            self.assertFalse((source / 'RockstarOsActivity.java').exists())

    def test_browser_has_no_native_javascript_or_token_bridge(self):
        activity = (ROOT / 'toolkits/sky-linux-local/common-ui-src/RockstarOsActivity.java').read_text()
        for forbidden in ['WebView', 'addJavascriptInterface', 'authorizationHeader(', 'CookieManager', 'setJavaScriptEnabled']:
            self.assertNotIn(forbidden, activity)
        self.assertIn('Uri.parse("https://avoado.si" + path)', activity)
        self.assertIn('if (saved == null && !settingsScreen) open("/os/eve");', activity)
        self.assertIn('"端末の設定"', activity)
        self.assertIn('if(settingsScreen) main.post(refresh)', activity)
        self.assertNotIn('new Intent(this, SkyLinuxActivity.class)', activity)
        self.assertIn('Eveで依頼・成果・停止を開く', activity)

    def test_changed_dispatch_operation_fails_before_any_overlay_write(self):
        with tempfile.TemporaryDirectory() as directory:
            android, source = self.fixture(directory)
            p = source / 'EveAccountSync.java'
            p.write_text(p.read_text().replace('JSONObject result=SkyLinuxBridge.request(c,command);', 'JSONObject result=anotherDispatcher(command);'))
            before = {f: f.read_bytes() for f in source.glob('*.java')}
            with self.assertRaisesRegex(ValueError, 'stop fences'): module.stage(android)
            self.assertFalse((source / 'RockstarOsActivity.java').exists())
            for f, data in before.items(): self.assertEqual(data, f.read_bytes())

    def test_service_is_bounded_and_does_not_start_models_or_create_work(self):
        service = (ROOT / 'toolkits/sky-linux-local/common-ui-src/EvePixelHostService.java').read_text()
        for required in ['START_NOT_STICKY', 'onTimeout(', 'stopSelf()', 'polling.decrementAndGet()', 'idle()', 'isDeviceLocked()', 'syncForeground', 'worker.shutdownNow()']:
            self.assertIn(required, service)
        for forbidden in ['WakeLock', 'BOOT_COMPLETED', 'stop-environment', 'put("action", "run")', 'put("action", "prepare")']:
            self.assertNotIn(forbidden, service)

    def test_missing_identity_cannot_turn_entry_into_key_enrollment(self):
        source = (ROOT / 'toolkits/sky-linux-local/common-ui-src/PixelHostPrerequisites.java').read_text()
        self.assertIn('store.containsAlias("sky-linux-bridge-ec-v1")', source)
        self.assertIn('store.containsAlias("eve-account-session-aes-v1")', source)
        self.assertIn('!"https://avoado.si".equals(EveAccountSync.endpoint(context))', source)
        for forbidden in ['KeyGenerator', 'KeyPairGenerator', 'generateKey', 'setEntry', 'deleteEntry']:
            self.assertNotIn(forbidden, source)
        for name in ['RockstarOsActivity.java', 'EvePixelHostService.java']:
            text = (ROOT / 'toolkits/sky-linux-local/common-ui-src' / name).read_text()
            self.assertNotIn('if (EveAccountSync.linked(', text)
            self.assertIn('PixelHostPrerequisites.available(this)', text)


if __name__ == '__main__': unittest.main()
