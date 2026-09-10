#!/bin/sh
set -eu
target=$1
cat > "$target/usr/lib/os-release" <<'EOF'
NAME="RockstarOS"
ID=rock-star-os
VERSION="1.0 Developer Preview"
VERSION_ID=1.0
PRETTY_NAME="RockstarOS 1.0 Developer Preview (ARM64 QEMU)"
BUILD_ID=rock-virt-aarch64-1.0-developer-preview
EOF
ln -sf ../usr/lib/os-release "$target/etc/os-release"
mkdir -p "$target/data" "$target/usr/libexec"
chmod 0755 "$target/etc/init.d/S00rockdata" "$target/etc/init.d/S35rocknet" "$target/etc/init.d/S40rock" "$target/etc/init.d/S50rockplatform" "$target/etc/init.d/S55rockauthenticator" "$target/etc/init.d/S60rockui" "$target/etc/init.d/S99rock-verify"
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
sh "$repo/os/platform/install-target.sh" "$target"
sh "$repo/os/update/install-target.sh" "$target" --include-tests
chmod 0755 "$target/usr/bin/bwrap"
# Remove only stale applet links created by an earlier local Buildroot image.
for old_applet in "$target/bin/ash" "$target/bin/hush" "$target/bin/awk" "$target/usr/bin/awk"; do
  if [ -L "$old_applet" ]; then
    case "$(readlink "$old_applet")" in
      *busybox) rm "$old_applet" ;;
      *) echo 'Unexpected stale applet target' >&2; exit 1 ;;
    esac
  elif [ -e "$old_applet" ]; then
    echo 'Unexpected non-symlink shell or awk applet; refusing an ambiguous target' >&2
    exit 1
  fi
done
printf '/bin/sh\n/bin/dash\n' > "$target/etc/shells"
