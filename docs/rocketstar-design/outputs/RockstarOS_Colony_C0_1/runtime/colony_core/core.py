"""Durable command/receipt and autonomous-load simulation, not a flight or habitat OS.

Two separate SQLite stores represent the supervisor and a local controller.
The direct Python transport and public HMAC keys are fixtures, NOT authentication
or OS/process isolation suitable for a deployed system. Only a synthetic,
noncritical electrical load is commandable. No hardware drivers or live mode.
"""
import hashlib
import hmac
import json
import math
import sqlite3
import time
import uuid
from pathlib import Path

COMMAND_SCHEMA = 'rockstaros-colony-command/1'
TELEMETRY_SCHEMA = 'rockstaros-colony-telemetry/1'
SITE = 'sim-ground-01'
NODE = 'sim-utility-01'
OWNER = 'sim-operator-organization'
FIXTURE_COMMAND_KEY = b'public-simulation-command-key-not-for-deployment'
FIXTURE_RECEIPT_KEY = b'public-simulation-receipt-key-not-for-deployment'
ENVELOPE_FIELDS = {'schema','mode','sourceClass','ownerRef','siteId','nodeId',
    'workId','requestId','commandId','idempotencyKey','payloadDigest','holderId',
    'authorityEpoch','componentGeneration','expiresAt','expectedRevision',
    'payload','signature'}


class ContractError(Exception):
    pass


def canonical(x):
    try:
        return json.dumps(x, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
    except (ValueError, TypeError) as e:
        raise ContractError('INVALID_JSON_VALUE') from e


def digest(x):
    return hashlib.sha256(canonical(x)).hexdigest()


def signed(x, key):
    d = dict(x)
    d.pop('signature', None)
    d['signature'] = hmac.new(key, canonical(d), hashlib.sha256).hexdigest()
    return d


def check_signature(x, key):
    if not isinstance(x,dict):return False
    actual = x.get('signature', '')
    try:expected = signed(x, key)['signature']
    except ContractError:return False
    return isinstance(actual, str) and hmac.compare_digest(actual, expected)


def number(x, lo, hi):
    return type(x) in (int, float) and lo <= x <= hi and math.isfinite(x)


def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA synchronous=FULL')
    db.execute('PRAGMA foreign_keys=ON')
    return db


class Controller:
    """Local synthetic plant and final command authority; owns a separate store."""
    def __init__(self, path, clock=time.time, reboot=False):
        self.db = connect(path)
        self.clock = clock
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS plant (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS receipts (command_id TEXT PRIMARY KEY, request_digest TEXT NOT NULL, body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);
        ''')
        with self.db:
            if self.db.execute('SELECT 1 FROM plant').fetchone() is None:
                initial=self.clock();trusted=number(initial,0,1e12)
                self._save({'generation':str(uuid.uuid4()),'revision':0,'sampleSeq':0,
                    'supplyKw':10.0,'criticalDemandKw':4.0,'desiredFlexibleKw':0.0,
                    'actualFlexibleKw':0.0,'criticalServedKw':4.0,'criticalDeficitKw':0.0,
                    'state':'NOMINAL','holderId':None,'authorityEpoch':0,'leaseExpiresAt':0,
                    'timeHighwater':initial if trusted else 0,'clockTrusted':trusted,'lastSampleAt':None})
            elif reboot:
                p = self._plant()
                p.update(generation=str(uuid.uuid4()), holderId=None, leaseExpiresAt=0,
                    desiredFlexibleKw=0.0, actualFlexibleKw=0.0, lastSampleAt=None,
                    authorityEpoch=p['authorityEpoch']+1, revision=p['revision']+1)
                self._save(p)
                self._event('CONTROLLER_REBOOT', {'generation':p['generation']})

    def close(self):
        self.db.close()

    def _plant(self):
        return json.loads(self.db.execute('SELECT body FROM plant WHERE id=1').fetchone()[0])

    def _save(self, p):
        self.db.execute('INSERT OR REPLACE INTO plant VALUES (1,?)',(canonical(p).decode(),))

    def _event(self, kind, details):
        now=self.clock()
        self.db.execute('INSERT INTO events(body) VALUES (?)',
            (canonical({'kind':kind,'time':now if number(now,0,1e12) else None,'details':details}).decode(),))

    def _time_guard(self, p):
        now = self.clock()
        if not number(now,0,1e12) or now < p['timeHighwater']:
            p['clockTrusted'] = False
            p['holderId'] = None
            p['leaseExpiresAt'] = 0
        if number(now,0,1e12):
            p['timeHighwater'] = max(now,p['timeHighwater'])
        # Bad time must not roll back the latch or prevent local model steps.
        return now if number(now,0,1e12) else p['timeHighwater']

    def acquire_authority(self, holder, expected_epoch, ttl=30):
        # Fixture-only local invocation; production needs authenticated authority service.
        if holder not in ('ops-A','ops-B') or type(expected_epoch) is not int or not number(ttl,1,60):
            raise ContractError('INVALID_AUTHORITY_REQUEST')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            p = self._plant(); now = self._time_guard(p)
            self._save(p)
            if not p['clockTrusted']:
                self.db.commit(); raise ContractError('TIME_UNTRUSTED')
            if expected_epoch != p['authorityEpoch']:
                raise ContractError('STALE_AUTHORITY_EPOCH')
            if p['holderId'] is not None and now < p['leaseExpiresAt'] and p['holderId'] != holder:
                raise ContractError('AUTHORITY_BUSY')
            if p['holderId'] != holder or now >= p['leaseExpiresAt']:
                p['authorityEpoch'] += 1
            p.update(holderId=holder,leaseExpiresAt=now+ttl)
            self._save(p);self._event('AUTHORITY_GRANTED',{'holder':holder,'epoch':p['authorityEpoch']})
            self.db.commit()
            return {'holderId':holder,'authorityEpoch':p['authorityEpoch'],'expiresAt':p['leaseExpiresAt']}
        except Exception:
            self.db.rollback();raise

    def set_supply_for_test(self, kw):
        """Fault injection only; not an exposed command or equipment-control API."""
        if not number(kw,0,100):raise ContractError('INVALID_SYNTHETIC_SUPPLY')
        self.db.execute('BEGIN IMMEDIATE')
        with self.db:
            p=self._plant();p['supplyKw']=float(kw);p['revision']+=1;self._save(p)
        return self.step()

    def step(self):
        """Local power-priority calculation, runs without Broker, AI, or WAN."""
        self.db.execute('BEGIN IMMEDIATE')
        try:
            p=self._plant();now=self._time_guard(p)
            authorized=p['clockTrusted'] and now < p['leaseExpiresAt'] and p['holderId'] is not None
            discretionary = p['desiredFlexibleKw'] if authorized else 0.0
            p['criticalServedKw']=min(p['supplyKw'],p['criticalDemandKw'])
            p['criticalDeficitKw']=max(0.0,p['criticalDemandKw']-p['supplyKw'])
            p['actualFlexibleKw']=min(discretionary,max(0.0,p['supplyKw']-p['criticalDemandKw']))
            previous=p['state']
            p['state']=('CRITICAL_DEFICIT' if p['criticalDeficitKw']>0 else
                'CLOCK_UNTRUSTED' if not p['clockTrusted'] else
                'LOCAL_HOLD' if not authorized else
                'CURTAILED' if p['actualFlexibleKw'] < p['desiredFlexibleKw'] else 'NOMINAL')
            p['sampleSeq']+=1;p['lastSampleAt']=now
            self._save(p)
            if previous!=p['state']:self._event('LOCAL_STATE_CHANGED',{'state':p['state']})
            self.db.commit();return self.snapshot()
        except Exception:
            self.db.rollback();raise

    def snapshot(self):
        p=self._plant()
        return signed({'schema':TELEMETRY_SCHEMA,'mode':'SIM_ONLY','sourceClass':'SYNTHETIC',
            'siteId':SITE,'nodeId':NODE,'componentGeneration':p['generation'],
            'stateRevision':p['revision'],'sampleSeq':p['sampleSeq'],'sampledAt':p['lastSampleAt'],
            'clockTrusted':p['clockTrusted'],'authorityEpoch':p['authorityEpoch'],
            'leaseExpiresAt':p['leaseExpiresAt'],'holderId':p['holderId'],
            'supplyKw':p['supplyKw'],'criticalDemandKw':p['criticalDemandKw'],
            'desiredFlexibleKw':p['desiredFlexibleKw'],'actualFlexibleKw':p['actualFlexibleKw'],
            'criticalServedKw':p['criticalServedKw'],'criticalDeficitKw':p['criticalDeficitKw'],
            'state':p['state']}, FIXTURE_RECEIPT_KEY)

    def receive(self, command):
        if not isinstance(command,dict) or set(command)!=ENVELOPE_FIELDS:
            raise ContractError('INVALID_ENVELOPE')
        if not check_signature(command,FIXTURE_COMMAND_KEY):raise ContractError('BAD_FIXTURE_MAC')
        c=command
        if (c['schema']!=COMMAND_SCHEMA or c['mode']!='SIM_ONLY' or c['sourceClass']!='SYNTHETIC'
            or c['ownerRef']!=OWNER or c['siteId']!=SITE or c['nodeId']!=NODE):
            raise ContractError('WRONG_DOMAIN_OR_MODE')
        for k in ['commandId','idempotencyKey','workId','requestId','holderId','componentGeneration']:
            if not isinstance(c[k],str) or not 1<=len(c[k])<=128:raise ContractError('INVALID_IDENTIFIER')
        if c['commandId']!=c['idempotencyKey']:raise ContractError('KEY_MISMATCH')
        if type(c['expectedRevision']) is not int or c['expectedRevision']<0 or type(c['authorityEpoch']) is not int or c['authorityEpoch']<0 or not number(c['expiresAt'],0,1e12):
            raise ContractError('INVALID_NUMERIC_METADATA')
        payload=c['payload']
        if not isinstance(payload,dict) or set(payload)!={'operation','desiredFlexibleKw'} or payload['operation']!='sim.noncritical_load.set':
            raise ContractError('OPERATION_NOT_ALLOWED')
        if not number(payload['desiredFlexibleKw'],0,100):raise ContractError('INVALID_LOAD')
        if c['payloadDigest']!=digest(payload):raise ContractError('PAYLOAD_DIGEST_MISMATCH')
        request_digest=digest(c)
        self.db.execute('BEGIN IMMEDIATE')
        try:
            old=self.db.execute('SELECT * FROM receipts WHERE command_id=?',(c['commandId'],)).fetchone()
            if old:
                if old['request_digest']!=request_digest:raise ContractError('IDEMPOTENCY_CONFLICT')
                self.db.commit();return json.loads(old['body'])
            p=self._plant();now=self._time_guard(p);reason=None
            if not p['clockTrusted']:reason='TIME_UNTRUSTED'
            elif c['componentGeneration']!=p['generation']:reason='STALE_COMPONENT_GENERATION'
            elif c['expiresAt']<=now:reason='EXPIRED'
            elif c['authorityEpoch']!=p['authorityEpoch'] or c['holderId']!=p['holderId'] or p['leaseExpiresAt']<=now:reason='NO_AUTHORITY'
            elif c['expectedRevision']!=p['revision']:reason='REVISION_CONFLICT'
            elif payload['desiredFlexibleKw']>max(0,p['supplyKw']-p['criticalDemandKw']):reason='LOCAL_RESOURCE_BUDGET'
            if reason is None:
                p['desiredFlexibleKw']=float(payload['desiredFlexibleKw']);p['revision']+=1
            self._save(p)
            receipt=signed({'schema':'rockstaros-colony-receipt/1','mode':'SIM_ONLY',
                'sourceClass':'SYNTHETIC','siteId':SITE,'nodeId':NODE,'commandId':c['commandId'],
                'requestDigest':request_digest,'payloadDigest':c['payloadDigest'],
                'componentGeneration':p['generation'],'stateRevision':p['revision'],
                'status':'APPLIED' if reason is None else 'REJECTED','reason':reason,
                'appliedScope':'synthetic desired-load state only','decidedAt':now},FIXTURE_RECEIPT_KEY)
            self.db.execute('INSERT INTO receipts VALUES (?,?,?)',(c['commandId'],request_digest,canonical(receipt).decode()))
            self._event('COMMAND_DECIDED',{'commandId':c['commandId'],'status':receipt['status'],'reason':reason})
            self.db.commit();return receipt
        except Exception:
            self.db.rollback();raise

    def query_receipt(self, command_id):
        row=self.db.execute('SELECT body FROM receipts WHERE command_id=?',(command_id,)).fetchone()
        return json.loads(row[0]) if row else None


class Broker:
    """Supervisory workflow. Human fixture approval is separate from AI proposals."""
    def __init__(self,path,holder='ops-A',clock=time.time):
        if holder not in ('ops-A','ops-B'):raise ContractError('UNKNOWN_HOLDER')
        self.db=connect(path);self.holder=holder;self.clock=clock;self.telemetry=None
        initial=clock();self.clock_trusted=number(initial,0,1e12)
        self.time_highwater=initial if self.clock_trusted else 0
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS commands (command_id TEXT PRIMARY KEY, body TEXT NOT NULL, state TEXT NOT NULL, approved_digest TEXT, receipt TEXT);
          CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);
        ''')
        with self.db:
            self.db.execute("UPDATE commands SET state='UNCERTAIN' WHERE state='SENT'")
            self.db.execute("UPDATE commands SET state='CANCELLED_RESTART' WHERE state IN ('PREPARED','QUEUED')")
            self._audit('BROKER_STARTED',{'holder':holder})

    def close(self):self.db.close()

    def _audit(self,kind,details):
        now=self.clock()
        self.db.execute('INSERT INTO audit(body) VALUES (?)',(canonical({'kind':kind,'time':now if number(now,0,1e12) else None,'details':details}).decode(),))

    def _now(self):
        now=self.clock()
        if not number(now,0,1e12) or now<self.time_highwater:self.clock_trusted=False
        if number(now,0,1e12):self.time_highwater=max(now,self.time_highwater)
        if not self.clock_trusted:raise ContractError('TIME_UNTRUSTED')
        return now

    def refresh(self,controller):
        t=controller.snapshot();now=self._now()
        if not check_signature(t,FIXTURE_RECEIPT_KEY):raise ContractError('BAD_TELEMETRY_MAC')
        if (t.get('schema')!=TELEMETRY_SCHEMA or t.get('mode')!='SIM_ONLY'
            or t.get('sourceClass')!='SYNTHETIC' or t.get('siteId')!=SITE
            or t.get('nodeId')!=NODE):raise ContractError('WRONG_TELEMETRY_DOMAIN')
        if t['sampledAt'] is None or not number(t['sampledAt'],0,1e12) or not 0<=now-t['sampledAt']<=5 or not t['clockTrusted']:
            raise ContractError('STALE_OR_UNTRUSTED_TELEMETRY')
        self.telemetry=t;return t

    def prepare(self,kw,ttl=10,actor='operator'):
        if actor not in ('operator','planner'):raise ContractError('NO_PREPARE_PERMISSION')
        now=self._now();t=self.telemetry
        if t is None or not 0<=now-t['sampledAt']<=5:raise ContractError('FRESH_TELEMETRY_REQUIRED')
        if not number(kw,0,100) or not number(ttl,1,30):raise ContractError('INVALID_REQUEST')
        if t['holderId']!=self.holder or now>=t['leaseExpiresAt']:raise ContractError('NO_AUTHORITY')
        if kw>max(0,t['supplyKw']-t['criticalDemandKw']):raise ContractError('RESOURCE_BUDGET')
        ident=str(uuid.uuid4());payload={'operation':'sim.noncritical_load.set','desiredFlexibleKw':float(kw)}
        c={'schema':COMMAND_SCHEMA,'mode':'SIM_ONLY','sourceClass':'SYNTHETIC',
            'ownerRef':OWNER,'siteId':SITE,'nodeId':NODE,'workId':'work-'+ident,
            'requestId':'request-'+ident,'commandId':ident,'idempotencyKey':ident,
            'payloadDigest':digest(payload),'holderId':self.holder,'authorityEpoch':t['authorityEpoch'],
            'componentGeneration':t['componentGeneration'],'expiresAt':min(now+ttl,t['leaseExpiresAt']),
            'expectedRevision':t['stateRevision'],'payload':payload}
        c=signed(c,FIXTURE_COMMAND_KEY)
        with self.db:
            self.db.execute('INSERT INTO commands VALUES (?,?,?,NULL,NULL)',(ident,canonical(c).decode(),'PREPARED'))
            self._audit('PREPARED',{'commandId':ident,'actor':actor})
        return c

    def approve(self,command_id,expected_digest,actor='operator'):
        if actor!='operator':raise ContractError('HUMAN_FIXTURE_APPROVAL_REQUIRED')
        self.db.execute('BEGIN IMMEDIATE')
        with self.db:
            row=self._row(command_id);c=json.loads(row['body'])
            if row['state']!='PREPARED':raise ContractError('NOT_PREPARED')
            if expected_digest!=digest(c):raise ContractError('APPROVAL_DIGEST_MISMATCH')
            if self._now()>=c['expiresAt']:raise ContractError('EXPIRED')
            self.db.execute("UPDATE commands SET state='QUEUED',approved_digest=? WHERE command_id=?",(expected_digest,command_id))
            self._audit('APPROVED',{'commandId':command_id,'digest':expected_digest})

    def _row(self,ident):
        row=self.db.execute('SELECT * FROM commands WHERE command_id=?',(ident,)).fetchone()
        if row is None:raise ContractError('UNKNOWN_COMMAND')
        return row

    def state(self,ident):return self._row(ident)['state']

    def dispatch(self,ident,controller,drop_receipt=False,crash_after_send_claim=False):
        # Serialize read/claim so competing senders cannot both claim QUEUED.
        expired=False
        self.db.execute('BEGIN IMMEDIATE')
        with self.db:
            row=self._row(ident);c=json.loads(row['body'])
            if row['state']!='QUEUED' or row['approved_digest']!=digest(c):raise ContractError('NOT_APPROVED_FOR_DISPATCH')
            expired=self._now()>=c['expiresAt']
            if expired:
                self.db.execute("UPDATE commands SET state='EXPIRED' WHERE command_id=?",(ident,))
            else:
                self.db.execute("UPDATE commands SET state='SENT' WHERE command_id=?",(ident,))
                self._audit('SEND_CLAIM_DURABLE',{'commandId':ident})
        if expired:raise ContractError('EXPIRED')
        if crash_after_send_claim:return None
        try:receipt=controller.receive(c)
        except Exception:
            with self.db:self.db.execute("UPDATE commands SET state='UNCERTAIN' WHERE command_id=?",(ident,))
            raise
        if drop_receipt:
            with self.db:self.db.execute("UPDATE commands SET state='UNCERTAIN' WHERE command_id=?",(ident,))
            return None
        return self._accept_receipt(c,receipt)

    def _accept_receipt(self,c,r):
        if (not isinstance(r,dict) or not check_signature(r,FIXTURE_RECEIPT_KEY)
            or r.get('schema')!='rockstaros-colony-receipt/1' or r.get('sourceClass')!='SYNTHETIC'
            or r.get('commandId')!=c['commandId']
            or r.get('requestDigest')!=digest(c) or r.get('payloadDigest')!=c['payloadDigest']
            or r.get('siteId')!=SITE or r.get('nodeId')!=NODE or r.get('mode')!='SIM_ONLY'
            or r.get('status') not in ('APPLIED','REJECTED')):
            with self.db:self.db.execute("UPDATE commands SET state='UNCERTAIN' WHERE command_id=?",(c['commandId'],))
            raise ContractError('RECEIPT_MISMATCH')
        state='SUCCEEDED' if r['status']=='APPLIED' else 'REJECTED'
        with self.db:
            self.db.execute('UPDATE commands SET state=?,receipt=? WHERE command_id=?',(state,canonical(r).decode(),c['commandId']))
            self._audit('RECEIPT_VERIFIED',{'commandId':c['commandId'],'state':state})
        return r

    def reconcile(self,ident,controller):
        row=self._row(ident)
        if row['state'] not in ('UNCERTAIN','SENT'):raise ContractError('NOT_UNCERTAIN')
        r=controller.query_receipt(ident)
        if r is None:
            with self.db:self.db.execute("UPDATE commands SET state='UNCERTAIN' WHERE command_id=?",(ident,))
            return {'state':'UNCERTAIN','reason':'no controller receipt; no automatic resend'}
        return self._accept_receipt(json.loads(row['body']),r)
