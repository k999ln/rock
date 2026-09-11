#!/usr/bin/env bash
# Compile only. No cloud creation, device access, key generation or flash.
set -eo pipefail
if [[ $# != 2 ]]; then
  echo 'Usage: bash external/rockstaros/scripts/build-phone-bringup.sh <OS-tree> <GrapheneOS-allowed-signers>' >&2
  exit 2
fi
rock_phone_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
rock_phone_tree="$(cd -- "$1" && pwd -P)"
rock_phone_signers="$(realpath -- "$2")"
# Validate the exact owner-confirmed target before creating output or mutating
# the OS checkout. All build identity inputs below come from this same lock.
rock_phone_build_config="$(python3 "$rock_phone_root/scripts/prepare-phone-build.py" build-config)"
IFS=$'\t' read -r rock_phone_device rock_phone_lunch rock_phone_hook rock_phone_kernel rock_phone_targets_csv <<< "$rock_phone_build_config"
if [[ -z "$rock_phone_device" || -z "$rock_phone_lunch" || -z "$rock_phone_hook" || -z "$rock_phone_kernel" || -z "$rock_phone_targets_csv" ]]; then
  echo 'The pinned phone build lock did not provide complete build inputs.' >&2
  exit 2
fi
IFS=',' read -r -a rock_phone_build_targets <<< "$rock_phone_targets_csv"
if [[ -L "$rock_phone_tree/out" ]]; then
  echo 'The dedicated OS output directory must not be a symlink.' >&2
  exit 2
fi
# Ignore ambient output settings; inspect the filesystem actually used by m.
unset OUT_DIR_COMMON_BASE
export OUT_DIR="$rock_phone_tree/out"
mkdir -p "$OUT_DIR"
python3 "$rock_phone_root/scripts/prepare-phone-build.py" host "$OUT_DIR"
python3 "$rock_phone_root/scripts/prepare-phone-build.py" prepare "$rock_phone_tree" --allowed-signers "$rock_phone_signers"
rock_phone_hook_state="$(python3 "$rock_phone_root/scripts/prepare-phone-build.py" verify-hook "$rock_phone_tree")"
IFS=$'\t' read -r rock_phone_hook_repo_path rock_phone_hook_sha256 <<< "$rock_phone_hook_state"
if [[ -z "$rock_phone_hook_repo_path" || -z "$rock_phone_hook_sha256" ]]; then
  echo 'The prepared device hook could not be pinned for project validation.' >&2
  exit 2
fi
cd -- "$rock_phone_tree"
unset OFFICIAL_BUILD
export ROCK_PHONE_SOURCE_ROOT="$rock_phone_root"
export ROCK_PHONE_HOOK_REPO_PATH="$rock_phone_hook_repo_path"
export ROCK_PHONE_EXPECTED_HOOK_SHA256="$rock_phone_hook_sha256"
repo forall -e -c 'bash "$ROCK_PHONE_SOURCE_ROOT/scripts/check-phone-project.sh"'
# Re-check exact bytes after repo-wide validation narrows the prepare→build
# TOCTOU window; this remains read-only and fails before invoking Soong.
python3 "$rock_phone_root/scripts/prepare-phone-build.py" verify-hook "$rock_phone_tree"
source build/envsetup.sh
lunch "$rock_phone_lunch"
# Preserve the actual pinned source map beside the output for this build.
mkdir -p "$OUT_DIR/rockstaros-evidence"
repo manifest -r -o "$OUT_DIR/rockstaros-evidence/source-manifest.xml"
git -C external/rockstaros rev-parse HEAD > "$OUT_DIR/rockstaros-evidence/rock-commit.txt"
git -C vendor/adevtool diff -- "${rock_phone_hook#vendor/adevtool/}" > "$OUT_DIR/rockstaros-evidence/device-integration.patch"
m "${rock_phone_build_targets[@]}"
echo 'Device bring-up build finished. No signed factory release or hardware acceptance is implied.'
