"""Review unchanged Wallet/ATM pixels before updating a stale source pin.

This never overwrites the canonical guard. It runs the actual C replay with
the existing pixel definitions, preserving all geometry and negative checks.
The candidate must be reviewed, applied, then tested without this probe.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
from unittest.mock import patch

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--native-root', type=Path, required=True)
p.add_argument('--renderer', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
args = p.parse_args()
root = args.native_root.resolve(strict=True)
ui = root / 'os/ui'
sys.path.insert(0, str(ui))
spec = importlib.util.spec_from_file_location('pin_review_replay', ui / 'test_wallet_replay.py')
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)
original = json.loads((ui / 'pin-readiness.json').read_text())
output = args.output.resolve()
output.mkdir(mode=0o700, parents=False, exist_ok=False)
font = root / 'os/assets/NotoSansCJKjp-Regular.otf'
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
paths = set(original['sources'])
paths.update('os/ui/' + name for name in re.findall(r'^#include "([^"]+)"', (ui / 'ui.c').read_text(), re.M))
sources = {name: digest(root / name) for name in sorted(paths)}
report = {'schema': 'rock-pin-source-review/1', 'status': 'RUNNING',
          'started_utc': datetime.now(timezone.utc).isoformat(),
          'scope': 'Root-owned host C/real Wallet fixture only; no QEMU or final OS acceptance',
          'original_manifest_sha256': digest(ui / 'pin-readiness.json'),
          'original_sources': original['sources'], 'candidate_sources': sources,
          'renderer_sha256': digest(args.renderer),
          'pixel_definitions_changed': False, 'canonical_guard_overwritten': False}
try:
    replay.check_live_entrypoints()
    # This explicit review ignores only old source hashes. Every original RGB
    # ROI, count, enabled state, pointer coordinate, deadline and receipt stays.
    with patch.object(replay.pin_readiness, 'profiles', return_value=original['profiles']):
        for kind in ('wallet', 'atm'):
            replay.run_case(args.renderer.resolve(), font, output / kind, kind)
        replay.reject_stale_steps(args.renderer.resolve(), font, output)
    assert sources == {name: digest(root / name) for name in sorted(paths)}
    candidate = {**original, 'scope': 'Reviewed fixed C public synthetic Wallet/ATM auth frames; host mechanism only',
                 'sources': sources}
    (output / 'candidate-pin-readiness.json').write_text(json.dumps(candidate, indent=2) + '\n')
    report.update(status='PASS_UNCHANGED_PIXELS_REVIEW', source_unchanged=True,
                  candidate_manifest_sha256=digest(output / 'candidate-pin-readiness.json'),
                  next='Visually review masked frames, apply source-only candidate, run original tests unmodified')
except Exception as error:
    report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
    raise
finally:
    report['finished_utc'] = datetime.now(timezone.utc).isoformat()
    (output / 'review.json').write_text(json.dumps(report, indent=2) + '\n')
