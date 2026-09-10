#!/usr/bin/env python3
"""Real schema-7 OS monthly/ATM UI with read-only actual C ledger stage observations."""
import argparse
from contextlib import closing
from datetime import datetime,timezone
import hashlib,importlib.util,json,math,sqlite3,sys,time,traceback
from pathlib import Path


# Only the predeclared monthly/ATM tables may change in the first cycle.
# Every table (including unknown tables), schema, pragma and authority identity
# outside these exact sets remains identical to the stopped pre-input baseline.
FINANCIAL_TABLES = {
    'wallet-simulator.db': frozenset(('wallet_journals','wallet_postings','wallet_consents','wallet_bills',
        'wallet_idempotency','wallet_withdrawals','atm_credentials','atm_wallet_binding','wallet_auth_mode','wallet_auth_credential_state',
        'wallet_auth_quotes','wallet_auth_approvals','sqlite_sequence')),
    'entitlement.db': frozenset(('accounts','consents','authorizations','authorization_claims','receipts',
        'streams','events','device_api_receipts','device_monthly_due')),
}
GUEST_FINANCIAL_TABLES = {'wallet_cache':frozenset(('requests','snapshot')),
    'authenticator':frozenset(('credentials','requests')), 'power':frozenset(('requests',))}


def require(value,message):
    if not value:raise ValueError(message)


def compare_authority_financial(before,after):
    require(set(before)==set(after),'authority snapshot shape changed')
    require({k:v for k,v in before.items() if k!='databases'}=={k:v for k,v in after.items() if k!='databases'},'authority identities changed')
    require(set(before['databases'])==set(after['databases']),'authority database inventory changed')
    for path,old in before['databases'].items():
        new=after['databases'][path];allowed=FINANCIAL_TABLES.get(path.rsplit('/',1)[-1],frozenset())
        # A restored/second owner's similarly named Wallet is never admitted.
        if path not in ('contracts/alice/wallet-simulator.db','contracts/alice/entitlement.db'):allowed=frozenset()
        require({k:v for k,v in old.items() if k!='tables'}=={k:v for k,v in new.items() if k!='tables'},'authority schema/pragmas changed: '+path)
        first={r['name']:r for r in old['tables']};last={r['name']:r for r in new['tables']}
        require(set(first)==set(last),'authority table inventory changed: '+path)
        for name,row in first.items():
            other=last[name]
            if name in allowed:
                require({k:v for k,v in row.items() if k not in ('row_count','rows_sha256')}=={k:v for k,v in other.items() if k not in ('row_count','rows_sha256')},'financial table columns/rowid changed')
            else:require(row==other,'unrelated authoritative table changed: '+path+'/'+name)


def compare_guest_financial(before,after):
    require(set(before)==set(after),'guest database role inventory changed')
    for role,old in before.items():
        new=after[role];allowed=GUEST_FINANCIAL_TABLES.get(role,frozenset())
        require(set(old)==set(new),'guest observation shape changed')
        # Wallet cache receipt-time/payload may change because this cycle writes
        # finance; its complete identity and original requests are fenced below.
        skip={'tables'} | ({'read_sync'} if role=='wallet_cache' else set())
        require({k:v for k,v in old.items() if k not in skip}=={k:v for k,v in new.items() if k not in skip},'unrelated guest schema/sequence/state changed: '+role)
        require(set(old['tables'])==set(new['tables']),'guest table inventory changed')
        for table,value in old['tables'].items():
            if table not in allowed:require(value==new['tables'][table],'unrelated guest table changed: '+role+'/'+table)


def retained_rows(db,sql):
    from game_exchange.current_restore import _cell
    return sorted(json.dumps([_cell(v) for v in row],sort_keys=True,separators=(',',':')) for row in db.execute(sql))


def require_retained_rows(before,after):
    require(set(before)==set(after),'retained row coverage changed')
    for key,rows in before.items():
        # Intrinsic rowid is part of each record, so duplicate/replaced rows do
        # not masquerade as retention. New explicitly financial rows may append.
        require(set(rows)<=set(after[key]) and len(after[key])==len(set(after[key])), 'original financial/shared row changed: '+key)


def authority_financial_rows(config):
    from game_exchange import sandbox
    with sandbox.stopped_snapshot(config) as (state,contract):
        full=sandbox.observe_stopped(state,contract);rows={}
        for filename,tables in (('wallet-simulator.db',('wallet_journals','wallet_postings','wallet_consents','wallet_idempotency')),
                                ('entitlement.db',('consents','authorization_claims','receipts','device_api_receipts'))):
            with closing(sqlite3.connect((contract/filename).as_uri()+'?mode=ro&immutable=1',uri=True)) as db:
                db.execute('PRAGMA query_only=ON')
                for table in tables:rows[filename+'/'+table]=retained_rows(db,'SELECT _rowid_,* FROM '+table)
                if filename=='wallet-simulator.db':
                    rows['unchanged-wallet-sequences']=retained_rows(db,"SELECT _rowid_,* FROM sqlite_sequence WHERE name NOT IN ('wallet_postings','wallet_consents')")
                    rows['auth-mode-fixed']=retained_rows(db,'SELECT _rowid_,singleton,schema_version,authority_id,account_id FROM wallet_auth_mode')
                    rows['auth-clock']=[r[0] for r in db.execute('SELECT maximum_time FROM wallet_auth_mode')]
                    rows['auth-credential-fixed']=[];rows['auth-counts']=[]
                    for rowid,key,record,revoked in db.execute('SELECT _rowid_,credential_id,record_json,revoked_at FROM wallet_auth_credential_state ORDER BY credential_id'):
                        value=json.loads(record);count=value.pop('sign_count');require(type(count) is int,'typed credential counter required')
                        rows['auth-credential-fixed'].append(json.dumps([rowid,key,value,revoked],sort_keys=True,separators=(',',':')))
                        rows['auth-counts'].append((key,count))
                else:
                    rows['account-fixed']=retained_rows(db,'SELECT _rowid_,account_id,device_ref,owner_ref FROM accounts')
        require(full==sandbox.observe_stopped(state,contract),'read-only finance guard changed authority')
        return full,rows



def compare_authority_financial_rows(before,after):
    old=dict(before);new=dict(after);counts=old.pop('auth-counts');later=new.pop('auth-counts');clock=old.pop('auth-clock');next_clock=new.pop('auth-clock')
    require(len(clock)==len(next_clock)==1 and all(type(v) is float and math.isfinite(v) and v>0 for v in (*clock,*next_clock)) and next_clock[0]>=clock[0], 'authority authentication clock regressed or changed type')
    require(len(counts)==len(later)==1 and counts[0][0]==later[0][0] and later[0][1]==counts[0][1]+1, 'one authoritative ATM credential counter increment required')
    for key in ('auth-mode-fixed','auth-credential-fixed','account-fixed','unchanged-wallet-sequences'):
        require(old[key]==new[key],'nonfinancial identity/sequence/credential changed: '+key)
    require_retained_rows(old,new)


def guest_financial_rows(b,data,folder,profile):
    rows={}
    for role in ('wallet_cache','authenticator'):
        target=folder/(role+'-finance-guard.sqlite3');b.power.export_closed_database(data,profile['sources'][role][0],target);target.chmod(0o600)
        with closing(sqlite3.connect(target.as_uri()+'?mode=ro&immutable=1',uri=True)) as db:
            db.execute('PRAGMA query_only=ON')
            rows[role+'/requests']=retained_rows(db,'SELECT _rowid_,* FROM requests')
            if role=='authenticator':
                # One explicit ATM approval advances the same credential once.
                rows['credential_identity']=retained_rows(db,'SELECT _rowid_,credential_id,user_handle FROM credentials')
                rows['credential_counts']=[tuple(r) for r in db.execute('SELECT credential_id,sign_count FROM credentials ORDER BY credential_id')]
    return rows


def compare_guest_financial_rows(before,after):
    old=dict(before);new=dict(after);counts=old.pop('credential_counts');later=new.pop('credential_counts')
    require(old['credential_identity']==new['credential_identity'],'authenticator credential identity changed')
    require_retained_rows(old,new)
    require(len(counts)==len(later)==1 and counts[0][0]==later[0][0] and
            type(counts[0][1]) is int and type(later[0][1]) is int and later[0][1]==counts[0][1]+1,
            'exactly one existing authenticator counter increment required')


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    for name in ('source','config','sandbox-config','output'):ap.add_argument('--'+name,type=Path,required=True)
    ap.add_argument('--commit',required=True);args=ap.parse_args();base=args.source.resolve(strict=True)
    sys.path[:0]=[str(base/'os/desktop'),str(base/'os'),str(base/'src')]
    spec=importlib.util.spec_from_file_location('financial_business',base/'os/desktop/verify-business.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
    import game_authority_observer as authority
    from game_exchange import sandbox as sandbox
    from game_exchange.current_restore import snapshot as typed_snapshot
    config=json.loads(args.config.read_text());assert config['schema']=='rock-desktop-device/7'
    out=args.output.resolve();out.mkdir(mode=0o700,parents=True,exist_ok=False)
    limits=b.contract.plan('lifecycle')['limits'];profile=b.retention.retention_profile(config)
    observer=authority.Observer(base/'os/game_exchange/sandbox.py',args.sandbox_config.resolve(),config['game']['authority_id'],out)
    assert args.sandbox_config.resolve() == Path(config['game']['config']), 'observed authority differs from device binding'
    assert observer.input_hashes['sandbox_config_sha256'] == config['game']['sha256'], 'observed authority bytes differ from device binding'
    cfg=sandbox.load(args.sandbox_config.resolve());state=Path(cfg['state']);registry=sandbox.read_json(state/'coordinator/registry.json')
    contract=Path(registry['contracts'][sandbox.LEDGER]['descriptor']['canonical_state']);assert contract.is_relative_to(state/'contracts')
    before=observer.invoke('snapshot');b.guest.save(out/'authority-before.json',before)
    guarded_before,authority_rows_before=authority_financial_rows(cfg);authority.unchanged(before,guarded_before)
    initial_record=json.loads((b.guest.BASE/config['name']/'running.json').read_text())
    initial_folder=out/'baseline';initial_folder.mkdir(mode=0o700)
    with b.closed_device(config,initial_record) as data:
        initial_state,initial_rows,initial_power=b.retention.business_snapshot(data,profile)
        initial_guest_rows=guest_financial_rows(b,data,initial_folder,profile)
    b.guest.save(initial_folder/'guest-state.json',initial_state);b.guest.save(initial_folder/'power-rows.json',initial_power)
    b.guest.save(initial_folder/'authority-retained-rows.json',authority_rows_before);b.guest.save(initial_folder/'guest-retained-rows.json',initial_guest_rows)
    plan={'schema':'rock-game-profile-financial-ui/1','commit':args.commit,'config':config,'observer_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'financial_mutable_tables':{k:sorted(v) for k,v in FINANCIAL_TABLES.items()},
          'guest_financial_mutable_tables':{k:sorted(v) for k,v in GUEST_FINANCIAL_TABLES.items()},
          'retained_rows':'all original Wallet journals/postings/consents/idempotency, membership consent/claims/receipts/device receipts, guest requests and credential identity; one ATM counter increment',
          'shutdown_policy':'every cycle: exactly one new dispatched receipt and guest SHUTDOWN event',
          'limits':limits,'cycles':2,'flow_seconds':360,'scope':'Owned QEMU synthetic C authority; no real funds, ATM actor or physical device',
          'operations':['separate monthly consent','wait real 888 charge','same-period retry','cancel future consent','signed ATM 1000/fee0 quote before hold',
                        'separate public PIN approval','actual 1000 hold with hidden code','unconsumed cancel releases 1000','normal stop','read-only restart and normal stop'],
          'initial_available_minor':9794,'final_available_minor':8906,'expected_monthly_count':1,'expected_monthly_amount_minor':888,'expected_atm_count':1}
    b.guest.save(out/'plan.json',plan);(out/'plan.json').chmod(0o444)
    summary={'status':'RUNNING','started_utc':datetime.now(timezone.utc).isoformat(),'cycles':[],'ledger_stages':[]}

    def ledger(label,*,available,bills,hold,withdrawals,quote_state=None):
        # Separate short read-only transactions; each financial assertion uses
        # one internally consistent C Wallet snapshot. These do not mutate C.
        with closing(sqlite3.connect((contract/'wallet-simulator.db').as_uri()+'?mode=ro',uri=True,timeout=2)) as db:
            db.execute('PRAGMA query_only=ON');db.execute('BEGIN');db.row_factory=sqlite3.Row
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok' and db.execute('PRAGMA foreign_key_check').fetchone() is None
            balances={r[0]:r[1] for r in db.execute('SELECT account,SUM(delta_minor) FROM wallet_postings GROUP BY account')}
            assert sum(balances.values())==0
            for name,value in {'AVAILABLE':available,'SERVICE_FEES':888*bills,'WITHDRAW_HOLD':hold,'CASH_DISPENSED':0,'GAME_HOLD':0,'GAME_PURCHASES':200,'GAME_FEES':6,'PENDING_SETTLEMENT':0}.items():
                assert balances.get(name,0)==value,(label,name,balances.get(name,0),value)
            br=[dict(r) for r in db.execute('SELECT * FROM wallet_bills ORDER BY id')];wr=[dict(r) for r in db.execute('SELECT * FROM wallet_withdrawals ORDER BY id')]
            assert len(br)==bills and all(r['amount_minor']==888 for r in br) and len(wr)==withdrawals
            assert db.execute('SELECT COUNT(*) FROM atm_credentials').fetchone()[0]==withdrawals
            assert db.execute('SELECT COUNT(*) FROM atm_wallet_binding').fetchone()[0]==withdrawals
            if withdrawals:
                account=db.execute('SELECT account_id FROM wallet_auth_mode').fetchone()[0]
                assert tuple(db.execute('SELECT owner_id,device_id FROM atm_wallet_binding').fetchone())==(account,cfg['device_ref'])
                credential=db.execute('SELECT withdrawal_id,owner_id,device_id,atm_id FROM atm_credentials').fetchone()
                assert tuple(credential)==(wr[0]['id'],account,cfg['device_ref'],'SIM-ATM-001')
            assert db.execute('SELECT COUNT(*) FROM wallet_sales').fetchone()[0]==1
            assert db.execute("SELECT COUNT(*) FROM wallet_game_exchanges WHERE state='COMPLETED'").fetchone()[0]==2
            quotes=[dict(r) for r in db.execute('SELECT * FROM wallet_auth_quotes')]
            if quote_state:
                assert len(quotes)==1 and quotes[0]['state']==quote_state
                q=json.loads(quotes[0]['quote_json']);assert q['amount_minor']==1000 and q['fee_minor']==0 and q['total_debit_minor']==1000
            result={'label':label,'observed_unix':time.time(),'balances':balances,'bills':br,'withdrawals':wr,'quote_count':len(quotes),
                    'quote_state':quotes[0]['state'] if quotes else None,'wallet_typed_snapshot':typed_snapshot(db)}
        with closing(sqlite3.connect((contract/'entitlement.db').as_uri()+'?mode=ro',uri=True,timeout=2)) as db:
            db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
            result['auto_renew']=db.execute('SELECT auto_renew FROM accounts').fetchone()[0]
        summary['ledger_stages'].append(result);b.guest.save(out/'ledger-stages.json',summary['ledger_stages']);return result

    previous_state=previous_authority=None;previous_power=initial_power
    try:
        initial=ledger('initial-completed-games',available=9794,bills=0,hold=0,withdrawals=0);assert initial['auto_renew']==0
        for cycle in (1,2):
            folder=out/str(cycle);folder.mkdir(mode=0o700)
            report={'status':'RUNNING','input_events':[],'screenshots':[],'qmp_events':[],'qmp_commands':[],'ui_states':[]}
            record=monitor=sampler=None;started=time.monotonic()
            try:
                observer.invoke('start');record=b.guest.start(config);b.guest.save(folder/'owned-record.json',record)
                assert record.get('reused') is False,'fresh QEMU boot required'
                sampler=b.ResourceSampler(record,limits);sampler.start();monitor=b.power.Monitor(record['qmp_socket'],report)
                driver=b.ScreenDriver(monitor,folder,report,record,sampler,limits)
                driver.wait('ツール名・説明・IDで検索',seconds=limits['boot_seconds'],label='boot');driver.booting=False
                driver.operation_deadline=time.monotonic()+360
                driver.nav('wallet')
                if cycle==1:
                    driver.wait('月額テストへの同意はまだありません',seek=True,label='separate-consent-still-required')
                    driver.click('$8.88 / 月のテストに同意する',seek=True,label='explicit-monthly-consent')
                    driver.wait('月額テストの同意を取り消す',seek=True,label='monthly-consent-recorded')
                    driver.click('今月のテスト請求を確認・再試行',seek=True,label='first-month-explicit-request')
                    driver.wait('請求要求を受け付けました',label='first-request-acknowledged-not-paid')
                    driver.wait('テスト請求が完了しました',seek=True,label='actual-monthly-paid')
                    paid=ledger('first-monthly-paid',available=8906,bills=1,hold=0,withdrawals=0);assert paid['auto_renew']==1
                    driver.click('今月のテスト請求を確認・再試行',seek=True,label='same-period-explicit-retry')
                    driver.wait('請求要求を受け付けました',label='retry-acknowledged')
                    driver.wait('テスト請求が完了しました',seek=True,label='same-period-still-paid')
                    retry=ledger('same-period-no-second-charge',available=8906,bills=1,hold=0,withdrawals=0);assert retry['bills']==paid['bills']
                    driver.click('月額テストの同意を取り消す',seek=True,label='cancel-future-consent')
                    driver.top();driver.wait('自動更新は停止済み',seek=True,label='future-renewal-stopped')
                    cancelled=ledger('future-consent-cancelled',available=8906,bills=1,hold=0,withdrawals=0);assert cancelled['auto_renew']==0 and cancelled['bills']==paid['bills']
                    driver.top();driver.native.click(531,26)
                    driver.wait('現金を動かさないATMテスト',label='actual-atm-entry')
                    driver.click('予約内容を確認',seek=True,label='quote-without-hold')
                    driver.wait('ATMの予約内容を確認',label='signed-atm-quote-review')
                    ledger('quote-before-owner-approval',available=8906,bills=1,hold=0,withdrawals=0,quote_state='OPEN')
                    b.public_pin(driver,'認証して予約する')
                    driver.wait('予約済み',label='actual-atm-hold-code-hidden')
                    driver.wait('コードは隠しています',label='code-hidden')
                    ledger('owner-approved-one-hold',available=7906,bills=1,hold=1000,withdrawals=1,quote_state='CONSUMED')
                    driver.click('予約を取消・保留を照合',seek=True,label='cancel-unconsumed-atm')
                    driver.wait('取消済み',label='atm-cancelled')
                    returned=ledger('cancel-restores-only-unused-hold',available=8906,bills=1,hold=0,withdrawals=1,quote_state='CONSUMED')
                    assert returned['withdrawals'][0]['released_minor']==1000 and returned['withdrawals'][0]['dispensed_minor']==0
                else:
                    driver.wait('自動更新は停止済み',seek=True,label='retained-monthly-stop')
                    driver.wait('テスト請求が完了しました',seek=True,label='retained-one-monthly-bill')
                    driver.top();driver.native.click(531,26);driver.wait('取消済み',seek=True,label='retained-atm-cancel')
                    ledger('read-only-restart-no-charge-or-hold',available=8906,bills=1,hold=0,withdrawals=1,quote_state='CONSUMED')
                driver.nav('history');driver.click('引用整理',exact_line=True,within=b.HISTORY_TITLE,regions=(b.HISTORY_TITLE,),label='hub-result-still-available')
                driver.wait('紹介文です',label='unchanged-real-product-result');driver.operation_deadline=None
                report['normal_shutdown_seconds']=b.clean_shutdown(driver,record);sampler.stop();observer.invoke('stop')
                current_authority=observer.invoke('snapshot');b.guest.save(folder/'authority-after.json',current_authority)
                if cycle==1:
                    guarded_after,authority_rows_after=authority_financial_rows(cfg);authority.unchanged(current_authority,guarded_after)
                    compare_authority_financial(before,current_authority);compare_authority_financial_rows(authority_rows_before,authority_rows_after)
                    b.guest.save(folder/'authority-retained-rows.json',authority_rows_after)
                with b.closed_device(config,record) as data:
                    current_state,rows,powers=b.retention.business_snapshot(data,profile);b.guest.save(folder/'guest-state.json',current_state)
                    report['power_boot_id']=b.verify_power(previous_power,powers,report['qmp_events'])
                    if cycle==1:
                        compare_guest_financial(initial_state,current_state)
                        current_guest_rows=guest_financial_rows(b,data,folder,profile)
                        compare_guest_financial_rows(initial_guest_rows,current_guest_rows)
                        b.guest.save(folder/'guest-retained-rows.json',current_guest_rows)
                    if cycle==2:
                        b.retention.compare_business(previous_state,current_state,profile);authority.unchanged(previous_authority,current_authority)
                    previous_state,previous_authority,previous_power=current_state,current_authority,powers
                report['status']='PASS_SCOPED_FINANCIAL_UI'
            except Exception as error:report.update(status='FAIL',error=repr(error),traceback=traceback.format_exc());raise
            finally:
                report['elapsed_seconds']=time.monotonic()-started;report['owned_device_running']=bool(record and b.guest.running(record));b.guest.save(folder/'report.json',report)
                if sampler:sampler.stop()
                if monitor:monitor.close()
                summary['cycles'].append({k:report.get(k) for k in ('status','error','elapsed_seconds','owned_device_running')})
        summary['status']='PASS_SCOPED_FINANCIAL_UI'
    except Exception as error:summary.update(status='FAIL',error=repr(error))
    finally:
        summary['finished_utc']=datetime.now(timezone.utc).isoformat();b.guest.save(out/'summary.json',summary)
        print(json.dumps({k:summary[k] for k in ('status','started_utc','cycles','finished_utc')},ensure_ascii=False))
    return 0 if summary['status'].startswith('PASS') else 1

if __name__=='__main__':raise SystemExit(main())
