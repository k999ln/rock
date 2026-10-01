"""Protocol/policy tests; loopback HTTP is not a satellite or hardware test."""
import base64
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from alink.policy import Route, Selector
from alink.protocol import Codec, MAX_WIRE, ProtocolError, canonical, parse
from alink.receiver import Receiver
from alink.transport import AuthenticationError, HardDown, HTTPLink, LinkError


TEST_KEY = bytes(range(32))


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.codec = Codec("test-hub-01", TEST_KEY)

    def test_encrypted_unicode_roundtrip(self):
        body = {"notification": "衛星からのお知らせ", "sequence": 5}
        wire = self.codec.seal(body, "response", "fresh-challenge")
        self.assertNotIn(body["notification"].encode(), wire)
        self.assertEqual(self.codec.open(wire, "response", "fresh-challenge"), body)

    def test_ciphertext_tampering_rejected(self):
        packet = parse(self.codec.seal({"ready": True}, "response", "challenge"))
        encrypted = bytearray(base64.b64decode(packet["ciphertext"]))
        encrypted[0] ^= 1
        packet["ciphertext"] = base64.b64encode(encrypted).decode()
        with self.assertRaises(ProtocolError):
            self.codec.open(canonical(packet), "response", "challenge")

    def test_wrong_recipient_key_direction_and_challenge_rejected(self):
        wire = self.codec.seal({"ready": True}, "response", "request-1")
        cases = ((Codec("another-hub", TEST_KEY), "response", "request-1"),
                 (Codec("test-hub-01", bytes(reversed(TEST_KEY))), "response", "request-1"),
                 (self.codec, "request", "request-1"),
                 (self.codec, "response", "request-2"))
        for codec, kind, challenge in cases:
            with self.subTest(kind=kind, challenge=challenge), self.assertRaises(ProtocolError):
                codec.open(wire, kind, challenge)

    def test_unknown_and_missing_envelope_fields_rejected(self):
        original = parse(self.codec.seal({"ready": True}, "response"))
        added = dict(original, extra="untrusted")
        removed = dict(original)
        del removed["nonce"]
        for packet in (added, removed):
            with self.subTest(fields=list(packet)), self.assertRaises(ProtocolError):
                self.codec.open(canonical(packet), "response")

    def test_duplicate_json_fields_rejected(self):
        for raw in (b'{"v":1,"v":1}', b'{"nested":{"x":1,"x":2}}'):
            with self.subTest(raw=raw), self.assertRaises(ProtocolError):
                parse(raw)

    def test_nonfinite_invalid_utf8_and_oversize_rejected(self):
        for raw in (b'{"x":NaN}', b'{"x":Infinity}', b'"\xff"', b" " * (MAX_WIRE + 1)):
            with self.subTest(length=len(raw)), self.assertRaises(ProtocolError):
                parse(raw)

    def test_invalid_nonce_and_non_object_body_rejected(self):
        packet = parse(self.codec.seal({"ready": True}, "response"))
        for nonce in ("!bad-base64!", base64.b64encode(b"short").decode(), None):
            with self.subTest(nonce=nonce), self.assertRaises(ProtocolError):
                self.codec.open(canonical(dict(packet, nonce=nonce)), "response")
        with self.assertRaises(ProtocolError):
            self.codec.open(self.codec.seal([1, 2], "response"), "response")


class EndpointAndSchemaTests(unittest.TestCase):
    def setUp(self):
        self.codec = Codec("test-hub-01", TEST_KEY)
        self.link = HTTPLink("wifi", "http://127.0.0.1:9", self.codec, loopback_test=True)

    def test_http_requires_explicit_literal_loopback_test(self):
        rejected = [
            ("http://127.0.0.1", {}),
            ("http://localhost", {"loopback_test": True}),
            ("http://127.0.0.1.example.com", {"loopback_test": True}),
            ("http://192.168.1.1", {"loopback_test": True}),
            ("http://0.0.0.0", {"loopback_test": True}),
            ("https://127.0.0.1", {"loopback_test": True}),
            ("https://service.example", {}),
        ]
        for url, kwargs in rejected:
            with self.subTest(url=url, kwargs=kwargs), self.assertRaises(ValueError):
                HTTPLink("candidate", url, self.codec, **kwargs)
        HTTPLink("test-v6", "http://[::1]", self.codec, loopback_test=True)
        HTTPLink("live", "https://service.example", self.codec, interface="wwan0")

    def test_credentials_query_and_fragment_rejected(self):
        for url in ("http://user:secret@127.0.0.1", "http://127.0.0.1/?x=1", "http://127.0.0.1/#x"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                HTTPLink("candidate", url, self.codec, loopback_test=True)

    def test_probe_requires_exact_schema(self):
        with patch.object(self.link, "exchange", return_value={"ready": True, "extra": "not defined"}):
            with self.assertRaises((ProtocolError, LinkError)):
                self.link.probe()
        for value in (False, 1, "true", None):
            with self.subTest(value=value), patch.object(self.link, "exchange", return_value={"ready": value}):
                with self.assertRaises((ProtocolError, LinkError)):
                    self.link.probe()
        with patch.object(self.link, "exchange", return_value={"ready": True}):
            self.link.probe()

    def test_receive_schema_and_batch_size(self):
        for response in ({"records": [], "extra": 1}, {"records": "wrong"}, {"records": [{}, {}]}, {}):
            with self.subTest(response=response), patch.object(self.link, "exchange", return_value=response):
                with self.assertRaises(ProtocolError):
                    self.link.receive()
        with patch.object(self.link, "exchange", return_value={"records": []}):
            self.assertEqual(self.link.receive(), [])

    def test_ack_schema_and_identity(self):
        receipts = [{"id": "n1", "result": "stored"}]
        for response in ({"acknowledged": ["n1"], "extra": 1},
                         {"acknowledged": ["another"]}, {"acknowledged": "n1"}, {}):
            with self.subTest(response=response), patch.object(self.link, "exchange", return_value=response):
                with self.assertRaises(ProtocolError):
                    self.link.acknowledge(receipts)
        with patch.object(self.link, "exchange", return_value={"acknowledged": ["n1"]}):
            self.assertEqual(self.link.acknowledge(receipts), ["n1"])


class LoopbackHTTPTests(unittest.TestCase):
    """Use real localhost sockets to check challenge binding and HTTP rejection."""
    def setUp(self):
        self.codec = Codec("test-hub-01", TEST_KEY)
        self.requests = []
        self.mode = "fresh"
        self.first_response = None
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_POST(self):
                raw = self.rfile.read(int(self.headers["Content-Length"]))
                packet = parse(raw)
                challenge = packet["challenge"]
                body = owner.codec.open(raw, "request", challenge)
                owner.requests.append({"challenge": challenge, "body": body, "path": self.path})
                if owner.mode == "redirect":
                    self.send_response(302)
                    self.send_header("Location", "http://127.0.0.1:1/should-not-follow")
                    self.end_headers()
                    return
                if owner.mode == "replay":
                    response = owner.first_response
                else:
                    response = owner.codec.seal({"ready": True}, "response", challenge)
                    owner.first_response = response
                self.send_response(200)
                self.send_header("Content-Length", str(len(response)))
                self.end_headers()
                self.wfile.write(response)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": .01}, daemon=True)
        self.thread.start()
        self.addCleanup(self.close_server)
        self.link = HTTPLink("loopback-test", f"http://127.0.0.1:{self.server.server_port}/service",
                             self.codec, loopback_test=True)

    def close_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def test_authenticated_exchange_and_new_challenge_each_request(self):
        self.link.probe()
        self.link.probe()
        self.assertEqual(len(self.requests), 2)
        self.assertNotEqual(self.requests[0]["challenge"], self.requests[1]["challenge"])
        self.assertEqual(self.requests[0]["body"], {"op": "probe"})
        self.assertEqual(self.requests[0]["path"], "/service/v1/exchange")

    def test_old_http_response_replay_rejected_for_new_request(self):
        self.link.probe()
        self.mode = "replay"
        with self.assertRaises(AuthenticationError):
            self.link.probe()
        self.assertEqual(len(self.requests), 2)

    def test_http_redirect_rejected_without_following(self):
        self.mode = "redirect"
        with self.assertRaises(AuthenticationError):
            self.link.probe()
        self.assertEqual(len(self.requests), 1)


class FixedRng:
    def __init__(self, fraction=1):
        self.fraction = fraction

    def uniform(self, _low, _high):
        return self.fraction


class FakeLink:
    def __init__(self, probe_error=None, receive_error=None, records=None):
        self.probe_error = probe_error
        self.receive_error = receive_error
        self.records = [] if records is None else records
        self.probes = self.receives = self.acks = 0

    def probe(self):
        self.probes += 1
        if self.probe_error:
            raise self.probe_error

    def receive(self):
        self.receives += 1
        if self.receive_error:
            raise self.receive_error
        return self.records

    def acknowledge(self, receipts):
        self.acks += 1
        return [r["id"] for r in receipts]


def route(name, priority, **kwargs):
    return Route(name, priority, FakeLink(), allowed=True, **kwargs)


class SelectorTests(unittest.TestCase):
    def test_unapproved_route_never_probed_or_selected(self):
        denied = Route("unapproved-wifi", 0, FakeLink(), allowed=False, healthy=True)
        cell = route("cell", 1)
        selector = Selector([denied, cell], rng=FixedRng())
        self.assertIs(selector.refresh(0), cell)
        self.assertEqual(denied.link.probes, 0)
        self.assertIs(selector.select(100), cell)

    def test_priority_and_independent_alternative_probe(self):
        wifi, cell, sat = route("wifi", 0), route("cell", 1), route("sat", 2, interval=120, is_satellite=True)
        wifi.link.probe_error = AuthenticationError("portal")
        selector = Selector([wifi, cell, sat], rng=FixedRng())
        self.assertIs(selector.refresh(0), cell)
        self.assertEqual((wifi.link.probes, cell.link.probes, sat.link.probes), (1, 1, 1))

    def test_dwell_boundary_60_seconds_inclusive(self):
        wifi, cell = route("wifi", 0), route("cell", 1)
        wifi.link.probe_error = HardDown("offline")
        selector = Selector([wifi, cell], rng=FixedRng())
        self.assertIs(selector.refresh(0), cell)
        wifi.link.probe_error = None
        self.assertIs(selector.refresh(10), cell)
        self.assertIs(selector.select(39.999), cell)
        self.assertIs(selector.select(40), cell)
        self.assertIs(selector.select(59.999), cell)
        self.assertIs(selector.select(60), wifi)

    def test_stability_boundary_30_seconds_inclusive(self):
        wifi, cell = route("wifi", 0), route("cell", 1)
        wifi.link.probe_error = HardDown("offline")
        selector = Selector([wifi, cell], rng=FixedRng())
        self.assertIs(selector.refresh(0), cell)
        wifi.link.probe_error = None
        self.assertIs(selector.refresh(40), cell)
        self.assertIs(selector.select(60), cell)
        self.assertIs(selector.select(69.999), cell)
        self.assertIs(selector.select(70), wifi)

    def test_flapping_preferred_route_restarts_stability_timer(self):
        wifi, cell = route("wifi", 0), route("cell", 1)
        wifi.link.probe_error = HardDown("offline")
        selector = Selector([wifi, cell], rng=FixedRng())
        selector.refresh(0)
        wifi.link.probe_error = None
        self.assertIs(selector.refresh(50), cell)
        selector.failed("wifi", 70, HardDown("flap"))
        self.assertIs(selector.select(80), cell)
        self.assertIs(selector.refresh(80), cell)
        self.assertIs(selector.select(109.999), cell)
        self.assertIs(selector.select(110), wifi)

    def test_primary_hard_failure_immediately_uses_backup(self):
        wifi, cell = route("wifi", 0), route("cell", 1)
        selector = Selector([wifi, cell], rng=FixedRng())
        self.assertIs(selector.refresh(0), wifi)
        selector.failed("wifi", 1, HardDown("cable removed"))
        self.assertIs(selector.select(1), cell)
        self.assertEqual(selector.selected_at, 1)

    def test_soft_failures_drop_on_third_and_clear_down_drops_first(self):
        wifi = route("wifi", 0)
        selector = Selector([wifi], rng=FixedRng())
        selector.refresh(0)
        for count in (1, 2):
            selector.failed("wifi", count, LinkError("timeout"))
            self.assertTrue(wifi.healthy)
        selector.failed("wifi", 3, LinkError("timeout"))
        self.assertFalse(wifi.healthy)
        self.assertIsNone(selector.select(3))
        selector.refresh(30)
        self.assertTrue(wifi.healthy)
        selector.failed("wifi", 31, AuthenticationError("revoked"))
        self.assertFalse(wifi.healthy)

    def test_actual_transfer_failure_immediately_drops(self):
        wifi = route("wifi", 0)
        selector = Selector([wifi], rng=FixedRng())
        selector.refresh(0)
        selector.failed("wifi", 1, LinkError("send failed"), actual_transfer=True)
        self.assertFalse(wifi.healthy)

    def test_satellite_retry_never_precedes_configured_interval(self):
        sat = route("sat", 2, interval=120, is_satellite=True)
        sat.link.probe_error = LinkError("no visibility")
        selector = Selector([sat], rng=FixedRng(.8))
        selector.refresh(0)
        self.assertGreaterEqual(sat.next_probe, 120)
        selector.refresh(119.999)
        self.assertEqual(sat.link.probes, 1)
        selector.refresh(120)
        self.assertEqual(sat.link.probes, 2)

    def test_successful_probe_resets_error_and_next_probe(self):
        wifi = route("wifi", 0)
        wifi.link.probe_error = HardDown("down")
        selector = Selector([wifi], rng=FixedRng())
        selector.refresh(0)
        self.assertFalse(wifi.healthy)
        wifi.link.probe_error = None
        self.assertIs(selector.refresh(5), wifi)
        self.assertEqual(wifi.failures, 0)
        self.assertIsNone(wifi.last_error)
        self.assertEqual(wifi.healthy_since, 5)
        selector.refresh(9.999)
        self.assertEqual(wifi.link.probes, 2)
        selector.refresh(10)
        self.assertEqual(wifi.link.probes, 3)


class StubStore:
    """Receiver collaborator only; persistence is covered by test_storage.py."""
    def __init__(self, outcome="stored", error=None):
        self.outcome, self.error = outcome, error
        self.ingested = []

    def prune(self, now):
        pass

    def ingest(self, record, *, now, source):
        if self.error:
            raise self.error
        self.ingested.append((record, now, source))
        return self.outcome

    def pending_acks(self):
        return []

    def acknowledge(self, ids):
        pass

    def last_received_at(self):
        return None


class ReceiverPolicyTests(unittest.TestCase):
    def test_hard_receive_failure_tries_backup_in_same_tick(self):
        wifi, cell = route("wifi", 0), route("cell", 1)
        wifi.link.receive_error = HardDown("connection gone")
        cell.link.records = [{"id": "n1"}]
        store = StubStore()
        receiver = Receiver(store, Selector([wifi, cell], rng=FixedRng()))
        result = receiver.tick(0, 1000)
        self.assertEqual(result["route"], "cell")
        self.assertEqual(result["last_received"], 1000)
        self.assertEqual((wifi.link.receives, cell.link.receives), (1, 1))
        self.assertEqual(store.ingested[0][2], "cell")

    def test_no_approved_route_makes_no_calls(self):
        link = FakeLink()
        selector = Selector([Route("forbidden", 0, link, allowed=False)], rng=FixedRng())
        result = Receiver(StubStore(), selector).tick(0, 1000)
        self.assertIsNone(result["route"])
        self.assertEqual(result["state"], "接続待ち")
        self.assertEqual((link.probes, link.receives, link.acks), (0, 0, 0))

    def test_all_routes_offline_do_not_claim_receipt(self):
        links = [route("wifi", 0), route("cell", 1), route("sat", 2, interval=120, is_satellite=True)]
        for candidate in links:
            candidate.link.probe_error = HardDown("no route")
        result = Receiver(StubStore(), Selector(links, rng=FixedRng())).tick(0, 1000)
        self.assertIsNone(result["route"])
        self.assertIsNone(result["last_received"])
        self.assertEqual(result["events"], [])
        self.assertEqual(sum(candidate.link.receives for candidate in links), 0)

    def test_storage_rejection_does_not_ack_or_update_receive_time(self):
        wifi = route("wifi", 0)
        wifi.link.records = [{"id": "n1"}]
        receiver = Receiver(StubStore(error=ValueError("invalid record")), Selector([wifi], rng=FixedRng()))
        result = receiver.tick(0, 1000)
        self.assertIn("保留", result["state"])
        self.assertIsNone(result["last_received"])
        self.assertEqual(wifi.link.acks, 0)


if __name__ == "__main__":
    unittest.main()
