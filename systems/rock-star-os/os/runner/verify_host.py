"""Record this module's focused host checks without claiming guest execution."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    base = Path(__file__).resolve().parent
    project = base.parents[1]
    evidence = base / 'evidence'
    evidence.mkdir(exist_ok=True)
    environment = {**os.environ, 'PYTHONPATH': str(project / 'src') + os.pathsep + str(project / 'os')}
    result = subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', str(base / 'tests'), '-v'],
                            cwd=project, env=environment, capture_output=True, text=True)
    log = result.stdout + result.stderr
    (evidence / 'host-suite.log').write_text(log)
    sources = sorted(path for path in base.rglob('*') if path.is_file() and 'evidence' not in path.parts
                     and '__pycache__' not in path.parts)
    report = {'checked_at_utc': datetime.now(timezone.utc).isoformat(), 'status': 'PASS' if result.returncode == 0 else 'FAIL',
              'returncode': result.returncode, 'python': sys.version, 'host_platform': sys.platform,
              'actual_transport': ['loopback pinned TLS', 'authenticated framed Unix'],
              'executor': 'fake_callback in host fault tests; see separate linux-actual.json for actual processes',
              'os_guest_origin': 'NOT_RUN', 'physical_usb': 'NOT_RUN', 'public_cloud': 'NOT_RUN',
              'source_sha256': {str(path.relative_to(project)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sources}}
    (evidence / 'host-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print(log)
    print(json.dumps({'status': report['status'], 'checked_at_utc': report['checked_at_utc']}))
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
