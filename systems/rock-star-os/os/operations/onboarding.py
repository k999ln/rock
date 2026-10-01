"""Capability planning and idempotent activation, not a device-flashing tool.

Observations come from the caller's protected/authenticated adapter. They are not
hardware attestation merely because a JSON boolean says verification succeeded.
"""
import json
from .release import verify_envelope
from .state import Database, canonical, digest, exact, identifier, require, sha256

DEFAULT_CATALOG = {'rock-virt-aarch64': {
    'physical_device': False, 'verified_os': True,
    'evidence_sha256': '9bb216e323e5c7de933efcafc9428a7f94b188c080586058f1aa749624552974',
    'install_routes': ['unlocked']}}
OBSERVATION_FIELDS = {'device_ref','hardware_id','bootloader_state','preinstalled_os',
    'measured_image_sha256','protected_binding_sha256','local_health_ready',
    'observation_verified','oem_install_authorized','purchase_current','identity_current',
    'identity_reference'}


class OnboardingPlanner:
    def __init__(self, expected_profile, *, catalog=None):
        exact(expected_profile, {'device_ref','hardware_id','release','protected_binding_sha256'})
        self.profile = json.loads(canonical(expected_profile))
        identifier(self.profile['device_ref']); identifier(self.profile['hardware_id'])
        sha256(self.profile['protected_binding_sha256'])
        self.release = verify_envelope(self.profile['release'])
        self.catalog = json.loads(canonical(DEFAULT_CATALOG if catalog is None else catalog))
        require(type(self.catalog) is dict and len(self.catalog) <= 128, 'bounded trusted hardware catalog required')
        for name, item in self.catalog.items():
            identifier(name)
            exact(item, {'physical_device','verified_os','evidence_sha256','install_routes'})
            require(type(item['physical_device']) is bool and type(item['verified_os']) is bool,
                    'strict hardware capability booleans required')
            sha256(item['evidence_sha256'])
            require(type(item['install_routes']) is list and len(item['install_routes']) <= 2 and
                    len(set(item['install_routes'])) == len(item['install_routes']) and
                    set(item['install_routes']) <= {'unlocked','oem_signed'}, 'unknown installation route')

    def observation(self, value):
        exact(value, OBSERVATION_FIELDS)
        result = json.loads(canonical(value))
        identifier(result['device_ref']); identifier(result['hardware_id'])
        require(result['bootloader_state'] in ('locked','unlocked','unknown'), 'unknown bootloader state')
        for name in ('preinstalled_os','local_health_ready','observation_verified',
                     'oem_install_authorized','purchase_current','identity_current'):
            require(type(result[name]) is bool, 'strict observation booleans required')
        for name in ('measured_image_sha256','protected_binding_sha256'):
            if result[name] is not None: sha256(result[name])
        if result['identity_reference'] is not None: identifier(result['identity_reference'])
        return result

    def plan(self, observation):
        value = self.observation(observation)
        hardware = self.catalog.get(value['hardware_id'])
        base = {'schema':'rock-device-onboarding-plan/1', 'device_ref':value['device_ref'],
                'profile_sha256':digest(self.profile), 'route':'BLOCKED', 'steps':[],
                'reason':None, 'physical_device':hardware['physical_device'] if hardware else None,
                'os_write_performed':False, 'shortcut_is_os_installation':False,
                'wallet_registration_requested':False,'wallet_terms_accepted':False,
                'monthly_consent_accepted':False,'evidence_kind':'supplied protected-adapter observation'}
        def blocked(reason):
            return {**base, 'reason':reason}
        if value['device_ref'] != self.profile['device_ref']: return blocked('DEVICE_BINDING_MISMATCH')
        if not hardware or not hardware['verified_os']: return blocked('HARDWARE_NOT_VERIFIED')
        if value['hardware_id'] != self.profile['hardware_id']: return blocked('WRONG_TARGET_HARDWARE')
        if not value['observation_verified']: return blocked('DEVICE_OBSERVATION_REQUIRED')
        binding = value['protected_binding_sha256']
        if binding is not None and binding != self.profile['protected_binding_sha256']:
            return blocked('EXISTING_OWNER_OR_AUTHORITY_BINDING_DIFFERS')
        if value['preinstalled_os']:
            if value['measured_image_sha256'] != self.release['sha256']: return blocked('PREINSTALLED_IMAGE_MISMATCH')
            if binding != self.profile['protected_binding_sha256']: return blocked('PROTECTED_CONFIGURATION_REQUIRED')
            if not value['local_health_ready']: return blocked('LOCAL_HEALTH_RECOVERY_REQUIRED')
            if not value['purchase_current'] or not value['identity_current'] or value['identity_reference'] is None:
                return blocked('PURCHASE_AND_IDENTITY_HANDOFF_REQUIRED')
            return {**base, 'route':'TAP_ACTIVATION', 'steps':[{
                'id':'activate_device','label':'使い始める','effect':'device activation only'}]}
        if value['oem_install_authorized'] and 'oem_signed' in hardware['install_routes']:
            route = 'OEM_INSTALL_REVIEW'
        elif value['bootloader_state'] == 'unlocked' and 'unlocked' in hardware['install_routes']:
            route = 'UNLOCKED_INSTALL_REVIEW'
        elif value['bootloader_state'] == 'unknown': return blocked('BOOTLOADER_STATE_REQUIRED')
        else: return blocked('LOCKED_WITHOUT_AUTHORIZED_INSTALL_ROUTE')
        return {**base, 'route':route, 'reason':'INSTALL_EXECUTOR_NOT_CONNECTED',
                'image_sha256':self.release['sha256'], 'requires_separate_device_write_approval':True,
                'steps':[{'id':'review_image','label':'対応機種とOS画像を確認'},
                         {'id':'preserve_data','label':'既存データと回復手段を確認'},
                         {'id':'approve_install','label':'必要な初期化とOS書込みを別途承認'}]}


class ActivationStore:
    def __init__(self, state, expected_profile, *, observe, catalog=None, clock=None, capacity=2048):
        require(callable(observe), 'protected observation adapter required')
        self.planner = OnboardingPlanner(expected_profile, catalog=catalog)
        self.observe = observe
        self.db = Database(state, {'schema':'rock-device-activation/1',
                                  'device_ref':self.planner.profile['device_ref'],
                                  'hardware_id':self.planner.profile['hardware_id'],
                                  'protected_binding_sha256':self.planner.profile['protected_binding_sha256']},
                           authorize=self._authorize, capacity=capacity,
                           **({'clock':clock} if clock is not None else {}))
        # Approved OS updates preserve activation. The device/profile binding
        # stays fixed; the original activation receipt keeps its original image.
        with self.db.connection() as db, db:
            db.execute('BEGIN IMMEDIATE')
            previous = db.execute("SELECT value FROM meta WHERE key='release_floor'").fetchone()
            sequence = self.planner.release['sequence']
            require(previous is None or sequence >= int(previous[0]), 'activation observed release counter rollback')
            if previous is None or sequence > int(previous[0]):
                db.execute("INSERT INTO meta(key,value) VALUES ('release_floor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                           (str(sequence),))

    def _current(self, context):
        return self.planner.observation(self.observe(context))

    def _authorize(self, context, action, _resource):
        require(action == 'activation.activate', 'unsupported activation action')
        current = self._current(context)
        plan = self.planner.plan(current)
        if plan['route'] != 'TAP_ACTIVATION':
            raise PermissionError(plan['reason'])
        # A changed inherited owner reference cannot replay the original
        # owner's receipt merely by presenting the same device request key.
        return 'device:' + digest([current['device_ref'],current['identity_reference']])

    def snapshot(self, context=None):
        current = self._current(context)
        require(current['device_ref'] == self.planner.profile['device_ref'], 'different device cannot read activation')
        plan = self.planner.plan(current)
        with self.db.connection() as db:
            db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
            row = db.execute("SELECT * FROM objects WHERE kind='activation'").fetchone()
            if row is None:
                return {'state':'NOT_ACTIVATED','onboarding':plan,'recovery_required':plan['route']=='BLOCKED',
                        'wallet_registration_requested':False,'wallet_terms_accepted':False,'monthly_consent_accepted':False}
            record = json.loads(row['payload'])
            matching = record['identity_reference'] == current['identity_reference'] and plan['route'] == 'TAP_ACTIVATION'
            if record['identity_reference'] != current['identity_reference']:
                plan = {**plan, 'route':'BLOCKED', 'reason':'INHERITED_OWNER_BINDING_CHANGED', 'steps':[]}
            return {'state':'ACTIVE','activated_at':record['activated_at'],
                    'activated_profile_sha256':record['profile_sha256'],
                    'current_profile_sha256':digest(self.planner.profile),
                    'identity_reference_sha256':digest(record['identity_reference']) if matching else None,
                    'onboarding':plan,'recovery_required':not matching,'activation_record_preserved':True,
                    'wallet_registration_requested':False,'wallet_terms_accepted':False,'monthly_consent_accepted':False}

    def activate(self, key, *, context=None):
        request = {'op':'activation.activate','key':identifier(key)}
        def apply(db, actor, now):
            current = self._current(context)
            require(self.planner.plan(current)['route'] == 'TAP_ACTIVATION' and
                    'device:' + digest([current['device_ref'],current['identity_reference']]) == actor,
                    'protected identity changed during activation')
            row = db.execute("SELECT * FROM objects WHERE kind='activation'").fetchone()
            if row is None:
                record = {'device_ref':current['device_ref'],'profile_sha256':digest(self.planner.profile),
                          'identity_reference':current['identity_reference'],'activated_at':now}
                db.execute('INSERT INTO objects VALUES (?,?,?,?,?,?)',
                           ('activation','activation',canonical(record),'ACTIVE',0,'{}'))
            else:
                record = json.loads(row['payload'])
                require(record['identity_reference'] == current['identity_reference'], 'inherited owner binding changed')
            return {'state':'ACTIVE','device_ref':record['device_ref'],'activated_at':record['activated_at'],
                    'profile_sha256':record['profile_sha256'],
                    'identity_reference_sha256':digest(record['identity_reference']),
                    'wallet_registration_requested':False,'wallet_terms_accepted':False,
                    'monthly_consent_accepted':False,'meaning':'device activated; Wallet setup remains separate'}
        return self.db.run(request,context,apply)
