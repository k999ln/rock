"""Owned loopback MCP fixture. Actual text execution; NO financial effects.

Not an independent SDK conformance certification. The private SQLite receipt
contract is specific to this fixture; ordinary MCP servers need an adapter.
"""
from contextlib import closing
import hashlib
import fcntl
import io
import re
import stat
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import socket
import sqlite3
import threading
import time

from .http import VERSION, INTENT_META, MAX_BODY, MAX_INPUT, canonical, decode, ToolPolicy, identifier

PUBLIC_TOKEN = 'PUBLIC-FIXTURE-MCP-OWNER-v1'


MAX_EFFECTS = 256
MAX_STORED_BYTES = 32 * 1024 * 1024
MAX_DATABASE_BYTES = 40 * 1024 * 1024
MAX_WIRE_HISTORY = 1024
MAX_SESSIONS = 8
PROFILE_NAME = 'PROFILE.json'

SCHEMA = {
    'effects': 'CREATE TABLE effects(key TEXT PRIMARY KEY,consent_digest TEXT NOT NULL,input_sha TEXT NOT NULL,receipt TEXT NOT NULL)',
    'effect_no_update': "CREATE TRIGGER effect_no_update BEFORE UPDATE ON effects BEGIN SELECT RAISE(ABORT,'effect immutable'); END",
    'effect_no_delete': "CREATE TRIGGER effect_no_delete BEFORE DELETE ON effects BEGIN SELECT RAISE(ABORT,'effect retained'); END",
    'fixture_mode': 'CREATE TABLE fixture_mode(singleton INTEGER PRIMARY KEY CHECK(singleton=1),profile TEXT NOT NULL)',
    'mode_no_update': "CREATE TRIGGER mode_no_update BEFORE UPDATE ON fixture_mode BEGIN SELECT RAISE(ABORT,'profile immutable'); END",
    'mode_no_delete': "CREATE TRIGGER mode_no_delete BEFORE DELETE ON fixture_mode BEGIN SELECT RAISE(ABORT,'profile retained'); END",
}


def private_file(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return None
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.geteuid()
            or info.st_mode & 0o077):
        raise ValueError('fixture state must be private owned single-link regular files')
    return info


class ReceiptStore:
    """Private fixture receipts, not a payment ledger or general MCP guarantee."""
    def __init__(self, directory, *, persistent, port, profile_binding, policy):
        self.directory = Path(directory)
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise ValueError('fixture directory must be private and owned, not a symlink')
        self.path = self.directory / 'effects.sqlite3'
        self.marker = self.directory / PROFILE_NAME
        self.lock_path = self.directory / 'fixture.lock'
        self.lock = threading.RLock()
        self.fd, self.closed = None, False
        entries = {p.name for p in self.directory.iterdir()}
        self.fresh = not entries
        self.persistent = persistent
        self.profile = {'schema': 'rock-owned-mcp-provider/1', 'origin': f'http://127.0.0.1:{port}',
            'profile_binding': profile_binding, 'protocol': VERSION,
            'policy_sha256': hashlib.sha256(canonical(policy.contract())).hexdigest(),
            'token_sha256': hashlib.sha256(PUBLIC_TOKEN.encode()).hexdigest(),
            'schema_sha256': hashlib.sha256(canonical(SCHEMA)).hexdigest(),
            'max_effects': MAX_EFFECTS, 'max_stored_bytes': MAX_STORED_BYTES,
            'max_database_bytes': MAX_DATABASE_BYTES, 'financial_effects': False}
        for name in ('effects.sqlite3', 'effects.sqlite3-wal', 'effects.sqlite3-shm',
                     'effects.sqlite3-journal', PROFILE_NAME, 'fixture.lock'):
            private_file(self.directory / name)
        if persistent:
            allowed = {'effects.sqlite3', 'effects.sqlite3-wal', 'effects.sqlite3-shm',
                       'effects.sqlite3-journal', PROFILE_NAME, 'fixture.lock'}
            if not self.fresh and (not {'effects.sqlite3', PROFILE_NAME, 'fixture.lock'} <= entries or entries-allowed):
                raise ValueError('retained fixture state is incomplete; explicit recovery required')
            self.fd = os.open(self.lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            try:
                fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                if not self.fresh:
                    self.validate()
            except BaseException:
                os.close(self.fd); self.fd = None
                raise
        elif self.path.exists() or self.marker.exists() or self.lock_path.exists():
            raise FileExistsError('default fixture requires fresh receipt storage')

    def connect(self):
        if self.closed:
            raise OSError('fixture store is closed')
        info = private_file(self.path)
        if info is None or info.st_size > MAX_DATABASE_BYTES:
            raise ValueError('fixture database missing or exceeds its bound')
        # rw never manufactures a replacement empty receipt history.
        db = sqlite3.connect(self.path.resolve().as_uri()+'?mode=rw', uri=True, timeout=2)
        try:
            db.execute('PRAGMA synchronous=FULL')
            db.execute('PRAGMA max_page_count='+str(MAX_DATABASE_BYTES//db.execute('PRAGMA page_size').fetchone()[0]))
            return db
        except BaseException:
            db.close()
            raise

    def validate(self):
        info = private_file(self.marker)
        if info is None or info.st_size > 16384 or decode(self.marker.read_bytes()) != self.profile:
            raise ValueError('persistent fixture profile changed; explicit recovery required')
        with closing(self.connect()) as db:
            definitions=dict(db.execute("SELECT name,sql FROM sqlite_master WHERE type IN ('table','trigger')"))
            if definitions!=SCHEMA or db.execute('PRAGMA quick_check').fetchone()[0]!='ok':
                raise ValueError('persistent fixture schema changed; explicit recovery required')
            if ([r[1] for r in db.execute('PRAGMA table_info(effects)')] != ['key','consent_digest','input_sha','receipt'] or
                    [r[1] for r in db.execute('PRAGMA table_info(fixture_mode)')] != ['singleton','profile'] or
                    db.execute('SELECT singleton,profile FROM fixture_mode').fetchall() != [(1, canonical(self.profile).decode())]):
                raise ValueError('persistent fixture identity changed; explicit recovery required')
            count, size = db.execute('SELECT COUNT(*),COALESCE(SUM(LENGTH(CAST(receipt AS BLOB))),0) FROM effects').fetchone()
            if count > MAX_EFFECTS or size > MAX_STORED_BYTES:
                raise ValueError('persistent fixture storage exceeds bounds')
            for key, consent, input_sha, raw in db.execute('SELECT * FROM effects'):
                identifier(key); self.digest(consent); self.digest(input_sha)
                receipt = decode(raw.encode())
                if (len(raw.encode())>MAX_BODY-2048 or type(receipt) is not dict or set(receipt)!={
                        'schema','business_key','consent_digest','state','output','settlement_correlation'} or
                        canonical(receipt).decode()!=raw or receipt['schema']!='rock-mcp-effect-receipt/1' or
                        receipt['business_key']!=key or receipt['consent_digest']!=consent or receipt['state']!='succeeded' or
                        type(receipt['output']) is not dict or set(receipt['output'])!={'text'} or
                        not isinstance(receipt['output']['text'],str) or len(receipt['output']['text'].encode())>MAX_INPUT or
                        receipt['settlement_correlation']!='corr-'+hashlib.sha256(key.encode()).hexdigest()):
                    raise ValueError('persistent effect receipt is invalid')

    def initialize(self):
        if self.persistent and not self.fresh:
            return
        fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        os.close(fd)
        with closing(self.connect()) as db:
            db.execute('BEGIN IMMEDIATE')
            for name,definition in SCHEMA.items():
                if self.persistent or name in {'effects','effect_no_update','effect_no_delete'}:
                    db.execute(definition)
            if self.persistent:
                db.execute('INSERT INTO fixture_mode VALUES(1,?)',(canonical(self.profile).decode(),))
            db.commit()
        if self.persistent:
            # An interrupted DB/marker publication stays incomplete and fails closed.
            fd = os.open(self.marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd,'wb') as stream:
                stream.write(canonical(self.profile)+b'\n'); stream.flush(); os.fsync(stream.fileno())
            fd = os.open(self.directory,os.O_RDONLY)
            try: os.fsync(fd)
            finally: os.close(fd)
            self.validate()

    @staticmethod
    def digest(value):
        if not isinstance(value,str) or re.fullmatch('[0-9a-f]{64}',value) is None:
            raise ValueError('exact SHA256 digest required')
        return value

    def effect(self, key, consent_digest, text, deadline):
        key = identifier(key); self.digest(consent_digest)
        input_sha = hashlib.sha256(text.encode()).hexdigest()
        with self.lock, closing(self.connect()) as db:
            db.execute('BEGIN IMMEDIATE')
            if self.persistent:
                self.validate()
            if time.monotonic() >= deadline:
                raise TimeoutError('request expired before execution')
            old = db.execute('SELECT consent_digest,input_sha,receipt FROM effects WHERE key=?',(key,)).fetchone()
            if old:
                if old[:2] != (consent_digest,input_sha):
                    raise ValueError('immutable business key conflict')
                return decode(old[2].encode())
            output = text.upper()
            if len(output.encode()) > MAX_INPUT:
                raise ValueError('output exceeds bound')
            receipt = {'schema':'rock-mcp-effect-receipt/1','business_key':key,'consent_digest':consent_digest,
                'state':'succeeded','output':{'text':output},
                'settlement_correlation':'corr-'+hashlib.sha256(key.encode()).hexdigest()}
            raw = canonical(receipt)
            count, size = db.execute('SELECT COUNT(*),COALESCE(SUM(LENGTH(CAST(receipt AS BLOB))),0) FROM effects').fetchone()
            if len(raw)>MAX_BODY-2048 or count>=MAX_EFFECTS or size+len(raw)>MAX_STORED_BYTES:
                raise ValueError('fixture receipt capacity reached')
            db.execute('INSERT INTO effects VALUES(?,?,?,?)',(key,consent_digest,input_sha,raw.decode()))
            db.commit()
            return receipt

    def status(self, key, consent_digest):
        key=identifier(key); self.digest(consent_digest)
        with self.lock, closing(self.connect()) as db:
            if self.persistent: self.validate()
            old=db.execute('SELECT consent_digest,receipt FROM effects WHERE key=?',(key,)).fetchone()
            if old and old[0] != consent_digest:
                raise ValueError('recovery intent mismatch')
            return decode(old[1].encode()) if old else {'schema':'rock-mcp-effect-receipt/1','business_key':key,
                'consent_digest':consent_digest,'state':'not_found','output':None,'settlement_correlation':None}

    def close(self):
        with self.lock:
            if self.fd is not None:
                os.close(self.fd); self.fd=None
            self.closed=True


class DeadlineReader(io.RawIOBase):
    def __init__(self,connection):
        self.connection=connection; self.deadline=time.monotonic()+3
        self.remaining=MAX_BODY+16384
    def readable(self): return True
    def readinto(self,buffer):
        remaining=self.deadline-time.monotonic()
        if remaining<=0 or self.remaining<=0: raise TimeoutError('bounded fixture request expired')
        self.connection.settimeout(remaining)
        count=self.connection.recv_into(buffer,min(len(buffer),self.remaining));self.remaining-=count
        return count


class FixtureHTTPServer(ThreadingHTTPServer):
    daemon_threads=False
    block_on_close=True
    request_queue_size=MAX_SESSIONS
    def __init__(self,address,handler):
        self.slots=threading.BoundedSemaphore(MAX_SESSIONS)
        super().__init__(address,handler)
    def process_request(self,request,address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request);return
        try: super().process_request(request,address)
        except BaseException:
            self.slots.release();raise
    def process_request_thread(self,request,address):
        try: super().process_request_thread(request,address)
        finally: self.slots.release()
    def handle_error(self,*_): pass


class FixtureServer:
    def __init__(self, directory, *, port=0, persistent=False, profile_binding=None):
        if type(port) is not int or not (port==0 or 1024<=port<=65535) or type(persistent) is not bool:
            raise ValueError('explicit development port and persistence mode required')
        if persistent and port==0:
            raise ValueError('persistent fixture requires a fixed loopback port')
        if profile_binding is not None and (not isinstance(profile_binding,str) or str(uuid.UUID(profile_binding))!=profile_binding):
            raise ValueError('nonsecret canonical authority UUID required')
        self.directory=Path(directory);self.path=self.directory/'effects.sqlite3'
        self.policy=ToolPolicy('text.upper','effect.status')
        self.store=ReceiptStore(directory,persistent=persistent,port=port,profile_binding=profile_binding,policy=self.policy)
        self.lock=self.store.lock
        self.wire=[];self.fault=None
        self.committed=threading.Event();self.release_response=threading.Event()
        self.server=self.thread=None
        self._close_lock=threading.RLock();self._closed=False
        owner = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'

            def log_message(self, *args):
                pass

            def setup(self):
                super().setup()
                self.rfile.close()
                self.reader=DeadlineReader(self.connection)
                self.rfile=io.BufferedReader(self.reader)

            def handle_expect_100(self):
                self.reply(403 if self.headers.get_all('Origin') else 400,b'{}');return False

            def reply(self, status, body, headers=None):
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Connection', 'close')
                for key, value in (headers or {}).items(): self.send_header(key, value)
                self.end_headers()
                self.wfile.write(body)
                self.close_connection = True

            def do_POST(self):
                self.close_connection=True
                try:
                    if self.headers.get_all('Origin'):
                        self.reply(403,b'{}');return
                    if self.path != '/mcp':
                        self.reply(404, b'{}'); return
                    if self.headers.get_all('Authorization') != ['Bearer ' + PUBLIC_TOKEN]:
                        self.reply(401, b'{}'); return
                    length = self.headers.get_all('Content-Length', [])
                    if (len(length)!=1 or not length[0].isascii() or not length[0].isdigit() or len(length[0])>6
                            or not 1<=int(length[0])<=MAX_BODY or self.headers.get('Transfer-Encoding') is not None
                            or self.headers.get_all('Content-Type')!=['application/json']):
                        self.reply(400, b'{}'); return
                    raw = self.rfile.read(int(length[0]))
                    if len(raw)!=int(length[0]): raise ValueError('incomplete request')
                    message = decode(raw)
                    if not isinstance(message, dict) or set(message) != {'jsonrpc', 'id', 'method', 'params'} or message['jsonrpc'] != '2.0':
                        raise ValueError('invalid envelope')
                    identifier(message['id'])
                    params = message['params']; meta = params['_meta']; method = message['method']
                    expected_params={'_meta','name','arguments'} if method=='tools/call' else {'_meta'}
                    if set(params)!=expected_params or not isinstance(meta,dict) or set(meta)-{
                        'io.modelcontextprotocol/protocolVersion','io.modelcontextprotocol/clientCapabilities',
                        'io.modelcontextprotocol/clientInfo',INTENT_META}:
                        raise ValueError('unsupported control fields')
                    if (meta.get('io.modelcontextprotocol/protocolVersion') != VERSION
                            or meta.get('io.modelcontextprotocol/clientCapabilities') != {}
                            or self.headers.get_all('MCP-Protocol-Version') != [VERSION]
                            or self.headers.get_all('Mcp-Method') != [method]):
                        raise ValueError('wire version/header mismatch')
                    entry = {'method': method, 'id': message['id'], 'request_sha256': hashlib.sha256(raw).hexdigest()}
                    if method == 'server/discover':
                        result = {'resultType': 'complete', 'supportedVersions': [VERSION], 'capabilities': {'tools': {}},
                                  'ttlMs': 0, 'cacheScope': 'private',
                                  '_meta': {'io.modelcontextprotocol/serverInfo': {'name': 'rock-owned-fixture', 'version': '1'}}}
                    elif method == 'tools/list':
                        # Fixed two-tool JSON-only subset, no pagination or
                        # listChanged subscription and no general conformance claim.
                        result={'resultType':'complete','tools':[
                            {'name':'effect.status','description':'Read this fixture effect receipt by exact immutable intent.',
                             'inputSchema':{'type':'object','properties':{
                                 'business_key':{'type':'string','pattern':'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'},
                                 'consent_digest':{'type':'string','pattern':'^[0-9a-f]{64}$'}},
                                 'required':['business_key','consent_digest'],'additionalProperties':False}},
                            {'name':'text.upper','description':'Uppercase explicitly supplied UTF-8 text, with no financial effect.',
                             'inputSchema':owner.policy.contract()['input_schema']}],
                            'ttlMs':0,'cacheScope':'private',
                            '_meta':{'io.modelcontextprotocol/serverInfo':{'name':'rock-owned-fixture','version':'1'}}}
                    elif method == 'tools/call':
                        name = params['name']; args = params['arguments']
                        if self.headers.get_all('Mcp-Name') != [name]:
                            raise ValueError('Tool header mismatch')
                        entry['tool'] = name
                        if name == owner.policy.name:
                            if set(args) != {'text'} or not isinstance(args['text'], str) or len(args['text'].encode()) > MAX_INPUT:
                                raise ValueError('finite text schema required')
                            intent = meta[INTENT_META]
                            if set(intent) != {'businessKey', 'consentDigest'}: raise ValueError('intent required')
                            key = identifier(intent['businessKey']); consent_digest = intent['consentDigest']
                            entry['business_key'] = key
                            receipt=owner.store.effect(key,consent_digest,args['text'],self.reader.deadline)
                            owner.committed.set()
                        elif name == owner.policy.status_tool:
                            if set(args) != {'business_key', 'consent_digest'}: raise ValueError('fixed recovery schema required')
                            key, consent_digest = identifier(args['business_key']), args['consent_digest']
                            entry['business_key'] = key
                            receipt=owner.store.status(key,consent_digest)
                        else:
                            raise ValueError('Tool not allowlisted')
                        result = {'resultType': 'complete', 'content': [], 'structuredContent': receipt, 'isError': False}
                    else:
                        raise ValueError('method outside fixture subset')
                    with owner.lock:
                        owner.wire.append(entry)
                        if len(owner.wire)>MAX_WIRE_HISTORY: del owner.wire[:-MAX_WIRE_HISTORY]
                        fault, owner.fault = owner.fault, None
                    if fault == 'hold_response':
                        owner.release_response.wait(2)
                    response = canonical({'jsonrpc': '2.0', 'id': message['id'], 'result': result})
                    if fault == 'wrong_id':
                        response = canonical({'jsonrpc': '2.0', 'id': 'unrelated-id', 'result': result})
                    elif fault == 'wrong_receipt' and method == 'tools/call':
                        result['structuredContent']['consent_digest'] = '0' * 64
                        response = canonical({'jsonrpc': '2.0', 'id': message['id'], 'result': result})
                    elif fault == 'redirect':
                        self.reply(302, b'{}', {'Location': 'http://127.0.0.1:1/private'}); return
                    elif fault == 'oversize':
                        self.reply(200, b' ' * (MAX_BODY + 1)); return
                    elif fault == 'drop_after_commit':
                        self.send_response(200); self.send_header('Content-Type', 'application/json')
                        self.send_header('Content-Length', str(len(response))); self.send_header('Connection', 'close'); self.end_headers()
                        self.wfile.write(response[:len(response)//2]); self.wfile.flush()
                        self.connection.shutdown(socket.SHUT_RDWR); self.close_connection = True; return
                    elif fault == 'slow_body':
                        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(response)))
                        self.end_headers(); self.wfile.flush(); time.sleep(0.3)
                    self.reply(200, response)
                except (OSError, ValueError, TypeError, KeyError, AttributeError, RecursionError, sqlite3.Error):
                    try: self.reply(400, b'{}')
                    except OSError: pass

        try:
            self.server=FixtureHTTPServer(('127.0.0.1',port),Handler)
            self.store.initialize()
            self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':.02},daemon=False)
            self.thread.start()
        except BaseException:
            self.close()
            raise

    @property
    def origin(self):
        return f'http://127.0.0.1:{self.server.server_port}'

    def count(self):
        with self.lock, closing(self.store.connect()) as db:
            return db.execute('SELECT COUNT(*) FROM effects').fetchone()[0]

    def close(self):
        with self._close_lock:
            if self._closed: return
            self.release_response.set()
            if self.thread is not None and self.thread.ident is not None:
                if self.thread.is_alive(): self.server.shutdown()
                self.thread.join(5)
                if self.thread.is_alive(): raise RuntimeError('owned fixture listener did not stop')
            # Non-daemon accepted workers finish before the persistent lock is
            # released; failures retain ownership for an explicit close retry.
            if self.server is not None: self.server.server_close()
            self.store.close()
            self._closed=True
