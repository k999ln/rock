import hashlib
import importlib.util
import json
import sys
import time
import traceback
from pathlib import Path

base = Path('/var/tmp/rock-intermediate-d7927dd-r2/systems/rock-star-os')
sys.path.insert(0, str(base / 'os/desktop'))
spec = importlib.util.spec_from_file_location('ux_business', base / 'os/desktop/verify-business.py')
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
out = Path('/var/tmp/rock-release-hub-20260910/after-01')
out.mkdir(parents=True, exist_ok=False)
config = json.loads(Path('/var/tmp/rock-release-os-20260910/ux-after-d7927dd-config.json').read_text())
limits = b.contract.plan('lifecycle')['limits']
text = (base / 'os/tools/fixtures/citations.md').read_text()
expected = '紹介文です。\n\n```text\n（出典: [コード内の例](https://example.test/code)）\n```\n\n## 出典\n\n- [店舗情報](https://example.test/store)\n'
assert hashlib.sha256(text.encode()).hexdigest() == 'bad73028a4b23b6e046abc4a1463f2fa14ffd4f55844ec9146cdc9acc3b1387e'
plan = {'schema': 'rock-hub-ux-after/1', 'config': config, 'limits': limits,
        'source_commit': 'd7927dd69ddc53e3b95d501c7292ea7f8c015123',
        'input_sha256': hashlib.sha256(text.encode()).hexdigest(),
        'expected_output': expected, 'expected_output_sha256': hashlib.sha256(expected.encode()).hexdigest(),
        'operations': ['fresh boot', 'find citation', 'review/install/approve', 'sample', 'explicit run',
                       'saved result', 'unconnected actual cost', 'Wallet zero', 'normal shutdown',
                       'restart same device', 'history reopen same output', 'Wallet unchanged', 'normal shutdown'],
        'human_time': 'NOT_MEASURED; automatic QMP/OCR timings only',
        'scope': 'Intermediate real OS UX observation. Not final Game image, full D0-D6, real money or human usability.'}
b.guest.save(out / 'plan.json', plan)
(out / 'plan.json').chmod(0o444)
summary = {'status': 'RUNNING', 'cycles': [], 'started_at': time.time()}
old_rows = None
for cycle in range(2):
    folder = out / str(cycle + 1); folder.mkdir()
    report = {'status': 'RUNNING', 'input_events': [], 'screenshots': [], 'qmp_events': [], 'qmp_commands': [], 'ui_states': []}
    record = monitor = sampler = None
    started = time.monotonic()
    try:
        record = b.guest.start(config)
        b.guest.save(folder / 'owned-record.json', record)
        sampler = b.ResourceSampler(record, limits); sampler.start()
        monitor = b.power.Monitor(record['qmp_socket'], report)
        driver = b.ScreenDriver(monitor, folder, report, record, sampler, limits)
        driver.wait('ツール名・説明・IDで検索', seconds=limits['boot_seconds'], label='boot')
        driver.booting = False
        report['boot_ui_seconds'] = time.monotonic() - started
        if not cycle:
            driver.click('ツール名・説明・IDで検索', label='search')
            driver.native.type('org.rockstar.citation-organizer'); driver.native.keys(['ret'])
            driver.click('引用整理', exact_line=True, within=b.CATALOG_TITLE, regions=(b.CATALOG_TITLE,), label='citation-detail')
            driver.wait('バージョン 1.0.0', exact_line=True, label='review-version')
            driver.click('v1.0.0 をインストール', seek=True, label='install')
            driver.click('この権限を確認して利用を許可', seek=True, label='approve')
            driver.click('ツールを開く', seek=True, label='editor')
            driver.click('サンプルを入力', seek=True, label='sample')
            driver.wait('example.test/store', label='useful-sample')
            run_start = time.monotonic(); driver.native.keys(['ctrl', 'ret'])
            driver.wait('完了', label='done')
            driver.wait('紹介文です', label='actual-result')
            report['run_to_render_seconds'] = time.monotonic() - run_start
        reopen_start = time.monotonic()
        driver.nav('history')
        driver.click('引用整理', exact_line=True, within=b.HISTORY_TITLE, regions=(b.HISTORY_TITLE,), label='history')
        driver.wait('紹介文です', label='saved-result')
        report['reopen_to_render_seconds'] = time.monotonic() - reopen_start
        driver.wait('実費', label='actual-cost-unconnected')
        driver.nav('wallet'); driver.wait('Wallet', label='wallet-state')
        report['normal_shutdown_seconds'] = b.clean_shutdown(driver, record)
        sampler.stop()
        with b.closed_device(config, record) as data:
            state, rows, powers = b.retention.business_snapshot(data)
            assert len(rows['hub_jobs']) == 1
            job = rows['hub_jobs'][0]
            assert job['status'] == 'succeeded' and job['tool_id'] == 'org.rockstar.citation-organizer'
            assert job['input_bytes'] == len(text.encode()) and job['output'] == expected
            assert job['request_hash'] == b.contract.hashed({'id': job['tool_id'], 'text': text, 'target': 'device_local'})
            financial = state['wallet']['financial_summary']
            assert all(v == 0 for k,v in financial.items() if k not in ('currency','simulation_only'))
            if old_rows is not None: assert rows == old_rows
            old_rows = rows
            report.update(status='PASS_SCOPED_UX', data_sha256=b.guest.digest(data), job_id=job['id'],
                          package_hash=job['package_hash'], output_sha256=hashlib.sha256(job['output'].encode()).hexdigest(),
                          stored_job_seconds=job['finished']-job['created'], financial_summary=financial,
                          power_receipts=len(powers), retained_rows_unchanged=bool(cycle))
    except Exception as error:
        report.update(status='FAIL', error=repr(error), traceback=traceback.format_exc())
    finally:
        report['elapsed_seconds'] = time.monotonic() - started
        report['owned_device_running'] = b.guest.running(record) if record else False
        b.guest.save(folder / 'report.json', report)
        if sampler:
            try: sampler.stop()
            except Exception: pass
        if monitor:
            try: monitor.close()
            except Exception: pass
    summary['cycles'].append({k: report.get(k) for k in ('status','error','elapsed_seconds','owned_device_running','output_sha256','job_id')})
    if report['status'] != 'PASS_SCOPED_UX': break
summary['status'] = 'PASS_SCOPED_UX' if len(summary['cycles']) == 2 and all(c['status'] == 'PASS_SCOPED_UX' for c in summary['cycles']) else 'FAIL'
summary['finished_at'] = time.time()
b.guest.save(out / 'summary.json', summary)
print(json.dumps(summary, ensure_ascii=False))
