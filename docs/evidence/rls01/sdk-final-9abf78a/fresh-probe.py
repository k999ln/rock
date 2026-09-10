import hashlib,importlib.util,json,os,shutil,subprocess,sys,time,uuid,tarfile
sys.dont_write_bytecode=True
from pathlib import Path
root_source=Path(__file__).resolve().parents[1]
download=root_source.parent/'github-candidate-download-01'
known=root_source/'work/preview-final1'
for name in ('preview.py','release-manifest.json','release-key.der'):
 assert hashlib.sha256((download/name).read_bytes()).hexdigest()==hashlib.sha256((known/name).read_bytes()).hexdigest(),'downloaded trust input changed since original package creation'
spec=importlib.util.spec_from_file_location('preview',download/'preview.py')
preview=importlib.util.module_from_spec(spec);spec.loader.exec_module(preview)
release_envelope=preview.decode((download/'release-manifest.json').read_bytes())
release=preview.verify_release(download/'release-manifest.json',download/release_envelope['manifest']['archive']['name'],download/'release-key.der','06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9',manifest_sha256=preview.digest(known/'release-manifest.json'),allow_public_test_key=True)
root=preview.protected('/Users/kaiya/Library/RockstarOS/rls01-sdk-final1',new=True)
root.mkdir(mode=0o700);(root/'payload').mkdir(mode=0o700);(root/'lima').mkdir(mode=0o700)
source=release['source_commit']
expected={name:record['sha256'] for name,record in release['files'].items() if name.startswith('native/')}
def inventory(directory):return {'native/'+str(path.relative_to(directory)):preview.digest(path) for path in directory.rglob('*') if path.is_file()}
with tarfile.open(download/release['archive']['name'],'r:gz') as bundle:
 for member in bundle:
  if member.name not in expected:continue
  preview.require(member.isfile(),'SDK native member is not regular')
  target=root/'payload'/member.name
  target.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
  with bundle.extractfile(member) as incoming,target.open('xb') as outgoing:
   shutil.copyfileobj(incoming,outgoing)
  target.chmod(0o555 if member.mode&0o111 else 0o444)
preview.require(inventory(root/'payload/native')==expected,'fresh SDK copy differs from delivered final native inventory')
for path in (root/'payload/native').rglob('*'):
 if path.is_dir():path.chmod(0o755)
 elif path.is_file():path.chmod(0o555 if path.stat().st_mode&0o111 else 0o444)
(root/'payload/native').chmod(0o755)
preview.save(root/'vm-template.yaml',preview.vm_config(root))
record={'schema':preview.OWNERSHIP,'id':uuid.uuid4().hex,'root':str(root),'uid':os.geteuid(),'vm_name':'os',
        'state':'SDK_ONLY_PROBE','source_commit':source,'release_manifest_sha256':preview.digest(download/'release-manifest.json'),'native_inventory_count':len(expected),'host':preview.host_check(),'created_unix':time.time()}
preview.save(root/'installation.json',record)
with (root/'provision.log').open('x') as log:
 result=subprocess.run(['limactl','start','--tty=false','--name=os','--timeout=20m',str(root/'vm-template.yaml')],
     env=dict(os.environ,LIMA_HOME=str(root/'lima')),stdout=log,stderr=subprocess.STDOUT,timeout=1250)
for name,field in (('lima.yaml','vm_config_sha256'),('vz-identifier','vm_identity_sha256')):
 record[field]=preview.digest(root/'lima/os'/name)
preview.save(root/'installation.json',record)
preview.require(result.returncode==0,'probe VM startup failed')
preview.verify_vm(root,record)
preview.lima(root,'shell','--workdir','/','os','/bin/sh','-c',
 'set -eu; test ! -e /opt/rockstaros-preview; sudo cp -R /mnt/rockstaros-package /opt/rockstaros-preview; sudo chmod 755 /opt/rockstaros-preview')
release={'game':{'sha256':preview.digest(root/'payload'/preview.GAME_CONFIG_MEMBER)},
         'files':{'native/os/game_exchange/sandbox.py':{'sha256':preview.digest(root/'payload/native/os/game_exchange/sandbox.py')}}}
preview.save(root/'probe-release.json',release)
prepared=preview.prepare_sandbox(root,release);preview.save(root/'prepared.json',prepared)
print(json.dumps({'phase':'PREPARED','receipt':prepared}),flush=True)
result=preview.lima(root,'shell','--workdir','/opt/rockstaros-preview/native','os','python3','-B',
    '/opt/rockstaros-preview/native/examples/game/acceptance.py','--sandbox-config',preview.GAME_CONFIG,
    '--work','/var/tmp/game-sdk-onboarding-01',timeout=150)
preview.save(root/'sdk-result.json',preview.decode(result.stdout.encode()))
print(result.stdout,flush=True)
