#!/bin/sh
# Buildroot post-build interface; edits only the supplied disposable target tree.
set -eu
target=${1:?usage: install-target.sh TARGET_DIR [--include-tests]}
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
[ -d "$target/etc" ] && [ -d "$target/usr" ]
mkdir -p "$target/usr/lib/rock-update" "$target/usr/libexec" "$target/usr/sbin" "$target/etc/rock-update" "$target/etc/init.d" "$target/data" "$target/run"
install -m 0644 "$source_dir/rock_update.py" "$target/usr/lib/rock-update/rock_update.py"
install -m 0644 "$source_dir/ui_health.py" "$target/usr/lib/rock-update/ui_health.py"
install -m 0755 "$source_dir/rock-ui-health" "$target/usr/libexec/rock-ui-health"
install -m 0755 "$source_dir/rock-update" "$target/usr/sbin/rock-update"
install -m 0755 "$source_dir/S97rock-update-health" "$target/etc/init.d/S97rock-update-health"
install -m 0755 "$source_dir/rock-boot-watchdog" "$target/usr/libexec/rock-boot-watchdog"
if [ "${2:-}" = --include-tests ]; then
  install -m 0755 "$source_dir/rock-update-test" "$target/usr/sbin/rock-update"
  for file in fault_cli.py test_faults.py fault_guest.py early_recover.py; do
    install -m 0644 "$source_dir/$file" "$target/usr/lib/rock-update/$file"
  done
  install -m 0644 "$source_dir/guest_test.py" "$target/usr/lib/rock-update/guest_test.py"
  install -m 0755 "$source_dir/S99rock-ab-test" "$target/etc/init.d/S99rock-ab-test"
  install -m 0755 "$source_dir/S01rock-ab-full-recover" "$target/etc/init.d/S01rock-ab-full-recover"
elif [ "$#" -gt 1 ]; then
  echo 'Unknown install-target option' >&2
  exit 2
else
  # Remove only this package's optional test files when reusing a target tree.
  for file in fault_cli.py test_faults.py fault_guest.py guest_test.py early_recover.py; do
    rm -f "$target/usr/lib/rock-update/$file"
  done
  rm -f "$target/etc/init.d/S99rock-ab-test"
  rm -f "$target/etc/init.d/S01rock-ab-full-recover"
fi
