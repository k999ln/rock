"""Isolated official Agent process; model HTTP is carried over bounded stdio.

No credentials, host paths, daemon sockets or external network are supplied.
This process's output remains untrusted host-observed evidence.
"""
import base64
import hashlib
import http.server
import importlib.metadata
import json
import os
import pathlib
import queue
import re
import subprocess
import sys
import threading
import uuid

wire = sys.stdout
lock = threading.Lock()
pending = {}


def emit(value):
    with lock:
        wire.write(json.dumps(value, ensure_ascii=False) + "\n")
        wire.flush()


def replies():
    for line in sys.stdin:
        if len(line) > 1048576:
            os._exit(2)
        try:
            value = json.loads(line)
            target = pending.get(value.get("id"))
            if target:
                target.put(value)
        except (ValueError, TypeError):
            os._exit(2)


class Proxy(http.server.BaseHTTPRequestHandler):
    model = "qwen2.5:1.5b"
    def log_message(self, *args):
        pass

    def do_GET(self):
        data = json.dumps({"object": "list", "data": [{"id": self.model, "object": "model"}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 262144:
            self.send_error(413)
            return
        data = json.loads(self.rfile.read(length))
        request_id = uuid.uuid4().hex
        target = queue.Queue(maxsize=1)
        pending[request_id] = target
        emit({"type": "model_request", "id": request_id, "body": data})
        try:
            reply = target.get(timeout=180)
            if reply.get("error"):
                self.send_error(502, "Local model failed")
                return
            body = reply["body"]
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream" if data.get("stream") else "application/json")
            self.end_headers()
            if data.get("stream"):
                choice = body["choices"][0]
                delta = dict(choice["message"])
                if delta.get("tool_calls"):
                    delta["tool_calls"] = [dict(t, index=i) for i, t in enumerate(delta["tool_calls"])]
                chunk = {"id": body.get("id", request_id), "object": "chat.completion.chunk", "model": self.model, "choices": [{"index": 0, "delta": delta, "finish_reason": None}]}
                self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
                chunk["choices"] = [{"index": 0, "delta": {}, "finish_reason": choice.get("finish_reason", "stop")}]
                self.wfile.write(("data: " + json.dumps(chunk) + "\n\ndata: [DONE]\n\n").encode())
            else:
                self.wfile.write(json.dumps(body).encode())
        finally:
            pending.pop(request_id, None)


def collect_files():
    files = []
    total = 0
    for directory, dirs, names, dir_fd in os.fwalk("/workspace", follow_symlinks=False):
        dirs[:] = [n for n in dirs if not n.startswith(".") and not pathlib.Path(directory, n).is_symlink()]
        for name in sorted(names):
            p = pathlib.Path(directory, name)
            if name.startswith(".") or p.is_symlink() or not p.is_file():
                continue
            if len(files) >= 12 or p.stat().st_size > 32768:
                continue
            # O_NOFOLLOW prevents symlink replacement while reading the file.
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=dir_fd)
            try:
                import stat
                if not stat.S_ISREG(os.fstat(fd).st_mode):
                    continue
                data = os.read(fd, 32769)
            finally:
                os.close(fd)
            if len(data) > 32768 or total + len(data) > 65536:
                continue
            total += len(data)
            files.append({"name": str(p.relative_to('/workspace')), "base64": base64.b64encode(data).decode(), "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
    return files


def main():
    request = json.loads(sys.stdin.readline(20000))
    agent = request["agent"]
    model = request["model"]
    if model not in ("qwen3:4b", "qwen2.5:1.5b", "qwen2.5-tools:1.5b-v1"):
        raise ValueError("Unknown local model")
    Proxy.model = model
    packages = {"aider": "aider-chat", "gptme": "gptme", "openhands": "openhands-sdk", "nanobot": "nanobot-ai", "hermes": "hermes-agent", "qwenpaw": "qwenpaw"}
    if agent in ('goose', 'openfang'):
        version = subprocess.check_output([agent, '--version'], text=True).strip().split()[-1]
    elif agent == 'cline':
        version = json.loads(pathlib.Path('/opt/cline/node_modules/@cline/sdk/package.json').read_text())['version']
    elif agent == 'dsh':
        version = json.loads(pathlib.Path('/opt/dsh/node_modules/@deepseek-ai/dsh/package.json').read_text())['version']
    elif agent == 'data-analysis':
        version = 'd0991fca3bb3d5431237053830b12b962268f6ad'
        assert pathlib.Path('/opt/upstream/data_analysis_agent-' + version + '/data_analysis_agent.py').is_file()
    elif agent == 'cow':
        version = 'bcc36de52ca17b45d1132f388a04b7a456bd3f95'
        assert pathlib.Path('/opt/upstream/CowAgent-' + version + '/agent/protocol/agent.py').is_file()
    else:
        version = importlib.metadata.version(packages[agent])
    if request.get("probe"):
        if agent == 'cow':
            subprocess.run([sys.executable, '/opt/noah/cow_sdk.py', '--probe'], check=True, timeout=25,
                           stdout=subprocess.DEVNULL, stderr=sys.stderr)
        if agent == 'qwenpaw':
            subprocess.run([sys.executable, '/opt/noah/qwenpaw_sdk.py', '--probe'], check=True, timeout=45,
                           stdout=subprocess.DEVNULL, stderr=sys.stderr)
        if agent == 'dsh':
            subprocess.run(['node', '/opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js',
                            '--profile', 'headless', '--help'], check=True, timeout=20,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        emit({"type": "probe", "agent": agent, "version": version})
        return
    threading.Thread(target=replies, daemon=True).start()
    proxy = http.server.HTTPServer(("127.0.0.1", 0), Proxy)
    threading.Thread(target=proxy.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{proxy.server_port}/v1"
    env = dict(os.environ, OPENAI_BASE_URL=base, OPENAI_API_BASE=base, OPENAI_API_KEY="noah-local-only", GPTME_CHECK_VERSION="false", NO_COLOR="1", NOAH_MODEL=model)
    prompt = request["prompt"] + "\nWork only in /workspace. Do not use the network. /no_think"
    if agent == "goose":
        env.update(GOOSE_MODE="auto", GOOSE_MAX_TURNS="8", GOOSE_TELEMETRY_ENABLED="false", GOOSE_CONTEXT_LIMIT="8192")
        args = ['goose', 'run', '--no-session', '--no-profile', '--max-turns', '8', '--with-builtin', 'developer', '--provider', 'openai', '--model', model, '--text', prompt]
    elif agent == "aider":
        args = ["aider", "--model", "openai/" + model, "--openai-api-base", base, "--openai-api-key", "noah-local-only", "--no-git", "--yes-always", "--no-auto-commits", "--no-check-update", "--no-analytics", "--no-pretty", "--no-stream", "--no-show-model-warnings", "--edit-format", "whole", "--message", prompt]
    elif agent == "gptme":
        args = ["gptme", "--non-interactive", "--no-stream", "--name", "noah-run", "--model", "local/" + model, "--tools", "save,shell", prompt]
    elif agent == 'cline':
        pathlib.Path('/tmp/request.txt').write_text(prompt)
        args = ['node', '/opt/cline/cline_sdk.mjs']
    elif agent == 'dsh':
        pathlib.Path('/tmp/request.txt').write_text(prompt)
        args = [sys.executable, '/opt/noah/dsh_cli.py']
    elif agent in ("nanobot", "openhands", "hermes", "data-analysis", "openfang", "qwenpaw", "cow"):
        pathlib.Path('/tmp/request.txt').write_text(prompt)
        adapter = {'data-analysis': 'data_analysis_sdk', 'openfang': 'openfang_cli'}.get(agent, agent + '_sdk')
        args = [sys.executable, f"/opt/noah/{adapter}.py"]
    else:
        raise ValueError("Unknown Agent")
    child = subprocess.Popen(args, cwd="/workspace", env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    output = bytearray()
    for chunk in iter(lambda: child.stdout.read(4096), b""):
        output.extend(chunk)
        if len(output) > 65536:
            del output[:-65536]
    status = child.wait()
    text = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", bytes(output).decode(errors="replace"))
    emit({"type": "result", "exitCode": status, "text": text, "files": collect_files(), "version": version})


if __name__ == "__main__":
    main()
