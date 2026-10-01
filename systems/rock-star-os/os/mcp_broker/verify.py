"""Run focused real-loopback tests and retain public logs/source hash joins."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import platform
import re
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    out = args.evidence.resolve()
    out.mkdir(parents=True, exist_ok=False)
    paths = sorted((root/'os/mcp_broker').glob('*.py')) + sorted((root/'tests').glob('test_mcp_broker*.py')) + [root/'docs/MCP-BROKER.md']
    def hashes():
        return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
    before = hashes()
    argv = [sys.executable, '-B', '-W', 'error::ResourceWarning', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_mcp_broker*.py', '-v']
    start = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (out/'test.log').open('wb') as log:
        result = subprocess.run(argv, cwd=root, stdout=log, stderr=subprocess.STDOUT, timeout=120)
    after = hashes()
    raw = (out/'test.log').read_bytes(); text = raw.decode('utf-8')
    count = re.search(r'^Ran (\d+) tests? in ', text, re.M)
    passed = result.returncode == 0 and bool(count) and text.rstrip().endswith('OK') and before == after and 'Warning' not in text
    report = {'schema': 'rock-mcp-broker-focused/1', 'status': 'PASS' if passed else 'FAIL',
              'started_at_utc': start, 'finished_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'argv': argv, 'exit_code': result.returncode, 'tests': int(count[1]) if count else None,
              'test_log_sha256': hashlib.sha256(raw).hexdigest(), 'source_before': before, 'source_after': after,
              'source_unchanged': before == after, 'host': {'system': platform.system(), 'machine': platform.machine(), 'python': platform.python_version()},
              'scope': 'Actual owned loopback HTTP fixture, finite text execution and SQLite; not independent SDK certification',
              'unverified': ['OS or native UI integration', 'external MCP provider', 'HTTPS/TLS interoperability', 'OAuth lifecycle',
                             'Tasks/SSE/notifications/Apps', 'financial settlement or transfer', 'physical BlackBerry'],
              'private_data_exported': False, 'new_keys_generated': False, 'goal_complete': False}
    (out/'report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False)+'\n')
    print(json.dumps({'status': report['status'], 'tests': report['tests'], 'report': str(out/'report.json')}))
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
