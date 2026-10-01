"""Explicit v3 public-development device authentication and fixed owner routing.

One protected registry owns immutable device-to-contract bindings. This is not
production device identity, a game authorization service or a writer fence.
The actual ContractRuntime/coordinator supplies write admission and handover.
"""
import fcntl
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import stat
import tempfile
import threading
import time
import uuid

from entitlement.protocol import PRINCIPALS, identifier
from .runtime_contracts import (AuthenticatedDevicePrincipal, ContractDescriptor,
                                RuntimeAdmissionRejected, RuntimeUnavailable)

MAX_DEVICES = 32
MAX_HISTORY = 512
MAX_BYTES = 256 * 1024
MARKER = 'OWNER-DEVICES.json'
IMMUTABLE = ('ledger_ref','owner_actor','owner_ref','device_ref')
ROW_FIELDS = set(IMMUTABLE) | {'credential_revision','active','expires_at','token_sha256'}


def require(value, message):
    if not value: raise ValueError(message)


def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()


def protected_json(path):
    def pairs(values):
        result={}
        for key,value in values:
            require(key not in result,'duplicate credential configuration field')
            result[key]=value
        return result
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid==os.geteuid() and
                stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1 and 0<info.st_size<=MAX_BYTES,
                'credential registry input must be an owned private bounded regular file')
        raw=stream.read(MAX_BYTES+1)
        current=os.fstat(stream.fileno())
        stable=('st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink','st_size','st_mtime_ns','st_ctime_ns')
        require(len(raw)==info.st_size and all(getattr(current,k)==getattr(info,k) for k in stable),'credential input changed while reading')
    return json.loads(raw,object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('non-finite credential value')))


def rows(value, *, hashed):
    require(type(value) is list and 1<=len(value)<=MAX_DEVICES,'bounded device registry required')
    result={};tokens=set();owners={};ledgers={}
    for raw in value:
        expected=ROW_FIELDS if hashed else ROW_FIELDS-{'token_sha256'}|{'token'}
        require(type(raw) is dict and set(raw)==expected,'unknown device credential fields')
        row=dict(raw)
        for key in ('ledger_ref','owner_ref','device_ref'):identifier(row[key],fixture=key!='ledger_ref')
        require(type(row['owner_actor']) is str,'public owner actor required')
        owner=PRINCIPALS.get(row['owner_actor'])
        require(owner is not None and owner.get('role')=='owner' and owner.get('owner_ref')==row['owner_ref'],
                'only the matching public owner principal is supported')
        require(type(row['credential_revision']) is int and 1<=row['credential_revision']<2**53 and
                type(row['active']) is bool and type(row['expires_at']) is int and 0<row['expires_at']<2**53,
                'invalid credential revision, activation or expiry')
        if not hashed:
            token=row.pop('token')
            require(type(token) is str and 16<=len(token)<=240 and token.startswith('PUBLIC-FIXTURE-') and
                    all(33<=ord(character)<=126 for character in token),'public development credential required')
            row['token_sha256']=hashlib.sha256(token.encode('ascii')).hexdigest()
        digest=row['token_sha256']
        require(type(digest) is str and len(digest)==64 and all(c in '0123456789abcdef' for c in digest),
                'invalid credential digest')
        ref=row['device_ref'];ledger=row['ledger_ref'];pair=(row['owner_actor'],row['owner_ref'])
        require(ref not in result and digest not in tokens,'device refs and credentials must be globally unique')
        require(owners.get(pair,ledger)==ledger and ledgers.get(ledger,pair)==pair,'one owner per contract required')
        result[ref]=row;tokens.add(digest);owners[pair]=ledger;ledgers[ledger]=pair
    return result


class OwnerRouter:
    def __init__(self, state_dir, credentials_file, *, clock=time.time):
        config=protected_json(credentials_file)
        require(type(config) is dict and set(config)=={'schema_version','kind','devices'} and
                type(config['schema_version']) is int and config['schema_version']==3 and
                config['kind']=='public-development-owner-device-credentials','explicit v3 credential profile required')
        configured=rows(config['devices'],hashed=False)
        require(callable(clock),'trusted credential clock required')
        self.clock,self.mutex=clock,threading.RLock()
        self.closed,self.poisoned,self._runtimes=False,False,None
        self._descriptors={}
        self.lock_fd=None
        path=Path(state_dir).absolute()
        require(not path.is_symlink(),'router directory cannot be a symlink')
        path.mkdir(mode=0o700,parents=False,exist_ok=True)
        self.root=path.resolve(strict=True)
        info=self.root.stat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o700,
                'router registry must be an owned mode 0700 directory')
        previous_names={p.name for p in self.root.iterdir()}
        try:
            self.lock_fd=os.open(self.root/'router.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
            lock=os.fstat(self.lock_fd)
            require(stat.S_ISREG(lock.st_mode) and lock.st_uid==os.geteuid() and stat.S_IMODE(lock.st_mode)==0o600 and
                    lock.st_nlink==1,'invalid router lifetime lock')
            fcntl.flock(self.lock_fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            if MARKER in previous_names:
                stored=protected_json(self.root/MARKER)
                require(type(stored) is dict and set(stored)=={'schema_version','kind','devices','token_history','contracts','canonical_registry','registry_uuid'} and
                        type(stored['schema_version']) is int and stored['schema_version']==3 and
                        stored['kind']=='public-owner-device-registry','invalid v3 device history')
                require(stored['canonical_registry']==str(self.root),'credential registry copy or relocation refused')
                registry_uuid=stored['registry_uuid']
                require(type(registry_uuid) is str and str(uuid.UUID(registry_uuid))==registry_uuid,
                        'canonical credential registry UUID required')
                old=rows(stored['devices'],hashed=True)
                history=stored['token_history'];contracts=stored['contracts']
                require(type(history) is dict and len(history)<=MAX_HISTORY and type(contracts) is dict and
                        all(type(k) is str and len(k)==64 and all(c in '0123456789abcdef' for c in k) and
                            v in old for k,v in history.items()),'invalid retained credential history')
                require(all(history.get(row['token_sha256'])==ref for ref,row in old.items()),'credential history missing')
                require(set(old)<=set(configured),'device bindings cannot be removed')
                for ref,prior in old.items():
                    current=configured[ref]
                    require(all(current[k]==prior[k] for k in IMMUTABLE),'device owner or contract rebinding refused')
                    if current==prior:continue
                    require(current['credential_revision']==prior['credential_revision']+1,
                            'credential changes require the exact next revision')
                    revoked=(prior['active'] is True and current==dict(prior,active=False,credential_revision=prior['credential_revision']+1))
                    rotated=(current['active'] is True and current['token_sha256'] not in history)
                    require(revoked or rotated,'credential rollback, reuse or implicit reactivation refused')
                for ref,current in configured.items():
                    require(history.get(current['token_sha256'],ref)==ref,'credential belongs to another device')
                history=dict(history)
            else:
                require(not previous_names,'router history missing; explicit recovery required')
                history,contracts={},{}
                registry_uuid=str(uuid.uuid4())
            history.update({row['token_sha256']:ref for ref,row in configured.items()})
            require(len(history)<=MAX_HISTORY,'credential history capacity reached')
            self._registry_uuid=registry_uuid
            self._devices,self._history,self._contracts=configured,history,contracts
            self._save(configured,history,contracts)
        except BaseException:
            if self.lock_fd is not None:os.close(self.lock_fd);self.lock_fd=None
            self.closed=True
            raise

    def _available(self):
        if self.closed or self.poisoned:raise RuntimeUnavailable('owner router requires explicit recovery')

    def _save(self, devices, history, contracts):
        value={'schema_version':3,'kind':'public-owner-device-registry',
               'canonical_registry':str(self.root),'registry_uuid':self._registry_uuid,
               'devices':[devices[ref] for ref in sorted(devices)],'token_history':history,'contracts':contracts}
        raw=canonical(value)+b'\n';require(len(raw)<=MAX_BYTES,'credential history capacity reached')
        fd,name=tempfile.mkstemp(prefix='.owner-devices-',dir=self.root)
        try:
            with os.fdopen(fd,'wb') as stream:
                os.fchmod(stream.fileno(),0o600);stream.write(raw);stream.flush();os.fsync(stream.fileno())
            os.replace(name,self.root/MARKER)
            directory=os.open(self.root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
            try:os.fsync(directory)
            finally:os.close(directory)
        except BaseException:
            self.poisoned=True
            raise
        finally:
            if os.path.exists(name):os.unlink(name)

    def registry_identity(self):
        with self.mutex:
            self._available()
            return self.root,self._registry_uuid

    def bind_runtimes(self, runtimes):
        with self.mutex:
            self._available();require(self._runtimes is None,'router runtime binding is already frozen')
            require(type(runtimes) is tuple and 1<=len(runtimes)<=len(PRINCIPALS),'bounded explicit runtime tuple required')
            mapping={};contracts={};identities=set();authorities=set();paths=set()
            for runtime in runtimes:
                descriptor=runtime.descriptor
                require(type(descriptor) is ContractDescriptor and callable(runtime.admit_write),'actual runtime descriptor required')
                d=descriptor
                for value in (d.ledger_uuid,d.wallet_authority_id):
                    require(type(value) is str and str(uuid.UUID(value))==value,'canonical runtime UUID required')
                require(isinstance(d.canonical_state,Path),'canonical runtime path required')
                require(d.canonical_state.is_absolute() and d.canonical_state.resolve()==d.canonical_state and
                        type(d.writer_epoch) is int and d.writer_epoch>0,'canonical runtime identity required')
                require(d.ledger_ref not in mapping and d.ledger_uuid not in identities and
                        d.wallet_authority_id not in authorities and d.canonical_state not in paths,
                        'duplicate runtime, authority or canonical state refused')
                registered=[row for row in self._devices.values() if row['ledger_ref']==d.ledger_ref]
                require(registered and any(row['device_ref']==d.primary_device_ref for row in registered) and
                        all((row['owner_actor'],row['owner_ref'])==(d.owner_actor,d.owner_ref) for row in registered),
                        'runtime owner and primary device must match protected credentials')
                contracts[d.ledger_ref]={key:getattr(d,key) for key in
                    ('ledger_uuid','wallet_authority_id','owner_actor','owner_ref','primary_device_ref')}
                mapping[d.ledger_ref]=runtime;identities.add(d.ledger_uuid);authorities.add(d.wallet_authority_id);paths.add(d.canonical_state)
            require(set(mapping)=={row['ledger_ref'] for row in self._devices.values()},'every configured contract requires its own runtime')
            require(all(contracts.get(ref)==value for ref,value in self._contracts.items()),'contract identity changed on restart')
            self._save(self._devices,self._history,contracts)
            self._contracts=contracts;self._runtimes=mapping
            self._descriptors={ref:runtime.descriptor for ref,runtime in mapping.items()}

    def _current(self, principal):
        self._available()
        if self._runtimes is None:raise RuntimeUnavailable('owner router is not bound')
        if type(principal) is not AuthenticatedDevicePrincipal:raise RuntimeAdmissionRejected('current device credential required')
        row=self._devices.get(principal.device_ref)
        now=self.clock()
        if (type(now) not in (int,float) or not math.isfinite(now) or row is None or not row['active'] or now>=row['expires_at'] or
                type(principal.credential_revision) is not int or
                any(getattr(principal,key)!=row[key] for key in IMMUTABLE+('credential_revision',))):
            raise RuntimeAdmissionRejected('current device credential required')
        if self._runtimes[principal.ledger_ref].descriptor!=self._descriptors[principal.ledger_ref]:
            raise RuntimeAdmissionRejected('bound contract identity changed')
        return row

    def authenticate(self, device_ref, bearer_token, authority_id):
        with self.mutex:
            self._available()
            if self._runtimes is None:raise RuntimeUnavailable('owner router is not bound')
            if (type(device_ref) is not str or len(device_ref)>160 or type(bearer_token) is not str or
                    not 16<=len(bearer_token)<=240 or not all(33<=ord(c)<=126 for c in bearer_token) or
                    type(authority_id) is not str or len(authority_id)!=36 or not authority_id.isascii()):
                raise RuntimeAdmissionRejected('current device credential required')
            row=self._devices.get(device_ref)
            digest=hashlib.sha256(bearer_token.encode('ascii')).hexdigest()
            matched=hmac.compare_digest(digest,row['token_sha256'] if row else '0'*64)
            if row is None or not matched:
                raise RuntimeAdmissionRejected('current device credential required')
            principal=AuthenticatedDevicePrincipal(**{key:row[key] for key in IMMUTABLE+('credential_revision',)})
            self._current(principal)
            runtime=self._runtimes[principal.ledger_ref]
            if not hmac.compare_digest(authority_id,runtime.descriptor.wallet_authority_id):
                raise RuntimeAdmissionRejected('current device credential required')
            return principal

    def resolve(self, principal):
        # Release this short registry lock before acquiring runtime admission.
        with self.mutex:
            self._current(principal)
            return self._runtimes[principal.ledger_ref]

    def assert_current(self, principal, descriptor):
        with self.mutex:
            self._current(principal)
            runtime=self._runtimes[principal.ledger_ref]
            if (type(descriptor) is not ContractDescriptor or descriptor!=runtime.descriptor or
                    descriptor.ledger_ref!=principal.ledger_ref or descriptor.owner_actor!=principal.owner_actor or
                    descriptor.owner_ref!=principal.owner_ref):
                raise RuntimeAdmissionRejected('current contract identity required')

    def revoke_device_credential(self, device_ref, expected_revision):
        """Trusted management only; no owner or game HTTP operation exposes this."""
        with self.mutex:
            self._available()
            require(type(device_ref) is str and type(expected_revision) is int and 1<=expected_revision<2**53-1,
                    'exact device credential revision required')
            require(self._runtimes is not None and device_ref in self._devices,'known bound device required')
            runtime=self._runtimes[self._devices[device_ref]['ledger_ref']]
        # The coordinator gate must precede the registry lock, including when
        # an admitted request is waiting to recheck its principal revision.
        with runtime.admit_write(runtime.descriptor.writer_epoch),self.mutex:
            self._available();prior=self._devices[device_ref]
            if not prior['active'] and prior['credential_revision']==expected_revision+1:
                return {'device_ref':device_ref,'credential_revision':prior['credential_revision'],'active':False}
            require(prior['credential_revision']==expected_revision and prior['active'],'credential revision changed')
            changed=dict(prior,active=False,credential_revision=expected_revision+1)
            updated={**self._devices,device_ref:changed}
            self._save(updated,self._history,self._contracts);self._devices=updated
            return {'device_ref':device_ref,'credential_revision':changed['credential_revision'],'active':False}

    def close(self):
        # The owner server calls this only after its real workers and runtimes
        # close. This registry lock is not a claim that their writers stopped.
        with self.mutex:
            if self.closed:return
            self.closed=True;self._runtimes=None;self._descriptors={}
            if self.lock_fd is not None:os.close(self.lock_fd);self.lock_fd=None
