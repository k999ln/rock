#!/usr/bin/env python3
"""Run frozen OS UI probes sequentially, stopping at the first original failure."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import sys
import json
import os
from pathlib import Path
import subprocess
import time


def now():
    return datetime.now(timezone.utc).isoformat()


def main():
    os.umask(0o077)
    ap = argparse.ArgumentParser(description=__doc__)
    for name in ('source', 'config', 'sandbox-config', 'output'):
        ap.add_argument('--' + name, type=Path, required=True)
    ap.add_argument('--commit', required=True)
    ap.add_argument('--freeze-sha256', required=True)
    args = ap.parse_args()
    assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
    previous_path = Path('/var/tmp/rock-final-c-9abf78a-01/orchestration.json')
    assert hashlib.sha256(previous_path.read_bytes()).hexdigest() == '31c6be06bf1ebe9c7bb992b95ff5ab171e4019692da7f928433b52f32e2a893d'
    previous = json.loads(previous_path.read_bytes())
    assert previous['status'] == 'FAIL_ORIGINAL_STAGE_RETAINED'
    assert [(s['stage'],s['status']) for s in previous['stages']] == [('game','PASS'),('audit','PASS'),('financial','PASS'),('citations','FAIL'),('demo','NOT_RUN')]
    for stage in previous['stages'][:4]:
        assert hashlib.sha256((previous_path.parent/(stage['stage']+'.log')).read_bytes()).hexdigest() == stage['log_sha256']
    boundary_path = Path('/var/tmp/rock-final-c-preflight-correction-02/report.json')
    assert hashlib.sha256(boundary_path.read_bytes()).hexdigest() == '9d6c7545b612b9fa2ec236049aaa9bb72719701fe84ba52cb0c5dbb691576030'
    boundary = json.loads(boundary_path.read_bytes())
    assert boundary['status'] == 'PASS_ORIGINAL_STATE_UNCHANGED_READY_FOR_REMAINING_STAGES'
    assert boundary['authority_complete_unchanged'] is True and boundary['financial_actions_repeated'] == 0
    assert len(boundary['guest_database_bytes_unchanged']) == 8 and all(v['matches_original_baseline'] is True for v in boundary['guest_database_bytes_unchanged'])
    assert boundary['original_orchestration_sha256'] == hashlib.sha256(previous_path.read_bytes()).hexdigest()
    assert boundary['root_c_config_sha256'] == hashlib.sha256(args.config.read_bytes()).hexdigest()
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
    names = [('citations', 'observe-pc-link-os.py'), ('demo', 'record-os-demo.py')]
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
    report = {'schema': 'rock-final-user-flow-continuation/1', 'process_umask': '0077', 'previous_orchestration_sha256': hashlib.sha256(previous_path.read_bytes()).hexdigest(), 'preflight_correction_sha256': hashlib.sha256(boundary_path.read_bytes()).hexdigest(), 'reused_complete_stages': previous['stages'][:3], 'source_commit': args.commit,
              'started_utc': now(), 'status': 'RUNNING', 'stages': stages,
              'orchestrator_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'freeze_sha256': args.freeze_sha256, 'preflight_source_files': len(freeze['source_files_sha256']),
              'preflight_source_and_images': 'PASS_EXACT_FROZEN_BYTES',
              'config_sha256': hashlib.sha256(config.read_bytes()).hexdigest(),
              'sandbox_config_sha256': hashlib.sha256(sandbox.read_bytes()).hexdigest(),
              'scope': 'Existing closed dedicated device after original Game/audit/financial PASS and zero-guest citation preflight FAIL. Only original remaining citations/demo probes; previous whole FAIL retained. Corrected host process umask, no repeated credit/purchase/financial action or cleanup after a failure.'}
    report_path = output / 'orchestration.json'
    def save():
        temporary = report_path.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        temporary.chmod(0o600)
        temporary.replace(report_path)
    save()
    def read_only_call(label, command):
        stdout = stderr = b''
        details = {'command':command, 'started_utc':now(), 'exit_code':None, 'timeout':False}
        try:
            result = subprocess.run(command, cwd=source, env=env, capture_output=True, timeout=30)
            stdout, stderr = result.stdout, result.stderr
            details['exit_code'] = result.returncode
            return result
        except subprocess.TimeoutExpired as error:
            stdout, stderr = error.stdout or b'', error.stderr or b''
            details.update(timeout=True, error=repr(error))
            raise
        finally:
            details['finished_utc'] = now()
            for kind, raw in [('stdout',stdout),('stderr',stderr)]:
                target = output/(label+'.'+kind); target.write_bytes(raw); target.chmod(0o600)
                details[kind+'_sha256'] = hashlib.sha256(raw).hexdigest()
            target=output/(label+'.result.json'); target.write_text(json.dumps(details,ensure_ascii=False,indent=2)+'\n');target.chmod(0o600)
    def demo_capture(label):
        path = output / ('demo-authority-' + label + '.json')
        command = ['/usr/bin/python3', '-B', str(source/'os/desktop/game_authority_ui_retention.py'),
                   'capture', '--policy', 'index-identity-maximum-time-only/1', '--config', str(sandbox)]
        captured = read_only_call('demo-capture-'+label, command)
        path.write_bytes(captured.stdout); path.chmod(0o600)
        if captured.returncode or captured.stderr:
            raise RuntimeError('Read-only demo authority capture failed: ' + captured.stderr.decode(errors='replace'))
        assert json.loads(captured.stdout)['schema'] == 'rock-game-authority-ui-retention/1'
        return path
    try:
        for stage in stages:
            stage.update(status='RUNNING', started_utc=now())
            save()
            print(json.dumps({'stage': stage['stage'], 'status': 'RUNNING', 'started_utc': stage['started_utc']}), flush=True)
            demo_before = demo_capture('before') if stage['stage'] == 'demo' else None
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
            if stage['stage'] == 'demo':
                demo_after = demo_capture('after')
                compared = read_only_call('demo-compare', ['/usr/bin/python3', '-B', str(source/'os/desktop/game_authority_ui_retention.py'),
                    'compare', '--policy', 'index-identity-maximum-time-only/1', '--before', str(demo_before), '--after', str(demo_after)])
                assert compared.returncode == 0 and not compared.stderr, compared.stderr.decode(errors='replace')
                external = json.loads(compared.stdout); assert external['status'] == 'PASS'
                sys.path[:0] = [str(source/'os/desktop'), str(source/'os'), str(source/'src')]
                spec = importlib.util.spec_from_file_location('final_demo_retention', source/'os/desktop/verify-backup.py')
                retention = importlib.util.module_from_spec(spec); spec.loader.exec_module(retention)
                profile = retention.retention_profile(device)
                before_guest = json.loads((output/'demo/guest-before.json').read_text())
                after_guest = json.loads((output/'demo/guest-state.json').read_text())
                assert set(before_guest) == set(after_guest) == set(profile['sources'])
                profile['sources'] = {k:v for k,v in profile['sources'].items() if k != 'hub'}
                retention.compare_business({k:v for k,v in before_guest.items() if k != 'hub'},
                                           {k:v for k,v in after_guest.items() if k != 'hub'}, profile)
                proof = {'schema':'rock-final-demo-stopped-retention/1', 'status':'PASS',
                         'source_commit':args.commit, 'external_authority':external,
                         'non_hub_guest_roles':sorted(profile['sources']),
                         'guest_policy':'Canonical frozen compare_business with complete non-Hub coverage; typed read clocks only as predeclared in device profile. Original demo separately verifies all prior Hub jobs and exactly one real new result.',
                         'inputs_sha256':{str(p.relative_to(output)):hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in [demo_before,demo_after,output/'demo/guest-before.json',output/'demo/guest-state.json',output/'demo/report.json']}}
                proof_path=output/'demo-stopped-retention.json'; proof_path.write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n'); proof_path.chmod(0o600)
                report['demo_stopped_retention_sha256']=hashlib.sha256(proof_path.read_bytes()).hexdigest(); save()
    except Exception as error:
        report.update(status='FAIL_ORIGINAL_OR_ADDITIONAL_READ_ONLY_GATE_RETAINED', error=repr(error), finished_utc=now())
        save()
        return 1
    report.update(status='PASS_REMAINING_UI_SEQUENCE_DEMO_ENCODING_AND_VISUAL_REVIEW_PENDING' , finished_utc=now())
    save()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
