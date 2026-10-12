#!/usr/bin/env bash
# Compile only. No cloud creation, device access, key generation or flash.
set -eo pipefail

if [[ $# != 4 || $1 != --mode || ($2 != bringup && $2 != release) ]]; then
  echo 'Usage: ROCK_LOCAL_AI_APK=<reviewed.apk> ROCK_ANDROID_AAPT2=<aapt2> [ROCK_OPERATOR_AGENT_CONFIG=<external-public.json>] bash external/rockstaros/scripts/build-phone-bringup.sh --mode bringup|release <OS-tree> <GrapheneOS-allowed-signers>' >&2
  exit 2
fi
rock_phone_mode="$2"
shift 2
: "${ROCK_LOCAL_AI_APK:?Set ROCK_LOCAL_AI_APK to the lock-reviewed unsigned release APK}"
: "${ROCK_ANDROID_AAPT2:?Set ROCK_ANDROID_AAPT2 to a trusted aapt2 binary}"

if [[ $rock_phone_mode == release ]]; then
  : "${ROCK_OPERATOR_AGENT_CONFIG:?Release mode requires the reviewed external public trust input}"
  : "${ROCK_GOOGLE_FACTORY_IMAGE:?Release mode requires the owner-downloaded Pixel 10 factory ZIP}"
  : "${ROCK_GOOGLE_FULL_OTA:?Release mode requires the matching owner-downloaded Pixel 10 full OTA ZIP}"
  : "${ROCK_GOOGLE_TERMS_RECORD:?Release mode requires the owner-provided detached download-only terms record}"
  export ROCK_OPERATOR_AGENT_MODE=configured
elif [[ -n ${ROCK_OPERATOR_AGENT_CONFIG:-} ]]; then
  export ROCK_OPERATOR_AGENT_MODE=configured
else
  export ROCK_OPERATOR_AGENT_MODE=excluded
fi

rock_phone_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
rock_phone_tree="$(cd -- "$1" && pwd -P)"
rock_phone_signers="$(realpath -- "$2")"
rock_phone_build_config="$(python3 "$rock_phone_root/scripts/prepare-phone-build.py" build-config --mode "$rock_phone_mode")"
IFS=$'\t' read -r rock_phone_device rock_phone_lunch rock_phone_hook rock_phone_kernel rock_phone_targets_csv <<< "$rock_phone_build_config"
if [[ -z $rock_phone_device || -z $rock_phone_lunch || -z $rock_phone_hook || -z $rock_phone_kernel || -z $rock_phone_targets_csv ]]; then
  echo 'The pinned phone build lock did not provide complete build inputs.' >&2
  exit 2
fi
IFS=',' read -r -a rock_phone_build_targets <<< "$rock_phone_targets_csv"
if [[ -L $rock_phone_tree/out ]]; then
  echo 'The dedicated OS output directory must not be a symlink.' >&2
  exit 2
fi
unset OUT_DIR_COMMON_BASE
cd -- "$rock_phone_tree"
# Keep OUT_DIR relative to the source root. Siso's config repository resolver
# treats an absolute --config_repo_dir as a repository label and fails to load
# its generated main.star with the pinned Android 17 toolchain.
export OUT_DIR=out
# A unique build number is embedded in product properties. Each invocation gets
# its own dist/evidence paths; an older ZIP cannot satisfy this invocation.
export BUILD_NUMBER="rock.$(git -C "$rock_phone_root" rev-parse --short=12 HEAD).$(python3 -c 'import uuid; print(uuid.uuid4().hex[:12])')"
export DIST_DIR="$OUT_DIR/rockstaros-builds/$BUILD_NUMBER"
rock_phone_evidence="$OUT_DIR/rockstaros-evidence/$BUILD_NUMBER"
mkdir -p "$OUT_DIR/rockstaros-evidence"
mkdir "$rock_phone_evidence"
mkdir -p "$DIST_DIR"
export ROCK_PHONE_BUILD_MODE="$rock_phone_mode"
export ROCK_PHONE_EVIDENCE="$rock_phone_evidence"
python3 - <<'PY_INIT'
import json, os, pathlib
path = pathlib.Path(os.environ["OUT_DIR"], "rockstaros-evidence", "build-manifest.json")
path.write_text(json.dumps({"schema": "avocadoos-developer-preview-build/2",
    "status": "RUNNING", "buildNumber": os.environ["BUILD_NUMBER"],
    "mode": os.environ["ROCK_PHONE_BUILD_MODE"], "signing": "test/development",
    "operatorAgent": os.environ["ROCK_OPERATOR_AGENT_MODE"],
    "evidenceDirectory": os.environ["ROCK_PHONE_EVIDENCE"], "distDirectory": os.environ["DIST_DIR"],
    "releaseFlashAllowed": False, "productionSigned": False,
    "hardwareFlashPerformed": False}, indent=2) + "\n")
PY_INIT
rock_phone_finish() {
  local rock_phone_exit_code="$1"
  ROCK_PHONE_EXIT_CODE="$rock_phone_exit_code" python3 - <<'PY_FINISH'
import json, os, pathlib
path = pathlib.Path(os.environ["OUT_DIR"], "rockstaros-evidence", "build-manifest.json")
value = json.loads(path.read_text())
value["exitCode"] = int(os.environ["ROCK_PHONE_EXIT_CODE"])
value["status"] = "COMPILE_AND_ARTIFACT_CHECKS_PASSED" if value["exitCode"] == 0 else "FAILED"
path.write_text(json.dumps(value, indent=2) + "\n")
PY_FINISH
}
trap 'rock_phone_finish "$?"' EXIT
python3 "$rock_phone_root/scripts/prepare-phone-build.py" host "$OUT_DIR"

if [[ $rock_phone_mode == release ]]; then
  python3 "$rock_phone_root/scripts/freeze-phone-build-inputs.py" recovery \
    "$ROCK_GOOGLE_FACTORY_IMAGE" "$ROCK_GOOGLE_FULL_OTA" "$ROCK_GOOGLE_TERMS_RECORD" \
    --output "$rock_phone_evidence/google-stock-recovery.json"
  python3 "$rock_phone_root/scripts/freeze-phone-build-inputs.py" signing-plan \
    --output "$rock_phone_evidence/production-signing-plan.json"
fi

python3 "$rock_phone_root/scripts/prepare-phone-build.py" prepare "$rock_phone_tree" \
  --mode "$rock_phone_mode" --allowed-signers "$rock_phone_signers"
python3 "$rock_phone_root/scripts/stage-local-ai-apk.py" stage "$rock_phone_tree" "$ROCK_LOCAL_AI_APK" --aapt2 "$ROCK_ANDROID_AAPT2"
if [[ $ROCK_OPERATOR_AGENT_MODE == configured ]]; then
  python3 "$rock_phone_root/scripts/stage-operator-agent-overlay.py" stage "$rock_phone_tree" "$ROCK_OPERATOR_AGENT_CONFIG"
fi
python3 "$rock_phone_root/scripts/freeze-phone-build-inputs.py" vendor "$rock_phone_tree" \
  --output "$rock_phone_evidence/vendor-inventory.json"
rock_phone_hook_state="$(python3 "$rock_phone_root/scripts/prepare-phone-build.py" verify-hook "$rock_phone_tree" --mode "$rock_phone_mode")"
IFS=$'\t' read -r rock_phone_hook_repo_path rock_phone_hook_sha256 <<< "$rock_phone_hook_state"
if [[ -z $rock_phone_hook_repo_path || -z $rock_phone_hook_sha256 ]]; then
  echo 'The prepared device hook could not be pinned for project validation.' >&2
  exit 2
fi

cd -- "$rock_phone_tree"
unset OFFICIAL_BUILD
export ROCK_PHONE_SOURCE_ROOT="$rock_phone_root"
export ROCK_PHONE_HOOK_REPO_PATH="$rock_phone_hook_repo_path"
export ROCK_PHONE_EXPECTED_HOOK_SHA256="$rock_phone_hook_sha256"
repo forall -e -c 'bash "$ROCK_PHONE_SOURCE_ROOT/scripts/check-phone-project.sh"'
python3 "$rock_phone_root/scripts/stage-local-ai-apk.py" verify "$rock_phone_tree"
if [[ $ROCK_OPERATOR_AGENT_MODE == configured ]]; then
  python3 "$rock_phone_root/scripts/stage-operator-agent-overlay.py" verify "$rock_phone_tree"
fi
python3 "$rock_phone_root/scripts/freeze-phone-build-inputs.py" verify-vendor "$rock_phone_tree" \
  "$rock_phone_evidence/vendor-inventory.json" >/dev/null
python3 "$rock_phone_root/scripts/prepare-phone-build.py" verify-hook "$rock_phone_tree" --mode "$rock_phone_mode"
source build/envsetup.sh
lunch "$rock_phone_lunch"
repo manifest -r -o "$rock_phone_evidence/source-manifest.xml"
git -C external/rockstaros rev-parse HEAD > "$rock_phone_evidence/rock-commit.txt"
git -C vendor/adevtool diff -- "${rock_phone_hook#vendor/adevtool/}" > "$rock_phone_evidence/device-integration.patch"
if [[ $ROCK_OPERATOR_AGENT_MODE == configured ]]; then
  cp vendor/avocado-operator-agent/artifact.json "$rock_phone_evidence/operator-agent-overlay.json"
fi
cp "$rock_phone_root/os/physical/frankel-source-lock.json" "$rock_phone_evidence/source-lock.json"
cp vendor/rockstaros-local-ai/artifact.json "$rock_phone_evidence/local-ai-artifact.json"
m "${rock_phone_build_targets[@]}" dist
python3 "$rock_phone_root/scripts/verify-phone-artifacts.py" --dist "$DIST_DIR" \
  --build-number "$BUILD_NUMBER" --operator "$ROCK_OPERATOR_AGENT_MODE" \
  --evidence-dir "$rock_phone_evidence" --output "$rock_phone_evidence/artifacts.json"
echo "RockstarOS Developer Preview $rock_phone_mode compile and artifact checks passed: $rock_phone_evidence. Test/development signing only; release flash is not allowed."
