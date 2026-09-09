#!/usr/bin/env python3
"""Pre-registered host-internal Tool versus Workflow experiment (no network)."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import tempfile
import time

from blackberryrock.hub import Hub
from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, digest
from blackberryrock.sdk import sign_development, starter


ROOT = Path(__file__).resolve().parents[1]
OPERATIONS = ("trim_lines", "unique_lines", "sort_lines")
WORDS = ("alpha", "Bravo", "りんご", "東京", "zeta", "7", "Ω", "Ａ")
INPUT = "\n".join("  \t  " if index % 17 == 0 else f" \t{WORDS[(index * 5) % len(WORDS)]}  " for index in range(1200))
EXPECTED = "\n".join(sorted(("", *WORDS)))
SOURCE_FILES = ("src/blackberryrock/hub.py", "src/blackberryrock/packages.py", "src/blackberryrock/sdk.py", "src/blackberryrock/recipe_worker.py")
TERMINAL = {"succeeded", "failed", "cancelled", "interrupted"}


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def now() -> str:
    return datetime.now(UTC).isoformat()


def source_hashes() -> dict:
    return {name: sha256((ROOT / name).read_bytes()) for name in SOURCE_FILES}


def statistics_ms(values: list[float]) -> dict:
    if not values:
        return {"n": 0}
    ordered = sorted(values)
    return {
        "n": len(values), "median_ms": statistics.median(values),
        "p95_ms_nearest_rank": ordered[math.ceil(len(values) * 0.95) - 1],
        "minimum_ms": min(values), "maximum_ms": max(values),
    }


def build_packages() -> dict:
    packages = {}
    for operation in OPERATIONS:
        source = starter(tool_id="org.rockstar.experiment." + operation.replace("_", "-"),
                         name="H2 " + operation, recipe=[{"op": operation}])
        source["manifest"]["description"] = "H2 host-internal measurement: one explicit text operation."
        packages[operation] = sign_development(source)
    workflow = starter(tool_id="org.rockstar.experiment.workflow", name="H2 combined workflow",
                       recipe=[{"op": operation} for operation in OPERATIONS])
    workflow["manifest"]["kind"] = "Workflow"
    workflow["manifest"]["description"] = "H2 host-internal measurement: trim, unique, then sort."
    packages["workflow"] = sign_development(workflow)
    return packages


def job_count(hub: Hub) -> int:
    with hub.connect() as connection:
        return connection.execute("SELECT COUNT(*) FROM hub_jobs").fetchone()[0]


def wait_job(hub: Hub, job_id: str, experiment_deadline: float) -> dict:
    deadline = min(time.perf_counter() + 5.0, experiment_deadline)
    while True:
        job = hub.job(job_id)
        if job["status"] in TERMINAL:
            if job["status"] != "succeeded" or job["error"] is not None:
                raise RuntimeError(f"job {job_id} ended with {job['status']}: {job['error']}")
            return job
        if time.perf_counter() > deadline:
            hub.cancel(job_id)
            raise TimeoutError(f"job {job_id} did not complete within the observation limit")
        time.sleep(0.001)


def run_variant(hub: Hub, packages: dict, variant: str, phase: str, pair: int,
                order: int, experiment_deadline: float) -> dict:
    if time.perf_counter() > experiment_deadline:
        raise TimeoutError("experiment exceeded 180 seconds")
    names = OPERATIONS if variant == "A_three_tools" else ("workflow",)
    before = job_count(hub)
    output = INPUT
    jobs = []
    started = time.perf_counter_ns()
    for step, name in enumerate(names):
        key = f"h2:{phase}:{pair}:{variant}:{step}"
        created = hub.run(packages[name]["manifest"]["id"], output, key)
        job = wait_job(hub, created["id"], experiment_deadline)
        output = job["output"]
        jobs.append({"id": job["id"], "tool_id": job["tool_id"], "status": job["status"],
                     "package_hash": job["package_hash"], "error": job["error"]})
    elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
    count = job_count(hub) - before
    if count != len(names):
        raise RuntimeError(f"unexpected job count for {variant}: {count}")
    if output != EXPECTED:
        raise RuntimeError(f"output did not match the independent known-word oracle: {variant}, pair {pair}")
    return {"phase": phase, "pair": pair, "order_in_pair": order, "variant": variant,
            "elapsed_ms": elapsed_ms, "jobs_started": count, "jobs": jobs,
            "output_sha256": sha256(output.encode()), "output_matches_expected": True}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pairs", type=int, default=30)
    parser.add_argument("--output", type=Path, default=ROOT / "docs/evidence/workflow-experiment.json")
    args = parser.parse_args(argv)
    if not 20 <= args.pairs <= 200:
        parser.error("--pairs must be between 20 and 200; choose the count before measuring")
    if args.output.exists():
        parser.error("evidence already exists; choose a new --output path")
    protocol = (ROOT / "docs/PRODUCT-EXPERIMENTS.md").read_text().split("\n## 結果\n", 1)[0]
    started_utc = now()
    started_clock = time.perf_counter()
    before_hashes = source_hashes()
    result = {
        "experiment_id": "H2_workflow_host_internal_v1", "scope": "host_internal_comparison_only",
        "started_utc": started_utc, "completed_utc": None, "status": "incomplete",
        "pre_registration": {"text": protocol, "sha256": sha256(protocol.encode())},
        "script_sha256": sha256(Path(__file__).read_bytes()), "source_sha256_before": before_hashes,
        "environment": {"python": platform.python_version(), "python_implementation": platform.python_implementation(),
                        "os": platform.platform(), "machine": platform.machine(), "logical_cpu_count": os.cpu_count(),
                        "openssl": subprocess.run(["openssl", "version"], capture_output=True, text=True, check=True).stdout.strip(),
                        "runtime": "Hub with real isolated Python recipe_worker subprocesses; no HTTP/browser"},
        "method": {"pairs_requested": args.pairs, "warmup_pairs": 3, "order": "AB then BA, alternating per pair",
                   "clock": "perf_counter_ns", "poll_interval_ms": 1, "job_observation_timeout_seconds": 5,
                   "worker_timeout_seconds": 3, "experiment_limit_seconds": 180,
                   "timed_scope": "first Hub.run call through final succeeded observation; no installation",
                   "statistics": "median, nearest-rank p95, min/max, paired shortening percent; no outlier exclusion or significance claim"},
        "input": {"lines": 1200, "bytes": len(INPUT.encode()), "sha256": sha256(INPUT.encode()),
                  "expected_output": EXPECTED, "expected_output_sha256": sha256(EXPECTED.encode())},
        "trust": "Public RFC 8032 SDK test fixture only; no new key, production publisher identity, or real money",
        "samples": [], "warmup_samples": [], "failures": [],
    }
    with tempfile.TemporaryDirectory(prefix="rock-h2-experiment-") as directory:
        hub = None
        try:
            packages = build_packages()
            result["packages"] = {name: {"id": package["manifest"]["id"], "kind": package["manifest"]["kind"],
                                         "recipe": package["recipe"], "package_sha256": digest(package)} for name, package in packages.items()}
            hub = Hub(Path(directory) / "experiment.db", {TEST_PUBLISHER: PUBLIC_TEST_KEY})
            for package in packages.values():
                installed = hub.install(package)
                hub.enable(installed["id"], installed["hash"])
            for phase, count in (("warmup", 3), ("measured", args.pairs)):
                for pair in range(1, count + 1):
                    order = ("A_three_tools", "B_one_workflow") if pair % 2 else ("B_one_workflow", "A_three_tools")
                    pair_samples = []
                    for position, variant in enumerate(order, 1):
                        sample = run_variant(hub, packages, variant, phase, pair, position, started_clock + 180)
                        result["warmup_samples" if phase == "warmup" else "samples"].append(sample)
                        pair_samples.append(sample)
                    if pair_samples[0]["output_sha256"] != pair_samples[1]["output_sha256"]:
                        raise RuntimeError(f"variant output mismatch in {phase} pair {pair}")
            result["status"] = "completed"
        except (Exception, KeyboardInterrupt) as error:
            result["failures"].append({"type": type(error).__name__, "message": str(error)})
        finally:
            if hub is not None:
                with hub.connect() as connection:
                    unfinished = [row[0] for row in connection.execute("SELECT id FROM hub_jobs WHERE status NOT IN ('succeeded','failed','cancelled','interrupted')")]
                for job_id in unfinished:
                    hub.cancel(job_id)
                with hub.connect() as connection:
                    result["observed_job_status_counts"] = dict(connection.execute("SELECT status, COUNT(*) FROM hub_jobs GROUP BY status").fetchall())
                if unfinished:
                    result["failures"].append({"type": "UnfinishedJobs", "message": f"cancelled {len(unfinished)} unfinished jobs"})
                    result["status"] = "incomplete"
    result["completed_utc"] = now()
    result["total_elapsed_seconds"] = time.perf_counter() - started_clock
    result["source_sha256_after"] = source_hashes()
    stable_source = result["source_sha256_after"] == before_hashes
    if not stable_source:
        result["status"] = "invalid_source_changed"
        result["failures"].append({"type": "SourceChanged", "message": "measured implementation changed during the experiment"})
    samples = result["samples"]
    a = [sample["elapsed_ms"] for sample in samples if sample["variant"] == "A_three_tools"]
    b = [sample["elapsed_ms"] for sample in samples if sample["variant"] == "B_one_workflow"]
    pairs = {}
    for sample in samples:
        pairs.setdefault(sample["pair"], {})[sample["variant"]] = sample["elapsed_ms"]
    paired = [pair for pair in pairs.values() if len(pair) == 2]
    stats_a, stats_b = statistics_ms(a), statistics_ms(b)
    shorter = bool(a and b and stats_b["median_ms"] < stats_a["median_ms"])
    result["summary"] = {
        "A_three_tools": stats_a, "B_one_workflow": stats_b, "complete_pairs": len(paired),
        "median_shortening_percent": (1 - statistics.median(b) / statistics.median(a)) * 100 if a and b else None,
        "median_paired_shortening_percent": statistics.median((1 - pair["B_one_workflow"] / pair["A_three_tools"]) * 100 for pair in paired) if paired else None,
        "workflow_slower_pairs": sum(pair["B_one_workflow"] > pair["A_three_tools"] for pair in paired),
        "job_starts_per_comparison": {"A_three_tools": 3, "B_one_workflow": 1},
        "job_start_reduction_percent": 100 * (1 - 1 / 3),
    }
    all_samples = result["warmup_samples"] + samples
    criteria = {
        "all_outputs_equal_expected": bool(all_samples) and all(sample["output_matches_expected"] for sample in all_samples) and not result["failures"],
        "observed_job_counts_3_to_1": bool(all_samples) and all(sample["jobs_started"] == (3 if sample["variant"] == "A_three_tools" else 1) for sample in all_samples),
        "workflow_median_shorter": shorter,
        "no_timeouts_failures_or_unfinished_jobs": not result["failures"] and set(result.get("observed_job_status_counts", {})) == {"succeeded"},
        "minimum_20_complete_pairs": len(paired) >= 20,
        "all_requested_pairs_completed": len(paired) == args.pairs,
        "implementation_stable_during_measurement": stable_source,
    }
    result["criteria"] = criteria
    result["hypothesis_supported_within_test_conditions"] = result["status"] == "completed" and all(criteria.values())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x") as output:
        json.dump(result, output, ensure_ascii=False, indent=2, allow_nan=False)
        output.write("\n")
    print(json.dumps({"status": result["status"], "supported_within_test_conditions": result["hypothesis_supported_within_test_conditions"],
                      "summary": result["summary"], "failures": result["failures"], "evidence": str(args.output)}, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
