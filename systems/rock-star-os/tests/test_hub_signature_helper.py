"""Host evidence guards; real file/ptrace/Hub cases use the Linux runner."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('hub_signature_guard',
    Path(__file__).resolve().parents[1] / 'os/platform/hub_fault_fixture.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


def helper():
    directory = '/tmp/rock-verify-abcdefgh'
    return {'pid': 201, 'ppid': 101, 'tgid': 201, 'tracer_pid': 50,
            'start_ticks': 99, 'uid': [1002]*4, 'gid': [1002]*4,
            'exe': '/usr/bin/openssl', 'no_new_privs': 1,
            'command': ['openssl', 'pkeyutl', '-verify', '-pubin', '-inkey', directory+'/key.der',
                        '-keyform', 'DER', '-rawin', '-in', directory+'/payload', '-sigfile', directory+'/signature']}


class SignatureHelperGuards(unittest.TestCase):
    def validate(self, child, used=False):
        return fixture.validate_verifier(child, parent_pid=101, tracer_pid=50,
                                         previous_pids={7, 8}, already_used=used)

    def test_exact_one_fixed_owned_signature_helper(self):
        self.assertEqual(self.validate(helper()), '/tmp/rock-verify-abcdefgh')
        with self.assertRaises(ValueError): self.validate(helper(), used=True)
        for key, value in [('exe', '/usr/bin/python3'), ('pid', 7), ('ppid', 100),
                           ('tracer_pid', 0), ('uid', [0]*4), ('gid', [1000]*4),
                           ('tgid', 101), ('start_ticks', True), ('no_new_privs', 0)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(dict(helper(), **{key: value}))

    def test_other_argv_paths_options_and_second_exec_are_rejected(self):
        for index, value in [(0, '/usr/bin/openssl'), (2, '-sign'), (5, '/tmp/arbitrary/key.der'),
                             (10, '/tmp/rock-verify-other123/payload'),
                             (12, '/tmp/rock-verify-abcdefgh/../signature')]:
            changed = helper(); changed['command'][index] = value
            with self.subTest(index=index), self.assertRaises(ValueError): self.validate(changed)
        changed = helper(); changed['command'].append('-quiet')
        with self.assertRaises(ValueError): self.validate(changed)

    def test_signature_input_bytes_are_pinned_before_any_resume(self):
        observed = dict(fixture.VERIFIER_INPUT_SHA256)
        fixture.validate_verification_hashes(observed)
        for name in ('key.der', 'payload', 'signature'):
            changed = dict(observed); changed[name] = '0'*64
            with self.subTest(name=name), self.assertRaises(ValueError):
                fixture.validate_verification_hashes(changed)
        with self.assertRaises(ValueError): fixture.validate_verification_hashes({})
        with self.assertRaises(ValueError): fixture.validate_verification_hashes(dict(observed, extra='0'*64))

    def test_host_requires_one_normal_verified_helper_before_distinct_launcher(self):
        proof = {'identity': helper(), 'input_sha256': dict(fixture.VERIFIER_INPUT_SHA256),
                 'resumed_without_signal': True, 'exit_status': 0}
        fixture.validate_verifier_evidence(proof, parent_pid=101, tracer_pid=50, launcher_pid=202)
        for key, value in [('exit_status', None), ('exit_status', 1), ('exit_status', False),
                           ('resumed_without_signal', False), ('input_sha256', {})]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                fixture.validate_verifier_evidence(dict(proof, **{key:value}), parent_pid=101,
                                                  tracer_pid=50, launcher_pid=202)
        with self.assertRaises(ValueError):
            fixture.validate_verifier_evidence(proof, parent_pid=101, tracer_pid=50, launcher_pid=201)
        with self.assertRaises(ValueError):
            fixture.validate_verifier_evidence(None, parent_pid=101, tracer_pid=50, launcher_pid=202)

    def test_complete_host_validation_rejects_old_or_incomplete_helper_evidence(self):
        from test_os_hub_fault_evidence import durable_fixture, host, identity
        rows, sha = durable_fixture()
        launcher = dict(identity(),pid=202,tgid=202)
        accepted = {'ok':True,'result':json.loads(rows['hub_requests'][2]['result'])}
        proof = {'schema':'rock-hub-fault-proof/1','status':'PASS','mode':'crash',
                 'durable_rows':rows,'job_count':2,'platform_identity':{'pid':101},
                 'fault':{'identity':launcher,'signal':9,'exited':True,'stopped':False,'elapsed_seconds':.01,
                          'capture_elapsed_seconds':.1,
                          'signature_verifier':{'identity':helper(),'input_sha256':dict(fixture.VERIFIER_INPUT_SHA256),
                                                'resumed_without_signal':True,'exit_status':0},
                          'prearm_inventory':{'method':'all-platform-threads-stopped-and-proc-stat-ppid',
                                              'process_count':4,'existing_children':0,'thread_ids':[101], 'elapsed_seconds':.01}},
                 'accepted':accepted,'replay':copy.deepcopy(accepted), 'failed_job':rows['hub_jobs'][0],
                 'retry_job':rows['hub_jobs'][1],'conflict':{'ok':False,'code':'rejected'}}
        host.validate_result(proof,'crash',rows,sha)
        for key, value in [('signature_verifier',None),('signature_verifier',[]),
                           ('capture_elapsed_seconds',None),('capture_elapsed_seconds',4.001),
                           ('capture_elapsed_seconds',float('nan'))]:
            changed = copy.deepcopy(proof); changed['fault'][key] = value
            with self.subTest(key=key,value=value), self.assertRaises(ValueError):
                host.validate_result(changed,'crash',rows,sha)


if __name__ == '__main__': unittest.main()
