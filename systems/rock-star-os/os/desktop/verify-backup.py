#!/usr/bin/env python3
"""Stopped desktop -> verified backup -> new offline device -> native UI shutdown.

Never repairs/mounts the source or sends host power/reset commands. Failure
retains the newly restored device for inspection rather than forcing it off.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import time

import guest
import backup

UI = Path(__file__).resolve().parents[1]/'ui'
sys.path.insert(0,str(UI))
spec=importlib.util.spec_from_file_location('backup_native_power',UI/'verify-power.py')
power=importlib.util.module_from_spec(spec);spec.loader.exec_module(power)

SOURCES = {
    'hub': ('/platform/hub.db', ('hub_packages','hub_installed','hub_revoked','hub_jobs','hub_audit','hub_requests',
                               'rock_registry_requests')),
    'wallet': ('/wallet/wallet-simulator.db', ('wallet_journals','wallet_postings','wallet_sales','wallet_withdrawals',
                                            'wallet_consents','wallet_bills','wallet_idempotency','atm_wallet_binding','atm_credentials',
                                            'wallet_auth_mode','wallet_auth_credentials','wallet_auth_credential_state',
                                            'wallet_auth_challenges','wallet_auth_terms','wallet_auth_quotes','wallet_auth_approvals')),
    'membership': ('/wallet/entitlement.db', ('devices','accounts','consents','authorizations','authorization_claims',
                                           'receipts','wallet_bindings','streams','events','device_binding','device_runtime',
                                           'device_api_receipts','device_monthly_due','account_devices','device_register_origins')),
    'remote': ('/platform/remote/remote.sqlite3', ('remote_jobs','remote_cancel_receipts')),
    'authenticator': ('/authenticator/authenticator.sqlite3', ('metadata','credentials','requests')),
    'power': ('/system/power.db', ('requests',)),
}
BUSINESS_ROLES = ('hub','wallet','membership','remote','authenticator')
MAX_ROWS, MAX_ROW_BYTES, MAX_SNAPSHOT_BYTES = 20000, 2*1024*1024, 64*1024*1024
COMPARISON_CONTRACT = {
    'schema': 'rock-closed-business-retention/4',
    'business_tables': 44,
    'before_boot': 'whole source/backup/restored image bytes and all observed SQLite schema, sequence and rows must match',
    'after_boot': 'all Hub, Wallet/ATM, entitlement and OS remote controller rows/schema/sequences must match exactly',
    'power_exception': 'old power receipts unchanged; exactly one additional dispatched native shutdown for a different boot',
    'quiescence': 'no unfinished local/remote execution, registry refresh, monthly due work or incomplete registration receipt',
    'utc_month': 'same-month strict preservation; month-counter advance is not silently ignored or called data loss',
    'excluded_after_boot': ['entropy seed rotation', 'transient lock/PID/socket state', 'filesystem access/allocation metadata',
                            'OS update boot-health metadata', 'external runner/provider state outside the data disk'],
    'scope_limit': '44 fixed SQLite business tables including contract-device links, registration origins, Wallet authentication ceremonies and authenticator counters/receipts; whole-image preboot comparison also covers other files, but postboot cache/file trees are not separately enumerated',
    'privacy': 'private temporary DB copies only; public evidence contains counts, logical/schema hashes and financial totals, never Wallet/membership/credential rows',
}


def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()


def hashed(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def business_snapshot(data):
    """Export fixed closed DBs temporarily; return hashes/counts, never Wallet rows."""
    result, hub_rows, power_rows, used = {}, {}, [], 0
    with tempfile.TemporaryDirectory(prefix='rock-backup-db-') as temporary:
        for role,(source,tables) in SOURCES.items():
            destination=Path(temporary)/(role+'.sqlite3')
            power.export_closed_database(data,source,destination)
            destination.chmod(0o600)
            with closing(sqlite3.connect(destination.as_uri()+'?mode=ro',uri=True)) as db:
                db.execute('PRAGMA query_only=ON')
                db.execute('BEGIN')
                guest.require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','database integrity failed: '+role)
                guest.require(db.execute('PRAGMA foreign_key_check').fetchone() is None,'database foreign key check failed: '+role)
                db.row_factory=sqlite3.Row
                actual={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                guest.require(actual - {'sqlite_sequence'} == set(tables),'missing or unreviewed business table in '+role)
                schema=[dict(row) for row in db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')]
                observed,internal={},{}
                for table in (*tables, *(('sqlite_sequence',) if 'sqlite_sequence' in actual else ())):
                    rows,encoded=[],[]
                    for record in db.execute('SELECT * FROM '+table+' LIMIT '+str(MAX_ROWS+1)):
                        guest.require(len(rows)<MAX_ROWS,'bounded database evidence exceeded: '+role+'/'+table)
                        row=dict(record)
                        raw=canonical(row)
                        used+=len(raw)
                        guest.require(len(raw)<=MAX_ROW_BYTES and used<=MAX_SNAPSHOT_BYTES,'bounded private snapshot byte budget exceeded')
                        rows.append(row)
                        encoded.append(raw.decode())
                    entry={'rows':len(rows),'logical_sha256':hashed(sorted(encoded))}
                    (internal if table=='sqlite_sequence' else observed)[table]=entry
                    if role=='hub': hub_rows[table]=rows
                    if role=='power': power_rows=rows
                result[role]={'integrity':'ok','foreign_keys':'ok','tables':observed,'internal_sequences':internal,
                              'schema_sha256':hashed(schema)}
                if role=='wallet': result[role]['financial_summary']=wallet_totals(db)
                if role=='membership':
                    result[role]['financial_summary']={
                        'registered_accounts':db.execute('SELECT COUNT(*) FROM accounts').fetchone()[0],
                        'auto_renew_accounts':db.execute('SELECT COUNT(*) FROM accounts WHERE auto_renew=1').fetchone()[0],
                        'paid_authorizations':db.execute("SELECT COUNT(*) FROM authorizations WHERE state='PAID'").fetchone()[0],
                        'paid_months':db.execute("SELECT COUNT(*) FROM device_monthly_due WHERE status='paid'").fetchone()[0]}
                if role=='hub':
                    unfinished=db.execute("SELECT COUNT(*) FROM rock_registry_requests WHERE status IN ('queued','running')").fetchone()[0]
                elif role=='remote':
                    unfinished=db.execute("SELECT COUNT(*) FROM remote_jobs WHERE state NOT IN ('prepared','succeeded','failed','cancelled','indeterminate','rejected')").fetchone()[0]
                elif role=='membership':
                    unfinished=db.execute("SELECT COUNT(*) FROM device_monthly_due WHERE status IN ('due','processing','retry_wait')").fetchone()[0]
                    unfinished+=db.execute('SELECT COUNT(*) FROM device_api_receipts WHERE response_json IS NULL').fetchone()[0]
                else: unfinished=0
                guest.require(unfinished==0,'source is not quiescent for strict restoration: '+role)
    return result,hub_rows,power_rows


def wallet_totals(db):
    """Fixed money/count fields only; no subject, credential or request values."""
    accounts={name:db.execute('SELECT COALESCE(SUM(delta_minor),0) FROM wallet_postings WHERE account=?',(name,)).fetchone()[0]
              for name in ('AVAILABLE','PENDING_SETTLEMENT','WITHDRAW_HOLD','CASH_DISPENSED','SERVICE_FEES')}
    bill=db.execute('SELECT COUNT(*),COALESCE(SUM(amount_minor),0) FROM wallet_bills').fetchone()
    total=db.execute('SELECT COALESCE(SUM(delta_minor),0) FROM wallet_postings').fetchone()[0]
    guest.require(total==0,'Wallet double-entry totals do not balance')
    return {'currency':'USD','simulation_only':True,'available_minor':accounts['AVAILABLE'],
            'pending_minor':accounts['PENDING_SETTLEMENT'],'held_minor':accounts['WITHDRAW_HOLD'],
            'dispensed_minor':accounts['CASH_DISPENSED'],'billed_minor':accounts['SERVICE_FEES'],
            'bill_count':bill[0],'bill_total_minor':bill[1],'ledger_balance_minor':total,
            'sale_count':db.execute('SELECT COUNT(*) FROM wallet_sales').fetchone()[0],
            'withdrawal_count':db.execute('SELECT COUNT(*) FROM wallet_withdrawals').fetchone()[0],
            'credential_count':db.execute('SELECT COUNT(*) FROM atm_credentials').fetchone()[0]}


def source_receipts(hub_rows):
    installed=hub_rows['hub_installed'];jobs=hub_rows['hub_jobs'];receipts={row['key']:row for row in hub_rows['hub_requests']}
    guest.require(any(row['enabled']==1 for row in installed),'source has no approved installed Tool')
    guest.require(all(row['status'] not in ('running','queued','cancel_requested') for row in jobs),'source has an unfinished local job')
    completed=[row for row in jobs if row['status']=='succeeded']
    guest.require(completed,'source has no completed job to preserve')
    summary=[]
    for job in completed:
        receipt=receipts.get(job['key'])
        guest.require(receipt is not None and json.loads(receipt['result']).get('id')==job['id'],
                      'completed job lacks its original durable request receipt')
        summary.append({'id':job['id'],'tool_id':job['tool_id'],'version':job['version'],'key':job['key'],
                        'package_hash':job['package_hash'],'output_sha256':hashlib.sha256(job['output'].encode()).hexdigest(),
                        'receipt_request_hash':receipt['request_hash'],'receipt_sha256':hashed(receipt)})
    return {'installed':installed,'completed_jobs':summary,'total_receipts':len(receipts)}


def compare_business(before,after):
    guest.require(set(before)==set(after)==set(SOURCES),'restored database role coverage differs')
    for role in BUSINESS_ROLES:
        guest.require(before[role]==after[role],'restored business data changed: '+role)
    for name in ('schema_sha256','internal_sequences'):
        guest.require(before['power'][name]==after['power'][name],'restored power schema changed')


def capture_wallet_read_only(ui):
    """The fixed extra path sends navigation and scroll only, never Wallet actions."""
    ui.click(606,913)
    time.sleep(2)
    ui.capture('04-restored-wallet-membership')
    ui.keys(['pgdn'])
    time.sleep(1)
    ui.capture('05-restored-wallet-balances')


def power_transition(before,after,events):
    old={row['key']:row for row in before};new={row['key']:row for row in after}
    guest.require(old and set(old)<set(new) and len(new)==len(old)+1,'expected exactly one new native power request')
    guest.require(all(new[key]==row for key,row in old.items()),'old power receipt changed after restoration')
    previous=max(before,key=lambda row:row['created_unix'])
    current=next(row for key,row in new.items() if key not in old)
    power.guest.validate_record(previous,'poweroff',previous['boot_id'],dispatched=True)
    power.guest.validate_record(current,'poweroff',current['boot_id'],dispatched=True)
    guest.require(previous['boot_id']!=current['boot_id'],'restored OS did not have a new kernel boot identity')
    shutdown=[event for event in events if event.get('event')=='SHUTDOWN' and event.get('data',{}).get('guest') is True]
    guest.require(len(shutdown)==1 and not any(event.get('event')=='RESET' for event in events),'expected one guest-initiated shutdown and no reset')
    return {'source_boot_id':previous['boot_id'],'restored_boot_id':current['boot_id'],
            'source_shutdown_receipt_sha256':hashed(previous),'restored_shutdown_receipt_sha256':hashed(current),
            'new_native_power_key':current['key'],'old_receipts_preserved':len(old)}


def wait_for(predicate,message,record,timeout):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if predicate(): return
        guest.require(guest.running(record),'restored device exited before '+message)
        time.sleep(.2)
    raise TimeoutError(message)


def run(source_name,restored_name):
    guest.require(sys.platform=='linux' and os.geteuid()!=0,'run as the Linux build VM owner')
    guest.require(all(isinstance(name,str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}',name)
                      for name in (source_name,restored_name)),'invalid virtual-device name')
    guest.require(source_name!=restored_name,'restoration requires another new name')
    source_state=guest.state_path(source_name)
    guest.require(not guest.status(source_name).get('running'),'source device is still running; stop normally before verification')
    destination=guest.BASE/restored_name
    guest.require(not destination.exists(),'restored device name already exists; no overwrite or reuse')
    directory=source_state/'backup-verifications';guest.directory(directory)
    output=Path(tempfile.mkdtemp(prefix=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-',dir=directory))
    report={'schema':'rock-desktop-backup-actual/2','status':'FAIL','started_utc':datetime.now(timezone.utc).isoformat(),
            'source_device':source_name,'restored_device':restored_name,'blackberry':'NOT_RUN','physical_usb':'NOT_RUN',
            'real_money':'NOT_RUN','host_power_commands':0,'input_events':[],'screenshots':[],'qmp_events':[],'qmp_commands':[],
            'visual_review':'PENDING','evidence':str(output),'comparison_contract':COMPARISON_CONTRACT}
    record=monitor=None; source_hash=backup_hash=None; backup_data=None
    try:
        # create_backup holds the source device lock and checks clean shutdown.
        saved=backup.create_backup(source_name);backup_data=Path(saved['backup'])/'userdata.ext4'
        source_hash=saved['userdata_sha256'];backup_hash=guest.digest(backup_data)
        guest.require(guest.digest(source_state/'userdata.ext4')==source_hash==backup_hash,'source/backup copy hash differs')
        baseline,baseline_hub,baseline_power=business_snapshot(backup_data)
        report['wallet_summary_before']=baseline['wallet']['financial_summary']
        report['membership_summary_before']=baseline['membership']['financial_summary']
        report['preserved_receipts']=source_receipts(baseline_hub)
        previous=max(baseline_power,key=lambda row:row['created_unix']) if baseline_power else None
        guest.require(previous is not None,'source normal-shutdown receipt missing')
        power.guest.validate_record(previous,'poweroff',previous['boot_id'],dispatched=True)
        restored=backup.restore_backup(saved['backup'],restored_name)
        config=restored['config'];guest.require(config.get('network')=='none','restored device must remain offline')
        data=guest.BASE/restored_name/'userdata.ext4'
        guest.require(guest.digest(data)==source_hash,'restored whole image differs before first boot')
        restored_before,_,_=business_snapshot(data)
        guest.require(restored_before==baseline,'restored logical database differs before first boot')
        image_hashes={name:guest.digest(Path(config['images'])/name) for name in ('Image','rootfs.ext4')}
        report.update(backup=str(Path(saved['backup'])),source_sha256_before=source_hash,backup_sha256_before=backup_hash,
                      restored_sha256_before_boot=guest.digest(data),logical_before=baseline,network='none',image_sha256=image_hashes)
        record=guest.start(config)
        guest.require(not record['reused'],'restore must start a new owned device process')
        report['restored_session']=record['session']
        monitor=power.Monitor(Path(record['qmp_socket']),report)
        ui=power.native.NativeInput(monitor,output,report)
        log=Path(record['session'])/'boot.log'
        wait_for(lambda:'ROCK_PLATFORM_READY' in log.read_text(errors='replace'),'platform readiness',record,180)
        time.sleep(7)
        ui.capture('00-restored-hub')
        ui.click(277,913);time.sleep(2);ui.capture('01-preserved-installed-tools')
        ui.click(442,913);time.sleep(2);ui.capture('02-preserved-job-history')
        ui.click(360,285);time.sleep(2);ui.capture('03-preserved-job-result')
        capture_wallet_read_only(ui)
        ui.click(636,26);time.sleep(1);ui.capture('06-device-power')
        ui.click(360,618);time.sleep(1);ui.capture('07-normal-shutdown-confirmation')
        ui.click(497,577)
        deadline=time.monotonic()+120
        while guest.running(record) and time.monotonic()<deadline:
            time.sleep(.3)
        guest.require(not guest.running(record),'normal UI shutdown did not complete; restored device retained for inspection')
        monitor.reader.join(timeout=3)
        serial=log.read_text(errors='replace')
        guest.require(serial.count('reboot: Power down')==1 and 'reboot: Restarting system' not in serial,'kernel normal shutdown marker missing')
        report['restored_filesystem_check']=backup.check_disk(data)
        after,after_hub,after_power=business_snapshot(data)
        compare_business(baseline,after)
        report['wallet_summary_after']=after['wallet']['financial_summary']
        report['membership_summary_after']=after['membership']['financial_summary']
        guest.require(source_receipts(after_hub)==report['preserved_receipts'],'installed/job receipts differ after boot')
        report['boot_transition']=power_transition(baseline_power,after_power,report['qmp_events'])
        guest.require(set(report['qmp_commands'])<=power.Monitor.ALLOWED and
                      not any('verify=1' in value for value in record['identity']['command']),'unexpected guest hook or host power command')
        guest.require({name:guest.digest(Path(config['images'])/name) for name in image_hashes}==image_hashes,'frozen OS image changed')
        report.update(status='AUTOMATED_PASS',logical_after=after,restored_sha256_after_boot=guest.digest(data),
                      meaning='OS/data/receipt/shutdown checks passed; original UI captures require visual review')
    except BaseException as error:
        report.update(status='FAIL',error=type(error).__name__+': '+str(error))
        if monitor and record and guest.running(record):
            try: monitor.command('screendump',{'filename':str(output/'failure-display.png'),'format':'png'})
            except BaseException: pass
    finally:
        errors=[]
        if monitor:
            try: monitor.close()
            except BaseException as error: errors.append('monitor: '+type(error).__name__)
        if source_hash is not None:
            try:
                report['source_sha256_after']=guest.digest(source_state/'userdata.ext4')
                report['backup_sha256_after']=guest.digest(backup_data)
                guest.require(report['source_sha256_after']==source_hash and report['backup_sha256_after']==backup_hash,
                              'source or backup changed during verification')
            except BaseException as error: errors.append(type(error).__name__+': '+str(error))
        if record: report['restored_device_still_running']=guest.running(record)
        if errors: report.update(status='FAIL',finalization_errors=errors)
        report['finished_utc']=datetime.now(timezone.utc).isoformat()
        guest.save(output/'report.json',report)
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',default='browser-1244')
    parser.add_argument('--restored',default='browser-restored-1244')
    args=parser.parse_args()
    result=run(args.source,args.restored)
    print(json.dumps({'status':result['status'],'evidence':result['evidence'],'visual_review':result['visual_review'],
                      'restored_device_still_running':result.get('restored_device_still_running',False)},ensure_ascii=False))
    return 0 if result['status']=='AUTOMATED_PASS' else 1


if __name__=='__main__': raise SystemExit(main())
