#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
install_root="${ROCKSTAROS_PREVIEW_HOME:-${HOME}/.local/share/rockstaros-public-preview}"

if [ "${1:-}" = "--prefix" ]; then
  if [ -z "${2:-}" ]; then
    echo "Usage: $0 [--prefix DIRECTORY]" >&2
    exit 2
  fi
  install_root=$2
elif [ "$#" -ne 0 ]; then
  echo "Usage: $0 [--prefix DIRECTORY]" >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

node_major=$(node -p "Number(process.versions.node.split('.')[0])")
if [ "$node_major" -lt 20 ]; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

if [ -e "$install_root" ] && [ -n "$(find "$install_root" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  echo "Refusing to replace a non-empty destination: $install_root" >&2
  exit 1
fi

mkdir -p "$install_root/apps" "$install_root/packages" "$install_root/bin"
cp -R "$source_root/apps/sky-zema-preview" "$install_root/apps/"
cp -R "$source_root/packages/sky-zema-core" "$install_root/packages/"
cp "$script_dir/rockstaros-public-preview" "$install_root/bin/rockstaros-public-preview"
chmod 755 "$install_root/bin/rockstaros-public-preview"

printf '%s\n' "Installed the RockstarOS Sky + Zema public preview."
printf '%s\n' "Run: $install_root/bin/rockstaros-public-preview"
printf '%s\n' "Open: http://127.0.0.1:4173"
printf '%s\n' "Telemetry is off unless a receiving endpoint is configured and the user opts in."
