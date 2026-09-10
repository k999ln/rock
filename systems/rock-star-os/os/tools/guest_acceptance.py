#!/usr/bin/env python3
"""Target-only acceptance of three real Tools through the authenticated OS API.

Run as root inside the ARM64 Rock OS guest. No host fallback, VM start, Wallet
mutation, signing, or direct Hub database access. Leaves the three Tools enabled.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import uuid

REPORT = Path("/data/tools-guest-acceptance.json")


def save_report(report):
    temporary = REPORT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(REPORT)


def main():
    if sys.platform != "linux" or os.uname().machine != "aarch64" or os.geteuid() != 0:
        raise RuntimeError("this acceptance script requires root inside the actual ARM64 Linux guest")
    save_report({"status": "RUNNING", "time_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    sys.path.insert(0, "/usr/lib/rock-platform")
    from service import call, PLATFORM_SOCKET, PLATFORM_UID

    checks, receipts = [], []
    prefix = "tools-" + uuid.uuid4().hex
    runtime_paths = ("/usr/sbin/rockd", "/usr/libexec/rock-sandbox-exec",
                     "/usr/lib/rock-platform/service.py",
                     "/usr/lib/rock-platform/blackberryrock/packages.py",
                     "/usr/lib/rock-platform/blackberryrock/recipe_worker.py")

    def runtime_hashes():
        return {path: hashlib.sha256(Path(path).read_bytes()).hexdigest() for path in runtime_paths}

    before_runtime = runtime_hashes()

    def check(name, condition):
        if not condition:
            raise AssertionError(name)
        checks.append(name)
        print("PASS tool " + name, flush=True)

    def request(op, **values):
        payload = {"v": 1, "op": op, **values}
        if op not in ("snapshot", "health"):
            payload.setdefault("key", prefix + ":" + uuid.uuid4().hex)
        return call(PLATFORM_SOCKET, payload, PLATFORM_UID)

    def denied(name, op, **values):
        try:
            request(op, **values)
        except ValueError:
            check(name, True)
        else:
            raise AssertionError(name)

    def finished(job_id):
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            snapshot = request("snapshot")["snapshot"]
            job = next((j for j in snapshot["hub"]["jobs"] if j["id"] == job_id), None)
            if job and job["status"] not in ("running", "cancel_requested"):
                check("actual job succeeded " + job_id, job["status"] == "succeeded")
                return job
            time.sleep(0.1)
        raise AssertionError("real guest Tool did not finish within the acceptance deadline")

    check("authenticated platform health", request("health")["result"]["uid"] == PLATFORM_UID)
    start = request("snapshot")["snapshot"]
    check("actual guest runtime mode", start["hub"]["maturity"] == "virtual_os_integrated"
          and start["hub"]["modes"]["device_local"] == "linux_namespace_seccomp")
    wallet_before = start["wallet"]
    catalog = {(item["manifest"]["id"], item["manifest"]["version"]): item for item in start["catalog"]}
    proposal_id = "org.rockstar.proposal-draft"
    proposal_input = json.dumps({"title": "店舗紹介", "requirements": ["日本語で紹介"],
                                 "deliverables": ["原稿の下書き"]}, ensure_ascii=False)
    code = "```text\n（出典: [コード](https://example.test/code)）\n```\n"
    cases = ((proposal_id, proposal_input),
             ("org.rockstar.citation-organizer", "本文（出典: [店舗](https://example.test/store)）\n" + code),
             ("org.rockstar.utf8-sha256", "abc"))
    initial_jobs, installed_packages = {}, {}
    for tool_id, text in cases:
        check("signed catalog entry " + tool_id, (tool_id, "1.0.0") in catalog)
        install_key = prefix + ":install:" + tool_id
        installed = request("install", id=tool_id, version="1.0.0", key=install_key)["result"]
        check("catalog hash matches install " + tool_id, installed["hash"] == catalog[(tool_id, "1.0.0")]["hash"])
        denied("approval required " + tool_id, "run", id=tool_id, text=text, target="device_local")
        request("approve", id=tool_id, approved_hash=installed["hash"])
        check("install retry receipt " + tool_id,
              request("install", id=tool_id, version="1.0.0", key=install_key)["result"] == installed)
        enabled = next(i for i in request("snapshot")["snapshot"]["hub"]["installed"] if i["id"] == tool_id)
        check("install retry keeps approval " + tool_id, bool(enabled["enabled"]))
        run_key = prefix + ":run:" + tool_id
        values = {"id": tool_id, "text": text, "target": "device_local", "key": run_key}
        first = request("run", **values)["result"]
        check("exact run retry identity " + tool_id, request("run", **values)["result"]["id"] == first["id"])
        job = finished(first["id"])
        check("receipt pins package " + tool_id, job["package_hash"] == installed["hash"])
        denied("conflicting retry rejected " + tool_id, "run", **{**values, "text": text + "changed"})
        if tool_id == proposal_id:
            result = json.loads(job["output"])
            check("proposal uses actual input and remains a draft", result["state"] == "draft"
                  and result["format"] == "standard" and "店舗紹介" in result["proposal"]
                  and "日本語で紹介" in result["proposal"] and "原稿の下書き" in result["proposal"]
                  and result["external_submission"] is False and result["revenue_verified"] is False)
        elif tool_id.endswith("citation-organizer"):
            check("citation Tool preserves code bytes and collects external marker",
                  code in job["output"] and "- [店舗](https://example.test/store)" in job["output"]
                  and job["output"].count("https://example.test/code") == 1)
        else:
            result = json.loads(job["output"])
            check("UTF-8 input-only SHA-256 known vector", result["sha256"] ==
                  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
                  and result["byte_length"] == 3 and result["scope"] == "user_supplied_text_only"
                  and result["file_verified"] is False)
        initial_jobs[tool_id], installed_packages[tool_id] = job, installed
        receipts.append({"tool_id": tool_id, "job_id": job["id"], "status": job["status"],
                         "version": job["version"], "package_hash": job["package_hash"],
                         "output": job["output"], "retry_same_job": True})

    check("signed proposal update in catalog", (proposal_id, "1.1.0") in catalog)
    update_key = prefix + ":update-proposal"
    updated = request("update", id=proposal_id, version="1.1.0", key=update_key)["result"]
    denied("previous version approval rejected", "approve", id=proposal_id,
           approved_hash=installed_packages[proposal_id]["hash"])
    request("approve", id=proposal_id, approved_hash=updated["hash"])
    check("update retry has same durable receipt",
          request("update", id=proposal_id, version="1.1.0", key=update_key)["result"] == updated)
    after = finished(request("run", id=proposal_id, text=proposal_input, target="device_local")["result"]["id"])
    check("independent signed package update changes actual output", after["version"] == "1.1.0"
          and after["package_hash"] == updated["hash"] and json.loads(after["output"])["format"] == "concise"
          and after["output"] != initial_jobs[proposal_id]["output"])
    request("rollback", id=proposal_id, version="1.0.0")
    denied("rollback requires approval", "run", id=proposal_id, text=proposal_input, target="device_local")
    request("approve", id=proposal_id, approved_hash=installed_packages[proposal_id]["hash"])
    restored = finished(request("run", id=proposal_id, text=proposal_input, target="device_local")["result"]["id"])
    check("cached rollback restores actual output", restored["output"] == initial_jobs[proposal_id]["output"]
          and restored["package_hash"] == initial_jobs[proposal_id]["package_hash"])
    after_runtime = runtime_hashes()
    check("OS core and recipe runtime unchanged during package update", after_runtime == before_runtime)
    end = request("snapshot")["snapshot"]
    if wallet_before is None:
        check("offline Wallet display remains unknown during Tool execution", end["wallet"] is None)
    else:
        check("Tool execution never changes Wallet", end["wallet"] == wallet_before)
    audit = [json.loads(item["body"]) for item in end["hub"]["audit"] if item["event"] == "run_approved"]
    for job in initial_jobs.values():
        event = next((a for a in audit if a.get("job_id") == job["id"]), {})
        check("OS execution audit " + job["tool_id"], event.get("actual_host") == "rock_os_linux_namespace"
              and event.get("sent_to_cloud") is False and event.get("amount_minor") == 0)
    report = {"status": "PASS", "checks": checks, "architecture": os.uname().machine,
              "actual_environment": "ARM64 Rock OS guest via authenticated platform IPC",
              "time_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "receipts": receipts, "proposal_update": {"job": after, "rollback_job": restored},
              "runtime_before_sha256": before_runtime, "runtime_after_sha256": after_runtime,
              "wallet_unchanged": True if wallet_before is not None else "NOT_RUN",
              "wallet_observation": "same displayed snapshot" if wallet_before is not None else "unknown offline; authoritative financial equality NOT_RUN",
              "production_trust": False,
              "blackberry_hardware": "NOT_RUN", "physical_usb": "NOT_RUN"}
    save_report(report)
    print("ROCK_TOOLS_GUEST_PASS " + json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except BaseException as error:
        if sys.platform == "linux" and os.uname().machine == "aarch64" and os.geteuid() == 0:
            save_report({"status": "FAIL", "error_type": type(error).__name__, "error": str(error)[:1000],
                         "time_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        print("ROCK_TOOLS_GUEST_FAIL", flush=True)
        raise
