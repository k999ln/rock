#!/usr/bin/env bash
set -euo pipefail

port="${1:-8765}"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb was not found; install Android Platform Tools" >&2
  exit 1
fi

if ! [[ "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
  echo "port must be an integer from 1 to 65535" >&2
  exit 1
fi

device_count="$(adb devices | awk 'NR > 1 && $2 == "device" {count++} END {print count+0}')"
if [[ "$device_count" -ne 1 ]] && [[ -z "${ANDROID_SERIAL:-}" ]]; then
  echo "expected exactly one authorized device; set ANDROID_SERIAL explicitly" >&2
  adb devices -l >&2
  exit 1
fi

adb reverse "tcp:${port}" "tcp:${port}"
echo "device tcp:${port} now forwards to the PC receiver on tcp:${port}"
