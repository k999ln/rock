#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/.." && pwd)
if [[ $(uname -s) != Linux ]]; then
  echo 'Build this OS inside Linux. See os/README.md.' >&2
  exit 2
fi
if [[ "$repo" == *' '* ]]; then
  echo 'Buildroot requires a Linux source path without spaces.' >&2
  exit 2
fi
build_base=${ROCK_BUILD_DIR:-/var/tmp/rock-star-os-build-$(id -u)}
mkdir -p "$build_base" "$repo/artifacts/os"
archive="$build_base/buildroot-2026.08.tar.xz"
expected=87aaca4164ea9d5c8085854953018263f7963f07c22e73a2a2185cc98c581c34
if [[ ! -f "$archive" ]]; then
  curl --fail --location --retry 3 --output "$archive.part" https://buildroot.org/downloads/buildroot-2026.08.tar.xz
  printf '%s  %s\n' "$expected" "$archive.part" | sha256sum --check --status
  mv "$archive.part" "$archive"
fi
printf '%s  %s\n' "$expected" "$archive" | sha256sum --check --status
if [[ ! -f "$build_base/buildroot-2026.08/Makefile" ]]; then
  tar -xf "$archive" -C "$build_base"
fi
br="$build_base/buildroot-2026.08"
out="$build_base/output"
external="$repo/os/buildroot"
linux_version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["linux"]["version"])' "$repo/os/source-lock.json")
[[ "$linux_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid locked Linux version' >&2; exit 2; }
printf 'OS build log: %s\n' "$repo/artifacts/os/build.log"
exec > "$repo/artifacts/os/build.log" 2>&1
date -u '+Build started: %Y-%m-%dT%H:%M:%SZ'
make -C "$br" O="$out" BR2_EXTERNAL="$external" rock_virt_aarch64_defconfig
grep -qx 'BR2_SYSTEM_BIN_SH_DASH=y' "$out/.config"
grep -qx 'BR2_PACKAGE_DASH=y' "$out/.config"
if [[ -d "$out/build/linux-$linux_version" ]]; then
  make -C "$br" O="$out" BR2_EXTERNAL="$external" linux-reconfigure
fi
if compgen -G "$out/build/busybox-*/.stamp_built" >/dev/null; then
  make -C "$br" O="$out" BR2_EXTERNAL="$external" busybox-reconfigure
fi
make -C "$br" O="$out" BR2_EXTERNAL="$external"
# Local package sources may have changed since their first extraction.
make -C "$br" O="$out" BR2_EXTERNAL="$external" rock-core-rebuild rock-platform-rebuild rock-ui-rebuild all
python3 "$repo/os/update/build-initramfs.py" --target "$out/target" --rootfs "$out/images/rootfs.ext4" --output "$repo/artifacts/os/stage0.cpio.gz" --include-tests
cp "$out/images/Image" "$repo/artifacts/os/Image"
cp "$out/images/rootfs.ext4" "$repo/artifacts/os/rootfs.ext4"
cp "$out/.config" "$repo/artifacts/os/buildroot.config"
cp "$out/build/linux-$linux_version/.config" "$repo/artifacts/os/linux.config"
cp "$repo/os/source-lock.json" "$repo/artifacts/os/source-lock.json"
(cd "$repo/artifacts/os" && sha256sum Image rootfs.ext4 stage0.cpio.gz > SHA256SUMS)
date -u '+Build finished: %Y-%m-%dT%H:%M:%SZ'
