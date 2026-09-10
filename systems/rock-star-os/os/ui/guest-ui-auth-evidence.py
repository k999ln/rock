#!/usr/bin/python3
"""Flagged read-only observer for native public-software authentication.

No registration, signing, credit, consent, quote, reservation or power operation
is issued here. Those operations must come from real evdev input. Private rows
are inspected in memory; only hashes, fixed counts and redacted amounts escape.
"""
from contextlib import closing
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import subprocess
import sys
import time

BASE = Path('/usr/libexec/rock-ui-evidence.py')
if not BASE.is_file(): BASE = Path(__file__).with_name('guest-ui-evidence.py')
spec = importlib.util.spec_from_file_location('auth_ui_base', BASE)
base = importlib.util.module_from_spec(spec); spec.loader.exec_module(base)
sys.path.insert(0, '/usr/lib/rock-platform')
if not Path('/usr/lib/rock-platform').is_dir():
    sys.path[:0] = [str(Path(__file__).resolve().parents[2] / 'src'), str(Path(__file__).resolve().parents[1])]
from wallet_auth import protocol as crypto

PROOF = Path('/data/ui-auth-proof.json')
PATHS = {'ledger': '/data/wallet/wallet-simulator.db', 'member': '/data/wallet/entitlement.db',
         'authenticator': '/data/authenticator/authenticator.sqlite3'}
TABLES = {'ledger': ('wallet_auth_credentials', 'wallet_auth_credential_state', 'wallet_auth_challenges',
    'wallet_auth_terms', 'wallet_auth_quotes', 'wallet_auth_approvals', 'wallet_idempotency',
    'wallet_withdrawals', 'wallet_bills', 'wallet_journals', 'atm_credentials'),
    'member': ('device_api_receipts', 'consents', 'device_monthly_due', 'authorizations'),
    'authenticator': ('credentials', 'requests')}


def rows(paths=PATHS):
    result = {}
    for kind, tables in TABLES.items():
        with closing(sqlite3.connect('file:' + str(paths[kind]) + '?mode=ro', uri=True, timeout=2)) as db:
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
            base.require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'private database integrity differs')
            for table in tables:
                values = [dict(row) for row in db.execute('SELECT rowid AS seq,* FROM ' + table + ' ORDER BY rowid LIMIT 33')]
                base.require(len(values) <= 32, 'unexpected business row count')
                result[kind + '.' + table] = values
            if kind == 'ledger':
                result['balances'] = {row[0]: row[1] for row in db.execute('SELECT account,SUM(delta_minor) FROM wallet_postings GROUP BY account')}
    return result


def counts(data): return {key: len(value) for key, value in data.items() if key != 'balances'}


def safe_wallet(wallet):
    fields = ('available_minor', 'pending_minor', 'held_minor', 'billed_minor', 'dispensed_minor', 'ledger_balance_minor')
    base.require(wallet.get('simulation_only') is True and wallet.get('currency') == 'USD', 'not a USD simulator')
    result = {key: wallet[key] for key in fields}
    base.require(all(type(value) is int for value in result.values()), 'noninteger ledger amount')
    member = wallet['membership']
    result.update(registered=member['registered'], auto_renew=bool((member.get('entitlement') or {}).get('auto_renew')),
        activation_state=wallet['auth']['activation_state'], active=wallet['auth']['active'], bill_count=len(wallet['bills']))
    base.require(result['auto_renew'] is False and result['billed_minor'] == result['dispensed_minor'] ==
                 result['ledger_balance_minor'] == result['bill_count'] == 0, 'implicit billing or dispense occurred')
    return result


def environment():
    result = base.environment_evidence()
    result['processes']['authenticator'] = base.process_identity('/run/rock-authenticator.pid', 1004,
        '/usr/bin/python3', '/usr/lib/rock-platform/wallet_auth/daemon.py')
    pid = result['processes']['authenticator']['pid']
    fields = dict(line.split(':', 1) for line in Path('/proc/' + str(pid) + '/status').read_text().splitlines() if ':' in line)
    base.require(fields['Seccomp'].strip() == '2', 'authenticator kernel filter not installed')
    result['processes']['authenticator']['seccomp'] = 2
    for name, uid, gid, mode in (('/data/authenticator',1004,1004,0o700),
        ('/data/authenticator/authenticator.sqlite3',1004,1004,0o600),
        ('/run/rock-authenticator',1004,1000,0o750), ('/run/rock-authenticator/api.sock',1004,1000,0o660)):
        info = os.lstat(name)
        base.require(info.st_uid == uid and info.st_gid == gid and stat.S_IMODE(info.st_mode) == mode and
                     not stat.S_ISLNK(info.st_mode), 'authenticator storage or socket permissions differ')
        result.setdefault('authenticator_storage', {})[name] = {'uid':uid,'gid':gid,'mode':oct(mode)}
    return result


def boundary_probe():
    script = """from pathlib import Path
try: Path('/data/wallet/wallet-simulator.db').read_bytes()
except PermissionError: print('DENIED')
"""
    result = subprocess.run(['/usr/bin/python3','-I','-B','-c',script], user=1004, group=1004,
        extra_groups=[1000], capture_output=True, timeout=5)
    base.require(result.returncode == 0 and result.stdout == b'DENIED\n', 'authenticator UID can access Wallet database')
    script = """import json,sys
sys.path.insert(0,'/usr/lib/rock-platform')
from service import call
try:
 result=call(sys.argv[1],{'v':1,'op':sys.argv[3]},int(sys.argv[2]),return_errors=True)
 print('ALLOWED' if result.get('ok') is True else 'DENIED' if result.get('code')=='unauthorized' else 'FAILED')
except PermissionError: print('DENIED')
"""
    checks=[]
    for uid,path,peer,op,expected in (
        (1000,'/run/rock-authenticator/api.sock',1004,'auth.status','ALLOWED'),
        (1002,'/run/rock-wallet/api.sock',1003,'snapshot','ALLOWED'),
        (1000,'/run/rock-wallet/api.sock',1003,'snapshot','DENIED')):
        result=subprocess.run(['/usr/bin/python3','-I','-B','-c',script,path,str(peer),op],
            user=uid,group=uid,extra_groups=[],capture_output=True,timeout=8)
        base.require(result.returncode==0 and result.stdout==(expected+'\n').encode(),'actual fixed IPC role check differs')
        checks.append({'client_uid':uid,'peer_uid':peer,'op':op,'outcome':expected})
    # Only a read operation is attempted. Relax DAC briefly to prove peer
    # rejection independently; restore the exact production modes in finally.
    script = """import json,socket,struct
with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
 s.settimeout(3);s.connect('/run/rock-authenticator/api.sock')
 assert struct.unpack('3i',s.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))[1]==1004
 try:s.sendall(b'{"v":1,"op":"auth.status"}\\n')
 except BrokenPipeError:pass
 data=b''
 while b'\\n' not in data:data+=s.recv(4096)
 value=json.loads(data)
 assert value.get('ok') is False and value.get('code')=='unauthorized'
print('DENIED')
"""
    try:
        os.chmod('/run/rock-authenticator', 0o755); os.chmod('/run/rock-authenticator/api.sock', 0o666)
        denied = []
        for uid in (1001,1002,1003):
            result = subprocess.run(['/usr/bin/python3','-I','-B','-c',script], user=uid, group=uid,
                extra_groups=[], capture_output=True, timeout=5)
            base.require(result.returncode == 0 and result.stdout == b'DENIED\n', 'nonowner authenticator peer accepted')
            denied.append(uid)
    finally:
        os.chmod('/run/rock-authenticator/api.sock',0o660); os.chmod('/run/rock-authenticator',0o750)
    return {'authenticator_wallet_db_denied':True,'nonowner_authenticator_uids_denied':denied,
            'read_only_probe_operations':['auth.status','snapshot'],'fixed_ipc_roles':checks,'temporary_dac_restored':True}


def ui_key(value): return type(value) is str and re.fullmatch(r'ui-[a-f0-9]{32}',value) is not None


def no_pin_fields(value):
    if isinstance(value,dict):
        base.require(not any(str(key).casefold() in ('pin','test_pin','auth_pin','password') for key in value),
                     'PIN field found in decoded private receipt')
        for item in value.values():no_pin_fields(item)
    elif isinstance(value,list):
        for item in value:no_pin_fields(item)


def final_database(data):
    c = counts(data)
    expected = {'wallet_auth_credentials':1,'wallet_auth_credential_state':1,'wallet_auth_challenges':1,
        'wallet_auth_terms':1,'wallet_auth_quotes':2,'wallet_auth_approvals':1,'wallet_idempotency':10,
        'wallet_withdrawals':1,'wallet_bills':0,'wallet_journals':4,'atm_credentials':1}
    base.require(all(c['ledger.'+name] == value for name,value in expected.items()) and
        c['member.device_api_receipts'] == 1 and all(c['member.'+name] == 0 for name in ('consents','device_monthly_due','authorizations')) and
        c['authenticator.credentials'] == 1 and c['authenticator.requests'] == 2, 'unexpected final ceremony or financial counts')
    registration = data['member.device_api_receipts'][0]
    base.require(ui_key(registration['key']) and json.loads(registration['request_json']) ==
        {'v':1,'op':'wallet.register','key':registration['key']} and json.loads(registration['response_json'])['ok'] is True,
        'native purchase registration receipt missing')
    receipts = data['ledger.wallet_idempotency']
    expected_ops = ['wallet.auth.begin','wallet.auth.enroll','wallet.terms','sale','settle',
                    'wallet.atm.quote','wallet.atm.quote.cancel','wallet.atm.quote','wallet.atm.issue','atm.cancel']
    base.require([row['operation'] for row in receipts] == expected_ops and all(ui_key(row['key']) for row in receipts) and
        len({registration['key'],*(row['key'] for row in receipts)}) == 11, 'ordered native immutable receipts differ')
    requests = [json.loads(row['input_json']) for row in receipts]
    results = [json.loads(row['result_json']) for row in receipts]
    for value in requests+results+[json.loads(registration['request_json']),json.loads(registration['response_json'])]:no_pin_fields(value)
    auth_requests = data['authenticator.requests']
    base.require([row['operation'] for row in auth_requests] == ['create','get'] and all(ui_key(row['request_key']) for row in auth_requests),
        'authenticator operations were not explicit native creation and assertion')
    created, asserted = [json.loads(row['response']) for row in auth_requests]
    begin = results[0]['result']; enrolled = requests[1]['request']; issue = requests[8]['request']
    base.require(enrolled['credential'] == created and enrolled['challenge_id'] == begin['challenge_id'] and
        issue['credential'] == asserted, 'actual native authenticator response differs from Wallet submission')
    record = crypto.verify_registration(created, challenge=begin['options']['publicKey']['challenge'], rp_id=crypto.RP_ID,origin=crypto.ORIGIN)
    base.require(record == json.loads(data['ledger.wallet_auth_credentials'][0]['record_json']), 'enrolled crypto record differs')
    quote1,quote2 = data['ledger.wallet_auth_quotes']
    quote = json.loads(quote2['quote_json']); quote_response = results[7]['result']
    base.require(quote1['state']=='CANCELED' and quote2['state']=='CONSUMED' and quote == quote_response['quote'] and
        issue['quote_id']==quote['quote_id'] and issue['key']==quote['issue_key'] and
        quote['amount_minor']==quote['total_debit_minor']==quote['cash_received_minor']==1000 and quote['fee_minor']==0 and
        quote['atm_id']=='SIM-ATM-001' and quote['policy']=='simulator-zero-fee-v1', 'confirmed quote/amount/ATM binding differs')
    updated = crypto.verify_assertion(asserted,challenge=quote_response['options']['publicKey']['challenge'],
        rp_id=crypto.RP_ID,origin=crypto.ORIGIN,record=record,user_handle=begin['options']['publicKey']['user']['id'])
    base.require(updated==json.loads(data['ledger.wallet_auth_credential_state'][0]['record_json']) and updated['sign_count']==1 and
        data['authenticator.credentials'][0]['sign_count']==1, 'actual signature or retained counter differs')
    approval = data['ledger.wallet_auth_approvals'][0]; issued = results[8]['result']; withdrawal = data['ledger.wallet_withdrawals'][0]
    base.require(approval['assertion_sha256']==base.digest(asserted) and approval['quote_id']==issue['quote_id'] and
        approval['withdrawal_id']==issued['withdrawal_id']==withdrawal['id'] and issued['authentication']=='verified_software_test_assertion' and
        issued['approval_id']==approval['approval_id'] and issued['amount_minor']==1000 and
        issued['code_sha256']==hashlib.sha256(issued['code'].encode()).hexdigest(), 'verified approval, issuance and hold differ')
    base.require(withdrawal['amount_minor']==withdrawal['released_minor']==1000 and withdrawal['dispensed_minor']==0 and
        withdrawal['status']=='REVERSED' and data['ledger.atm_credentials'][0]['state']=='CANCELED' and
        data['ledger.atm_credentials'][0]['consumed_at'] is None, 'unconsumed hold did not safely cancel')
    base.require(data['balances']=={'AVAILABLE':5000,'PENDING_SETTLEMENT':0,'SALE_CLEARING':-5000,'WITHDRAW_HOLD':0}, 'final double entry balances differ')
    for row in auth_requests:
        no_pin_fields(json.loads(row['payload']));no_pin_fields(json.loads(row['response']))
    return {'counts':c,'registration_key':registration['key'],'receipts':[{'key':r['key'],'op':r['operation'],
        'input_sha256':base.digest(json.loads(r['input_json'])),'result_sha256':base.digest(json.loads(r['result_json']))} for r in receipts],
        'authenticator_receipts':[{'key':r['request_key'],'op':r['operation'],'options_sha256':base.digest(json.loads(r['payload'])),
            'credential_sha256':base.digest(json.loads(r['response']))} for r in auth_requests],
        'credential_id':record['credential_id'],'assertion_sha256':base.digest(asserted),'quote':quote,
        'withdrawal_id':withdrawal['id'],'code_sha256':issued['code_sha256'],'balances':data['balances'],
        'registration_and_assertion_reverified':True,'pin_in_receipts':False,'raw_code_exported':False}


def persist(report):
    raw = base.canonical(report)+b'\n'; temporary=PROOF.with_suffix('.tmp')
    fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream: stream.write(raw);stream.flush();os.fsync(stream.fileno())
    os.replace(temporary,PROOF)
    directory=os.open('/data',os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(directory)
    finally:os.close(directory)


def observe(report):
    initial=base.read_api('snapshot')['snapshot']; first=rows()
    base.wallet_baseline(initial['wallet']); safe_wallet(initial['wallet'])
    base.require(not initial['wallet']['membership']['registered'] and all(v==0 for v in counts(first).values()),'fresh data required')
    env=environment(); report.update(environment_initial=env,boundaries=boundary_probe(),hub_sha256=base.digest(initial['hub']),stages=[])
    stage,challenge_at=0,None
    base.emit('ROCK_UI_AUTH_READY')
    deadline=time.monotonic()+300
    while time.monotonic()<deadline:
        snapshot=base.read_api('snapshot')['snapshot']; wallet=safe_wallet(snapshot['wallet']); data=rows(); c=counts(data)
        base.require(base.digest(snapshot['hub'])==report['hub_sha256'] and base.read_receipts()==[], 'authentication changed Tools')
        marker=None
        if stage==0 and wallet['registered']:stage,marker=1,'REGISTERED'
        elif stage==1 and c['ledger.wallet_auth_challenges']==1:stage,marker,challenge_at=2,'CHALLENGE',time.monotonic()
        elif stage==2 and time.monotonic()-challenge_at>=10:
            base.require(c['authenticator.requests']==c['authenticator.credentials']==c['ledger.wallet_auth_credentials']==0 and
                wallet['held_minor']==0 and wallet['active'] is False,'wrong PIN observation created credential or hold')
            stage,marker=3,'WRONG_PIN_NO_SIGNATURE'
        elif stage==3 and wallet['activation_state']=='TERMS_REQUIRED':stage,marker=4,'ENROLLED'
        elif stage==4 and wallet['active']:stage,marker=5,'TERMS_ACCEPTED'
        elif stage==5 and wallet['pending_minor']==5000:stage,marker=6,'CREDIT_PENDING'
        elif stage==6 and wallet['available_minor']==5000 and wallet['pending_minor']==0:stage,marker=7,'FUNDED'
        elif stage==7 and c['ledger.wallet_auth_quotes']==1:
            base.require(wallet['held_minor']==0 and c['ledger.wallet_auth_approvals']==0,'quote reserved before confirmation')
            stage,marker=8,'QUOTE_NO_HOLD'
        elif stage==8 and data['ledger.wallet_auth_quotes'][0]['state']=='CANCELED':
            base.require(wallet['held_minor']==0 and c['authenticator.requests']==1,'Back signed or created a hold')
            stage,marker=9,'QUOTE_CANCELED_NO_HOLD'
        elif stage==9 and c['ledger.wallet_auth_quotes']==2:stage,marker=10,'SECOND_QUOTE'
        elif stage==10 and wallet['held_minor']==1000:
            base.require(wallet['available_minor']==4000 and c['ledger.wallet_auth_approvals']==1,'signed issue did not create exact hold')
            stage,marker=11,'ISSUED'
        elif stage==11 and wallet['held_minor']==0:
            final=final_database(data)
            base.require(wallet['available_minor']==5000 and wallet['active'] is True,'final Wallet state differs')
            final_env=environment();base.require(final_env['processes']==env['processes'],'service restarted')
            report.update(database=final,wallet_final=wallet,environment_final=final_env)
            stage,marker=12,'CANCELED'
        if marker:
            report['stages'].append({'stage':stage,'marker':marker,'observed_unix':time.time(),'wallet':wallet,'counts':c})
            base.emit('ROCK_UI_AUTH_'+marker)
        if stage==12:
            report['status']='PASS';report['finished_unix']=time.time();persist(report)
            base.emit('ROCK_UI_AUTH_PROOF',report);base.emit('ROCK_UI_AUTH_READY_FOR_NATIVE_POWEROFF')
            return
        time.sleep(.25)
    raise TimeoutError('native authentication sequence incomplete')


def main():
    base.require(os.geteuid()==0 and os.uname().machine=='aarch64' and
        Path('/proc/cmdline').read_text().split().count('rock.ui.auth.verify=1')==1,'explicit root ARM64 verification required')
    report={'schema':'rock-native-auth-ui-proof/1','status':'FAIL','started_unix':time.time(),
        'boot_id':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
        'scope':'native framebuffer/evdev public software authenticator; observer business mutations zero',
        'blackberry':'NOT_RUN','hardware_authenticator':'NOT_RUN','biometric':'NOT_RUN','real_money':'NOT_RUN',
        'real_atm':'NOT_CONNECTED','observer_business_mutations':0,'observer_power_requests':0}
    try:observe(report)
    except BaseException as error:
        report.update(status='FAIL',error_type=type(error).__name__,finished_unix=time.time())
        try:persist(report)
        finally:base.emit('ROCK_UI_AUTH_FAIL',{'error_type':type(error).__name__})


if __name__=='__main__':main()
