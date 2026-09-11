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
cd -- "$rock_phone_tree"
unset OFFICIAL_BUILD
export ROCK_PHONE_SOURCE_ROOT="$rock_phone_root"
repo forall -e -c 'bash "$ROCK_PHONE_SOURCE_ROOT/scripts/check-phone-project.sh"'
source build/envsetup.sh
lunch frankel-cur-userdebug
# Preserve the actual pinned source map beside the output for this build.
mkdir -p "$OUT_DIR/rockstaros-evidence"
repo manifest -r -o "$OUT_DIR/rockstaros-evidence/source-manifest.xml"
git -C external/rockstaros rev-parse HEAD > "$OUT_DIR/rockstaros-evidence/rock-commit.txt"
git -C vendor/adevtool diff -- config/mk/google_devices/device/frankel/device.mk > "$OUT_DIR/rockstaros-evidence/device-integration.patch"
m target-files-package otatools-package
echo 'Device bring-up build finished. No signed factory release or hardware acceptance is implied.'
