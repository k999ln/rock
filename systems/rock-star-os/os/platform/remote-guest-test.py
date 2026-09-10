#!/usr/bin/python3
"""Actual ARM64 OS client -> owned remote runner; explicitly flagged test only."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import time
import traceback
import sys
sys.path.insert(0, '/usr/lib/rock-platform')
import verification_scope

TOOL = 'org.rockstar.remote-text'
TEXT = '  OSからの実入力  \n  Remote execution  '
EXPECTED = 'OSからの実入力\nRemote execution'
PROOF = Path('/data/remote-proof.json')
KEY1, KEY2 = 'os-remote-first', 'os-remote-after-link-loss'
checks, retries = [], []
CLIENT = """import json,sys,socket
sys.path.insert(0,'/usr/lib/rock-platform')
from service import PLATFORM_SOCKET,PLATFORM_UID,peer_uid,read_frame,MAX_RESPONSE,canonical
try:
 with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as connection:
  connection.settimeout(6); connection.connect(str(PLATFORM_SOCKET))
  if peer_uid(connection)!=PLATFORM_UID: raise PermissionError('unexpected service identity')
  connection.sendall(canonical(json.load(sys.stdin))+b'\\n')
  print(json.dumps(read_frame(connection,MAX_RESPONSE)))
except (ValueError,OSError) as e: print(json.dumps({'ok':False,'error':str(e),'exception':type(e).__name__}))
"""


class APIRejected(ValueError):
    def __init__(self, response):
        self.response = response
        super().__init__(response.get('error', 'request rejected'))


def emit(marker, value=None):
    print('\n' + marker + ('' if value is None else ' ' + json.dumps(value, ensure_ascii=False, sort_keys=True)), flush=True)


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)
    emit('PASS_REMOTE', name)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def api(op, **fields):
    request = {'v':1, 'op':op, **fields}
    for attempt in range(2):
        response = subprocess.run(['/usr/bin/python3','-I','-B','-c',CLIENT], input=json.dumps(request).encode(),
                                  capture_output=True, timeout=15, user=1000, group=1000, extra_groups=[])
        if response.returncode:
            raise RuntimeError('UID1000 API process failed')
        result = json.loads(response.stdout)
        if result.get('ok'):
            return result.get('result', result.get('snapshot'))
        if attempt == 0 and result.get('exception') == 'TimeoutError':
            retries.append({'op':op, 'key':fields.get('key'), 'policy':'one exact request retry'})
            continue
        if result.get('code') in ('rejected', 'unauthorized') and 'exception' not in result:
            raise APIRejected(result)
        raise RuntimeError(op + ': ' + result.get('error','request failed'))


def denied(op, reason, **fields):
    try:
        api(op, **fields)
    except APIRejected as error:
        return reason in error.response.get('error', '')
    return False


def wait_for(function, seconds=90):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = function()
        if value:
            return value
        time.sleep(.3)
    raise TimeoutError('actual remote condition exceeded deadline')


def status(key):
    return api('remote.status', key=key)


def completed(key):
    value = status(key)
    return value if value['state'] in ('succeeded','failed','cancelled','indeterminate','rejected') else None


def prepare(key):
    result = api('remote.prepare', id=TOOL, target='cloud', text=TEXT, key=key)
    check('preparation is not approval ' + key, result['prepared'] and not result['approved'])
    check('exact text and destination bound ' + key,
          result['input_sha256'] == hashlib.sha256(TEXT.encode()).hexdigest() and
          result['target'] == 'cloud' and result['endpoint_id'] == 'runner-linux-cloud')
    return result


def submit(preview):
    receipt = api('remote.submit', key=preview['key'], consent=preview['consent'])
    check('local queue acceptance is not remote completion ' + preview['key'],
          receipt['accepted'] and receipt['remote_accepted'] is False)
    return receipt


def verify_result(value):
    check('remote result is a real isolated process ' + value['key'], value['state'] == 'succeeded' and
          value['remote']['output'] == EXPECTED and value['remote']['execution']['kind'] == 'actual_linux_isolated_process')
    check('remote isolation and physical limit ' + value['key'],
          value['remote']['execution']['socket_syscall_denied'] is True and
          value['remote']['execution']['wallet_path_visible'] is False and
          value['remote']['receipt']['physical_usb'] == 'NOT_RUN')


def database():
    result = {}
    for name, path, query in (
        ('remote','/data/platform/remote/remote.sqlite3','SELECT key,state,send_claimed,cancel_requested,package,input_text,receipt,remote_status FROM remote_jobs ORDER BY key'),
        ('local','/data/platform/hub.db','SELECT id,key,status FROM hub_jobs ORDER BY id')):
        with sqlite3.connect('file:' + path + '?mode=ro', uri=True) as db:
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA query_only=ON')
            result[name] = [dict(row) for row in db.execute(query)]
            check('database integrity ' + name, db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok')
    return result


def online(report):
    initial = api('snapshot')
    check('actual ARM64 OS client health', api('health')['ready'] is True and os.uname().machine == 'aarch64')
    check('cloud fixture configured and physical USB unavailable', initial['remote']['destinations'][0]['available'] and
          not initial['remote']['destinations'][1]['available'])
    check('remote Tool absent from initial catalog', not any(x['manifest']['id'] == TOOL for x in initial['catalog']))
    report['wallet_observation'] = verification_scope.wallet(initial['wallet'],report.get('verification_scope','local-full'))
    report['wallet_sha256'] = digest(initial['wallet']) if report.get('verification_scope','local-full') == 'local-full' else None
    api('registry.refresh',key='os-remote-refresh')
    current = wait_for(lambda: (value if (value := api('snapshot'))['registry']['status'] == 'ready' else None))
    item = next(x for x in current['catalog'] if x['manifest']['id'] == TOOL)
    check('remote Tool discovered through signed store', item['source'] == 'registry' and item['manifest']['schema_version'] == 3)
    installed = api('install',id=TOOL,version='1.0.0',key='os-remote-install')
    check('download requires explicit enable', denied('remote.prepare','installed and explicitly enabled',id=TOOL,target='cloud',text=TEXT,key='disabled-remote'))
    api('approve',id=TOOL,approved_hash=installed['hash'],key='os-remote-approve')
    report['package_hash'] = installed['hash']
    check('remote-only Tool cannot fall back to local', denied('run','local',id=TOOL,text=TEXT,target='device_local',key='forbidden-local'))
    check('missing physical USB endpoint cannot accept input', denied('remote.prepare','endpoint is unavailable',id=TOOL,target='pc_usb',text=TEXT,key='forbidden-usb'))
    abandoned = prepare('os-remote-abandoned')
    check('preview retained without sending claim', status(abandoned['key'])['state'] == 'prepared' and not status(abandoned['key'])['send_claimed'])
    check('changed consent rejected', denied('remote.submit','consent must match exact preview',key=abandoned['key'],consent={**abandoned['consent'],'input_sha256':'0'*64}))
    cancelled = api('remote.cancel',key=abandoned['key'],cancel_key='os-remote-cancel-preview')
    check('cancelled preview never sent', cancelled['before_send_claim'] and status(abandoned['key'])['state'] == 'cancelled')
    first = prepare(KEY1)
    first_receipt = submit(first)
    first_result = wait_for(lambda: completed(KEY1))
    verify_result(first_result)
    check('exact submit retry preserves the local receipt', api('remote.submit',key=KEY1,consent=first['consent']) == first_receipt)
    emit('ROCK_REMOTE_DISCONNECT_READY')
    wait_for(lambda: Path('/sys/class/net/eth0/carrier').read_text().strip() == '0',30)
    second = prepare(KEY2)
    second_receipt = submit(second)
    unknown = wait_for(lambda: (value if (value := status(KEY2))['state'] == 'unknown' else None),40)
    check('offline outcome is retained without another mode', unknown['target'] == 'cloud' and unknown['send_claimed'])
    emit('ROCK_REMOTE_OFFLINE_PENDING', {'key':KEY2,'state':unknown['state']})
    wait_for(lambda: Path('/sys/class/net/eth0/carrier').read_text().strip() == '1',30)
    second_result = wait_for(lambda: completed(KEY2))
    verify_result(second_result)
    check('reconnected submit has the same original receipt', api('remote.submit',key=KEY2,consent=second['consent']) == second_receipt)
    final = api('snapshot')
    if report.get('verification_scope','local-full') == 'game-isolation':
        verification_scope.unchanged(report['wallet_observation'],final['wallet'],'game-isolation')
        check('remote execution creates no local jobs; Wallet financial assertions NOT_RUN',not final['hub']['jobs'])
    else:
        check('remote execution cannot create local jobs or Wallet proceeds', not final['hub']['jobs'] and digest(final['wallet']) == report['wallet_sha256'])
    report.update(first=first_result,second=second_result,database=database(),network='actual virtio NIC with observed link loss')
    check('terminal remote raw inputs are erased', all(row['package'] is None and row['input_text'] is None for row in report['database']['remote']))
    rows = {row['key']:row for row in report['database']['remote']}
    check('exact durable remote job set', set(rows) == {KEY1,KEY2,'os-remote-abandoned'})
    check('abandoned preview never claimed in durable state', rows['os-remote-abandoned']['state'] == 'cancelled' and not rows['os-remote-abandoned']['send_claimed'])
    for key, result in ((KEY1,first_result),(KEY2,second_result)):
        row = rows[key]
        check('durable success matches remote evidence ' + key, row['state'] == 'succeeded' and row['send_claimed'] == 1 and
              json.loads(row['receipt']) == result['local_receipt'] and json.loads(row['remote_status']) == result['remote'])
    check('no local Hub jobs persisted', report['database']['local'] == [])


def offline(report):
    previous = json.loads(PROOF.read_text())
    check('previous Remote proof has the same declared scope',previous.get('verification_scope','local-full') == report.get('verification_scope','local-full'))
    check('previous online proof passed', previous['status'] == 'PASS' and previous['phase'] == 'online')
    check('independent second kernel boot', report['boot_id'] != previous['boot_id'])
    check('second boot has no NIC', not Path('/sys/class/net/eth0').exists())
    for key, name in ((KEY1,'first'),(KEY2,'second')):
        current = status(key)
        verify_result(current)
        check('exact remote evidence survives offline reboot ' + key, current == previous[name])
    final = api('snapshot')
    report['wallet_observation'] = verification_scope.wallet(final['wallet'],report.get('verification_scope','local-full'))
    if report.get('verification_scope','local-full') == 'game-isolation':
        verification_scope.unchanged(previous['wallet_observation'],final['wallet'],'game-isolation')
        check('no local jobs after reboot; remote Wallet financial assertions NOT_RUN',not final['hub']['jobs'])
    else:
        check('Wallet and local jobs unchanged offline', digest(final['wallet']) == previous['wallet_sha256'] and not final['hub']['jobs'])
    report.update(previous_online_sha256=digest(previous),package_hash=previous['package_hash'],database=database(),
                  first=previous['first'],second=previous['second'],wallet_sha256=previous['wallet_sha256'],network='no NIC')


def main():
    if os.geteuid() != 0 or os.uname().machine != 'aarch64' or 'rock.remote.verify=1' not in Path('/proc/cmdline').read_text().split():
        raise SystemExit('requires explicitly flagged root ARM64 remote test')
    report = {'schema':'rock-os-remote-guest-proof/1','status':'FAIL','phase':'offline' if PROOF.exists() else 'online',
              'started_unix':time.time(),'boot_id':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
              'blackberry':'NOT_RUN','production_cloud':'NOT_RUN','physical_usb':'NOT_RUN','wallet':'SIMULATOR_ONLY'}
    try:
        report['verification_scope']=verification_scope.scope(Path('/proc/cmdline').read_text(),'rock.remote.scope')
        if report['verification_scope']=='game-isolation':report['wallet']='NOT_RUN'
        (offline if PROOF.exists() else online)(report)
        report['status'] = 'PASS'
    except BaseException as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
        report['traceback'] = traceback.format_exc(limit=6)
    finally:
        report.update(checks=checks,api_retries=retries,finished_unix=time.time())
        output = Path('/data/remote-offline-proof.json') if report['phase'] == 'offline' else PROOF
        with output.open('w') as stream:
            json.dump(report,stream,ensure_ascii=False,sort_keys=True)
            stream.flush(); os.fsync(stream.fileno())
        os.sync()
        emit('ROCK_REMOTE_GUEST_PROOF',report)
        emit('ROCK_REMOTE_GUEST_' + report['status'])
        subprocess.run(['/sbin/poweroff','-f'],check=False)


if __name__ == '__main__':
    main()
