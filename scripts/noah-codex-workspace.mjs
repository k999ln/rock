import { randomUUID } from 'node:crypto';
import { engineSocket, containerArgs, ensureEngine, validateResult } from './noah-isolated-runtime.mjs';
import { VALIDATION_IMAGES } from './noah-project-validation.mjs';
import { InstallError, runCommand } from './noah-source-fetch.mjs';

const env = () => ({ PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' });
const invoke = (root, args, options) => runCommand('docker', ['--host', engineSocket(root), ...args], { env: env(), timeout: 15000, maxOutput: 262144, ...options });
const EXEC = `import base64,json,os,signal,subprocess,sys,tempfile
command=base64.b64decode(sys.argv[1]).decode('utf-8')
with tempfile.TemporaryFile() as output:
 p=subprocess.Popen(['/bin/sh','-lc',command],cwd='/workspace',stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT,start_new_session=True,env={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':'/home/agent','LANG':'C.UTF-8','TMPDIR':'/tmp'})
 timed=False
 try: p.wait(timeout=50)
 except subprocess.TimeoutExpired: timed=True
 finally:
  try: os.killpg(p.pid,signal.SIGKILL)
  except ProcessLookupError: pass
  p.wait()
 output.seek(0); data=output.read(16385)
 print(json.dumps({'exitCode':p.returncode,'timedOut':timed,'truncated':len(data)>16384,'output':data[:16384].decode('utf-8','replace')}))
`;
const COLLECT = `import base64,hashlib,json,os,stat
files=[]; visited=0; total=0
def walk(fd,prefix=''):
 global visited,total
 for name in os.listdir(fd):
  visited+=1
  if visited>256: raise ValueError('too many entries')
  if name.startswith('.'): continue
  s=os.stat(name,dir_fd=fd,follow_symlinks=False)
  if stat.S_ISLNK(s.st_mode): raise ValueError('symlink')
  rel=prefix+name
  if stat.S_ISDIR(s.st_mode):
   if rel.count('/')>8: raise ValueError('depth')
   child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
   try: walk(child,rel+'/')
   finally: os.close(child)
  elif stat.S_ISREG(s.st_mode):
   if len(files)>=12: raise ValueError('too many files')
   child=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
   try:
    if not stat.S_ISREG(os.fstat(child).st_mode): raise ValueError('not file')
    data=os.read(child,32769)
   finally: os.close(child)
   total+=len(data)
   if len(data)>32768 or total>65536: raise ValueError('file size')
   files.append({'name':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'base64':base64.b64encode(data).decode()})
  else: raise ValueError('special file')
fd=os.open('/workspace',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
try: walk(fd)
finally: os.close(fd)
print(json.dumps({'type':'result','exitCode':0,'text':'','files':files}))
`;

export async function prepareCodexWorkspace(root, signal) {
  await ensureEngine(root, signal);
  const image = (await invoke(root, ['image', 'inspect', VALIDATION_IMAGES.python, '--format', '{{.Id}}'], { signal })).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new InstallError('隔離環境の固定版を確認できません。');
  return image;
}
export async function createCodexWorkspace(root, image, signal, command = invoke) {
  const name = `noah-codex-${randomUUID()}`;
  let stopped = false, active = false, calls = 0;
  const args = containerArgs(name, image);
  args[args.indexOf('-i')] = '-d';
  args.splice(args.length - 1, 0, '--workdir', '/workspace', '--env', 'HOME=/home/agent', '--env', 'DISPLAY=', '--env', 'WAYLAND_DISPLAY=', '--env', 'DBUS_SESSION_BUS_ADDRESS=', '--env', 'XAUTHORITY=', '--entrypoint', 'python');
  args.push('-I', '-c', 'import time; time.sleep(600)');
  const stop = async () => {
    if (stopped) return;
    try {
      await command(root, ['rm', '-f', name], { timeout: 10000 }).catch(() => {});
      if ((await command(root, ['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], { timeout: 5000 })).trim()) throw new Error();
      stopped = true;
    } catch { const e = new InstallError('隔離作業領域の停止を確認できません。'); e.unconfirmed = true; throw e; }
  };
  try { await command(root, args, { signal }); signal.throwIfAborted(); }
  catch (e) { await stop(); throw e; }
  return { name, stop,
    async execute(input) {
      signal.throwIfAborted();
      if (stopped || active || ++calls > 12 || !input || Object.keys(input).length !== 1 || typeof input.command !== 'string' || !input.command.trim() || Buffer.byteLength(input.command) > 12000) throw new InstallError('隔離Toolの入力・回数を確認してください。');
      active = true;
      try { return JSON.parse(await command(root, ['exec', name, 'python', '-I', '-c', EXEC, Buffer.from(input.command).toString('base64')], { signal, timeout: 60000 })); }
      finally { active = false; }
    },
    async collect(text) {
      signal.throwIfAborted(); if (stopped || active) throw new InstallError('作業領域を読み出せません。');
      const result = JSON.parse(await command(root, ['exec', name, 'python', '-I', '-c', COLLECT], { signal }));
      return validateResult({ ...result, text });
    },
  };
}
