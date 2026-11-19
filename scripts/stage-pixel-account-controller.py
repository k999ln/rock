"""Connect the debug common account controller in a reviewed journal candidate; never install."""
from pathlib import Path
import json
import hashlib
import argparse
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'toolkits/sky-linux-local'

def stage(android):
    base=android.parent
    prior=json.loads((base/'portable-claim-journal-stage.json').read_text())
    if (base/'portable-account-controller-stage.json').exists():raise ValueError('controller already staged; refusing overwrite')
    if any(hashlib.sha256((base/p).read_bytes()).hexdigest()!=h for p,h in prior['filesSha256'].items()):raise ValueError('journal candidate drift; review before staging')
    target=android/'shell/src/debug/java/dev/rock/shell'
    sync=target/'EveAccountSync.java';bridge=target/'SkyLinuxBridge.java';service=target/'EvePixelHostService.java'
    release=android/'shell/src/main/AndroidManifest.xml';release_before=release.read_bytes()
    changes={}
    def replace(path,pairs):
        text=path.read_text()
        for old,new in pairs:
            if text.count(old)!=1:raise ValueError('review native source before staging: '+old[:65])
            text=text.replace(old,new,1)
        changes[path]=text.encode()
    offline='''    private static String portableNotice() {
        return "既存の履歴を同期しました。"+(EvePortableAccountSync.notice.isEmpty()?"":"\\n"+EvePortableAccountSync.notice);
    }
    static boolean reconcilePortableForeground(Context c,java.util.function.BooleanSupplier continuing)throws Exception {
        synchronized(EveAccountSync.class){if(syncing)return false;syncing=true;}
        try{return EvePortableAccountSync.sync(c,null,continuing);}
        finally{synchronized(EveAccountSync.class){syncing=false;}}
    }
'''
    replace(sync,[
      ('sync(c,snapshot);notice="同期済み。同じアカウントでWebから続きを使えます。";', 'sync(c,snapshot);notice=portableNotice();'),
      ('sync(c,snapshot,continuing);notice="同期済み。同じアカウントでWebから続きを使えます。";', 'sync(c,snapshot,continuing);notice=portableNotice();'),
      ('    private static void continueSync(',offline+'    private static void continueSync('),
      ('        final boolean contextSupported=', '        EvePortableAccountSync.sync(c,snapshot,continuing);\n        continueSync(continuing);\n        final boolean contextSupported='),
      ('static synchronized void disconnect(Context c){sessions(c).clearLocal();', 'static synchronized void disconnect(Context c){sessions(c).clearLocal();EvePortableAccountSync.requestStop(c);'),
      ('if(syncing||!linked(c)||android.os.SystemClock.elapsedRealtime()-lastTick<3500)', 'if(!linked(c)){EvePortableAccountSync.requestStop(c);return;}if(syncing||android.os.SystemClock.elapsedRealtime()-lastTick<3500)')])
    replace(bridge,[('byte[] bytes=(value.toString()+"\\n").getBytes(StandardCharsets.UTF_8);','byte[] bytes=((value.optJSONObject("command")!=null&&PixelPortableBridgeProtocol.isRuntime(value.optJSONObject("command"))?EvePortableCommands.canonical(value):value.toString())+"\\n").getBytes(StandardCharsets.UTF_8);')])
    replace(service,[('                JSONObject snapshot = SkyLinuxBridge.request(this, new JSONObject().put("action", "status"));','''                // Account-only publication recovery does not require a running Linux guest.
                checking = "アカウント同期";
                boolean recovered = EveAccountSync.reconcilePortableForeground(this, () -> !closed);
                checking = "Linux接続";
                JSONObject snapshot;
                try { snapshot = SkyLinuxBridge.request(this, new JSONObject().put("action", "status")); }
                catch (Exception linuxUnavailable) {
                    if (!recovered) throw linuxUnavailable;
                    lastConfirmedAt = System.currentTimeMillis();
                    message = "仕事の状態をアカウントへ同期しました。Linuxの接続は未確認です。";
                    if (!closed) getSystemService(NotificationManager.class).notify(NOTICE, notification());
                    return;
                }'''),
      ('if (!PixelHostPrerequisites.available(this) || !EveAccountSync.linked(this)) { stopSelf(); return START_NOT_STICKY; }',
       'if (!PixelHostPrerequisites.available(this) || !EveAccountSync.linked(this)) { EvePortableAccountSync.requestStop(this); stopSelf(); return START_NOT_STICKY; }'),
      ('message = "アカウント接続を再確認してください。保存済みデータは残っています。";',
       'message = "アカウント接続を再確認してください。保存済みデータは残っています。";\n                EvePortableAccountSync.requestStop(this);')])
    names=['EvePortableAgentPreparation.java','EvePortableController.java','EvePortableHttpClient.java','EvePortableAccountBinding.java','EvePortableAccountSync.java','EvePortableStopHandles.java']
    for name in names:
        dest=target/name
        if dest.exists():raise ValueError('controller file collision: '+name)
        changes[dest]=(SOURCE/'common-ui-src'/name).read_bytes()
    # Only the frozen journal helper revisions are replaced; accepted APK snapshots stay intact.
    for name in ['EvePortableCommands.java','EvePortableClaimJournal.java']:
        changes[target/name]=(SOURCE/'common-ui-src'/name).read_bytes()
    for destination, source in [
        (android/'shell/src/test/java/dev/rock/shell/EvePortableAgentPreparationTest.java',SOURCE/'owner-jvm-tests/dev/rock/shell/EvePortableAgentPreparationTest.java'),
        (android/'shell/src/test/java/dev/rock/shell/EvePortableClaimJournalTest.java',SOURCE/'owner-jvm-tests/dev/rock/shell/EvePortableClaimJournalTest.java'),
        (base/'contracts/portable-command-fixture.json',SOURCE/'owner-jvm-tests/portable-command-fixture.json')]:
        if destination.exists() and str(destination.relative_to(base)) not in prior['filesSha256']:
            raise ValueError('unreviewed journal test/fixture collision')
        changes[destination]=source.read_bytes()
    test=android/'shell/src/test/java/dev/rock/shell/EvePortableControllerTest.java'
    if test.exists():raise ValueError('controller test collision')
    changes[test]=(SOURCE/'owner-jvm-tests/dev/rock/shell/EvePortableControllerTest.java').read_bytes()
    stop_test=android/'shell/src/test/java/dev/rock/shell/EvePortableStopHandlesTest.java'
    if stop_test.exists():raise ValueError('stop handle test collision')
    changes[stop_test]=(SOURCE/'owner-jvm-tests/dev/rock/shell/EvePortableStopHandlesTest.java').read_bytes()
    for p,data in changes.items():p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    assert release.read_bytes()==release_before
    report={'schema':'rockstaros.pixel-account-controller-stage/1','installed':False,'controllerConnected':True,'newPermissions':False,'newKeysCreated':False,'releaseManifestUnchanged':True,'filesSha256':{str(p.relative_to(base)):hashlib.sha256(data).hexdigest() for p,data in changes.items()}}
    (base/'portable-account-controller-stage.json').write_text(json.dumps(report,indent=2)+'\n')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--android',type=Path,required=True)
    print(json.dumps(stage(parser.parse_args().android.resolve()),indent=2))
