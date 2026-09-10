"""Independent stopped financial summary; no service requests or mutations."""
import argparse,hashlib,json,sqlite3,sys
from contextlib import closing
from pathlib import Path
native=Path('/opt/rockstaros-preview/native');sys.path[:0]=[str(native/'os'),str(native/'src')]
from game_exchange import sandbox
p=argparse.ArgumentParser();p.add_argument('--games',nargs='+',choices=('a','b'),required=True);p.add_argument('--epoch',type=int,choices=(1,2),required=True);p.add_argument('--boots',action='store_true');a=p.parse_args()
assert len(a.games)==len(set(a.games));number=len(a.games);config=sandbox.load(Path('/var/tmp/rockstaros-preview-authority/sandbox.json'))
def query(path):
 for suffix in ('-wal','-journal'):
  side=Path(str(path)+suffix);assert not side.exists() or side.stat().st_size==0
 db=sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True,isolation_level=None)
 db.execute('PRAGMA query_only=ON');assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';assert db.execute('PRAGMA foreign_key_check').fetchone() is None
 return closing(db)
with sandbox.stopped_snapshot(config) as (state,contract):
 before=sandbox.observe_stopped(state,contract)
 with query(contract/'wallet-simulator.db') as db:
  balances=dict(db.execute('SELECT account,SUM(delta_minor) FROM wallet_postings GROUP BY account'))
  expected={'AVAILABLE':10000-103*number,'GAME_FEES':3*number,'GAME_HOLD':0,'GAME_PURCHASES':100*number,'PENDING_SETTLEMENT':0,'SALE_CLEARING':-10000,'WITHDRAW_HOLD':0,'CASH_DISPENSED':0,'SERVICE_FEES':0}
  assert all(balances.get(k,0)==v for k,v in expected.items()) and sum(balances.values())==0
  assert db.execute('SELECT COUNT(*) FROM wallet_bills').fetchone()[0]==0
  assert db.execute('SELECT COUNT(*) FROM wallet_withdrawals').fetchone()[0]==0
  assert db.execute('SELECT COUNT(*) FROM wallet_sales').fetchone()[0]==1
  assert db.execute("SELECT COUNT(*) FROM wallet_sales WHERE status='SETTLED'").fetchone()[0]==1
  exchange_states=list(db.execute('SELECT state,held_minor,committed_minor,released_minor FROM wallet_game_exchanges'))
  assert exchange_states==[('COMPLETED',0,103,0)]*number
 with query(contract/'entitlement.db') as db:
  assert db.execute('SELECT COUNT(*) FROM accounts').fetchone()[0]==1
  assert db.execute('SELECT COUNT(*) FROM accounts WHERE auto_renew=1').fetchone()[0]==0
  assert db.execute('SELECT COUNT(*) FROM device_monthly_due').fetchone()[0]==0
 games={}
 for name in ('a','b'):
  with query(state/('game-'+name)/'game.sqlite3') as db:
   units=dict(db.execute('SELECT account,SUM(delta_units) FROM asset_postings GROUP BY account'))
   count=db.execute('SELECT COUNT(*) FROM grant_decisions').fetchone()[0]
   epochs=[row[0] for row in db.execute('SELECT current_epoch FROM grant_issuers')]
   receipts=db.execute('SELECT COUNT(*) FROM grant_epoch_receipts').fetchone()[0]
   assert units==({'ISSUANCE_CLEARING':-10,'PLAYER_PURCHASED':10} if name in a.games else {})
   assert count==int(name in a.games) and epochs==[a.epoch] and receipts==a.epoch-1
   games['game-'+name]={'account_units':units,'grants':count,'epoch':epochs[0],'epoch_receipts':receipts}
 after=sandbox.observe_stopped(state,contract);assert before==after
 report={'schema':'rock-final-stopped-financial-readback/1','status':'PASS','simulation_only':True,'wallet':{'accounts_minor':balances,'bill_count':0,'withdrawal_count':0,'monthly_consent':False,'exchange_states':exchange_states},'games':games,'authority_snapshot_sha256':hashlib.sha256(sandbox.p.canonical(before)).hexdigest(),'authority_database_count':len(before['databases']),'authority_table_count':sum(len(d['tables']) for d in before['databases'].values()),'complete_authority_unchanged_by_readback':True}
if a.boots:
 logs={}
 for name in ('preview','recovered'):
  for file in (Path('/var/tmp/rock-star-desktop')/name/'sessions').glob('*/boot.log'):
   raw=file.read_bytes();logs[str(file)]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'native_ui_health_ready':b'UI_HEALTH_READY' in raw,'ab_health_confirmed':b'AB_HEALTH_CONFIRMED' in raw,'power_down':b'Power down' in raw}
 assert len(logs)==3 and all(all(r[k] for k in ('native_ui_health_ready','ab_health_confirmed','power_down')) for r in logs.values())
 report['boot_logs']=logs
print(json.dumps(report,sort_keys=True,indent=2))
