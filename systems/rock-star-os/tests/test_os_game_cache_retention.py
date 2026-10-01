"""Typed real-SQLite checks for the narrowly declared Game read clocks."""
import copy
import importlib.util
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'os/desktop'))
import game_cache_retention as cache
spec = importlib.util.spec_from_file_location('game_clock_backup',
    Path(__file__).resolve().parents[1] / 'os/desktop/verify-backup.py')
backup = importlib.util.module_from_spec(spec); spec.loader.exec_module(backup)


class GameReadClocks(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:'); self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE identity(singleton INTEGER PRIMARY KEY,uuid TEXT,path TEXT,configuration TEXT,maximum_time INTEGER)')
        self.db.execute("INSERT INTO identity VALUES(1,'uuid','/private/client','{\"fixed\":true}',100)")
        self.db.execute('CREATE TABLE bindings(intent_id TEXT PRIMARY KEY,connection_id TEXT,intent TEXT,consent TEXT,generation INTEGER,as_of INTEGER,shared TEXT)')
        self.db.executemany('INSERT INTO bindings VALUES(?,?,?,?,?,?,?)',
            [('intent1','conn1','{"value":1}','signed consent',0,90,None),
             ('intent2','conn2','{"value":2}','another consent',1,95,'exact signed receipt')])
        for name in ('owner','requests','quotes','intents','player_proofs','migrations','future_table'):
            self.db.execute('CREATE TABLE '+name+'(payload BLOB)')
            self.db.execute('INSERT INTO '+name+' VALUES(?)',(b'\x00exact',))

    def observed(self, role='game_connection_a'):
        tables = {}
        for name, in self.db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
            rows = self.db.execute('SELECT rowid,* FROM '+name).fetchall()
            tables[name] = {'rows':len(rows), 'logical_sha256':cache.digest([[cache.cell(v) for v in row] for row in rows])}
        schema = self.db.execute('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').fetchall()
        return {'schema_sha256':cache.digest(schema),'tables':tables,'internal_sequences':{},
                'additional_tables':['future_table'],'game_read_sync':cache.observe(self.db,role)}

    def test_only_three_roles_and_declared_integer_clocks_advance(self):
        for role in cache.ROLES:
            with self.subTest(role=role):
                before=self.observed(role)
                self.db.execute('UPDATE identity SET maximum_time=maximum_time+1')
                if role != 'game_exchange_cache':self.db.execute('UPDATE bindings SET as_of=as_of+1')
                cache.compare(before,self.observed(role),role)

    def test_empty_unconnected_bindings_keep_identity_and_empty_tables(self):
        self.db.execute('DELETE FROM bindings'); self.db.execute('UPDATE identity SET maximum_time=0')
        for role in cache.ROLES:
            before=self.observed(role);cache.compare(before,self.observed(role),role)

    def test_each_clock_is_monotonic_not_only_final_maximum(self):
        before=self.observed()
        for sql in ('UPDATE identity SET maximum_time=99',"UPDATE bindings SET as_of=89 WHERE intent_id='intent1'"):
            with self.subTest(sql=sql):
                self.db.execute('SAVEPOINT trial');self.db.execute(sql)
                with self.assertRaisesRegex(ValueError,'backwards'):cache.compare(before,self.observed(),'game_connection_a')
                self.db.execute('ROLLBACK TO trial');self.db.execute('RELEASE trial')

    def test_each_binding_observation_cannot_exceed_identity_clock(self):
        self.db.execute("UPDATE bindings SET as_of=101 WHERE intent_id='intent1'")
        with self.assertRaisesRegex(ValueError,'ahead'):self.observed()

    def test_unknown_columns_in_either_projected_table_fail_closed(self):
        for table in ('identity','bindings'):
            with self.subTest(table=table):
                self.db.execute('SAVEPOINT trial');self.db.execute('ALTER TABLE '+table+' ADD COLUMN future INTEGER')
                with self.assertRaisesRegex(ValueError,'columns differ'):self.observed()
                self.db.execute('ROLLBACK TO trial');self.db.execute('RELEASE trial')

    def test_noninteger_negative_and_overflow_clocks_are_rejected(self):
        for table,column in (('identity','maximum_time'),('bindings','as_of')):
            for value in (-1,cache.MAX_INT+1,1.5,'clock',None):
                with self.subTest(table=table,value=value):
                    self.db.execute('SAVEPOINT trial');self.db.execute('UPDATE '+table+' SET '+column+'=?',(value,))
                    with self.assertRaisesRegex(ValueError,'SQLite INTEGER'):self.observed()
                    self.db.execute('ROLLBACK TO trial');self.db.execute('RELEASE trial')

    def test_every_other_identity_cell_is_exact(self):
        before=self.observed()
        for column,value in (('uuid','other'),('path','/copied'),('configuration','{ "fixed":true}')):
            with self.subTest(column=column):
                self.db.execute('SAVEPOINT trial');self.db.execute('UPDATE identity SET '+column+'=?',(value,))
                with self.assertRaisesRegex(ValueError,'outside'):cache.compare(before,self.observed(),'game_connection_a')
                self.db.execute('ROLLBACK TO trial');self.db.execute('RELEASE trial')

    def test_every_binding_receipt_generation_payload_and_rowid_is_exact(self):
        before=self.observed()
        for column,value in (('connection_id','other'),('intent','{ "value":1}'),('consent',None),('generation',2),('shared','changed'),('rowid',30)):
            with self.subTest(column=column):
                self.db.execute('SAVEPOINT trial');self.db.execute('UPDATE bindings SET '+column+"=? WHERE intent_id='intent1'",(value,))
                with self.assertRaisesRegex(ValueError,'outside'):cache.compare(before,self.observed(),'game_connection_a')
                self.db.execute('ROLLBACK TO trial');self.db.execute('RELEASE trial')

    def test_same_value_with_another_sqlite_cell_type_is_not_equal(self):
        before=self.observed();self.db.execute("UPDATE bindings SET consent=CAST(consent AS BLOB) WHERE intent_id='intent1'")
        with self.assertRaisesRegex(ValueError,'outside'):cache.compare(before,self.observed(),'game_connection_a')

    def test_extra_table_and_all_unprojected_journals_remain_exact(self):
        for table in ('owner','requests','quotes','intents','player_proofs','migrations','future_table'):
            before=self.observed()
            with self.subTest(table=table):
                self.db.execute('UPDATE '+table+' SET payload=?',(b'changed',))
                with self.assertRaisesRegex(ValueError,'outside'):cache.compare(before,self.observed(),'game_connection_a')

    def test_row_deletion_insertion_or_substitution_is_not_read_freshness(self):
        before=self.observed()
        for sql in ("DELETE FROM bindings WHERE intent_id='intent1'","UPDATE bindings SET intent_id='replacement' WHERE intent_id='intent1'",
                    "INSERT INTO bindings VALUES('new','new','new',NULL,0,90,NULL)"):
            with self.subTest(sql=sql):
                self.db.execute('SAVEPOINT trial');self.db.execute(sql)
                with self.assertRaises(ValueError):cache.compare(before,self.observed(),'game_connection_a')
                self.db.execute('ROLLBACK TO trial');self.db.execute('RELEASE trial')

    def test_missing_projection_field_unknown_field_schema_and_sequences_reject(self):
        before=self.observed();mutations=[]
        for key in ('game_read_sync','schema_sha256','internal_sequences'):
            value=copy.deepcopy(before);del value[key];mutations.append(value)
        value=copy.deepcopy(before);value['game_read_sync']['unexpected']=True;mutations.append(value)
        value=copy.deepcopy(before);value['game_read_sync']['identity']['maximum_time']=True;mutations.append(value)
        value=copy.deepcopy(before);del value['game_read_sync']['bindings'][0]['stable_sha256'];mutations.append(value)
        for value in mutations:
            with self.subTest(value=value),self.assertRaises(ValueError):cache.compare(before,value,'game_connection_a')

    def test_identity_singleton_and_count_are_required(self):
        for sql in ('DELETE FROM identity','UPDATE identity SET singleton=2'):
            with self.subTest(sql=sql):
                self.db.execute('SAVEPOINT trial');self.db.execute(sql)
                with self.assertRaises(ValueError):self.observed()
                self.db.execute('ROLLBACK TO trial');self.db.execute('RELEASE trial')

    def test_exception_requires_explicit_profile_and_only_known_role(self):
        power={'schema_sha256':'same','internal_sequences':{},'tables':{'requests':{}}}
        before={'game_connection_a':self.observed(),'power':power}
        self.db.execute('UPDATE identity SET maximum_time=101');self.db.execute('UPDATE bindings SET as_of=as_of+1')
        after={'game_connection_a':self.observed(),'power':power};profile={'sources':{name:None for name in before}}
        with self.assertRaisesRegex(ValueError,'restored business data changed'):backup.compare_business(before,after,profile)
        profile['game_read_sync']=cache.POLICY;backup.compare_business(before,after,profile)
        with self.assertRaisesRegex(ValueError,'unknown'):cache.observe(self.db,'game_future')


if __name__=='__main__':unittest.main()
