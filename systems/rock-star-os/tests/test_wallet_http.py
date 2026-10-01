"""Loopback HTTP integration tests for the explicitly simulated wallet."""

import http.client
from http.cookies import SimpleCookie
import json
from pathlib import Path
import tempfile
import threading
import unittest

from blackberryrock.hub_server import HubServer, MAX_REQUEST
from blackberryrock.wallet import MAX_AMOUNT_MINOR


class WalletHTTPTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        registry = root / "empty-registry"
        registry.mkdir()
        self.server = HubServer(0, root / "state", registry)
        self.port = self.server.server_port
        self.base_url = f"http://127.0.0.1:{self.port}"
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.request("GET", "/")
            response = connection.getresponse()
            response.read()
            self.assertEqual(response.status, 200)
            cookie = SimpleCookie(response.getheader("Set-Cookie"))
            self.cookie = f"rock_session={cookie['rock_session'].value}"
            self.assertTrue(cookie["rock_session"]["httponly"])
            self.assertEqual(cookie["rock_session"]["samesite"], "Strict")
        finally:
            connection.close()

    def stop_server(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def request(self, method: str, path: str, body=None, *, authorized: bool = True, headers=None):
        request_headers = {"Content-Type": "application/json", "Origin": self.base_url}
        if authorized:
            request_headers["Cookie"] = self.cookie
        if headers:
            request_headers.update(headers)
        encoded = json.dumps(body).encode() if body is not None else None
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.request(method, path, body=encoded, headers=request_headers)
            response = connection.getresponse()
            payload = json.loads(response.read())
            self.assertEqual(response.getheader("Cache-Control"), "no-store")
            return response.status, payload
        finally:
            connection.close()

    def post(self, operation: str, payload: dict) -> dict:
        status, result = self.request("POST", "/api/wallet/" + operation, payload)
        self.assertEqual(status, 200, result)
        return result["result"]

    def snapshot(self) -> dict:
        status, payload = self.request("GET", "/api/state")
        self.assertEqual(status, 200, payload)
        return payload["wallet"]

    def fund(self, amount_minor: int = 5000) -> dict:
        sale = self.post("sale", {"amount_minor": amount_minor, "key": "http:sale:1"})
        return self.post("settle", {"id": sale["id"], "key": "http:settle:1"})

    def test_wallet_http_flow_partial_unknown_reconcile_balances(self) -> None:
        sale = self.post("sale", {"amount_minor": 5000, "key": "http:sale:1"})
        self.assertEqual(sale["status"], "PENDING_SETTLEMENT")
        self.assertEqual(self.snapshot()["available_minor"], 0)
        self.assertEqual(self.snapshot()["pending_minor"], 5000)
        settled = self.post("settle", {"id": sale["id"], "key": "http:settle:1"})
        self.assertEqual(settled["status"], "SETTLED")
        consent = self.post("consent", {"accepted": True})
        self.assertTrue(consent["accepted"])
        self.assertIn("TEST_FIXTURE", consent["identity_fixture_id"])
        bill = self.post("bill", {"period": "2026-09", "key": "http:bill:2026-09"})
        self.assertEqual(bill["amount_minor"], 888)
        self.assertEqual(bill["consent_id"], consent["id"])
        reserved = self.post("reserve", {"amount_minor": 3000, "key": "http:reserve:1"})
        partial = self.post("dispense", {"id": reserved["id"], "dispensed_minor": 1000, "key": "http:cash:1"})
        self.assertEqual(partial["held_minor"], 2000)
        unknown = self.post("unknown", {"id": reserved["id"]})
        self.assertEqual(unknown["status"], "UNKNOWN")
        intermediate = self.snapshot()
        self.assertEqual((intermediate["available_minor"], intermediate["held_minor"], intermediate["dispensed_minor"]), (1112, 2000, 1000))
        reconciled = self.post("reconcile", {"id": reserved["id"], "total_dispensed_minor": 1200, "key": "http:reconcile:1"})
        self.assertEqual(reconciled["status"], "PARTIAL_REVERSED")
        self.assertEqual(reconciled["released_minor"], 1800)
        snapshot = self.snapshot()
        self.assertTrue(snapshot["simulation_only"])
        self.assertEqual(snapshot["currency"], "USD")
        self.assertEqual((snapshot["available_minor"], snapshot["held_minor"], snapshot["dispensed_minor"], snapshot["billed_minor"]), (2912, 0, 1200, 888))
        self.assertEqual(snapshot["ledger_balance_minor"], 0)
        for journal in snapshot["journals"]:
            self.assertEqual(sum(post["delta_minor"] for post in journal["postings"]), 0)

    def test_missing_wrong_session_origin_and_host_reject_without_mutation(self) -> None:
        path = "/api/wallet/sale"
        payload = {"amount_minor": 1000, "key": "denied-sale"}
        self.assertEqual(self.request("GET", "/api/state", authorized=False)[0], 401)
        self.assertEqual(self.request("POST", path, payload, authorized=False)[0], 401)
        self.assertEqual(self.request("POST", path, payload, headers={"Cookie": "rock_session=wrong-test-session"})[0], 401)
        self.assertEqual(self.request("POST", path, payload, headers={"Origin": "https://untrusted.example"})[0], 403)
        self.assertEqual(self.request("POST", path, payload, headers={"Origin": "null"})[0], 403)
        self.assertEqual(self.request("POST", path, payload, headers={"Host": "untrusted.example"})[0], 401)
        self.assertEqual(self.request("GET", "/api/state", headers={"Host": "untrusted.example"})[0], 403)
        self.assertEqual(self.snapshot()["journals"], [])

    def test_invalid_amount_types_limits_identifiers_and_consent_return_json_errors(self) -> None:
        invalid_amounts = [True, False, -1, 0, 1.25, "1000", None, [], {}, MAX_AMOUNT_MINOR + 1]
        for amount in invalid_amounts:
            for operation in ("sale", "reserve"):
                with self.subTest(operation=operation, amount=amount):
                    status, payload = self.request("POST", f"/api/wallet/{operation}", {"amount_minor": amount, "key": "invalid-amount"})
                    self.assertEqual(status, 400, payload)
                    self.assertIsInstance(payload["error"], str)
        for operation, body in [
            ("sale", {"amount_minor": 1000}),
            ("sale", {"amount_minor": 1000, "key": []}),
            ("consent", {"accepted": "true"}),
            ("consent", {"accepted": 1}),
            ("settle", {"id": [], "key": "invalid-id"}),
            ("dispense", {"id": "missing", "dispensed_minor": True, "key": "invalid-cash"}),
            ("reconcile", {"id": "missing", "total_dispensed_minor": -1, "key": "invalid-reconcile"}),
            ("bill", {"period": "2026-13", "key": "invalid-period"}),
        ]:
            with self.subTest(operation=operation, body=body):
                status, payload = self.request("POST", f"/api/wallet/{operation}", body)
                self.assertEqual(status, 400, payload)
                self.assertIn("error", payload)
        self.assertEqual(self.snapshot()["journals"], [])
        self.assertFalse(self.snapshot()["consent"]["accepted"])

    def test_retries_and_same_month_different_keys_do_not_charge_twice(self) -> None:
        sale = self.post("sale", {"amount_minor": 5000, "key": "http:sale:1"})
        self.assertEqual(sale, self.post("sale", {"amount_minor": 5000, "key": "http:sale:1"}))
        status, error = self.request("POST", "/api/wallet/sale", {"amount_minor": 5001, "key": "http:sale:1"})
        self.assertEqual(status, 400, error)
        self.assertIn("different", error["error"])
        self.post("settle", {"id": sale["id"], "key": "http:settle:1"})
        self.post("consent", {"accepted": True})
        first = self.post("bill", {"period": "2026-09", "key": "http:bill:1"})
        duplicate = self.post("bill", {"period": "2026-09", "key": "http:bill:1"})
        new_key = self.post("bill", {"period": "2026-09", "key": "http:bill:retry-new-key"})
        self.assertEqual(first, duplicate)
        self.assertEqual(first, new_key)
        self.post("consent", {"accepted": False})
        self.assertEqual(first, self.post("bill", {"period": "2026-09", "key": "http:bill:1"}))
        snapshot = self.snapshot()
        self.assertEqual(snapshot["billed_minor"], 888)
        self.assertEqual(snapshot["available_minor"], 4112)
        self.assertEqual(len(snapshot["bills"]), 1)
        self.assertEqual(snapshot["ledger_balance_minor"], 0)

    def test_unsettled_funds_and_missing_or_revoked_consent_cannot_bill(self) -> None:
        sale = self.post("sale", {"amount_minor": 5000, "key": "http:sale:1"})
        billing = {"period": "2026-09", "key": "http:bill:1"}
        self.assertEqual(self.request("POST", "/api/wallet/bill", billing)[0], 400)
        self.post("consent", {"accepted": True})
        self.assertEqual(self.request("POST", "/api/wallet/bill", billing)[0], 400)
        self.assertEqual(self.request("POST", "/api/wallet/reserve", {"amount_minor": 1, "key": "http:reserve:1"})[0], 400)
        self.post("settle", {"id": sale["id"], "key": "http:settle:1"})
        self.post("bill", billing)
        self.post("consent", {"accepted": False})
        self.assertEqual(self.request("POST", "/api/wallet/bill", {"period": "2026-10", "key": "http:bill:2"})[0], 400)
        snapshot = self.snapshot()
        self.assertEqual(snapshot["billed_minor"], 888)
        self.assertEqual(snapshot["held_minor"], 0)

    def test_oversize_and_non_json_requests_reject_without_mutation(self) -> None:
        self.assertEqual(self.request("POST", "/api/wallet/sale", {"amount_minor": 10, "key": "wrong-type"}, headers={"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.request("POST", "/api/wallet/sale", [1, 2])[0], 400)
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.putrequest("POST", "/api/wallet/sale")
            connection.putheader("Cookie", self.cookie)
            connection.putheader("Origin", self.base_url)
            connection.putheader("Content-Type", "application/json")
            connection.putheader("Content-Length", str(MAX_REQUEST + 1))
            connection.endheaders()
            response = connection.getresponse()
            payload = json.loads(response.read())
            self.assertEqual(response.status, 413, payload)
        finally:
            connection.close()
        self.assertEqual(self.snapshot()["journals"], [])


if __name__ == "__main__":
    unittest.main()
