"""Stage the shared UI entry only on an already restored owner debug source.

Never changes the release manifest, account/Keystore data, or signing identity.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
COMMON_SOURCES = ['RockstarOsActivity.java', 'EvePixelHostService.java', 'PixelHostPrerequisites.java']
SYNC_METHOD = '''    /** Foreground poll shares the same exclusion as the existing Activity sync. */
    static boolean syncForeground(Context c,JSONObject snapshot,java.util.function.BooleanSupplier continuing)throws Exception {
        synchronized(EveAccountSync.class){if(syncing)return false;syncing=true;}
        try{sync(c,snapshot,continuing);notice="同期済み。同じアカウントでWebから続きを使えます。";return true;}
        finally{synchronized(EveAccountSync.class){syncing=false;}}
    }
'''
SYNC_GUARD = '''    private static void continueSync(java.util.function.BooleanSupplier continuing)throws IOException {
        if(!continuing.getAsBoolean())throw new IOException("Foreground sync stopped; retain the same job for readback");
    }
    static void sync(Context c,JSONObject snapshot)throws Exception {sync(c,snapshot,()->true);}
    private static void sync(Context c,JSONObject snapshot,java.util.function.BooleanSupplier continuing)throws Exception {
        continueSync(continuing);
'''


def stage(android: Path):
    debug = android / 'shell/src/debug'
    source = debug / 'java/dev/rock/shell'
    manifest = debug / 'AndroidManifest.xml'
    release = android / 'shell/src/main/AndroidManifest.xml'
    sync = source / 'EveAccountSync.java'
    before_release = release.read_bytes()
    for name in ['SkyLinuxActivity.java', 'EveLinuxActivity.java', 'SkyLinuxBridge.java', 'EveAccountActivity.java', 'EveAccountSessionStore.java']:
        if not (source / name).is_file():
            raise ValueError('restore native bridge/account patches first: ' + name)
    if any((source / name).exists() for name in COMMON_SOURCES):
        raise ValueError('common UI already staged; refusing an unreviewed overwrite')
    text = sync.read_text()
    anchor = '    static void sync(Context c,JSONObject snapshot)throws Exception {'
    if text.count(anchor) != 1 or 'syncForeground(' in text:
        raise ValueError('account sync source differs; review before staging')
    doc = ET.fromstring(manifest.read_text())
    if not any('SkyLinuxActivity' in element.attrib.get('{http://schemas.android.com/apk/res/android}name', '') for element in doc.iter()):
        raise ValueError('native debug manifest not restored')
    updated = manifest.read_text().replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android">', '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">', 1)
    if 'xmlns:tools=' not in updated or updated.count('</application>') != 1:
        raise ValueError('review debug manifest format')
    updated = updated.replace('    <application ', '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />\n    <application ', 1)
    updated = updated.replace('</application>', '''    <!-- This override applies only to the owner debug preview. -->
        <activity android:name=".MainActivity" android:exported="true"><intent-filter tools:node="removeAll" /></activity>
        <activity android:name=".RockstarOsActivity" android:exported="true">
            <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter>
            <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.HOME" /><category android:name="android.intent.category.DEFAULT" /></intent-filter>
        </activity>
        <service android:name=".EvePixelHostService" android:exported="false" android:foregroundServiceType="dataSync" />
    </application>''', 1)
    ET.fromstring(updated)
    guarded = text.replace(anchor, SYNC_METHOD + SYNC_GUARD, 1)
    # Stop new account operations/dispatch between in-flight I/O operations. An already
    # delivered command is still reconciled by the existing request ID, never relabeled cancelled.
    for operation in ['\n        request(c,"/api/eve/device-sync","PUT"', '\n        JSONObject remote=request(c,"/api/eve/device-sync","GET"']:
        if guarded.count(operation) != 1:
            raise ValueError('review account sync operation before adding the stop fence')
        guarded = guarded.replace(operation, '\n        continueSync(continuing);' + operation, 1)
    fences = [
        ('if(!jobs.has(id))continue;JSONObject old=', 'if(!jobs.has(id))continue;continueSync(continuing);JSONObject old=', 1),
        ('            JSONObject result=SkyLinuxBridge.request(c,command);', '            continueSync(continuing);JSONObject result=SkyLinuxBridge.request(c,command);', 1),
        ('\n            request(c,"/api/eve/device-sync","PUT"', '\n            continueSync(continuing);request(c,"/api/eve/device-sync","PUT"', 2),
    ]
    for original, replacement, count in fences:
        if guarded.count(original) != count:
            raise ValueError('review account dispatch/report/ack stop fences before staging')
        guarded = guarded.replace(original, replacement)
    resources = ROOT / 'toolkits/sky-linux-local/common-ui-res'
    for asset in resources.rglob('*'):
        if asset.is_file():
            destination = debug / 'res' / asset.relative_to(resources)
            if destination.exists() and destination.read_bytes() != asset.read_bytes():
                raise ValueError('review existing debug branding before overwrite')
    for name in COMMON_SOURCES:
        shutil.copy2(ROOT / 'toolkits/sky-linux-local/common-ui-src' / name, source / name)
    resources = ROOT / 'toolkits/sky-linux-local/common-ui-res'
    for asset in resources.rglob('*'):
        if asset.is_file():
            destination = debug / 'res' / asset.relative_to(resources)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(asset, destination)
    sync.write_text(guarded)
    manifest.write_text(updated)
    assert release.read_bytes() == before_release
    report = {'schema': 'rockstaros.pixel-common-ui-stage/1', 'releaseManifestUnchanged': True,
              'browserOrigin': 'https://avoado.si', 'cookieOrCredentialBridge': False,
              'newSigningKeys': False, 'foregroundSyncSessionMinutes': None, 'foregroundSyncLimit': 'android-dataSync',
              'filesSha256': {str(p.relative_to(android)): hashlib.sha256(p.read_bytes()).hexdigest()
                              for p in [manifest, sync, *(source / name for name in COMMON_SOURCES)]}}
    (android.parent / 'common-ui-stage.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--android', type=Path, required=True)
    print(json.dumps(stage(parser.parse_args().android.resolve()), indent=2))
