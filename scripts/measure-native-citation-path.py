#!/usr/bin/env python3
"""Measure the frozen native recipe worker on a PC, without claiming a user workflow."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import time

COMMIT = '9abf78a80d27aa9f847c4051d20e4c552e407276'
FREEZE = 'd258a303794a3a16bbec792807bc39427fa3bf3ea3c3d86492be07948f1736fc'
PREFIX = 'systems/rock-star-os/'
FILES = [PREFIX + n for n in ('src/blackberryrock/recipe_worker.py', 'os/tools/fixtures/citations.md',
                              'os/tools/packages/org.rockstar.citation-organizer--1.0.0.recipe.json')]
EXPECTED = 'e5e655f1c0c3008fd895f0eba61f206cf83035d376ab63d76846bf0636840fa7'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    for key in ('repository', 'freeze', 'output'):
        ap.add_argument('--' + key, type=Path, required=True)
    args = ap.parse_args()
    freeze_raw = args.freeze.read_bytes()
    assert sha(freeze_raw) == FREEZE
    freeze = json.loads(freeze_raw)
    assert freeze['source_commit'] == COMMIT
    out = args.output.resolve(); out.mkdir(mode=0o700, parents=True, exist_ok=False)
    source = out / 'source'; source.mkdir(mode=0o700)
    hashes = {}
    for name in FILES:
        raw = subprocess.check_output(['git', '-C', str(args.repository.resolve(strict=True)), 'show', COMMIT + ':' + name])
        assert sha(raw) == freeze['source_files_sha256'][name]
        path = source / name; path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        path.write_bytes(raw); path.chmod(0o444); hashes[name] = sha(raw)
    sample = (source / FILES[1]).read_bytes(); recipe = json.loads((source / FILES[2]).read_text())['recipe']
    assert len(sample) == 150 and sha(sample) == 'bad73028a4b23b6e046abc4a1463f2fa14ffd4f55844ec9146cdc9acc3b1387e'
    request = json.dumps({'text': sample.decode(), 'recipe': recipe}, ensure_ascii=False).encode()
    command = [sys.executable, '-I', '-B', str(source / FILES[0])]
    labels = ['first-process', 'repeat-1', 'repeat-2', 'repeat-3', 'after-normal-exit']
    plan = {'schema': 'rock-native-citation-pc-counterpart/1', 'source_commit': COMMIT,
            'prepared_utc': datetime.now(timezone.utc).isoformat(), 'freeze_sha256': FREEZE,
            'source_sha256': hashes, 'input_sha256': sha(sample), 'input_bytes': len(sample),
            'expected_output_sha256': EXPECTED, 'expected_output_bytes': 151,
            'expected_from': 'Pre-existing actual native Linux citation result and final installed OS readback; no output normalization.',
            'request_sha256': sha(request), 'command': command, 'sequence': labels, 'deadline_seconds': 3,
            'timer': 'monotonic start before fresh process creation through successful exit, JSON decoding and exact output verification; file saving excluded',
            'source_guard': 'Exact bytes exported from frozen Git commit and independently pinned freeze inventory',
            'driver_sha256': sha(Path(__file__).read_bytes()), 'cache_flush': False, 'automatic_retries': False,
            'scope': 'Implementation counterpart for the same native recipe, not the separate Mr. CLI, OS isolation, installation, UI or human workflow timing.'}
    plan_path = out / 'plan.json'; plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n'); plan_path.chmod(0o444)
    result = {'schema': 'rock-native-citation-pc-counterpart-result/1', 'source_commit': COMMIT, 'status': 'RUNNING',
              'plan_sha256': sha(plan_path.read_bytes()), 'samples': [], 'host': {'system': platform.system(),
              'machine': platform.machine(), 'python': platform.python_version(), 'load_average_before': os.getloadavg()},
              'human_active_seconds': None, 'manual_copy_actions': None, 'screen_transitions': None,
              'user_time_reduction_demonstrated': False}
    try:
        for label in labels:
            started = time.perf_counter_ns()
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
            stdout = stderr = b''
            try:
                stdout, stderr = process.communicate(request, timeout=3)
                assert process.returncode == 0 and not stderr
                response = json.loads(stdout); assert set(response) == {'text'}
                output = response['text'].encode(); assert len(output) == 151 and sha(output) == EXPECTED
                elapsed = time.perf_counter_ns() - started
            except subprocess.TimeoutExpired:
                process.kill(); stdout, stderr = process.communicate(); raise
            finally:
                (out / (label + '.stdout')).write_bytes(stdout)
                (out / (label + '.stderr')).write_bytes(stderr)
            (out / (label + '.md')).write_bytes(output)
            result['samples'].append({'label': label, 'pid': process.pid, 'exit_code': process.returncode,
                'elapsed_ns': elapsed, 'output_sha256': sha(output), 'stdout_sha256': sha(stdout), 'stderr_sha256': sha(stderr)})
        assert {name: sha((source / name).read_bytes()) for name in FILES} == hashes
        result.update(status='PASS_SCOPED_SAME_NATIVE_RECIPE_OUTPUT', source_unchanged=True,
                      repeat_median_ns=statistics.median(x['elapsed_ns'] for x in result['samples'][1:4]))
    except Exception as error:
        result.update(status='FAIL', error=type(error).__name__ + ': ' + str(error)); raise
    finally:
        result['finished_utc'] = datetime.now(timezone.utc).isoformat()
        result['host']['load_average_after'] = os.getloadavg()
        (out / 'report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
