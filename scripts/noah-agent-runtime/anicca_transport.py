#!/usr/local/bin/python3
"""Noah adapter for the pinned Anicca composition runner; never a host CLI.

The upstream runner remains unchanged. Its credential-sharing environment
function is replaced explicitly: a private guest socket carries one text
request to the authenticated, tool-less official Codex process on the host.
No auth file, personal directory, display or network route enters this image.
"""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import uuid

PIN = "28e7f3f333474f18b5da51acfe18b063cf727ad0"
RUNNER_SHA = "1d986a52721c60ac344eef17e4f97b844f415e72c499c6079fcbf15b1635a204"
RUNNER = Path("/opt/anicca/runtime/agent-runner/agent_runner.py")
SCHEMA = Path("/opt/noah/schema.json")
SOCKET = "/tmp/noah-codex.sock"
EVIDENCE = Path("/workspace/evidence")
RESULT = EVIDENCE / "attempt-01.result.json"


def checked_response(text):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError("response size")
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {"answer", "next_steps", "limitations"}:
        raise ValueError("response envelope")
    if not isinstance(value["answer"], str) or not value["answer"].strip():
        raise ValueError("empty answer")
    for name in ("next_steps", "limitations"):
        if not isinstance(value[name], list) or len(value[name]) > 20 or any(not isinstance(v, str) for v in value[name]):
            raise ValueError("response items")
    return value


def read_line(stream, maximum=65536):
    line = stream.readline(maximum + 1)
    if not line.endswith(b"\n") or len(line) > maximum:
        raise ValueError("transport limit")
    return json.loads(line)


def transport():
    # Accept only the exact upstream command for this one configured task.
    model = os.environ["NOAH_EXPECTED_MODEL"]
    expected = ["exec", "--ephemeral", "--model", model, "-c", 'model_reasoning_effort="medium"',
                "-c", "project_doc_max_bytes=0", "-c", 'shell_environment_policy.set.HOME="/home/agent"',
                "-c", "skills.config=[]", "--ignore-user-config", "--json", "--output-schema",
                str(EVIDENCE / "attempt-01.codex-output-schema.json"), "-o", str(RESULT),
                "--sandbox", "read-only", "--disable", "shell_tool", "--disable", "code_mode_host",
                "--disable", "unified_exec", "--skip-git-repo-check", "-C", "/workspace", "-"]
    if sys.argv[2:] != expected:
        raise ValueError("unsupported provider command")
    if json.loads(Path(expected[expected.index("--output-schema") + 1]).read_text()) != json.loads(SCHEMA.read_text()):
        raise ValueError("schema changed")
    prompt = sys.stdin.buffer.read(12001)
    if len(prompt) > 12000:
        raise ValueError("prompt limit")
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(210)
        client.connect(SOCKET)
        client.sendall((json.dumps({"prompt": prompt.decode(), "model": model}) + "\n").encode())
        response = read_line(client.makefile("rb"))
    value = checked_response(response["text"])
    RESULT.write_text(json.dumps(value, ensure_ascii=False))
    # Transported final message only. No fabricated token/cost measurements.
    print(json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": response["text"]}}))
    print(json.dumps({"type": "turn.completed"}))


def official():
    if hashlib.sha256(RUNNER.read_bytes()).hexdigest() != RUNNER_SHA:
        raise ValueError("runner changed")
    sys.path.insert(0, str(RUNNER.parent))
    spec = importlib.util.spec_from_file_location("noah_anicca_official", RUNNER)
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)

    def transport_environment(provider, provider_config, environ=None, *, task_class=None, invocation_id=None):
        del environ, invocation_id
        if provider != "codex" or task_class != "composition-agent" or provider_config.get("profile_alias") != "noah-host":
            raise ValueError("unapproved transport")
        return {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/home/agent", "LANG": "C.UTF-8",
                "NOAH_EXPECTED_MODEL": os.environ["NOAH_EXPECTED_MODEL"], "PYTHONDONTWRITEBYTECODE": "1"}

    # Explicit adapter boundary, not a fake auth file or a fallback provider.
    runner.provider_process_env = transport_environment
    sys.argv = [str(RUNNER), "--task-class", "composition-agent", "--prompt-stdin", "--schema", str(SCHEMA),
                "--evidence-dir", str(EVIDENCE), "--task-label", "noah-composition", "--workdir", "/workspace"]
    runner.install_termination_forwarding()
    return runner.run()


def artifact(name, value):
    data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False, indent=2).encode()
    if len(data) > 32768:
        raise ValueError("artifact limit")
    return {"name": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "base64": base64.b64encode(data).decode()}


def main():
    request = read_line(sys.stdin.buffer)
    if set(request) != {"schema", "prompt", "model"} or request["schema"] != "noah-anicca/1":
        raise ValueError("request schema")
    model, prompt = request["model"], request["prompt"]
    if not isinstance(model, str) or not re.fullmatch(r"[a-zA-Z0-9_.:-]{1,120}", model):
        raise ValueError("model")
    if not isinstance(prompt, str) or len(prompt.strip()) < 16 or len(prompt.encode()) > 12000:
        raise ValueError("prompt needs 16 characters, at most 12000 bytes")
    if hashlib.sha256(RUNNER.read_bytes()).hexdigest() != RUNNER_SHA:
        raise ValueError("runner hash")
    os.chdir("/workspace")
    Path("/home/agent/profile").mkdir(mode=0o700)
    config = {"timeout_seconds": 210, "providers": {"codex": {
        "executable": "/opt/noah/codex-transport", "account_profile_order": ["noah-host"],
        "profiles": {"noah-host": {"automation_home": "/home/agent/profile", "auth_file": "/not-mounted/host-codex-auth"}}}},
        "task_classes": {"composition-agent": {"route": "noah:host-codex:composition", "candidates": [
            {"provider": "codex", "profile_alias": "noah-host", "model": model, "effort": "medium"}]}}}
    Path("/workspace/config.json").write_text(json.dumps(config))
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/home/agent", "LANG": "C.UTF-8",
           "PYTHONDONTWRITEBYTECODE": "1", "NOAH_EXPECTED_MODEL": model, "AGENT_RUNNER_CONFIG": "/workspace/config.json"}
    with socket.socket(socket.AF_UNIX) as server:
        server.bind(SOCKET)
        os.chmod(SOCKET, 0o600)
        server.listen(1)
        server.settimeout(0.2)
        with open("/workspace/runner.stdout", "wb") as out, open("/workspace/runner.stderr", "wb") as err:
            process = subprocess.Popen([sys.executable, __file__, "--official"], stdin=subprocess.PIPE, stdout=out, stderr=err, env=env)
            process.stdin.write(prompt.encode())
            process.stdin.close()
            deadline, calls = time.monotonic() + 215, 0
            while process.poll() is None and time.monotonic() < deadline:
                try:
                    client, _ = server.accept()
                except socket.timeout:
                    continue
                with client:
                    client.settimeout(210)
                    body = read_line(client.makefile("rb"))
                    if calls or body != {"prompt": prompt, "model": model}:
                        raise ValueError("duplicate or changed request")
                    calls += 1
                    request_id = uuid.uuid4().hex
                    print(json.dumps({"type": "model_request", "id": request_id, "body": body}), flush=True)
                    reply = read_line(sys.stdin.buffer)
                    if reply.get("id") != request_id or set(reply.get("body", {})) != {"text"}:
                        raise ValueError("reply mismatch")
                    checked_response(reply["body"]["text"])
                    client.sendall((json.dumps(reply["body"]) + "\n").encode())
            if process.poll() is None:
                raise ValueError("runner deadline")
    summary = json.loads((EVIDENCE / "summary.json").read_text())
    attempts = [json.loads(line) for line in (EVIDENCE / "attempts.jsonl").read_text().splitlines()]
    if process.returncode or calls != 1 or summary.get("status") != "success" or summary.get("attempt_count") != 1 or len(attempts) != 1 or attempts[0].get("schema_valid") is not True or summary.get("selected_model") != model:
        # Diagnostic is guest-only and contains no account tokens.
        print(json.dumps({"summary": summary, "attempts": attempts}), file=sys.stderr)
        raise ValueError("official runner did not accept the result")
    result = checked_response(RESULT.read_text())
    receipt = {"schema": "noah-anicca-receipt/1", "sourceCommit": PIN, "runnerSha256": RUNNER_SHA,
               "adapter": "noah-anicca/1", "environmentAdapter": "credential-free-host-codex-transport",
               "taskClass": "composition-agent", "model": model, "providerTurns": calls,
               "officialSummary": summary, "officialAttempt": attempts[0]}
    print(json.dumps({"type": "result", "exitCode": 0, "text": result["answer"],
                      "files": [artifact("result.json", result), artifact("anicca-receipt.json", receipt)]}), flush=True)


if __name__ == "__main__":
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "--codex-transport":
            transport()
        elif len(sys.argv) > 1 and sys.argv[1] == "--official":
            raise SystemExit(official())
        else:
            main()
    except Exception as error:
        print(f"Anicca adapter: {type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(1)
