import concurrent.futures
import os
import json
from pathlib import Path
import tempfile
import unittest

from controller import Controller, Rejected


def policy(**changes):
    return dict(ownerId='owner-1', deviceId='mini-1', periodId='approved-period-1',
                currency='USD', byteCap=1000, costCapMinor=100, maxClients=3,
                expiresAt=1000, providerId='fixture-satellite', contractVersion='fixture-v1',
                region='US', blockBytes=100, blockPriceMinor=10, grantFeeMinor=0,
                maxGrantBytes=500, maxGrantSeconds=30) if not changes else {**policy(), **changes}


def observation(now=100, **changes):
    return {**dict(bootId='boot-1', linkId='link-1', providerId='fixture-satellite',
                   contractVersion='fixture-v1', region='US', observedAt=now, validUntil=now+60,
                   powerSafe=True, batteryReady=True, apIsolated=True, meterReady=True,
                   hardQuotaReady=True, satelliteRegistered=True, twoWayIp=True,
                   internetReachable=True, sharingEntitled=True, connectedClientIds=['phone', 'laptop', 'small', 'a', 'b']), **changes}


class ControlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'private'
        self.c = Controller(self.path)
        self.c.initialize(policy(), 100)
        self.now = 100

    def tearDown(self):
        self.temp.cleanup()

    @property
    def rev(self):
        return self.c.snapshot(self.now)['revision']

    def owner(self, op, **kwargs):
        return self.c.owner_command('owner-1', self.rev, dict(op=op, **kwargs), self.now)

    def ready(self):
        self.owner('allow', clientId='phone', byteCap=1000)
        self.owner('enable')
        self.c.observe(self.rev, observation(self.now), self.now)

    def reserve(self, key='grant-1', size=100, client='phone'):
        return self.c.reserve(self.rev, key, client, size, self.now)

    def test_offline_demo_round_trip(self):
        from demo import run
        result = run()
        self.assertTrue(result['portableDecision'])
        self.assertEqual(result['overCap'], 'cost_cap')
        self.assertFalse(result['restoredSharing'])
        self.assertEqual((result['txBytes'], result['rxBytes']), (40, 100))
        self.assertEqual(result['reservedBytes'], 100)
        self.assertFalse(result['physicalAccepted'])

    def test_initial_off_and_no_adapter_claim(self):
        s = self.c.snapshot(100)
        self.assertEqual(s['summary']['reason'], 'sharing_off')
        self.assertFalse(s['summary']['physicalAccepted'])
        self.assertFalse(s['summary']['adapterConnected'])
        with self.assertRaisesRegex(Rejected, 'sharing_off'):
            self.reserve()

    def test_portable_satellite_without_dock(self):
        self.ready()
        r = self.reserve(size=210)['result']
        self.assertEqual(r['grant']['costUpperMinor'], 30)
        self.assertTrue(r['installAllowed'])
        self.assertTrue(self.c.can_forward('grant-1', 100))
        self.assertIsNone(self.c.snapshot(100)['dockId'])

    def test_detach_requires_fresh_power_but_keeps_budget_and_clients(self):
        self.ready()
        self.c.attachment(self.rev, 'home', self.now)
        self.c.observe(self.rev, observation(), self.now)
        self.reserve(size=200)
        self.c.attachment(self.rev, None, self.now)
        s = self.c.snapshot(100)
        self.assertEqual(s['summary']['reservedBytes'], 200)
        self.assertFalse(s['placeScopeValid'])
        self.assertTrue(s['clients']['phone']['allowed'])
        self.assertFalse(self.c.can_forward('grant-1', 100))
        self.c.observe(self.rev, observation(batteryReady=False), 100)
        with self.assertRaisesRegex(Rejected, 'power_unavailable'):
            self.reserve('grant-2')
        self.c.observe(self.rev, observation(), 100)
        self.reserve('grant-2')
        self.assertEqual(self.c.snapshot(100)['summary']['reservedBytes'], 300)

    def test_all_capability_gates_fail_closed(self):
        self.ready()
        for field in ['powerSafe', 'batteryReady', 'apIsolated', 'meterReady', 'hardQuotaReady',
                      'satelliteRegistered', 'twoWayIp', 'internetReachable', 'sharingEntitled']:
            with self.subTest(field=field):
                self.c.observe(self.rev, observation(**{field: False}), 100)
                with self.assertRaises(Rejected):
                    self.reserve()
        for field in ['providerId', 'contractVersion', 'region']:
            self.c.observe(self.rev, observation(**{field: 'other'}), 100)
            with self.assertRaisesRegex(Rejected, 'contract_unavailable'):
                self.reserve()

    def test_owner_and_adapter_commands_are_separate(self):
        with self.assertRaisesRegex(Rejected, 'owner_mismatch'):
            self.c.owner_command('other', self.rev, {'op': 'enable'}, 100)
        for op in ['observe', 'reserve', 'settle_closed', 'recover', 'increase_cap']:
            with self.assertRaisesRegex(Rejected, 'unsupported_owner_command'):
                self.owner(op)
        self.assertEqual(self.rev, 0)

    def test_unknown_client_and_client_limit(self):
        self.ready()
        with self.assertRaisesRegex(Rejected, 'client_denied'):
            self.reserve(client='unknown')
        self.owner('allow', clientId='a', byteCap=100)
        self.owner('allow', clientId='b', byteCap=100)
        with self.assertRaisesRegex(Rejected, 'client_limit'):
            self.owner('allow', clientId='c', byteCap=100)

    def test_client_cap_includes_pending_and_both_directions(self):
        self.ready()
        self.owner('allow', clientId='small', byteCap=100)
        self.reserve('a', 60, 'small')
        self.c.settle_closed(self.rev, 'a', 20, 30, 100)
        self.reserve('b', 50, 'small')
        with self.assertRaisesRegex(Rejected, 'client_byte_cap'):
            self.reserve('c', 1, 'small')

    def test_shared_byte_cap_across_clients(self):
        self.ready()
        self.owner('allow', clientId='laptop', byteCap=1000)
        self.reserve('a', 500)
        self.reserve('b', 500, 'laptop')
        with self.assertRaisesRegex(Rejected, 'byte_cap'):
            self.reserve('c', 1, 'laptop')

    def test_cost_blocks_and_no_rounding_down(self):
        self.ready()
        # 1 byte consumes one full billing block reservation.
        for i in range(10):
            self.reserve(f'g{i}', 1)
        with self.assertRaisesRegex(Rejected, 'cost_cap'):
            self.reserve('extra', 1)
        self.assertEqual(self.c.snapshot(100)['summary']['reservedCostMinor'], 100)
        self.assertEqual(self.c.snapshot(100)['summary']['nextGrantBlockReason'], 'cost_cap')
        self.assertTrue(self.c.can_forward('g0', 100))

    def test_revoke_invalidates_all_old_grants_and_keeps_holds(self):
        self.ready()
        self.reserve()
        self.owner('revoke', clientId='phone')
        self.assertFalse(self.c.can_forward('grant-1', 100))
        with self.assertRaisesRegex(Rejected, 'client_denied'):
            self.reserve('new')
        with self.assertRaisesRegex(Rejected, 'client_already_known'):
            self.owner('allow', clientId='phone', byteCap=1000)
        self.assertEqual(self.c.snapshot(100)['summary']['reservedBytes'], 100)

    def test_connection_loss_and_reallow_preserve_accounting(self):
        self.ready()
        self.reserve(size=200)
        self.c.settle_closed(self.rev, 'grant-1', 50, 60, 100)
        self.owner('revoke', clientId='phone')
        self.owner('reallow', clientId='phone')
        self.assertEqual(self.c.snapshot(100)['clients']['phone']['rxBytes'], 60)
        self.c.observe(self.rev, observation(connectedClientIds=[]), 100)
        with self.assertRaisesRegex(Rejected, 'client_disconnected'):
            self.reserve('new')
        self.assertEqual(self.c.snapshot(100)['summary']['connectedClientIds'], [])
        self.assertIsNone(self.c.snapshot(160)['summary']['connectedClientIds'])

    def test_disable_and_reenable_cannot_replay_old_grant(self):
        self.ready()
        self.reserve()
        self.owner('disable')
        self.owner('enable')
        self.assertFalse(self.c.can_forward('grant-1', 100))
        replay = self.reserve()['result']
        self.assertFalse(replay['installAllowed'])
        self.assertEqual(self.c.snapshot(100)['summary']['reservedBytes'], 100)

    def test_idempotency_and_mutation_cannot_rebind_grants(self):
        self.ready()
        first = self.reserve()
        first['result']['grant']['maxBytes'] = 0
        self.assertEqual(self.reserve()['result']['grant']['maxBytes'], 100)
        with self.assertRaisesRegex(Rejected, 'idempotency_conflict'):
            self.reserve(size=200)
        self.assertEqual(len(self.c.snapshot(100)['grants']), 1)

    def test_closed_counters_once_and_cost_never_refunded(self):
        self.ready()
        self.reserve(size=200)
        self.c.settle_closed(self.rev, 'grant-1', 20, 30, 100)
        self.c.settle_closed(self.rev, 'grant-1', 20, 30, 100)
        s = self.c.snapshot(100)
        self.assertEqual((s['txBytes'], s['rxBytes'], s['costUpperMinor']), (20, 30, 20))
        self.assertEqual(s['summary']['reservedBytes'], 0)
        self.assertFalse(self.c.can_forward('grant-1', 100))
        self.assertFalse(s['summary']['invoiceVerified'])
        with self.assertRaisesRegex(Rejected, 'counter_conflict'):
            self.c.settle_closed(self.rev, 'grant-1', 0, 0, 100)

    def test_overrun_latches_fault_and_preserves_uncertain_hold(self):
        self.ready()
        self.reserve()
        result = self.c.settle_closed(self.rev, 'grant-1', 100, 1, 100)
        self.assertEqual(result['result']['fault'], 'meter_overrun')
        for tx, rx in [(0, 0), (100, 0), (101, 1), (90, 11)]:
            with self.assertRaisesRegex(Rejected, 'counter_conflict'):
                self.c.settle_closed(self.rev, 'grant-1', tx, rx, 100)
        replay = self.c.settle_closed(self.rev, 'grant-1', 100, 1, 100)
        self.assertTrue(replay['result']['replay'])
        self.assertEqual(self.c.snapshot(100)['grants']['grant-1']['reportedOverrun'], dict(txBytes=100, rxBytes=1))
        self.assertFalse(self.c.can_forward('grant-1', 100))
        self.c.recover(self.rev, 100)
        with self.assertRaisesRegex(Rejected, 'approval_or_fault'):
            self.owner('enable')
        self.assertEqual(self.c.snapshot(100)['summary']['reservedBytes'], 100)

    def test_restart_durable_usage_and_uncertainty(self):
        self.ready()
        self.reserve('finished', 200)
        self.c.settle_closed(self.rev, 'finished', 50, 100, 100)
        self.reserve('unknown', 300)
        self.c = Controller(self.path)
        self.c.recover(self.rev, 100)
        s = self.c.snapshot(100)
        self.assertEqual((s['txBytes'], s['rxBytes'], s['costUpperMinor']), (50, 100, 20))
        self.assertEqual((s['summary']['reservedBytes'], s['summary']['reservedCostMinor']), (300, 30))
        self.assertFalse(self.c.can_forward('unknown', 100))
        self.owner('enable')
        with self.assertRaisesRegex(Rejected, 'observation_unknown'):
            self.reserve('new')
        with self.assertRaisesRegex(Rejected, 'already_initialized'):
            self.c.initialize(policy(), 100)

    def test_recovery_does_not_trust_old_dock_power(self):
        self.ready()
        self.c.attachment(self.rev, 'old-dock', 100)
        self.c.recover(self.rev, 100)
        self.c.observe(self.rev, observation(batteryReady=False), 100)
        self.owner('enable')
        with self.assertRaisesRegex(Rejected, 'power_unavailable'):
            self.reserve()
        self.assertIsNone(self.c.snapshot(100)['dockId'])
        self.c.attachment(self.rev, 'fresh-dock', 100)
        self.c.observe(self.rev, observation(batteryReady=False), 100)
        self.reserve()

    def test_observed_boot_change_also_drops_old_dock_power(self):
        self.ready()
        self.c.attachment(self.rev, 'old-dock', 100)
        self.c.observe(self.rev, observation(batteryReady=False), 100)
        self.c.observe(self.rev, observation(bootId='boot-2', batteryReady=False), 100)
        self.owner('enable')
        with self.assertRaisesRegex(Rejected, 'power_unavailable'):
            self.reserve()
        self.assertIsNone(self.c.snapshot(100)['dockId'])

    def test_full_period_receipt_reports_record_limit(self):
        # Restore a bounded, valid closed-grant history fixture; do not spend
        # 4096 fsync round trips merely to construct the boundary state.
        self.ready()
        self.reserve()
        self.c.settle_closed(self.rev, 'grant-1', 0, 0, 100)
        s = self.c.snapshot(100)
        s.pop('summary')
        template = s['grants']['grant-1']
        s['policy']['costCapMinor'] = 50000
        s['costUpperMinor'] = 40960
        s['grants'] = {f'past-{i}': {**template, 'grantId': f'past-{i}'} for i in range(4096)}
        with self.c._db() as db:
            db.execute('UPDATE state SET body=? WHERE id=1', (json.dumps(s),))
        self.assertEqual(self.c.snapshot(100)['summary']['nextGrantBlockReason'], 'period_record_limit')
        with self.assertRaisesRegex(Rejected, 'period_record_limit'):
            self.reserve('new')

    def test_expiry_clock_and_link_change(self):
        self.ready()
        self.reserve()
        self.assertFalse(self.c.can_forward('grant-1', 130))
        self.assertFalse(self.c.can_forward('grant-1', 99))
        with self.assertRaisesRegex(Rejected, 'clock_regressed'):
            self.c.recover(self.rev, 99)
        self.c.observe(self.rev, observation(linkId='other-link'), 100)
        self.assertFalse(self.c.can_forward('grant-1', 100))
        self.c.observe(self.rev, observation(bootId='reboot'), 100)
        self.assertFalse(self.c.snapshot(100)['enabled'])

    def test_policy_expiry_and_no_auto_period_reset(self):
        self.ready()
        self.reserve()
        self.now = 1000
        with self.assertRaisesRegex(Rejected, 'approval_expired'):
            self.reserve('new')
        self.assertEqual(self.c.snapshot(1000)['summary']['reservedCostMinor'], 10)
        with self.assertRaisesRegex(Rejected, 'approval_or_fault'):
            self.owner('enable')

    def test_observation_expiry_and_invalid_observations(self):
        self.ready()
        with self.assertRaisesRegex(Rejected, 'observation_unknown'):
            self.c.reserve(self.rev, 'old', 'phone', 10, 160)
        for changes in [dict(validUntil=161), dict(observedAt=99), dict(meterReady=1), dict(twoWayIp='true'), dict(extra=True)]:
            with self.assertRaises(Rejected):
                self.c.observe(self.rev, observation(**changes), 100)

    def test_competing_reservations_are_atomic(self):
        self.ready()
        revision = self.rev
        def reserve_one(i):
            try:
                return Controller(self.path).reserve(revision, f'parallel-{i}', 'phone', 500, 100)
            except Rejected as e:
                return str(e)
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results = list(pool.map(reserve_one, [1, 2]))
        self.assertEqual(sum(type(r) is dict for r in results), 1)
        self.assertIn('revision_conflict', results)
        self.assertEqual(self.c.snapshot(100)['summary']['reservedBytes'], 500)

    def test_invalid_input_and_failed_command_roll_back(self):
        self.ready()
        before = self.c.snapshot(100)
        for n in [True, -1, 0, 1.5, float('nan'), 2**60]:
            with self.assertRaises(Rejected):
                self.reserve(size=n)
        with self.assertRaisesRegex(Rejected, 'invalid_fields'):
            self.owner('enable', costCapMinor=999999)
        self.assertEqual(before, self.c.snapshot(100))

    def test_private_storage_and_symlinks(self):
        self.assertEqual(os.stat(self.path).st_mode & 0o777, 0o700)
        self.assertEqual(os.stat(self.c.path).st_mode & 0o777, 0o600)
        public = Path(self.temp.name) / 'public'
        public.mkdir(mode=0o755)
        with self.assertRaisesRegex(Rejected, 'unsafe_storage'):
            Controller(public)
        link = Path(self.temp.name) / 'link'
        link.symlink_to(self.path)
        with self.assertRaisesRegex(Rejected, 'unsafe_storage'):
            Controller(link)

    def test_policy_rejects_unbounded_or_unknown_prices(self):
        for changes in [dict(blockPriceMinor=0), dict(byteCap=True), dict(maxClients=65),
                        dict(maxGrantSeconds=61), dict(currency='usd'), dict(unknown=1)]:
            with tempfile.TemporaryDirectory() as d:
                c = Controller(Path(d)/'state')
                with self.assertRaises(Rejected):
                    c.initialize(policy(**changes), 100)

    def test_exhaustive_small_shared_budget(self):
        # Independent arithmetic oracle: two clients, all sizes 1..8 and caps 1..8.
        for cap in range(1, 9):
            for a in range(1, 9):
                for b in range(1, 9):
                    with tempfile.TemporaryDirectory() as d:
                        c = Controller(Path(d)/'state')
                        c.initialize(policy(byteCap=100, costCapMinor=cap, blockBytes=3,
                                            blockPriceMinor=1, grantFeeMinor=1, maxGrantBytes=100), 100)
                        def rev(): return c.snapshot(100)['revision']
                        for client in ['a', 'b']:
                            c.owner_command('owner-1', rev(), dict(op='allow',clientId=client,byteCap=100),100)
                        c.owner_command('owner-1',rev(),dict(op='enable'),100)
                        c.observe(rev(),observation(),100)
                        spent = 0
                        for client, size in [('a', a), ('b', b)]:
                            price = (size + 2)//3 + 1
                            expected = spent + price <= cap
                            try:
                                c.reserve(rev(),client,client,size,100)
                                accepted = True
                            except Rejected as e:
                                self.assertEqual(str(e),'cost_cap')
                                accepted = False
                            self.assertEqual(accepted,expected)
                            if accepted: spent += price
                        self.assertEqual(c.snapshot(100)['summary']['reservedCostMinor'],spent)


if __name__ == '__main__':
    unittest.main()
