"""Durable, conservative experiment accounting; unknown attempts remain charged."""
from __future__ import annotations
from contextlib import contextmanager
import hashlib
import json
import math
from pathlib import Path
import sqlite3
import time

CAPS = {'teacher': (32, 1200), 'comparison': (120, 256), 'pixel': (30, 256), 'diagnostic': (20, 256)}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


class BudgetError(ValueError): pass


class Budget:
    def __init__(self, root):
        self.root = Path(root)
        self.session = json.loads((self.root/'session.json').read_text())
        self.generation_limits=self.session.get('generationLimits',{'categories':{k:(0 if k=='diagnostic' else v[0]) for k,v in CAPS.items()},'totalCalls':182,'requestedOutputTokens':76800})
        limits=self.generation_limits
        if not isinstance(limits,dict) or set(limits)!={'categories','totalCalls','requestedOutputTokens'} or not isinstance(limits['categories'],dict) or set(limits['categories'])!=set(CAPS):raise BudgetError('invalid generation limits')
        if any(type(n) is not int or not 0<=n<=CAPS[k][0] for k,n in limits['categories'].items()) or type(limits['totalCalls']) is not int or not 1<=limits['totalCalls']<=182 or type(limits['requestedOutputTokens']) is not int or not 1<=limits['requestedOutputTokens']<=76800:raise BudgetError('generation limits exceed hard caps')
        self.db = sqlite3.connect(self.root/'runtime.sqlite', timeout=5)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS budget_configuration (
            id INTEGER PRIMARY KEY CHECK(id=1), generation_limits TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS calls (
            id TEXT PRIMARY KEY, payload TEXT NOT NULL, category TEXT NOT NULL,
            cap INTEGER NOT NULL, started REAL NOT NULL, state TEXT NOT NULL,
            result TEXT, actual_tokens INTEGER);
          CREATE TABLE IF NOT EXISTS training (
            id TEXT PRIMARY KEY, reserved_updates INTEGER NOT NULL,
            completed_updates INTEGER NOT NULL DEFAULT 0, started REAL NOT NULL,
            state TEXT NOT NULL DEFAULT 'running', elapsed REAL NOT NULL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS training_allocations (
            id TEXT PRIMARY KEY, max_sequence INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS validation (
            id TEXT PRIMARY KEY, run_id TEXT NOT NULL, stage TEXT NOT NULL,
            reserved_batches INTEGER NOT NULL, completed_batches INTEGER NOT NULL DEFAULT 0,
            max_sequence INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'running');
          CREATE TABLE IF NOT EXISTS training_reconciliations (
            run_id TEXT PRIMARY KEY, charged_updates INTEGER NOT NULL,
            charged_seconds REAL NOT NULL, receipt_sha TEXT NOT NULL, receipt TEXT NOT NULL);
        ''')
        previous=self.db.execute('SELECT generation_limits FROM budget_configuration WHERE id=1').fetchone()
        if previous:
            old=json.loads(previous[0])
            if any(limits['categories'][k]>old['categories'][k] for k in CAPS) or limits['totalCalls']>old['totalCalls'] or limits['requestedOutputTokens']>old['requestedOutputTokens']:
                self.db.close();raise BudgetError('persisted generation limits cannot increase')
        self.db.execute('INSERT OR REPLACE INTO budget_configuration VALUES (1,?)',(canonical(limits),))
        # Legacy reservations were all512; retain those charges during migration.
        self.db.execute('INSERT OR IGNORE INTO training_allocations SELECT id,512 FROM training')
        self.db.commit()

    def check_time(self, reserve_seconds=0):
        if time.monotonic()+reserve_seconds >= self.session['deadlineMonotonicSeconds']-900:
            raise BudgetError('session safe-stop boundary reached')

    @contextmanager
    def transaction(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise

    def reserve_call(self, call_id, payload, category, cap):
        if category not in CAPS or type(cap) is not int or not 1 <= cap <= CAPS[category][1]:
            raise BudgetError('invalid category/output limit')
        if not isinstance(call_id, str) or not 1 <= len(call_id) <= 160:
            raise BudgetError('invalid call identity')
        bound = hashlib.sha256(canonical({'payload': payload, 'category': category, 'cap': cap}).encode()).hexdigest()
        with self.transaction():
            old = self.db.execute('SELECT payload,state,result FROM calls WHERE id=?', (call_id,)).fetchone()
            if old:
                if old[0] != bound: raise BudgetError('identity payload conflict')
                if old[1] == 'completed': return json.loads(old[2])
                raise BudgetError('attempt pending/unknown; reconcile, do not replay')
            self.check_time(120)
            count = self.db.execute('SELECT COUNT(*) FROM calls WHERE category=?', (category,)).fetchone()[0]
            total, requested = self.db.execute('SELECT COUNT(*),COALESCE(SUM(cap),0) FROM calls').fetchone()
            if count >= self.generation_limits['categories'][category] or total >= self.generation_limits['totalCalls'] or requested+cap > self.generation_limits['requestedOutputTokens']:
                raise BudgetError('generation budget exhausted')
            first = self.db.execute('SELECT MIN(started) FROM calls WHERE category=?', (category,)).fetchone()[0]
            if first is not None and time.time()-first >= 1800 and category in ['teacher','comparison']:
                raise BudgetError('generation phase wall limit reached')
            self.db.execute('INSERT INTO calls VALUES (?,?,?,?,?,?,?,?)', (call_id,bound,category,cap,time.time(),'running',None,None))
        return None

    def finish_call(self, call_id, result, actual_tokens, state='completed'):
        if state not in ['completed','failed','cancelled','unknown']: raise BudgetError('invalid outcome')
        with self.transaction():
            row = self.db.execute('SELECT state,cap FROM calls WHERE id=?',(call_id,)).fetchone()
            if not row or row[0] != 'running': raise BudgetError('attempt not running')
            if actual_tokens is not None and (type(actual_tokens) is not int or not 0 <= actual_tokens <= row[1]): raise BudgetError('invalid token accounting')
            self.db.execute('UPDATE calls SET state=?,result=?,actual_tokens=? WHERE id=?', (state,canonical(result),actual_tokens,call_id))

    def reserve_training(self, run_id, updates, max_sequence=512):
        if type(updates) is not int or not 1 <= updates <= 128 or type(max_sequence) is not int or not 1<=max_sequence<=768: raise BudgetError('invalid optimizer/sequence limit')
        with self.transaction():
            self.check_time(1800)
            planned=self.db.execute('SELECT reserved_updates,completed_updates,state FROM training WHERE id=?',(run_id,)).fetchone()
            if planned and planned==(updates,0,'planned'):
                sequence=self.db.execute('SELECT max_sequence FROM training_allocations WHERE id=?',(run_id,)).fetchone()
                if max_sequence!=(sequence[0] if sequence else 512):raise BudgetError('planned training sequence conflict')
                self.db.execute("UPDATE training SET state='running',started=? WHERE id=?",(time.time(),run_id));return
            used, elapsed = self.db.execute('SELECT COALESCE(SUM(COALESCE(r.charged_updates,t.reserved_updates)),0),COALESCE(SUM(COALESCE(r.charged_seconds,t.elapsed)),0) FROM training t LEFT JOIN training_reconciliations r ON t.id=r.run_id').fetchone()
            slots=self.db.execute('SELECT COALESCE(SUM(COALESCE(r.charged_updates,t.reserved_updates)*COALESCE(a.max_sequence,512)),0) FROM training t LEFT JOIN training_reconciliations r ON t.id=r.run_id LEFT JOIN training_allocations a ON t.id=a.id').fetchone()[0]
            if used+updates > 128 or elapsed >= 1800 or slots+updates*max_sequence>65536: raise BudgetError('training budget exhausted')
            if self.db.execute("SELECT COUNT(*) FROM training WHERE state IN ('running','planned')").fetchone()[0]: raise BudgetError('training run pending')
            self.db.execute('INSERT INTO training(id,reserved_updates,started) VALUES (?,?,?)',(run_id,updates,time.time()))
            self.db.execute('INSERT INTO training_allocations VALUES (?,?)',(run_id,max_sequence))

    def training_progress(self, run_id, updates, elapsed, finished=False):
        with self.transaction():
            row = self.db.execute('SELECT reserved_updates,completed_updates,state FROM training WHERE id=?',(run_id,)).fetchone()
            if not row or row[2] != 'running' or type(updates) is not int or not row[1] <= updates <= row[0]: raise BudgetError('invalid training progress')
            prior = self.db.execute('SELECT COALESCE(SUM(COALESCE(r.charged_seconds,t.elapsed)),0) FROM training t LEFT JOIN training_reconciliations r ON t.id=r.run_id WHERE t.id<>?',(run_id,)).fetchone()[0]
            if elapsed < 0 or elapsed+prior > 1800: raise BudgetError('total training duration exceeded')
            self.check_time()
            self.db.execute('UPDATE training SET completed_updates=?,elapsed=?,state=? WHERE id=?',(updates,elapsed,'completed' if finished else 'running',run_id))

    def charge_training_wall(self,run_id,seconds):
        with self.transaction():
            row=self.db.execute('SELECT elapsed FROM training WHERE id=?',(run_id,)).fetchone()
            if not row:return  # Import/start failure before any optimizer reservation.
            prior=self.db.execute('SELECT COALESCE(SUM(COALESCE(r.charged_seconds,t.elapsed)),0) FROM training t LEFT JOIN training_reconciliations r ON t.id=r.run_id WHERE t.id<>?',(run_id,)).fetchone()[0]
            if type(seconds) not in [int,float] or not math.isfinite(seconds) or seconds<row[0] or prior+seconds>1800:raise BudgetError('invalid full supervisor training time')
            self.db.execute('UPDATE training SET elapsed=? WHERE id=?',(seconds,run_id))

    def snapshot(self):
        calls = [dict(zip(['category','state','attempts','requestedTokens','knownOutputTokens','unknownOutputs'],r)) for r in self.db.execute('SELECT category,state,COUNT(*),SUM(cap),SUM(actual_tokens),SUM(actual_tokens IS NULL) FROM calls GROUP BY category,state')]
        training = [dict(zip(['id','reservedUpdates','completedUpdates','started','state','elapsedSeconds'],r)) for r in self.db.execute('SELECT * FROM training')]
        sequences=dict(self.db.execute('SELECT id,max_sequence FROM training_allocations'))
        reconciliations=[dict(zip(['runId','chargedUpdates','chargedSeconds','receiptSha256','receipt'],r)) for r in self.db.execute('SELECT * FROM training_reconciliations')]
        by_id={r['runId']:r for r in reconciliations}
        for row in training:
            row['maxSequence']=sequences.get(row['id'],512)
            rec=by_id.get(row['id']);row['chargedUpdatesUpperBound']=rec['chargedUpdates'] if rec else row['reservedUpdates'];row['chargedWallSeconds']=rec['chargedSeconds'] if rec else row['elapsedSeconds']
        validation=[dict(zip(['id','runId','stage','reservedBatches','completedBatches','maxSequence','state'],r)) for r in self.db.execute('SELECT * FROM validation')]
        return {'calls':calls,'training':training,'trainingReconciliations':reconciliations,'teacherForcedValidation':validation,
          'confirmedOptimizerUpdates':sum(r['completedUpdates'] for r in training),
          'optimizerUpdatesUpperBoundCharged':sum(r['chargedUpdatesUpperBound'] for r in training),
          'trainingWallSecondsCharged':sum(r['chargedWallSeconds'] for r in training),
          'trainingTokenSlotsUpperBoundCharged':sum(r['chargedUpdatesUpperBound']*r['maxSequence'] for r in training),
          'generationLimits':self.generation_limits}

    def reconcile_training(self,receipt_path):
        """Offline independent-review reconciliation, never exposed to the model/UI.

        Retain the original reservation and one possible unrecorded update. Only
        release updates proved impossible by the synchronous per-update callback.
        """
        path=Path(receipt_path).resolve()
        if not path.is_relative_to(self.root.resolve()): raise BudgetError('reconciliation must be owned run evidence')
        raw=path.read_bytes();receipt=json.loads(raw)
        if receipt.get('schema')!='eve.training-interruption-reconciliation/1' or receipt.get('reviewOutcome')!='PASS_SCOPED' or receipt.get('proofKind')!='synchronous_per_update_callback/1' or not receipt.get('reviewer'):
            raise BudgetError('independent interruption proof required')
        evidence={}
        for key in ['supervisor','adapterConfig','sourceManifest','executionIdentity']:
            p=(self.root/receipt[key]['path']).resolve()
            if not p.is_relative_to(self.root.resolve()) or hashlib.sha256(p.read_bytes()).hexdigest()!=receipt[key]['sha256']:raise BudgetError('interruption evidence binding mismatch')
            evidence[key]=json.loads(p.read_text())
        supervisor,config=evidence['supervisor'],evidence['adapterConfig']
        identity=evidence['executionIdentity']
        if identity.get('singleOwnedGpuWorker') is not True or identity.get('ownedChildWaitExitCode')!=supervisor.get('exitCode') or identity.get('sourceSnapshot',{}).get('sha256')!=receipt['sourceManifest']['sha256'] or identity.get('runtime',{}).get('mlx_lm')!='0.32.2':raise BudgetError('reviewed source/runtime execution identity required')
        if supervisor.get('exitCode') is None or supervisor['exitCode']>=0 or not supervisor.get('stopReason') or config.get('steps_per_report')!=1 or config.get('grad_accumulation_steps')!=1:
            raise BudgetError('reaped worker/per-update callback preconditions absent')
        with self.transaction():
            row=self.db.execute('SELECT reserved_updates,completed_updates,state FROM training WHERE id=?',(receipt['runId'],)).fetchone()
            allocation=self.db.execute('SELECT max_sequence FROM training_allocations WHERE id=?',(receipt['runId'],)).fetchone()
            if allocation and allocation[0]!=512:raise BudgetError('legacy reconciliation proof only covers512-token runs')
            if not row or row[0]!=receipt['originalReservedUpdates'] or row[1]!=receipt['confirmedUpdates'] or type(receipt['maximumUpdates']) is not int or receipt['maximumUpdates']!=row[1]+1 or receipt['maximumUpdates']>row[0]:raise BudgetError('interruption update upper bound inconsistent')
            seconds=receipt['wallSeconds']
            if type(seconds) not in [int,float] or not math.isfinite(seconds) or seconds!=supervisor['elapsedSeconds'] or seconds<0:raise BudgetError('full supervisor time required')
            bound=hashlib.sha256(raw).hexdigest();old=self.db.execute('SELECT receipt_sha FROM training_reconciliations WHERE run_id=?',(receipt['runId'],)).fetchone()
            if old:
                if old[0]!=bound:raise BudgetError('conflicting interruption reconciliation')
                return
            if row[2]!='running':raise BudgetError('run already resolved')
            self.db.execute('INSERT INTO training_reconciliations VALUES (?,?,?,?,?)',(receipt['runId'],receipt['maximumUpdates'],seconds,bound,canonical(receipt)))
            self.db.execute("UPDATE training SET state='stopped_unknown' WHERE id=?",(receipt['runId'],))
            next_run=receipt.get('nextRun')
            if not isinstance(next_run,dict) or set(next_run)!={'id','updates'} or not isinstance(next_run['id'],str) or not 1<=len(next_run['id'])<=100 or type(next_run['updates']) is not int or not 1<=next_run['updates']<=8:raise BudgetError('reviewed bounded next run required')
            used,elapsed=self.db.execute('SELECT SUM(COALESCE(r.charged_updates,t.reserved_updates)),SUM(COALESCE(r.charged_seconds,t.elapsed)) FROM training t LEFT JOIN training_reconciliations r ON t.id=r.run_id').fetchone()
            slots=self.db.execute('SELECT COALESCE(SUM(COALESCE(r.charged_updates,t.reserved_updates)*COALESCE(a.max_sequence,512)),0) FROM training t LEFT JOIN training_reconciliations r ON t.id=r.run_id LEFT JOIN training_allocations a ON t.id=a.id').fetchone()[0]
            if used+next_run['updates']>128 or slots+next_run['updates']*512>65536 or elapsed>=1800 or self.db.execute("SELECT COUNT(*) FROM training WHERE state IN ('running','planned')").fetchone()[0]:raise BudgetError('next run cannot fit atomic reconciled budget')
            self.db.execute("INSERT INTO training(id,reserved_updates,started,state) VALUES (?,?,?,'planned')",(next_run['id'],next_run['updates'],time.time()))
            self.db.execute('INSERT INTO training_allocations VALUES (?,512)',(next_run['id'],))

    def reserve_validation(self,run_id,stage,batches=8,max_sequence=512):
        if stage not in ['before','after'] or type(batches) is not int or not 1<=batches<=8 or type(max_sequence) is not int or not 1<=max_sequence<=768: raise BudgetError('invalid validation allocation')
        key=run_id+':'+stage
        with self.transaction():
            self.check_time()
            n,slots=self.db.execute('SELECT COALESCE(SUM(reserved_batches),0),COALESCE(SUM(reserved_batches*max_sequence),0) FROM validation').fetchone()
            if n+batches>16 or slots+batches*max_sequence>8192: raise BudgetError('validation budget exhausted')
            self.db.execute('INSERT INTO validation(id,run_id,stage,reserved_batches,max_sequence) VALUES (?,?,?,?,?)',(key,run_id,stage,batches,max_sequence))
        return key

    def validation_progress(self,key,completed,finished=False):
        with self.transaction():
            self.check_time()
            row=self.db.execute('SELECT reserved_batches,completed_batches,state FROM validation WHERE id=?',(key,)).fetchone()
            if not row or row[2]!='running' or type(completed) is not int or not row[1]<=completed<=row[0] or finished and completed!=row[0]: raise BudgetError('invalid validation progress')
            self.db.execute('UPDATE validation SET completed_batches=?,state=? WHERE id=?',(completed,'completed' if finished else 'running',key))

    def abandon_call(self,call_id):
        with self.transaction():
            row=self.db.execute('SELECT state FROM calls WHERE id=?',(call_id,)).fetchone()
            if row and row[0]=='running':
                self.db.execute("UPDATE calls SET state='unknown',result=? WHERE id=?",(canonical({'error':'owned worker exited before response reconciliation','actualOutputTokens':None}),call_id))

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--abandon-call',required=True)
    a=p.parse_args();Budget(a.root).abandon_call(a.abandon_call)
