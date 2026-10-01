#!/usr/bin/env python3
"""Internal fresh-Linux SDK onboarding benchmark; never a human-author study."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os')]
from game_exchange import sandbox
from game_exchange import protocol as p


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--sandbox-config',type=Path,required=True);parser.add_argument('--work',type=Path,required=True)
    args=parser.parse_args();started=time.monotonic();out=args.work
    p.require(out.is_absolute() and out.resolve()==out and not out.exists(),'fresh canonical evidence work directory required')
    out.mkdir(mode=0o700);config=sandbox.load(args.sandbox_config);events=[];report={'schema':'rock-game-sdk-onboarding/1','status':'INCOMPLETE','simulation_only':True}
    def run(label,command,code=0):
        p.require(time.monotonic()-started<120,'onboarding total deadline elapsed')
        begin=time.monotonic();result=subprocess.run([sys.executable,*map(str,command)],capture_output=True,text=True,timeout=12)
        record={'label':label,'exit_code':result.returncode,'elapsed_seconds':time.monotonic()-begin,'stdout':result.stdout,'stderr':result.stderr}
        events.append(record);(out/(str(len(events)).zfill(2)+'-'+label+'.json')).write_text(json.dumps(record,sort_keys=True,indent=2)+'\n')
        p.require(result.returncode==code,'unexpected sample outcome: '+label)
        return json.loads(result.stdout)
    lifecycle=[ROOT/'os/game_exchange/sandbox.py'];owner=[ROOT/'examples/game/owner.py','--config',ROOT/'examples/game/owner-public.json','--state',out/'player']
    def control(action):return run('authority-'+action,lifecycle+[action,'--config',args.sandbox_config])
    def call(action,*fields,code=0):return run('owner-'+action,owner+[action,*fields],code)
    def complete(game,exchange):
        until=time.monotonic()+8
        while True:
            state=call('status','--game',game,'--exchange-id',exchange)['result']
            if state['state']=='COMPLETED':return state
            p.require(time.monotonic()<until,'bounded first exchange completion deadline');time.sleep(.1)
    try:
        p.require(not sandbox.status(config)['running'],'fresh onboarding requires stopped owned authority')
        before=sandbox.snapshot(config)
        empty={'wallet_postings','wallet_journals','wallet_sales','wallet_bills','wallet_consents','wallet_withdrawals',
            'wallet_auth_credentials','wallet_auth_challenges','wallet_auth_terms','accounts','authorizations','device_monthly_due','device_api_receipts'}
        for db in before['databases'].values():
            for table in db['tables']:
                if table['name'] in empty:p.require(table['row_count']==0,'fresh onboarding requires empty authority table '+table['name'])
        report['initial_snapshot_sha256']=hashlib.sha256(p.canonical(before)).hexdigest();control('start')
        call('diagnose');call('wallet','--accept-public-simulation')
        connections={}
        for game in ('a','b'):connections[game]=call('connect','--game',game,'--accept-public-simulation')['result']['binding']['connection_id']
        author=[ROOT/'examples/game/author.py','--config',ROOT/'examples/game/author-public.json','--state',out/'author-a']
        run('author-quote',author+['quote','--game','a','--connection-id',connections['a'],'--exchange-id','first','--key','first'])
        call('quote','--game','a','--exchange-id','first');call('approve','--game','a','--exchange-id','first','--accept-public-simulation')
        first=complete('a','first');report['first_exchange_seconds']=time.monotonic()-started
        run('author-status',author+['status','--game','a','--connection-id',connections['a'],'--exchange-id','first'])
        control('stop');call('quote','--game','b','--exchange-id','retained-after-offline',code=1)
        start=time.monotonic();diagnosis=call('diagnose')['result'];report['cause_identification_seconds']=time.monotonic()-start
        p.require(diagnosis['contact']=='OWNER_TLS_UNAVAILABLE' and any(r['key']=='retained-after-offline' and r['last_contact']=='UNKNOWN' for r in diagnosis['pending']),'offline cause and exact original pending request required')
        start=time.monotonic();control('start')
        call('retry','--game','b','--operation','game.exchange.quote','--key','retained-after-offline')
        call('approve','--game','b','--exchange-id','retained-after-offline','--accept-public-simulation')
        recovered=complete('b','retained-after-offline');report['recovery_seconds']=time.monotonic()-start
        history=call('history')['result'];p.require(len(history['items'])==2,'exact two completed exchanges required')
        for item in history['items']:p.require(item['state']=='COMPLETED' and item['held_minor']==0 and item['committed_minor']==103,'exact terminal balance required')
        call('diagnose');control('stop');after=sandbox.snapshot(config)
        report.update(status='PASS_INTERNAL_SYNTHETIC',setting_inputs=['fixed public config','private client state'],setting_count=2,
            first_terminal=first['terminal_receipt'],recovered_terminal=recovered['terminal_receipt'],
            final_snapshot_sha256=hashlib.sha256(p.canonical(after)).hexdigest(),total_seconds=time.monotonic()-started,
            scope='Fresh internal Linux integration, explicit public software authenticator/PIN0000 and fixture funds. No external author or human timing claim.',
            source_files={str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in (ROOT/'examples/game/owner.py',ROOT/'examples/game/author.py',ROOT/'examples/game/owner-public.json',ROOT/'examples/game/author-public.json')},
            example_code_lines={name:sum(bool(line.strip()) and not line.lstrip().startswith('#') for line in (ROOT/'examples/game'/name).read_text().splitlines()) for name in ('owner.py','author.py')})
    finally:
        try:
            if sandbox.status(config)['running']:control('stop')
        finally:
            (out/'report.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
    print(json.dumps(report,sort_keys=True))

if __name__=='__main__':main()
