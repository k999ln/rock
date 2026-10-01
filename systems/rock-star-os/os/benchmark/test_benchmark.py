"""Synthetic validation fixtures; these are not performance measurements."""
import copy
import unittest
from unittest.mock import MagicMock, patch
import struct

import common as c
import guest
import verify


def fixture():
    protocol = 'Synthetic unit-test protocol only'
    prepared = {'preregistration_sha256': c.sha(protocol.encode()), 'input_sha256': c.sha(c.INPUT.encode()),
                'sources': {'common.py': 'a' * 64, 'guest.py': 'b' * 64},
                'packages': {name: {'sha256': c.sha(name.encode())} for name in c.NAMES}}
    runtime = {name: 'c' * 64 for name in c.RUNTIME}
    runtime.update({'/usr/lib/rock-benchmark/' + name: digest for name, digest in prepared['sources'].items()})
    samples = []
    for phase, pair, order, variant in c.schedule():
        text, jobs = c.INPUT, []
        for step, name in enumerate(c.OPERATIONS if variant == 'A' else ('workflow',)):
            previous = text
            for op in c.OPERATIONS if name == 'workflow' else (name,):
                lines = text.split('\n')
                text = '\n'.join([x.strip() for x in lines] if op == 'trim_lines' else
                                 list(dict.fromkeys(lines)) if op == 'unique_lines' else sorted(lines))
            key = f'h2os-{phase}-{pair}-{variant}-{step}'
            jobs.append({'id': key, 'key': key, 'tool_id': c.IDS[name], 'status': 'succeeded', 'error': None,
                         'package_hash': prepared['packages'][name]['sha256'], 'input_bytes': len(previous.encode()),
                         'request_hash': c.sha(c.canonical({'id': c.IDS[name], 'text': previous, 'target': 'device_local'})),
                         'output': text})
        samples.append({'phase': phase, 'pair': pair, 'order_in_pair': order, 'variant': variant,
                        'status': 'succeeded', 'jobs': jobs, 'jobs_started': len(jobs),
                        'elapsed_ns': (3 if variant == 'A' else 1) * 1_000_000,
                        'output_matches_expected': True, 'output_sha256': c.sha(text.encode())})
    summary = c.summarize(samples)
    proof = {'schema': c.EXPERIMENT, 'status': 'COMPLETE', 'failures': [],
             'preregistration': {'text': protocol, 'sha256': prepared['preregistration_sha256']},
             'input': {'sha256': c.sha(c.INPUT.encode()), 'expected_output': c.EXPECTED, 'bytes': len(c.INPUT.encode())},
             'runtime_sha256_before': runtime, 'runtime_sha256_after': dict(runtime),
             'environment': {'uname': ['Linux', 'fixture', 'fixture', 'fixture', 'aarch64'], 'cpu_count': 2,
                             'proc_mounts': '/dev/vda / ext4 ro 0 0\n/dev/vdb /data ext4 rw,nosuid,nodev,noexec 0 0\n'},
             'preparation': {'uid': 1000, 'gid': 1000, 'wallet_sha256': 'fixture'},
             'downloaded_package_sha256': {n: x['sha256'] for n, x in prepared['packages'].items()},
             'completion': {'wallet_final_sha256': 'fixture', 'summary': summary}, 'summary': summary,
             'database': {'actual_job_count': 132, 'actual_run_audit_count': 132, 'all_api_jobs_match_readonly_database': True,
                          'all_runs_local_sandbox': True},
             'samples': samples, 'hypothesis_supported_within_test_conditions': True}
    return proof, prepared


class BenchmarkValidationTests(unittest.TestCase):
    def test_fixed_workload_schedule_and_statistics(self):
        self.assertEqual(11011, len(c.INPUT.encode()))
        self.assertEqual(66, len(list(c.schedule())))
        measured = [x for x in c.schedule() if x[0] == 'measured' and x[2] == 1]
        self.assertEqual(15, sum(x[3] == 'A' for x in measured))
        self.assertEqual(15, sum(x[3] == 'B' for x in measured))
        self.assertEqual(29, c.stats([i * 1_000_000 for i in range(1, 31)])['p95_ms_nearest_rank'])
        with self.assertRaises(ValueError):
            c.stats([float('nan')])

    def test_complete_synthetic_evidence_and_no_improvement_are_valid(self):
        proof, prepared = fixture()
        verify.validate_proof(proof, prepared)
        for sample in proof['samples']:
            if sample['variant'] == 'B':
                sample['elapsed_ns'] *= 5
        proof['summary'] = proof['completion']['summary'] = c.summarize(proof['samples'])
        proof['hypothesis_supported_within_test_conditions'] = False
        verify.validate_proof(proof, prepared)

    def test_missing_pair_duplicate_job_changed_output_and_wrong_identity_fail(self):
        mutations = [lambda p: p['samples'].pop(),
                     lambda p: p['samples'][1]['jobs'][0].update(id=p['samples'][0]['jobs'][0]['id']),
                     lambda p: p['samples'][0]['jobs'][-1].update(output='wrong'),
                     lambda p: p['preparation'].update(uid=0),
                     lambda p: p['database'].update(actual_job_count=131),
                     lambda p: p['runtime_sha256_after'].update({'/usr/bin/python3': 'changed'}),
                     lambda p: p['downloaded_package_sha256'].update(workflow='wrong'),
                     lambda p: p['summary']['A_three_tools'].update(median_ms=0)]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                proof, prepared = fixture()
                mutate(proof)
                with self.assertRaises(ValueError):
                    verify.validate_proof(proof, prepared)

    def test_wrong_peer_rejected_before_any_request(self):
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.getsockopt.return_value = struct.pack('3i', 123, 1000, 1000)
        with patch.object(guest.socket, 'socket', return_value=connection), patch.object(guest.socket, 'SO_PEERCRED', 17, create=True):
            with self.assertRaises(ValueError):
                guest.api('snapshot')
        connection.sendall.assert_not_called()

    def test_partial_response_does_not_return_success(self):
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.getsockopt.return_value = struct.pack('3i', 123, 1002, 1002)
        connection.recv.side_effect = [b'{"ok":true}', b'']
        with patch.object(guest.socket, 'socket', return_value=connection), patch.object(guest.socket, 'SO_PEERCRED', 17, create=True):
            with self.assertRaises(ValueError):
                guest.api('snapshot')


if __name__ == '__main__':
    unittest.main()
