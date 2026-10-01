"""Durable operator plans and reported outcomes; deliberately no OTA executor."""
import json
import uuid
from .release import verify_envelope
from .state import Database, canonical, digest, exact, identifier, require, sha256


class OperationsStore:
    def __init__(self, state, *, authority_id, policy_id, authorize=None, clock=None, capacity=2048):
        require(type(authority_id) is str and str(uuid.UUID(authority_id)) == authority_id, 'canonical authority UUID required')
        self.db = Database(state, {'schema': 'rock-operations/1', 'authority_id': authority_id,
                                  'policy_id': identifier(policy_id)}, authorize=authorize,
                           capacity=capacity, **({'clock': clock} if clock is not None else {}))

    def diagnostics(self, context=None):
        return self.db.diagnostics(context)

    def _plan(self, db, plan_id):
        row = db.execute("SELECT * FROM objects WHERE id=? AND kind='plan'", ('plan:'+identifier(plan_id),)).fetchone()
        require(row is not None, 'unknown plan')
        return dict(row), json.loads(row['payload']), json.loads(row['result'])

    def _view(self, row, payload, result):
        return {'plan_id': payload['plan_id'], 'plan_sha256': digest(payload), 'state': row['state'],
                'revision': row['revision'], 'creator': payload['creator'], 'approval': result.get('approval'),
                'reason': result.get('reason'), 'reported_outcomes_only': True}

    def snapshot(self, plan_id, context=None):
        identifier(self.db.authorize(context, 'plan.read', {'plan_id': plan_id}))
        with self.db.connection() as db:
            db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
            row, payload, result = self._plan(db, plan_id)
            outcomes = [dict(r) for r in db.execute("SELECT id,state,result FROM objects WHERE kind='assignment'")
                        if json.loads(db.execute('SELECT payload FROM objects WHERE id=?', (r['id'],)).fetchone()[0])['plan_id'] == plan_id]
            return {**self._view(row, payload, result), 'outcomes': [
                {'assignment_id': r['id'], 'state': r['state'], 'reported': json.loads(r['result']) if r['result'] else None}
                for r in outcomes], 'execution_authorized': False}

    def dispatch(self, request, *, context=None):
        request = json.loads(canonical(request))
        require(type(request) is dict and type(request.get('op')) is str, 'operation required')
        op = request['op']
        fields = {'plan.create': {'plan_id','release','hardware_id','targets','canary','expires_at'},
                  'plan.approve': {'plan_id','expected_revision','plan_sha256'},
                  'plan.start': {'plan_id','expected_revision'},
                  'plan.promote': {'plan_id','expected_revision'},
                  'plan.hold': {'plan_id','expected_revision','reason'},
                  'plan.resume': {'plan_id','expected_revision','plan_sha256'},
                  'plan.recovery': {'plan_id','expected_revision','reason'},
                  'device.claim': {'plan_id','device_ref'},
                  'device.report': {'plan_id','device_ref','outcome'}}
        require(op in fields, 'unsupported operator operation')
        exact(request, fields[op] | {'op','key'})
        return self.db.run(request, context, lambda db, actor, now: self._apply(db, actor, now, request),
                           fresh=op not in ('plan.hold', 'plan.recovery', 'device.report'))

    def _apply(self, db, actor, now, request):
        op, plan_id = request['op'], identifier(request['plan_id'])
        if op == 'plan.create':
            require(db.execute("SELECT COUNT(*) FROM objects WHERE kind='plan'").fetchone()[0] < 128, 'plan capacity reached')
            release = verify_envelope(request['release'])
            # Current signed update layout is only proven on this QEMU board.
            require(request['hardware_id'] == 'rock-virt-aarch64', 'update hardware is not yet verified')
            targets = request['targets']; canary = request['canary']
            require(type(targets) is list and 1 <= len(targets) <= 128 and
                    type(canary) is list and 1 <= len(canary) <= min(10,len(targets)), 'bounded targets/canary required')
            refs = []
            for target in targets:
                exact(target, {'device_ref','current_release','protected_binding_sha256','history_sha256'})
                refs.append(identifier(target['device_ref']))
                current = verify_envelope(target['current_release'])
                require(release['sequence'] > current['sequence'], 'new or recovery release must exceed the committed floor')
                for field in ('protected_binding_sha256','history_sha256'): sha256(target[field])
            require(len(set(refs)) == len(refs) and len(set(canary)) == len(canary) and set(canary) <= set(refs), 'duplicate or unknown canary device')
            require(type(request['expires_at']) is int and now < request['expires_at'] <= now+7*86400, 'bounded future plan expiry required')
            payload = {k: request[k] for k in ('plan_id','release','hardware_id','targets','canary','expires_at')}
            payload.update(creator=actor, created_at=now)
            require(db.execute('SELECT 1 FROM objects WHERE id=?', ('plan:'+plan_id,)).fetchone() is None, 'plan already exists')
            db.execute('INSERT INTO objects VALUES (?,?,?,?,?,?)', ('plan:'+plan_id,'plan',canonical(payload),'DRAFT',0,'{}'))
            row, payload, result = self._plan(db, plan_id)
            return self._view(row, payload, result)

        row, payload, result = self._plan(db, plan_id)
        if op in ('device.claim','device.report'):
            device = identifier(request['device_ref'])
            target = next((item for item in payload['targets'] if item['device_ref'] == device), None)
            require(target is not None, 'device is not in the approved plan')
            assignment_id = 'assignment:' + digest([plan_id,device])
            old = db.execute('SELECT * FROM objects WHERE id=?', (assignment_id,)).fetchone()
            if op == 'device.claim':
                if old is None:
                    require(now < payload['expires_at'] and row['state'] in ('CANARY','ROLLOUT'), 'new assignment is held, expired or unapproved')
                    require(row['state'] == 'ROLLOUT' or device in payload['canary'], 'device is outside the canary')
                    assignment = {'assignment_id': assignment_id, 'plan_id': plan_id, 'device_ref': device,
                                  'release': payload['release'], 'baseline': target,
                                  'plan_sha256': digest(payload), 'execution_authorized': False}
                    db.execute('INSERT INTO objects VALUES (?,?,?,?,?,NULL)',
                               (assignment_id,'assignment',canonical(assignment),'UNKNOWN',0))
                else:
                    assignment = json.loads(old['payload'])
                return {'assignment': assignment, 'meaning': 'one durable review-only assignment; no device write authorized'}
            require(old is not None, 'device has no admitted assignment')
            observation = request['outcome']
            exact(observation, {'state','image_sha256','protected_binding_sha256','history_sha256','proof_sha256'})
            require(observation['state'] in ('HEALTHY','ROLLED_BACK','FAILED','UNKNOWN'), 'unknown reported outcome')
            for name in ('image_sha256','protected_binding_sha256','history_sha256','proof_sha256'): sha256(observation[name])
            if old['state'] != 'UNKNOWN':
                require(old['result'] == canonical(observation), 'terminal observation is immutable')
                return {'assignment_id': assignment_id, 'reported': observation}
            if observation['state'] in ('HEALTHY','ROLLED_BACK'):
                expected = payload['release'] if observation['state'] == 'HEALTHY' else target['current_release']
                require(observation['image_sha256'] == expected['manifest']['sha256'] and
                        all(observation[field] == target[field] for field in ('protected_binding_sha256','history_sha256')),
                        'reported image, protected binding or retained history differs')
            db.execute('UPDATE objects SET state=?,result=?,revision=revision+1 WHERE id=?',
                       (observation['state'], canonical(observation), assignment_id))
            if observation['state'] in ('FAILED','ROLLED_BACK') and row['state'] != 'RECOVERY_REQUESTED':
                result.update(resume_state=row['state'], reason='device reported '+observation['state'])
                self._update(db, row, 'HELD', result)
            elif observation['state'] == 'HEALTHY' and row['state'] == 'ROLLOUT':
                if all(self._healthy(db, plan_id, item['device_ref']) for item in payload['targets']):
                    self._update(db, row, 'COMPLETE', result)
            return {'assignment_id': assignment_id, 'reported': observation}

        require(type(request['expected_revision']) is int and request['expected_revision'] == row['revision'], 'stale operator revision')
        if op not in ('plan.hold','plan.recovery'):
            require(now < payload['expires_at'], 'plan approval window expired')
        state = row['state']
        if op in ('plan.approve','plan.resume'):
            require(actor != payload['creator'] and request['plan_sha256'] == digest(payload), 'distinct approver and exact plan hash required')
            if op == 'plan.approve':
                require(state == 'DRAFT', 'plan is not awaiting initial approval'); state = 'APPROVED'
            else:
                require(state == 'HELD' and result.get('resume_state') in ('APPROVED','CANARY','ROLLOUT'), 'held plan cannot resume')
                # Any negative terminal observation requires a new plan, not a
                # button clearing the canary failure from the original history.
                require(not self._negative(db, plan_id), 'negative device outcome requires a new plan')
                state = result['resume_state']
            result.update(approval={'actor':actor,'plan_sha256':digest(payload),'at':now}, reason=None)
        elif op == 'plan.start':
            require(state == 'APPROVED', 'plan is not approved'); state = 'CANARY'
        elif op == 'plan.promote':
            require(state == 'CANARY' and all(self._healthy(db,plan_id,d) for d in payload['canary']), 'all canaries must report healthy before promotion')
            state = 'ROLLOUT'
            if all(self._healthy(db,plan_id,t['device_ref']) for t in payload['targets']): state = 'COMPLETE'
        elif op in ('plan.hold','plan.recovery'):
            require(type(request['reason']) is str and 1 <= len(request['reason']) <= 240, 'bounded operator reason required')
            if op == 'plan.hold':
                require(state in ('APPROVED','CANARY','ROLLOUT'), 'plan cannot be held in this state')
                result['resume_state'] = state; state = 'HELD'
            else:
                require(state != 'DRAFT', 'unapproved draft has no recovery operation'); state = 'RECOVERY_REQUESTED'
            result['reason'] = request['reason']
        self._update(db, row, state, result)
        row['state'], row['revision'] = state, row['revision']+1
        return self._view(row,payload,result)

    def _healthy(self, db, plan_id, device):
        row = db.execute('SELECT state FROM objects WHERE id=?', ('assignment:'+digest([plan_id,device]),)).fetchone()
        return row is not None and row['state'] == 'HEALTHY'

    def _negative(self, db, plan_id):
        return any(json.loads(r['payload'])['plan_id'] == plan_id for r in db.execute(
            "SELECT payload FROM objects WHERE kind='assignment' AND state IN ('FAILED','ROLLED_BACK')"))

    def _update(self, db, row, state, result):
        db.execute('UPDATE objects SET state=?,revision=revision+1,result=? WHERE id=?', (state,canonical(result),row['id']))
