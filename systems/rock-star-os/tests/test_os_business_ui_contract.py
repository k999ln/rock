"""Host evidence fixtures only: these tests never boot QEMU or attest a guest."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os/desktop'))
sys.path.insert(0, str(ROOT / 'src'))
import business_contract as contract
from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, verify_package
from blackberryrock.recipe_worker import proposal_draft


def packages():
    return {v: json.loads((ROOT / 'os/tools/dist' / (contract.TOOL + '--' + v + '.rock.json')).read_text())
            for v in contract.VERSIONS}


def fixture(operations):
    """Explicit synthetic native-shaped rows; independent of the validator."""
    bodies = packages()
    hashes = {v: verify_package(p, {TEST_PUBLISHER: PUBLIC_TEST_KEY})[1] for v, p in bodies.items()}
    rows = {name: [] for name in ('hub_jobs', 'hub_audit', 'hub_requests', 'hub_installed',
                                 'hub_packages', 'hub_revoked', 'rock_registry_requests')}
    cached, installed = {}, None
    for i, op in enumerate(operations, 1):
        key = 'ui-' + format(i, '032x')
        version, action = op.get('version'), op['op']
        req = {'v': 1, 'op': action, 'key': key, 'id': contract.TOOL}
        if action in ('install', 'update', 'approve', 'rollback'):
            req['version'] = version
        if action in ('install', 'update'):
            cached[version] = bodies[version]
            installed = {'id': contract.TOOL, 'version': version, 'enabled': 0}
            result = {'id': contract.TOOL, 'version': version, 'hash': hashes[version], 'enabled': False}
            event, body = 'installed_disabled', {k: result[k] for k in ('id', 'version', 'hash')}
        elif action == 'approve':
            req['approved_hash'] = hashes[version]
            installed['enabled'] = 1
            result = {'id': contract.TOOL, 'enabled': True}
            event, body = 'enabled', {'id': contract.TOOL, 'hash': hashes[version]}
        elif action == 'run':
            req.update(text=op['input'], target='device_local')
            job = {'id': '00000000-0000-4000-8000-' + format(i, '012x'), 'key': key,
                   'request_hash': contract.hashed({'id': contract.TOOL, 'text': op['input'], 'target': 'device_local'}),
                   'tool_id': contract.TOOL, 'version': version, 'package_hash': hashes[version],
                   'input_bytes': len(op['input'].encode()), 'status': 'succeeded', 'error': None,
                   'output': proposal_draft(op['input'], 'standard' if version == '1.0.0' else 'concise'),
                   'created': float(i), 'finished': float(i) + .25}
            rows['hub_jobs'].append(job)
            result = dict(job, status='running', output=None, finished=None)
            event, body = 'run_approved', {'job_id': job['id'], 'package_hash': hashes[version],
                                         'execution_target': 'device_local', 'actual_host': 'rock_os_linux_namespace',
                                         'sent_to_cloud': False, 'amount_minor': 0}
        else:
            result = {'id': contract.TOOL, 'action': action}
            event, body = action, {'id': contract.TOOL, 'version': version if action == 'rollback' else None}
            if action == 'rollback': installed.update(version=version, enabled=0)
            elif action == 'disable': installed['enabled'] = 0
            elif action == 'uninstall': installed, cached = None, {}
        rows['hub_audit'].append({'seq': i, 'event': event, 'body': json.dumps(body), 'created': float(i)})
        rows['hub_requests'].append({'key': key, 'request_hash': contract.hashed(req), 'result': json.dumps(result)})
    rows['hub_installed'] = [installed] if installed else []
    rows['hub_packages'] = [{'id': contract.TOOL, 'version': v, 'hash': hashes[v], 'body': json.dumps(p)}
                            for v, p in cached.items()]
    return rows, hashes


def lifecycle():
    ops = []
    for action, v in [('install', '1.0.0'), ('update', '1.1.0'), ('rollback', '1.0.0')]:
        ops.extend([{'op': action, 'version': v}, {'op': 'approve', 'version': v},
                    {'op': 'run', 'version': v, 'input': contract.job_input('C1J' + str(len(ops)))}])
    return ops + [{'op': 'disable'}, {'op': 'approve', 'version': '1.0.0'},
                  {'op': 'run', 'version': '1.0.0', 'input': contract.job_input('C1J9')}, {'op': 'uninstall'}]


class BusinessEvidence(unittest.TestCase):
    def test_two_real_signed_versions_have_distinct_reviewable_business_output(self):
        rows, hashes = fixture(lifecycle())
        evidence = contract.validate_hub(rows, lifecycle(), hashes)
        self.assertEqual(len(evidence['jobs']), 4)
        self.assertEqual(evidence['installed'], [])
        self.assertNotEqual(hashes['1.0.0'], hashes['1.1.0'])
        for row, expected in zip(rows['hub_jobs'], [x for x in lifecycle() if x['op'] == 'run']):
            self.assertEqual(row['output'], contract.expected_output(expected['input'], expected['version']))
            self.assertFalse(json.loads(row['output'])['external_submission'])

    def test_receipt_job_and_audit_must_agree_not_just_show_a_success_status(self):
        operations = lifecycle()
        mutations = {
            'missing receipt': lambda r: r['hub_requests'].pop(),
            'extra receipt': lambda r: r['hub_requests'].append(dict(r['hub_requests'][0], key='ui-' + 'f'*32)),
            'reused UI key': lambda r: r['hub_requests'][1].update(key=r['hub_requests'][0]['key']),
            'wrong input': lambda r: r['hub_jobs'][0].update(request_hash='f'*64),
            'wrong version': lambda r: r['hub_jobs'][0].update(version='1.1.0'),
            'wrong content': lambda r: r['hub_jobs'][0].update(output='plausible but unrelated proposal'),
            'unfinished': lambda r: r['hub_jobs'][0].update(status='running'),
            'double job': lambda r: r['hub_jobs'].append(dict(r['hub_jobs'][0], id='other-job')),
            'host substitution': lambda r: r['hub_audit'][2].update(body=r['hub_audit'][2]['body'].replace('rock_os_linux_namespace', 'host_python')),
            'unapproved mutation': lambda r: r['hub_audit'].append(dict(r['hub_audit'][0], seq=99)),
            'cloud request': lambda r: r['rock_registry_requests'].append({'key': 'unexpected'}),
            'stale installation': lambda r: r['hub_installed'].append({'id': contract.TOOL, 'version': '1.0.0', 'enabled': 1}),
            'tampered runtime': lambda r: r['hub_jobs'][0].update(finished=9000),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                rows, hashes = fixture(operations); mutate(rows)
                with self.assertRaises(ValueError): contract.validate_hub(rows, operations, hashes)

    def test_retained_rows_cannot_disappear_or_change_after_reboot_or_delete(self):
        old, _ = fixture(lifecycle()[:3]); new, _ = fixture(lifecycle())
        contract.preserve_rows(old, new)
        for table in ('hub_jobs', 'hub_audit', 'hub_requests'):
            changed = copy.deepcopy(new); changed[table].pop(0)
            with self.assertRaisesRegex(ValueError, 'retained'): contract.preserve_rows(old, changed)
        changed = copy.deepcopy(new); changed['hub_jobs'][0]['output'] = 'changed'
        with self.assertRaisesRegex(ValueError, 'retained'): contract.preserve_rows(old, changed)

    def test_a_renamed_fixture_version_cannot_make_an_update_test(self):
        rows, hashes = fixture(lifecycle())
        hashes['1.1.0'] = hashes['1.0.0']
        with self.assertRaises(ValueError): contract.validate_hub(rows, lifecycle(), hashes)

    def test_backup_preparation_reinstalls_only_after_real_delete_and_retains_older_jobs(self):
        operations = lifecycle() + [{'op': 'install', 'version': '1.0.0'}, {'op': 'approve', 'version': '1.0.0'},
                                  {'op': 'run', 'version': '1.0.0', 'input': contract.job_input('C1J999')}]
        before, _ = fixture(lifecycle()); after, hashes = fixture(operations)
        evidence = contract.validate_hub(after, operations, hashes)
        contract.preserve_rows(before, after)
        self.assertEqual(len(evidence['jobs']), 5)
        self.assertEqual(evidence['installed'], [{'id': contract.TOOL, 'version': '1.0.0', 'enabled': 1}])
        self.assertEqual([p['version'] for p in after['hub_packages']], ['1.0.0'])


class SoakBudgets(unittest.TestCase):
    def plan(self):
        return contract.plan('soak')

    def evidence(self):
        return {'cycles': [{'boot_seconds': 20, 'shutdown_seconds': 5, 'clean_exit': True,
                            'boot_id': 'boot-' + str(i), 'retention_verified': True} for i in range(5)],
                'soak': {'elapsed_seconds': 3601, 'jobs': 61, 'max_start_gap_seconds': 60,
                         'max_job_seconds': 40},
                'resources': {'peak_rss_kib': 1200000, 'rss_growth_kib': 20000,
                              'cpu_cores_average': 1.4, 'samples': 1801, 'max_sample_gap_seconds': 2.1}}

    def test_real_5_cycles_60_minutes_and_resource_thresholds_are_all_required(self):
        plan, observed = self.plan(), self.evidence()
        contract.validate_soak(plan, contract.hashed(plan), observed)
        cases = [('short soak', ('soak', 'elapsed_seconds'), 3599),
                 ('missed jobs', ('soak', 'jobs'), 60), ('unbounded latency', ('soak', 'max_job_seconds'), 91),
                 ('idle gap', ('soak', 'max_start_gap_seconds'), 181),
                 ('memory', ('resources', 'peak_rss_kib'), 2097153),
                 ('leak', ('resources', 'rss_growth_kib'), 524289),
                 ('cpu', ('resources', 'cpu_cores_average'), 3.6),
                 ('no samples', ('resources', 'samples'), 0),
                 ('sampling gap', ('resources', 'max_sample_gap_seconds'), 11)]
        for name, (group, key), value in cases:
            with self.subTest(name=name):
                changed = copy.deepcopy(observed); changed[group][key] = value
                with self.assertRaises(ValueError): contract.validate_soak(plan, contract.hashed(plan), changed)
        for mutate in (lambda r: r['cycles'].pop(), lambda r: r['cycles'][0].update(clean_exit=False),
                       lambda r: r['cycles'][1].update(boot_id='boot-0'),
                       lambda r: r['cycles'][0].update(retention_verified=False)):
            changed = copy.deepcopy(observed); mutate(changed)
            with self.assertRaises(ValueError): contract.validate_soak(plan, contract.hashed(plan), changed)

    def test_changing_thresholds_after_execution_or_short_mode_never_passes_soak(self):
        plan = self.plan(); old_hash = contract.hashed(plan)
        plan['limits']['job_seconds'] = 900
        with self.assertRaisesRegex(ValueError, 'frozen'): contract.validate_soak(plan, old_hash, self.evidence())
        short = contract.plan('lifecycle')
        with self.assertRaises(ValueError): contract.validate_soak(short, contract.hashed(short), self.evidence())

    def test_non_finite_measurements_do_not_pass_comparison_guards(self):
        for field in ('peak_rss_kib', 'rss_growth_kib', 'cpu_cores_average'):
            changed = self.evidence(); changed['resources'][field] = float('nan')
            with self.assertRaises(ValueError): contract.validate_soak(self.plan(), contract.hashed(self.plan()), changed)


if __name__ == '__main__': unittest.main()
