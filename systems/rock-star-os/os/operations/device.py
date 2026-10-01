"""Protected OS adapter for activation; no Wallet mutation and no flash API.

The publisher is root-only and stage0-only. The UID1002 consumer checks its
root-owned public facts against this boot, the protected purchaser configuration,
the retained private binding, and the authenticated live authority projection.
"""
import json
from functools import lru_cache
import os
from pathlib import Path
import stat
import tempfile
import threading
import uuid

from service_access import os_client
from service_access.status import validate as validate_service_status
from .onboarding import ActivationStore
from .release import Updater, verify_envelope
from .state import canonical, digest, exact, identifier, require, sha256

BOOT_PATH = Path('/run/rock-activation-boot.json')
BOOT_SCHEMA = 'rock-activation-boot-facts/1'
BOOT_FIELDS = {'schema','boot_id','hardware_id','slot','sequence','image_sha256','release',
               'local_health_confirmed','root_readonly','data_policy_verified','facts_sha256'}
NO_SNAPSHOT = object()


def protected_bytes(path, *, uid, mode, limit=16384):
    parent = Path(path).parent.lstat()
    require(stat.S_ISDIR(parent.st_mode) and parent.st_uid == uid and not parent.st_mode & 0o022,
            'PROTECTED_PARENT_DIRECTORY_REQUIRED')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor,'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == uid and
                stat.S_IMODE(info.st_mode) == mode and 0 < info.st_size <= limit,
                'PROTECTED_FILE_INVALID')
        raw = stream.read(limit+1)
        require(len(raw) <= limit,'PROTECTED_FILE_OVERSIZE')
    return raw


def protected_json(path, *, uid, mode, limit=16384):
    return os_client.decode(protected_bytes(path,uid=uid,mode=mode,limit=limit))


def current_boot_id(path, *, uid):
    descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(descriptor,'rb') as stream:
        info=os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_uid==uid and
                not info.st_mode & 0o022,'CURRENT_BOOT_ID_INVALID')
        raw=stream.read(81)
    require(len(raw)<=80,'CURRENT_BOOT_ID_INVALID')
    return raw.decode('ascii').strip()


@lru_cache(maxsize=16)
def _verified_manifest(encoded):
    # Cache only exact signed bytes. Every call still validates file protection,
    # current boot identity, image binding, health flags and the full facts hash.
    return canonical(verify_envelope(json.loads(encoded)))


def validate_boot_facts(facts, boot_id):
    exact(facts, BOOT_FIELDS)
    require(facts['schema'] == BOOT_SCHEMA and facts['boot_id'] == boot_id and
            type(boot_id) is str and str(uuid.UUID(boot_id)) == boot_id, 'CURRENT_VERIFIED_BOOT_REQUIRED')
    require(facts['hardware_id'] == 'rock-virt-aarch64' and facts['slot'] in ('A','B'), 'VERIFIED_HARDWARE_REQUIRED')
    manifest = json.loads(_verified_manifest(canonical(facts['release'])))
    require(type(facts['sequence']) is int and facts['sequence'] == manifest['sequence'] and
            facts['image_sha256'] == manifest['sha256'], 'BOOT_IMAGE_BINDING_MISMATCH')
    require(all(facts[field] is True for field in ('local_health_confirmed','root_readonly','data_policy_verified')),
            'CONFIRMED_LOCAL_HEALTH_REQUIRED')
    sha256(facts['facts_sha256'])
    require(digest({k:v for k,v in facts.items() if k!='facts_sha256'}) == facts['facts_sha256'],
            'BOOT_FACTS_HASH_MISMATCH')
    return manifest


def publish_boot_status():
    """Fixed root init helper. Missing direct-kernel proof remains unavailable."""
    require(os.geteuid() == 0 and os.uname().machine == 'aarch64','ROOT_ARM64_PUBLISHER_REQUIRED')
    compatible = Path('/proc/device-tree/compatible').read_bytes().split(b'\0')
    require(b'linux,dummy-virt' in compatible,'VERIFIED_HARDWARE_REQUIRED')
    boot_id = current_boot_id('/proc/sys/kernel/random/boot_id',uid=0)
    updater = Updater(); state = updater.read_state(); slot = updater.running_slot(state)
    good = protected_json('/run/rock-boot-good.json',uid=0,mode=0o600)
    require(state['committed'] == slot and state['pending'] is None and
            good == {'slot':slot,'sequence':state['floor']},'CURRENT_VERIFIED_BOOT_REQUIRED')
    envelope = state['slots'][slot]
    manifest = updater.verify_slot(slot,envelope)
    require(manifest['sequence'] == state['floor'],'BOOT_IMAGE_BINDING_MISMATCH')
    mounts = {row[1]:row for line in Path('/proc/mounts').read_text().splitlines()
              if len(row:=line.split()) >= 4}
    readonly = '/' in mounts and 'ro' in mounts['/'][3].split(',')
    data_ok = ('/data' in mounts and mounts['/data'][0] == '/dev/vdb' and
               mounts['/data'][2] == 'ext4' and {'rw','nosuid','nodev','noexec'} <= set(mounts['/data'][3].split(',')))
    require(readonly and data_ok,'VERIFIED_MOUNTS_REQUIRED')
    facts = {'schema':BOOT_SCHEMA,'boot_id':boot_id,'hardware_id':'rock-virt-aarch64',
             'slot':slot,'sequence':manifest['sequence'],'image_sha256':manifest['sha256'],
             'release':envelope,'local_health_confirmed':True,
             'root_readonly':readonly,'data_policy_verified':data_ok}
    facts['facts_sha256']=digest(facts)
    validate_boot_facts(facts,boot_id)
    parent = BOOT_PATH.parent.stat()
    require(parent.st_uid == 0 and not parent.st_mode & 0o022,'PROTECTED_BOOT_DIRECTORY_REQUIRED')
    if BOOT_PATH.exists() or BOOT_PATH.is_symlink():
        protected_json(BOOT_PATH,uid=0,mode=0o444)
    fd, temporary = tempfile.mkstemp(prefix='.rock-activation-',dir=BOOT_PATH.parent)
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write((canonical(facts)+'\n').encode()); os.fchmod(stream.fileno(),0o444)
            stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary,BOOT_PATH)
        directory = os.open(BOOT_PATH.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        Path(temporary).unlink(missing_ok=True)
    print('ROCK_ACTIVATION_BOOT_VERIFIED '+facts['facts_sha256'],flush=True)
    return facts


class DeviceActivation:
    def __init__(self, state_dir, *, wallet_snapshot, config_path='/etc/rock-platform/service-access.json',
                 binding_path='/data/platform/purchaser-service-binding.json', boot_path=BOOT_PATH,
                 boot_id_path='/proc/sys/kernel/random/boot_id', root_uid=0, private_uid=None, clock=None):
        self.state_dir = Path(state_dir)
        self.wallet_snapshot = wallet_snapshot
        self.config_path, self.binding_path, self.boot_path = map(Path,(config_path,binding_path,boot_path))
        self.boot_id_path = Path(boot_id_path)
        self.root_uid, self.private_uid = root_uid, os.geteuid() if private_uid is None else private_uid
        self.clock = clock
        self.lock = threading.RLock()
        self.active_store = None; self.profile_hash = None

    def _observation(self, wallet):
        config = os_client.validate(protected_json(self.config_path,uid=self.root_uid,mode=0o444,limit=8192))
        require(protected_bytes(self.config_path.with_suffix('.required'),uid=self.root_uid,mode=0o444,limit=128)
                == (os_client.CONFIG_SCHEMA+'\n').encode(), 'PURCHASER_PROFILE_REQUIRED')
        marker = protected_json(self.binding_path,uid=self.private_uid,mode=0o600,limit=8192)
        require(marker == os_client.binding(config),'PURCHASER_BINDING_MISMATCH')
        facts = protected_json(self.boot_path,uid=self.root_uid,mode=0o444)
        boot_id = current_boot_id(self.boot_id_path,uid=self.root_uid)
        manifest = validate_boot_facts(facts,boot_id)
        require(type(wallet) is dict and wallet.get('simulation_only') is True,'LIVE_AUTHORITY_REQUIRED')
        backend = wallet.get('backend')
        require(type(backend) is dict and backend.get('connected') is True and
                backend.get('stale') is False and backend.get('pending_reconciliation') is False,
                'LIVE_AUTHORITY_REQUIRED')
        status = validate_service_status(wallet.get('service_access'),authority_id=config['authority_id'],
                                         consumer_id=config['consumer_id'],device_ref=config['device_ref'])
        eligible = status['device_eligible'] and not status['clock_rollback']
        # This is an opaque reference to the authenticated, immutable service
        # scope. It is NOT a KYC document, biometric proof, or original event hash.
        reference = 'scope-' + digest([status['authority_id'],status['consumer_id'],status['device_ref']])
        profile = {'device_ref':config['device_ref'],'hardware_id':facts['hardware_id'],
                   'release':facts['release'],'protected_binding_sha256':digest(marker)}
        observation = {'device_ref':config['device_ref'],'hardware_id':facts['hardware_id'],
                       'bootloader_state':'unknown','preinstalled_os':True,
                       'measured_image_sha256':manifest['sha256'],'protected_binding_sha256':digest(marker),
                       'local_health_ready':facts['local_health_confirmed'],'observation_verified':True,
                       'oem_install_authorized':False,'purchase_current':eligible,'identity_current':eligible,
                       'identity_reference':reference if eligible else None}
        return profile, observation

    def _store(self, wallet):
        profile, observation = self._observation(wallet)
        profile_hash = digest(profile)
        if self.active_store is None or profile_hash != self.profile_hash:
            self.active_store = ActivationStore(self.state_dir,profile,observe=lambda context:context,
                **({'clock':self.clock} if self.clock is not None else {}))
            self.profile_hash = profile_hash
        return self.active_store, observation

    def _minimal(self, value):
        plan = value['onboarding']; reason = plan['reason']
        return {'state':value['state'],'can_activate':value['state']=='NOT_ACTIVATED' and plan['route']=='TAP_ACTIVATION',
                'recovery_required':value['recovery_required'],'reason':reason,'label':'使い始める',
                'identity_reference_kind':'authenticated_service_scope_digest',
                'wallet_registration_requested':False,'wallet_terms_accepted':False,
                'monthly_consent_accepted':False,'os_write_performed':False}

    @staticmethod
    def unavailable(reason='VERIFIED_ACTIVATION_CONTEXT_UNAVAILABLE'):
        return {'state':'UNAVAILABLE','can_activate':False,'recovery_required':True,'reason':reason,
                'label':'使い始める','identity_reference_kind':'authenticated_service_scope_digest',
                'wallet_registration_requested':False,'wallet_terms_accepted':False,
                'monthly_consent_accepted':False,'os_write_performed':False}

    def snapshot(self, *, wallet=NO_SNAPSHOT):
        with self.lock:
            try:
                store, observation = self._store(self.wallet_snapshot() if wallet is NO_SNAPSHOT else wallet)
                return self._minimal(store.snapshot(observation))
            except (OSError,ValueError,RuntimeError,TypeError,KeyError):
                return self.unavailable()

    def dispatch(self, request, *, peer_uid):
        if type(peer_uid) is not int or peer_uid != 1000:
            raise PermissionError('activation requires the owner UID1000 channel')
        require(type(request) is dict and type(request.get('v')) is int and request['v']==1,'activation protocol version required')
        op = request.get('op')
        if op == 'device.activation.snapshot':
            exact(request,{'v','op'})
            return {'ok':True,'result':self.snapshot()}
        require(op == 'device.activation.activate','unsupported activation operation')
        exact(request,{'v','op','key'}); identifier(request['key'])
        with self.lock:
            # The provider may be a bounded-age authenticated Wallet view. An
            # expired/invalidated view is rejected above, never an admission grant.
            store, observation = self._store(self.wallet_snapshot())
            receipt = store.activate(request['key'],context=observation)
            view = self._minimal(store.snapshot(observation))
            return {'ok':True,'result':{**view,'request_key':request['key'],'receipt':receipt['result']}}
