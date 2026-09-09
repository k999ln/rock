"""False-PASS, bounds and cleanup guards; these tests do not boot a guest."""
import copy
from contextlib import closing
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os'), str(ROOT / 'os/update')]
import verify_purchaser_contract as contract
import verify_purchaser as verifier


class PurchaserRecoveryVerifierTests(unittest.TestCase):
    def proof(self, phase):
        slot, sequence, reason = contract.PHASES[phase]
        value = {'status': 'PASS', 'phase': phase,
            'boot': {'slot': slot, 'sequence': sequence, 'reason': reason, 'sha256': 'a' * 64},
            'children': [{'uid': 1000, 'gid': 1000, 'groups': [], 'peer_uid': 1002}],
            'service_access': {'mode': 'purchaser-fixture', 'state': 'unavailable' if phase in contract.BAD else 'configured'},
            'history_matches_initial': True}
        lines = [f'ROCK_AB_SELECTED slot={slot} sequence={sequence} reason={reason}',
                 'ROCK_AB_SWITCH_ROOT device=' + ('/dev/vda' if slot == 'A' else '/dev/vdc')]
        if phase in contract.BAD:
            value.update(health_denial={'ok': False, 'code': 'rejected', 'error': contract.ERROR},
                         wallet_daemon_healthy=True, closed_configuration_absent=True,
                         update_state={'committed': 'B', 'pending': 'A', 'floor': 2, 'attempts_left': 4-phase})
            lines += [contract.ERROR, 'ROCK_AB_HEALTH_FAILED_REBOOT']
        else:
            value['update_state'] = {'committed': slot, 'pending': None, 'floor': sequence, 'attempts_left': 0}
            lines += ['ROCK_AB_HEALTH_CONFIRMED', 'EXT4-fs (vdb): unmounting filesystem', 'reboot: Power down']
        return '\n'.join(lines), value

    def test_all_five_expected_selection_and_distinct_shutdown_contracts(self):
        for phase in contract.PHASES:
            with self.subTest(phase=phase):
                log, proof = self.proof(phase)
                contract.validate_boot(log, phase, proof, 'a' * 64)

    def test_exact_phase_rejects_unknown_duplicate_and_prefix_match(self):
        for phase in contract.PHASES:
            self.assertEqual(contract.phase_from_cmdline(f'console=x rock.purchaser.update={phase} ro'), phase)
        for text in ('', 'rock.purchaser.update=0', 'rock.purchaser.update=10',
                     'rock.purchaser.update=1 rock.purchaser.update=1', 'rock.purchaser.update=true'):
            with self.subTest(text=text), self.assertRaises(AssertionError):
                contract.phase_from_cmdline(text)

    def test_bad_candidate_cannot_pass_after_mark_good_or_wallet_outage(self):
        for field in ('health_confirmed', 'wallet_failed', 'wrong_denial', 'unknown_transport', 'committed_bad'):
            log, proof = self.proof(3)
            if field == 'health_confirmed': log += '\nROCK_AB_HEALTH_CONFIRMED'
            elif field == 'wallet_failed': proof['wallet_daemon_healthy'] = False
            elif field == 'wrong_denial': proof['health_denial']['error'] = 'socket unavailable'
            elif field == 'unknown_transport': proof['health_denial']['code'] = 'unavailable'
            elif field == 'committed_bad': proof['update_state']['committed'] = 'A'
            with self.subTest(field=field), self.assertRaises(AssertionError):
                contract.validate_boot(log, 3, proof, 'a' * 64)

    def test_selector_wrong_payload_owner_or_trial_count_cannot_pass(self):
        for field in ('payload', 'owner', 'trial', 'open_mode', 'wrong_phase'):
            log, proof = self.proof(4)
            if field == 'payload': proof['boot']['sha256'] = 'b' * 64
            elif field == 'owner': proof['children'][0]['uid'] = 0
            elif field == 'trial': proof['update_state']['attempts_left'] = 1
            elif field == 'open_mode': proof['service_access']['mode'] = 'development-fixture'
            elif field == 'wrong_phase': proof['phase'] = 3
            with self.subTest(field=field), self.assertRaises(AssertionError):
                contract.validate_boot(log, 4, proof, 'a' * 64)

    def test_guest_failure_watchdog_missing_unmount_and_changed_history_cannot_pass(self):
        for field in ('failure', 'watchdog', 'unmount', 'history', 'duplicate_selection', 'floor', 'pending'):
            log, proof = self.proof(5)
            if field == 'failure': log += '\nROCK_PURCHASER_UPDATE_FAIL'
            elif field == 'watchdog': log += '\nROCK_AB_WATCHDOG_REBOOT'
            elif field == 'unmount': log = log.replace('EXT4-fs (vdb): unmounting filesystem', '')
            elif field == 'history': proof['history_matches_initial'] = False
            elif field == 'duplicate_selection': log += '\nROCK_AB_SELECTED slot=B sequence=2 reason=attempts-exhausted'
            elif field == 'floor': proof['update_state']['floor'] = 3
            elif field == 'pending': proof['update_state']['pending'] = 'A'
            with self.subTest(field=field), self.assertRaises(AssertionError):
                contract.validate_boot(log, 5, proof, 'a' * 64)

    def test_retained_coverage_and_same_account_history_are_exact(self):
        before = {'databases': {'hub': 'original'}, 'binding_sha256': 'binding',
                  'personal_file_sha256': 'personal', 'financial': {'billed_minor': 888},
                  'wallet_config_sha256': 'wallet', 'auth_config_sha256': 'auth'}
        contract.compare_retained(before, copy.deepcopy(before))
        for key in before:
            with self.subTest(key=key):
                after = copy.deepcopy(before); after.pop(key)
                with self.assertRaises(AssertionError): contract.compare_retained(before, after)
                after = copy.deepcopy(before); after[key] = 'changed'
                with self.assertRaises(AssertionError): contract.compare_retained(before, after)

    def cache(self, path):
        with closing(sqlite3.connect(path)) as db, db:
            db.executescript('''
                CREATE TABLE identity(singleton INTEGER PRIMARY KEY,fingerprint TEXT);
                CREATE TABLE requests(key TEXT PRIMARY KEY,payload TEXT,response TEXT);
                CREATE TABLE snapshot(singleton INTEGER PRIMARY KEY,payload TEXT,received_at REAL);
                INSERT INTO identity VALUES(1,'same authority and device');
                INSERT INTO requests VALUES('original','immutable request','immutable receipt');
                INSERT INTO snapshot VALUES(1,'snapshot',10);
            ''')
        path.chmod(0o600)

    def test_real_cache_summary_preserves_receipts_but_does_not_freeze_refresh_time(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'cache.sqlite3'; self.cache(path)
            before = contract.database_summary(path, 'wallet_cache')
            with closing(sqlite3.connect(path)) as db, db: db.execute('UPDATE snapshot SET received_at=20')
            self.assertEqual(before, contract.database_summary(path, 'wallet_cache'))
            with closing(sqlite3.connect(path)) as db, db: db.execute("UPDATE requests SET response='changed receipt'")
            self.assertNotEqual(before, contract.database_summary(path, 'wallet_cache'))

    def test_pending_or_financial_table_in_device_cache_is_rejected(self):
        for fault in ('pending', 'ledger'):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as temporary:
                path = Path(temporary) / 'cache.sqlite3'; self.cache(path)
                with closing(sqlite3.connect(path)) as db, db:
                    db.execute('UPDATE requests SET response=NULL' if fault == 'pending' else 'CREATE TABLE wallet_postings(amount INTEGER)')
                with self.assertRaises(AssertionError): contract.database_summary(path, 'wallet_cache')

    def test_readonly_summary_rejects_world_readable_or_alias_database(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'cache.sqlite3'; self.cache(path)
            path.chmod(0o644)
            with self.assertRaises(AssertionError): contract.database_summary(path, 'wallet_cache')
            path.chmod(0o600); alias = Path(temporary) / 'alias'; alias.symlink_to(path)
            with self.assertRaises(AssertionError): contract.database_summary(alias, 'wallet_cache')

    def test_database_row_limit_is_enforced(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'cache.sqlite3'; self.cache(path)
            with closing(sqlite3.connect(path)) as db, db:
                db.executemany('INSERT INTO requests VALUES(?,?,?)', [(str(n), 'request', 'receipt') for n in range(4096)])
            with self.assertRaisesRegex(AssertionError, 'row limit'):
                contract.database_summary(path, 'wallet_cache')

    def test_financial_summary_rejects_wrong_amount_type_extra_debit_or_renewal(self):
        wallet = {'simulation_only': True, 'available_minor': 4112, 'held_minor': 0,
                  'billed_minor': 888, 'pending_minor': 0, 'dispensed_minor': 0,
                  'ledger_balance_minor': 0, 'membership': {'registered': True,
                  'entitlement': {'auto_renew': False, 'account_id': 'original-account'}},
                  'sales': [{'amount_minor': 5000}], 'bills': [{'amount_minor': 888}],
                  'withdrawals': [], 'journals': [], 'consent': {'accepted': False}}
        self.assertEqual(contract.financial(wallet)['billed_minor'], 888)
        for fault in ('bool', 'extra_debit', 'renewal', 'new_account'):
            changed = copy.deepcopy(wallet)
            if fault == 'bool': changed['held_minor'] = False
            elif fault == 'extra_debit': changed['bills'].append({'amount_minor': 888})
            elif fault == 'renewal': changed['membership']['entitlement']['auto_renew'] = True
            elif fault == 'new_account': changed['membership']['entitlement']['account_id'] = 'other-account'
            with self.subTest(fault=fault):
                if fault == 'new_account':
                    self.assertNotEqual(contract.financial(wallet), contract.financial(changed))
                else:
                    with self.assertRaises(AssertionError): contract.financial(changed)

    def test_observer_close_error_does_not_skip_owned_process_cleanup(self):
        calls = []
        class Observer:
            def close(self): calls.append('observer'); raise OSError('fixture close error')
        class Process:
            def poll(self): return None
            def terminate(self): calls.append('terminate')
            def wait(self, timeout): calls.append('wait')
        entry = {}
        with self.assertRaisesRegex(RuntimeError, 'observer close'):
            verifier.cleanup_boot(Process(), Observer(), entry)
        self.assertEqual(calls, ['observer', 'terminate', 'wait'])
        self.assertEqual(entry['status'], 'FAIL')
        self.assertTrue(entry['forced_owned_cleanup'])

    def test_cleanup_timeout_kills_only_its_supplied_process(self):
        calls = []
        class Process:
            def poll(self): return None
            def terminate(self): calls.append('terminate')
            def kill(self): calls.append('kill')
            def wait(self, timeout):
                calls.append('wait')
                if len(calls) == 2: raise subprocess.TimeoutExpired('owned fixture', timeout)
        entry = {}
        verifier.cleanup_boot(Process(), None, entry)
        self.assertEqual(calls, ['terminate', 'wait', 'kill', 'wait'])
        self.assertEqual(entry['status'], 'FAIL')


if __name__ == '__main__':
    unittest.main()
