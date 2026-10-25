"""Mini service: existing Broker identity, AP authentication, finite scheduling.

Trusted bootstrap owns the ServiceAccessController, AP, modem observation and
transport. No owner, observation, price, route, shell or provider URL comes from
request JSON. The same ServiceAccess instance must be shared with fulfillment.
"""
import base64
from contextlib import contextmanager
import json
import os
from pathlib import Path
import socket
import stat
import threading
import time

from controller import require, number, fields, Rejected
from network_quota import canonical, strict_object
from mcp_broker.service_access import ServiceAccessPrincipalAdapter

MAX_REQUEST = 100000


class MessageService:
    def __init__(self, adapter, ap, authority, consumer, observe, *, per_tick=2):
        number(per_tick, 1, 8)
        self.a, self.ap, self.observe = adapter, ap, observe
        self.principals = ServiceAccessPrincipalAdapter(authority, authority_id=authority.authority_id)
        # Reverse worker lookup is configured by the existing Broker adapter;
        # it contains no bearer token. Every worker claim re-enters guard.
        require(consumer in self.principals._aliases, 'service_consumer_unknown')
        self.principal = self.principals._aliases[consumer]
        self.consumer, self.authority_id = consumer, authority.authority_id
        self.policy = adapter.c.snapshot(adapter.clock())['policy']
        self.owner = self.policy['ownerId']
        self._binding(authority.snapshot(consumer))
        require(ap.directory.resolve() == (adapter.c.directory / 'ap').resolve(), 'ap_storage_mismatch')
        self.per_tick, self.cursor = per_tick, ''
        self.mutex, self.busy, self.closed = threading.RLock(), False, False
        # Startup never inherits an enabled AP or old satellite observation.
        self.ap.halt()
        self.a.recover(self.owner, self.revision)

    @property
    def revision(self):
        return self.a.c.snapshot(self.a.clock())['revision']

    def _binding(self, state):
        require(state['owner_ref'] == self.owner and state['device_ref'] == self.policy['deviceId'],
                'service_owner_device_mismatch')

    @contextmanager
    def _operation(self):
        with self.mutex:
            require(not self.closed and not self.busy, 'service_closed_or_reentry')
            self.busy = True
            try:
                yield
            finally:
                self.busy = False

    @contextmanager
    def _guard(self, principal, action):
        require(principal == self.principal, 'service_principal_mismatch')
        with self.principals.guard(principal, action) as state:
            self._binding(state)
            yield

    def request(self, authorization, request):
        require(type(request) is dict and len(canonical(request)) <= MAX_REQUEST, 'request_limit')
        principal = self.principals.authenticate(dict(authority_id=self.authority_id,
            consumer_id=self.consumer, authorization=authorization))
        op = request.get('op')
        actions = {'status':'recover', 'stop':'disconnect', 'revoke':'disconnect',
                   'enable':'connect', 'enroll':'prepare', 'enqueue':'submit'}
        require(type(op) is str and op in actions, 'unknown_service_operation')
        with self._operation(), self._guard(principal, actions[op]):
            if op == 'status':
                fields(request, 'op')
                records = self.a.snapshot(self.owner)
                return dict(revision=self.revision, messages=records)
            number(request.get('revision'))
            require(request['revision'] == self.revision, 'revision_conflict')
            if op == 'enqueue':
                fields(request, 'op revision clientId requestId kind payload ttl')
                require(type(request['payload']) is str, 'invalid_payload')
                try:
                    payload = base64.b64decode(request['payload'], validate=True)
                except (ValueError, TypeError):
                    raise Rejected('invalid_payload')
                self.ap.authenticated(request['clientId'])
                return self.a.enqueue(self.owner, request['revision'], request['clientId'],
                    request['requestId'], request['kind'], payload, request['ttl'])
            if op == 'enroll':
                fields(request, 'op revision client byteCap')
                client = request['client']
                require(type(client) is dict, 'invalid_client')
                # Re-enrollment invalidates all earlier records for this client,
                # even if the owner later chooses the same MAC/IP binding.
                state = self.a.c.snapshot(self.a.clock())
                if client.get('clientId') in state['clients']:
                    require(request['byteCap'] == state['clients'][client['clientId']]['byteCap'], 'immutable_client_cap')
                    self.a.owner_command(self.owner, self.revision,
                        dict(op='revoke', clientId=client['clientId']))
                    self.ap.revoke(client['clientId'])
                    command = dict(op='reallow', clientId=client['clientId'])
                else:
                    command = dict(op='allow', clientId=client.get('clientId'), byteCap=request['byteCap'])
                result = self.a.owner_command(self.owner, self.revision, command)
                try:
                    key = self.ap.provision(client['clientId'], client)
                except BaseException:
                    self._stop()
                    raise
                return dict(revision=result['revision'], enrollmentKey=key)
            if op == 'enable':
                fields(request, 'op revision')
                try:
                    self.a.network.account()
                    self.ap.enable()
                    return self.a.owner_command(self.owner, self.revision, dict(op='enable'))
                except BaseException:
                    self._stop()
                    raise
            if op == 'revoke':
                fields(request, 'op revision clientId')
                # A failed AP stop must not leave local permission enabled.
                try:
                    return self.a.owner_command(self.owner, self.revision,
                        dict(op='revoke', clientId=request['clientId']))
                finally:
                    try:
                        self.ap.revoke(request['clientId'])
                    finally:
                        self.ap.halt()
            fields(request, 'op revision')
            return self._stop()

    def _stop(self):
        try:
            return self.a.owner_command(self.owner, self.revision, dict(op='disable'))
        finally:
            self.ap.halt()

    def tick(self):
        """Sweep even offline/unauthorized; at most per_tick different records.

        Never sleeps or loops waiting for a satellite. Trusted I/O adapters must
        implement finite deadlines. Failed attempts consume existing reservations.
        """
        with self._operation():
            pending = self.a.pending(self.owner)
            if self.a.clock() >= self.policy['expiresAt']:
                self._stop()
                return dict(attempted=0, state='approval_expired')
            if not self.a.c.snapshot(self.a.clock())['enabled']:
                return dict(attempted=0, state='disabled')
            try:
                with self._guard(self.principal, 'start'):
                    self.a.network.account()
                    observation, binding = self.observe()
                    connected = []
                    for client in self.ap.client_ids():
                        try:
                            self.ap.authenticated(client)
                            connected.append(client)
                        except Rejected:
                            pass
                    # Readiness belongs to trusted hardware/provider observers.
                    # AP identity alone cannot establish meter/power/hard-quota.
                    observation = dict(observation, connectedClientIds=connected)
                    self.a.observe(self.owner, self.revision, observation)
                    self.a.mark_link(self.owner, self.revision, binding)
            except Exception:
                # Expire the previous observation immediately; a failed refresh
                # must never reuse yesterday's registered-link observation.
                self.a.invalidate_link(self.owner)
                return dict(attempted=0, state='unavailable')
            pending = sorted(pending, key=lambda r:r['requestId'])
            pending = [r for r in pending if r['requestId'] > self.cursor] + [
                r for r in pending if r['requestId'] <= self.cursor]
            attempted = 0
            for record in pending:
                if attempted >= self.per_tick:
                    break
                if record['nextAt'] > self.a.clock():
                    continue
                self.cursor = record['requestId']
                attempted += 1
                try:
                    with self._guard(self.principal, 'start'):
                        expected = self.ap.authenticated(record['clientId'])
                        def authorize(client):
                            # The guard lock serializes changes, but time-based
                            # eligibility may expire during provider/AP I/O.
                            require(self.ap.authenticated(client) == expected, 'ap_binding_changed')
                            with self._guard(self.principal, 'start'):
                                pass
                        self.a.dispatch(self.owner, self.revision, record['requestId'], authorize=authorize)
                except Exception:
                    # A denied client cannot starve subsequent records. Admission
                    # failures do not become success, refunds or hidden retries.
                    continue
            return dict(attempted=attempted, state='processed')

    def close(self):
        with self.mutex:
            if self.closed:
                return
            require(not self.busy, 'service_reentry')
            try:
                self._stop()
            finally:
                self.closed = True
                self.a.shutdown()


def read_packet(connection, limit, deadline):
    data = bytearray()
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('service_io_deadline')
        connection.settimeout(remaining)
        chunk = connection.recv(min(4096, limit + 1 - len(data)))
        require(bool(chunk), 'incomplete_service_packet')
        data.extend(chunk)
        require(len(data) <= limit, 'service_packet_limit')
        if b'\n' in chunk:
            require(data[-1:] == b'\n' and data.count(b'\n') == 1, 'service_packet_trailing_data')
            return json.loads(data, object_pairs_hook=strict_object)


def serve(service, listener, stop, *, max_ticks=3600, interval=1):
    """Single-request Unix loop; trusted bootstrap binds a private 0600 socket.

    Finite lifetime ends disabled; supervisor restart needs fresh owner enable.
    No root shell, externally supplied factory, HTTP endpoint or real RF setup.
    """
    try:
        number(max_ticks, 1, 86400)
        number(interval, 1, 60)
        require(listener.family == socket.AF_UNIX, 'local_socket_required')
        path = Path(listener.getsockname())
        info, parent = path.lstat(), path.parent.lstat()
        require(stat.S_ISSOCK(info.st_mode) and info.st_uid == os.geteuid()
                and stat.S_IMODE(info.st_mode) == 0o600
                and stat.S_ISDIR(parent.st_mode) and parent.st_uid == os.geteuid()
                and stat.S_IMODE(parent.st_mode) == 0o700, 'private_service_socket_required')
        for _ in range(max_ticks):
            if stop.is_set():
                break
            deadline = time.monotonic() + interval
            service.tick()
            listener.settimeout(max(.001, deadline - time.monotonic()))
            try:
                connection, _ = listener.accept()
            except socket.timeout:
                continue
            with connection:
                try:
                    envelope = read_packet(connection, MAX_REQUEST, time.monotonic() + 1)
                    fields(envelope, 'authorization request')
                    result = service.request(envelope['authorization'], envelope['request'])
                    response = dict(ok=True, result=result)
                except Exception:
                    response = dict(ok=False, error='request_rejected')
                try:
                    connection.settimeout(1)
                    connection.sendall(canonical(response) + b'\n')
                except OSError:
                    pass
    finally:
        service.close()


class LocalModemTransport:
    """Bounded local bridge to a separately implemented modem supervisor.

    Uses the existing OS framed Unix transport (peer UID check on Linux), with
    no redirects, hidden retry, shell or caller-selected endpoint. The receiver
    must confirm the matching provider reservation before radio I/O; the local
    grant dictionary is not itself a provider signature. A timeout remains
    an unknown attempt; killing a socket does not prove that RF has stopped.
    """
    def __init__(self, path, clock, *, timeout=2, server_uid=None):
        from runner.transport import UnixRunnerTransport
        number(timeout, 1, 3)
        self.path, self.clock, self.timeout, self.server_uid = path, clock, timeout, server_uid
        self._transport = UnixRunnerTransport

    def exchange(self, frame, grant):
        remaining = grant['expiresAt'] - self.clock()
        require(remaining >= 1 and type(frame) is bytes and len(frame) <= 65536, 'modem_grant_or_frame_invalid')
        value = self._transport(self.path, timeout=min(self.timeout, remaining), server_uid=self.server_uid).exchange(
            dict(schema='mini-local-modem/1', grant=grant, frame=base64.b64encode(frame).decode()))
        fields(value, 'schema ack')
        require(value['schema'] == 'mini-local-modem/1' and type(value['ack']) is str
                and len(value['ack']) <= 5464, 'modem_ack_invalid')
        try:
            return base64.b64decode(value['ack'], validate=True)
        except (ValueError, TypeError):
            raise Rejected('modem_ack_invalid')
