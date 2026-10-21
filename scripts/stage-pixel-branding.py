"""Stage a current Android checkout for a same-signer Pixel branding build.

Never edits the source checkout, enables service setup, or creates signing keys.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


def stage(source, output, root, frontend=False):
    if output.exists() or not (source / 'shell/src/main/AndroidManifest.xml').is_file():
        raise ValueError('existing Android source and a new output directory are required')
    shutil.copytree(source, output, ignore=shutil.ignore_patterns('build', '.gradle', 'local.properties'))
    contracts = source.parent / 'contracts'
    if contracts.is_dir() and not (output.parent / 'contracts').exists():
        shutil.copytree(contracts, output.parent / 'contracts')
    resources = output / 'shell/src/main/res'
    for name in ['drawable-nodpi/company_mark.png', 'drawable/launcher_foreground.xml',
                 'mipmap-anydpi-v26/ic_launcher.xml', 'values/branding.xml', 'values/service_setup.xml']:
        destination = resources / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / 'android/shell/src/main/res' / name, destination)
    activity = output / 'shell/src/main/java/dev/rock/shell/MainActivity.java'
    text = activity.read_text()
    anchor = '        TextView brand = new TextView(this); brand.setText("RockstarOS"); brand.setTextSize(18);'
    text = text.replace('brand.setText("✳  RockstarOS")', 'brand.setText("RockstarOS")')
    if 'companyMark.setImageResource' not in text:
        if text.count(anchor) != 1:
            raise ValueError('review the current header before applying company branding')
        logo = '''        android.widget.ImageView companyMark = new android.widget.ImageView(this);
        companyMark.setImageResource(R.drawable.company_mark);
        companyMark.setContentDescription("avokado 会社ロゴ");
        companyMark.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams companyMarkSize = new LinearLayout.LayoutParams(ui.dp(30), ui.dp(30));
        companyMarkSize.setMarginEnd(ui.dp(10)); header.addView(companyMark, companyMarkSize);
'''
        text = text.replace(anchor, logo + anchor)
    activity.write_text(text)
    shutil.copy2(root / 'android/shell/src/main/java/dev/rock/shell/ServiceSetupActivity.java',
                 output / 'shell/src/main/java/dev/rock/shell/ServiceSetupActivity.java')
    owner_test = output / 'shell/src/androidTest/java/dev/rock/shell/PixelBrandingAcceptanceTest.java'
    owner_test.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / 'toolkits/android-branding/PixelBrandingAcceptanceTest.java', owner_test)
    for name in ['shell/src/main/AndroidManifest.xml', 'shell/src/aosp/AndroidManifest.xml']:
        manifest = output / name
        if not manifest.exists():
            continue
        text = manifest.read_text().replace('android:icon="@drawable/ic_rockstar"', 'android:icon="@mipmap/ic_launcher"')
        text = text.replace('android:label="RockstarOS"', 'android:label="@string/rockstaros_brand_name"')
        if 'dev.rock.permission.START_SERVICE_SETUP' not in text:
            text = text.replace('    <queries>', '    <permission android:name="dev.rock.permission.START_SERVICE_SETUP" android:protectionLevel="signature" />\n    <queries>', 1)
        if '.ServiceSetupActivity"' not in text:
            text = text.replace('        <activity android:name=".MainActivity"', '''        <activity android:name=".ServiceSetupActivity" android:exported="true" android:enabled="@bool/rockstar_service_setup_enabled" android:permission="dev.rock.permission.START_SERVICE_SETUP" />
        <receiver android:name=".ServiceSetupActivity$ProfileResultReceiver" android:exported="false" android:enabled="@bool/rockstar_service_setup_enabled" />
        <activity android:name=".MainActivity"''', 1)
        manifest.write_text(text)
    if frontend:
        subprocess.run(['patch', '--batch', '-p1', '-d', str(output), '-i',
                        str(root / 'toolkits/android-branding/pixel-frontend.patch')], check=True)
    report = {
        'schema': 'rockstaros.pixel-branding-stage/1', 'source': str(source),
        'output': str(output), 'serviceSetupEnabled': False, 'frontendRefinementApplied': frontend,
        'sourceFilesSha256': {
            str(p.relative_to(source)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in source.rglob('*') if p.is_file() and 'build' not in p.parts and '.gradle' not in p.parts
        },
    }
    (output.parent / 'branding-stage.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--android-source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--frontend', action='store_true', help='Apply reviewed Pixel UI patch; fails on source mismatch')
    args = parser.parse_args()
    stage(args.android_source.resolve(), args.output.resolve(), Path(__file__).resolve().parents[1], args.frontend)
