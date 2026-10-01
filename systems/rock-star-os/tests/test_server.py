import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from blackberryrock.server import MAX_BODY_BYTES, create_server
from blackberryrock.storage import Store


TOKEN = "test-token-that-is-long-enough"


class ServerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        store = Store(Path(self.directory.name) / "test.db")
        self.server = create_server("127.0.0.1", 0, store, TOKEN)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.directory.cleanup()

    def request(self, method: str, path: str, body=None, authorized=True):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        headers = {"Content-Type": "application/json"}
        if authorized:
            headers["Authorization"] = f"Bearer {TOKEN}"
        encoded = json.dumps(body).encode() if body is not None else None
        connection.request(method, path, body=encoded, headers=headers)
        response = connection.getresponse()
        payload = json.loads(response.read())
        connection.close()
        return response.status, payload

    def test_health_and_authentication(self) -> None:
        status, payload = self.request("GET", "/health", authorized=False)
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "ok")

        status, payload = self.request("GET", "/v1/jobs?device_id=device-1", authorized=False)
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"]["code"], "unauthorized")

    def test_create_duplicate_list_and_complete_job(self) -> None:
        request = {
            "device_id": "device-1",
            "tool_id": "org.blackberryrock.hello",
            "idempotency_key": "device-1:1",
            "input": {"name": "Noelle"},
        }
        status, first = self.request("POST", "/v1/jobs", request)
        duplicate_status, duplicate = self.request("POST", "/v1/jobs", request)
        self.assertEqual(status, 201)
        self.assertEqual(duplicate_status, 200)
        self.assertEqual(first["job"]["id"], duplicate["job"]["id"])

        conflicting = {**request, "input": {"name": "Someone else"}}
        conflict_status, conflict = self.request("POST", "/v1/jobs", conflicting)
        self.assertEqual(conflict_status, 409)
        self.assertEqual(conflict["error"]["code"], "idempotency_conflict")

        job_id = first["job"]["id"]
        self.assertEqual(self.request("PATCH", f"/v1/jobs/{job_id}", {"status": "running"})[0], 200)
        self.assertEqual(
            self.request(
                "PATCH", f"/v1/jobs/{job_id}", {"status": "succeeded", "result": {"ok": True}}
            )[0],
            200,
        )
        list_status, listed = self.request("GET", "/v1/jobs?device_id=device-1")
        self.assertEqual(list_status, 200)
        self.assertEqual(listed["jobs"][0]["status"], "succeeded")

        mutation_status, mutation = self.request(
            "PATCH", f"/v1/jobs/{job_id}", {"status": "succeeded", "result": {"ok": False}}
        )
        self.assertEqual(mutation_status, 409)
        self.assertEqual(mutation["error"]["code"], "invalid_transition")

    def test_rejects_oversized_body_before_reading_it(self) -> None:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        connection.putrequest("POST", "/v1/events")
        connection.putheader("Authorization", f"Bearer {TOKEN}")
        connection.putheader("Content-Type", "application/json")
        connection.putheader("Content-Length", str(MAX_BODY_BYTES + 1))
        connection.endheaders()
        response = connection.getresponse()
        payload = json.loads(response.read())
        connection.close()
        self.assertEqual(response.status, 413)
        self.assertEqual(payload["error"]["code"], "body_too_large")
