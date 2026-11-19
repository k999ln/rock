"""Stage debug mTLS response validation; never installs or touches account data."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
ROOT = Path(__file__).resolve().parents[1]

def stage(android):
    source = android / 'shell/src/debug/java/dev/rock/shell'
    bridge = source / 'SkyLinuxBridge.java'
    release = android / 'shell/src/main/AndroidManifest.xml'
    before = release.read_bytes()
    text = bridge.read_text()
    helper = source / 'PixelPortableBridgeProtocol.java'
    if helper.exists() or 'PixelPortableBridgeProtocol' in text:
        raise ValueError('portable bridge already staged; refusing overwrite')
    replacements = [
      ('private volatile String peer="",stage="starting",lastError="",protocol="";', 'private volatile String peer="",stage="starting",lastError="",protocol="";\n    private volatile boolean portableRuntime;'),
      ('.put("protocol",instance.protocol)', '.put("protocol",instance.protocol).put("portableRuntime",instance.portableRuntime)'),
      ('JSONObject hello=read(socket.getInputStream());if(!"sky.pixel-linux-bridge/1".equals(hello.optString("schema")))throw new IOException("Protocol mismatch");', 'JSONObject hello=read(socket.getInputStream());if(!"sky.pixel-linux-bridge/1".equals(hello.optString("schema")))throw new IOException("Protocol mismatch");portableRuntime=PixelPortableBridgeProtocol.advertised(hello);'),
      ('if(!task.command.optString("action").startsWith("export")&&!"sky.private-linux-deployment/1".equals(value.optString("schema")))throw new IOException("Response schema mismatch");', 'if(PixelPortableBridgeProtocol.isRuntime(task.command)){if(!portableRuntime)throw new IOException("Portable runtime unsupported");PixelPortableBridgeProtocol.validate(task.command,value);}else if(!task.command.optString("action").startsWith("export")&&!"sky.private-linux-deployment/1".equals(value.optString("schema")))throw new IOException("Response schema mismatch");'),
      ('finally{peer="";}', 'finally{peer="";portableRuntime=false;}'),
    ]
    for old,new in replacements:
        if text.count(old) != 1:
            raise ValueError('review native bridge before staging: '+old[:70])
        text=text.replace(old,new,1)
    fixture=ROOT/'toolkits/sky-linux-local/owner-jvm-tests/dev/rock/shell/PixelPortableBridgeProtocolTest.java'
    test=android/'shell/src/test/java/dev/rock/shell/PixelPortableBridgeProtocolTest.java'
    if test.exists():raise ValueError('portable protocol tests already present')
    commands=source/'EvePortableCommands.java'
    commands_source=ROOT/'toolkits/sky-linux-local/common-ui-src/EvePortableCommands.java'
    if commands.exists() and commands.read_bytes()!=commands_source.read_bytes():
        raise ValueError('review command serializer before staging; refusing overwrite')
    bridge.write_text(text)
    shutil.copyfile(ROOT/'toolkits/sky-linux-local/common-ui-src/PixelPortableBridgeProtocol.java',helper)
    if not commands.exists():shutil.copyfile(commands_source,commands)
    test.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(fixture,test)
    assert release.read_bytes()==before
    report={'schema':'rockstaros.pixel-runtime-transport-stage/1','releaseManifestUnchanged':True,'installed':False,'newPermissions':False,'credentialBridge':False,'newSigningKeys':False,'filesSha256':{str(p.relative_to(android)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [bridge,helper,commands,test]}}
    (android.parent/'portable-transport-stage.json').write_text(json.dumps(report,indent=2)+'\n')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--android',type=Path,required=True)
    print(json.dumps(stage(parser.parse_args().android.resolve()),indent=2))
