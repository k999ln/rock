#!/usr/bin/env python3
"""Read-only audit under every stopped sandbox lifetime lock; no service creation."""
import argparse
from contextlib import ExitStack, closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import sys


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--config',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--expected-games',type=int,choices=(0,2),required=True)
    args=parser.parse_args();base=args.source.resolve(strict=True)
    sys.path[:0]=[str(base/'os'),str(base/'src')]
    from game_exchange import sandbox as s, protocol as p, exchange_protocol as x
    from game_exchange.device_client import configuration
    from game_exchange.current_restore import snapshot
    config=s.load(args.config.resolve());state=Path(config['state'])
    _,_,keys=configuration(s.public_device_config())
    report={'schema':'rock-game-ui-ledger-audit/1','status':'RUNNING','source':str(base),
            'config_sha256':s.config_digest(config),'started_utc':datetime.now(timezone.utc).isoformat(),
            'observer_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'expected_games':args.expected_games,'expected_available_minor':10000-103*args.expected_games,
            'scope':'Stopped public synthetic authority after actual UI; no real funds or restored state claim'}
    output=args.output.resolve();output.mkdir(mode=0o700,parents=True,exist_ok=False)
    try:
        with s.locked(state/'control.lock'),s.locked(state/'sandbox.lock'),ExitStack() as stack:
            assert not s.status(config)['running']
            registry=s.read_json(state/'coordinator/registry.json')
            contract=Path(registry['contracts'][s.LEDGER]['descriptor']['canonical_state'])
            assert contract.is_relative_to(state/'contracts')
            for path in (state/'coordinator/coordinator.lock',state/'router/router.lock',contract/'authority.lock',
                         state/'game-index/game.lock',state/'game-a/game.lock',state/'game-b/game.lock'):
                stack.enter_context(s.locked(path))
            def database(path):
                for suffix in ('-wal','-journal'):
                    side=Path(str(path)+suffix);assert not side.exists() or side.stat().st_size==0
                db=stack.enter_context(closing(sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)))
                db.execute('PRAGMA query_only=ON');db.execute('BEGIN');db.row_factory=sqlite3.Row
                assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
                assert db.execute('PRAGMA foreign_key_check').fetchone() is None
                return db
            wallet=database(contract/'wallet-simulator.db');membership=database(contract/'entitlement.db')
            balances={r[0]:r[1] for r in wallet.execute('SELECT account,SUM(delta_minor) FROM wallet_postings GROUP BY account')}
            assert sum(balances.values())==0
            for name,value in {'AVAILABLE':10000-103*args.expected_games,'GAME_HOLD':0,
                               'GAME_PURCHASES':100*args.expected_games,'GAME_FEES':3*args.expected_games,
                               'PENDING_SETTLEMENT':0,'WITHDRAW_HOLD':0,'CASH_DISPENSED':0,'SERVICE_FEES':0}.items():
                assert balances.get(name,0)==value,(name,balances.get(name,0),value)
            assert wallet.execute('SELECT COUNT(*) FROM wallet_sales').fetchone()[0]==1
            assert wallet.execute("SELECT COUNT(*) FROM wallet_sales WHERE status='SETTLED'").fetchone()[0]==1
            assert wallet.execute('SELECT COUNT(*) FROM wallet_bills').fetchone()[0]==0
            assert wallet.execute('SELECT COUNT(*) FROM wallet_withdrawals').fetchone()[0]==0
            assert membership.execute('SELECT COUNT(*) FROM accounts').fetchone()[0]==1
            assert membership.execute('SELECT COUNT(*) FROM accounts WHERE auto_renew=1').fetchone()[0]==0
            assert membership.execute('SELECT COUNT(*) FROM device_monthly_due').fetchone()[0]==0
            exchanges=list(wallet.execute('SELECT * FROM wallet_game_exchanges ORDER BY exchange_id'))
            assert len(exchanges)==args.expected_games
            details=[];seen=set()
            for row in exchanges:
                quote=json.loads(wallet.execute('SELECT quote FROM wallet_game_quotes WHERE quote_id=?',(row['quote_id'],)).fetchone()[0])
                approval=json.loads(row['approval']);command=json.loads(row['command']);binding=quote['binding']
                game=binding['game_id'];assert game in ('public-game-a','public-game-b') and game not in seen;seen.add(game)
                keys.verify('quote',quote,config['authority_id']);keys.verify('approval',approval,config['authority_id'])
                assert command['binding']==binding and command['quote_sha256']==x.quote_digest(quote)
                assert command['approval_sha256']==x.approval_digest(approval)
                assert (row['state'],row['held_minor'],row['committed_minor'],row['released_minor'])==('COMPLETED',0,103,0)
                assert binding['principal_minor']==100 and binding['game_fee_minor']==3 and binding['external_cost_minor']==0 and binding['total_minor']==103 and binding['units']==10
                outbox=wallet.execute('SELECT * FROM wallet_game_outbox WHERE exchange_row=?',(row['id'],)).fetchone()
                assert outbox['state']=='TERMINAL' and 1<=outbox['attempts']<=5
                assert bytes(outbox['apply_bytes'])==p.canonical(command)
                assert outbox['apply_sha256']==hashlib.sha256(bytes(outbox['apply_bytes'])).hexdigest()
                terminal=json.loads(wallet.execute('SELECT receipt FROM wallet_game_exchange_receipts WHERE exchange_row=?',(row['id'],)).fetchone()[0])
                x.match_terminal(terminal,command,keys);assert terminal['terminal_state']=='APPLIED'
                game_file=state/('game-'+game[-1])/'game.sqlite3';db=database(game_file)
                decisions=list(db.execute('SELECT * FROM grant_decisions'));assert len(decisions)==1
                decision=decisions[0]
                assert bytes(decision['apply_bytes'])==bytes(outbox['apply_bytes']) and json.loads(decision['receipt'])==terminal
                journals=list(db.execute('SELECT * FROM asset_journals'));assert len(journals)==1
                journal=journals[0];assert journal['decision_id']==decision['id'] and journal['asset']==binding['destination_asset'] and journal['player_id']=='alice' and journal['units']==10
                postings=[tuple(r) for r in db.execute('SELECT account,delta_units FROM asset_postings')]
                assert sorted(postings)==[('ISSUANCE_CLEARING',-10),('PLAYER_PURCHASED',10)]
                details.append({'game':game,'exchange_id':row['exchange_id'],'state':row['state'],
                                'held_minor':0,'committed_minor':103,'released_minor':0,'units':10,
                                'quote_sha256':x.quote_digest(quote),'command_sha256':x.command_digest(command),
                                'terminal_sha256':hashlib.sha256(p.canonical(terminal)).hexdigest(),
                                'game_typed_snapshot':snapshot(db)})
            if args.expected_games==0:
                for name in ('a','b'):
                    db=database(state/('game-'+name)/'game.sqlite3')
                    assert db.execute('SELECT COUNT(*) FROM asset_journals').fetchone()[0]==0
                    assert db.execute('SELECT COUNT(*) FROM grant_decisions').fetchone()[0]==0
            report.update(status='PASS_SCOPED_STOPPED_LEDGER',balances=balances,exchanges=details,
                          monthly_consent=False,monthly_charges=0,synthetic_sale_count=1,
                          wallet_typed_snapshot=snapshot(wallet),membership_typed_snapshot=snapshot(membership))
    except Exception as error:
        report.update(status='FAIL',error=repr(error));raise
    finally:
        report['finished_utc']=datetime.now(timezone.utc).isoformat()
        (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({k:report.get(k) for k in ('status','error','balances','expected_games')}))


if __name__=='__main__':main()
