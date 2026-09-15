#!/usr/bin/env bash
# Build only: prepares a disposable overlay tree and emits an unsigned arm64 APK.
set -euo pipefail
if [[ $# != 2 ]]; then
  echo 'Usage: bash external/rockstaros/scripts/build-local-ai-apk.sh <OS-tree> <new-output-source-dir>' >&2
  exit 2
fi
rock_local_ai_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
rock_local_ai_tree="$(cd -- "$1" && pwd -P)"
rock_local_ai_output="$2"
if ! command -v java >/dev/null || [[ -z "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]]; then
  echo 'Java and ANDROID_HOME or ANDROID_SDK_ROOT are required for the Android APK build.' >&2
  exit 2
fi
python3 "$rock_local_ai_root/scripts/prepare-local-ai-runtime.py" "$rock_local_ai_tree" "$rock_local_ai_output"
cd -- "$rock_local_ai_output"
npm ci
npm run prepare:native
(cd android && ./gradlew --no-daemon :app:assembleRelease -PreactNativeArchitectures=arm64-v8a)
release_dir="$rock_local_ai_output/android/app/build/outputs/apk/release"
apk_candidates=()
for candidate in "$release_dir/app-release-unsigned.apk" "$release_dir/app-release.apk"; do
  [[ -f "$candidate" ]] && apk_candidates+=("$candidate")
done
if [[ ${#apk_candidates[@]} != 1 ]]; then
  echo 'Gradle must emit exactly one expected unsigned release APK.' >&2
  exit 1
fi
apk="${apk_candidates[0]}"
echo "$apk"
