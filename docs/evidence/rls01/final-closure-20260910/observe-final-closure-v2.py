#!/usr/bin/env python3
"""Read only, finite closure of the fixed 9ab candidate and stopped C instance."""
import datetime,fcntl,hashlib,importlib.util,json,os,pathlib,socket,sys
sys.dont_write_bytecode=True
sys.pycache_prefix='/var/tmp/rock-final-readonly-no-cache-use-20260910'
from contextlib import ExitStack
P=pathlib.Path
source=P('/var/tmp/rock-final-9abf78a')
native=source/'systems/rock-star-os'
images=P('/var/tmp/rock-final-9abf78a-profile')
config=P('/var/tmp/rock-release-os-20260910/final-9abf78a-empty-authority/root-c-device.json')
authority=P('/var/tmp/rockstaros-preview-authority/sandbox.json')
def sha(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def load_module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);sys.modules[name]=module
    spec.loader.exec_module(module);return module
r={'schema':'rock-final-linux-readonly-closure/2','started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'FAIL'}
try:
    frozen=json.loads((images/'freeze-manifest.json').read_text())
    assert frozen['source_commit']=='9abf78a80d27aa9f847c4051d20e4c552e407276'
    assert len(frozen['source_files_sha256'])==1364
    mismatches=[name for name,value in frozen['source_files_sha256'].items() if sha(source/name)!=value]
    assert not mismatches,mismatches
    extra_files=sorted(str(p.relative_to(source)) for p in source.rglob('*') if p.is_file() and str(p.relative_to(source)) not in frozen['source_files_sha256'])
    extras=[{'path':name,'bytes':(source/name).stat().st_size,'mtime_ns':(source/name).stat().st_mtime_ns} for name in extra_files]
    assert all('/__pycache__/' in name and name.endswith('.pyc') or name.startswith('systems/rock-star-os/artifacts/os/') for name in extra_files),extra_files
    triple={name:sha(images/name) for name in frozen['files_sha256']}
    assert triple==frozen['files_sha256']
    freeze_sha=sha(images/'freeze-manifest.json');profile_sha=sha(images/'profile.json')
    assert freeze_sha=='d258a303794a3a16bbec792807bc39427fa3bf3ea3c3d86492be07948f1736fc'
    assert profile_sha=='0d6f4924d98f1cd43d4e3104b9a9c3b4f2a4b2557e96f64bd626f9930f4b34bb'
    r.update(source_commit=frozen['source_commit'],source_files_verified=1364,generated_files_outside_frozen_source_inventory=extras,source_mismatches=mismatches,freeze_sha256=freeze_sha,profile_sha256=profile_sha,image_sha256=triple)
    assert sha(config)=='1fbd4924c545823b313a6852b428aadce3f9ef2bc1dc11d57b2d078fb7316b8f'
    device=json.loads(config.read_text());name=device['name']
    assert name=='rock-final-c-ui'
    guest=load_module('closure_guest',native/'os/desktop/guest.py')
    state=guest.BASE/name
    assert state.is_dir() and (state/'lock').is_file()
    before_metadata={p:sha(p) for p in (config,authority,state/'device.json',state/'running.json') if p.is_file()}
    record=json.loads((state/'running.json').read_text()) if (state/'running.json').exists() else None
    # Avoid guest.status/state_path: they attempt mkdir(exist_ok=True).
    assert not guest.running(record)
    with (state/'lock').open('rb') as lock:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    sandbox=load_module('closure_sandbox',native/'os/game_exchange/sandbox.py')
    settings=sandbox.load(authority);current=sandbox.status(settings)
    assert current['running'] is False
    # Existing lock files only; do not use stopped_snapshot(create=True).
    lock_paths=[P(settings['state'])/n for n in ('control.lock','sandbox.lock')]
    with ExitStack() as stack:
        for path in lock_paths:stack.enter_context(sandbox.locked(path,create=False))
        stack.enter_context(sandbox.stopped_authorities(settings))
        authority_lifetime_locks_available=True
    conflicts=[]
    for p in P('/proc').iterdir():
        if not p.name.isdigit():continue
        try:parts=(p/'cmdline').read_bytes().split(b'\0')
        except (FileNotFoundError,ProcessLookupError,PermissionError):continue
        if (parts and P(os.fsdecode(parts[0])).name=='qemu-system-aarch64') or any(parts[i:i+2]==[b'-m',b'unittest'] for i in range(len(parts)-1)):
            conflicts.append(int(p.name))
    assert not conflicts,conflicts
    ports=[]
    for port in (9443,9444,9641,9642,9643):
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
        ports.append(port)
    assert all(sha(path)==value for path,value in before_metadata.items())
    r.update(c_device={'name':name,'config':str(config),'config_sha256':sha(config),'state':str(state),'running':False,'existing_device_lock_available':True},authority={'config':str(authority),'config_sha256':sha(authority),'status':current,'all_existing_lifetime_locks_available':authority_lifetime_locks_available},qemu_and_unittest_processes=conflicts,free_ports=ports,observed_config_and_session_metadata_unchanged=True,source_and_image_mutations=0,authority_and_userdata_mutations=0,guest_start_stop_actions=0,financial_operations=0,uid=os.geteuid(),gid=os.getegid(),status='PASS_READONLY_CLOSURE',scope='Current C has intentional synthetic nonzero state after acceptance; this check verifies stop/fence and frozen bytes, not an empty initial state or new transactional acceptance.')
except Exception as exc:
    r['error']=type(exc).__name__+': '+str(exc)
r['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
print(json.dumps(r,indent=2))
sys.exit(0 if r['status']=='PASS_READONLY_CLOSURE' else 1)
