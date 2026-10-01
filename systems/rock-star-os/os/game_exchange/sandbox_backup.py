"""Full stopped archive with same-host current-copy recovery only.

Archive files are evidence, never replacements for retained C/router/Game DBs.
The source must still be the exact stopped current authority before staging.
"""
from contextlib import ExitStack
import os
from pathlib import Path
import shutil
import stat
from . import protocol as p
from . import current_restore as r
from . import sandbox as s
from .exchange_restore import handover
from wallet_backend.authority_fence import private_directory,read_json,write_json,fsync_directory


def archive_path(config,path,*,create=False):
    path=Path(path);state=Path(config['state'])
    p.require(path.is_absolute() and path.resolve()==path and not path.is_relative_to(state) and not state.is_relative_to(path),
        'separate canonical protected backup directory required')
    return private_directory(path,create=create)


def member(root,name):
    p.require(type(name) is str and name and not Path(name).is_absolute() and all(part not in ('','.','..') for part in name.split('/')),
        'bounded relative archive member required')
    path=root/name;p.require(path.resolve()==path,'archive member symlink forbidden');return path


def check_file(path,expected):
    info=path.lstat();p.require(stat.S_ISREG(info.st_mode) and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o600 and
        info.st_nlink==1 and info.st_size==expected['size'] and s.digest(path)==expected['sha256'],'private archive member bytes changed')


def archive_receipt(manifest,root):
    return {'schema':'rock-game-sandbox-backup-receipt/1','backup_id':manifest['backup_id'],'manifest_sha256':s.digest(root/'manifest.json'),
        'authority_id':s.AUTHORITY,'config_sha256':manifest['config_sha256'],'simulation_only':True}


def verify_archive(config,path):
    root=archive_path(config,path);manifest=read_json(root/'manifest.json')
    p.fields(manifest,{'schema','status','backup_id','authority_id','config_sha256','source_state','source_descriptor','snapshot','files','simulation_only'})
    p.require(manifest['schema']=='rock-game-sandbox-current-backup/1' and manifest['status']=='READY' and manifest['simulation_only'] is True and
        manifest['authority_id']==s.AUTHORITY and manifest['config_sha256']==s.config_digest(config) and manifest['source_state']==config['state'],
        'archive belongs to another retained authority/configuration')
    p.uuid_value(manifest['backup_id']);p.require(type(manifest['files']) is dict and 5<=len(manifest['files'])<=256,'bounded complete archive inventory required')
    expected=set(manifest['files'])
    actual={str(path.relative_to(root/'files')) for path in (root/'files').rglob('*') if not path.is_dir()}
    p.require(actual==expected and {path.name for path in root.iterdir()}=={'plan.json','manifest.json','files'},'archive inventory differs')
    p.require(read_json(root/'plan.json')==manifest,'archive preparation intent differs')
    for name,value in manifest['files'].items():
        p.fields(value,{'sha256','size'});p.digest(value['sha256']);p.integer(value['size'],0,256*1024*1024)
        check_file(member(root/'files',name),value)
    return root,manifest


def snapshot_current(config,path,intent):
    p.uuid_value(intent);root=archive_path(config,path,create=True)
    with s.stopped_snapshot(config) as (state,contract):
        current=s.observe_stopped(state,contract)
        if (root/'manifest.json').exists():
            _,manifest=verify_archive(config,root)
            p.require(manifest['backup_id']==intent and manifest['snapshot']==current,'only exact unchanged backup intent may resume')
            return archive_receipt(manifest,root)
        files={name:{'sha256':s.digest(state/name),'size':(state/name).stat().st_size} for name in sorted(set(current['databases'])|set(current['identities']))}
        p.require(len(files)<=256 and sum(value['size'] for value in files.values())<=256*1024*1024,'bounded current backup required')
        manifest={'schema':'rock-game-sandbox-current-backup/1','status':'READY','backup_id':intent,'authority_id':s.AUTHORITY,
            'config_sha256':s.config_digest(config),'source_state':str(state),'source_descriptor':read_json(contract/'AUTHORITY.json')['descriptor'],
            'snapshot':current,'files':files,'simulation_only':True}
        if (root/'plan.json').exists():p.require(read_json(root/'plan.json')==manifest,'only the same stopped backup can resume')
        else:
            p.require(not list(root.iterdir()),'refuse existing unbound backup contents');write_json(root/'plan.json',manifest)
        private_directory(root/'files',create=True)
        for name,expected in files.items():
            destination=member(root/'files',name)
            for directory in reversed(destination.parent.parents):
                if directory.is_relative_to(root/'files'):private_directory(directory,create=True)
            private_directory(destination.parent,create=True)
            if destination.exists():check_file(destination,expected);continue
            partial=destination.with_name(destination.name+'.part')
            if os.path.lexists(partial):
                info=partial.lstat();p.require(stat.S_ISREG(info.st_mode) and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o600 and
                    info.st_nlink==1 and info.st_size<=expected['size'],'unsafe interrupted archive copy')
                partial.unlink()
            fd=os.open(partial,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,'wb') as output,(state/name).open('rb') as source:
                shutil.copyfileobj(source,output,1024*1024);output.flush();os.fsync(output.fileno())
            check_file(partial,expected);os.replace(partial,destination);fsync_directory(destination.parent)
        p.require(s.observe_stopped(state,contract)==current,'authority changed during stopped backup')
        write_json(root/'manifest.json',manifest);verify_archive(config,root)
        return archive_receipt(manifest,root)


def restore_pending(config):
    directory=Path(config['state'])/'restores'
    if not directory.exists():return False
    private_directory(directory)
    for path in directory.iterdir():
        p.require(path.suffix=='.json' and not path.is_symlink(),'unknown restore journal member')
        record=read_json(path)
        p.require(record.get('schema')=='rock-game-sandbox-restore-journal/1' and record.get('state') in ('PREPARED','DONE'),
            'malformed restore journal requires explicit recovery')
        if record['state']!='DONE':return True
    return False


def desktop_ready(state,device_name=None):
    """The installer aggregates external authority and three OS disk commits."""
    path=Path(state)/'desktop-restore.json'
    if not os.path.lexists(path):return
    value=read_json(path)
    p.fields(value,{'schema','intent','state','source_device','new_device','os_backup_sha256','authority_manifest_sha256','retired_devices'})
    p.require(value['schema']=='rock-game-desktop-restore/1','unknown aggregate restore gate')
    p.uuid_value(value['intent'])
    for field in ('source_device','new_device'):p.identifier(value[field],64)
    for field in ('os_backup_sha256','authority_manifest_sha256'):p.digest(value[field])
    retired=value['retired_devices']
    p.require(type(retired) is list and 1<=len(retired)<=64 and len(set(retired))==len(retired),'bounded unique retired OS names required')
    for name in retired:p.identifier(name,64)
    p.require(value['source_device'] in retired and value['new_device'] not in retired,'aggregate retired/source binding differs')
    p.require(value['state']=='DONE','aggregate OS/authority restore incomplete; keep every writer stopped')
    if device_name is not None:p.require(device_name not in retired,'retired source OS cannot spend after current-copy restore')


def restore_current(config,path,intent,new_device):
    p.uuid_value(intent);p.identifier(new_device,64)
    root,manifest=verify_archive(config,path);state=Path(config['state']);directory=state/'restores'
    private_directory(directory,create=True);journal=directory/(intent+'.json');destination=state/'contracts'/('current-copy-'+intent)
    binding={'intent':intent,'backup_id':manifest['backup_id'],'backup_manifest_sha256':s.digest(root/'manifest.json'),
        'new_device':new_device,'destination':str(destination),'config_sha256':s.config_digest(config)}
    # Before any C mutation, persist the exact intent under every actual writer
    # fence. Every normal sandbox start refuses the incomplete intent.
    with s.stopped_snapshot(config) as (observed_state,contract):
        if journal.exists():
            record=read_json(journal);p.require(record.get('binding')==binding,'restore intent already binds different backup or device')
            if record['state']=='DONE':
                p.require(record['post_snapshot']==s.observe_stopped(observed_state,contract),'completed restore changed; this is not a historical replay API')
                return record['receipt']
        else:
            p.require(not restore_pending(config),'another current restore is unresolved')
            p.require(s.observe_stopped(observed_state,contract)==manifest['snapshot'] and read_json(contract/'AUTHORITY.json')['descriptor']==manifest['source_descriptor'],
                'backup is no longer the exact stopped current authority; historical rollback refused')
            record={'schema':'rock-game-sandbox-restore-journal/1','state':'PREPARED','binding':binding,'receipt':None,'post_snapshot':None}
            write_json(journal,record)
    with s.locked(state/'control.lock'),s.locked(state/'sandbox.lock'):
        p.require(not s.status(config)['running'],'all writers must remain stopped during current-copy restore')
        coordinator=router=gateway=runtime=None;authorities=[]
        try:
            router=s.OwnerRouter(state/'router',state/'credentials.json');coordinator=s.AuthorityFenceCoordinator(state/'coordinator')
            authorities=[s.PublicGameAuthority(state/('game-'+n),n) for n in ('a','b')]
            grants=[s.GameGrantAuthority(a) for a in authorities];gateway=s.GameGateway(state/'game-index',tuple(authorities))
            c_record=coordinator.registry['restores'].get(intent)
            if c_record is None or c_record['stage'] in ('COPYING','READY'):
                coordinator.stage_restore(s.LEDGER,destination,restore_id=intent)
            descriptor=coordinator.promote_restore(intent)
            with gateway.index.transaction() as db:
                prepared=r.exists(db,r.TRANSITION) and db.execute('SELECT 1 FROM '+r.TRANSITION+' WHERE restore_id=?',(intent,)).fetchone()
            if not prepared:r.prepare_current_game_restore(gateway.index,coordinator,intent)
            runtime=s.ContractRuntime.open_current_game_restore(intent,index=gateway.index,coordinator=coordinator,
                provisioning_file=state/'handoff.json',verifier=router)
            connection_receipt=r.resume_current_game_restore(runtime,gateway.index,coordinator,intent)
            epochs={grant.authority.game.game_id:handover(grant,runtime,gateway.index,coordinator,intent,
                expected_before_sha256=r._digest(manifest['snapshot']['databases']['game-'+grant.authority.name+'/game.sqlite3'])) for grant in grants}
            receipt={'schema':'rock-game-sandbox-current-restore-receipt/1','status':'DONE',**binding,'authority_id':s.AUTHORITY,
                'descriptor':s.identity(descriptor),'connection_receipt':connection_receipt,'game_epochs':epochs,
                'source_retired':True,'same_host_current_copy_only':True,'simulation_only':True}
        finally:
            if runtime is not None:runtime.close()
            if gateway is not None:gateway.close()
            for authority in authorities:authority.close()
            if router is not None:router.close()
            if coordinator is not None:coordinator.close()
        with s.stopped_authorities(config) as pair:post=s.observe_stopped(*pair)
        receipt['post_snapshot_sha256']=r._digest(post)
        record.update(state='DONE',receipt=receipt,post_snapshot=post);write_json(journal,record)
        return receipt
