"""UI-only exception remains one typed anti-rollback clock, not a row/table waiver."""
from contextlib import contextmanager, closing
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'os/desktop'), str(ROOT/'os'), str(ROOT/'src')]
import game_authority_ui_retention as ui
from game_exchange import sandbox
from game_exchange.current_restore import snapshot as typed_snapshot, _cell


def observation(maximum=123):
    with closing(sqlite3.connect(':memory:')) as db:
        db.execute('CREATE TABLE identity(singleton INTEGER PRIMARY KEY,uuid TEXT NOT NULL,path TEXT NOT NULL,configuration TEXT NOT NULL,maximum_time INTEGER NOT NULL)')
        db.execute('INSERT INTO identity VALUES(1,?,?,?,?)', ('00000000-0000-4000-8000-000000000001','/var/tmp/公表/game-index','{"public":true}',maximum))
        table = typed_snapshot(db)
        row = db.execute('SELECT _rowid_, * FROM identity').fetchone()
    snapshot = {'schema': ui.observer.SCHEMA, 'authority_id': sandbox.AUTHORITY, 'simulation_only': True,
                'databases': {name: copy.deepcopy(table) for name in ui.observer.REQUIRED_DATABASES},
                'identities': {name: 'a'*64 for name in ui.observer.REQUIRED_IDENTITIES}}
    return {'schema': ui.SCHEMA, 'policy': ui.POLICY, 'config_sha256':'b'*64, 'snapshot': snapshot,
            'index_identity': {'columns': ui.COLUMNS[:], 'fixed_cells': [['intrinsic-rowid', str(row[0])], *[_cell(v) for v in row[1:-1]]],
                               'maximum_time': maximum}}


def clock(record, maximum):
    record['index_identity']['maximum_time'] = maximum
    ui.identity_table(record['snapshot'])['rows_sha256'] = ui.row_digest([*record['index_identity']['fixed_cells'], ['int', str(maximum)]])
    return record


class UIAuthorityRetention(unittest.TestCase):
    def test_only_integer_clock_advances_and_default_observer_still_refuses(self):
        before=observation(); after=clock(copy.deepcopy(before),124)
        self.assertEqual(ui.compare(before,after,policy=ui.POLICY)['status'],'PASS')
        with self.assertRaises(ValueError): ui.observer.unchanged(before['snapshot'],after['snapshot'])
        self.assertEqual(ui.compare(before,before,policy=ui.POLICY)['maximum_time_after'],123)

    def test_explicit_policy_required(self):
        with self.assertRaises(TypeError):ui.compare(observation(),observation())
        with self.assertRaises(ValueError):ui.compare(observation(),observation(),policy='D6')

    def test_clock_regression_refused(self):
        before=observation()
        with self.assertRaisesRegex(ValueError,'regressed'):ui.compare(before,clock(copy.deepcopy(before),122),policy=ui.POLICY)

    def test_clock_storage_type_and_bounds_refused(self):
        for value in (False,True,123.0,'123',-1,2**53,2**63,None):
            with self.subTest(value=value),self.assertRaises(ValueError):ui.validate(clock(observation(),value))

    def test_forged_projection_without_matching_full_snapshot_refused(self):
        item=observation();item['index_identity']['maximum_time']+=1
        with self.assertRaisesRegex(ValueError,'not bound'):ui.validate(item)

    def test_every_fixed_identity_cell_remains_exact(self):
        for index,value in ((2,'00000000-0000-4000-8000-000000000002'),(3,'/var/tmp/other/game-index'),(4,'{"public":false}')):
            before=observation();after=copy.deepcopy(before);after['index_identity']['fixed_cells'][index][1]=value;clock(after,124)
            with self.subTest(column=index),self.assertRaises(ValueError):ui.compare(before,after,policy=ui.POLICY)

    def test_rowid_singleton_extra_row_and_columns_refused(self):
        changes=[]
        value=observation();value['index_identity']['fixed_cells'][0][1]='2';changes.append(value)
        value=observation();value['index_identity']['fixed_cells'][1][1]='2';changes.append(value)
        value=observation();ui.identity_table(value['snapshot'])['row_count']=2;changes.append(value)
        value=observation();ui.identity_table(value['snapshot'])['intrinsic_rowid']=None;changes.append(value)
        value=observation();value['index_identity']['columns'].append('unknown');changes.append(value)
        for value in changes:
            with self.subTest(value=value),self.assertRaises(ValueError):ui.validate(value)

    def test_schema_pragmas_unknown_table_sequence_and_other_rows_never_excluded(self):
        before=observation();db=before['snapshot']['databases'][ui.INDEX]
        db['tables'].append({'name':'future_sequence','columns_sha256':'c'*64,'intrinsic_rowid':'_rowid_','row_count':1,'rows_sha256':'d'*64})
        changes=[]
        for path in before['snapshot']['databases']:
            after=clock(copy.deepcopy(before),124);after['snapshot']['databases'][path]['schema_sha256']='e'*64;changes.append(after)
            after=clock(copy.deepcopy(before),124);after['snapshot']['databases'][path]['pragmas']['user_version']=1;changes.append(after)
            if path!=ui.INDEX:
                after=clock(copy.deepcopy(before),124);after['snapshot']['databases'][path]['tables'][0]['rows_sha256']='f'*64;changes.append(after)
        after=clock(copy.deepcopy(before),124);after['snapshot']['databases'][ui.INDEX]['tables'][-1]['rows_sha256']='e'*64;changes.append(after)
        after=clock(copy.deepcopy(before),124);after['snapshot']['databases'][ui.INDEX]['tables'].pop();changes.append(after)
        for after in changes:
            with self.subTest(after=after),self.assertRaises(ValueError):ui.compare(before,after,policy=ui.POLICY)

    def test_retained_json_config_and_authority_bindings_refused(self):
        before=observation();changes=[]
        for key in before['snapshot']['identities']:
            after=copy.deepcopy(before);after['snapshot']['identities'][key]='c'*64;changes.append(after)
        after=copy.deepcopy(before);after['config_sha256']='c'*64;changes.append(after)
        after=copy.deepcopy(before);after['snapshot']['authority_id']='00000000-0000-4000-8000-000000000002';changes.append(after)
        for after in changes:
            with self.subTest(after=after),self.assertRaises(ValueError):ui.compare(before,after,policy=ui.POLICY)

    def test_capture_uses_existing_fence_and_read_only_sqlite_without_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            state=Path(directory).resolve();(state/'game-index').mkdir();path=state/ui.INDEX
            with closing(sqlite3.connect(path)) as db:
                db.execute('CREATE TABLE identity(singleton INTEGER PRIMARY KEY,uuid TEXT NOT NULL,path TEXT NOT NULL,configuration TEXT NOT NULL,maximum_time INTEGER NOT NULL)')
                db.execute('INSERT INTO identity VALUES(1,?,?,?,123)',('00000000-0000-4000-8000-000000000001',str(state/'game-index'),'{}'))
                db.commit()
            original=path.read_bytes(); active=[]
            @contextmanager
            def fence(config):
                active.append(True)
                try:yield state,state/'contracts/alice'
                finally:active.pop()
            def observe(*_):
                self.assertEqual(active,[True]);value=observation()['snapshot']
                with closing(sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)) as db:value['databases'][ui.INDEX]=typed_snapshot(db)
                return value
            with patch.object(sandbox,'stopped_snapshot',fence),patch.object(sandbox,'observe_stopped',observe),patch.object(sandbox,'config_digest',return_value='b'*64):
                result=ui.capture({},policy=ui.POLICY)
            self.assertEqual(result['index_identity']['maximum_time'],123)
            self.assertEqual(original,path.read_bytes());self.assertFalse(active)
            self.assertEqual({p.name for p in path.parent.iterdir()},{'game.sqlite3'})


if __name__=='__main__':unittest.main()
