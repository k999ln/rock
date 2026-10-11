#!/usr/bin/env python3
"""Intermediate real OS Game UI probe; every mutation is a visible QMP input."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import time
import traceback


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--sandbox-config', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--resume-from', type=Path)
    args = parser.parse_args()
    base = args.source.resolve(strict=True)
    sys.path[:0] = [str(base/'os/desktop'), str(base/'os'), str(base/'src')]
    spec = importlib.util.spec_from_file_location('game_ui_business', base/'os/desktop/verify-business.py')
    b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
    import game_authority_observer as authority
    config = json.loads(args.config.read_text())
    assert config['schema'] == 'rock-desktop-device/7'
    output = args.output.resolve(); output.mkdir(parents=True, exist_ok=False, mode=0o700)
    limits = b.contract.plan('lifecycle')['limits']
    profile = b.retention.retention_profile(config)
    observer = authority.Observer(base/'os/game_exchange/sandbox.py', args.sandbox_config.resolve(),
                                  config['game']['authority_id'], output)
    previous_probe = None
    if args.resume_from:
        previous_probe = args.resume_from.resolve(strict=True)
        previous_plan = json.loads((previous_probe/'plan.json').read_text())
        previous_report = json.loads((previous_probe/'1/report.json').read_text())
        assert previous_plan['source_commit'] == args.commit and previous_plan['config'] == config
        assert previous_report['status'] == 'FAIL' and previous_report['owned_device_running'] is True
        assert "driver.wait('Public Game A', label='public-catalog')" in previous_report['traceback']
        assert any(s['phrase'] == '公開テスト残高 $100 を追加' for s in previous_report['ui_states'])
        before = json.loads((previous_probe/'authority-before.json').read_text())
    else:
        before = observer.invoke('snapshot')
    authority.empty_baseline(before)
    plan = {'schema': 'rock-game-real-ui-probe/1', 'source_commit': args.commit, 'config': config,
            'source_sha256': {str(p.relative_to(base)): hashlib.sha256(p.read_bytes()).hexdigest() for p in
                              [base/'os/ui/game-ui.inc', base/'os/game_exchange/device_client.py',
                               base/'os/game_exchange/reference_sdk.py', base/'os/game_exchange/sandbox.py']},
            'observer_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'limits': limits, 'flow_deadline_seconds': 600, 'cycles': 2,
            'expected': {'credit_minor': 10000, 'games': 2, 'principal_each': 100, 'fee_each': 3,
                         'units_each': 10, 'final_available_minor': 9794, 'monthly_consent': False},
            'scope': 'Intermediate frozen real OS UI/TLS only; not final D0-D6, real funds, external authors or human timings',
            'operations': ['register', 'enroll public authenticator', 'explicit Wallet terms',
                           'explicit one-time synthetic credit', 'Game A connection consent', 'Game A purchase approval',
                           'Game B connection consent', 'Game B purchase approval', 'Hub citation job',
                           'Wallet view', 'normal shutdown', 'read-only restart/history', 'normal shutdown']}
    if previous_probe:
        plan['continuation'] = {'previous_probe': str(previous_probe), 'previous_plan_sha256': hashlib.sha256((previous_probe/'plan.json').read_bytes()).hexdigest(),
                                'previous_report_sha256': hashlib.sha256((previous_probe/'1/report.json').read_bytes()).hexdigest(),
                                'boundary': 'same running OS, Wallet after original one-time credit; registration/enrollment/terms/credit are not repeated'}
    b.guest.save(output/'plan.json', plan); (output/'plan.json').chmod(0o444)
    b.guest.save(output/'authority-before.json', before)
    summary = {'status': 'RUNNING', 'started_utc': datetime.now(timezone.utc).isoformat(), 'cycles': []}

    def exact_button(driver, phrase, label, *, game=None, seconds=30):
        """Bounded observed text selector includes the dedicated PIN footer.

        Business driver deliberately excludes its ordinary footer. The Game
        full-screen confirmation has a different documented content boundary.
        This observer does not change the business/soak selector or OCR gate.
        """
        deadline = time.monotonic()+seconds
        while True:
            lines, metadata = driver.scan(deadline)
            matches = b.locate(lines, phrase, exact_line=True)
            matches = [m for m in matches if 130 < m['y'] < 900]
            if game:
                titles = b.locate(lines, 'Public Game '+game, exact_line=True)
                if len(titles) == 1:
                    top = titles[0]['y']
                    matches = [m for m in matches if top+75 < m['y'] < top+150]
                else: matches = []
            if matches:
                assert len(matches) == 1, 'ambiguous observed Game button'
                assert time.monotonic() <= deadline
                proof = driver.retain(metadata, label, lines)
                driver.report['ui_states'].append({'phrase': phrase, 'game': game, 'matches': matches,
                                                   'screenshot_sha256': proof['sha256'], 'observed_unix': time.time()})
                driver.native.click(matches[0]['x'], matches[0]['y']); return
            if time.monotonic() >= deadline:
                driver.retain(metadata, 'missing-'+label, lines)
                raise TimeoutError('observed Game button missing: '+phrase)
            time.sleep(.5)

    def game_pin(driver, heading, button):
        driver.wait(heading, label='separate-game-approval-review')
        driver.wait('試験PINを入力', label='game-public-pin')
        for _ in range(4):
            driver.native.monitor.command('send-key', {'keys': [{'type':'qcode','data':'0'}], 'hold-time':80})
            time.sleep(.15)
        driver.native.record('public-test-pin-entry', {'digits':4,'value_recorded':False})
        exact_button(driver, button, 'game-public-approval')

    def game_home(driver):
        driver.native.click(152, 26)
        driver.wait('合成WalletからGameへ', label='game-home')

    previous_rows = previous_state = previous_authority = previous_power = None
    try:
        for cycle in (1,2):
            folder = output/str(cycle); folder.mkdir(mode=0o700)
            report = {'status':'RUNNING','input_events':[],'screenshots':[],'qmp_events':[],'qmp_commands':[],'ui_states':[]}
            started = time.monotonic(); record = monitor = sampler = None
            try:
                if cycle == 1 and previous_probe:
                    record = json.loads((previous_probe/'1/owned-record.json').read_text())
                    assert b.guest.running(record)
                    current = json.loads((b.guest.BASE/config['name']/'running.json').read_text())
                    assert record.get('running') is True and record.get('reused') is False
                    assert current == {k:v for k,v in record.items() if k not in ('running','reused')}
                else:
                    observer.invoke('start')
                    record = b.guest.start(config)
                b.guest.save(folder/'owned-record.json', record)
                sampler = b.ResourceSampler(record, limits); sampler.start()
                monitor = b.power.Monitor(record['qmp_socket'], report)
                driver = b.ScreenDriver(monitor, folder, report, record, sampler, limits)
                driver.wait('Wallet サーバーと同期済み' if cycle == 1 and previous_probe else 'ツール名・説明・IDで検索', seconds=limits['boot_seconds'], label='resume-observed-wallet' if cycle == 1 and previous_probe else 'boot')
                driver.booting = False; report['boot_ui_seconds'] = time.monotonic()-started
                driver.operation_deadline = time.monotonic()+600
                if cycle == 1:
                    if not previous_probe:
                        driver.nav('wallet'); driver.click('テスト登録を始める', seek=True, label='explicit-registration')
                        driver.wait('月額テストへの同意はまだありません', seek=True, label='monthly-not-consented')
                        driver.click('試験認証器を登録する', seek=True, label='explicit-enrollment')
                        b.public_pin(driver, 'PINを確認して登録')
                        driver.click('Wallet利用条件を確認する', seek=True, label='explicit-terms')
                        driver.wait('Wallet試験の利用条件', label='terms-review')
                        driver.click('確認して実行', label='terms-approved')
                        driver.wait('試験認証器とWallet利用条件を確認済み', seek=True, label='wallet-active')
                        game_home(driver)
                        driver.click('公開テスト残高 $100 を追加', seek=True, label='explicit-public-credit')
                        driver.wait('Wallet サーバーと同期済み', label='credited-wallet')
                        game_home(driver)
                        driver.wait('Public Game A', label='public-catalog')
                    else:
                        game_home(driver)
                    for game in ('A','B'):
                        driver.top()
                        exact_button(driver, 'ゲームとWalletを接続', 'connect-'+game, game=game)
                        game_pin(driver, 'ゲームへの接続を確認', '認証して接続')
                        driver.wait('接続済み', label='connected-'+game)
                        exact_button(driver, '10単位の交換条件を確認', 'quote-'+game, game=game)
                        driver.wait('保留する合計', label='quote-total-'+game)
                        driver.click('内容を確認して購入の承認へ', seek=True, label='separate-purchase-'+game)
                        game_pin(driver, '今回の合成交換を確認', '認証して今回の交換を承認')
                        driver.wait('交換完了', label='completed-'+game)
                        driver.wait('現在保留している合成残高', label='held-display-'+game)
                        driver.click('‹ Gameの履歴', label='history-'+game)
                    driver.nav('hub')
                    driver.click('ツール名・説明・IDで検索', label='citation-search')
                    driver.native.type('org.rockstar.citation-organizer'); driver.native.keys(['ret'])
                    driver.click('引用整理', exact_line=True, within=b.CATALOG_TITLE, regions=(b.CATALOG_TITLE,), label='citation-detail')
                    driver.click('v1.0.0 をインストール', seek=True, label='citation-install')
                    driver.click('この権限を確認して利用を許可', seek=True, label='citation-approve')
                    driver.click('ツールを開く', seek=True, label='citation-editor')
                    driver.click('サンプルを入力', seek=True, label='citation-sample')
                    driver.native.keys(['ctrl','ret']); driver.wait('紹介文です', label='citation-actual-result')
                else:
                    game_home(driver); driver.wait('交換の履歴', seek=True, label='retained-game-history')
                    driver.wait('public-game-a', seek=True, label='retained-a')
                    driver.wait('public-game-b', seek=True, label='retained-b')
                    driver.nav('history')
                    driver.click('引用整理', exact_line=True, within=b.HISTORY_TITLE, regions=(b.HISTORY_TITLE,), label='retained-citation')
                    driver.wait('紹介文です', label='retained-result')
                driver.nav('wallet'); driver.wait('月額テストへの同意はまだありません', seek=True, label='monthly-still-not-consented')
                driver.operation_deadline = None
                report['normal_shutdown_seconds'] = b.clean_shutdown(driver, record)
                sampler.stop(); observer.invoke('stop')
                actual_authority = observer.invoke('snapshot'); b.guest.save(folder/'authority-after.json', actual_authority)
                with b.closed_device(config, record) as data:
                    state, rows, powers = b.retention.business_snapshot(data, profile)
                    assert len(rows['hub_jobs']) == 1 and rows['hub_jobs'][0]['status'] == 'succeeded'
                    assert hashlib.sha256(rows['hub_jobs'][0]['output'].encode()).hexdigest() == 'e5e655f1c0c3008fd895f0eba61f206cf83035d376ab63d76846bf0636840fa7'
                    if cycle == 2:
                        assert rows == previous_rows
                        b.retention.compare_business(previous_state, state, profile)
                        authority.unchanged(previous_authority, actual_authority)
                        b.verify_power(previous_power, powers, report['qmp_events'])
                    previous_rows, previous_state, previous_authority, previous_power = rows, state, actual_authority, powers
                    b.guest.save(folder/'guest-state.json', state)
                    report.update(status='PASS_SCOPED_UI_SEQUENCE', data_sha256=b.guest.digest(data),
                                  power_receipts=len(powers), job_id=rows['hub_jobs'][0]['id'],
                                  authority_snapshot_sha256=authority.digest(actual_authority))
            except Exception as error:
                report.update(status='FAIL', error=repr(error), traceback=traceback.format_exc())
                raise
            finally:
                report['elapsed_seconds'] = time.monotonic()-started
                report['owned_device_running'] = bool(record and b.guest.running(record))
                b.guest.save(folder/'report.json', report)
                if sampler: sampler.stop()
                if monitor: monitor.close()
                summary['cycles'].append({k:report.get(k) for k in ('status','error','elapsed_seconds','owned_device_running')})
        summary['status'] = 'PASS_SCOPED_UI_SEQUENCE_PENDING_LEDGER_AUDIT'
    except Exception as error:
        summary.update(status='FAIL', error=repr(error))
    finally:
        summary['finished_utc'] = datetime.now(timezone.utc).isoformat()
        b.guest.save(output/'summary.json', summary)
        print(json.dumps(summary, ensure_ascii=False))
    return 0 if summary['status'].startswith('PASS_') else 1


if __name__ == '__main__':
    raise SystemExit(main())
