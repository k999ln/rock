"""One-time owner installation of the fixed Sky Linux startup service."""
import os,json,subprocess,time,hashlib,shutil
from pathlib import Path
root=Path.home()/'sky-private'
lock=json.loads((root/'app/toolkits/sky-linux-local/node-lock.json').read_text())
node=root/'node'/lock['archiveName'].removesuffix('.tar.xz')/'bin/node'
assert node.is_file() and (root/'app/server.mjs').is_file()
# Keep the pinned preparation archive inside Linux after one-time installation.
# Daily startup must not depend on developer files in Android Downloads.
runtime_lock=json.loads((root/'app/toolkits/sky-linux-local/runtime-lock.json').read_text())
distribution=root/'distribution'
distribution.mkdir(mode=0o700,exist_ok=True)
archive=distribution/'runtime.tar.gz'
def verified(path):
 if not path.is_file() or path.stat().st_size!=runtime_lock['bytes']:return False
 digest=hashlib.sha256()
 with path.open('rb') as source:
  for block in iter(lambda:source.read(1024*1024),b''):digest.update(block)
 return digest.hexdigest()==runtime_lock['sha256']
if not verified(archive):
 source=Path(__file__).parent/'runtime.tar.gz'
 assert verified(source),'AIを準備するファイルを確認できませんでした。'
 temporary=distribution/'runtime.tar.gz.installing'
 try:
  shutil.copyfile(source,temporary)
  os.chmod(temporary,0o600)
  assert verified(temporary),'AIを準備するファイルを保存できませんでした。'
  os.replace(temporary,archive)
 finally:temporary.unlink(missing_ok=True)
user=__import__('pwd').getpwuid(os.getuid()).pw_name
unit=f'''[Unit]
Description=Owner private Sky
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
User={user}
WorkingDirectory={root}/app
Environment=SKY_PIXEL_DISTRIBUTION={distribution}
ExecStart={node} {root}/app/server.mjs
Restart=always
RestartSec=3
TimeoutStopSec=20
KillMode=mixed
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths={root}
MemoryMax=2G
CPUQuota=200%
TasksMax=64
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
'''
temp=root/'sky-private.service';temp.write_text(unit)
pidfile=root/'server.pid'
if pidfile.exists():
 pid=int(pidfile.read_text());cmd=Path(f'/proc/{pid}/cmdline')
 if cmd.exists() and str(root/'app/server.mjs').encode() in cmd.read_bytes():
  os.kill(pid,15)
  for _ in range(50):
   if not cmd.exists():break
   time.sleep(.1)
subprocess.run(['sudo','-n','install','-m','644',str(temp),'/etc/systemd/system/sky-private.service'],check=True)
subprocess.run(['sudo','-n','systemctl','daemon-reload'],check=True)
subprocess.run(['sudo','-n','systemctl','enable','sky-private.service'],check=True)
subprocess.run(['sudo','-n','systemctl','restart','sky-private.service'],check=True)
value={'enabled':subprocess.check_output(['systemctl','is-enabled','sky-private.service'],text=True).strip(),'active':subprocess.check_output(['systemctl','is-active','sky-private.service'],text=True).strip(),'bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
(root/'startup-receipt.json').write_text(json.dumps(value,indent=2));print('Skyを画面から起動できるように準備しました。')
