"""Credential-free guest. The DO relays bounded model requests over HTTP, not guest Internet."""
import base64
import hashlib
import http.server
import json
import os
import pathlib
import queue
import resource
import signal
import stat
import subprocess
import threading
import uuid

events = queue.Queue(maxsize=20)
replies = {}
lock = threading.Lock()
started = False
child = None
PROFILE = {'hermes': ('hermes-agent', '0.19.0', 'from run_agent import AIAgent'), 'boss': ('boss-agent-cli', '3.4.151', 'import boss_agent_cli')}
# Inherited hard bounds also apply to subprocesses created by official Agent tools.
resource.setrlimit(resource.RLIMIT_FSIZE, (8 * 1024 * 1024, 8 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_NPROC, (96, 96))
resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))

def files():
    result = []
    total = 0
    for directory, dirs, names, dir_fd in os.fwalk('/workspace', follow_symlinks=False):
        dirs[:] = [n for n in dirs if not n.startswith('.') and not pathlib.Path(directory, n).is_symlink()]
        for name in sorted(names):
            if name.startswith('.') or len(result) >= 12:
                continue
            try:
                fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=dir_fd)
                try:
                    if not stat.S_ISREG(os.fstat(fd).st_mode):
                        continue
                    data = os.read(fd, 32769)
                finally:
                    os.close(fd)
            except OSError:
                continue
            if len(data) > 32768 or total + len(data) > 65536:
                continue
            total += len(data)
            result.append({'name': str(pathlib.Path(directory, name).relative_to('/workspace')), 'base64': base64.b64encode(data).decode(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    return result

class Server(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_):
        pass

    def output(self, value, status=200):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self, limit=262144):
        length = int(self.headers.get('Content-Length', '0'))
        if not 0 < length <= limit:
            raise ValueError('invalid size')
        return json.loads(self.rfile.read(length))

    def do_GET(self):
        if self.path == '/health':
            self.output({'ready': True})
        elif self.path == '/v1/models':
            self.output({'object': 'list', 'data': [{'id': 'noah-cloud', 'object': 'model'}]})
        else:
            self.output({'error': 'not_found'}, 404)

    def do_POST(self):
        global started, child
        try:
            value = self.body(16384 if self.path == '/run' else 262144)
            if self.path == '/model-reply':
                pending = replies.get(value.get('id'))
                if not pending:
                    self.output({'error': 'unknown_call'}, 409)
                    return
                pending.put_nowait(value)
                self.output({'ok': True})
                return
            if self.path == '/v1/chat/completions':
                call_id = uuid.uuid4().hex
                pending = queue.Queue(maxsize=1)
                replies[call_id] = pending
                try:
                    events.put({'type': 'model_request', 'id': call_id, 'body': value}, timeout=5)
                    reply = pending.get(timeout=100)
                    if 'error' in reply:
                        self.output({'error': 'model_failed'}, 502)
                        return
                    if value.get('stream'):
                        self.send_response(200)
                        self.send_header('Content-Type', 'text/event-stream')
                        self.send_header('Connection', 'close')
                        self.end_headers()
                        body = reply['body']; choice = body['choices'][0]; delta = dict(choice['message'])
                        if delta.get('tool_calls'):
                            delta['tool_calls'] = [dict(t, index=i) for i, t in enumerate(delta['tool_calls'])]
                        chunk = {'id': body.get('id', call_id), 'object': 'chat.completion.chunk', 'model': 'noah-cloud', 'choices': [{'index': 0, 'delta': delta, 'finish_reason': None}]}
                        self.wfile.write(('data: ' + json.dumps(chunk) + '\n\n').encode())
                        chunk['choices'] = [{'index': 0, 'delta': {}, 'finish_reason': choice.get('finish_reason', 'stop')}]
                        self.wfile.write(('data: ' + json.dumps(chunk) + '\n\ndata: [DONE]\n\n').encode())
                        self.close_connection = True
                    else:
                        self.output(reply['body'])
                finally:
                    replies.pop(call_id, None)
                return
            if self.path != '/run' or value.get('profile') not in PROFILE:
                self.output({'error': 'not_found'}, 404)
                return
            with lock:
                if started:
                    self.output({'error': 'already_started'}, 409)
                    return
                started = True
            profile = value['profile']; package, version, probe = PROFILE[profile]
            if value.get('mode') == 'probe':
                subprocess.run(['/opt/' + profile + '/bin/python', '-c', probe + '; import importlib.metadata; assert importlib.metadata.version(' + repr(package) + ') == ' + repr(version)], check=True, timeout=35, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                self.output({'type': 'probe', 'profile': profile, 'version': version})
                return
            prompt = value.get('prompt')
            if not isinstance(prompt, str) or not 0 < len(prompt.encode()) <= 12000:
                raise ValueError('invalid prompt')
            pathlib.Path('/tmp/request.txt').write_text(prompt)
            env = dict(os.environ, OPENAI_BASE_URL='http://127.0.0.1:8080/v1', NOAH_MODEL='noah-cloud', NO_COLOR='1')
            adapter = 'hermes_sdk.py' if profile == 'hermes' else 'boss_cli.py'
            log = open('/tmp/run.log', 'wb')
            child = subprocess.Popen(['/opt/' + profile + '/bin/python', '/opt/noah/' + adapter], env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            def finish():
                try:
                    status = child.wait(timeout=210)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    status = child.wait()
                log.close()
                final = pathlib.Path('/tmp/final-response.txt')
                text = ''
                if final.is_file() and not final.is_symlink():
                    with final.open() as response_file:
                        text = response_file.read(32000)
                events.put({'type': 'result', 'exitCode': status, 'text': text, 'files': files(), 'version': version})
            threading.Thread(target=finish, daemon=True).start()
            self.send_response(200)
            self.send_header('Content-Type', 'application/x-ndjson')
            self.send_header('Connection', 'close')
            self.end_headers()
            while True:
                event = events.get(timeout=225)
                self.wfile.write((json.dumps(event, ensure_ascii=False) + '\n').encode())
                self.wfile.flush()
                if event['type'] == 'result':
                    break
            self.close_connection = True
        except (ValueError, KeyError, queue.Empty, queue.Full, subprocess.SubprocessError):
            self.output({'error': 'guest_failed'}, 500)

http.server.ThreadingHTTPServer(('0.0.0.0', 8080), Server).serve_forever()
