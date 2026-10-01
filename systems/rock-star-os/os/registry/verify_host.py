"""Record focused real-TLS registry tests. This never starts a VM or guest."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import sys
import unittest

ROOT = Path(__file__).resolve().parent


if __name__ == "__main__":
    evidence = ROOT / "evidence"
    evidence.mkdir(exist_ok=True)
    suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"))
    with (evidence / "host-suite.log").open("w") as stream:
        result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    report = {"verified_utc": datetime.now(timezone.utc).isoformat(), "result": "PASS" if result.wasSuccessful() else "FAIL",
              "tests_run": result.testsRun, "failures": len(result.failures), "errors": len(result.errors),
              "skipped": len(result.skipped), "actual_environment": {"os": platform.system(), "architecture": platform.machine(),
                                                                       "real_loopback_tls": True, "guest_executed": False},
              "fixture_only": True, "new_private_key_generated": False,
              "source_sha256": {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                                for path in sorted(ROOT.glob("*.py"))},
              "ca_sha256": hashlib.sha256((ROOT / "fixtures/development-ca.pem").read_bytes()).hexdigest(),
              "log_sha256": hashlib.sha256((evidence / "host-suite.log").read_bytes()).hexdigest()}
    (evidence / "host-verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "source_sha256"}, indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)
