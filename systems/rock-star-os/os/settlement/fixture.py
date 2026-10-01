"""Explicit public, loopback-only provider and identity fixtures; no real funds.

HMAC provides a real verification path using the existing public Wallet fixture
text. It does NOT establish identity, KYC, payment service eligibility or secrecy.
"""
from contextlib import closing, contextmanager
import http.client
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
from pathlib import Path
import socket
import sqlite3
import threading
import time
import urllib.parse

from entitlement.protocol import PUBLIC_TOKENS
from .protocol import (PROVIDER, MAX_BYTES, Denied, Unavailable, amount, canonical,
                       decode, digest, event_payload, fields, identifier, signed, verified)

DEVELOPERS = {'alice': 'fixture-developer-alice', 'bob': 'fixture-developer-bob'}
BINDINGS = {DEVELOPERS['alice']: 'fixture-provider-account-alice', DEVELOPERS['bob']: 'fixture-provider-account-bob'}


class FixtureIdentity:
    def __init__(self):
        self.mutex = threading.RLock(); self.eligible = set(DEVELOPERS.values())

    def authenticate(self, token):
        import hmac
        if type(token) is str and token.isascii() and 1 <= len(token) <= 256:
            for actor, developer in DEVELOPERS.items():
                if hmac.compare_digest(token, PUBLIC_TOKENS[actor]): return developer
        raise Denied('unauthenticated public developer fixture')

    @contextmanager
    def guard(self, developer, action):
        with self.mutex:
            if developer not in DEVELOPERS.values() or action not in ('reserve', 'start', 'recover'):
                raise Denied('fixture principal or operation denied')
            if action != 'recover' and developer not in self.eligible:
                raise Denied('current developer payout eligibility denied')
            yield

    def set_eligible(self, developer, eligible):
        with self.mutex:
            if eligible: self.eligible.add(developer)
            else: self.eligible.discard(developer)


def sale_event(authority, developer, sale_id, event_id, *, gross_minor, fee_minor, kind='sale'):
    return signed(event_payload({'schema_version': 1, 'authority_id': authority, 'provider_id': PROVIDER,
        'developer_id': developer, 'provider_account': BINDINGS[developer], 'event_id': event_id,
        'kind': kind, 'currency': 'USD', 'record': {'sale_id': sale_id, 'gross_minor': gross_minor,
        'fee_minor': fee_minor, 'net_minor': gross_minor-fee_minor}}))


class FixtureProviderTransport:
    def __init__(self, origin, *, allow_public_fixture=False):
        parsed = urllib.parse.urlsplit(origin)
        if not (allow_public_fixture is True and parsed.scheme == 'http' and parsed.hostname == '127.0.0.1'
                and parsed.port and not parsed.username and not parsed.password and parsed.path in ('', '/')
                and not parsed.query and not parsed.fragment):
            raise ValueError('explicit owned 127.0.0.1 public HTTP fixture required')
        self.port = parsed.port; self.origin = f'http://127.0.0.1:{self.port}'

    def descriptor(self):
        return {'provider_id': PROVIDER, 'origin': self.origin, 'protocol': 'public-settlement-fixture/1',
                'key_fixture_sha256': digest(PUBLIC_TOKENS['wallet']), 'simulation_only': True}

    def verify(self, envelope): return verified(envelope)

    def _request(self, path, payload):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=2)
        started = time.monotonic(); timer = None
        try:
            raw = canonical(signed(payload))
            if len(raw) > MAX_BYTES: raise ValueError('request exceeds fixture limit')
            connection.connect()
            remaining = 2 - (time.monotonic() - started)
            if remaining <= 0: raise Unavailable('fixture deadline elapsed')
            sock = connection.sock
            def expire():
                if sock is not None:
                    try: sock.shutdown(socket.SHUT_RDWR)
                    except OSError: pass
            timer = threading.Timer(remaining, expire); timer.daemon = True; timer.start()
            connection.request('POST', path, raw, {'Content-Type': 'application/json', 'Connection': 'close'})
            response = connection.getresponse()
            sizes = response.headers.get_all('Content-Length', [])
            if (response.status != 200 or len(sizes) != 1 or not sizes[0].isascii() or not sizes[0].isdigit()
                    or not 0 < int(sizes[0]) <= MAX_BYTES or response.headers.get_all('Transfer-Encoding', [])
                    or response.headers.get_all('Content-Type', []) != ['application/json']):
                raise Unavailable('fixture response unavailable')
            raw = response.read(int(sizes[0])+1)
            if len(raw) != int(sizes[0]): raise Unavailable('fixture response truncated')
            return decode(raw)
        except (OSError, http.client.HTTPException, ValueError) as error:
            raise Unavailable('fixture transport outcome unknown') from error
        finally:
            if timer is not None: timer.cancel(); timer.join()
            connection.close()

    def request(self, action, intent):
        if action not in ('create', 'status'): raise ValueError('unsupported provider operation')
        return self._request('/payout/'+action, {'action': action, 'intent': intent})

    def event(self, event_id):
        identifier(event_id)
        return self._request('/events/get', {'event_id': event_id})


class FixtureProviderServer(HTTPServer):
    """Private test controls publish events and select outcomes, never HTTP admin."""
    allow_reuse_address = True
    def __init__(self, directory, *, authority_id, bindings=BINDINGS):
        self.directory = Path(directory); self.directory.mkdir(mode=0o700, parents=True, exist_ok=False)
        self.path = self.directory/'provider.sqlite3'; self.authority_id = authority_id; self.bindings = dict(bindings)
        fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600); os.close(fd)
        with closing(sqlite3.connect(self.path)) as db:
            db.executescript('CREATE TABLE events(id TEXT PRIMARY KEY,body BLOB NOT NULL); CREATE TABLE payouts(key TEXT PRIMARY KEY,digest TEXT NOT NULL,intent BLOB NOT NULL,state TEXT NOT NULL);')
        self.mutex = threading.RLock(); self.requests = []; self.drop_next_create_response = False
        self.next_state = 'paid'
        super().__init__(('127.0.0.1', 0), FixtureHandler)

    def publish(self, envelope):
        payload = event_payload(verified(envelope))
        if payload['authority_id'] != self.authority_id or self.bindings.get(payload['developer_id']) != payload['provider_account']:
            raise Denied('fixture event binding mismatch')
        raw = canonical(envelope)
        with self.mutex, closing(sqlite3.connect(self.path)) as db:
            row = db.execute('SELECT body FROM events WHERE id=?', (payload['event_id'],)).fetchone()
            if row and row[0] != raw: raise ValueError('fixture event conflict')
            db.execute('INSERT OR IGNORE INTO events VALUES(?,?)', (payload['event_id'], raw)); db.commit()

    def resolve(self, business_key, state):
        if state not in ('paid', 'failed_no_transfer'): raise ValueError('fixed terminal fixture state required')
        with self.mutex, closing(sqlite3.connect(self.path)) as db:
            db.execute("UPDATE payouts SET state=? WHERE key=? AND state='pending'", (state, business_key)); db.commit()

    def handle_payload(self, path, payload):
        if path == '/events/get':
            fields(payload, ('event_id',)); identifier(payload['event_id'])
            with self.mutex, closing(sqlite3.connect(self.path)) as db:
                row = db.execute('SELECT body FROM events WHERE id=?', (payload['event_id'],)).fetchone()
                if row is None: raise Denied('fixture event absent')
                return decode(row[0])
        fields(payload, ('action', 'intent'))
        action, intent = payload['action'], payload['intent']
        if path != '/payout/'+action or action not in ('create', 'status'): raise Denied('fixture operation denied')
        fields(intent, ('schema_version','authority_id','provider_id','developer_id','provider_account','business_key','currency','amount_minor','fee_minor'))
        if (type(intent['schema_version']) is not int or intent['schema_version'] != 1 or intent['authority_id'] != self.authority_id
                or intent['provider_id'] != PROVIDER or intent['currency'] != 'USD'
                or type(intent['fee_minor']) is not int or intent['fee_minor'] != 0
                or self.bindings.get(intent['developer_id']) != intent['provider_account']): raise Denied('fixture payout binding mismatch')
        identifier(intent['business_key']); amount(intent['amount_minor'])
        with self.mutex, closing(sqlite3.connect(self.path)) as db:
            self.requests.append({'action': action, 'business_key': intent['business_key'], 'intent_sha256': digest(intent)})
            row = db.execute('SELECT * FROM payouts WHERE key=?', (intent['business_key'],)).fetchone()
            if row and row[1] != digest(intent): raise Denied('fixture payout key changed')
            if row is None and action == 'create':
                db.execute('INSERT INTO payouts VALUES(?,?,?,?)', (intent['business_key'], digest(intent), canonical(intent), self.next_state)); db.commit()
                state = self.next_state
            else: state = row[3] if row else 'not_found'
        return signed({'schema_version': 1, 'authority_id': intent['authority_id'], 'provider_id': PROVIDER,
            'developer_id': intent['developer_id'], 'provider_account': intent['provider_account'],
            'event_id': 'result-'+digest([intent['business_key'], state]), 'kind': 'payout.result', 'currency': 'USD',
            'record': {'business_key': intent['business_key'], 'amount_minor': intent['amount_minor'], 'fee_minor': 0,
                       'paid_minor': intent['amount_minor'] if state == 'paid' else 0, 'state': state}})


class FixtureHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *_): pass
    def setup(self):
        self.request.settimeout(2); super().setup()
    def do_POST(self):
        try:
            sizes = self.headers.get_all('Content-Length', [])
            if len(sizes) != 1 or not sizes[0].isascii() or not sizes[0].isdigit() or not 0 < int(sizes[0]) <= MAX_BYTES:
                raise ValueError('invalid length')
            if self.headers.get_all('Transfer-Encoding', []) or self.headers.get_all('Content-Type', []) != ['application/json']:
                raise ValueError('invalid framing')
            raw = self.rfile.read(int(sizes[0]))
            if len(raw) != int(sizes[0]): raise ValueError('incomplete body')
            result = self.server.handle_payload(self.path, verified(decode(raw)))
            body, status = canonical(result), 200
        except Denied: body, status = b'{"error":"denied"}', 403
        except (ValueError, OSError, sqlite3.Error): body, status = b'{"error":"unavailable"}', 400
        self.send_response(status); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body))); self.send_header('Connection', 'close'); self.end_headers()
        try:
            if status == 200 and self.path == '/payout/create' and self.server.drop_next_create_response:
                self.server.drop_next_create_response = False
                self.wfile.write(body[:len(body)//2]); self.wfile.flush(); self.connection.shutdown(socket.SHUT_RDWR)
            else: self.wfile.write(body)
        except OSError: pass
        self.close_connection = True
