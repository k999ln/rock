"""Strict offline evidence contract for the native proposal UI verifier.

Nothing in this module starts a guest, writes a business DB, or sends an RPC.
Fixture tests of this contract are not UI/OS evidence.
"""
import hashlib
import json
import math
import re
import uuid

TOOL = 'org.rockstar.proposal-draft'
VERSIONS = ('1.0.0', '1.1.0')
NATIVE_KEY = re.compile(r'ui-[0-9a-f]{32}')


def require(condition, message):
    if not condition: raise ValueError(message)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def hashed(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def plan(mode):
    require(mode in ('lifecycle', 'soak'), 'unknown business verifier mode')
    return {'schema': 'rock-native-business-plan/1', 'mode': mode, 'tool': TOOL,
            'versions': list(VERSIONS), 'normal_boot_shutdown_cycles': 5 if mode == 'soak' else 2,
            'soak_seconds': 3600 if mode == 'soak' else 0, 'soak_jobs': 61 if mode == 'soak' else 0,
            'job_interval_seconds': 60, 'network': 'none',
            'limits': {'boot_seconds': 180, 'shutdown_seconds': 60, 'ui_state_seconds': 30,
                       'job_seconds': 90, 'stored_job_seconds': 30, 'soak_max_seconds': 4200,
                       'max_job_start_gap_seconds': 180, 'peak_rss_kib': 2 * 1024 * 1024,
                       'rss_growth_kib': 512 * 1024, 'cpu_cores_average': 3.5,
                       'sample_seconds': 2, 'sample_gap_seconds': 10,
                       'max_samples': 4000, 'max_screenshots': 1000, 'max_probes': 12000,
                       'max_screenshot_bytes': 256 * 1024 * 1024, 'max_evidence_bytes': 600 * 1024 * 1024},
            'zero_tolerance': ['missing or duplicate receipt/job', 'changed retained job/output',
                               'unexpected audit/registry/Wallet/membership/authenticator/remote DB mutation',
                               'QMP reset or host shutdown', 'unclosed journal or filesystem error',
                               'missing UI state, visible error, OCR uncertainty'],
            'scope': {'wallet': 'SIMULATOR_ONLY; no consent, credit, payment or withdrawal actions',
                      'real_funds': 'NOT_RUN', 'hardware': 'NOT_RUN',
                      'in_flight_cancel': 'NOT_RUN; disable denies later use, not a timed cancellation test',
                      'resources': 'host QEMU RSS/CPU only; guest per-service UID/cgroup is NOT_RUN',
                      'evidence': 'actual QMP input + semantic screenshots + stopped-disk SQLite; no mutation RPC'}}


def job_input(label):
    require(re.fullmatch(r'C[0-9]J[0-9]{1,3}', label) is not None, 'fixed synthetic input label required')
    return canonical({'title': 'Brief ' + label, 'requirements': ['Prepare a proposal'],
                      'deliverables': ['Draft for review'], 'deadline': 'Friday', 'price': 'Not agreed'}).decode()


def expected_output(text, version):
    """Independent, fixed business expectation; does not execute the tested worker."""
    require(version in VERSIONS, 'unknown business version')
    data = json.loads(text)
    require(set(data) == {'title', 'requirements', 'deliverables', 'deadline', 'price'} and
            data['requirements'] == ['Prepare a proposal'] and data['deliverables'] == ['Draft for review'] and
            data['deadline'] == 'Friday' and data['price'] == 'Not agreed' and
            re.fullmatch(r'Brief C[0-9]J[0-9]{1,3}', data['title']), 'input is not the predeclared synthetic brief')
    title = data['title']
    if version == '1.0.0':
        prose = ('ご依頼「' + title + '」について、次の内容で進める案です。\n\n確認する要件\n'
                 '- Prepare a proposal\n\n予定する納品物\n- Draft for review\n\n'
                 '希望納期: Friday\n希望金額: Not agreed\n\n内容を確認してから、提案文を仕上げます。')
    else:
        prose = ('「' + title + '」の提案案\n要件: Prepare a proposal\n納品物: Draft for review\n'
                 '希望納期: Friday\n希望金額: Not agreed')
    return json.dumps({'schema_version': 1, 'kind': 'proposal_draft', 'state': 'draft',
                       'format': 'standard' if version == '1.0.0' else 'concise', 'proposal': prose,
                       'checklist': ['募集内容と提案内容の一致を確認', '納品物と修正範囲を確認', '納期と金額を確認'],
                       'warnings': [], 'external_submission': False, 'revenue_verified': False},
                      ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)


def preserve_rows(before, after):
    for table in ('hub_jobs', 'hub_audit', 'hub_requests'):
        retained = {hashed(row) for row in after[table]}
        require(all(hashed(row) in retained for row in before[table]), 'retained business row lost or changed: ' + table)


def validate_hub(rows, operations, package_hashes):
    require(set(package_hashes) == set(VERSIONS) and len(set(package_hashes.values())) == 2 and
            all(re.fullmatch('[0-9a-f]{64}', v) for v in package_hashes.values()), 'two distinct signed business versions required')
    require(not rows['hub_revoked'] and not rows['rock_registry_requests'], 'unexpected revocation or registry operation')
    receipts, jobs = rows['hub_requests'], rows['hub_jobs']
    audits = sorted(rows['hub_audit'], key=lambda r: r['seq'])
    require(len(receipts) == len(audits) == len(operations), 'unexpected or missing receipt/audit')
    require(len({r['key'] for r in receipts}) == len(receipts) and
            all(NATIVE_KEY.fullmatch(r['key']) for r in receipts), 'each receipt requires a unique native UI key')
    require(len({r['id'] for r in jobs}) == len({r['key'] for r in jobs}) == len(jobs), 'duplicate job identity')
    require(len(jobs) == sum(op['op'] == 'run' for op in operations), 'unexpected or missing job')
    available, cached, used_keys, used_jobs, job_evidence = None, set(), set(), set(), []
    for index, operation in enumerate(operations):
        action, version = operation['op'], operation.get('version')
        require(action in ('install', 'update', 'approve', 'rollback', 'disable', 'uninstall', 'run'), 'unapproved action')
        request = {'v': 1, 'op': action, 'id': TOOL}
        if action in ('install', 'update', 'approve', 'rollback'):
            require(version in VERSIONS, 'unknown lifecycle version')
            request['version'] = version
        if action in ('install', 'update'):
            require((available is None) == (action == 'install'), 'wrong install/update transition')
            cached.add(version); available = {'id': TOOL, 'version': version, 'enabled': 0}
            result = {'id': TOOL, 'version': version, 'hash': package_hashes[version], 'enabled': False}
            event, body = 'installed_disabled', {k: result[k] for k in ('id', 'version', 'hash')}
        elif action == 'approve':
            require(available is not None and available['version'] == version and available['enabled'] == 0,
                    'approval must follow disabled installation/lifecycle state')
            request['approved_hash'] = package_hashes[version]
            available['enabled'] = 1
            result = {'id': TOOL, 'enabled': True}
            event, body = 'enabled', {'id': TOOL, 'hash': package_hashes[version]}
        elif action == 'run':
            require(available == {'id': TOOL, 'version': version, 'enabled': 1}, 'run bypassed version-specific approval')
            text = operation['input']; expected = expected_output(text, version)
            request.update(text=text, target='device_local')
            payload_hash = hashed({'id': TOOL, 'text': text, 'target': 'device_local'})
            matched = [j for j in jobs if j['request_hash'] == payload_hash]
            require(len(matched) == 1, 'input must have exactly one durable job')
            job = matched[0]
            require(str(uuid.UUID(job['id'])) == job['id'] and job['id'] not in used_jobs,
                    'job identifier is invalid or reused')
            used_jobs.add(job['id'])
            require(job['tool_id'] == TOOL and job['version'] == version and job['package_hash'] == package_hashes[version] and
                    job['status'] == 'succeeded' and job['error'] is None and job['output'] == expected and
                    job['input_bytes'] == len(text.encode()), 'job content, admission or completion differs')
            elapsed = job['finished'] - job['created']
            require(math.isfinite(elapsed) and 0 <= elapsed <= 30, 'stored job exceeded its declared time budget')
            event, body = 'run_approved', {'job_id': job['id'], 'package_hash': package_hashes[version],
                                         'execution_target': 'device_local', 'actual_host': 'rock_os_linux_namespace',
                                         'sent_to_cloud': False, 'amount_minor': 0}
        else:
            require(available is not None, 'lifecycle action requires installed tool')
            if action == 'rollback':
                require(version in cached and available['version'] != version, 'rollback requires another cached signed version')
                available.update(version=version, enabled=0)
            elif action == 'disable':
                require(available['enabled'] == 1, 'disable requires enabled tool')
                available['enabled'] = 0
            else: available, cached = None, set()
            result = {'id': TOOL, 'action': action}
            event, body = action, {'id': TOOL, 'version': version if action == 'rollback' else None}
        candidates = [r for r in receipts if r['key'] not in used_keys and
                      r['request_hash'] == hashed(dict(request, key=r['key'])) and
                      (action != 'run' or r['key'] == job['key'])]
        # Re-approval of the same cached version has the same payload except
        # its fresh key. Receipts lack timestamps: establish a bijection, not
        # an invented temporal ordering of those indistinguishable approvals.
        require(candidates, 'exact UI request hash missing')
        receipt = sorted(candidates, key=lambda r: r['key'])[0]; used_keys.add(receipt['key'])
        reply = json.loads(receipt['result'])
        if action == 'run':
            require(receipt['key'] == job['key'] and reply.get('status') in ('running', 'succeeded') and
                    all(reply.get(k) == job[k] for k in ('id', 'key', 'request_hash', 'tool_id', 'version', 'input_bytes', 'package_hash', 'created')) and
                    reply.get('error') is None, 'job receipt identity differs')
            require((reply['status'] == 'running' and reply.get('output') is None and reply.get('finished') is None) or
                    (reply['status'] == 'succeeded' and reply.get('output') == expected and reply.get('finished') == job['finished']),
                    'job receipt result differs')
            job_evidence.append({'id': job['id'], 'key': job['key'], 'version': version,
                                 'input_sha256': hashlib.sha256(text.encode()).hexdigest(), 'request_hash': payload_hash,
                                 'output_sha256': hashlib.sha256(expected.encode()).hexdigest(),
                                 'receipt_sha256': hashed(receipt), 'package_hash': package_hashes[version]})
        else: require(reply == result, 'lifecycle receipt result differs')
        audit = audits[index]
        require(audit['seq'] == index + 1 and audit['event'] == event and json.loads(audit['body']) == body,
                'audit includes missing, reordered or unauthorized native action')
    require(rows['hub_installed'] == ([available] if available else []), 'final installed state differs')
    require(len(rows['hub_packages']) == len(cached) and {p['version'] for p in rows['hub_packages']} == cached,
            'cached package coverage differs')
    for package in rows['hub_packages']:
        require(package['id'] == TOOL and package['version'] in cached and
                hashed(json.loads(package['body'])) == package['hash'] == package_hashes[package['version']],
                'cached signed package differs')
    return {'jobs': job_evidence, 'installed': rows['hub_installed'], 'actions': len(operations),
            'audit_sha256': hashed(audits), 'requests_sha256': hashed(sorted(receipts, key=lambda r: r['key']))}


def validate_soak(frozen, expected_hash, observed):
    require(hashed(frozen) == expected_hash, 'frozen thresholds changed after execution began')
    require(frozen['mode'] == 'soak' and frozen['normal_boot_shutdown_cycles'] >= 5 and
            frozen['soak_seconds'] >= 3600 and frozen['soak_jobs'] >= 61, 'full soak plan required')
    limits, cycles, soak, resources = frozen['limits'], observed['cycles'], observed['soak'], observed['resources']
    def bounded(value, maximum, minimum=0):
        return type(value) in (float, int) and math.isfinite(value) and minimum <= value <= maximum
    require(len(cycles) == frozen['normal_boot_shutdown_cycles'] and
            len({c['boot_id'] for c in cycles}) == len(cycles), 'five distinct normal boots required')
    for cycle in cycles:
        require(cycle['clean_exit'] is True and cycle['retention_verified'] is True and
                bounded(cycle['boot_seconds'], limits['boot_seconds']) and
                bounded(cycle['shutdown_seconds'], limits['shutdown_seconds']), 'normal boot/shutdown or retention failed')
    require(bounded(soak['elapsed_seconds'], limits['soak_max_seconds'], frozen['soak_seconds']) and
            soak['jobs'] == frozen['soak_jobs'] and bounded(soak['max_job_seconds'], limits['job_seconds']) and
            bounded(soak['max_start_gap_seconds'], limits['max_job_start_gap_seconds']), 'soak duration, jobs or latency failed')
    require(bounded(resources['peak_rss_kib'], limits['peak_rss_kib'], 1) and
            bounded(resources['rss_growth_kib'], limits['rss_growth_kib']) and
            bounded(resources['cpu_cores_average'], limits['cpu_cores_average']) and
            bounded(resources['samples'], limits['max_samples'], 360) and
            bounded(resources['max_sample_gap_seconds'], limits['sample_gap_seconds'], .01), 'resource evidence or budget failed')
