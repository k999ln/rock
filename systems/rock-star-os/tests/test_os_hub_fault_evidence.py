"""Negative host evidence fixtures only; never boot, trace or signal a VM."""
import copy
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'os/platform/hub_fault_fixture.py'
spec = importlib.util.spec_from_file_location('hub_fault_contract_test', SOURCE)
contract = importlib.util.module_from_spec(spec); spec.loader.exec_module(contract)
host_spec = importlib.util.spec_from_file_location('hub_fault_host_test',SOURCE.parents[1]/'verify-hub-faults.py')
host = importlib.util.module_from_spec(host_spec); host_spec.loader.exec_module(host)


def identity():
    return {'pid': 201, 'start_ticks': 99, 'ppid': 101, 'tgid': 201,
            'uid': [1002]*4, 'gid': [1002]*4, 'exe': '/usr/libexec/rock-sandbox-exec',
            'command': ['/usr/libexec/rock-sandbox-exec', 'recipe'], 'tracer_pid': 50}


def durable_fixture():
    sha='a'*64
    jobs=[]
    for index,key in enumerate(['d3-hub:crash','d3-hub:crash:explicit-retry']):
        jobs.append({'id':'00000000-0000-4000-8000-'+format(index+1,'012x'),'key':key,
                     'request_hash':contract.hashed({'id':contract.TOOL,'text':contract.TEXT,'target':'device_local'}),
                     'tool_id':contract.TOOL,'version':contract.VERSION,'status':'failed' if index==0 else 'succeeded',
                     'input_bytes':len(contract.TEXT.encode()),'output':None if index==0 else contract.OUTPUT,
                     'error':'worker interrupted or invalid output' if index==0 else None,
                     'created':10.0+index,'finished':10.1+index,'package_hash':sha})
    requests=[{'v':1,'op':'install','id':contract.TOOL,'version':contract.VERSION,'key':'d3-hub:install'},
              {'v':1,'op':'approve','id':contract.TOOL,'approved_hash':sha,'key':'d3-hub:approve'}]
    replies=[{'id':contract.TOOL,'version':contract.VERSION,'hash':sha,'enabled':False},
             {'id':contract.TOOL,'enabled':True}]
    audit=[{'seq':1,'event':'installed_disabled','body':json.dumps({'id':contract.TOOL,'version':contract.VERSION,'hash':sha})},
           {'seq':2,'event':'enabled','body':json.dumps({'id':contract.TOOL,'hash':sha})}]
    for index,job in enumerate(jobs):
        requests.append({'v':1,'op':'run','id':contract.TOOL,'text':contract.TEXT,'target':'device_local','key':job['key']})
        replies.append(dict(job,status='running',output=None,error=None,finished=None))
        audit.append({'seq':index+3,'event':'run_approved','body':json.dumps({'job_id':job['id'],'package_hash':sha,
                      'execution_target':'device_local','actual_host':'rock_os_linux_namespace','sent_to_cloud':False,'amount_minor':0})})
    receipts=[{'key':request['key'],'request_hash':contract.hashed(request),'result':json.dumps(reply)}
              for request,reply in zip(requests,replies)]
    return {'hub_jobs':jobs,'hub_requests':receipts,'hub_audit':audit},sha


class FaultEvidenceGuards(unittest.TestCase):
    def test_fixed_shutdown_keys_pass_the_unchanged_power_service_contract(self):
        spec = importlib.util.spec_from_file_location('hub_fixture_power_contract',
            Path(__file__).resolve().parents[1] / 'os/system/power_service.py')
        power = importlib.util.module_from_spec(spec); spec.loader.exec_module(power)
        for mode in contract.MODES:
            key = 'd3-hub-poweroff-' + mode
            contract.validate_request({'v': 1, 'op': 'device.poweroff', 'key': key})
            power.validate({'v': 1, 'op': 'poweroff', 'key': key})
            with self.assertRaises(ValueError):
                contract.validate_request({'v': 1, 'op': 'device.poweroff', 'key': 'd3-hub:poweroff:' + mode})
            with self.assertRaises(power.Rejected):
                power.validate({'v': 1, 'op': 'poweroff', 'key': 'd3-hub:poweroff:' + mode})

    def test_explicit_live_serial_failure_stops_only_its_new_process_promptly(self):
        with tempfile.TemporaryDirectory() as temporary:
            log = Path(temporary) / 'boot.log'
            started = time.monotonic()
            with self.assertRaisesRegex(ValueError, 'explicitly reported failure'):
                host.boot([sys.executable, '-u', '-c',
                           "import time; print('ROCK_HUB_FAULT_FAIL explicit synthetic failure'); time.sleep(8)"], log)
            self.assertLess(time.monotonic() - started, 4)
            self.assertIn('ROCK_HUB_FAULT_FAIL', log.read_text())

    def test_serial_failure_requires_an_exact_complete_record(self):
        for text in (b'ROCK_HUB_FAULT_FAIL refused\n', b'ROCK_HUB_FAULT_FAIL\r\n'):
            with self.assertRaises(ValueError):
                host.reject_serial_failure(text)
        for text in (b'quoted ROCK_HUB_FAULT_FAIL refused\n', b'ROCK_HUB_FAULT_FAIL refused',
                     b'ROCK_HUB_FAULT_FAILURE not a marker\n'):
            host.reject_serial_failure(text)

    def test_both_receipts_request_hashes_and_ordered_audits_bind_actual_jobs(self):
        rows,sha=durable_fixture();contract.validate_durable_rows(rows,sha)
        mutations=[lambda r:r['hub_requests'][-1].update(key='unrelated-receipt'),
                   lambda r:r['hub_requests'][-1].update(request_hash='bad-hash'),
                   lambda r:r['hub_requests'][-1].update(result=json.dumps(dict(json.loads(r['hub_requests'][-1]['result']),id='other-job'))),
                   lambda r:r['hub_audit'][-1].update(event='unrelated'),
                   lambda r:r['hub_audit'][-1].update(body=r['hub_audit'][-1]['body'].replace('rock_os_linux_namespace','host_python')),
                   lambda r:r['hub_jobs'][-1].update(package_hash='b'*64)]
        for mutate in mutations:
            changed=copy.deepcopy(rows);mutate(changed)
            with self.assertRaises(ValueError):contract.validate_durable_rows(changed,sha)

    def test_changed_or_missing_original_input_saves_fail_and_raises_even_after_preflight(self):
        for mutation in ('write','remove'):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as temporary:
                output=Path(temporary);inputs={name:output/name for name in ('Image','rootfs.ext4','stage0.cpio.gz')}
                for path in inputs.values():path.write_bytes(b'explicit synthetic source');path.chmod(0o444)
                before={name:host.digest(path) for name,path in inputs.items()}
                identities={name:host.regular(path) for name,path in inputs.items()}
                if mutation=='write':inputs['Image'].chmod(0o600);inputs['Image'].write_bytes(b'changed')
                else:inputs['Image'].unlink()
                report={'status':'PREFLIGHT_ONLY'}
                with redirect_stdout(io.StringIO()),self.assertRaises(ValueError):
                    host.finish_report(output,report,inputs,before,identities)
                self.assertEqual(json.loads((output/'report.json').read_text())['status'],'FAIL')

    def test_no_general_rpc_or_remote_execution_is_exposed(self):
        request = {'v':1,'op':'run','id':contract.TOOL,'text':contract.TEXT,'target':'device_local','key':'d3-hub:crash'}
        contract.validate_request(request)
        for key,value in [('op','wallet.sale'),('id','other.tool'),('text','arbitrary command'),('target','cloud'),('key','arbitrary-key')]:
            with self.subTest(key=key), self.assertRaises(ValueError): contract.validate_request(dict(request, **{key:value}))
        with self.assertRaises(ValueError): contract.validate_request(dict(request, path='/arbitrary'))

    def test_only_the_new_exact_platform_launcher_can_be_signalled(self):
        child = identity()
        contract.validate_launcher(child, parent_pid=101, tracer_pid=50, previous_pids={7, 8})
        for name, value in [('ppid', 100), ('tgid', 101), ('uid', [0]*4), ('gid', [1000]*4),
                            ('exe', '/usr/bin/python3'), ('command', ['/usr/libexec/rock-sandbox-exec', 'probe']),
                            ('tracer_pid', 0), ('start_ticks', True)]:
            bad = copy.deepcopy(child); bad[name] = value
            with self.subTest(name=name), self.assertRaises(ValueError):
                contract.validate_launcher(bad, parent_pid=101, tracer_pid=50, previous_pids={7, 8})
        with self.assertRaises(ValueError):
            contract.validate_launcher(child, parent_pid=101, tracer_pid=50, previous_pids={201})

    def test_stale_pid_identity_and_unobserved_fault_are_rejected(self):
        before = identity()
        contract.same_identity(before, copy.deepcopy(before))
        for name in ('pid', 'start_ticks', 'ppid'):
            after = copy.deepcopy(before); after[name] += 1
            with self.assertRaises(ValueError): contract.same_identity(before, after)
        for mode in ('crash', 'deadline'):
            with self.assertRaises(ValueError): contract.validate_fault(mode, {'identity': before, 'signal': 9,
                'stopped': False, 'exited': False, 'elapsed_seconds': .01})

    def test_exact_timeout_and_crash_failure_never_accept_success_or_early_timeout(self):
        for mode, error, seconds in [('crash', 'worker interrupted or invalid output', .1),
                                     ('deadline', 'time limit exceeded', 3.1)]:
            row = {'status': 'failed', 'error': error, 'output': None, 'created': 10., 'finished': 10.+seconds}
            contract.validate_failure(mode, row)
            for field, value in [('status', 'succeeded'), ('error', None), ('output', 'fake result'), ('finished', float('nan'))]:
                bad = dict(row); bad[field] = value
                with self.assertRaises(ValueError): contract.validate_failure(mode, bad)
        with self.assertRaises(ValueError): contract.validate_failure('deadline', dict(row, finished=10.1))

    def test_same_key_receipt_replay_must_not_be_mistaken_for_a_new_job(self):
        accepted = {'ok': True, 'result': {'id': 'a', 'key': 'same', 'status': 'running'}}
        contract.validate_replay(accepted, copy.deepcopy(accepted))
        with self.assertRaises(ValueError):
            contract.validate_replay(accepted, {'ok': True, 'result': {'id': 'b', 'key': 'same', 'status': 'running'}})

    def test_runtime_manifest_allows_only_fixed_new_hooks(self):
        before = {'usr/bin/python3.13': {'kind': 'file', 'sha256': 'a'*64}}
        added = {'usr/libexec/rock-hub-fault-fixture.py': {'kind': 'file', 'sha256': 'b'*64}}
        contract.validate_manifest(before, {**before, **added}, set(added))
        with self.assertRaises(ValueError): contract.validate_manifest(before, added, set(added))
        with self.assertRaises(ValueError): contract.validate_manifest(before, {**before, 'etc/other': {}}, set(added))
        with self.assertRaises(ValueError): contract.validate_manifest(before, {**before, **added, 'usr/bin/python3.13': {}}, set(added))

    def test_complete_matrix_cannot_skip_a_fault_or_restart(self):
        with self.assertRaises(ValueError): contract.validate_matrix([])
        with self.assertRaises(ValueError): contract.validate_matrix([{'mode': 'crash', 'status': 'PASS'}])
        with self.assertRaises(ValueError): contract.validate_matrix([{'mode': mode, 'status': 'NOT_RUN'} for mode in ('crash','deadline','recovery')])


if __name__ == '__main__': unittest.main()
