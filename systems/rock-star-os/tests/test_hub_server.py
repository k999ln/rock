"""Real loopback HTTP + signed package + worker + SQLite acceptance tests."""
import copy
import base64
import http.client
import json
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from blackberryrock import hub_server
from blackberryrock.hub_server import HubServer, MAX_REQUEST
from blackberryrock.packages import TEST_PUBLISHER, canonical, digest
from blackberryrock.a2a_usage_receipt import signing_bytes
from blackberryrock.sdk import RFC8032_PUBLIC_TEST_SEED


REGISTRY = Path(__file__).resolve().parents[1] / "examples/registry"


class HubAPITest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.registry = root / "registry"
        shutil.copytree(REGISTRY, self.registry)
        self.fixture_count = len(list(self.registry.glob("*.rock.json")))
        self.state_dir = root / "state"
        self.start_server()

    def start_server(self):
        self.server = HubServer(0, self.state_dir, self.registry)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()
        self.origin = f"http://127.0.0.1:{self.server.server_port}"
        self.cookie = None

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(2)

    def tearDown(self):
        self.stop_server()
        self.temp.cleanup()

    def request(self, method, path, body=None, authenticated=True, headers=None, raw=None):
        combined = {"Content-Type": "application/json", "Origin": self.origin}
        if authenticated and self.cookie:
            combined["Cookie"] = self.cookie
        combined.update(headers or {})
        payload = raw if raw is not None else canonical(body) if body is not None else None
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            connection.request(method, path, body=payload, headers=combined)
            response = connection.getresponse()
            data = response.read()
            result = json.loads(data) if response.getheader("Content-Type", "").startswith("application/json") else data
            return response.status, result, dict(response.getheaders())
        finally:
            connection.close()

    def login(self):
        status, _, headers = self.request("GET", "/", authenticated=False)
        self.assertEqual(status, 200)
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", headers["Set-Cookie"])
        self.cookie = headers["Set-Cookie"].split(";", 1)[0]

    def post(self, path, body):
        status, payload, _ = self.request("POST", path, body)
        self.assertEqual(status, 200, payload)
        return payload["result"]

    def state(self):
        status, payload, _ = self.request("GET", "/api/state")
        self.assertEqual(status, 200, payload)
        return payload

    def finish(self, job_id):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            job = next(j for j in self.state()["hub"]["jobs"] if j["id"] == job_id)
            if job["status"] != "running":
                return job
            time.sleep(0.01)
        self.fail("HTTP job did not finish")

    def catalog(self):
        status, data, _ = self.request("GET", "/api/catalog")
        self.assertEqual(status, 200)
        return data

    def test_authentication_host_origin_and_response_headers(self):
        status, health, headers = self.request("GET", "/api/health", authenticated=False)
        self.assertEqual(status, 200)
        self.assertEqual(health, {
            "scope": "loopback",
            "service": "rockstaros-development-hub",
            "simulation_only": True,
            "status": "ok",
        })
        self.assertEqual(headers["Cache-Control"], "no-store")
        with patch.object(self.server.hub, "state", side_effect=sqlite3.DatabaseError("private failure")):
            status, unavailable, _ = self.request("GET", "/api/health", authenticated=False)
        self.assertEqual((status, unavailable), (503, {"status": "unavailable"}))
        for path in ("/api/state", "/api/catalog", "/registry/org.rockstar.text-tidy--1.0.0.rock.json"):
            self.assertEqual(self.request("GET", path, authenticated=False)[0], 401)
        self.assertEqual(self.request("GET", "/", headers={"Host": "rebind.invalid"})[0], 403)
        self.login()
        self.assertEqual(self.request("GET", "/api/state", headers={"Cookie": "rock_session=wrong"})[0], 401)
        for origin in ("https://attacker.invalid", "null", ""):
            self.assertEqual(self.request("POST", "/api/revoke", {"subject": TEST_PUBLISHER}, headers={"Origin": origin})[0], 403)
        self.assertEqual(self.request("POST", "/api/revoke", {"subject": TEST_PUBLISHER}, headers={"Host": "rebind.invalid"})[0], 401)
        status, state, headers = self.request("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(state["hub"]["revoked"], [])
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
        self.assertTrue(state["wallet"]["simulation_only"])

    def test_malformed_and_oversized_json_reject_without_losing_service(self):
        self.login()
        for raw in (b"{", b"[]", b"null", b"1", b'"text"'):
            self.assertEqual(self.request("POST", "/api/install", raw=raw)[0], 400)
        self.assertEqual(self.request("POST", "/api/install", {}, headers={"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.request("POST", "/api/install", {}, headers={"Content-Length": "invalid"})[0], 400)
        for length in (MAX_REQUEST + 1, -1, 0):
            connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
            try:
                connection.putrequest("POST", "/api/install")
                for name, value in {"Cookie": self.cookie, "Origin": self.origin, "Content-Type": "application/json", "Content-Length": str(length)}.items():
                    connection.putheader(name, value)
                connection.endheaders()
                response = connection.getresponse()
                response.read()
                self.assertEqual(response.status, 413)
            finally:
                connection.close()
        self.assertEqual(self.state()["hub"]["installed"], [])

    def test_wrong_json_field_types_return_client_error_and_leave_state_unchanged(self):
        self.login()
        for route, body in (
            ("/api/revoke", {"subject": {"unexpected": "object"}}),
            ("/api/lifecycle", {"id": [], "action": "uninstall"}),
            ("/api/enable", {"id": {}, "approved_hash": "0" * 64}),
            ("/api/cancel", {"id": ["not-a-string"]}),
            ("/api/run", {"id": {}, "text": "text", "key": "malformed-id"}),
        ):
            with self.subTest(route=route):
                status, payload, _ = self.request("POST", route, body)
                self.assertEqual(status, 400, payload)
        state = self.state()["hub"]
        self.assertEqual(state["revoked"], [])
        self.assertEqual(state["installed"], [])
        self.assertEqual(state["jobs"], [])

    def test_catalog_download_install_run_update_rollback_and_receipts_after_restart(self):
        self.login()
        catalog = self.catalog()
        self.assertEqual((len(catalog["packages"]), catalog["rejected"]), (self.fixture_count, 0))
        entries = {p["manifest"]["version"]: p for p in catalog["packages"] if p["manifest"]["id"] == "org.rockstar.text-tidy"}
        tool_id = "org.rockstar.text-tidy"
        jobs = []
        for version, expected in (("1.0.0", "A，B\n\nC"), ("2.0.0", "A、B\n\nC")):
            entry = entries[version]
            status, package, _ = self.request("GET", entry["download"])
            self.assertEqual(status, 200)
            self.assertEqual(digest(package), entry["hash"])
            installed = self.post("/api/install", {"package": package})
            self.assertFalse(installed["enabled"])
            self.assertEqual(self.request("POST", "/api/run", {"id": tool_id, "text": "x", "key": "unapproved"})[0], 400)
            self.post("/api/enable", {"id": tool_id, "approved_hash": installed["hash"]})
            request = {"id": tool_id, "text": "  A，B \n\n\n C ", "key": version}
            job = self.post("/api/run", request)
            finished = self.finish(job["id"])
            self.assertEqual((finished["status"], finished["output"]), ("succeeded", expected))
            self.assertEqual(self.post("/api/run", request)["id"], job["id"])
            self.assertEqual(self.request("POST", "/api/run", {**request, "text": "collision"})[0], 400)
            jobs.append(job["id"])
        self.post("/api/lifecycle", {"id": tool_id, "action": "rollback", "version": "1.0.0"})
        installed = self.state()["hub"]["installed"][0]
        self.assertEqual((installed["version"], installed["enabled"]), ("1.0.0", 0))
        self.post("/api/enable", {"id": tool_id, "approved_hash": entries["1.0.0"]["hash"]})
        self.post("/api/lifecycle", {"id": tool_id, "action": "disable"})
        self.assertFalse(self.state()["hub"]["installed"][0]["enabled"])
        self.post("/api/lifecycle", {"id": tool_id, "action": "uninstall"})
        old_cookie = self.cookie
        self.stop_server()
        self.start_server()
        self.assertEqual(self.request("GET", "/api/state", headers={"Cookie": old_cookie})[0], 401)
        self.login()
        after = self.state()["hub"]
        self.assertEqual(after["installed"], [])
        self.assertEqual({j["id"] for j in after["jobs"]}, set(jobs))
        self.assertTrue(all(j["status"] == "succeeded" for j in after["jobs"]))

    def test_registry_quarantines_bad_signature_symlink_and_revoked_publisher(self):
        self.login()
        original = json.loads(next(self.registry.glob("*.rock.json")).read_text())
        broken = copy.deepcopy(original)
        broken["signature"] = "00" * 64
        (self.registry / "invalid.rock.json").write_bytes(canonical(broken))
        (self.registry / "symlink.rock.json").symlink_to(next(REGISTRY.glob("*.rock.json")))
        catalog = self.catalog()
        self.assertEqual((len(catalog["packages"]), catalog["rejected"]), (self.fixture_count, 2))
        self.assertEqual(self.request("GET", "/registry/invalid.rock.json")[0], 404)
        self.assertEqual(self.request("GET", "/registry/../../state/hub.db")[0], 404)
        self.assertEqual(self.request("POST", "/api/install", {"package": broken})[0], 400)
        self.post("/api/revoke", {"subject": TEST_PUBLISHER})
        catalog = self.catalog()
        self.assertEqual((catalog["packages"], catalog["rejected"]), ([], self.fixture_count + 2))
        self.assertEqual(self.request("POST", "/api/install", {"package": original})[0], 400)
        self.assertEqual(self.state()["hub"]["installed"], [])

    def test_wallet_http_flow_is_simulated_balanced_and_idempotent(self):
        self.login()
        self.assertEqual(self.request("POST", "/api/wallet/bill", {"period": "2026-09", "key": "no-consent"})[0], 400)
        sale = self.post("/api/wallet/sale", {"amount_minor": 5000, "key": "sale"})
        self.assertEqual(self.state()["wallet"]["available_minor"], 0)
        self.post("/api/wallet/settle", {"id": sale["id"], "key": "settled"})
        self.post("/api/wallet/consent", {"accepted": True})
        bill = self.post("/api/wallet/bill", {"period": "2026-09", "key": "bill"})
        self.assertEqual(bill["amount_minor"], 888)
        self.assertEqual(self.post("/api/wallet/bill", {"period": "2026-09", "key": "bill-retry"})["id"], bill["id"])
        reserve = self.post("/api/wallet/reserve", {"amount_minor": 2000, "key": "reserve"})
        self.post("/api/wallet/unknown", {"id": reserve["id"]})
        self.assertEqual(self.state()["wallet"]["held_minor"], 2000)
        reconciled = self.post("/api/wallet/reconcile", {"id": reserve["id"], "total_dispensed_minor": 700, "key": "reconcile"})
        self.assertEqual(reconciled["status"], "PARTIAL_REVERSED")
        snapshot = self.state()["wallet"]
        self.assertEqual((snapshot["available_minor"], snapshot["billed_minor"], snapshot["dispensed_minor"], snapshot["held_minor"]), (3412, 888, 700, 0))
        self.assertEqual(snapshot["ledger_balance_minor"], 0)
        self.assertTrue(snapshot["simulation_only"])

    def test_unified_hub_mcp_value_spend_flow_is_simulation_only(self):
        self.login()
        sale = self.post("/api/wallet/sale", {"amount_minor": 5000, "key": "spend-fund"})
        self.post("/api/wallet/settle", {"id": sale["id"], "key": "spend-fund-settle"})
        request = {
            "v": 1, "op": "spend.propose", "key": "spend-proposal",
            "proposal": {
                "owner_id": "local-owner", "adapter_id": "polymarket.dry-run", "mode": "SIMULATION",
                "action": "trade.buy", "asset_id": "wallet.synthetic.usd", "amount_minor": 1000,
                "estimated_fee_minor": 5, "estimated_gas_minor": 0, "market_id": "fixture-market",
                "outcome": "YES", "limit_price_micros": 500000, "max_slippage_bps": 50,
                "strategy_id": "manual", "expires_at": int(time.time()) + 120,
            },
        }
        proposed = self.post("/api/hub-mcp", request)
        self.assertEqual(proposed["status"], "PROPOSED")
        proposal_id = proposed["proposal"]["proposal_id"]
        self.post("/api/hub-mcp", {"v":1,"op":"spend.approve","key":"spend-approval",
                  "proposal_id":proposal_id,"proposal_digest":proposed["proposal_digest"],
                  "approval_type":"USER","approver":"local-owner","decision":True})
        executed = self.post("/api/hub-mcp", {"v":1,"op":"spend.execute","key":"spend-execute","proposal_id":proposal_id})
        self.assertEqual(executed["status"], "EXECUTED")
        self.assertFalse(executed["receipt"]["financial_transaction"])
        state = self.state()
        self.assertEqual(state["value_spend"]["modes"], {"SIMULATION":True,"PAPER":True,"LIVE":False})
        self.assertEqual(state["value_spend"]["spend_accounts"]["SPEND_COMMITTED"], 1000)

    def test_a2a_cloud_budget_is_reserved_in_the_same_local_wallet_and_unknown_holds_remain(self):
        self.login()
        sale = self.post("/api/wallet/sale", {"amount_minor": 5_000, "key": "a2a-wallet-fund"})
        self.post("/api/wallet/settle", {"id": sale["id"], "key": "a2a-wallet-settle-fund"})
        reservation = self.post("/api/hub-mcp", {
            "v": 1, "op": "a2a.budget.reserve", "key": "a2a-wallet-reserve",
            "owner_id": "local-owner", "delegation_id": "delegation-1", "parent_job_id": "zema-job-1",
            "currency": "USD", "budget_limit_minor": 1_250,
            "approval_sha256": "a" * 64, "deadline_at": (int(time.time()) + 600) * 1000,
        })
        self.assertEqual(reservation["state"], "HELD")
        self.assertEqual(self.state()["wallet"]["available_minor"], 3_750)
        dispatched = self.post("/api/hub-mcp", {
            "v": 1, "op": "a2a.budget.dispatch", "key": "a2a-wallet-dispatch",
            "delegation_id": "delegation-1",
        })
        self.assertEqual(dispatched["state"], "DISPATCHED")
        unknown = self.post("/api/hub-mcp", {
            "v": 1, "op": "a2a.budget.indeterminate", "key": "a2a-wallet-unknown",
            "delegation_id": "delegation-1",
        })
        self.assertEqual(unknown["state"], "INDETERMINATE")
        self.assertEqual(unknown["held_minor"], 1_250)
        self.assertEqual(self.state()["value_spend"]["spend_accounts"]["SPEND_HOLD"], 1_250)
        self.assertEqual(self.state()["wallet"]["ledger_balance_minor"], 0)

    def test_owner_local_hub_settles_cloud_style_signed_usage_receipt_to_wallet(self):
        fixture = json.loads((Path(__file__).with_name('fixtures') / 'a2a-usage-receipt-v1.json').read_text())
        trust = [{
            'providerId': fixture['providerId'],
            'keyId': fixture['keyId'],
            'agentOrigin': fixture['agentOrigin'],
            'publicKeyHex': fixture['fixturePublicKeyHex'],
            'status': 'active',
        }]
        self.stop_server()
        with patch.dict('os.environ', {'ROCKSTAR_A2A_TRUSTED_USAGE_KEYS': json.dumps(trust)}):
            self.start_server()
        self.login()

        sale = self.post('/api/wallet/sale', {'amount_minor': 5_000, 'key': 'signed-a2a-wallet-fund'})
        self.post('/api/wallet/settle', {'id': sale['id'], 'key': 'signed-a2a-wallet-fund-settle'})
        now_ms = int(time.time() * 1000)
        deadline_at = now_ms + 3_600_000
        delegation_id = 'delegation-signed-settlement'
        parent_job_id = 'zema-job-signed-settlement'
        receipt = {
            'schema': 'rock-a2a-provider-usage-receipt/1',
            'providerId': 'provider-x', 'keyId': 'usage-key-1', 'receiptId': 'hub-receipt-1',
            'ownerUserId': 'local-owner', 'parentJobId': parent_job_id,
            'delegationId': delegation_id, 'taskId': 'remote-task-hub-1',
            'agentOrigin': 'https://agent.example', 'agentName': 'Research Agent',
            'agentVersion': '1.0.0', 'currency': 'USD', 'amountMinor': 650,
            'pricingVersion': 'fixture-price-1', 'issuedAt': now_ms,
            'usage': [{'meter': 'agent-operation', 'quantity': 1, 'unit': 'request', 'amountMinor': 650}],
            'signature': '',
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'key.der').write_bytes(bytes.fromhex('302e020100300506032b657004220420' + RFC8032_PUBLIC_TEST_SEED))
            (root / 'payload').write_bytes(signing_bytes(receipt))
            signature = subprocess.run(
                ['openssl', 'pkeyutl', '-sign', '-inkey', str(root / 'key.der'), '-keyform', 'DER',
                 '-rawin', '-in', str(root / 'payload')], capture_output=True, timeout=5, check=True,
            ).stdout
        receipt['signature'] = base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')

        reservation = self.post('/api/hub-mcp', {
            'v': 1, 'op': 'a2a.budget.reserve', 'key': 'signed-a2a-reserve',
            'owner_id': 'local-owner', 'delegation_id': delegation_id, 'parent_job_id': parent_job_id,
            'currency': 'USD', 'budget_limit_minor': 2_000,
            'approval_sha256': 'a' * 64, 'deadline_at': deadline_at,
        })
        self.assertEqual(reservation['state'], 'HELD')
        self.post('/api/hub-mcp', {
            'v': 1, 'op': 'a2a.budget.dispatch', 'key': 'signed-a2a-dispatch',
            'delegation_id': delegation_id,
        })
        settled = self.post('/api/hub-mcp', {
            'v': 1, 'op': 'a2a.budget.settle', 'key': 'signed-a2a-settle',
            'delegation_id': delegation_id, 'receipt': receipt,
        })
        self.assertEqual(settled['state'], 'SETTLED')
        self.assertEqual(settled['settled_minor'], 650)
        self.assertEqual(settled['released_minor'], 1_350)
        state = self.state()
        self.assertEqual(state['value_spend']['simulation_only'], True)
        self.assertEqual(state['wallet']['available_minor'], 4_350)
        self.assertEqual(state['value_spend']['spend_accounts']['SPEND_COMMITTED'], 650)
        self.assertEqual(state['value_spend']['spend_accounts']['SPEND_HOLD'], 0)


class HubMainTest(unittest.TestCase):
    def test_sigterm_uses_graceful_close_path(self):
        handlers = {}

        class FakeServer:
            server_port = 8877
            closed = False

            def serve_forever(self):
                handlers[hub_server.signal.SIGTERM](hub_server.signal.SIGTERM, None)

            def server_close(self):
                self.closed = True

        server = FakeServer()

        def remember(signum, handler):
            handlers[signum] = handler

        with patch.object(hub_server, "HubServer", return_value=server), \
                patch.object(hub_server.signal, "getsignal", return_value="previous"), \
                patch.object(hub_server.signal, "signal", side_effect=remember):
            self.assertEqual(hub_server.main(["--port", "0"]), 0)
        self.assertTrue(server.closed)
        self.assertEqual(handlers[hub_server.signal.SIGTERM], "previous")
