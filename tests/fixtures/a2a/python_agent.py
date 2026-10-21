#!/usr/bin/env python3
"""Independent stdlib A2A 1.0 JSON-RPC fixture used only by interoperability tests."""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json


class Handler(BaseHTTPRequestHandler):
    server_version = "A2A-Python-Fixture/1.0"

    def log_message(self, *_args):
        pass

    def _write(self, value, status=200):
        body = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        origin = f"http://127.0.0.1:{self.server.server_port}"
        if self.path != "/.well-known/agent-card.json":
            self._write({"error": "not_found"}, 404)
            return
        self._write({
            "name": "Python Fixture Agent",
            "description": "Independent stdlib A2A server for local interop tests.",
            "version": "1.0.0",
            "supportedInterfaces": [{
                "url": origin + "/rpc",
                "protocolBinding": "JSONRPC",
                "protocolVersion": "1.0",
            }],
            "capabilities": {"streaming": False, "pushNotifications": False},
            "skills": [{"id": "summarize", "name": "Summarize", "description": "Returns a local test summary."}],
        })

    def do_POST(self):
        if self.path != "/rpc" or self.headers.get("A2A-Version") != "1.0":
            self._write({"error": "unsupported_request"}, 400)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1_000_000:
                raise ValueError("invalid body length")
            request = json.loads(self.rfile.read(length))
            if request.get("jsonrpc") != "2.0" or not isinstance(request.get("id"), str):
                raise ValueError("invalid json-rpc envelope")
            method = request.get("method")
            params = request.get("params")
            if not isinstance(params, dict):
                raise ValueError("invalid params")
            if method == "SendMessage":
                message = params.get("message", {})
                task_id = f"py-task-{len(self.server.tasks) + 1}"
                text = " ".join(part.get("text", "") for part in message.get("parts", []))
                self.server.tasks[task_id] = {"text": text, "messageId": message.get("messageId")}
                result = {"task": {"id": task_id, "contextId": "py-context-1", "status": {"state": "TASK_STATE_SUBMITTED"}}}
            elif method == "GetTask":
                task = self.server.tasks.get(params.get("id"))
                if task is None:
                    raise KeyError("task not found")
                result = {
                    "id": params["id"], "contextId": "py-context-1",
                    "status": {"state": "TASK_STATE_COMPLETED"},
                    "artifacts": [{"name": "summary", "parts": [{"text": f"Python received: {task['text']}"}]}],
                }
            elif method == "CancelTask":
                if params.get("id") not in self.server.tasks:
                    raise KeyError("task not found")
                result = {"id": params["id"], "contextId": "py-context-1", "status": {"state": "TASK_STATE_CANCELED"}}
            else:
                self._write({"jsonrpc": "2.0", "id": request["id"], "error": {"code": -32601, "message": "Method not found"}})
                return
            self._write({"jsonrpc": "2.0", "id": request["id"], "result": result})
        except KeyError:
            self._write({"jsonrpc": "2.0", "id": request.get("id"), "error": {"code": -32004, "message": "Task not found"}})
        except (ValueError, TypeError, json.JSONDecodeError):
            self._write({"error": "invalid_request"}, 400)


server = HTTPServer(("127.0.0.1", 0), Handler)
server.tasks = {}
print(f"LISTENING:{server.server_port}", flush=True)
server.serve_forever(poll_interval=0.05)
