"""Run the bundled SIM_ONLY tests and retain exact test IDs and code hashes."""
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import sys
import unittest

root=Path(__file__).resolve().parent
out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'test-evidence'
out.mkdir(parents=True,exist_ok=True)
os.environ['COLONY_PROCESS_EVIDENCE']=str(out/'process_evidence.json')
class Result(unittest.TextTestResult):
    def __init__(self,*args,**kwargs):super().__init__(*args,**kwargs);self.cases=[]
    def addSuccess(self,test):
        super().addSuccess(test);self.cases.append({'id':test.id(),'status':'PASS'})
    def addFailure(self,test,err):
        super().addFailure(test,err);self.cases.append({'id':test.id(),'status':'FAIL'})
    def addError(self,test,err):
        super().addError(test,err);self.cases.append({'id':test.id(),'status':'ERROR'})
    def addSkip(self,test,reason):
        super().addSkip(test,reason);self.cases.append({'id':test.id(),'status':'SKIP','reason':reason})
stream=io.StringIO()
suite=unittest.defaultTestLoader.discover(str(root/'tests'))
result=unittest.TextTestRunner(stream=stream,verbosity=2,resultclass=Result).run(suite)
(out/'test_results.txt').write_text(stream.getvalue())
data={'schema':'rockstaros-colony-test-results/1','mode':'SIM_ONLY','hardwareConnected':False,
    'existingOsIntegrated':False,'python':platform.python_version(),'testsRun':result.testsRun,
    'passed':sum(x['status']=='PASS' for x in result.cases),'failures':len(result.failures),
    'errors':len(result.errors),'skipped':len(result.skipped),'cases':result.cases,
    'sourceSha256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(root.rglob('*.py'))}}
(out/'test_results.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:data[k] for k in ['mode','testsRun','passed','failures','errors','skipped']}))
if not result.wasSuccessful():print(stream.getvalue());sys.exit(1)
