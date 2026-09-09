"""Run the repository unittest suite and save concrete Tool lifecycle evidence.

This uses the same tests as `python -m unittest discover -s tests -v`.
It starts bounded loopback test servers; it never starts a Linux VM.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "os/tools/evidence"


class EvidenceResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.evidence = {}

    def addSuccess(self, test):
        super().addSuccess(test)
        if hasattr(test, "evidence"):
            self.evidence[test.id()] = test.evidence


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"))
    with (OUTPUT / "host-suite.log").open("w") as log:
        result = unittest.TextTestRunner(stream=log, verbosity=2, resultclass=EvidenceResult).run(suite)
    record = {"verified_utc": datetime.now(timezone.utc).isoformat(),
              "actual_environment": {"system": platform.system(), "machine": platform.machine(),
                                     "python": platform.python_version(), "linux_guest_executed": False},
              "suite": "unittest discover -s tests -v", "tests_run": result.testsRun,
              "failures": len(result.failures), "errors": len(result.errors), "skipped": len(result.skipped),
              "result": "PASS" if result.wasSuccessful() else "FAIL", "evidence": result.evidence,
              "log_sha256": hashlib.sha256((OUTPUT / "host-suite.log").read_bytes()).hexdigest()}
    (OUTPUT / "host-verification.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps({key: value for key, value in record.items() if key not in {"evidence", "actual_environment"}}, indent=2))
    sys.exit(0 if result.wasSuccessful() else 1)
