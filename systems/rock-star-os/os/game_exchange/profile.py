#!/usr/bin/env python3
"""Derive/verify one immutable public Game image from a source-checked base."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[2]
sys.path[:]=[str(ROOT/'src'),str(ROOT/'os')]+[entry for entry in sys.path if Path(entry).resolve()!=Path(__file__).resolve().parent]
from service_access import profile as base
from game_exchange import protocol as p
from game_exchange.device_client import configuration,AUTHORITY,DEVICE,WALLET_TOKEN
from game_exchange.sandbox import validate as sandbox_configuration,public_device_config,config_digest,sample

SOURCE_BINDINGS={**base.SOURCE_BINDINGS,
    **{'/usr/lib/rock-platform/game_exchange/'+name+'.py':'os/game_exchange/'+name+'.py' for name in
       ('__init__','protocol','exchange_protocol','storage','client','http','reference_sdk','device_client')},
    **{'/usr/lib/rock-platform/blackberryrock/'+name+'.py':'src/blackberryrock/'+name+'.py' for name in ('wallet','deadline')},
    **{'/usr/lib/rock-platform/wallet_auth/'+name+'.py':'os/wallet_auth/'+name+'.py' for name in ('fixture','protocol')},
    **{'/usr/lib/rock-platform/entitlement/'+name+'.py':'os/entitlement/'+name+'.py' for name in ('device','store')},
}
FORBIDDEN=tuple('/usr/lib/rock-platform/game_exchange/'+name+'.py' for name in
    ('fixture','exchange_signer','exchange_authority','exchange_service','exchange_worker','exchange_server','exchange_gateway','exchange_ledger','exchange_restore','sandbox_backup','sandbox','profile'))
DIRECTORIES=('/etc','/etc/rock-platform','/etc/rock-authenticator','/usr','/usr/share','/usr/share/rock','/usr/lib',
    '/usr/lib/rock-platform','/usr/lib/rock-platform/service_access','/usr/lib/rock-platform/game_exchange',
    '/usr/lib/rock-platform/wallet_backend','/usr/lib/rock-platform/wallet_auth','/usr/lib/rock-platform/blackberryrock','/usr/lib/rock-platform/entitlement')
PATHS=set(SOURCE_BINDINGS)|set(FORBIDDEN)|set(DIRECTORIES)|{base.WALLET_PATH,base.TOKEN_PATH,base.AUTH_PATH,base.SERVICE_PATH,base.REQUIRED_PATH,base.MCP_PATH,'/etc/rock-wallet'}


def metadata(image,path):
    p.require(path in PATHS,'fixed Game profile path required')
    result=base._debug(image,'stat '+path);raw=result.stdout.decode()
    if b'File not found by ext2_lookup' in result.stderr:return None
    kind=re.search(r'Type:\s+(\S+)\s+Mode:\s+([0-7]+)',raw);owner=re.search(r'User:\s+(\d+)\s+Group:\s+(\d+)',raw);links=re.search(r'Links:\s+(\d+)',raw)
    p.require(kind and owner and links,'exact Game profile inode metadata required')
    return {'type':kind[1],'mode':int(kind[2],8),'uid':int(owner[1]),'gid':int(owner[2]),'links':int(links[1])}

def cat(image,path):
    p.require(path in PATHS,'fixed Game profile content path required');return base._debug(image,'cat '+path).stdout


def source_guard(image,*,configured):
    if not configured:base._image_preflight(image)
    for path in DIRECTORIES:
        info=metadata(image,path);p.require(info is not None and info['type']=='directory' and info['mode']==0o755 and info['uid']==info['gid']==0,
            'protected Game source parent required: '+path)
    for path in (base.SERVICE_PATH,base.REQUIRED_PATH,base.MCP_PATH,*FORBIDDEN):
        p.require(metadata(image,path) is None,'Game image contains an unconfigured provider or host authority module: '+path)
    sources={}
    for path,relative in SOURCE_BINDINGS.items():
        info=metadata(image,path);expected=(ROOT/relative).read_bytes()
        p.require(info is not None and info['type']=='regular' and info['links']==1 and info['uid']==info['gid']==0 and
            info['mode']&0o444==0o444 and not info['mode']&0o022 and cat(image,path)==expected,'embedded source mismatch: '+relative)
        sources[relative]=hashlib.sha256(expected).hexdigest()
    info=metadata(image,base.AUTH_PATH)
    p.require(info is not None and info['type']=='regular' and info['links']==1 and info['uid']==info['gid']==0 and
        not info['mode']&0o022,'protected existing authenticator configuration required')
    auth=p.decode(cat(image,base.AUTH_PATH))
    p.require(auth=={'schema_version':1,'kind':'public-software-test-authenticator','device_ref':DEVICE},'exact existing public test authenticator required')
    if configured:
        info=metadata(image,'/etc/rock-wallet');p.require(info is not None and info['type']=='directory' and info['uid']==info['gid']==0 and info['mode']==0o755,'protected Wallet configuration directory required')
        for path in (base.WALLET_PATH,base.TOKEN_PATH):
            info=metadata(image,path);p.require(info=={'type':'regular','mode':0o600,'uid':1003,'gid':1003,'links':1},'private UID1003 Wallet credential/config required')
    return sources


def prepare(base_images,output_dir,*,expected_sha256,source_commit,sandbox_config):
    p.require(sys.platform=='linux','Linux profile tools required');p.require(re.fullmatch('[0-9a-f]{40}',source_commit),'exact source commit required')
    sandbox_configuration(sandbox_config);wallet=public_device_config();configuration(wallet)
    inputs=base._inputs(base_images,expected_sha256);output=base._path(output_dir,exists=False)
    p.require(not output.exists() and not output.is_relative_to(Path(base_images)) and output.parent.is_dir(),'fresh separate profile output directory required')
    signer,update=base._update_helpers();rootfs=Path(inputs['rootfs.ext4']['path']);stage0=Path(inputs['stage0.cpio.gz']['path'])
    signer.check_filesystem(rootfs);original=base._stage0(stage0);old=update.decode(original['factory'],8192);manifest=update.verify_envelope(old)
    p.require(manifest['sha256']==inputs['rootfs.ext4']['sha256'] and manifest['size']==inputs['rootfs.ext4']['size'],'base signed factory/rootfs differs')
    sources=source_guard(rootfs,configured=False);output.mkdir(mode=0o700)
    try:
        for name in ('Image','rootfs.ext4'):
            with Path(inputs[name]['path']).open('rb') as incoming,(output/name).open('xb') as outgoing:
                shutil.copyfileobj(incoming,outgoing,1024*1024);outgoing.flush();os.fsync(outgoing.fileno())
            p.require(base.digest(output/name)==inputs[name]['sha256'],'base copy changed')
        image=output/'rootfs.ext4';base._debug(image,'mkdir /etc/rock-wallet',write=True)
        for field,value in (('mode','040755'),('uid','0'),('gid','0')):base._debug(image,'set_inode_field /etc/rock-wallet '+field+' '+value,write=True)
        payloads={base.WALLET_PATH:p.canonical(wallet)+b'\n',base.TOKEN_PATH:(WALLET_TOKEN+'\n').encode()};records=[]
        with tempfile.TemporaryDirectory(prefix='game-profile-payload-',dir=output) as temp:
            for index,(path,raw) in enumerate(payloads.items()):
                p.require(metadata(image,path) is None,'refuse existing Game configuration destination');name='payload-'+str(index);(Path(temp)/name).write_bytes(raw)
                result=base._debug(image,'write '+name+' '+path,write=True,cwd=temp);p.require(b'Allocated inode' in result.stdout,'Game profile file was not allocated')
                for field,value in (('mode','0100600'),('uid','1003'),('gid','1003')):base._debug(image,'set_inode_field '+path+' '+field+' '+value,write=True)
                p.require(cat(image,path)==raw,'Game profile readback differs');records.append({'path':path,'sha256':hashlib.sha256(raw).hexdigest(),'size':len(raw),**metadata(image,path)})
        p.require(source_guard(image,configured=True)==sources,'embedded source changed during profile injection');signer.check_filesystem(image)
        new=signer.envelope_for(image,manifest['sequence'],manifest['version']);replacement=base.canonical(new)+b'\n'
        base._stage0(stage0,destination=output/'stage0.cpio.gz',replacement=replacement);readback=base._stage0(output/'stage0.cpio.gz')
        p.require(readback['factory']==replacement and readback['other_entries_sha256']==original['other_entries_sha256'] and readback['entry_count']==original['entry_count'],
            'stage0 changed outside signed factory')
        p.require(update.verify_envelope(update.decode(readback['factory'],8192))==new['manifest'],'Game factory verification failed')
        images={}
        for name in base.IMAGE_NAMES:
            path=output/name;path.chmod(0o444);images[name]={'path':str(path),'sha256':base.digest(path),'size':path.stat().st_size}
        for name,raw in (('wallet-backend.json',payloads[base.WALLET_PATH]),('sandbox.json',p.canonical(sandbox_config)+b'\n')):
            (output/name).write_bytes(raw);(output/name).chmod(0o444)
        p.require(images['Image']['sha256']==inputs['Image']['sha256'] and all(base.digest(ROOT/relative)==expected for relative,expected in sources.items()),'input source or kernel changed')
        report={'schema':'rock-game-authority-image-profile/1','status':'PREPARED','profile':'development-game-authority','simulation_only':True,
            'boot_verified':False,'source_commit':source_commit,'source_sha256':sources,'base_images':inputs,'images':images,
            'authority_id':AUTHORITY,'device_ref':DEVICE,'wallet_configuration_sha256':hashlib.sha256(payloads[base.WALLET_PATH]).hexdigest(),
            'sandbox_configuration':sandbox_config,'sandbox_configuration_sha256':config_digest(sandbox_config),'injected_files':records,
            'initial_state':'empty-unregistered-no-consent','signing':'existing-public-RFC8032-development-fixture',
            'stage0':{'input_factory':old,'output_factory':new,'input_factory_sha256':hashlib.sha256(original['factory']).hexdigest(),
                'output_factory_sha256':hashlib.sha256(replacement).hexdigest(),'other_entries_sha256':original['other_entries_sha256'],'entry_count':original['entry_count']},
            'base_images_unchanged':True,'device_data_created':False}
    finally:p.require(base._inputs(base_images,expected_sha256)==inputs,'base image triple changed during profile preparation')
    with (output/'profile.json').open('xb') as stream:stream.write(base.canonical(report)+b'\n');stream.flush();os.fsync(stream.fileno())
    (output/'profile.json').chmod(0o444);return report


def verified(config):
    p.require(config.get('schema')=='rock-desktop-device/7' and config.get('network')=='game-authority' and 'services' not in config,'explicit Game authority device required')
    boot=config['boot'];p.fields(boot,{'mode','profile','factory_sha256','profile_sha256'})
    p.require(boot['mode']=='signed-stage0' and boot['profile']=='development-game-authority','explicit Game stage0 profile required')
    for key in ('factory_sha256','profile_sha256'):p.digest(boot[key])
    game=config['game'];p.fields(game,{'config','sha256','authority_id'});p.digest(game['sha256']);p.require(game['authority_id']==AUTHORITY,'fixed public Game authority required')
    path=Path(config['images']);inputs=base._inputs(path,config['sha256']);profile=path/'profile.json'
    info=profile.lstat();p.require(profile.is_file() and not profile.is_symlink() and not info.st_mode&0o222 and base.digest(profile)==boot['profile_sha256'],'immutable Game profile digest mismatch')
    record=base.os_client.decode(profile.read_bytes())
    p.require(record['schema']=='rock-game-authority-image-profile/1' and record['status']=='PREPARED' and record['profile']=='development-game-authority' and
        record['authority_id']==AUTHORITY and record['device_ref']==DEVICE and record['sandbox_configuration_sha256']==game['sha256'],'Game profile identity mismatch')
    sandbox_configuration(record['sandbox_configuration'])
    p.require(game['config']==str(Path(record['sandbox_configuration']['state'])/'sandbox.json') and config_digest(record['sandbox_configuration'])==game['sha256'],'Game sandbox config pin differs')
    if os.path.lexists(game['config']):p.require(base.digest(Path(game['config']))==game['sha256'],'present Game sandbox config changed')
    factory=base._stage0(path/'stage0.cpio.gz');raw=factory['factory'];_,update=base._update_helpers();envelope=update.decode(raw,8192);manifest=update.verify_envelope(envelope)
    p.require(hashlib.sha256(raw).hexdigest()==boot['factory_sha256']==record['stage0']['output_factory_sha256'] and envelope==record['stage0']['output_factory'], 'Game signed factory pin differs')
    p.require(manifest['sha256']==inputs['rootfs.ext4']['sha256'] and manifest['size']==inputs['rootfs.ext4']['size'],'Game signed rootfs differs')
    p.require(factory['other_entries_sha256']==record['stage0']['other_entries_sha256'] and factory['entry_count']==record['stage0']['entry_count'],'Game stage0 members differ')
    for name in base.IMAGE_NAMES:p.require((inputs[name]['sha256'],inputs[name]['size'])==(record['images'][name]['sha256'],record['images'][name]['size']),'Game image triple differs')
    p.require(source_guard(path/'rootfs.ext4',configured=True)==record['source_sha256'],'Game embedded source differs from profile')
    raw=cat(path/'rootfs.ext4',base.WALLET_PATH);configuration(p.decode(raw))
    p.require(hashlib.sha256(raw).hexdigest()==record['wallet_configuration_sha256'] and cat(path/'rootfs.ext4',base.TOKEN_PATH)==(WALLET_TOKEN+'\n').encode(),'Game owner config/token differs')
    p.require(base._inputs(path,config['sha256'])==inputs,'Game image triple changed during validation')
    return {'profile':'development-game-authority','factory':envelope,'factory_sha256':boot['factory_sha256'],'profile_sha256':boot['profile_sha256'],
        'rootfs_size':manifest['size'],'images':inputs,'source_sha256':record['source_sha256'],'external_authority':True,'simulation_only':True,'boot_verified':False}


def device_config(images,name='game-release'):
    images=Path(images).resolve();record=base.os_client.decode((images/'profile.json').read_bytes())
    return {'schema':'rock-desktop-device/7','name':name,'images':str(images),'sha256':{n:record['images'][n]['sha256'] for n in base.IMAGE_NAMES},
        'network':'game-authority','viewer':'browser','boot':{'mode':'signed-stage0','profile':'development-game-authority',
            'factory_sha256':record['stage0']['output_factory_sha256'],'profile_sha256':base.digest(images/'profile.json')},
        'game':{'config':str(Path(record['sandbox_configuration']['state'])/'sandbox.json'),'sha256':record['sandbox_configuration_sha256'],'authority_id':AUTHORITY}}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=('prepare','device-config'))
    parser.add_argument('--base',type=Path);parser.add_argument('--images',type=Path,required=True);parser.add_argument('--expected',type=Path)
    parser.add_argument('--source-commit');parser.add_argument('--name',default='game-release');args=parser.parse_args()
    if args.action=='device-config':result=device_config(args.images,args.name)
    else:
        p.require(args.base is not None and args.expected is not None,'base and pinned expected triple required')
        result=prepare(args.base,args.images,expected_sha256=json.loads(args.expected.read_text()),source_commit=args.source_commit,sandbox_config=sample())
    print(base.canonical(result).decode())

if __name__=='__main__':main()
