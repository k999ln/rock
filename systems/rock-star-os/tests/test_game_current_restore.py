"""Actual nonempty A/B/C/TLS basis carried through explicit current-copy handover."""
from contextlib import closing, contextmanager
from pathlib import Path
import hashlib
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os'),str(ROOT/'tests')]
import game_legacy_basis as basis
from game_exchange.connections import GameGateway
from game_exchange import current_restore as restore
from wallet_backend.authority_fence import AuthorityFenceCoordinator
from wallet_backend.contract_runtime import ContractRuntime, RuntimeUnavailable
from wallet_backend.owner_router import OwnerRouter
from wallet_backend.server import ManagedWalletBackendServer
from wallet_backend.client import BackendUnavailable
from wallet_backend.contract_runtime import platform_service


class CurrentGameRestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='gx00-current-game-');self.addCleanup(self.temp.cleanup)
        self.f=basis.LegacyGameBasis(Path(self.temp.name).resolve());self.addCleanup(self.f.close)
        self.f.create_legacy();self.f.adopt();self.f.start_managed();self.f.activate_new_devices()
        if self._testMethodName=='test_initial_author_revocation_and_reserved_only_intent_survive_restore':
            self.reserved_request=self.f.begin_request(basis.A2,'b','reserved-current-copy')
            original=self.f.gateway.index.reserve
            def lost(*args,**kwargs):
                original(*args,**kwargs);raise OSError('fixture actual reservation committed before Wallet intent')
            with patch.object(self.f.gateway.index,'reserve',side_effect=lost):
                with self.assertRaises(BackendUnavailable):self.f.owner_transport(basis.A2).exchange(self.reserved_request)
            with self.f.gateway.index.transaction() as db:self.reserved=dict(db.execute('SELECT * FROM connections').fetchone())
            self.f.gateway.revoke_author('a',1)
            self.f.connections={};self.f.connection_requests={}
        else:self.f.connect_four()
        self.before=self.f.business_evidence();self.connections=dict(self.f.connections)
        self.old=self.f.runtimes['alice'].descriptor
        self.old_bob=self.f.runtimes['bob']
        self.f.stop_listener()
        self.index_before_bytes=(self.f.root/'game-index/game.sqlite3').read_bytes()
        self.source_hashes={name:hashlib.sha256((self.old.canonical_state/name).read_bytes()).hexdigest() for name in restore.DB_NAMES}
        self.f.router=OwnerRouter(self.f.root/'owner-router',self.f.credentials,clock=lambda:self.f.now)
        self.f.runtimes={}
        self.f.gateway=GameGateway(self.f.root/'game-index',tuple(self.f.authorities),clock=lambda:self.f.now)
        self.restore_id=str(uuid.uuid4());self.destination=self.f.root/'current-copy'
        self.f.coordinator.stage_restore(self.old.ledger_ref,self.destination,restore_id=self.restore_id)
        self.new=self.f.coordinator.promote_restore(self.restore_id)

    def options(self):
        return dict(coordinator=self.f.coordinator,provisioning_file=ROOT/'os/entitlement/fixtures/device-handoff.json',
                    verifier=self.f.router,clock=lambda:self.f.now)

    def management(self):
        runtime=ContractRuntime.open_current_game_restore(self.restore_id,index=self.f.gateway.index,**self.options())
        self.f.runtimes['alice']=runtime;return runtime

    def reopen_normal(self):
        self.f.runtimes['alice']=ContractRuntime.open_active(self.old.ledger_ref,**self.options())
        self.f.runtimes['bob']=ContractRuntime.open_active('current-bob',coordinator=self.f.coordinator,
            provisioning_file=self.f.root/'bob-handoff.json',verifier=self.f.router,clock=lambda:self.f.now)
        self.f.serve(ManagedWalletBackendServer(('127.0.0.1',0),router=self.f.router,runtimes=tuple(self.f.runtimes.values()),
            game_gateway=self.f.gateway,start_scheduler=False,timeout=3))
        for device,owner in basis.DEVICE_OWNER.items():
            self.f.transports[device]=self.f.make_transport(device,self.f.runtimes[owner].descriptor.wallet_authority_id)

    def assert_source(self):
        self.assertEqual({name:hashlib.sha256((self.old.canonical_state/name).read_bytes()).hexdigest() for name in restore.DB_NAMES},self.source_hashes)

    def restart_management(self):
        for runtime in self.f.runtimes.values():runtime.close()
        self.f.runtimes={};self.f.gateway.close();self.f.router.close();self.f.coordinator.close()
        self.f.coordinator=AuthorityFenceCoordinator(self.f.root/'coordinator')
        self.f.router=OwnerRouter(self.f.root/'owner-router',self.f.credentials,clock=lambda:self.f.now)
        self.f.gateway=GameGateway(self.f.root/'game-index',tuple(self.f.authorities),clock=lambda:self.f.now)

    def fault_case(self,stage):
        fired=[];reader=None
        def state():
            with self.f.gateway.index.transaction() as db:
                if not restore.exists(db,restore.TRANSITION):return None
                row=db.execute('SELECT state FROM '+restore.TRANSITION+' WHERE restore_id=?',(self.restore_id,)).fetchone()
                return row[0] if row else None
        if stage=='PREPARED':
            original=self.f.gateway.index.transaction
            @contextmanager
            def fault():
                with original() as db:yield db
                with original() as db:
                    ready=restore.exists(db,restore.TRANSITION) and db.execute('SELECT state FROM '+restore.TRANSITION+' WHERE restore_id=?',(self.restore_id,)).fetchone()[0]=='PREPARED'
                if ready and not fired:fired.append(stage);raise OSError('fixture committed PREPARED then lost completion')
            with patch.object(self.f.gateway.index,'transaction',side_effect=fault):
                with self.assertRaises(OSError):restore.prepare_current_game_restore(self.f.gateway.index,self.f.coordinator,self.restore_id)
        else:
            restore.prepare_current_game_restore(self.f.gateway.index,self.f.coordinator,self.restore_id)
            runtime=self.management()
            if stage=='WALLET':
                # A live reader keeps the committed epoch in nonempty WAL even
                # across runtime/coordinator close and explicit management reopen.
                reader=sqlite3.connect(self.destination/'wallet-simulator.db',isolation_level=None)
                reader.execute('BEGIN');reader.execute('SELECT * FROM wallet_game_mode').fetchall()
                original=runtime._service.wallet._transaction
                @contextmanager
                def fault():
                    with original() as db:yield db
                    with closing(sqlite3.connect(self.destination/'wallet-simulator.db')) as db:
                        ready=restore.exists(db,restore.EPOCH) and db.execute('SELECT 1 FROM '+restore.EPOCH+' WHERE restore_id=?',(self.restore_id,)).fetchone()
                    if ready and not fired:fired.append(stage);raise OSError('fixture Wallet epoch committed then lost completion')
                target=patch.object(runtime._service.wallet,'_transaction',side_effect=fault)
            else:
                original=self.f.gateway.index.transaction
                @contextmanager
                def fault():
                    with original() as db:yield db
                    with original() as db:ready=db.execute('SELECT state FROM '+restore.TRANSITION+' WHERE restore_id=?',(self.restore_id,)).fetchone()[0]=='DONE'
                    if ready and not fired:fired.append(stage);raise OSError('fixture index DONE committed then reply lost')
                target=patch.object(self.f.gateway.index,'transaction',side_effect=fault)
            try:
                with target:
                    with self.assertRaises(OSError):restore.resume_current_game_restore(runtime,self.f.gateway.index,self.f.coordinator,self.restore_id)
            except BaseException:
                if reader is not None:reader.close()
                raise
        try:
            self.assertEqual(fired,[stage]);self.restart_management()
            if stage!='DONE':
                with patch('wallet_backend.contract_runtime.platform_service.WalletService') as construct:
                    with self.assertRaisesRegex(RuntimeError,'pending'):
                        ContractRuntime.open_active(self.old.ledger_ref,**self.options())
                construct.assert_not_called()
            if reader is not None:self.assertGreater((self.destination/'wallet-simulator.db-wal').stat().st_size,0)
            with self.assertRaises(RuntimeError):
                ContractRuntime.open_current_game_restore(str(uuid.uuid4()),index=self.f.gateway.index,**self.options())
            runtime=self.management();receipt=restore.resume_current_game_restore(runtime,self.f.gateway.index,self.f.coordinator,self.restore_id)
            self.assertEqual(receipt['status'],'DONE')
            self.assertEqual(restore.resume_current_game_restore(runtime,self.f.gateway.index,self.f.coordinator,self.restore_id),receipt)
            runtime.close();self.f.runtimes={}
            if reader is not None:reader.close();reader=None
            self.reopen_normal();self.assertEqual(self.f.business_evidence(),self.before)
            for pair,request in self.f.connection_requests.items():
                self.assertEqual(self.f.owner_transport(pair[0]).exchange(request)['result'],self.connections[pair])
            with closing(sqlite3.connect(self.destination/'wallet-simulator.db')) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM '+restore.EPOCH).fetchone()[0],1)
            self.assert_source()
        finally:
            if reader is not None:reader.close()

    def test_restart_after_exact_index_prepared_commit(self):self.fault_case('PREPARED')
    def test_restart_after_wallet_epoch_commit_with_nonempty_wal(self):self.fault_case('WALLET')
    def test_restart_after_index_done_commit_and_lost_reply(self):self.fault_case('DONE')

    def test_no_wallet_only_listener_or_scheduler_can_publish_management_lifetime(self):
        restore.prepare_current_game_restore(self.f.gateway.index,self.f.coordinator,self.restore_id)
        runtime=self.management()
        with patch('wallet_backend.server._TLSWalletListener.__init__') as listen:
            with self.assertRaises(RuntimeUnavailable):
                ManagedWalletBackendServer(('127.0.0.1',0),router=self.f.router,
                    runtimes=(runtime,self.old_bob),start_scheduler=False,game_gateway=None)
        listen.assert_not_called();self.assertFalse(self.f.coordinator.permits);self.assert_source()

    def test_revocation_after_prepared_is_preserved_and_refuses_epoch_mutation(self):
        restore.prepare_current_game_restore(self.f.gateway.index,self.f.coordinator,self.restore_id)
        self.f.gateway.revoke_author('a',1)
        with self.f.gateway.index.transaction() as db:before=restore.snapshot(db)
        with patch('wallet_backend.contract_runtime.platform_service.WalletService') as construct:
            with self.assertRaisesRegex(RuntimeError,'index rows'):
                self.management()
        construct.assert_not_called();self.assertFalse(self.f.coordinator.permits)
        with self.f.gateway.index.transaction() as db:self.assertEqual(restore.snapshot(db),before)
        with closing(sqlite3.connect(self.destination/'wallet-simulator.db')) as db:self.assertFalse(restore.exists(db,restore.EPOCH))
        self.assert_source()

    def complete(self):
        restore.prepare_current_game_restore(self.f.gateway.index,self.f.coordinator,self.restore_id)
        runtime=self.management();receipt=restore.resume_current_game_restore(runtime,self.f.gateway.index,self.f.coordinator,self.restore_id)
        runtime.close();self.f.runtimes={};return receipt

    def test_initial_author_revocation_and_reserved_only_intent_survive_restore(self):
        self.assertEqual(self.reserved['state'],'RESERVED');self.assertIsNone(self.reserved['head'])
        with self.f.gateway.index.transaction() as db:authors=[tuple(row) for row in db.execute('SELECT * FROM authors ORDER BY game_id')]
        with closing(sqlite3.connect(self.destination/'wallet-simulator.db')) as db:self.assertEqual(db.execute('SELECT count(*) FROM wallet_game_intents').fetchone()[0],0)
        self.complete();self.reopen_normal()
        with self.f.gateway.index.transaction() as db:
            self.assertEqual(dict(db.execute('SELECT * FROM connections').fetchone()),self.reserved)
            self.assertEqual([tuple(row) for row in db.execute('SELECT * FROM authors ORDER BY game_id')],authors)
        self.assertFalse(self.f.author('a',{'v':1,'op':'connection.status','connection_id':self.reserved['connection_id']})['ok'])
        reply=self.f.owner_transport(basis.A2).exchange(self.reserved_request)
        self.assertTrue(reply['ok']);self.assertEqual(reply['result'],restore.loaded(self.reserved['intent']))
        self.assertEqual(self.f.owner_transport(basis.A2).exchange(self.reserved_request),reply)
        with self.f.gateway.index.transaction() as db:self.assertEqual(db.execute('SELECT count(*) FROM connections').fetchone()[0],1)
        self.assertEqual(self.f.business_evidence(),self.before);self.assert_source()

    def test_second_current_copy_extends_chain_without_rewriting_old_plan_or_receipt(self):
        first=self.complete();first_id=self.restore_id
        with closing(sqlite3.connect(self.destination/'wallet-simulator.db')) as db:first_wallet=[tuple(row) for row in db.execute('SELECT * FROM '+restore.EPOCH)]
        with self.f.gateway.index.transaction() as db:first_index=dict(db.execute('SELECT * FROM '+restore.TRANSITION).fetchone())
        original_source=self.old;original_hashes=dict(self.source_hashes)
        self.old=self.new;self.destination=self.f.root/'second-current-copy';self.restore_id=str(uuid.uuid4())
        self.source_hashes={name:hashlib.sha256((self.old.canonical_state/name).read_bytes()).hexdigest() for name in restore.DB_NAMES}
        self.f.coordinator.stage_restore(self.old.ledger_ref,self.destination,restore_id=self.restore_id)
        self.new=self.f.coordinator.promote_restore(self.restore_id);second=self.complete()
        self.assertEqual(second['writer_epoch'],3);self.assertNotEqual(first,second)
        with closing(sqlite3.connect(self.destination/'wallet-simulator.db')) as db:
            rows=[tuple(row) for row in db.execute('SELECT * FROM '+restore.EPOCH+' ORDER BY writer_epoch')]
            self.assertEqual(rows[:1],first_wallet);self.assertEqual(len(rows),2)
        with self.f.gateway.index.transaction() as db:self.assertEqual(dict(db.execute('SELECT * FROM '+restore.TRANSITION+' WHERE restore_id=?',(first_id,)).fetchone()),first_index)
        self.reopen_normal();self.assertEqual(self.f.business_evidence(),self.before)
        for pair,request in self.f.connection_requests.items():self.assertEqual(self.f.owner_transport(pair[0]).exchange(request)['result'],self.connections[pair])
        self.assert_source()
        self.assertEqual({name:hashlib.sha256((original_source.canonical_state/name).read_bytes()).hexdigest() for name in restore.DB_NAMES},original_hashes)

    def old_copy_case(self,side):
        self.complete()
        if side=='index':
            self.f.gateway.close();(self.f.root/'game-index/game.sqlite3').write_bytes(self.index_before_bytes)
            self.f.gateway=GameGateway(self.f.root/'game-index',tuple(self.f.authorities),clock=lambda:self.f.now)
        else:(self.destination/'wallet-simulator.db').write_bytes((self.old.canonical_state/'wallet-simulator.db').read_bytes())
        with patch('wallet_backend.contract_runtime.platform_service.WalletService') as construct:
            with self.assertRaises(RuntimeError):ContractRuntime.open_active(self.old.ledger_ref,**self.options())
        construct.assert_not_called();self.assertFalse(self.f.coordinator.permits);self.assert_source()

    def test_old_index_current_wallet_is_refused_before_constructor(self):self.old_copy_case('index')
    def test_old_wallet_current_index_is_refused_before_constructor(self):self.old_copy_case('wallet')

    def test_fully_game_bound_runtime_cannot_start_a_wallet_only_listener(self):
        self.complete()
        self.f.runtimes['alice']=ContractRuntime.open_active(self.old.ledger_ref,**self.options())
        self.f.runtimes['bob']=ContractRuntime.open_active('current-bob',coordinator=self.f.coordinator,
            provisioning_file=self.f.root/'bob-handoff.json',verifier=self.f.router,clock=lambda:self.f.now)
        self.f.gateway.bind_runtimes(tuple(self.f.runtimes.values()))
        with patch('wallet_backend.server._TLSWalletListener.__init__') as listen:
            with self.assertRaisesRegex(RuntimeUnavailable,'exact current gateway'):
                ManagedWalletBackendServer(('127.0.0.1',0),router=self.f.router,runtimes=tuple(self.f.runtimes.values()),
                    start_scheduler=False,game_gateway=None)
        listen.assert_not_called();self.assertFalse(self.f.coordinator.permits);self.assert_source()

    def malformed_intermediate(self,kind):
        plan=restore.prepare_current_game_restore(self.f.gateway.index,self.f.coordinator,self.restore_id)
        other=dict(plan,restore_id=str(uuid.uuid4()))
        if kind=='index-row':
            with self.f.gateway.index.transaction() as db:
                db.execute('INSERT INTO '+restore.TRANSITION+' VALUES (?,?,?,?,?)',
                    (other['restore_id'],other['new_descriptor']['ledger_ref'],restore.encoded(other),'PREPARED',None))
        elif kind=='rowid':
            with closing(sqlite3.connect(self.destination/'entitlement.db')) as db:
                db.execute('UPDATE extra_business_evidence SET rowid=rowid+100');db.commit()
        elif kind=='index-epoch':
            with self.f.gateway.index.transaction() as db:db.execute('UPDATE contracts SET descriptor=? WHERE ledger_ref=?',
                (restore.encoded(plan['new_descriptor']),self.old.ledger_ref))
        else:
            with closing(sqlite3.connect(self.destination/'wallet-simulator.db')) as db:
                for statement in restore.WALLET_SQL:db.execute(statement)
                db.execute('INSERT INTO '+restore.EPOCH+' VALUES (?,?,?)',(2,other['restore_id'],restore.encoded(other)));db.commit()
        with patch('wallet_backend.contract_runtime.platform_service.WalletService') as construct:
            with self.assertRaises(RuntimeError):self.management()
        construct.assert_not_called();self.assertFalse(self.f.coordinator.permits);self.assert_source()

    def test_unplanned_index_row_is_not_removed_from_original_snapshot(self):self.malformed_intermediate('index-row')
    def test_unplanned_wallet_epoch_row_is_not_removed_from_original_snapshot(self):self.malformed_intermediate('wallet-row')
    def test_index_advanced_without_done_is_not_a_valid_intermediate(self):self.malformed_intermediate('index-epoch')
    def test_original_implicit_rowid_change_is_not_hidden_by_same_column_values(self):self.malformed_intermediate('rowid')

    def test_fully_shadowed_rowid_is_refused_before_prepared_commit(self):
        with self.f.gateway.index.transaction() as db:
            db.execute('CREATE TABLE opaque_rowids (_rowid_ TEXT, rowid TEXT, oid TEXT)')
            db.execute("INSERT INTO opaque_rowids VALUES ('a','b','c')")
        with self.assertRaisesRegex(RuntimeError,'rowid'):
            restore.prepare_current_game_restore(self.f.gateway.index,self.f.coordinator,self.restore_id)
        with self.f.gateway.index.transaction() as db:
            self.assertFalse(restore.exists(db,restore.TRANSITION))
            self.assertEqual(tuple(db.execute('SELECT * FROM opaque_rowids').fetchone()),('a','b','c'))
        self.assert_source()

    def test_without_rowid_unknown_table_retains_all_alias_named_values(self):
        with self.f.gateway.index.transaction() as db:
            db.execute('CREATE TABLE keyed_evidence (_rowid_ TEXT PRIMARY KEY, rowid BLOB, oid INTEGER) WITHOUT ROWID')
            db.execute('INSERT INTO keyed_evidence VALUES (?,?,?)',('opaque',b'\x00\xff',77))
        self.complete()
        with self.f.gateway.index.transaction() as db:
            self.assertEqual(tuple(db.execute('SELECT * FROM keyed_evidence').fetchone()),('opaque',b'\x00\xff',77))
        self.assert_source()

    def test_done_management_open_rechecks_unknown_blob_before_constructor(self):
        self.complete()
        with closing(sqlite3.connect(self.destination/'entitlement.db')) as db:
            db.execute("UPDATE extra_business_evidence SET value=X'010203'");db.commit()
        with patch('wallet_backend.contract_runtime.platform_service.WalletService',wraps=platform_service.WalletService) as construct:
            with self.assertRaisesRegex(RuntimeError,'contract rows'):
                self.management()
        construct.assert_not_called();self.assertFalse(self.f.coordinator.permits);self.assert_source()

    def test_done_management_resume_rechecks_index_and_preserves_revocation(self):
        self.complete();runtime=self.management()
        self.f.gateway.revoke_author('a',1)
        with self.f.gateway.index.transaction() as db:before=restore.snapshot(db)
        with self.assertRaisesRegex(RuntimeError,'index rows'):
            restore.resume_current_game_restore(runtime,self.f.gateway.index,self.f.coordinator,self.restore_id)
        with self.f.gateway.index.transaction() as db:self.assertEqual(restore.snapshot(db),before)
        self.assert_source()

    def test_done_management_replay_after_legitimate_activity_is_not_a_history_api(self):
        self.complete();self.reopen_normal();self.f.reconcile_existing_month()
        self.f.assert_retained(self,claimed=False);self.f.stop_listener();self.f.runtimes={}
        self.f.router=OwnerRouter(self.f.root/'owner-router',self.f.credentials,clock=lambda:self.f.now)
        self.f.gateway=GameGateway(self.f.root/'game-index',tuple(self.f.authorities),clock=lambda:self.f.now)
        with patch('wallet_backend.contract_runtime.platform_service.WalletService',wraps=platform_service.WalletService) as construct:
            with self.assertRaisesRegex(RuntimeError,'rows/schema'):
                self.management()
        construct.assert_not_called();self.assertFalse(self.f.coordinator.permits);self.assert_source()

    def test_explicit_handover_preserves_nonempty_legacy_and_same_tls_receipts(self):
        with patch('wallet_backend.contract_runtime.platform_service.WalletService') as construct:
            with self.assertRaisesRegex(RuntimeError,'pending'):
                ContractRuntime.open_active(self.old.ledger_ref,**self.options())
        construct.assert_not_called();self.assertFalse(self.f.coordinator.permits)
        plan=restore.prepare_current_game_restore(self.f.gateway.index,self.f.coordinator,self.restore_id)
        self.assertEqual(restore.prepare_current_game_restore(self.f.gateway.index,self.f.coordinator,self.restore_id),plan)
        runtime=self.management()
        with self.assertRaises(RuntimeUnavailable):runtime.start_scheduler()
        with self.assertRaises(RuntimeUnavailable):
            with runtime.admit_write(self.new.writer_epoch):self.fail('normal admission bypassed pending handover')
        receipt=restore.resume_current_game_restore(runtime,self.f.gateway.index,self.f.coordinator,self.restore_id)
        self.assertEqual(restore.resume_current_game_restore(runtime,self.f.gateway.index,self.f.coordinator,self.restore_id),receipt)
        runtime.close();self.f.runtimes={}
        self.reopen_normal()
        self.assertEqual(self.f.business_evidence(),self.before)
        for pair,request in self.f.connection_requests.items():
            self.assertEqual(self.f.owner_transport(pair[0]).exchange(request)['result'],self.connections[pair])
            connection=self.connections[pair]['binding']['connection_id']
            self.assertTrue(self.f.author(pair[1],{'v':1,'op':'connection.status','connection_id':connection})['ok'])
        self.f.assert_retained(self,claimed=True)
        self.f.reconcile_existing_month();self.f.assert_retained(self,claimed=False)
        self.assertEqual(self.f.runtimes['alice'].descriptor,self.new);self.assert_source()


if __name__=='__main__':unittest.main()
