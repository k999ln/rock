"""Stopped GX01 migration preserves every legacy row and unknown BLOB table."""
from contextlib import closing
import sqlite3
import tempfile
import unittest
import uuid
from pathlib import Path
from game_legacy_basis import LegacyGameBasis,A1,A2
from game_exchange import exchange_ledger as ledger
from game_exchange.current_restore import snapshot

class ExchangeMigration(unittest.TestCase):
    def test_existing_claimed_monthly_atm_hold_pending_revoked_auth_and_opaque_rows_survive(self):
        with tempfile.TemporaryDirectory(prefix='gx01-legacy-migration-') as temp:
            basis=LegacyGameBasis(Path(temp).resolve())
            try:
                basis.create_legacy();basis.adopt();runtime=basis.runtimes['alice']
                before={}
                for name in ('wallet-simulator.db','entitlement.db'):
                    with closing(sqlite3.connect(basis.state/name)) as db:
                        before[name]=snapshot(db)
                        if name=='wallet-simulator.db':schema={row[0]:row[1] for row in db.execute('SELECT name,sql FROM sqlite_master')}
                migration_id=str(uuid.uuid4());receipt=ledger.migrate(runtime,migration_id=migration_id)
                self.assertEqual(receipt['version'],1)
                for name in before:
                    with closing(sqlite3.connect(basis.state/name)) as db:
                        after=snapshot(db);new={t['name']:t for t in after['tables']}
                        for table in before[name]['tables']:self.assertEqual(new[table['name']],table)
                        self.assertEqual(after['pragmas'],before[name]['pragmas'])
                        if name=='entitlement.db':self.assertEqual(after,before[name])
                        else:
                            current={row[0]:row[1] for row in db.execute('SELECT name,sql FROM sqlite_master')}
                            for key,value in schema.items():
                                if key!='wallet_postings':self.assertEqual(current[key],value)
                with self.assertRaises(ValueError):ledger.migrate(runtime,migration_id=str(uuid.uuid4()))
                basis.start_managed();basis.activate_new_devices();basis.connect_four();basis.assert_retained(self,claimed=True)
                # The already revoked owner cannot turn a retained old approval into spending.
                self.assertFalse(basis.owner_transport(A1).exchange(basis.legacy_issue_request)['ok'])
                basis.reconcile_existing_month();basis.assert_retained(self,claimed=False)
                with closing(runtime._service.wallet._connect()) as db:self.assertTrue(ledger.installed(db))
            finally:basis.close()

if __name__=='__main__':unittest.main()
