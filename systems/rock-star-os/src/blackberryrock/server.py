from __future__ import annotations

import hmac
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from . import __version__
from .storage import ALLOWED_TRANSITIONS, IdempotencyConflict, Store


MAX_BODY_BYTES = 1024 * 1024


def _valid_text(value: Any, maximum: int = 256) -> bool:
    return isinstance(value, str) and 0 < len(value.strip()) <= maximum


class ReceiverServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], store: Store, token: str):
        super().__init__(address, ReceiverHandler)
        self.store = store
        self.token = token


class ReceiverHandler(BaseHTTPRequestHandler):
    server: ReceiverServer

    def log_message(self, format: str, *args: Any) -> None:
        super().log_message(format, *args)

    def _send_json(self, status: int, body: dict[str, Any]) -> None:
        encoded = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def _error(self, status: int, code: str, message: str) -> None:
        self._send_json(status, {"error": {"code": code, "message": message}})

    def _authorized(self) -> bool:
        expected = f"Bearer {self.server.token}"
        supplied = self.headers.get("Authorization", "")
        return hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8"))

    def _require_auth(self) -> bool:
        if self._authorized():
            return True
        self._error(HTTPStatus.UNAUTHORIZED, "unauthorized", "valid bearer token required")
        return False

    def _read_json(self) -> dict[str, Any] | None:
        raw_length = self.headers.get("Content-Length")
        try:
            length = int(raw_length or "0")
        except ValueError:
            self._error(HTTPStatus.BAD_REQUEST, "invalid_request", "invalid Content-Length")
            return None
        if length <= 0:
            self._error(HTTPStatus.BAD_REQUEST, "invalid_request", "JSON body required")
            return None
        if length > MAX_BODY_BYTES:
            self._error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "body_too_large", "body exceeds 1 MiB")
            return None
        try:
            body = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._error(HTTPStatus.BAD_REQUEST, "invalid_json", "body must be valid UTF-8 JSON")
            return None
        if not isinstance(body, dict):
            self._error(HTTPStatus.BAD_REQUEST, "invalid_request", "body must be a JSON object")
            return None
        return body

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._send_json(
                HTTPStatus.OK,
                {"service": "blackberryrock-pc-receiver", "status": "ok", "version": __version__},
            )
            return
        if parsed.path == "/v1/jobs":
            if not self._require_auth():
                return
            device_id = parse_qs(parsed.query).get("device_id", [""])[0]
            if not _valid_text(device_id):
                self._error(HTTPStatus.BAD_REQUEST, "invalid_request", "device_id is required")
                return
            self._send_json(HTTPStatus.OK, {"jobs": self.server.store.list_jobs(device_id)})
            return
        self._error(HTTPStatus.NOT_FOUND, "not_found", "endpoint not found")

    def do_POST(self) -> None:
        if not self._require_auth():
            return
        body = self._read_json()
        if body is None:
            return
        if self.path == "/v1/events":
            self._post_event(body)
            return
        if self.path == "/v1/jobs":
            self._post_job(body)
            return
        self._error(HTTPStatus.NOT_FOUND, "not_found", "endpoint not found")

    def _post_event(self, body: dict[str, Any]) -> None:
        device_id = body.get("device_id")
        event_type = body.get("type")
        payload = body.get("payload", {})
        if not _valid_text(device_id) or not _valid_text(event_type) or not isinstance(payload, dict):
            self._error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "device_id, type, and object payload are required",
            )
            return
        event_id = self.server.store.add_event(device_id, event_type, payload)
        self._send_json(HTTPStatus.CREATED, {"id": event_id})

    def _post_job(self, body: dict[str, Any]) -> None:
        device_id = body.get("device_id")
        tool_id = body.get("tool_id")
        idempotency_key = body.get("idempotency_key")
        job_input = body.get("input")
        if (
            not _valid_text(device_id)
            or not _valid_text(tool_id)
            or not _valid_text(idempotency_key, 512)
            or not isinstance(job_input, dict)
        ):
            self._error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "device_id, tool_id, idempotency_key, and object input are required",
            )
            return
        try:
            job, created = self.server.store.create_job(device_id, tool_id, idempotency_key, job_input)
        except IdempotencyConflict as error:
            self._error(HTTPStatus.CONFLICT, "idempotency_conflict", str(error))
            return
        self._send_json(HTTPStatus.CREATED if created else HTTPStatus.OK, {"job": job, "created": created})

    def do_PATCH(self) -> None:
        if not self._require_auth():
            return
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["v1", "jobs"]:
            self._error(HTTPStatus.NOT_FOUND, "not_found", "endpoint not found")
            return
        body = self._read_json()
        if body is None:
            return
        status = body.get("status")
        result = body.get("result")
        if status not in ALLOWED_TRANSITIONS or (result is not None and not isinstance(result, dict)):
            self._error(HTTPStatus.BAD_REQUEST, "invalid_request", "valid status and object result required")
            return
        try:
            job = self.server.store.update_job(parts[2], status, result)
        except ValueError as error:
            self._error(HTTPStatus.CONFLICT, "invalid_transition", str(error))
            return
        if job is None:
            self._error(HTTPStatus.NOT_FOUND, "not_found", "job not found")
            return
        self._send_json(HTTPStatus.OK, {"job": job})


def create_server(bind: str, port: int, store: Store, token: str) -> ReceiverServer:
    return ReceiverServer((bind, port), store, token)
