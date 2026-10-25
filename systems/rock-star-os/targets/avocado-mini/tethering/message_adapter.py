"""Bounded asynchronous message protocol. Internal authenticated Broker API only.

No modem driver or public IPC. Real transports must enforce the supplied grant
for ALL traffic and expiry, authenticate/encrypt their path, and never retry on
our behalf. The reference transport is deliberately offline. Delivery is not si
execution or a final invoice. Private storage must not be rolled back/reset.
"""
import base64
import copy
import fcntl
import hashlib
import hmac
import json
import os
import threading
from contextlib import contextmanager

from controller import Controller, fields, identity, number, require, validate_policy
from network_quota import canonical, digest, signature, strict_object


def validate_profile(p):
    fields(p, 'profileId region senderId recipientId maxWireBytes maxAckBytes overheadBytes maxMessageBytes maxQueueBytes maxRecords maxAttempts retrySeconds maxTtlSeconds')
    for name in ('profileId', 'senderId', 'recipientId'):
        identity(p[name])
    require(p['region'] in ('JP', 'US') and p['senderId'] != p['recipientId'], 'invalid_route')
    number(p['maxWireBytes'], 768, 65536)
    number(p['maxAckBytes'], 512, 4096)
    number(p['overheadBytes'], 0, 65536)
    number(p['maxMessageBytes'], 1, 65536)
    number(p['maxQueueBytes'], p['maxMessageBytes'], 1048576)
    number(p['maxRecords'], 1, 128)
    number(p['maxAttempts'], 1, 8)
    number(p['retrySeconds'], 1, 3600)
    number(p['maxTtlSeconds'], 1, 86400)


class Codec:
    def __init__(self, profile, policy, key):
        validate_profile(profile)
        validate_policy(policy)
        require(type(key) is bytes and len(key) >= 32, 'invalid_message_key')
        require(profile['region'] == policy['region'], 'region_mismatch')
        self.p, self.key = copy.deepcopy(profile), key
        self.period_expires = policy['expiresAt']
        # Country, account, currency, tariff, period, peer, wire limits all pinned.
        self.binding = digest(dict(profile=profile, policy=policy))

    def pack(self, kind, body):
        return canonical(dict(body=body, signature=signature(self.key, kind, body)))

    def unpack(self, kind, raw, limit):
        require(type(raw) is bytes and len(raw) <= limit, 'wire_limit')
        value = json.loads(raw, object_pairs_hook=strict_object)
        fields(value, 'body signature')
        require(type(value['signature']) is str and
                hmac.compare_digest(value['signature'], signature(self.key, kind, value['body'])), 'message_auth')
        return value['body']

    def frame(self, request, index, attempt):
        return self.pack('mini-message/1', dict(binding=self.binding, requestId=request['id'],
            sender=self.p['senderId'], recipient=self.p['recipientId'], kind=request['kind'],
            expiresAt=request['expiresAt'], sha256=request['sha256'], size=request['size'],
            total=len(request['chunks']), index=index, attempt=attempt, data=request['chunks'][index]))

    def chunks(self, request_id, kind, payload, expires):
        require(type(payload) is bytes and 0 < len(payload) <= self.p['maxMessageBytes'], 'message_size')
        r = dict(id=identity(request_id), kind=kind, expiresAt=expires,
                 sha256=hashlib.sha256(payload).hexdigest(), size=len(payload), chunks=[''])
        require(kind in ('si', 'message', 'file'), 'message_kind')
        # Size the exact authenticated JSON/base64 envelope using worst-case
        # indices, attempt ID and total. No payload-only MTU assumption.
        probe = json.loads(self.frame(r, 0, 'a' * 64))['body']
        probe.update(total=4096, index=4095)
        capacity = ((self.p['maxWireBytes'] - len(self.pack('mini-message/1', probe))) // 4) * 3
        require(capacity > 0, 'envelope_too_large')
        r['chunks'] = [base64.b64encode(payload[i:i+capacity]).decode() for i in range(0, len(payload), capacity)]
        require(len(r['chunks']) <= 4096, 'chunk_limit')
        return r


class MessageAdapter:
    """Single immutable country/period profile sharing the tethering ledger.

    Caller establishes authenticated owner/client via Broker/AP. mark_link is a
    trusted modem capability observation, not a request field. Startup requires
    recover(), fresh Controller observation, enable(), and mark_link().
    """
    def __init__(self, controller, profile, key, network, transport, clock):
        self.c, self.network, self.transport, self.clock = controller, network, transport, clock
        self.mutex = threading.RLock()
        self.in_operation = False
        policy = controller.snapshot(number(clock()))['policy']
        require(network.policy == policy, 'network_policy_mismatch')
        require(network.directory.resolve() == (controller.directory / 'network').resolve(), 'network_storage_mismatch')
        self.codec = Codec(profile, policy, key)
        self.p = self.codec.p
        self.lock_path = controller.directory / 'messages.lock'
        # Same lifetime ownership lock as LinuxGate: do not race its mutable
        # network journal. Switching modes retains the SAME ledger/reservations.
        self.service_lock = os.open(controller.directory / 'lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            st = os.fstat(self.service_lock)
            require(st.st_uid == os.getuid() and st.st_mode & 0o077 == 0, 'unsafe_lock')
            fcntl.flock(self.service_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self._lock(), self.c._db() as db:
                db.execute('BEGIN IMMEDIATE')
                db.execute('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)')
                row = db.execute('SELECT body FROM messages').fetchone()
                if row is None:
                    q = dict(binding=self.codec.binding, keyHash=hashlib.sha256(key).hexdigest(), linkEpoch=None, records={})
                    db.execute('INSERT INTO messages VALUES(1,?)', (json.dumps(q),))
                q = self._load(db)
                s = self.c._read(db)
                s.update(enabled=False, observation=None, dockId=None, placeScopeValid=False)
                self.c._invalidate(s)
                s['revision'] += 1
                q['linkEpoch'] = None
                db.execute('UPDATE state SET body=? WHERE id=1', (json.dumps(s),))
                db.execute('UPDATE messages SET body=? WHERE id=1', (json.dumps(q),))
        except BaseException:
            os.close(self.service_lock)
            self.service_lock = None
            raise

    def shutdown(self):
        with self.mutex:
            require(not self.in_operation, 'message_api_reentry')
            if self.service_lock is not None:
                try:
                    snapshot = self.c.snapshot(number(self.clock()))
                    self.recover(snapshot['policy']['ownerId'], snapshot['revision'])
                finally:
                    os.close(self.service_lock)
                    self.service_lock = None

    @contextmanager
    def _lock(self):
        with self.mutex:
            require(not self.in_operation, 'message_api_reentry')
            require(self.service_lock is not None, 'message_service_closed')
            fd = os.open(self.lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            try:
                st = os.fstat(fd)
                require(st.st_uid == os.getuid() and st.st_mode & 0o077 == 0, 'unsafe_lock')
                fcntl.flock(fd, fcntl.LOCK_EX)
                require(self.service_lock is not None, 'message_service_closed')
                self.in_operation = True
                yield
            finally:
                self.in_operation = False
                os.close(fd)

    def owner_command(self, owner, revision, command):
        number(revision)
        with self._lock():
            self.c.owner_command(owner, revision, command, number(self.clock()))
            result = self._change(owner, None, self._purge)
            if command['op'] in ('disable', 'revoke'):
                result['providerUnknown'] = self._close_pending()
            return result

    def observe(self, owner, revision, observation):
        number(revision)
        with self._lock():
            require(owner == self.c.snapshot(number(self.clock()))['policy']['ownerId'], 'owner_mismatch')
            return self.c.observe(revision, observation, number(self.clock()))

    def attachment(self, owner, revision, dock_id):
        number(revision)
        with self._lock():
            require(owner == self.c.snapshot(number(self.clock()))['policy']['ownerId'], 'owner_mismatch')
            result = self.c.attachment(revision, dock_id, number(self.clock()))
            result['providerUnknown'] = self._close_pending()
            return result

    def _close_pending(self):
        unknown = []
        try:
            ids = self.network.pending_ids()
        except Exception:
            return ['journal_unknown']
        for grant_id in ids:
            try:
                self.network.close(grant_id)
            except Exception:
                unknown.append(grant_id)
        return unknown

    def _load(self, db):
        q = json.loads(db.execute('SELECT body FROM messages WHERE id=1').fetchone()[0])
        require(q['binding'] == self.codec.binding and q['keyHash'] == hashlib.sha256(self.codec.key).hexdigest(), 'message_profile_changed')
        return q

    def _change(self, owner, revision, mutate):
        now = number(self.clock())
        with self.c._db() as db:
            db.execute('BEGIN IMMEDIATE')
            s, q = self.c._read(db), self._load(db)
            require(owner == s['policy']['ownerId'], 'owner_mismatch')
            require(revision is None or revision == s['revision'], 'revision_conflict')
            require(now >= s['lastTime'], 'clock_regressed')
            result = mutate(s, q, now)
            s['lastTime'], s['revision'] = now, s['revision'] + 1
            db.execute('UPDATE state SET body=? WHERE id=1', (json.dumps(s),))
            db.execute('UPDATE messages SET body=? WHERE id=1', (json.dumps(q),))
        return dict(revision=s['revision'], result=result)

    def _ready(self, s, q, now, client):
        reason = self.c._base_reason(s, now)
        require(reason is None, reason)
        require(q['linkEpoch'] == s['epoch'], 'message_link_unobserved')
        require(client in s['clients'] and s['clients'][client]['allowed'], 'client_denied')
        require(client in s['observation']['connectedClientIds'], 'client_disconnected')

    @staticmethod
    def _purge(s, q, now):
        for r in q['records'].values():
            client = s['clients'].get(r['client'], {})
            denied = not client.get('allowed', False) or client.get('permissionEpoch', 0) != r['permissionEpoch']
            if now >= r['expiresAt'] or now >= s['policy']['expiresAt'] or denied:
                r['chunks'] = []
                r['state'] = 'revoked' if denied else 'expired'
            # Accounting/idempotency tombstones never return quota or free record
            # slots. Stop at finite period capacity; no automatic period rollover.

    def sweep(self, owner):
        with self._lock():
            return self._change(owner, None, self._purge)

    def enqueue(self, owner, revision, client, request_id, kind, payload, ttl):
        number(revision)
        identity(client); identity(request_id); number(ttl, 1, self.p['maxTtlSeconds'])
        with self._lock():
            def add(s, q, now):
                require(now < s['policy']['expiresAt'], 'approval_expired')
                require(client in s['clients'] and s['clients'][client]['allowed'], 'client_denied')
                r = self.codec.chunks(request_id, kind, payload, min(now + ttl, s['policy']['expiresAt']))
                # Replays compare the original inputs, not a newly extended TTL.
                fingerprint = digest(dict(client=client, kind=kind, sha256=r['sha256'], size=r['size'], ttl=ttl))
                prior = q['records'].get(request_id)
                if prior:
                    require(prior['fingerprint'] == fingerprint, 'idempotency_conflict')
                    return dict(requestId=request_id, state=prior['state'], replay=True)
                self._purge(s, q, now)
                require(len(q['records']) < self.p['maxRecords'], 'queue_record_limit')
                used = sum(r['size'] for r in q['records'].values() if r['chunks'])
                require(used + len(payload) <= self.p['maxQueueBytes'], 'queue_bytes')
                r.update(client=client, permissionEpoch=s['clients'][client].get('permissionEpoch', 0), fingerprint=fingerprint, state='queued',
                         tries=[0]*len(r['chunks']), acked=[False]*len(r['chunks']), nextAt=now, attempts=[])
                q['records'][request_id] = r
                return dict(requestId=request_id, state='queued', replay=False)
            return self._change(owner, revision, add)

    def mark_link(self, owner, revision, observed_profile):
        number(revision)
        with self._lock():
            def mark(s, q, now):
                require(observed_profile == self.codec.binding, 'message_route_mismatch')
                require(self.c._base_reason(s, now) is None, 'link_unavailable')
                q['linkEpoch'] = s['epoch']
            return self._change(owner, revision, mark)

    def recover(self, owner, revision):
        number(revision)
        with self._lock():
            def recover(s, q, now):
                s.update(enabled=False, observation=None, dockId=None, placeScopeValid=False)
                self.c._invalidate(s)
                q['linkEpoch'] = None
                self._purge(s, q, now)
                # Attempts committed before interruption remain charged/unknown.
            result = self._change(owner, revision, recover)
            result['providerUnknown'] = self._close_pending()
            return result

    def pending(self, owner):
        """Private scheduler view; never expose client bindings to public status."""
        self.sweep(owner)
        with self._lock(), self.c._db() as db:
            return [dict(requestId=k, clientId=r['client'], nextAt=r['nextAt'])
                    for k, r in self._load(db)['records'].items() if r['state'] == 'queued']

    def invalidate_link(self, owner):
        """Trusted observer failure closes link admission without losing consent."""
        with self._lock():
            def invalidate(s, q, now):
                s['observation'] = None
                self.c._invalidate(s)
                q['linkEpoch'] = None
                self._purge(s, q, now)
            return self._change(owner, None, invalidate)

    def dispatch(self, owner, revision, request_id, *, authorize=None):
        number(revision)
        identity(request_id)
        with self._lock():
            def prepare(s, q, now):
                self._purge(s, q, now)
                r = q['records'].get(request_id)
                require(r is not None, 'unknown_message')
                if r['state'] != 'queued':
                    return dict(state=r['state'])
                self._ready(s, q, now, r['client'])
                if authorize is not None:
                    authorize(r['client'])
                require(now >= r['nextAt'], 'retry_not_due')
                index = next(i for i, ack in enumerate(r['acked']) if not ack)
                if r['tries'][index] >= self.p['maxAttempts']:
                    r.update(state='retry_exhausted', chunks=[])
                    return dict(state=r['state'])
                attempt = digest(dict(binding=q['binding'], requestId=request_id, index=index, number=r['tries'][index]+1))
                frame = self.codec.frame(r, index, attempt)
                require(len(frame) <= self.p['maxWireBytes'], 'wire_limit')
                bound = len(frame) + self.p['maxAckBytes'] + self.p['overheadBytes']
                number(bound, 1, s['policy']['maxGrantBytes'])
                grant = self.c._reserve(s, attempt, r['client'], bound, now)['grant']
                grant['expiresAt'] = min(grant['expiresAt'], r['expiresAt'])
                s['grants'][attempt] = copy.deepcopy(grant)
                r['tries'][index] += 1
                r['nextAt'] = now + self.p['retrySeconds']
                r['attempts'].append(dict(id=attempt, state='unknown', index=index))
                return dict(state='attempt', grant=grant, frame=frame, index=index)
            prepared = self._change(owner, revision, prepare)['result']
            if prepared['state'] != 'attempt':
                return prepared
            grant, frame = prepared['grant'], prepared['frame']
            try:
                self.network.reserve(grant)
                def recheck(s, q, now):
                    r = q['records'][request_id]
                    self._ready(s, q, now, r['client'])
                    require(s['epoch'] == grant['epoch'] and now < grant['expiresAt'] and now < r['expiresAt'], 'grant_expired_or_fenced')
                self._change(owner, None, recheck)
                if authorize is not None:
                    authorize(grant['clientId'])
                    # AP/Broker checks can themselves take time. Recheck the
                    # local message/grant lease after their final I/O as well.
                    self._change(owner, None, recheck)
                raw = self.transport.exchange(frame, copy.deepcopy(grant))
                ack = self.codec.unpack('mini-message-ack/1', raw, self.p['maxAckBytes'])
                fields(ack, 'binding frameSha256 requestId index delivered')
                require(ack['binding'] == self.codec.binding and ack['frameSha256'] == hashlib.sha256(frame).hexdigest()
                        and ack['requestId'] == request_id and ack['index'] == prepared['index']
                        and type(ack['index']) is int and type(ack['delivered']) is bool, 'ack_binding')
                def finish(s, q, now):
                    r = q['records'][request_id]
                    self._purge(s, q, now)
                    require(now < grant['expiresAt'] and s['epoch'] == grant['epoch'], 'late_ack')
                    require(r['state'] == 'queued', 'message_closed')
                    r['acked'][prepared['index']] = True
                    r['attempts'][-1]['state'] = 'acknowledged'
                    if all(r['acked']) and ack['delivered']:
                        r.update(state='delivered', chunks=[])
                    elif all(r['acked']):
                        # Last chunk stored without full digest-confirmed delivery
                        # cannot become delivery. Retry it within the same bounds.
                        r['acked'][prepared['index']] = False
                    return dict(state=r['state'], applicationCompleted=False, invoiceVerified=False)
                return self._change(owner, None, finish)['result']
            except Exception:
                # Timeout/invalid ACK never refunds or silently retries. A later
                # explicit scheduler step gets a NEW reservation and same chunk.
                return dict(state='unknown', reservationRetained=True, applicationCompleted=False)
            finally:
                try:
                    self.network.close(grant['grantId'])
                except Exception:
                    pass  # NetworkQuota retains its unknown/held journal.

    def snapshot(self, owner):
        self.sweep(owner)
        with self._lock(), self.c._db() as db:
            q = self._load(db)
            # No plaintext, key, envelope, digest or destination identifiers.
            return {k: dict(state=r['state'], size=r['size'], expiresAt=r['expiresAt'],
                            attempts=len(r['attempts']), acknowledged=sum(r['acked'])) for k, r in q['records'].items()}


class Reassembler:
    """Authenticated bounded inbox; delivery receipt never executes application work.

    The caller bounds the physical receive/control path separately. take() needs
    authenticated recipient context. Tombstones prevent delivery replay even after
    payload removal; a fresh country/period is a separately authorized database.
    """
    def __init__(self, directory, profile, policy, key, clock):
        self.store, self.codec, self.clock = Controller(directory), Codec(profile, policy, key), clock
        self.p = self.codec.p
        with self.store._db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)')
            db.execute('INSERT OR IGNORE INTO inbox VALUES(1,?)', (json.dumps(dict(binding=self.codec.binding,
                keyHash=hashlib.sha256(key).hexdigest(), lastTime=0, records={})),))

    @contextmanager
    def _db(self):
        now = number(self.clock())
        with self.store._db() as db:
            db.execute('BEGIN IMMEDIATE')
            s = json.loads(db.execute('SELECT body FROM inbox').fetchone()[0])
            require(s['binding'] == self.codec.binding and s['keyHash'] == hashlib.sha256(self.codec.key).hexdigest(), 'message_profile_changed')
            require(now >= s['lastTime'], 'clock_regressed')
            s['lastTime'] = now
            yield s, now
            db.execute('UPDATE inbox SET body=? WHERE id=1', (json.dumps(s),))

    def sweep(self):
        with self._db() as (s, now):
            for r in s['records'].values():
                if now >= r['expiresAt']:
                    r.update(parts={}, state='expired')

    def receive(self, raw):
        self.sweep()
        b = self.codec.unpack('mini-message/1', raw, self.p['maxWireBytes'])
        fields(b, 'binding requestId sender recipient kind expiresAt sha256 size total index attempt data')
        identity(b['requestId']); identity(b['attempt'])
        number(b['expiresAt']); number(b['size'], 1, self.p['maxMessageBytes'])
        number(b['total'], 1, 4096); number(b['index'], 0, b['total']-1)
        require(b['binding'] == self.codec.binding and b['sender'] == self.p['senderId']
                and b['recipient'] == self.p['recipientId'] and b['kind'] in ('si','message','file'), 'message_route_mismatch')
        require(type(b['sha256']) is str and len(b['sha256']) == 64, 'message_digest')
        require(type(b['data']) is str, 'chunk_encoding')
        data = base64.b64decode(b['data'], validate=True)
        require(0 < len(data) <= b['size'], 'chunk_size')
        meta = {k: b[k] for k in ('kind','expiresAt','sha256','size','total')}
        with self._db() as (s, now):
            require(now < b['expiresAt'] <= min(now + self.p['maxTtlSeconds'], self.codec.period_expires), 'message_expired')
            r = s['records'].get(b['requestId'])
            if r is None:
                require(len(s['records']) < self.p['maxRecords'], 'inbox_record_limit')
                used = sum(r['size'] for r in s['records'].values() if r['state'] in ('partial','delivered'))
                require(used + b['size'] <= self.p['maxQueueBytes'], 'inbox_bytes')
                r = dict(**meta, state='partial', parts={})
                s['records'][b['requestId']] = r
            require(all(r[k] == v for k,v in meta.items()), 'chunk_conflict')
            if r['state'] == 'partial':
                prior = r['parts'].get(str(b['index']))
                require(prior is None or prior == b['data'], 'chunk_conflict')
                r['parts'][str(b['index'])] = b['data']
                require(sum(len(base64.b64decode(v)) for v in r['parts'].values()) <= r['size'], 'reassembly_size')
                if len(r['parts']) == r['total']:
                    payload = b''.join(base64.b64decode(r['parts'][str(i)]) for i in range(r['total']))
                    require(len(payload) == r['size'] and hashlib.sha256(payload).hexdigest() == r['sha256'], 'reassembly_digest')
                    r['state'] = 'delivered'
            delivered = r['state'] in ('delivered','taken')
        ack = self.codec.pack('mini-message-ack/1', dict(binding=self.codec.binding,
            frameSha256=hashlib.sha256(raw).hexdigest(), requestId=b['requestId'], index=b['index'], delivered=delivered))
        require(len(ack) <= self.p['maxAckBytes'], 'ack_limit')
        return ack

    def take(self, authenticated_recipient, request_id):
        self.sweep()
        require(authenticated_recipient == self.p['recipientId'], 'recipient_denied')
        with self._db() as (s, now):
            r = s['records'].get(identity(request_id))
            require(r is not None and r['state'] == 'delivered', 'not_deliverable')
            payload = b''.join(base64.b64decode(r['parts'][str(i)]) for i in range(r['total']))
            return payload

    def acknowledge(self, authenticated_recipient, request_id, durable_receipt_id):
        """Trusted consumer confirms durable import keyed by request ID/digest.

        This confirms handoff only, never si/Tool execution. Consumer must commit
        idempotently before calling; read/ACK loss can safely replay that import.
        """
        self.sweep()
        require(authenticated_recipient == self.p['recipientId'], 'recipient_denied')
        identity(durable_receipt_id)
        with self._db() as (s, now):
            r = s['records'].get(identity(request_id))
            require(r is not None and r['state'] in ('delivered', 'taken'), 'not_deliverable')
            if r['state'] == 'taken':
                require(r['receipt'] == durable_receipt_id, 'receipt_conflict')
            else:
                r.update(parts={}, state='taken', receipt=durable_receipt_id)
