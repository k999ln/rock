"""Record isolated backend and existing-Wallet integration tests, never a VM."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import unittest

ROOT = Path(__file__).resolve().parent


if __name__ == "__main__":
    evidence = ROOT / "evidence"
    evidence.mkdir(exist_ok=True)
    suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"))
    with (evidence / "host-suite.log").open("w") as stream:
        result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    report = {"verified_utc": datetime.now(timezone.utc).isoformat(),
              "result": "PASS" if result.wasSuccessful() else "FAIL", "tests_run": result.testsRun,
              "failures": len(result.failures), "errors": len(result.errors), "skipped": len(result.skipped),
              "environment": {"os": platform.system(), "architecture": platform.machine(),
                              "actual_sqlite": True, "existing_wallet_called": True, "guest_executed": False},
              "simulation_only": True, "real_kyc_provider": "NOT RUN - provider unselected",
              "real_payment_provider": "NOT RUN - provider unselected", "real_device_attestation": "NOT RUN",
              "source_sha256": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                                for p in sorted(ROOT.rglob("*.py"))},
              "log_sha256": hashlib.sha256((evidence / "host-suite.log").read_bytes()).hexdigest()}
    (evidence / "host-verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "source_sha256"}, indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)
