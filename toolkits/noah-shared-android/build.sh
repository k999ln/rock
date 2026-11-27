#!/usr/bin/env bash
# Builds only this ordinary Android app. No installed device, Gradle or signing credentials are used.
set -eu
if [[ $# -lt 1 || $# -gt 2 || ( $# -eq 2 && $2 != --instrumentation ) ]]; then
  echo "Usage: bash build.sh /absolute/path/output.apk [--instrumentation]" >&2; exit 2
fi
here="$(cd -- "$(dirname -- "$0")" && pwd)"
out="$1"
: "${ANDROID_HOME:?Set ANDROID_HOME to an SDK with platforms;android-35 and build-tools;35.0.0}"
: "${JAVA_HOME:?Set JAVA_HOME to JDK 17}"
tools="$ANDROID_HOME/build-tools/35.0.0"
platform="$ANDROID_HOME/platforms/android-35/android.jar"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/classes" "$tmp/assets" "$tmp/dex"
manifest="$here/AndroidManifest.xml"
sources="$here/src/si/avoado/noah/participant"
if [[ ${2:-} == --instrumentation ]]; then
  manifest="$here/test/AndroidManifest.xml"
  sources="$here/test/si/avoado/noah/participant/test"
else
  cp "$here/../../public/noah-shared-compute/model.json" "$here/../../public/noah-shared-compute/eve-agents.mjs" "$here/assets/eve-renderer.html" "$tmp/assets/"
fi
"$tools/aapt2" link -o "$tmp/base.apk" -I "$platform" -A "$tmp/assets" --manifest "$manifest"
"$JAVA_HOME/bin/javac" --release 8 -cp "$platform" -d "$tmp/classes" "$sources"/*.java
"$JAVA_HOME/bin/jar" cf "$tmp/classes.jar" -C "$tmp/classes" .
"$tools/d8" --release --min-api 30 --lib "$platform" --output "$tmp/dex" "$tmp/classes.jar"
(cd "$tmp/dex" && zip -q -0 "$tmp/base.apk" classes.dex)
"$tools/zipalign" -f -p 4 "$tmp/base.apk" "$out"
"$tools/aapt2" dump badging "$out" | head -1
