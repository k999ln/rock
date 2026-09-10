"""Real typed SQLite mutations cannot be hidden by first-cycle UI baselines."""
import ast
import copy
import importlib.util
from pathlib import Path
import sqlite3
import unittest
from game_exchange.current_restore import snapshot
ROOT=Path(__file__).resolve().parents[1]
def module(name):
    spec=importlib.util.spec_from_file_location(name.replace('-','_'),ROOT/'os/desktop'/name)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
f=module('observe-financial-game-os.py')

class UIObserverGuards(unittest.TestCase):
    def setUp(self):
        self.dbs={}
        for path in ('contracts/alice/wallet-simulator.db','contracts/alice/entitlement.db','game-a/game.sqlite3','game-b/game.sqlite3','game-index/game.sqlite3'):
            db=sqlite3.connect(':memory:');self.addCleanup(db.close);self.dbs[path]=db
            db.executescript('CREATE TABLE opaque(id INTEGER PRIMARY KEY,value BLOB); INSERT INTO opaque VALUES(1,X\'00ff\');')
        w=self.dbs['contracts/alice/wallet-simulator.db']
        w.executescript("CREATE TABLE wallet_postings(id INTEGER PRIMARY KEY AUTOINCREMENT,amount); INSERT INTO wallet_postings(amount) VALUES(103); CREATE TABLE wallet_game_exchange_receipts(id TEXT PRIMARY KEY,receipt BLOB); INSERT INTO wallet_game_exchange_receipts VALUES('original',X'00ff');")
        self.before=self.observe()
    def observe(self):return {'schema':'test','authority_id':'fixed','simulation_only':True,'identities':{'C':'unchanged'},'databases':{p:snapshot(db) for p,db in self.dbs.items()}}
    def rejected(self,sql,path='game-a/game.sqlite3'):
        self.dbs[path].executescript(sql)
        with self.assertRaises(ValueError):f.compare_authority_financial(self.before,self.observe())
    def test_actual_game_asset_row_loss_is_rejected(self):self.rejected('DELETE FROM opaque')
    def test_actual_game_b_type_change_is_rejected(self):self.rejected("UPDATE opaque SET value='text'",'game-b/game.sqlite3')
    def test_actual_index_row_change_is_rejected(self):self.rejected("UPDATE opaque SET value=X'ffee'",'game-index/game.sqlite3')
    def test_actual_wallet_game_receipt_change_is_rejected(self):self.rejected("UPDATE wallet_game_exchange_receipts SET receipt=X'ffee'",'contracts/alice/wallet-simulator.db')
    def test_actual_unknown_wallet_table_change_is_rejected(self):self.rejected('DELETE FROM opaque','contracts/alice/wallet-simulator.db')
    def test_actual_financial_append_keeps_old_typed_rows_but_rewrite_fails(self):
        db=self.dbs['contracts/alice/wallet-simulator.db'];before={'postings':f.retained_rows(db,'SELECT _rowid_,* FROM wallet_postings')}
        db.execute('INSERT INTO wallet_postings(amount) VALUES(888)');f.compare_authority_financial(self.before,self.observe());f.require_retained_rows(before,{'postings':f.retained_rows(db,'SELECT _rowid_,* FROM wallet_postings')})
        db.execute('UPDATE wallet_postings SET amount=103.0 WHERE id=1')
        with self.assertRaises(ValueError):f.require_retained_rows(before,{'postings':f.retained_rows(db,'SELECT _rowid_,* FROM wallet_postings')})
    def test_actual_schema_or_unknown_table_addition_is_rejected(self):self.rejected('CREATE TABLE surprise(value)','contracts/alice/wallet-simulator.db')
    def test_other_contract_is_not_allowed_financial_table_changes(self):
        before=self.observe();before['databases']['contracts/bob/wallet-simulator.db']=copy.deepcopy(before['databases']['contracts/alice/wallet-simulator.db']);after=copy.deepcopy(before)
        next(t for t in after['databases']['contracts/bob/wallet-simulator.db']['tables'] if t['name']=='wallet_postings')['rows_sha256']='f'*64
        with self.assertRaises(ValueError):f.compare_authority_financial(before,after)
    def test_guest_hub_sdk_and_unknown_auth_table_cannot_change(self):
        db=self.dbs['game-a/game.sqlite3'];raw=snapshot(db)
        state={role:{'schema_sha256':raw['schema_sha256'],'tables':{t['name']:{'rows':t['row_count'],'logical_sha256':t['rows_sha256']} for t in raw['tables']},'internal_sequences':{}} for role in ('hub','game_connection_a','authenticator','wallet_cache','power')}
        for role in state:
            changed=copy.deepcopy(state);changed[role]['tables']['opaque']['logical_sha256']='f'*64
            with self.assertRaises(ValueError):f.compare_guest_financial(state,changed)
    def test_guest_original_requests_and_counter_identity_are_preserved(self):
        before={'credential_counts':[('same',4)],'credential_identity':['same'],'authenticator/requests':['original'],'wallet_cache/requests':['original']}
        after=copy.deepcopy(before);after['credential_counts']=[('same',5)];after['authenticator/requests'].append('ATM');f.compare_guest_financial_rows(before,after)
        for key,value in (('credential_counts',[('same',6)]),('credential_identity',['other']),('wallet_cache/requests',[])):
            bad=copy.deepcopy(after);bad[key]=value
            with self.assertRaises(ValueError):f.compare_guest_financial_rows(before,bad)
    def test_actual_tls_monthly_and_atm_preserve_completed_games(self):
        import test_game_reference_sdk as support
        case=support.ReferenceSDK();self.addCleanup(case.doCleanups);case.setUp();fixture=case.f
        for name in ('a','b'):
            conn=case.connect(name);case.purchase(name,conn);case.workers[name].once()
        runtime=fixture.runtimes['alice']
        with runtime.admit_write(1):runtime._service.membership.tick()
        def state():
            result={'schema':'test','authority_id':'fixed','simulation_only':True,'identities':{'C':'unchanged'},'databases':{}}
            paths={'contracts/alice/wallet-simulator.db':runtime._service.wallet.path,
                   'contracts/alice/entitlement.db':runtime._service.membership.store.path,
                   'game-index/game.sqlite3':fixture.gateway.index.path/'game.sqlite3'}
            for name,authority in zip(('a','b'),fixture.authorities):paths['game-'+name+'/game.sqlite3']=authority.store.path/'game.sqlite3'
            for path,source in paths.items():
                db=sqlite3.connect(Path(source).as_uri()+'?mode=ro',uri=True)
                try:db.execute('BEGIN');result['databases'][path]=snapshot(db)
                finally:db.close()
            return result
        before=state()
        fixture.call(support.A1,'wallet.consent',accepted=True,terms_version='simulator-monthly-usd-8.88-v1')
        fixture.call(support.A1,'wallet.bill',period='2026-09')
        with runtime.admit_write(1):runtime._service.membership.tick()
        fixture.call(support.A1,'wallet.bill',period='2026-09')
        with runtime.admit_write(1):runtime._service.membership.tick()
        fixture.call(support.A1,'wallet.consent',accepted=False,terms_version='simulator-monthly-usd-8.88-v1')
        issued=support.support.gx.GameConnectionsTLS.issue(fixture,support.A1,1000);fixture.call(support.A1,'wallet.atm.cancel',withdrawal_id=issued['withdrawal_id'])
        f.compare_authority_financial(before,state())
        self.assertEqual(fixture.balances()['AVAILABLE'],3906);self.assertEqual(fixture.grants['a'].balance('alice'),10)

    def test_all_three_observers_verify_power_outside_cycle_condition(self):
        for name in ('observe-game-os.py','observe-financial-game-os.py','observe-pc-link-os.py'):
            tree=ast.parse((ROOT/'os/desktop'/name).read_text());parents={child:parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
            calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='verify_power'];self.assertEqual(len(calls),1,name)
            node=calls[0]
            while node in parents:
                node=parents[node]
                self.assertFalse(isinstance(node,ast.If) and any(isinstance(x,ast.Name) and x.id=='cycle' for x in ast.walk(node.test)),name)

if __name__=='__main__':unittest.main()
