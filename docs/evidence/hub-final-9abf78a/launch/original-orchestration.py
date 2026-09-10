#!/usr/bin/env python3
"""Run frozen OS UI probes sequentially, stopping at the first original failure."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time


def now():
    return datetime.now(timezone.utc).isoformat()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    for name in ('source', 'config', 'sandbox-config', 'output'):
        ap.add_argument('--' + name, type=Path, required=True)
    ap.add_argument('--commit', required=True)
    ap.add_argument('--freeze-sha256', required=True)
    args = ap.parse_args()
    assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
    source = args.source.resolve(strict=True)
    config = args.config.resolve(strict=True)
    sandbox = args.sandbox_config.resolve(strict=True)
    device = json.loads(config.read_text())
    images = Path(device['images']).resolve(strict=True)
    freeze_path = images / 'freeze-manifest.json'
    freeze_bytes = freeze_path.read_bytes()
    assert hashlib.sha256(freeze_bytes).hexdigest() == args.freeze_sha256
    freeze = json.loads(freeze_bytes)
    assert freeze['schema'] == 'rock-build-freeze/2' and freeze['source_commit'] == args.commit
    assert freeze['status'] == 'BUILD_COMPLETE_FROZEN'
    assert freeze['files_sha256'] == device['sha256']
    for name, digest in freeze['files_sha256'].items():
        with (images / name).open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == digest, name
    repository = source.parent.parent
    for name, digest in freeze['source_files_sha256'].items():
        path = repository / name
        assert path.resolve(strict=True).is_relative_to(repository)
        assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, name
    output = args.output.resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    env = dict(os.environ, PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
               PYTHONDONTWRITEBYTECODE='1', PYTHONUNBUFFERED='1')
    names = [('game', 'observe-game-os.py'), ('audit', 'audit-game-ui-ledgers.py'),
             ('financial', 'observe-financial-game-os.py'), ('citations', 'observe-pc-link-os.py'),
             ('demo', 'record-os-demo.py')]
    stages = []
    for name, script in names:
        path = source / 'os/desktop' / script
        command = ['/usr/bin/python3', '-B', str(path), '--source', str(source), '--output', str(output / name)]
        if name == 'audit':
            command += ['--config', str(sandbox), '--expected-games', '2']
        else:
            command += ['--config', str(config), '--sandbox-config', str(sandbox), '--commit', args.commit]
        if name == 'citations':
            command += ['--fixture', 'citations']
        stages.append({'stage': name, 'observer_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                       'command': command, 'status': 'NOT_RUN'})
    report = {'schema': 'rock-final-user-flow-orchestration/1', 'source_commit': args.commit,
              'started_utc': now(), 'status': 'RUNNING', 'stages': stages,
              'orchestrator_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'freeze_sha256': args.freeze_sha256, 'preflight_source_files': len(freeze['source_files_sha256']),
              'preflight_source_and_images': 'PASS_EXACT_FROZEN_BYTES',
              'config_sha256': hashlib.sha256(config.read_bytes()).hexdigest(),
              'sandbox_config_sha256': hashlib.sha256(sandbox.read_bytes()).hexdigest(),
              'scope': 'Fresh dedicated device only. Frozen UI/input/ledger probes. No automatic failure recovery, new credit, purchase or cleanup after a failure.'}
    report_path = output / 'orchestration.json'
    def save():
        temporary = report_path.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        temporary.chmod(0o600)
        temporary.replace(report_path)
    save()
    for stage in stages:
        stage.update(status='RUNNING', started_utc=now())
        save()
        print(json.dumps({'stage': stage['stage'], 'status': 'RUNNING', 'started_utc': stage['started_utc']}), flush=True)
        started = time.monotonic()
        log_path = output / (stage['stage'] + '.log')
        with log_path.open('xb') as log:
            log_path.chmod(0o600)
            result = subprocess.run(stage['command'], cwd=source, env=env, stdout=log, stderr=subprocess.STDOUT)
        stage.update(status='PASS' if result.returncode == 0 else 'FAIL', exit_code=result.returncode,
                     elapsed_seconds=time.monotonic() - started, finished_utc=now(),
                     log_sha256=hashlib.sha256(log_path.read_bytes()).hexdigest())
        save()
        print(json.dumps({k: v for k, v in stage.items() if k not in ('command', 'observer_sha256')}), flush=True)
        if result.returncode:
            report.update(status='FAIL_ORIGINAL_STAGE_RETAINED', finished_utc=now())
            save()
            return 1
    report.update(status='PASS_UI_SEQUENCE_DEMO_ENCODING_AND_VISUAL_REVIEW_PENDING', finished_utc=now())
    save()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
