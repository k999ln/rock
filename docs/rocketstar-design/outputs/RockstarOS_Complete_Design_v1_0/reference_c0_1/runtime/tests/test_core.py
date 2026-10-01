"""Independent SIM_ONLY contract fault tests. No hardware or networking.

The two SQLite files and the direct Python transport are disposable fixtures.
Passing these tests is not flight, life-support, radiation, timing, or OS evidence.
"""
import copy
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from colony_core.core import (Broker, Controller, ContractError, FIXTURE_COMMAND_KEY,
    FIXTURE_RECEIPT_KEY, canonical, digest, signed)


class Clock:
    def __init__(self, now=1000): self.value = now
    def __call__(self): return self.value
    def advance(self, seconds): self.value += seconds


class ColonyContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.clock = Clock()
        self.controller = Controller(self.root/'controller.sqlite', clock=self.clock)
        self.broker = Broker(self.root/'broker.sqlite', clock=self.clock)
        self.controller.acquire_authority('ops-A', 0)
        self.controller.step()
        self.broker.refresh(self.controller)

    def tearDown(self):
        self.broker.close()
        self.controller.close()
        self.temp.cleanup()

    def command(self, kw=2, ttl=10, actor='operator', approve=True):
        c = self.broker.prepare(kw, ttl=ttl, actor=actor)
        if approve:
            self.broker.approve(c['commandId'], digest(c))
        return c

    def restart_broker(self):
        self.broker.close()
        self.broker = Broker(self.root/'broker.sqlite', clock=self.clock)

    def restart_controller(self):
        self.controller.close()
        self.controller = Controller(self.root/'controller.sqlite', clock=self.clock, reboot=True)

    def count_receipts(self):
        return self.controller.db.execute('SELECT COUNT(*) FROM receipts').fetchone()[0]

    def test_explicit_prepare_exact_approve_dispatch_and_local_step(self):
        c = self.command(3, approve=False)
        self.assertEqual(self.broker.state(c['commandId']), 'PREPARED')
        with self.assertRaisesRegex(ContractError, 'NOT_APPROVED'):
            self.broker.dispatch(c['commandId'], self.controller)
        self.assertEqual(self.count_receipts(), 0)
        self.broker.approve(c['commandId'], digest(c))
        self.assertEqual(self.broker.state(c['commandId']), 'QUEUED')
        r = self.broker.dispatch(c['commandId'], self.controller)
        self.assertEqual(r['status'], 'APPLIED')
        self.assertEqual(r['mode'], 'SIM_ONLY')
        self.assertEqual(r['appliedScope'], 'synthetic desired-load state only')
        self.assertEqual(self.broker.state(c['commandId']), 'SUCCEEDED')
        # Application changes only desired load; local step computes the plant output.
        self.assertEqual(self.controller.snapshot()['actualFlexibleKw'], 0)
        s = self.controller.step()
        self.assertEqual(s['actualFlexibleKw'], 3)
        self.assertEqual(s['criticalServedKw'], 4)

    def test_planner_proposal_cannot_approve_or_dispatch(self):
        c = self.command(actor='planner', approve=False)
        with self.assertRaisesRegex(ContractError, 'HUMAN_FIXTURE_APPROVAL_REQUIRED'):
            self.broker.approve(c['commandId'], digest(c), actor='planner')
        with self.assertRaisesRegex(ContractError, 'NOT_APPROVED'):
            self.broker.dispatch(c['commandId'], self.controller)
        self.assertEqual(self.count_receipts(), 0)

    def test_approval_requires_exact_full_command_digest(self):
        c = self.command(approve=False)
        with self.assertRaisesRegex(ContractError, 'APPROVAL_DIGEST_MISMATCH'):
            self.broker.approve(c['commandId'], digest(c['payload']))
        self.assertEqual(self.broker.state(c['commandId']), 'PREPARED')

    def test_unsigned_tampering_rejected_without_effect(self):
        c = self.command()
        c['payload']['desiredFlexibleKw'] = 3
        with self.assertRaisesRegex(ContractError, 'BAD_FIXTURE_MAC'):
            self.controller.receive(c)
        self.assertEqual(self.count_receipts(), 0)
        self.assertEqual(self.controller.snapshot()['desiredFlexibleKw'], 0)

    def test_authenticated_wrong_domain_mode_or_source_rejected(self):
        original = self.command()
        for field, value in [('mode','OPERATE'), ('siteId','other-site'), ('nodeId','other-node'),
                             ('ownerRef','other-owner'), ('sourceClass','HARDWARE'), ('schema','unknown/2')]:
            with self.subTest(field=field):
                c = signed({**original, field:value}, FIXTURE_COMMAND_KEY)
                with self.assertRaisesRegex(ContractError, 'WRONG_DOMAIN_OR_MODE'):
                    self.controller.receive(c)
        self.assertEqual(self.count_receipts(), 0)

    def test_critical_equipment_operation_cannot_be_expressed(self):
        c = self.command()
        c['payload'] = {'operation':'life_support.valve.open', 'desiredFlexibleKw':1}
        c['payloadDigest'] = digest(c['payload'])
        c = signed(c, FIXTURE_COMMAND_KEY)
        with self.assertRaisesRegex(ContractError, 'OPERATION_NOT_ALLOWED'):
            self.controller.receive(c)
        self.assertEqual(self.count_receipts(), 0)

    def test_extra_envelope_fields_and_digest_mismatch_fail_closed(self):
        c = self.command()
        with self.assertRaisesRegex(ContractError, 'INVALID_ENVELOPE'):
            self.controller.receive(signed({**c, 'physical':True}, FIXTURE_COMMAND_KEY))
        with self.assertRaisesRegex(ContractError, 'PAYLOAD_DIGEST_MISMATCH'):
            self.controller.receive(signed({**c, 'payloadDigest':'0'*64}, FIXTURE_COMMAND_KEY))
        self.assertEqual(self.count_receipts(), 0)

    def test_nan_bool_and_overbudget_inputs_rejected(self):
        for value in [float('nan'), float('inf'), True, -1, 101]:
            with self.subTest(value=repr(value)):
                with self.assertRaises(ContractError): self.broker.prepare(value)
        with self.assertRaisesRegex(ContractError, 'RESOURCE_BUDGET'):
            self.broker.prepare(7)

    def test_stale_telemetry_blocks_refresh_and_prepare(self):
        self.clock.advance(6)
        with self.assertRaisesRegex(ContractError, 'STALE_OR_UNTRUSTED_TELEMETRY'):
            self.broker.refresh(self.controller)
        with self.assertRaisesRegex(ContractError, 'FRESH_TELEMETRY_REQUIRED'):
            self.broker.prepare(1)
        self.controller.step()
        self.broker.refresh(self.controller)
        self.assertEqual(self.broker.prepare(1)['mode'], 'SIM_ONLY')

    def test_expired_prepared_command_cannot_be_approved(self):
        c = self.command(ttl=2, approve=False)
        self.clock.advance(2)
        with self.assertRaisesRegex(ContractError, 'EXPIRED'):
            self.broker.approve(c['commandId'], digest(c))

    def test_expired_queued_command_never_reaches_controller(self):
        c = self.command(ttl=2)
        self.clock.advance(2)
        with patch.object(self.controller, 'receive', wraps=self.controller.receive) as receive:
            with self.assertRaisesRegex(ContractError, 'EXPIRED'):
                self.broker.dispatch(c['commandId'], self.controller)
            receive.assert_not_called()
        self.assertEqual(self.broker.state(c['commandId']), 'EXPIRED')

    def test_controller_independently_rejects_expired_direct_command(self):
        c = self.command(ttl=2)
        self.clock.advance(2)
        r = self.controller.receive(c)
        self.assertEqual((r['status'],r['reason']), ('REJECTED','EXPIRED'))
        self.assertEqual(self.controller.snapshot()['desiredFlexibleKw'], 0)

    def test_exact_replay_survives_controller_reboot_without_reapplying(self):
        c = self.command(3)
        first = self.controller.receive(c)
        rev = self.controller.snapshot()['stateRevision']
        self.assertEqual(self.controller.receive(c), first)
        self.assertEqual(self.controller.snapshot()['stateRevision'], rev)
        self.restart_controller()
        reboot_revision = self.controller.snapshot()['stateRevision']
        self.assertEqual(self.controller.receive(c), first)
        self.assertEqual(self.controller.snapshot()['stateRevision'], reboot_revision)
        self.assertEqual(self.controller.snapshot()['desiredFlexibleKw'], 0)
        self.assertEqual(self.count_receipts(), 1)

    def test_same_id_changed_payload_conflicts_after_reboot(self):
        c = self.command(2)
        self.controller.receive(c)
        self.restart_controller()
        altered = copy.deepcopy(c)
        altered['payload']['desiredFlexibleKw'] = 1
        altered['payloadDigest'] = digest(altered['payload'])
        altered = signed(altered, FIXTURE_COMMAND_KEY)
        with self.assertRaisesRegex(ContractError, 'IDEMPOTENCY_CONFLICT'):
            self.controller.receive(altered)
        self.assertEqual(self.count_receipts(), 1)
        self.assertEqual(self.controller.snapshot()['desiredFlexibleKw'], 0)

    def test_reboot_fences_old_unapplied_generation(self):
        c = self.command()
        self.restart_controller()
        r = self.controller.receive(c)
        self.assertEqual((r['status'],r['reason']), ('REJECTED','STALE_COMPONENT_GENERATION'))
        self.assertEqual(self.controller.snapshot()['desiredFlexibleKw'], 0)

    def test_exclusive_authority_cas_and_epoch_fence(self):
        c = self.command(ttl=30)
        with self.assertRaisesRegex(ContractError, 'AUTHORITY_BUSY'):
            self.controller.acquire_authority('ops-B', 1)
        with self.assertRaisesRegex(ContractError, 'STALE_AUTHORITY_EPOCH'):
            self.controller.acquire_authority('ops-A', 0)
        self.clock.advance(30)
        grant = self.controller.acquire_authority('ops-B', 1)
        self.assertEqual(grant['authorityEpoch'], 2)
        # Fixture issuer extends expiry only to isolate the epoch check in the controller.
        c = signed({**c, 'expiresAt':self.clock()+10}, FIXTURE_COMMAND_KEY)
        r = self.controller.receive(c)
        self.assertEqual(r['reason'], 'NO_AUTHORITY')
        self.assertEqual(self.controller.snapshot()['holderId'], 'ops-B')

    def test_lease_expiry_curtails_local_flexible_load_without_broker(self):
        c = self.command(3)
        self.broker.dispatch(c['commandId'], self.controller)
        self.assertEqual(self.controller.step()['actualFlexibleKw'], 3)
        self.clock.advance(30)
        s = self.controller.step()
        self.assertEqual((s['state'],s['actualFlexibleKw']), ('LOCAL_HOLD',0))
        self.assertEqual(s['criticalServedKw'], 4)

    def test_state_revision_change_rejects_old_command(self):
        c = self.command()
        self.controller.set_supply_for_test(9)
        r = self.broker.dispatch(c['commandId'], self.controller)
        self.assertEqual((r['status'],r['reason']), ('REJECTED','REVISION_CONFLICT'))
        self.assertEqual(self.controller.snapshot()['desiredFlexibleKw'], 0)

    def test_local_resource_budget_is_checked_even_for_signed_fixture(self):
        c = self.command()
        c['payload']['desiredFlexibleKw'] = 7
        c['payloadDigest'] = digest(c['payload'])
        r = self.controller.receive(signed(c, FIXTURE_COMMAND_KEY))
        self.assertEqual(r['reason'], 'LOCAL_RESOURCE_BUDGET')
        self.assertEqual(self.controller.snapshot()['desiredFlexibleKw'], 0)

    def test_supply_drop_curtails_then_reports_critical_deficit(self):
        c = self.command(5)
        self.broker.dispatch(c['commandId'], self.controller)
        self.assertEqual(self.controller.step()['actualFlexibleKw'], 5)
        s = self.controller.set_supply_for_test(6)
        self.assertEqual((s['state'],s['actualFlexibleKw'],s['criticalServedKw']), ('CURTAILED',2,4))
        s = self.controller.set_supply_for_test(2)
        self.assertEqual(s['state'], 'CRITICAL_DEFICIT')
        self.assertEqual(s['actualFlexibleKw'], 0)
        self.assertEqual(s['criticalServedKw'], 2)
        self.assertEqual(s['criticalDeficitKw'], 2)
        # The simulation reports unmet critical demand; it does not invent power.
        self.assertEqual(s['criticalServedKw']+s['actualFlexibleKw'], s['supplyKw'])

    def test_lost_receipt_restart_reconciles_without_resend(self):
        c = self.command(3)
        self.broker.dispatch(c['commandId'], self.controller, drop_receipt=True)
        self.assertEqual(self.broker.state(c['commandId']), 'UNCERTAIN')
        rev = self.controller.snapshot()['stateRevision']
        self.restart_broker()
        with patch.object(self.controller, 'receive', wraps=self.controller.receive) as receive:
            r = self.broker.reconcile(c['commandId'], self.controller)
            receive.assert_not_called()
        self.assertEqual(r['status'], 'APPLIED')
        self.assertEqual(self.broker.state(c['commandId']), 'SUCCEEDED')
        self.assertEqual(self.controller.snapshot()['stateRevision'], rev)
        self.assertEqual(self.count_receipts(), 1)

    def test_presend_durable_claim_crash_stays_unknown_with_no_resend(self):
        c = self.command()
        self.broker.dispatch(c['commandId'], self.controller, crash_after_send_claim=True)
        self.assertEqual(self.broker.state(c['commandId']), 'SENT')
        self.assertEqual(self.count_receipts(), 0)
        self.restart_broker()
        self.assertEqual(self.broker.state(c['commandId']), 'UNCERTAIN')
        with patch.object(self.controller, 'receive', wraps=self.controller.receive) as receive:
            r = self.broker.reconcile(c['commandId'], self.controller)
            receive.assert_not_called()
            with self.assertRaisesRegex(ContractError, 'NOT_APPROVED'):
                self.broker.dispatch(c['commandId'], self.controller)
            receive.assert_not_called()
        self.assertEqual(r['state'], 'UNCERTAIN')
        self.assertEqual(self.count_receipts(), 0)

    def test_restart_cancels_prepared_and_queued(self):
        prepared = self.command(1, approve=False)
        queued = self.command(2)
        self.restart_broker()
        for c in [prepared, queued]:
            with self.subTest(command=c['commandId']):
                self.assertEqual(self.broker.state(c['commandId']), 'CANCELLED_RESTART')
                with self.assertRaisesRegex(ContractError, 'NOT_APPROVED'):
                    self.broker.dispatch(c['commandId'], self.controller)
        self.assertEqual(self.count_receipts(), 0)

    def test_clock_rollback_locally_curtails_and_revokes_authority(self):
        c = self.command(3)
        self.broker.dispatch(c['commandId'], self.controller)
        self.controller.step()
        self.clock.advance(-1)
        s = self.controller.step()
        self.assertFalse(s['clockTrusted'])
        self.assertIsNone(s['holderId'])
        self.assertEqual(s['state'], 'CLOCK_UNTRUSTED')
        self.assertEqual(s['actualFlexibleKw'], 0)
        self.assertEqual(s['criticalServedKw'], 4)
        with self.assertRaisesRegex(ContractError, 'TIME_UNTRUSTED'):
            self.controller.acquire_authority('ops-A', s['authorityEpoch'])
        self.clock.advance(10)
        self.assertFalse(self.controller.step()['clockTrusted'])

    def test_broker_clock_rollback_blocks_dispatch(self):
        c = self.command()
        self.clock.advance(-1)
        with patch.object(self.controller, 'receive', wraps=self.controller.receive) as receive:
            with self.assertRaisesRegex(ContractError, 'TIME_UNTRUSTED'):
                self.broker.dispatch(c['commandId'], self.controller)
            receive.assert_not_called()
        self.assertEqual(self.count_receipts(), 0)

    def test_nonfinite_clock_preserves_local_priority_and_latches_untrusted(self):
        c = self.command(3)
        self.broker.dispatch(c['commandId'], self.controller)
        self.controller.step()
        for bad in [float('nan'), float('inf'), -float('inf'), 10**1000]:
            with self.subTest(clock=repr(bad)):
                self.clock.value = bad
                s = self.controller.step()
                self.assertFalse(s['clockTrusted'])
                self.assertEqual(s['actualFlexibleKw'], 0)
                self.assertEqual(s['criticalServedKw'], 4)
                self.assertIsNone(s['holderId'])
                self.assertEqual(s['state'], 'CLOCK_UNTRUSTED')
                self.clock.value = 2000
                self.assertFalse(self.controller.step()['clockTrusted'])

    def test_invalid_clock_at_new_controller_initialization_is_not_trusted(self):
        for i,bad in enumerate([float('nan'), float('inf'), 10**1000]):
            with self.subTest(clock=repr(bad)):
                clock = Clock(bad)
                controller = Controller(self.root/f'invalid-clock-{i}.sqlite', clock=clock)
                try:
                    s = controller.step()
                    self.assertFalse(s['clockTrusted'])
                    self.assertEqual(s['criticalServedKw'], 4)
                    self.assertEqual(s['actualFlexibleKw'], 0)
                    clock.value = 1000
                    self.assertFalse(controller.step()['clockTrusted'])
                    with self.assertRaisesRegex(ContractError, 'TIME_UNTRUSTED'):
                        controller.acquire_authority('ops-A', 0)
                finally:
                    controller.close()

    def test_invalid_broker_initial_clock_cannot_recover_authority_implicitly(self):
        clock = Clock(float('nan'))
        broker = Broker(self.root/'invalid-broker.sqlite', clock=clock)
        try:
            clock.value = 1000
            with self.assertRaisesRegex(ContractError, 'TIME_UNTRUSTED'):
                broker.refresh(self.controller)
        finally:
            broker.close()

    def test_authenticated_invalid_telemetry_domain_rejected(self):
        original = self.controller.snapshot()
        for field,value in [('schema','unknown/2'),('sourceClass','HARDWARE'),('mode','OPERATE'),
                            ('siteId','other'),('nodeId','other')]:
            with self.subTest(field=field):
                altered = signed({**original, field:value}, FIXTURE_RECEIPT_KEY)
                with patch.object(self.controller, 'snapshot', return_value=altered):
                    with self.assertRaises(ContractError):
                        self.broker.refresh(self.controller)

    def test_changed_stored_body_is_not_approved_for_dispatch(self):
        c = self.command()
        changed = signed({**c, 'workId':'work-changed'}, FIXTURE_COMMAND_KEY)
        with self.broker.db:
            self.broker.db.execute('UPDATE commands SET body=? WHERE command_id=?',
                                   (canonical(changed).decode(), c['commandId']))
        with patch.object(self.controller, 'receive', wraps=self.controller.receive) as receive:
            with self.assertRaisesRegex(ContractError, 'NOT_APPROVED_FOR_DISPATCH'):
                self.broker.dispatch(c['commandId'], self.controller)
            receive.assert_not_called()

    def test_controller_transport_exception_persists_uncertain(self):
        c = self.command()
        with patch.object(self.controller, 'receive', side_effect=OSError('synthetic link interrupted')):
            with self.assertRaisesRegex(OSError, 'synthetic link interrupted'):
                self.broker.dispatch(c['commandId'], self.controller)
        self.assertEqual(self.broker.state(c['commandId']), 'UNCERTAIN')
        self.restart_broker()
        self.assertEqual(self.broker.state(c['commandId']), 'UNCERTAIN')
        self.assertEqual(self.count_receipts(), 0)

    def test_receipt_insert_failure_rolls_back_desired_state_and_revision(self):
        c = self.command(3)
        before = self.controller.snapshot()
        self.controller.db.execute('''CREATE TRIGGER inject_receipt_failure BEFORE INSERT ON receipts
            BEGIN SELECT RAISE(ABORT, 'injected receipt persistence failure'); END''')
        self.controller.db.commit()
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'injected receipt persistence failure'):
            self.broker.dispatch(c['commandId'], self.controller)
        after = self.controller.snapshot()
        self.assertEqual(after['desiredFlexibleKw'], before['desiredFlexibleKw'])
        self.assertEqual(after['stateRevision'], before['stateRevision'])
        self.assertEqual(self.count_receipts(), 0)
        self.assertEqual(self.broker.state(c['commandId']), 'UNCERTAIN')
        self.controller.db.execute('DROP TRIGGER inject_receipt_failure')
        self.controller.db.commit()
        with patch.object(self.controller, 'receive', wraps=self.controller.receive) as receive:
            r = self.broker.reconcile(c['commandId'], self.controller)
            receive.assert_not_called()
        self.assertEqual(r['state'], 'UNCERTAIN')

    def test_wrong_receipt_cannot_be_marked_succeeded(self):
        c = self.command()
        self.broker.dispatch(c['commandId'], self.controller, drop_receipt=True)
        original = self.controller.query_receipt(c['commandId'])
        for field,value in [('commandId','other'),('requestDigest','0'*64),('payloadDigest','0'*64),
                            ('siteId','other'),('nodeId','other'),('mode','OPERATE'),('status','UNKNOWN'),
                            ('schema','unknown/2'),('sourceClass','HARDWARE')]:
            with self.subTest(field=field):
                altered = signed({**original, field:value}, FIXTURE_RECEIPT_KEY)
                with patch.object(self.controller, 'query_receipt', return_value=altered):
                    with self.assertRaisesRegex(ContractError, 'RECEIPT_MISMATCH'):
                        self.broker.reconcile(c['commandId'], self.controller)
                self.assertEqual(self.broker.state(c['commandId']), 'UNCERTAIN')


if __name__ == '__main__': unittest.main(verbosity=2)
