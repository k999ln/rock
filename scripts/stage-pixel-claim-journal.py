"""Stage debug-only portable claim persistence. Does not connect or install a controller."""
from pathlib import Path
import argparse
import hashlib
import json
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'toolkits/sky-linux-local'


def stage(android):
    target = android / 'shell/src/debug/java/dev/rock/shell'
    session = target / 'EveAccountSessionStore.java'
    gradle = android / 'shell/build.gradle'
    release = android / 'shell/src/main/AndroidManifest.xml'
    bridge = target / 'SkyLinuxBridge.java'
    untouched = {release: release.read_bytes(), bridge: bridge.read_bytes()}
    files = {target / name: SOURCE / 'common-ui-src' / name for name in [
        'EvePortableCommands.java', 'EvePortableClaimJournal.java', 'EvePortableJournalKeys.java']}
    files[android / 'shell/src/test/java/dev/rock/shell/EvePortableClaimJournalTest.java'] = SOURCE / 'owner-jvm-tests/dev/rock/shell/EvePortableClaimJournalTest.java'
    files[android.parent / 'contracts/portable-command-fixture.json'] = SOURCE / 'owner-jvm-tests/portable-command-fixture.json'
    anchor = '    static SecretKey key() throws Exception {'
    text = session.read_text()
    if text.count(anchor) != 1 or 'existingJournalKey' in text or '"eve-account-session-aes-v1"' not in text:
        raise ValueError('review existing account key source; refusing overwrite')
    if not (target / 'PixelPortableBridgeProtocol.java').is_file():
        raise ValueError('stage the accepted private transport first')
    if any(p.exists() for p in files):
        raise ValueError('claim journal file already exists; refusing overwrite')
    old = "include 'sky-language-fixture.json'"
    build = gradle.read_text()
    if build.count(old) != 1 or 'portable-command-fixture' in build:
        raise ValueError('review test resource source before staging')
    # The original session key creator stays unchanged. This separate accessor never creates keys.
    method = '''    static SecretKey existingJournalKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) throw new java.io.IOException("PORTABLE_JOURNAL_KEY_MISSING");
        java.security.Key existing = store.getKey(ALIAS, null);
        if (!(existing instanceof SecretKey)) throw new java.io.IOException("PORTABLE_JOURNAL_KEY_INVALID");
        return (SecretKey) existing;
    }

'''
    session.write_text(text.replace(anchor, method + anchor, 1))
    gradle.write_text(build.replace(old, "include 'sky-language-fixture.json', 'portable-command-fixture.json'", 1))
    for destination, source in files.items():
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source.read_bytes())
    assert all(p.read_bytes() == data for p, data in untouched.items())
    report = {'schema': 'rockstaros.pixel-claim-journal-stage/1', 'installed': False,
              'controllerConnected': False, 'newKeyCreation': False, 'releaseManifestUnchanged': True,
              'bridgeUnchanged': True, 'filesSha256': {str(p.relative_to(android.parent)):
                  hashlib.sha256(p.read_bytes()).hexdigest() for p in [session, gradle, *files]}}
    (android.parent / 'portable-claim-journal-stage.json').write_text(json.dumps(report, indent=2) + '\n')
    return report

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--android', type=Path, required=True)
    print(json.dumps(stage(parser.parse_args().android.resolve()), indent=2))
