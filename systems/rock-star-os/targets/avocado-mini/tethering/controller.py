"""Mini tethering control-plane prototype; no radio, firewall or billing authority.

Call only inside the authenticated OS broker. Owner commands and trusted adapter
observations have separate entry points. A persisted grant is a bounded work
reservation, never evidence that any packet was sent or an invoice was paid.
"""
import copy
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import sqlite3

MAX = 2**53 - 1


class Rejected(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise Rejected(reason)


def fields(value, names):
    require(type(value) is dict and set(value) == set(names.split()), 'invalid_fields')


def number(value, minimum=0, maximum=MAX):
    require(type(value) is int and minimum <= value <= maximum, 'invalid_integer')
    return value


def identity(value):
    require(type(value) is str and re.fullmatch(r'[A-Za-z0-9._:-]{1,96}', value), 'invalid_identity')
    return value


def boolean(value):
    require(type(value) is bool, 'invalid_boolean')
    return value


def validate_policy(p):
    fields(p, 'ownerId deviceId periodId currency byteCap costCapMinor maxClients expiresAt providerId contractVersion region blockBytes blockPriceMinor grantFeeMinor maxGrantBytes maxGrantSeconds')
    for key in ('ownerId', 'deviceId', 'periodId', 'providerId', 'contractVersion', 'region'):
        identity(p[key])
    require(type(p['currency']) is str and re.fullmatch('[A-Z]{3}', p['currency']), 'invalid_currency')
    for key in ('byteCap', 'costCapMinor', 'expiresAt', 'blockBytes', 'blockPriceMinor', 'maxGrantBytes'):
        number(p[key], 1)
    number(p['grantFeeMinor'])
    number(p['maxClients'], 1, 64)
    number(p['maxGrantSeconds'], 1, 60)
    require(p['maxGrantBytes'] <= p['byteCap'], 'invalid_grant_cap')


class Controller:
    """One immutable owner/device/approved period per private database.

    The service adapter must invoke recover BEFORE enabling any packet path on
    startup. Simultaneous handles share SQLite CAS; opening another handle is
    intentionally read-only. No automatic new period, cap increase or renewal.
    """
    def __init__(self, directory):
        self.directory = Path(directory)
        require(not self.directory.is_symlink(), 'unsafe_storage')
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        stat = self.directory.stat()
        require(stat.st_uid == os.getuid() and stat.st_mode & 0o077 == 0, 'unsafe_storage')
        self.path = self.directory / 'tethering.sqlite3'
        require(not self.path.is_symlink(), 'unsafe_storage')
        if not self.path.exists():
            fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
        require(self.path.stat().st_uid == os.getuid() and self.path.stat().st_mode & 0o077 == 0, 'unsafe_storage')
        with self._db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)')

    @contextmanager
    def _db(self):
        db = sqlite3.connect(self.path, timeout=5)
        try:
            db.execute('PRAGMA synchronous=FULL')
            with db:
                yield db
        finally:
            db.close()

    def initialize(self, policy, now):
        validate_policy(policy)
        number(now)
        require(now < policy['expiresAt'], 'approval_expired')
        state = dict(schema='mini-tethering-control/1', policy=copy.deepcopy(policy), revision=0,
                     lastTime=now, enabled=False, epoch=0, dockId=None, placeScopeValid=False,
                     observation=None, clients={}, grants={}, txBytes=0, rxBytes=0,
                     costUpperMinor=0, fault=None)
        with self._db() as db:
            require(db.execute('SELECT 1 FROM state').fetchone() is None, 'already_initialized')
            db.execute('INSERT INTO state VALUES(1,?)', (json.dumps(state),))
        return self.snapshot(now)

    def _read(self, db):
        row = db.execute('SELECT body FROM state WHERE id=1').fetchone()
        require(row is not None, 'not_initialized')
        state = json.loads(row[0])
        require(state['schema'] == 'mini-tethering-control/1', 'unknown_schema')
        return state

    def _change(self, revision, now, mutation):
        number(revision)
        number(now)
        with self._db() as db:
            db.execute('BEGIN IMMEDIATE')
            s = self._read(db)
            require(s['revision'] == revision, 'revision_conflict')
            require(now >= s['lastTime'], 'clock_regressed')
            result = mutation(s)
            s['lastTime'] = now
            s['revision'] += 1
            db.execute('UPDATE state SET body=? WHERE id=1', (json.dumps(s),))
        return dict(revision=s['revision'], result=result)

    @staticmethod
    def _invalidate(s):
        s['epoch'] += 1
        # Uncertain grants retain both byte and cost reservations, even after stop.

    @staticmethod
    def _held(s, client=None):
        return [g for g in s['grants'].values() if g['status'] == 'reserved'
                and (client is None or g['clientId'] == client)]

    def _reason(self, s, now):
        if now < s['lastTime']:
            return 'clock_regressed'
        if s['fault']:
            return s['fault']
        if not s['enabled']:
            return 'sharing_off'
        if now >= s['policy']['expiresAt']:
            return 'approval_expired'
        o = s['observation']
        if o is None or not o['observedAt'] <= now < o['validUntil']:
            return 'observation_unknown'
        if not o['powerSafe'] or (s['dockId'] is None and not o['batteryReady']):
            return 'power_unavailable'
        if not o['apIsolated'] or not o['meterReady'] or not o['hardQuotaReady']:
            return 'enforcement_unavailable'
        if not o['satelliteRegistered'] or not o['twoWayIp'] or not o['internetReachable']:
            return 'satellite_unavailable'
        if not o['sharingEntitled'] or any(o[k] != s['policy'][k] for k in ('providerId', 'contractVersion', 'region')):
            return 'contract_unavailable'
        return None

    def owner_command(self, authenticated_owner, revision, command, now):
        # authenticated_owner comes from the existing broker, never request JSON.
        identity(authenticated_owner)
        require(type(command) is dict and 'op' in command, 'invalid_command')
        c = copy.deepcopy(command)

        def mutate(s):
            require(authenticated_owner == s['policy']['ownerId'], 'owner_mismatch')
            op = c['op']
            if op == 'allow':
                fields(c, 'op clientId byteCap')
                client = identity(c['clientId'])
                number(c['byteCap'], 1, s['policy']['byteCap'])
                require(now < s['policy']['expiresAt'], 'approval_expired')
                prior = s['clients'].get(client)
                require(prior is None, 'client_already_known')
                require(len(s['clients']) < s['policy']['maxClients'], 'client_limit')
                s['clients'][client] = dict(allowed=True, byteCap=c['byteCap'], txBytes=0, rxBytes=0)
            elif op == 'reallow':
                fields(c, 'op clientId')
                require(identity(c['clientId']) in s['clients'], 'unknown_client')
                require(now < s['policy']['expiresAt'], 'approval_expired')
                s['clients'][c['clientId']]['allowed'] = True
                self._invalidate(s)
            elif op == 'revoke':
                fields(c, 'op clientId')
                require(identity(c['clientId']) in s['clients'], 'unknown_client')
                s['clients'][c['clientId']]['allowed'] = False
                self._invalidate(s)
            elif op in ('enable', 'disable'):
                fields(c, 'op')
                if op == 'enable':
                    require(now < s['policy']['expiresAt'] and s['fault'] is None, 'approval_or_fault')
                s['enabled'] = op == 'enable'
                self._invalidate(s)
            else:
                raise Rejected('unsupported_owner_command')
            return {'desiredForwarding': False, 'adapterReconcileRequired': True}
        return self._change(revision, now, mutate)

    def observe(self, revision, observation, now):
        """Trusted adapter only; caller must verify actual driver/contract evidence."""
        o = copy.deepcopy(observation)
        fields(o, 'bootId linkId providerId contractVersion region observedAt validUntil powerSafe batteryReady apIsolated meterReady hardQuotaReady satelliteRegistered twoWayIp internetReachable sharingEntitled connectedClientIds')
        for k in ('bootId', 'linkId', 'providerId', 'contractVersion', 'region'):
            identity(o[k])
        require(type(o['connectedClientIds']) is list and len(o['connectedClientIds']) <= 64, 'invalid_clients')
        for client in o['connectedClientIds']:
            identity(client)
        require(len(set(o['connectedClientIds'])) == len(o['connectedClientIds']), 'duplicate_client')
        number(o['observedAt'])
        number(o['validUntil'])
        require(o['observedAt'] == now and now < o['validUntil'] <= now + 60, 'invalid_observation_lease')
        for k in ('powerSafe', 'batteryReady', 'apIsolated', 'meterReady', 'hardQuotaReady', 'satelliteRegistered', 'twoWayIp', 'internetReachable', 'sharingEntitled'):
            boolean(o[k])

        def mutate(s):
            old = s['observation']
            # Any observation change fences old grants. Adapter closes old tokens
            # before installing new epoch; periodic observations do not refund.
            self._invalidate(s)
            if old and old['bootId'] != o['bootId']:
                s['enabled'] = False
                s['dockId'] = None
                s['placeScopeValid'] = False
            s['observation'] = o
        return self._change(revision, now, mutate)

    def attachment(self, revision, dock_id, now):
        if dock_id is not None:
            identity(dock_id)

        def mutate(s):
            if s['dockId'] != dock_id:
                s['dockId'] = dock_id
                s['placeScopeValid'] = False
                s['observation'] = None
                self._invalidate(s)
            # Owner, clients, period, all usage/holds persist through detach.
        return self._change(revision, now, mutate)

    def recover(self, revision, now):
        def mutate(s):
            s['dockId'] = None  # Old external power cannot survive process/device restart.
            s['enabled'] = False
            s['observation'] = None
            s['placeScopeValid'] = False
            self._invalidate(s)
        return self._change(revision, now, mutate)

    def reserve(self, revision, grant_id, client_id, max_bytes, now):
        """Adapter only: durably reserve before it opens a bounded packet path."""
        identity(grant_id)
        identity(client_id)
        number(max_bytes, 1)

        def mutate(s):
            prior = s['grants'].get(grant_id)
            if prior:
                require(prior['clientId'] == client_id and prior['maxBytes'] == max_bytes, 'idempotency_conflict')
                return dict(grant=copy.deepcopy(prior), installAllowed=False, replay=True)
            require(len(s['grants']) < 4096, 'period_record_limit')
            reason = self._reason(s, now)
            require(reason is None, reason)
            client = s['clients'].get(client_id)
            require(client is not None and client['allowed'], 'client_denied')
            require(client_id in s['observation']['connectedClientIds'], 'client_disconnected')
            p = s['policy']
            require(max_bytes <= p['maxGrantBytes'], 'grant_too_large')
            held = self._held(s)
            require(s['txBytes'] + s['rxBytes'] + sum(g['maxBytes'] for g in held) + max_bytes <= p['byteCap'], 'byte_cap')
            require(client['txBytes'] + client['rxBytes'] + sum(g['maxBytes'] for g in self._held(s, client_id)) + max_bytes <= client['byteCap'], 'client_byte_cap')
            # Approved ALL-IN upper-bound tariff, never an actual provider price.
            cost = ((max_bytes + p['blockBytes'] - 1) // p['blockBytes']) * p['blockPriceMinor'] + p['grantFeeMinor']
            number(cost)
            require(s['costUpperMinor'] + sum(g['costUpperMinor'] for g in held) + cost <= p['costCapMinor'], 'cost_cap')
            g = dict(grantId=grant_id, clientId=client_id, maxBytes=max_bytes, costUpperMinor=cost,
                     epoch=s['epoch'], bootId=s['observation']['bootId'], linkId=s['observation']['linkId'],
                     expiresAt=min(now + p['maxGrantSeconds'], s['observation']['validUntil'], p['expiresAt']),
                     status='reserved', txBytes=None, rxBytes=None)
            s['grants'][grant_id] = g
            return dict(grant=copy.deepcopy(g), installAllowed=True, replay=False)
        return self._change(revision, now, mutate)

    def can_forward(self, grant_id, now):
        """Control decision only. Kernel/provider must enforce bytes+expiry atomically."""
        identity(grant_id)
        number(now)
        with self._db() as db:
            s = self._read(db)
        g = s['grants'].get(grant_id)
        return bool(g and g['status'] == 'reserved' and g['epoch'] == s['epoch']
                    and now < g['expiresAt'] and s['clients'][g['clientId']]['allowed']
                    and self._reason(s, now) is None)

    def settle_closed(self, revision, grant_id, tx_bytes, rx_bytes, now):
        """Trusted adapter ONLY after token closure+final counters readback.

        Unknown/lost counters: do not call; hold remains indefinitely. No cost
        refund here, including zero-byte grants; billing reconciliation is separate.
        """
        identity(grant_id)
        number(tx_bytes)
        number(rx_bytes)
        number(tx_bytes + rx_bytes)

        def mutate(s):
            require(grant_id in s['grants'], 'unknown_grant')
            g = s['grants'][grant_id]
            if 'reportedOverrun' in g:
                require(g['reportedOverrun'] == dict(txBytes=tx_bytes, rxBytes=rx_bytes), 'counter_conflict')
                return {'fault': 'meter_overrun', 'reservationRetained': True, 'replay': True}
            if g['status'] == 'settled':
                require((g['txBytes'], g['rxBytes']) == (tx_bytes, rx_bytes), 'counter_conflict')
                return {'replay': True}
            if tx_bytes + rx_bytes > g['maxBytes']:
                # Persist a latched fault; raising would roll back the stop.
                g['reportedOverrun'] = dict(txBytes=tx_bytes, rxBytes=rx_bytes)
                s['fault'] = 'meter_overrun'
                s['enabled'] = False
                self._invalidate(s)
                return {'fault': 'meter_overrun', 'reservationRetained': True}
            g.update(status='settled', txBytes=tx_bytes, rxBytes=rx_bytes)
            s['txBytes'] += tx_bytes
            s['rxBytes'] += rx_bytes
            s['costUpperMinor'] += g['costUpperMinor']
            client = s['clients'][g['clientId']]
            client['txBytes'] += tx_bytes
            client['rxBytes'] += rx_bytes
            return {'replay': False, 'invoiceVerified': False}
        return self._change(revision, now, mutate)

    def snapshot(self, now):
        number(now)
        with self._db() as db:
            s = self._read(db)
        held = self._held(s)
        bytes_left = s['policy']['byteCap'] - s['txBytes'] - s['rxBytes'] - sum(g['maxBytes'] for g in held)
        cost_left = s['policy']['costCapMinor'] - s['costUpperMinor'] - sum(g['costUpperMinor'] for g in held)
        next_reason = ('period_record_limit' if len(s['grants']) >= 4096 else None) or self._reason(s, now) or ('byte_cap' if bytes_left == 0 else
                      'cost_cap' if cost_left < s['policy']['blockPriceMinor'] + s['policy']['grantFeeMinor'] else None)
        s['summary'] = dict(reason=self._reason(s, now), nextGrantBlockReason=next_reason,
                            unreservedBytes=bytes_left, unreservedCostMinor=cost_left,
                            connectedClientIds=(s['observation']['connectedClientIds'] if s['observation'] and s['observation']['observedAt'] <= now < s['observation']['validUntil'] else None),
                            reservedBytes=sum(g['maxBytes'] for g in held),
                            reservedCostMinor=sum(g['costUpperMinor'] for g in held),
                            observedBytes=s['txBytes'] + s['rxBytes'], invoiceVerified=False,
                            physicalAccepted=False, adapterConnected=False)
        return s
