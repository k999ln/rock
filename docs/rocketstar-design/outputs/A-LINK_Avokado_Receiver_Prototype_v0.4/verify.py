"""Run the shipped software tests and local-socket demo; record only real results."""
import hashlib
import json
import platform
import sys
import time
import unittest
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import cryptography

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))

class RecordedResult(unittest.TextTestResult):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs);self.passed=[]
    def addSuccess(self,test):
        super().addSuccess(test);self.passed.append(test.id())

def main():
    import os
    os.chdir(ROOT)
    suite=unittest.defaultTestLoader.discover(str(ROOT/"tests"))
    start=time.monotonic()
    result=unittest.TextTestRunner(verbosity=1,resultclass=RecordedResult).run(suite)
    evidence=ROOT/"evidence";evidence.mkdir(exist_ok=True)
    report={"generated_at_utc":datetime.now(timezone.utc).isoformat(),
            "result":"PASS" if result.wasSuccessful() else "FAIL",
            "tests_run":result.testsRun,"passed":len(result.passed),"skipped":len(result.skipped),
            "failures":[t.id() for t,_ in result.failures],"errors":[t.id() for t,_ in result.errors],
            "groups":dict(Counter(t.split('.')[0] for t in result.passed)),
            "wall_seconds":round(time.monotonic()-start,3),
            "python":platform.python_version(),"platform":platform.platform(),
            "cryptography":cryptography.__version__,"test_ids":result.passed,
            "evidence_scope":{"real_localhost_sockets":True,"radio_sdk":"fake object; native API not executed",
                              "clock_for_failover":"controlled monotonic test clock",
                              "process_crash":"os._exit after SQLite commit",
                              "physical_power_cut":False,"physical_network_interfaces":False,
                              "live_satellite":False,"flight":False},
            "source_sha256":{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in sorted(ROOT.rglob('*.py')) if '__pycache__' not in p.parts}}
    (evidence/"verification.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    if result.wasSuccessful():
        from alink.demo import run_demo
        demo=run_demo()
        (evidence/"demo-results.json").write_text(json.dumps(demo,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({k:report[k] for k in ('result','tests_run','passed','groups','wall_seconds')},ensure_ascii=False))
    return 0 if result.wasSuccessful() else 1

if __name__=='__main__':raise SystemExit(main())
