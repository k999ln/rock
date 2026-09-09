#!/usr/bin/env python3
"""Stopped desktop -> verified backup -> new offline device -> native UI shutdown.

Never repairs/mounts the source or sends host power/reset commands. Failure
retains the newly restored device for inspection rather than forcing it off.
"""
import argparse
from contextlib import closing, ExitStack
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
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
MAX_TABLES, MAX_SCHEMA_OBJECTS = 256, 1024
COMPARISON_CONTRACT = {
    'schema': 'rock-closed-business-retention/5',
    'business_tables': 'profile-required tables plus every additional observed table; no table exclusions',
    'before_boot': 'whole source/backup/restored image bytes and all observed SQLite schema, sequence and rows must match',
    'after_boot': 'all profile DB rows/schema/sequences must match exactly except the single native power request',
    'power_exception': 'old power receipts unchanged; exactly one additional dispatched native shutdown for a different boot',
    'quiescence': 'no unfinished local/remote execution, registry refresh, monthly due work or incomplete registration receipt',
    'utc_month': 'same-month strict preservation; month-counter advance is not silently ignored or called data loss',
    'excluded_after_boot': ['entropy seed rotation', 'transient lock/PID/socket state', 'filesystem access/allocation metadata',
                            'OS update boot-health metadata', 'external runner/provider state outside the data disk'],
    'scope_limit': 'local-ledger or purchaser-cache profile; every table in each required DB is compared, including added tables; external authority/runner/provider restoration is a separate required gate when configured or used; postboot non-SQLite file trees and unlisted DB files are not separately enumerated',
    'privacy': 'private temporary DB copies only; public evidence contains counts, logical/schema hashes and financial totals, never Wallet/membership/credential rows',
}


def disk_manifest(saved):
    """Normalize both real backup formats without pretending data-only is A/B."""
    device = saved.get('config', {}).get('schema')
    if saved.get('schema') == 'rock-desktop-backup/1':
        guest.require(device in tuple('rock-desktop-device/'+str(v) for v in range(1, 5)),
                      'legacy backup requires a non-stage0 device')
        disks = {'userdata.ext4': {'sha256': saved.get('userdata_sha256'), 'bytes': saved.get('bytes')}}
    elif saved.get('schema') == 'rock-desktop-backup/2':
        from stage0 import DISKS
        guest.require(device in guest.STAGE0_SCHEMAS, 'A/B/data backup requires stage0 device')
        disks = saved.get('disks')
        guest.require(type(disks) is dict and set(disks) == set(DISKS), 'exact A/B/data manifest required')
    else:
        raise ValueError('unknown backup format')
    for value in disks.values():
        guest.require(type(value) is dict and set(value) == {'sha256', 'bytes'} and
                      type(value['bytes']) is int and 0 < value['bytes'] <= 2*1024**3 and
                      type(value['sha256']) is str and re.fullmatch('[0-9a-f]{64}', value['sha256']),
                      'invalid backup disk manifest')
    return {name: dict(value) for name, value in disks.items()}


def verify_disk_set(manifest, directory, label):
    observed = {}
    for name, expected in manifest.items():
        path = Path(directory)/name
        info = backup.regular(path)
        observed[name] = {'sha256': guest.digest(path), 'bytes': info.st_size}
        guest.require(observed[name] == expected, label+' disk '+name+' differs from manifest')
    return observed


def retention_profile(config):
    version = config.get('schema')
    guest.require(version in tuple('rock-desktop-device/'+str(v) for v in range(1, 7)),
                  'unknown retention device profile')
    sources = dict(SOURCES)
    if version in ('rock-desktop-device/4', 'rock-desktop-device/5'):
        del sources['wallet'], sources['membership']
        sources['wallet_cache'] = ('/wallet/backend-cache/remote-cache.db', ('identity', 'requests', 'snapshot'))
        return {'name': 'purchaser-remote-authority/1', 'sources': sources,
                'forbidden_databases': [SOURCES['wallet'][0], SOURCES['membership'][0]]}
    return {'name': 'local-wallet-simulator/1', 'sources': sources,
            'forbidden_databases': ['/wallet/backend-cache/remote-cache.db']}


def closed_file_exists(data, path):
    guest.require(re.fullmatch('/[A-Za-z0-9_./-]+', path), 'fixed guest database path required')
    result = subprocess.run(['debugfs', '-R', 'stat '+path, str(data)], capture_output=True, check=True, timeout=20)
    if b'File not found by ext2_lookup' in result.stderr:
        return False
    guest.require(b'Inode:' in result.stdout and b'Type:' in result.stdout,
                  'could not establish database presence: '+path)
    return True


def verify_profile_layout(data, profile):
    for path in profile['forbidden_databases']:
        guest.require(not closed_file_exists(data, path), 'conflicting Wallet database for retention profile')


def external_coverage(config, baseline):
    """Inventory missing external evidence; never infer authority restore from a cache."""
    purchaser = config['schema'] in ('rock-desktop-device/4', 'rock-desktop-device/5')
    required = purchaser or config.get('network', 'none') != 'none' or any(
        table['rows'] for table in baseline['remote']['tables'].values())
    components = {}
    if required:
        components['runner'] = {'database': 'runner/jobs.sqlite3',
                                'required_tables': ['metadata', 'jobs', 'revocations'],
                                'additional_tables': 'all, including runner_service_access for purchaser profiles'}
        components['registry'] = {'scope': 'registry state, package files and publisher/consumer bindings'}
    if purchaser:
        components['wallet_authority'] = {
            'wallet_database': 'wallet/wallet-simulator.db', 'wallet_tables': list(SOURCES['wallet'][1]),
            'membership_database': 'wallet/entitlement.db',
            'membership_tables': [*SOURCES['membership'][1], 'service_access_mode', 'service_access_consumers'],
            'additional_tables': 'all; no omission of future game/account/migration tables',
            'authority_marker': 'wallet/AUTHORITY.json'}
        components['optional_mcp_providers'] = {'scope': 'saved backend configuration and provider/gateway journals if configured',
                                               'configuration_inventory': 'NOT_RUN'}
    return {'required': required, 'status': 'NOT_RUN' if required else 'NOT_APPLICABLE',
            'included_in_device_backup': False, 'required_components': components,
            'authority_id': config.get('services', {}).get('authority_id'),
            'backend_config_sha256': config.get('services', {}).get('sha256'),
            'meaning': 'external backup, fresh-target restore and reconciliation are not performed by this offline guest harness'}


def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()


def hashed(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def business_snapshot(data, profile=None):
    """Require profile DBs and hash all their tables; return no private rows."""
    sources = SOURCES if profile is None else profile['sources']
    result, hub_rows, power_rows, used = {}, {}, [], 0
    with tempfile.TemporaryDirectory(prefix='rock-backup-db-') as temporary:
        for role,(source,tables) in sources.items():
            destination=Path(temporary)/(role+'.sqlite3')
            power.export_closed_database(data,source,destination)
            destination.chmod(0o600)
            with closing(sqlite3.connect(destination.as_uri()+'?mode=ro',uri=True)) as db:
                db.execute('PRAGMA query_only=ON')
                db.execute('BEGIN')
                guest.require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','database integrity failed: '+role)
                guest.require(db.execute('PRAGMA foreign_key_check').fetchone() is None,'database foreign key check failed: '+role)
                db.row_factory=sqlite3.Row
                actual={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' LIMIT "+str(MAX_TABLES+1))}
                guest.require(len(actual)<=MAX_TABLES, 'bounded database table budget exceeded: '+role)
                guest.require(set(tables) <= actual, 'missing required business table in '+role)
                schema=[dict(row) for row in db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name LIMIT '+str(MAX_SCHEMA_OBJECTS+1))]
                guest.require(len(schema)<=MAX_SCHEMA_OBJECTS, 'bounded database schema budget exceeded: '+role)
                used+=len(canonical(schema))
                guest.require(used<=MAX_SNAPSHOT_BYTES, 'bounded private snapshot byte budget exceeded')
                observed,internal={},{}
                for table in sorted(actual):
                    rows,encoded=[],[]
                    quoted = '"'+table.replace('"', '""')+'"'
                    for record in db.execute('SELECT * FROM '+quoted+' LIMIT '+str(MAX_ROWS+1)):
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
                    if role=='power' and table=='requests': power_rows=rows
                result[role]={'integrity':'ok','foreign_keys':'ok','tables':observed,'internal_sequences':internal,
                              'schema_sha256':hashed(schema),
                              'additional_tables':sorted(actual-set(tables)-{'sqlite_sequence'})}
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
                elif role=='wallet_cache':
                    unfinished=db.execute('SELECT COUNT(*) FROM requests WHERE response IS NULL').fetchone()[0]
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


def compare_business(before,after,profile=None):
    sources = SOURCES if profile is None else profile['sources']
    guest.require(set(before)==set(after)==set(sources),'restored database role coverage differs')
    for role in set(sources)-{'power'}:
        guest.require(before[role]==after[role],'restored business data changed: '+role)
    for name in ('schema_sha256','internal_sequences'):
        guest.require(before['power'][name]==after['power'][name],'restored power schema changed')
    guest.require({name: value for name, value in before['power']['tables'].items() if name != 'requests'} ==
                  {name: value for name, value in after['power']['tables'].items() if name != 'requests'},
                  'restored additional power business data changed')


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
    while True:
        if time.monotonic()>deadline: raise TimeoutError(message+' deadline exceeded')
        matched=predicate()
        if time.monotonic()>deadline: raise TimeoutError(message+' deadline exceeded')
        if matched: return
        guest.require(guest.running(record),'restored device exited before '+message)
        time.sleep(min(.2,max(0,deadline-time.monotonic())))


def wait_stopped(record, *, deadline):
    """The deadline starts before confirmation input and is never extended."""
    while True:
        if time.monotonic()>deadline: raise TimeoutError('normal UI shutdown deadline exceeded; device retained')
        running=guest.running(record)
        observed=time.monotonic()
        if observed>deadline: raise TimeoutError('normal UI shutdown deadline exceeded; device retained')
        if not running: return observed
        time.sleep(min(.3,max(0,deadline-observed)))


def session_record(record):
    return {key:value for key,value in record.items() if key not in ('running','reused')}


def require_stopped_device(state, config, *, expected_record=None, fresh=False):
    """Caller holds the existing device lock across this guard and every read."""
    guest.require(backup.exact_json(backup.read_metadata(state/'device.json'),config),
                  'device configuration changed before closed observation')
    path=state/'running.json'
    if fresh:
        guest.require(not path.exists() and not path.is_symlink() and not (state/'sessions').exists(),
                      'restored destination already booted; no reuse before baseline observation')
        current=None
    else:
        current=backup.read_metadata(path)
        guest.require(type(current) is dict and type(current.get('pid')) is int and current['pid']>1 and
                      type(current.get('session')) is str and Path(current['session']).parent==state/'sessions' and
                      re.fullmatch('[0-9a-f]{32}',Path(current['session']).name) and
                      type(current.get('identity')) is dict and set(current['identity'])=={'start_ticks','command'} and
                      type(current['identity']['command']) is list and type(current['identity']['start_ticks']) is str and
                      backup.exact_json(current.get('config'),config), 'invalid stopped session identity')
        if expected_record is not None:
            guest.require(backup.exact_json(current,session_record(expected_record)),
                          'device running record changed before closed observation')
        guest.require(not guest.running(current),'current device is still running; closed observation refused')
    for name in ('vnc.sock','qmp.sock','websocket.sock'):
        guest.remove_stale_socket(state/name)
    return current


def require_first_session(state, record):
    """Reject a complete intervening boot between snapshot lock and start lock."""
    current=backup.read_metadata(state/'running.json')
    guest.require(backup.exact_json(current,session_record(record)), 'restored running record changed after start')
    sessions=state/'sessions'
    guest.require(sessions.is_dir() and not sessions.is_symlink() and
                  {path.name for path in sessions.iterdir()}=={Path(record['session']).name},
                  'restored destination had another session before the observed boot')


def verify_saved_metadata(saved, source_state):
    directory=Path(saved['backup'])
    guest.require(directory.parent==source_state/'backups' and not directory.is_symlink(), 'unexpected source backup directory')
    stored=backup.read_metadata(directory/'backup.json')
    guest.require(backup.exact_json(stored,{key:value for key,value in saved.items() if key not in ('status','backup')}),
                  'saved backup metadata changed after creation')
    guest.require(stored['source_device']==source_state.name and stored['config']['name']==source_state.name,
                  'saved backup belongs to a different source device')
    return disk_manifest(stored)


def require_execution_host():
    guest.require(sys.platform=='linux' and os.geteuid()!=0,'run as the Linux build VM owner')


def run(source_name,restored_name):
    require_execution_host()
    guest.require(all(isinstance(name,str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}',name)
                      for name in (source_name,restored_name)),'invalid virtual-device name')
    guest.require(source_name!=restored_name,'restoration requires another new name')
    source_state=guest.state_path(source_name)
    guest.require(not guest.status(source_name).get('running'),'source device is still running; stop normally before verification')
    destination=guest.BASE/restored_name
    guest.require(not destination.exists(),'restored device name already exists; no overwrite or reuse')
    directory=source_state/'backup-verifications';guest.directory(directory)
    output=Path(tempfile.mkdtemp(prefix=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-',dir=directory))
    report={'schema':'rock-desktop-backup-actual/3','status':'FAIL','started_utc':datetime.now(timezone.utc).isoformat(),
            'source_device':source_name,'restored_device':restored_name,'blackberry':'NOT_RUN','physical_usb':'NOT_RUN',
            'real_money':'NOT_RUN','host_power_commands':0,'input_events':[],'screenshots':[],'qmp_events':[],'qmp_commands':[],
            'visual_review':'PENDING','evidence':str(output),'comparison_contract':COMPARISON_CONTRACT,
            'time_limits':{'platform_ready_seconds':180,'normal_shutdown_seconds':120},
            'writer_fencing':'existing source lock held through restored test and final source checks; destination lock for closed reads'}
    record=monitor=None; manifest=None; backup_directory=None
    source_lock=ExitStack();source_record=source_config=saved=None
    try:
        # create_backup holds the source device lock and checks clean shutdown.
        # Acquire only after it returns: flock on another open descriptor would
        # deadlock. Revalidate the gap before touching source or backup disks.
        saved=backup.create_backup(source_name)
        source_lock.enter_context(backup.locked(source_state))
        source_config=saved['config'];guest.validate_config(source_config)
        source_record=require_stopped_device(source_state,source_config)
        backup_directory=Path(saved['backup']);manifest=verify_saved_metadata(saved,source_state)
        backup_data=backup_directory/'userdata.ext4'
        report['source_disks_before']=verify_disk_set(manifest,source_state,'source')
        report['backup_disks_before']=verify_disk_set(manifest,backup_directory,'backup')
        profile=retention_profile(saved['config']);report['business_profile']=profile
        verify_profile_layout(backup_data,profile)
        baseline,baseline_hub,baseline_power=business_snapshot(backup_data,profile)
        report['external_state']=external_coverage(saved['config'],baseline)
        for role in ('wallet','membership'):
            if role in baseline: report[role+'_summary_before']=baseline[role]['financial_summary']
        report['preserved_receipts']=source_receipts(baseline_hub)
        previous=max(baseline_power,key=lambda row:row['created_unix']) if baseline_power else None
        guest.require(previous is not None,'source normal-shutdown receipt missing')
        power.guest.validate_record(previous,'poweroff',previous['boot_id'],dispatched=True)
        restored=backup.restore_backup(saved['backup'],restored_name)
        config=restored['config'];guest.require(config.get('network','none')=='none','restored device must remain offline')
        data=guest.BASE/restored_name/'userdata.ext4'
        with backup.locked(destination):
            require_stopped_device(destination,config,fresh=True)
            report['restored_disks_before_boot']=verify_disk_set(manifest,data.parent,'restored before boot')
            guest.require(retention_profile(config)==profile,'restored device profile changed')
            verify_profile_layout(data,profile)
            restored_before,_,_=business_snapshot(data,profile)
            guest.require(restored_before==baseline,'restored logical database differs before first boot')
            image_hashes={name:guest.digest(Path(config['images'])/name) for name in config['sha256']}
            source_hash=manifest['userdata.ext4']['sha256']
            report.update(backup=str(backup_directory),backup_schema=saved['schema'],source_sha256_before=source_hash,backup_sha256_before=source_hash,
                          restored_sha256_before_boot=guest.digest(data),logical_before=baseline,network='none',image_sha256=image_hashes)
        record=guest.start(config)
        guest.require(not record['reused'],'restore must start a new owned device process')
        with backup.locked(destination):
            require_first_session(destination,record)
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
        shutdown_started=time.monotonic();deadline=shutdown_started+report['time_limits']['normal_shutdown_seconds']
        ui.click(497,577)
        report['normal_shutdown_seconds']=wait_stopped(record,deadline=deadline)-shutdown_started
        monitor.reader.join(timeout=3)
        serial=log.read_text(errors='replace')
        guest.require(serial.count('reboot: Power down')==1 and 'reboot: Restarting system' not in serial,'kernel normal shutdown marker missing')
        with backup.locked(destination):
            require_stopped_device(destination,config,expected_record=record)
            report['restored_filesystem_check']=backup.check_disk(data)
            verify_profile_layout(data,profile)
            after,after_hub,after_power=business_snapshot(data,profile)
            compare_business(baseline,after,profile)
            for role in ('wallet','membership'):
                if role in after: report[role+'_summary_after']=after[role]['financial_summary']
            guest.require(source_receipts(after_hub)==report['preserved_receipts'],'installed/job receipts differ after boot')
            report['boot_transition']=power_transition(baseline_power,after_power,report['qmp_events'])
            guest.require(set(report['qmp_commands'])<=power.Monitor.ALLOWED and
                          not any('verify=1' in value for value in record['identity']['command']),'unexpected guest hook or host power command')
            guest.require({name:guest.digest(Path(config['images'])/name) for name in image_hashes}==image_hashes,'frozen OS image changed')
            report['restored_slots_after_boot']=verify_disk_set(
                {name: value for name,value in manifest.items() if name!='userdata.ext4'},data.parent,'restored slot after boot')
            incomplete=report['external_state']['required']
            report.update(status='INCOMPLETE' if incomplete else 'AUTOMATED_PASS',local_checks='AUTOMATED_PASS',
                          logical_after=after,restored_sha256_after_boot=guest.digest(data),
                          meaning=('local device checks passed; required external authority/runner/provider restoration remains NOT_RUN'
                                   if incomplete else 'local OS/data/receipt/shutdown checks passed; original UI captures require visual review'))
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
        if manifest is not None:
            try:
                require_stopped_device(source_state,source_config,expected_record=source_record)
                guest.require(verify_saved_metadata(saved,source_state)==manifest,'source backup manifest changed during verification')
                report['source_disks_after']=verify_disk_set(manifest,source_state,'source after verification')
                report['backup_disks_after']=verify_disk_set(manifest,backup_directory,'backup after verification')
                report['source_sha256_after']=report['source_disks_after']['userdata.ext4']['sha256']
                report['backup_sha256_after']=report['backup_disks_after']['userdata.ext4']['sha256']
            except BaseException as error: errors.append(type(error).__name__+': '+str(error))
        if record:
            try:
                with backup.locked(destination):
                    current=backup.read_metadata(destination/'running.json')
                    report['restored_device_still_running']=guest.running(current)
                    guest.require(backup.exact_json(current,session_record(record)),
                                  'restored device record changed before final report')
            except BaseException as error:
                report.setdefault('restored_device_still_running','UNKNOWN')
                errors.append(type(error).__name__+': '+str(error))
        if errors: report.update(status='FAIL',finalization_errors=errors)
        report['finished_utc']=datetime.now(timezone.utc).isoformat()
        try:
            guest.save(output/'report.json',report)
        finally:
            source_lock.close()
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
