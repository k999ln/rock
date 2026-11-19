"""Stage an existing owner debug APK source for an isolated localhost Eve session.

Preserves the source checkout, production session, signing key, Linux jobs and models.
The owner must approve a new device grant in the private Web UI before it can execute.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent


def replace_once(path, old, new):
    text = path.read_text()
    if text.count(old) != 1:
        raise ValueError('Review current source before staging: ' + str(path.name))
    path.write_text(text.replace(old, new))


def stage_private_authorization(output):
    """Keep the normal HTTPS contract; opt in only on the isolated debug realm."""
    flow = output / 'shell/src/debug/java/dev/rock/core/platform/RockstarDeviceAuthorizationFlow.java'
    replace_once(flow, 'private final SessionStore sessions;', 'private final SessionStore sessions;\n    private final boolean debugUsbPreview;')
    replace_once(flow,
        'public RockstarDeviceAuthorizationFlow(HttpTransport http, SessionStore sessions) {',
        'public RockstarDeviceAuthorizationFlow(HttpTransport http, SessionStore sessions) {this(http,sessions,false); }\n    public RockstarDeviceAuthorizationFlow(HttpTransport http, SessionStore sessions, boolean debugUsbPreview) {\n        this.debugUsbPreview = debugUsbPreview;')
    replace_once(flow, 'private static URI uri(String value)', 'private URI uri(String value)')
    replace_once(flow, 'if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null ||',
        'boolean usb = debugUsbPreview && "http".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && uri.getPort() == 5199;\n            if ((!usb && !"https".equalsIgnoreCase(uri.getScheme())) || uri.getHost() == null ||')
    replace_once(flow, 'uri.getUserInfo() != null || uri.getPort() != -1 && uri.getPort() != 443)',
        'uri.getUserInfo() != null || !usb && uri.getPort() != -1 && uri.getPort() != 443)')
    replace_once(output / 'shell/src/debug/java/dev/rock/shell/EveAccountSync.java',
        '},sessions(c));pending=flow.begin(', '},sessions(c),EvePrivatePreview.selected(c));pending=flow.begin(')


def stage_private_storage(output):
    target = output / 'shell/src/debug/java/dev/rock/shell'
    # Every constructor caller, including captured portable account bindings, uses the same realm.
    replace_once(target / 'EveAccountSessionStore.java',
        'this.file = storage == null ? new AtomicFile(new File(directory, FILE_NAME)) : storage;',
        'if (storage == null) storage = EvePrivatePreview.session(context, origin);\n        this.file = storage == null ? new AtomicFile(new File(directory, FILE_NAME)) : storage;')
    journal = target / 'EvePortableClaimJournal.java'
    replace_once(journal,
        'String device, KeySource keys, CommitProbe probe) throws Exception {',
        'String device, KeySource keys, CommitProbe probe) throws Exception {\n        this(directory,packageName,origin,owner,device,keys,probe,false);\n    }\n    EvePortableClaimJournal(Path directory,String packageName,String origin,String owner,String device,KeySource keys,CommitProbe probe,boolean debugUsbPreview) throws Exception {')
    replace_once(journal, '&& validOrigin(origin) && keys != null && probe != null);',
        '&& (validOrigin(origin) || debugUsbPreview && "http://localhost:5199".equals(origin)) && keys != null && probe != null);')
    replace_once(target / 'EvePortableJournalKeys.java',
        'return EveAccountSessionStore.existingJournalKey();\n            });',
        'return EveAccountSessionStore.existingJournalKey();\n            }, () -> {}, EvePrivatePreview.selected(app));')


def stage_private_entrypoints(output):
    """Keep all owner preview work entries in the current Web Eve, never the retired native work UI."""
    activity = output / 'shell/src/debug/java/dev/rock/shell/RockstarOsActivity.java'
    text = activity.read_text()
    if 'button(body, "Eveで依頼・成果・停止を開く", () -> open("/os/eve"));' not in text or 'new Intent(this, SkyLinuxActivity.class)' in text or 'new Intent(this, MainActivity.class)' in text:
        raise ValueError('Review current owner preview work entries')
    replace_once(activity,
        'private void choosePrivatePreview(boolean preview) {',
        'private void choosePrivatePreview(boolean preview) {\n        if (preview && EvePrivatePreview.selected(this)) { open("/os/eve"); return; }')
    replace_once(activity, 'private void open(String path) {',
        'private void open(String path) {\n        if (EvePrivatePreview.selected(this) && "/os/eve".equals(path)) path = "/os/eve/module";')
    account = output / 'shell/src/debug/java/dev/rock/shell/EveAccountActivity.java'
    replace_once(account,
        'startActivity(new Intent(this,EveLinuxActivity.class).putExtra("threadId",id).putExtra("context",carry));',
        'startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(EveAccountSync.endpoint(this)+(EvePrivatePreview.selected(this)?"/os/eve/module":"/os/eve")+"?thread="+Uri.encode(id))));')
    manifest = output / 'shell/src/debug/AndroidManifest.xml'
    replace_once(manifest, '        <activity android:name=".EveLinuxActivity" android:exported="false" />\n', '')
    replace_once(manifest, '        <activity android:name=".SkyLinuxActivity" android:exported="false" android:launchMode="singleTop" />\n', '')
    replace_once(manifest,
        '<activity android:name=".MainActivity" android:exported="true"><intent-filter tools:node="removeAll" /></activity>',
        '<activity android:name=".MainActivity" tools:node="remove" />')


def stage(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    java = 'shell/src/debug/java/dev/rock/shell'
    if output.exists() or not (source / java / 'EveAccountSync.java').is_file():
        raise ValueError('Use an existing reviewed owner debug source and a new staging directory.')
    shutil.copytree(source, output, ignore=shutil.ignore_patterns('build', '.gradle', '.git'))
    if (source.parent / 'contracts').is_dir() and not (output.parent / 'contracts').exists():
        shutil.copytree(source.parent / 'contracts', output.parent / 'contracts')
    target = output / java
    for resource in ['drawable-nodpi/company_mark.png', 'drawable/launcher_foreground.xml',
                     'mipmap-anydpi-v26/ic_launcher.xml', 'values/branding.xml']:
        destination = output / 'shell/src/main/res' / resource
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / 'android/shell/src/main/res' / resource, destination)
    for name in ['EvePrivatePreview.java', 'RockstarOsActivity.java', 'PixelHostPrerequisites.java']:
        shutil.copy2(ROOT / 'toolkits/sky-linux-local/common-ui-src' / name, target / name)
    subprocess.run(['patch', '--batch', '-p1', '-d', str(output), '-i',
                    str(ROOT / 'toolkits/sky-linux-local/private-preview.patch')], check=True)
    replace_once(target / 'EveAccountSync.java',
        'return new EveAccountSessionStore(c,endpoint(c));',
        'return new EveAccountSessionStore(c,endpoint(c),EvePrivatePreview.session(c,endpoint(c)));')
    replace_once(target / 'EvePendingAuthorizationStore.java',
        'new File(dir,"eve-pending-authorization-v1.bin")',
        'new File(dir,EvePrivatePreview.ORIGIN.equals(origin)?"private-eve-pending-v1.bin":"eve-pending-authorization-v1.bin")')
    activity = target / 'EveAccountActivity.java'
    replace_once(activity, 'EveAccountSync.begin(this,ACCOUNT_ORIGIN)', 'EveAccountSync.begin(this,EveAccountSync.endpoint(this))')
    replace_once(activity, 'private void openAccount(String userCode){',
        'private void openAccount(String userCode){if(EvePrivatePreview.selected(this)){startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(EvePrivatePreview.ORIGIN+"/connect/device?user_code="+userCode)));return;}')
    replace_once(activity, 'setContentView(scroll);', 'setContentView(scroll);if(EvePrivatePreview.selected(this)){text(body,"本人PCだけの試用接続です。通常サイトとは接続情報を分けて扱います。Web画面で許可するまで仕事は実行できません。",15);}')
    replace_once(activity, 'text(body,"会員登録・ログイン",26)', 'text(body,EvePrivatePreview.selected(this)?"このPCとの接続":"会員登録・ログイン",26)')
    replace_once(activity, '"Webで会員登録・ログイン",()->work', '(EvePrivatePreview.selected(this)?"PCとの接続を確認する":"Webで会員登録・ログイン"),()->work')
    replace_once(activity, 'text(body,"Webでパスキーを使って登録・ログインします。同じアカウントの会話・選んだ仕事・成果をこのPixelでも使えます。",15)',
        'text(body,EvePrivatePreview.selected(this)?"USBでつないだPC内の試用アカウントへ接続します。通常サイトとは別の試験用接続です。":"Webでパスキーを使って登録・ログインします。同じアカウントの会話・選んだ仕事・成果をこのPixelでも使えます。",15)')
    replace_once(activity, 'EveAccountSync.endpoint(this)+"/os/eve"', 'EveAccountSync.endpoint(this)+(EvePrivatePreview.selected(this)?"/os/eve/module":"/os/eve")')
    stage_private_authorization(output)
    stage_private_storage(output)
    stage_private_entrypoints(output)
    test = output / 'shell/src/test/java/dev/rock/shell/EvePrivatePreviewTest.java'
    test.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'toolkits/sky-linux-local/owner-jvm-tests/dev/rock/shell/EvePrivatePreviewTest.java', test)
    for name in ['EvePrivateRealmStorageTest.java', 'EvePrivateWorkPreservationTest.java']:
        physical_test = output / 'shell/src/androidTest/java/dev/rock/shell' / name
        physical_test.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / 'toolkits/sky-linux-local/owner-tests/dev/rock/shell' / name, physical_test)
    return {'source': str(source), 'output': str(output), 'privateOrigin': 'http://localhost:5199',
        'newSigningKeys': False, 'newDevicePermissions': False, 'productionSessionCopied': False,
        'newGrantRequiresOwnerApproval': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    print(json.dumps(stage(args.source, args.output), ensure_ascii=False))
