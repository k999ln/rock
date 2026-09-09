#!/usr/bin/env python3
"""Linux root host test: actual C input + real Wallet/credential fixture, no QEMU.

All fixture secrets stay in temporary storage or the child process pipe. Only
masked framebuffer PNGs and action rectangles are exported as geometry evidence.
"""
from __future__ import annotations

import argparse
from contextlib import ExitStack
import importlib.util
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import sys
import tempfile
import time
from unittest import mock

import wallet_replay as replay
import pin_readiness

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


service = load('wallet_geometry_service', ROOT / 'os/platform/service.py')
from wallet_auth.fixture import SoftwareTestAuthenticator


class Renderer:
    def __init__(self, renderer, font, directory, wallet, authenticator):
        self.process = subprocess.Popen([str(renderer), '--wallet-replay', str(font)], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)
        self.directory, self.wallet, self.authenticator = directory, wallet, authenticator
        self.geometry, self.captures, self.operations = [], [], []
        self.original_action = replay.action
        self.expected = None
        self.refresh()

    def close(self):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)
        self.selector.close()
        self.process.stdout.close()
        self.process.stderr.close()

    def raw(self, command):
        self.process.stdin.write(json.dumps(command, ensure_ascii=False) + '\n')
        self.process.stdin.flush()
        assert self.selector.select(10), 'renderer command exceeded bounded response wait'
        line = self.process.stdout.readline()
        if not line:
            # C bridge errors contain action geometry only, never request bodies.
            raise AssertionError(self.process.stderr.read())
        return json.loads(line)

    def send(self, command):
        result = self.raw(command)
        for _ in range(4):
            request = result['request']
            if request is None:
                assert not result['busy'] and not result['retry'], 'actual C reply validation failed'
                return result
            op = request['op']
            self.operations.append(op)
            if op in ('auth.create', 'auth.get'):
                method = self.authenticator.make_credential if op == 'auth.create' else self.authenticator.get_assertion
                response = {'ok': True, 'credential': method(request['options'], request['pin'], request['key']),
                            'metadata': self.authenticator.metadata}
            elif op == 'snapshot':
                response = self.snapshot_response()
            else:
                assert op.startswith('wallet.'), 'only UI-generated owner Wallet operations are dispatched'
                response = self.wallet.dispatch(request, peer_uid=1002)
                assert response['ok'], 'real Wallet fixture rejected UI input'
                if op in ('wallet.atm.quote', 'wallet.atm.issue'):
                    receipt = response['result'].get('quote', response['result'])
                    assert receipt['fee_minor'] == 0 and receipt['total_debit_minor'] == 1000
                    assert receipt['cash_received_minor'] == 1000, 'Rock ATM fee-zero contract changed'
            result = self.raw({'event': 'response', 'request': request, 'response': response})
        raise AssertionError('unbounded C request chain')

    def snapshot_response(self):
        state = self.wallet.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=1002)['snapshot']
        return {'ok': True, 'snapshot': {'catalog': [], 'hub': {'installed': [], 'jobs': []}, 'wallet': state}}

    def refresh(self):
        state = self.wallet.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=1002)['snapshot']
        assert state['billing']['worker_alive'] and not state['billing']['worker_error'], 'real live scheduler required'
        self.send({'event': 'response', 'request': {'v': 1, 'op': 'snapshot'},
                   'response': {'ok': True, 'snapshot': {'catalog': [], 'hub': {'installed': [], 'jobs': []}, 'wallet': state}}})
        return state

    def action(self, ui, name):
        assert ui is self
        self.expected = name
        self.original_action(self, name)
        self.expected = None

    def click(self, x, y):
        name = self.expected
        assert name in replay.CONTROLS, 'all replay pointer targets must have a reviewed action'
        expected = replay.CONTROLS[name][0]
        frame = self.send({'event': 'inspect'})
        candidates = [row for row in frame['hits'] if row['action'] == expected]
        if name == 'atm_open':
            candidates = [row for row in candidates if row['rect'][1] < 50]
        if name == 'home':
            candidates = [row for row in candidates if row['rect'][0] > 500]
        matches = [row for row in candidates if row['rect'][0] <= x < row['rect'][0] + row['rect'][2]
                   and row['rect'][1] <= y < row['rect'][1] + row['rect'][3]]
        row = {'control': name, 'coordinate': [x, y], 'scroll': frame['scroll'],
               'rectangles': [item['rect'] for item in candidates]}
        self.geometry.append(row)
        # C independently checks the actual enabled hitbox before pointer input.
        self.send({'event': 'click', 'x': x, 'y': y, 'action': expected})
        assert matches, 'target must be within the expected rendered control'

    def keys(self, names):
        codes = {'pgdn': 109, 'pgup': 104, 'ctrl': 29, 'a': 30, '0': 11}
        self.send({'event': 'keys', 'codes': [codes[name] for name in names]})

    def type(self, text):
        self.send({'event': 'text', 'text': text})

    def pin_frame(self):
        with tempfile.TemporaryDirectory(prefix='rock-test-pin-frame-') as temporary:
            path = Path(temporary) / 'frame.png'
            self.raw({'event': 'capture', 'path': str(path)})
            return path.read_bytes()

    def wait_pin_ready(self, profile, digits, deadline):
        assert time.monotonic() < deadline
        observation = pin_readiness.inspect_frame(self.pin_frame(), profile, pin_readiness.profiles())
        assert observation.get('recognized') and observation['masked_digits'] == digits
        assert observation['sign_enabled'] == (digits == 4), 'actual C rendered PIN/sign readiness required'

    def pin(self):
        profile = 'atm' if self.operations[-1] == 'wallet.atm.quote' else 'enroll'
        definitions = pin_readiness.profiles()
        # The pointer is visible over the focused empty field until the first
        # key. Empty readiness is checked before that explicit pointer input.
        for count in range(1, 4):
            self.keys(['0'])
            observed = pin_readiness.inspect_frame(self.pin_frame(), profile, definitions)
            assert observed.get('recognized') and observed['masked_digits'] == count and not observed['sign_enabled']
        # Reproduce the frozen main.c event-drain order: fourth key and sign
        # release before redraw. The stale disabled hit emits no request.
        frame = self.raw({'event': 'batch_pin_last_and_sign'})
        assert frame['request'] is None and frame['pin_digits'] == 4 and not frame['busy']
        assert any(hit['action'] == 'ACTION_AUTH_SIGN' for hit in frame['hits'])

    def capture(self, name):
        assert name not in self.captures
        self.captures.append(name)
        self.send({'event': 'capture', 'path': str(self.directory / (name + '.png'))})

    def sleep(self, seconds):
        # The live harness retains its bounded waits. Here each response is
        # synchronous and refreshes use the same real service after its tick.
        assert 0 <= seconds <= 3
        self.wallet.membership.tick()
        self.refresh()
        # The live renderer alternates page-specific reads and snapshots. Two
        # normal refresh calls cover the same status read reached during the
        # retained 3-second post-mutation wait; PIN pages reject both reads.
        self.send({'event': 'refresh'})
        self.send({'event': 'refresh'})

    def wait_marker(self, marker, seconds=25):
        assert seconds == 180 or 0 < seconds <= 25
        self.wallet.membership.tick()
        state = self.refresh()
        member, auth = state['membership'], state.get('auth', {})
        entitlement = member.get('entitlement', {})
        if marker.endswith('OBSERVER_READY'):
            assert not member['registered'] and state['available_minor'] == 0
        elif marker.endswith('REGISTERED'):
            assert member['registered'] and not entitlement['auto_renew'] and not auth['active']
        elif marker.endswith('AUTH_CHALLENGE'):
            assert self.operations[-1] == 'wallet.auth.begin' and not auth['active']
        elif marker.endswith('AUTH_ENROLLED'):
            assert auth['credential_id'] and not auth['active'] and not entitlement['auto_renew']
        elif marker.endswith('AUTH_ACTIVE'):
            assert auth['active'] and not entitlement['auto_renew'] and state['available_minor'] == 0
        elif marker.endswith('CONSENTED'):
            assert entitlement['auto_renew'] and state['billing']['history'][0]['status'] == 'retry_wait'
        elif marker.endswith('CREDIT_PENDING'):
            assert state['available_minor'] == 0 and state['pending_minor'] == (5000 if '_ATM_' in marker else 2000)
        elif marker.endswith('CREDIT_SETTLED'):
            assert state['available_minor'] == (5000 if '_ATM_' in marker else 2000) and state['pending_minor'] == 0
        elif marker.endswith(('BILLED_ONCE', 'BILL_REPEATED_ONCE')):
            assert state['available_minor'] == 1112 and state['billed_minor'] == 888
        elif marker.endswith('ISSUED'):
            assert state['available_minor'] == 4000 and state['held_minor'] == 1000
        elif marker.endswith('CANCELED'):
            assert state['available_minor'] == (5000 if '_ATM_' in marker else 1112)
            assert state['held_minor'] == 0 and not entitlement['auto_renew']
        else:
            raise AssertionError('unverified semantic replay stage ' + marker)


def check_live_entrypoints():
    import ast
    for filename, function in (('verify-wallet.py', 'run_wallet'), ('verify-atm-ui.py', 'run_atm')):
        tree = ast.parse(Path(__file__).with_name(filename).read_text())
        main = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
        calls = [node for node in ast.walk(main) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                 and isinstance(node.func.value, ast.Name) and node.func.value.id == 'replay']
        assert len(calls) == 1 and calls[0].func.attr == function
        assert [ast.unparse(arg) for arg in calls[0].args] == ['ui', 'wait_marker', 'time.sleep']


def run_case(renderer, font, destination, kind):
    destination.mkdir()
    with tempfile.TemporaryDirectory(prefix='rock-wallet-geometry-') as temporary, ExitStack() as stack:
        root = Path(temporary)
        handoff = root / 'handoff.json'
        shutil.copyfile(ROOT / 'os/entitlement/fixtures/device-handoff.json', handoff)
        handoff.chmod(0o644)
        state = root / 'wallet'
        state.mkdir(mode=0o700)
        # Fixed fixture clock preserves the observed retry_wait while the real
        # scheduler stays alive. Auth challenge expiry remains current for C.
        now = int(time.time())
        wallet = service.WalletService(state, provisioning_file=handoff, clock=lambda: now)
        stack.callback(wallet.close)
        auth = SoftwareTestAuthenticator(root / 'authenticator', 'fixture-rock-arm64-001')
        stack.callback(auth.close)
        ui = Renderer(renderer, font, destination, wallet, auth)
        stack.callback(ui.close)
        with mock.patch.object(replay, 'action', ui.action):
            getattr(replay, 'run_' + kind)(ui, ui.wait_marker, ui.sleep)
        final = ui.refresh()
        assert len(ui.captures) == 14, 'each original observer still requires fourteen captures'
        assert all(ui.operations.count(op) == 1 for op in ('wallet.register', 'wallet.auth.begin', 'auth.create',
                                                         'wallet.auth.enroll', 'wallet.terms', 'wallet.sale', 'wallet.settle'))
        assert final['available_minor'] == (1112 if kind == 'wallet' else 5000) and final['held_minor'] == 0
        if kind == 'wallet':
            assert ui.operations.count('wallet.bill') == 2 and ui.operations.count('wallet.consent') == 2
        else:
            assert all(ui.operations.count(op) == 1 for op in ('wallet.atm.quote', 'auth.get', 'wallet.atm.issue', 'wallet.atm.cancel'))
            assert ui.operations.count('wallet.atm.status') >= 1
            assert not any(op in ('wallet.bill', 'wallet.consent') or op.startswith('atm.') for op in ui.operations)
        # Only geometry and operation names leave the disposable private fixture.
        (destination / 'geometry.json').write_text(json.dumps(ui.geometry, indent=2) + '\n')
        print(f'PASS {kind}: real C inputs, authenticated Wallet, fourteen frames, closed synthetic balance', flush=True)


def reject_stale_steps(renderer, font, output):
    # These old points include dangerous near misses: monthly consent hits the
    # billing row, and old ATM cancel hits the status row. C must reject before
    # dispatch, not merely time out at the eventual observer stage.
    stale = [('register', (360, 417), 'wallet'), ('enroll', (360, 537), 'wallet'),
             ('consent', (360, 561), 'wallet'), ('bill', (360, 624), 'wallet'),
             ('atm_issue', (360, 697), 'atm'), ('atm_status', (360, 782), 'atm'),
             ('atm_cancel', (360, 708), 'atm')]
    for control, coordinate, kind in stale:
        controls = dict(replay.CONTROLS)
        controls[control] = (controls[control][0], coordinate)
        with mock.patch.object(replay, 'CONTROLS', controls):
            try:
                run_case(renderer, font, output / ('rejected-' + control), kind)
            except AssertionError as error:
                assert 'Wallet replay coordinate targets the expected enabled visible action' in str(error), str(error)
            else:
                raise AssertionError('old ' + control + ' point was not rejected')
    original_keys = Renderer.keys
    skipped = 0
    def omit_first_pagedown(ui, names):
        nonlocal skipped
        if names == ['pgdn'] and not skipped:
            skipped += 1
            return
        original_keys(ui, names)
    with mock.patch.object(Renderer, 'keys', omit_first_pagedown):
        try:
            run_case(renderer, font, output / 'rejected-missing-pagedown', 'wallet')
        except AssertionError as error:
            assert 'Wallet replay coordinate targets the expected enabled visible action' in str(error), str(error)
        else:
            raise AssertionError('required monthly PageDown was not checked')
    assert skipped == 1
    print('PASS seven stale coordinates and missing PageDown rejected before wrong-action dispatch', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--renderer', type=Path, required=True)
    parser.add_argument('--font', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if sys.platform != 'linux' or os.geteuid() != 0:
        parser.error('real Linux root-owned provisioning fixture required; no skipped PASS')
    renderer, font = args.renderer.resolve(strict=True), args.font.resolve(strict=True)
    check_live_entrypoints()
    with tempfile.TemporaryDirectory(prefix='rock-wallet-replay-') as temporary:
        output = args.output.resolve() if args.output else Path(temporary) / 'frames'
        output.mkdir(parents=True, exist_ok=False)
        for kind in ('wallet', 'atm'):
            run_case(renderer, font, output / kind, kind)
        reject_stale_steps(renderer, font, output)


if __name__ == '__main__':
    main()
