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
  # prepare already checked the exact bytes of this sole permitted difference.
  git diff --exit-code --quiet HEAD -- . ':(exclude)config/mk/google_devices/device/frankel/device.mk'
else
  git diff --exit-code --quiet HEAD -- .
fi
if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "Untracked source files: $REPO_PATH" >&2
  exit 1
fi
