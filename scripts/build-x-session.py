#!/usr/bin/env python3
"""Build the isolated X viewer with already-reviewed Android tools; no downloads or key creation."""
import argparse
import pathlib
import shutil
import subprocess
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("java-home", "aapt2", "android-jar", "builder-jar", "apksig-jar", "debug-keystore", "output-dir"):
        parser.add_argument("--" + name, required=True, type=pathlib.Path)
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parent.parent
    source = root / "android/x-session/src/main"
    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    java = args.java_home / "bin/java"
    javac = args.java_home / "bin/javac"
    def run(*cmd):
        subprocess.run([str(x) for x in cmd], check=True)
    for directory in ("generated", "classes", "signer"):
        (out / directory).mkdir(exist_ok=True)
    manifest = source.joinpath("AndroidManifest.xml").read_text().replace("<manifest ", '<manifest package="dev.rock.xsession" ', 1)
    (out / "AndroidManifest.xml").write_text(manifest)
    run(args.aapt2, "compile", "--dir", source / "res", "-o", out / "resources.zip")
    run(args.aapt2, "link", "-o", out / "resources.apk", "--manifest", out / "AndroidManifest.xml", "-I", args.android_jar,
        "--java", out / "generated", "--min-sdk-version", "28", "--target-sdk-version", "35", "--version-code", "1", "--version-name", "0.1.0", out / "resources.zip")
    classes = sorted((source / "java").rglob("*.java")) + sorted((out / "generated").rglob("*.java"))
    run(javac, "--release", "11", "-cp", args.android_jar, "-d", out / "classes", *classes)
    with zipfile.ZipFile(out / "classes.jar", "w") as archive:
        for item in sorted((out / "classes").rglob("*.class")):
            archive.write(item, item.relative_to(out / "classes"))
    run(java, "-cp", args.builder_jar, "com.android.tools.r8.D8", "--release", "--min-api", "28", "--lib", args.android_jar, "--output", out, out / "classes.jar")
    shutil.copyfile(out / "resources.apk", out / "unsigned.apk")
    with zipfile.ZipFile(out / "unsigned.apk", "a") as archive:
        archive.write(out / "classes.dex", "classes.dex")
    signer = out / "SignViewer.java"
    signer.write_text('''import java.io.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;
import com.android.apksig.*;
public final class SignViewer {
 public static void main(String[] args) throws Exception {
  KeyStore store=KeyStore.getInstance(KeyStore.getDefaultType());
  try(InputStream in=new FileInputStream(args[0])) { store.load(in,"android".toCharArray()); }
  PrivateKey key=(PrivateKey)store.getKey("androiddebugkey","android".toCharArray());
  X509Certificate cert=(X509Certificate)store.getCertificate("androiddebugkey");
  ApkSigner.SignerConfig config=new ApkSigner.SignerConfig.Builder("development-only",key,List.of(cert)).build();
  new ApkSigner.Builder(List.of(config)).setInputApk(new File(args[1])).setOutputApk(new File(args[2])).setMinSdkVersion(28).build().sign();
  ApkVerifier.Result result=new ApkVerifier.Builder(new File(args[2])).build().verify();
  if(!result.isVerified()) throw new SecurityException("APK signature rejected: "+result.getErrors());
  System.out.println("Development signature verified; this is a companion APK, not an OS image.");
 }
}
''')
    run(javac, "-cp", args.apksig_jar, "-d", out / "signer", signer)
    run(java, "-cp", str(out / "signer") + ":" + str(args.apksig_jar), "SignViewer", args.debug_keystore, out / "unsigned.apk", out / "rockstar-x-session-dev.apk")
    run(args.aapt2, "dump", "badging", out / "rockstar-x-session-dev.apk")


if __name__ == "__main__":
    main()
