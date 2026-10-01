#!/usr/bin/env python3
"""Host-only C/OCR/Wallet fixture replay. Never QEMU or an existing device.

Requires Linux root, built os/ui/rock-ui-test, PIL and Tesseract eng+jpn.
Uses the unchanged C renderer and real disposable Wallet/authenticator fixture.
All mutations originate in C pointer/key actions checked against a fixed map.
This is not OS execution, guest power, resource, D2 or D5 acceptance evidence.
"""
import argparse
from contextlib import ExitStack
import importlib.util
import json
import hashlib
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path[:0] = [str(HERE), str(ROOT / 'os/ui')]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


business = load('business_wallet_ocr_fixture', HERE / 'verify-business.py')
fixture = load('wallet_ocr_c_fixture', ROOT / 'os/ui/test_wallet_replay.py')

# The exact expected native action is fixed before execution. Hitboxes only
# reject a wrong OCR target; they never find an alternative click coordinate.
ACTION_BY_PHRASE = {
    'テスト登録を始める': 'ACTION_WALLET_REGISTER',
    '試験認証器を登録する': 'ACTION_AUTH_BEGIN',
    'PINを確認して登録': 'ACTION_AUTH_SIGN',
    'Wallet利用条件を確認する': 'ACTION_WALLET_TERMS',
    '確認して実行': 'ACTION_CONFIRM',
    'テスト操作を開く': 'ACTION_WALLET_EXPAND',
    'テスト金額 (USD)': 'ACTION_AMOUNT',
    '売上を作る': 'ACTION_SALE',
    '売上を確定': 'ACTION_SETTLE',
    '$8.88 / 月のテストに同意する': 'ACTION_CONSENT',
    '今月のテスト請求を確認・再試行': 'ACTION_BILL',
    '月額テストの同意を取り消す': 'ACTION_CONSENT',
    'ATMで内容を確認': 'ACTION_ATM_OPEN',
    '予約内容を確認': 'ACTION_ATM_ISSUE',
    '認証して予約する': 'ACTION_AUTH_SIGN',
    '予約を取消・保留を照合': 'ACTION_ATM_CANCEL',
    '取消済み': 'ACTION_ATM_RESULT',
}


class NativeFixture:
    def __init__(self, renderer, folder, report):
        self.renderer, self.folder, self.report = renderer, folder, report
        self.monitor = self

    def command(self, operation, args):
        # The actual live helper sends the public PIN through its monitor.
        assert operation == 'send-key' and args == {
            'keys': [{'type': 'qcode', 'data': '0'}], 'hold-time': 80}, 'unexpected fixture monitor operation'
        self.renderer.keys(['0'])

    def record(self, action, value):
        self.report['input_events'].append({'action': action, 'value': value, 'sent_unix': time.time()})

    def capture(self, name):
        self.renderer.refresh()
        # Match the existing C replay's read-only polling: the native UI
        # alternates a snapshot with the current reservation status read.
        # PIN pages reject these reads; no mutation is synthesized here.
        self.renderer.send({'event': 'refresh'})
        self.renderer.send({'event': 'refresh'})
        path = self.folder / (name + '.png')
        self.renderer.send({'event': 'capture', 'path': str(path)})
        self.report['screenshots'].append(business.native.png_evidence(path))

    def click(self, x, y):
        if (x, y) == (606, 913):
            action, phrase = 'ACTION_NAV', 'wallet-footer'
        else:
            phrase = self.report['ui_states'][-1]['phrase']
            assert phrase in ACTION_BY_PHRASE, 'unmapped business Wallet pointer action'
            action = ACTION_BY_PHRASE[phrase]
        view = self.renderer.send({'event': 'inspect'})
        matches = [row for row in view['hits'] if row['action'] == action and
                   row['rect'][0] <= x < row['rect'][0] + row['rect'][2] and
                   row['rect'][1] <= y < row['rect'][1] + row['rect'][3]]
        assert len(matches) == 1, 'OCR coordinate is not inside its fixed expected C action: ' + phrase
        self.report['fixed_action_checks'].append({'phrase': phrase, 'action': action, 'point': [x, y],
                                                  'rectangle': matches[0]['rect']})
        self.renderer.send({'event': 'click', 'x': x, 'y': y, 'action': action})
        self.renderer.send({'event': 'park-pointer'})
        self.record('click', [x, y])

    def keys(self, names):
        self.renderer.keys(names)
        self.record('keys', names)

    def type(self, text):
        assert text == '20.00', 'only the frozen synthetic Wallet amount may be typed'
        self.renderer.type(text); self.record('type', text)


class Driver(business.ScreenDriver):
    def check(self):
        assert self.operation_deadline is None or time.monotonic() <= self.operation_deadline, 'frozen Wallet deadline exceeded'
        assert self.native.renderer.process.poll() is None, 'host C fixture exited before completion'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--renderer', type=Path, required=True)
    parser.add_argument('--font', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if sys.platform != 'linux' or os.geteuid() != 0:
        parser.error('fresh real Linux root Wallet fixture required; no skipped PASS')
    renderer, font = args.renderer.resolve(strict=True), args.font.resolve(strict=True)
    output = args.output.resolve(); output.mkdir(mode=0o700, parents=False, exist_ok=False)
    report = {'schema': 'rock-business-wallet-ocr-fixture/1', 'status': 'RUNNING',
              'qemu': 'NOT_RUN', 'D2': 'NOT_RUN', 'D5': 'NOT_RUN', 'scope': 'host C/OCR and disposable signed Wallet only',
              'input_events': [], 'screenshots': [], 'qmp_events': [], 'ui_states': [], 'fixed_action_checks': [],
              'action_map': ACTION_BY_PHRASE, 'limits': business.wallet_backup.plan(), 'minimum_confidence': 45,
              'ui_state_seconds': 30, 'ocr_thread_limit': 1,
              'source_sha256': {str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p): hashlib.sha256(p.read_bytes()).hexdigest()
                                for p in (HERE / 'verify-business.py', HERE / 'check-wallet-ocr.py', ROOT / 'os/ui/ui.c',
                                          ROOT / 'os/ui/test_wallet_replay.inc', renderer, font)}}
    (output / 'plan.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    try:
        with tempfile.TemporaryDirectory(prefix='rock-business-wallet-fixture-') as temporary, ExitStack() as stack:
            root = Path(temporary); handoff = root / 'handoff.json'
            shutil.copyfile(ROOT / 'os/entitlement/fixtures/device-handoff.json', handoff); handoff.chmod(0o644)
            state = root / 'wallet'; state.mkdir(mode=0o700)
            wallet = fixture.service.WalletService(state, provisioning_file=handoff)
            stack.callback(wallet.close)
            authenticator = fixture.SoftwareTestAuthenticator(root / 'authenticator', 'fixture-rock-arm64-001')
            stack.callback(authenticator.close)
            driver = Driver(None, output, report, {}, None, business.contract.plan('lifecycle')['limits'])
            driver.booting = False
            with ExitStack() as rendering:
                ui = fixture.Renderer(renderer, font, output, wallet, authenticator); rendering.callback(ui.close)
                driver.native = NativeFixture(ui, output, report)
                report['wallet_ui_seconds'] = business.wallet_ui_flow(driver)
                operations = list(ui.operations)
            # A new C UI process has the next boot's default collapsed view;
            # the same real fixture ledger is retained. This is not OS reboot.
            with ExitStack() as rendering:
                ui = fixture.Renderer(renderer, font, output, wallet, authenticator); rendering.callback(ui.close)
                driver.native = NativeFixture(ui, output, report)
                business.wallet_readonly_flow(driver)
                final = ui.refresh(); operations.extend(ui.operations)
            assert final['available_minor'] == 1112 and final['pending_minor'] == final['held_minor'] == 0
            assert final['billed_minor'] == 888 and not final['membership']['entitlement']['auto_renew']
            assert operations.count('wallet.bill') == 2 and operations.count('wallet.consent') == 2
            assert all(operations.count(op) == 1 for op in ('wallet.register', 'wallet.auth.begin', 'auth.create',
                'wallet.auth.enroll', 'wallet.terms', 'wallet.sale', 'wallet.settle', 'wallet.atm.quote', 'auth.get',
                'wallet.atm.issue', 'wallet.atm.cancel'))
            stack.close()
            report['closed_wallet_evidence'] = business.wallet_backup.validate(business.wallet_backup.read_databases({
                'wallet': state / 'wallet-simulator.db', 'membership': state / 'entitlement.db',
                'authenticator': root / 'authenticator/authenticator.sqlite3'}))
            report.update(status='PASS_HOST_FIXTURE', available_minor=1112, held_minor=0, billed_minor=888,
                          operations=operations, renderer_processes=2)
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
        raise
    finally:
        (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'status': report['status'], 'evidence': str(output)}), flush=True)


if __name__ == '__main__': main()
