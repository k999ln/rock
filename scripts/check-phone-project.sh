#!/usr/bin/env bash
# Invoked by repo forall after prepare verifies the signed manifest/device hook.
set -euo pipefail
if [[ ! "${REPO_RREV:-}" =~ ^[0-9a-f]{40}$ ]] || [[ -z "${REPO_PATH:-}" ]]; then
  echo 'Each phone build project must use a full commit revision.' >&2
  exit 1
fi
if [[ "$(git rev-parse HEAD)" != "$REPO_RREV" ]]; then
  echo "Source revision mismatch: $REPO_PATH" >&2
  exit 1
fi
if [[ "$REPO_PATH" == vendor/adevtool ]]; then
  hook_path="${ROCK_PHONE_HOOK_REPO_PATH:-}"
  expected_hook_sha="${ROCK_PHONE_EXPECTED_HOOK_SHA256:-}"
  if [[ -z "$hook_path" || -z "$expected_hook_sha" || ! "$hook_path" =~ ^config/mk/google_devices/device/[a-z0-9_]+/device\.mk$ || ! "$expected_hook_sha" =~ ^[0-9a-f]{64}$ ]]; then
    echo 'The build must pin one lock-derived device hook and its exact hash.' >&2
    exit 1
  fi
  git diff --exit-code --quiet HEAD -- . ":(exclude)$hook_path"
  actual_hook_sha="$(sha256sum -- "$hook_path" | awk '{print $1}')"
  if [[ "$actual_hook_sha" != "$expected_hook_sha" ]]; then
    echo 'The lock-pinned device hook changed after preparation.' >&2
    exit 1
  fi
else
  git diff --exit-code --quiet HEAD -- .
fi
if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "Untracked source files: $REPO_PATH" >&2
  exit 1
fi
