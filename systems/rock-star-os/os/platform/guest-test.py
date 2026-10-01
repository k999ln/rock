#!/usr/bin/env python3
"""Real guest integration checks. Must run as root inside Rock OS.

Uses real services, signatures, namespaces, persistent databases and uid
transitions. The default Wallet checks use the local simulator. The explicit
game-isolation scope proves the same isolation/Tool boundaries with no NIC;
it emits a distinct partial-coverage marker and performs no financial action.
"""
import json
import importlib.util
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import uuid

sys.path.insert(0, '/usr/lib/rock-platform')
from service import call, PLATFORM_SOCKET, WALLET_SOCKET, PLATFORM_UID, WALLET_UID, read_frame

checks = []
run_prefix = uuid.uuid4().hex


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)
    print('PASS ' + name, flush=True)


def request(op, **values):
    payload = {'v': 1, 'op': op, **values}
    if op not in ('snapshot', 'health', 'wallet.membership', 'wallet.billing.status', 'wallet.auth.status'):
        payload.setdefault('key', run_prefix + ':' + uuid.uuid4().hex)
    if op.startswith('wallet.'):
        return owner_call(PLATFORM_SOCKET, PLATFORM_UID, payload)
    return call(PLATFORM_SOCKET, payload, PLATFORM_UID)


def owner_call(path, uid, payload):
    script = """import json,sys
sys.path.insert(0,'/usr/lib/rock-platform')
from service import call
print(json.dumps(call(sys.argv[1],json.load(sys.stdin),int(sys.argv[2]),return_errors=True,timeout=12,response_timeout=12)))
"""
    result = subprocess.run(['/usr/bin/python3', '-I', '-B', '-c', script, str(path), str(uid)],
        input=json.dumps(payload).encode(), capture_output=True, user=1000, group=1000,
        extra_groups=[], timeout=15)
    if result.returncode: raise RuntimeError('native owner IPC child failed; private output withheld')
    response = json.loads(result.stdout)
    if response.get('ok') is not True:
        if response.get('code') in ('rejected', 'unauthorized'): raise ValueError('explicit owner request rejection')
        raise RuntimeError('native owner service unavailable; private response withheld')
    return response


def authenticate(op, options):
    # Public test PIN entered programmatically by this flagged API test. This is
    # actual native UID/signature integration, not a GUI/hardware presence claim.
    return owner_call('/run/rock-authenticator/api.sock', 1004, {
        'v': 1, 'op': op, 'options': options, 'pin': '0000',
        'key': run_prefix + ':auth:' + uuid.uuid4().hex})['credential']


def denied_as(uid, path, payload):
    read_end, write_end = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(read_end)
        try:
            os.setgroups([])
            os.setgid(uid)
            os.setuid(uid)
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
                connection.settimeout(5)
                connection.connect(path)
                try:
                    connection.sendall(json.dumps(payload).encode() + b'\n')
                except BrokenPipeError:
                    pass
                answer = read_frame(connection, 1024 * 1024)
                denied = answer.get('ok') is False and answer.get('code') == 'unauthorized'
        except PermissionError:
            denied = True
        except BaseException:
            denied = False
        os.write(write_end, b'1' if denied else b'0')
        os._exit(0)
    os.close(write_end)
    result = os.read(read_end, 1)
    os.close(read_end)
    os.waitpid(pid, 0)
    return result == b'1'


def wait_job(job_id):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        snapshot = request('snapshot')['snapshot']
        job = next(x for x in snapshot['hub']['jobs'] if x['id'] == job_id)
        if job['status'] not in ('running', 'cancel_requested'):
            return job
        time.sleep(0.1)
    raise AssertionError('job did not complete')


def main():
    scope_flags = [part for part in Path('/proc/cmdline').read_text().split()
                   if part.startswith('rock.platform.verify_scope=')]
    if scope_flags not in ([], ['rock.platform.verify_scope=game-isolation']):
        raise ValueError('unknown or duplicate platform verification scope')
    game_isolation = bool(scope_flags)
    check('root test orchestrator in actual ARM64 guest', os.geteuid() == 0 and os.uname().machine == 'aarch64')
    inventory = subprocess.run(['/usr/bin/python3','-I','-B','/usr/lib/rock-platform/guest-inventory.py'],capture_output=True,timeout=10)
    print(inventory.stdout.decode(errors='replace'),flush=True)
    if inventory.returncode:
        print(inventory.stderr.decode(errors='replace')[:1500],flush=True)
    check('installed runtime inventory and ordinary compatibility', inventory.returncode == 0)
    check('actual platform health', request('health')['result']['uid'] == PLATFORM_UID)
    snapshot = request('snapshot')['snapshot']
    check('native OS catalog signed packages', len(snapshot['catalog']) >= 5 and snapshot['catalog_rejected'] == 0)
    check('guest platform maturity', snapshot['hub']['maturity'] == 'virtual_os_integrated')
    if game_isolation:
        from game_exchange.device_client import configuration
        configuration(json.loads(Path('/etc/rock-wallet/backend.json').read_bytes()))
        check('explicit Game profile is offline with unknown Wallet, never fabricated zero', snapshot['wallet'] is None)
        check('Game profile contains no local financial authority databases',
              not any(Path('/data/wallet', name).exists() for name in ('wallet-simulator.db', 'entitlement.db')))
    else:
        check('Wallet is explicitly simulator', snapshot['wallet']['simulation_only'] is True)
    check('tool identity denied platform IPC', denied_as(1001, PLATFORM_SOCKET, {'v': 1, 'op': 'snapshot'}))
    check('native UI denied direct Wallet IPC', denied_as(1000, WALLET_SOCKET, {'v': 1, 'op': 'snapshot'}))
    # Make DAC permissive briefly to independently test kernel peer authorization.
    for path, uid in ((PLATFORM_SOCKET, 1001), (WALLET_SOCKET, 1000)):
        parent = str(Path(path).parent)
        try:
            os.chmod(parent, 0o755)
            os.chmod(path, 0o666)
            check('peer identity enforced with permissive DAC ' + path,
                  denied_as(uid, path, {'v': 1, 'op': 'snapshot'}))
        finally:
            os.chmod(path, 0o660)
            os.chmod(parent, 0o750)
    probe = subprocess.run(['/usr/libexec/rock-sandbox-exec', 'probe'], user=1002, group=1002,
                           extra_groups=[], capture_output=True, timeout=10)
    if probe.returncode:
        print('Sandbox diagnostic stderr: ' + probe.stderr.decode(errors='replace')[:2000], flush=True)
    result = json.loads(probe.stdout) if probe.stdout else {}
    print('SANDBOX_DIAGNOSTIC ' + json.dumps({'exit': probe.returncode, 'result': result}), flush=True)
    check('real namespace/seccomp diagnostic', probe.returncode == 0 and result.get('ok') is True)
    for name, passed in result['checks'].items():
        check('sandbox ' + name, passed is True)
    resource_spec = importlib.util.spec_from_file_location('rock_resource_probe', Path(__file__).with_name('sandbox-probe.py'))
    resource_probe = importlib.util.module_from_spec(resource_spec)
    resource_spec.loader.exec_module(resource_probe)
    resource_results = []
    for mode in resource_probe.MODES:
        started = time.monotonic()
        measured = subprocess.run(['/usr/libexec/rock-sandbox-exec', 'probe-' + mode],
                                  user=1002, group=1002, extra_groups=[], capture_output=True, text=True,
                                  timeout=resource_probe.DEADLINES[mode])
        resource_results.append(resource_probe.validate_resource_result(mode, measured, time.monotonic() - started))
        check('sandbox actual resource denial ' + mode, resource_results[-1]['status'] == 'PASS')
    print('ROCK_SANDBOX_RESOURCE_GUEST_PASS ' + json.dumps(resource_results, sort_keys=True), flush=True)
    protected = '/data/wallet/backend-cache/remote-cache.db' if game_isolation else '/data/wallet/wallet-simulator.db'
    check('protected Wallet database actually exists', Path(protected).is_file())
    script = 'from pathlib import Path; Path(' + repr(protected) + ').read_bytes()'
    inaccessible = subprocess.run(['/usr/bin/python3', '-I', '-c', script], user=1002, group=1002,
                                  extra_groups=[], capture_output=True, timeout=5)
    check('platform cannot open Wallet database', inaccessible.returncode != 0 and b'PermissionError' in inaccessible.stderr)
    tool = 'org.rockstar.text-tidy'
    key = run_prefix + ':install-v1'
    v1 = request('install', id=tool, version='1.0.0', key=key)['result']
    try:
        request('run', id=tool, text='unapproved', target='device_local')
        raise AssertionError('unapproved tool ran')
    except ValueError:
        checks.append('new install disabled until approval')
    request('approve', id=tool, approved_hash=v1['hash'])
    check('install exact retry receipt', request('install', id=tool, version='1.0.0', key=key)['result'] == v1)
    installed = request('snapshot')['snapshot']['hub']['installed']
    check('install retry does not revoke approval', next(x for x in installed if x['id'] == tool)['enabled'] == 1)
    run_key = run_prefix + ':run-v1'
    body = {'id': tool, 'text': '  Z，A  \n\n\n next  ', 'target': 'device_local', 'key': run_key}
    first = request('run', **body)['result']
    check('job exact retry identity', request('run', **body)['result']['id'] == first['id'])
    final = wait_job(first['id'])
    check('signed Tool executes inside OS sandbox', final['status'] == 'succeeded' and final['output'] == 'Z，A\n\nnext')
    try:
        request('run', id=tool, text='different', target='device_local', key=run_key)
        raise AssertionError('conflicting run accepted')
    except ValueError:
        checks.append('conflicting retry rejected')
    try:
        request('run', id=tool, text='x' * 65537, target='device_local')
        raise AssertionError('oversize input accepted')
    except ValueError:
        checks.append('64KiB input boundary enforced')
    try:
        request('run', id=tool, text='secret', target='cloud')
        raise AssertionError('silent cloud fallback accepted')
    except ValueError:
        checks.append('no silent cloud fallback')
    v2 = request('update', id=tool, version='2.0.0')['result']
    request('approve', id=tool, approved_hash=v2['hash'])
    job2 = request('run', id=tool, text='  A，B  ', target='device_local')['result']
    check('independent package update changes behavior', wait_job(job2['id'])['output'] == 'A、B')
    request('rollback', id=tool, version='1.0.0')
    request('approve', id=tool, approved_hash=v1['hash'])
    job3 = request('run', id=tool, text='  A，B  ', target='device_local')['result']
    check('cached signed version rollback', wait_job(job3['id'])['output'] == 'A，B')
    request('uninstall', id=tool)
    state = request('snapshot')['snapshot']
    check('uninstall removes package but retains receipts', not any(x['id'] == tool for x in state['hub']['installed']) and any(x['id'] == first['id'] for x in state['hub']['jobs']))
    if game_isolation:
        check('offline local Tool activity does not invent Wallet availability', state['wallet'] is None)
        subprocess.run(['/usr/bin/python3', '-I', '-B', '/usr/lib/rock-platform/tools-guest-acceptance.py'], check=True, timeout=90)
        check('three independent SDK Tools in real guest', True)
        report = {'schema':'rock-os-platform-isolation/1','status':'PASS_SCOPED','scope':'game-isolation',
            'checks':checks,'architecture':os.uname().machine,'resource_probes':resource_results,
            'resource_probe_scope':'fixed diagnostic processes under unchanged production sandbox limits; per-file size only',
            'wallet_financial_assertions':'NOT_RUN; requires same-image online authority acceptance',
            'tool_implicit_earnings':'NOT_RUN; requires stopped authoritative before/after comparison',
            'hub_crash_deadline_lifecycle':'NOT_RUN','physical_usb':'NOT_RUN',
            'network':Path('/proc/net/dev').read_text(),'time_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
        Path('/data/platform-isolation-test.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print('ROCK_PLATFORM_ISOLATION_GUEST_PASS '+json.dumps(report,ensure_ascii=False),flush=True)
        return
    # No tool completion above can credit even simulated money.
    before = state['wallet']['available_minor']
    check('tool completion has no implicit earnings', before == snapshot['wallet']['available_minor'])
    membership = request('wallet.membership')['result']
    check('Wallet starts unregistered with no extra personal fields', not membership['registered'] and membership['registration_input_fields'] == [])
    try:
        request('wallet.sale', amount_minor=2000)
        raise AssertionError('unregistered Wallet accepted new proceeds')
    except ValueError:
        checks.append('unregistered Wallet denies new activity')
    registration_key = run_prefix + ':wallet-register'
    registered = request('wallet.register', key=registration_key)['result']
    check('registration inherits handoff verification without new personal data', registered['identity_inherited'] and registered['additional_personal_fields_required'] == [])
    check('registration exact retry receipt', request('wallet.register', key=registration_key)['result'] == registered)
    check('purchased registration still requires authentication', request('wallet.auth.status')['result']['activation_state'] == 'CREDENTIAL_REQUIRED')
    begin = request('wallet.auth.begin')['result']
    credential = authenticate('auth.create', begin['options'])
    enrollment = request('wallet.auth.enroll', challenge_id=begin['challenge_id'], credential=credential)['result']
    check('real isolated authenticator enrollment does not accept Wallet terms', enrollment['activation_state'] == 'TERMS_REQUIRED')
    activation = request('wallet.terms', accepted=True, terms_version='rock-wallet-development/1')['result']
    check('explicit Wallet terms activate separately from monthly consent', activation['active'] is True and
          request('wallet.membership')['result']['entitlement']['auto_renew'] is False)
    sale = request('wallet.sale', amount_minor=2000)['result']
    check('unsettled proceeds unavailable', request('snapshot')['snapshot']['wallet']['available_minor'] == before)
    request('wallet.settle', id=sale['id'])
    period = time.strftime('%Y-%m', time.gmtime())
    fee_before = request('snapshot')['snapshot']['wallet']['billed_minor']
    check('registration and settlement do not grant recurring consent', fee_before == 0)
    request('wallet.consent', accepted=True, terms_version=membership['terms_version'])
    billing_key = run_prefix + ':wallet-month'
    accepted = request('wallet.bill', period=period, key=billing_key)['result']
    check('monthly request is a durable acceptance, not a payment assertion', accepted['accepted'] and 'schedule_id' in accepted)
    deadline = time.monotonic() + 35
    while time.monotonic() < deadline:
        wallet = request('snapshot')['snapshot']['wallet']
        if wallet['billing']['history'] and wallet['billing']['history'][0]['status'] == 'paid':
            break
        time.sleep(0.25)
    bill = next((x for x in wallet['bills'] if x['period'] == period), None)
    check('monthly USD8.88 once per period', bill is not None and bill['amount_minor'] == 888 and len(wallet['bills']) == 1)
    check('monthly acceptance retry does not charge twice', request('wallet.bill', period=period, key=billing_key)['result'] == accepted)
    request('wallet.consent', accepted=False, terms_version=membership['terms_version'])
    check('cancellation stops future automatic billing', not request('wallet.membership')['result']['entitlement']['auto_renew'])
    try:
        request('wallet.bill', period=period)
        raise AssertionError('canceled renewal admitted a new billing request')
    except ValueError:
        checks.append('new monthly request after cancellation is denied')
    wallet = request('snapshot')['snapshot']['wallet']
    check('ledger balanced after billing', wallet['ledger_balance_minor'] == 0 and wallet['billed_minor'] - fee_before in (0, 888))
    issue_key = run_prefix + ':verified-atm-issue'
    quote = request('wallet.atm.quote', issue_key=issue_key, amount_minor=1000, atm_id='SIM-ATM-001')['result']
    check('server quote does not reserve funds', request('snapshot')['snapshot']['wallet']['held_minor'] == 0 and
          quote['quote']['fee_minor'] == 0 and quote['quote']['total_debit_minor'] == 1000)
    assertion = authenticate('auth.get', quote['options'])
    withdrawal = request('wallet.atm.issue', key=issue_key, quote_id=quote['quote_id'], credential=assertion)['result']
    check('verified exact quote assertion creates one hold', withdrawal['authentication'] == 'verified_software_test_assertion' and
          request('snapshot')['snapshot']['wallet']['held_minor'] == 1000)
    repeated = request('wallet.atm.issue', key=issue_key, quote_id=quote['quote_id'], credential=assertion)['result']
    check('same assertion retry returns identical issuance', repeated == withdrawal)
    request('wallet.atm.cancel', withdrawal_id=withdrawal['withdrawal_id'])
    wallet = request('snapshot')['snapshot']['wallet']
    latest = next(x for x in wallet['withdrawals'] if x['id'] == withdrawal['withdrawal_id'])
    check('unconsumed authenticated hold cancels without dispense', latest['dispensed_minor'] == 0 and latest['released_minor'] == 1000 and latest['held_minor'] == 0)
    check('ledger balanced after ATM simulation', wallet['ledger_balance_minor'] == 0)
    subprocess.run(['/usr/bin/python3', '-I', '-B', '/usr/lib/rock-platform/tools-guest-acceptance.py'], check=True, timeout=90)
    check('three independent SDK Tools in real guest', True)
    report = {'status': 'PASS', 'checks': checks, 'architecture': os.uname().machine,
              'wallet': 'SIMULATOR_ONLY', 'blackberry': 'NOT_RUN', 'physical_usb': 'NOT_RUN',
              'resource_probes': resource_results,
              'resource_probe_scope': 'fixed diagnostic processes under unchanged production sandbox limits; per-file size only',
              'hub_crash_deadline_lifecycle': 'NOT_RUN',
              'network': Path('/proc/net/dev').read_text(), 'time_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    Path('/data/platform-guest-test.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('ROCK_PLATFORM_GUEST_PASS ' + json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        print('ROCK_PLATFORM_GUEST_FAIL', flush=True)
        raise
