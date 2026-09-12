#!/usr/bin/env python3
"""Exercise the launch-critical local Hub process across a real restart.

This uses only the committed public development fixtures and temporary SQLite
files.  It never contacts a provider or handles real funds.
"""

from __future__ import annotations

import http.client
import json
import os
from pathlib import Path
import re
import selectors
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "examples" / "registry"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def start(state):
    environment = dict(os.environ)
    environment.update(
        PYTHONDONTWRITEBYTECODE="1",
        PYTHONPATH=str(ROOT / "src") + os.pathsep + str(ROOT / "os"),
    )
    process = subprocess.Popen(
        [
            sys.executable,
            "-B",
            "-u",
            "-m",
            "blackberryrock.hub_server",
            "--port",
            "0",
            "--state",
            str(state),
            "--registry",
            str(REGISTRY),
        ],
        cwd=ROOT,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )
    selector = selectors.DefaultSelector()
    try:
        selector.register(process.stdout, selectors.EVENT_READ)
        ready = selector.select(timeout=5)
        require(ready, "Hub did not report a listening address within five seconds")
        line = process.stdout.readline().strip()
        match = re.fullmatch(r"Rock star os DEVELOPMENT Hub: http://127\.0\.0\.1:(\d+)", line)
        require(match is not None, "Hub emitted an unexpected startup response")
        return process, int(match.group(1))
    except BaseException:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=5)
        raise
    finally:
        selector.close()


def stop(process):
    process.send_signal(signal.SIGTERM)
    try:
        code = process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=5)
        raise RuntimeError("Hub did not stop within five seconds")
    require(code == 0, f"Hub stopped with exit status {code}")


def request(port, method, path, body=None, *, cookie=None, origin=True):
    headers = {}
    encoded = None
    if body is not None:
        encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
        headers["Content-Type"] = "application/json"
        if origin:
            headers["Origin"] = f"http://127.0.0.1:{port}"
    if cookie:
        headers["Cookie"] = cookie
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request(method, path, body=encoded, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        response_headers = dict(response.getheaders())
        payload = (
            json.loads(raw)
            if raw and response_headers.get("Content-Type", "").startswith("application/json")
            else raw
        )
        return response.status, payload, response_headers
    finally:
        connection.close()


def login(port):
    status, _, headers = request(port, "GET", "/")
    require(status == 200, "local session bootstrap failed")
    cookie = headers.get("Set-Cookie", "").split(";", 1)[0]
    require(cookie.startswith("rock_session="), "local session cookie missing")
    return cookie


def post(port, cookie, path, body):
    status, payload, _ = request(port, "POST", path, body, cookie=cookie)
    require(status == 200 and isinstance(payload, dict) and "result" in payload, f"{path} failed safely")
    return payload["result"]


def wait_for_job(port, cookie, job_id):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        status, payload, _ = request(port, "GET", "/api/state", cookie=cookie)
        require(status == 200, "authenticated state read failed")
        jobs = [job for job in payload["hub"]["jobs"] if job["id"] == job_id]
        require(len(jobs) == 1, "job receipt disappeared")
        if jobs[0]["status"] != "running":
            return jobs[0]
        time.sleep(0.02)
    raise RuntimeError("job did not finish within five seconds")


def integrity(state):
    for name in ("hub.db", "wallet-simulator.db"):
        connection = sqlite3.connect(state / name)
        try:
            require(connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok", f"{name} failed integrity check")
        finally:
            connection.close()


def main():
    process = None
    with tempfile.TemporaryDirectory(prefix="rock-backend-launch-") as temporary:
        state = Path(temporary) / "state"
        try:
            process, port = start(state)
            status, health, _ = request(port, "GET", "/api/health")
            require(status == 200 and health.get("status") == "ok", "health check failed")
            require(request(port, "GET", "/api/state")[0] == 401, "state was exposed without a session")
            cookie = login(port)
            status, catalog, _ = request(port, "GET", "/api/catalog", cookie=cookie)
            require(status == 200 and catalog["rejected"] == 0, "signed fixture catalog was not clean")
            package = next(
                item for item in catalog["packages"]
                if item["manifest"]["id"] == "org.rockstar.text-tidy" and item["manifest"]["version"] == "1.0.0"
            )
            status, package_body, _ = request(port, "GET", package["download"], cookie=cookie)
            require(status == 200, "signed package download failed")
            installed = post(port, cookie, "/api/install", {"package": package_body})
            post(port, cookie, "/api/enable", {"id": installed["id"], "approved_hash": installed["hash"]})
            job = post(port, cookie, "/api/run", {"id": installed["id"], "text": "  launch check  ", "key": "launch-check-1"})
            finished = wait_for_job(port, cookie, job["id"])
            require((finished["status"], finished["output"]) == ("succeeded", "launch check"), "tool result was incorrect")
            old_cookie = cookie
            stop(process)
            process = None
            integrity(state)

            process, port = start(state)
            require(request(port, "GET", "/api/state", cookie=old_cookie)[0] == 401, "old session survived restart")
            cookie = login(port)
            status, payload, _ = request(port, "GET", "/api/state", cookie=cookie)
            require(status == 200, "state was unavailable after restart")
            restored = [item for item in payload["hub"]["jobs"] if item["id"] == job["id"]]
            require(len(restored) == 1 and restored[0]["status"] == "succeeded", "durable job receipt was not restored")
            stop(process)
            process = None
            integrity(state)
        finally:
            if process is not None and process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)

    report = {
        "schema": "rock-backend-launch-smoke/1",
        "status": "PASS",
        "scope": "loopback development backend; public fixtures and simulated wallet only",
        "checks": [
            "process_start",
            "health_without_session",
            "authenticated_state_boundary",
            "signed_install_enable_run",
            "graceful_sigterm",
            "sqlite_integrity",
            "restart_rotates_session",
            "restart_restores_receipt",
        ],
    }
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
