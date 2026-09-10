"""Owned loopback transport fixture; public distribution and HTTPS remain untested."""
import argparse,hashlib,http.server,json,os,stat,subprocess,sys,threading,time
from pathlib import Path
from urllib.parse import quote,unquote,urlsplit
from urllib.request import urlopen
p=argparse.ArgumentParser();p.add_argument('--package',type=Path,required=True);p.add_argument('--destination',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
source=a.package.resolve(strict=True);dest=a.destination.absolute();assert dest==dest.resolve() and not dest.exists() and not a.report.exists()
manifest=json.loads((source/'release-manifest.json').read_text())['manifest'];archive=manifest['archive']['name']
names=['SHA256SUMS','packaging-result.json','preview-installation-ja.md','preview-legal-notice.md','preview-release-notes.md','preview.py','release-key.der','release-manifest.json',archive]
def digest(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
expected={}
for name in names:
 f=source/name;s=f.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1
 expected[name]={'sha256':digest(f),'bytes':s.st_size}
dest.mkdir(mode=0o700)
class Files(http.server.BaseHTTPRequestHandler):
 def setup(self):
  super().setup();self.connection.settimeout(30)
 def do_GET(self):
  path=urlsplit(self.path)
  name=unquote(path.path.removeprefix('/'))
  if name not in expected or path.query or path.fragment:self.send_error(404);return
  f=source/name
  self.send_response(200);self.send_header('Content-Type','application/octet-stream');self.send_header('Content-Length',str(expected[name]['bytes']));self.end_headers()
  with f.open('rb') as stream:
   while block:=stream.read(1024**2):self.wfile.write(block)
 def log_message(self,*args):pass
server=http.server.HTTPServer(('127.0.0.1',0),Files);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
base='http://127.0.0.1:'+str(server.server_address[1]);started=time.monotonic();events=[]
try:
 for name in names:
  begin=time.monotonic();target=dest/name
  with urlopen(base+'/'+quote(name),timeout=90) as response,target.open('xb') as output:
   assert response.status==200 and response.geturl()==base+'/'+quote(name)
   received=0
   while block:=response.read(1024**2):
    received+=len(block);assert received<=expected[name]['bytes'];output.write(block)
   output.flush();os.fsync(output.fileno())
  assert received==expected[name]['bytes'] and digest(target)==expected[name]['sha256'];target.chmod(0o444)
  events.append({'file':name,**expected[name],'elapsed_seconds':time.monotonic()-begin,'transport':'HTTP_GET_LOOPBACK_ONLY'})
 # Bootstrap bytes were checked against the separately known package inventory before execution.
 cmd=[sys.executable,'-B',str(dest/'preview.py'),'verify','--manifest',str(dest/'release-manifest.json'),'--archive',str(dest/archive),'--trusted-key',str(dest/'release-key.der'),'--trusted-key-sha256',expected['release-key.der']['sha256'],'--manifest-sha256',expected['release-manifest.json']['sha256'],'--allow-public-test-key']
 verified=subprocess.run(cmd,capture_output=True,text=True,check=True,timeout=90)
 report={'schema':'rock-final-loopback-acquisition/1','status':'ALL_FILES_HASHED_AND_SIGNATURE_VERIFIED','source_commit':manifest['source_commit'],'source_directory':str(source),'destination_directory':str(dest),'owned_transport_origin':base,'bound_only_to_loopback':True,'public_upload':False,'public_URL_retrieval_tested':False,'production_HTTPS_download_guard_modified':False,'files':events,'verification_stdout':verified.stdout,'elapsed_seconds':time.monotonic()-started}
finally:
 server.shutdown();server.server_close();thread.join(timeout=5);assert not thread.is_alive()
report['owned_server_closed']=True;a.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('files','verification_stdout')}))
