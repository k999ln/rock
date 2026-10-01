import hashlib,importlib.util,json,sys,tempfile,sqlite3
from pathlib import Path
from contextlib import closing
root=Path('/opt/rockstaros-preview/native');sys.path[:0]=[str(root/'os/desktop'),str(root/'os'),str(root/'src')]
import guest,backup
spec=importlib.util.spec_from_file_location('retention',root/'os/desktop/verify-backup.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
state=Path('/var/tmp/rock-star-desktop/preview');data=state/'userdata.ext4'
with backup.locked(state):
 guest.require(not guest.running(json.loads((state/'running.json').read_text())),'writer running')
 before=guest.digest(data)
 with tempfile.TemporaryDirectory(prefix='rock-final-citation-') as temp:
  dbfile=Path(temp)/'hub.db';r.power.export_closed_database(data,'/platform/hub.db',dbfile);dbfile.chmod(0o600)
  with closing(sqlite3.connect(dbfile.as_uri()+'?mode=ro&immutable=1',uri=True)) as db:
   db.execute('PRAGMA query_only=ON');rows=db.execute('SELECT tool_id,version,status,input_bytes,output,error FROM hub_jobs').fetchall()
   assert len(rows)==1
   tool,version,status,input_bytes,output,error=rows[0]
   assert version=='1.0.0' and status=='succeeded' and input_bytes==150 and len(output.encode())==151 and error is None
   assert 'https://example.test/code' in output and '## 出典' in output and '[店舗情報](https://example.test/store)' in output
   after=guest.digest(data);assert before==after
   print(json.dumps({'schema':'rock-final-citation-result-readback/1','status':'PASS','job_count':1,'tool_id':tool,'version':version,'job_status':status,'input_bytes':input_bytes,'output_bytes':len(output.encode()),'output_sha256':hashlib.sha256(output.encode()).hexdigest(),'public_sample_output':output,'stopped_data_before_after_sha256':before,'installed_export_observer_sha256':guest.digest(root/'os/desktop/verify-backup.py')},ensure_ascii=False,indent=2))
