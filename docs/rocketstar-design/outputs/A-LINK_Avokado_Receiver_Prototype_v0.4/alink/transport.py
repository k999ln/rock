"""Bound HTTPS transport. HTTP is restricted to explicit loopback tests.

This does not change host routes, join Wi-Fi, activate SIMs, or buy service.
Live IP bearers must be provisioned and brought up by the host network manager.
"""
import http.client
import ipaddress
import secrets
import socket
import sys
import ssl
from urllib.parse import urlsplit
from .protocol import MAX_WIRE, ProtocolError

class LinkError(Exception):
    pass

class HardDown(LinkError):
    pass

class AuthenticationError(LinkError):
    pass

def bound_socket(address, timeout, source_address=None, *, interface):
    if sys.platform != "linux" or not interface or len(interface.encode()) > 15:
        raise HardDown("live interface binding requires Linux and a valid interface")
    errors = []
    for af, socktype, proto, _, sa in socket.getaddrinfo(address[0], address[1], 0, socket.SOCK_STREAM):
        sock = socket.socket(af, socktype, proto)
        try:
            sock.settimeout(timeout)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, interface.encode() + b"\0")
            sock.connect(sa)
            return sock
        except OSError as exc:
            errors.append(exc)
            sock.close()
    raise HardDown("bound interface unavailable") from (errors[-1] if errors else None)

class HTTPLink:
    def __init__(self, name, base_url, codec, *, interface=None, loopback_test=False, timeout=3.0):
        self.name, self.codec = name, codec
        self.url = urlsplit(base_url)
        self.interface, self.loopback_test, self.timeout = interface, loopback_test, timeout
        if not self.url.hostname:
            raise ValueError("endpoint hostname required")
        if self.url.username or self.url.password or self.url.query or self.url.fragment:
            raise ValueError("endpoint must not contain credentials, query or fragment")
        try:
            literal_loopback = ipaddress.ip_address(self.url.hostname or "").is_loopback
        except ValueError:
            literal_loopback = False
        if loopback_test:
            if self.url.scheme != "http" or not literal_loopback:
                raise ValueError("test HTTP requires a literal loopback address")
        elif self.url.scheme != "https" or not interface:
            raise ValueError("live transport requires HTTPS and explicit interface")

    def exchange(self, body):
        challenge = secrets.token_hex(16)
        packet = self.codec.seal(body, "request", challenge)
        if self.loopback_test:
            conn = http.client.HTTPConnection(self.url.hostname, self.url.port, timeout=self.timeout)
        else:
            conn = http.client.HTTPSConnection(self.url.hostname, self.url.port, timeout=self.timeout,
                                                context=ssl.create_default_context())
            conn._create_connection = lambda address, timeout, source_address=None: bound_socket(
                address, timeout, source_address, interface=self.interface)
        try:
            conn.request("POST", self.url.path.rstrip("/") + "/v1/exchange", body=packet,
                         headers={"Content-Type": "application/json", "Accept": "application/json"})
            response = conn.getresponse()
            if response.status in (401, 403) or response.status in (301, 302, 303, 307, 308, 511):
                raise AuthenticationError("authentication or captive portal")
            if response.status != 200:
                raise LinkError("service unavailable")
            raw = response.read(MAX_WIRE + 1)
            return self.codec.open(raw, "response", challenge)
        except ProtocolError as exc:
            raise AuthenticationError("untrusted service response") from exc
        except ssl.SSLError as exc:
            raise AuthenticationError("TLS verification failed") from exc
        except (ConnectionRefusedError, ConnectionResetError, BrokenPipeError) as exc:
            raise HardDown("connection closed") from exc
        except (OSError, http.client.HTTPException) as exc:
            raise LinkError("transport unavailable") from exc
        finally:
            conn.close()

    def probe(self):
        result = self.exchange({"op": "probe"})
        if set(result) != {"ready"} or result["ready"] is not True:
            raise LinkError("service not ready")

    def receive(self):
        response = self.exchange({"op": "receive"})
        if set(response) != {"records"} or not isinstance(response["records"], list) or len(response["records"]) > 1:
            raise ProtocolError("receive schema or batch limit")
        return response["records"]

    def acknowledge(self, receipts):
        # One ACK at a time bounds wire cost even when recovering a large backlog.
        receipts = receipts[:1]
        response = self.exchange({"op": "ack", "receipts": receipts})
        ids = response.get("acknowledged")
        expected = {r["id"] for r in receipts}
        if set(response) != {"acknowledged"} or not isinstance(ids, list) or any(not isinstance(i, str) or i not in expected for i in ids):
            raise ProtocolError("invalid ACK confirmation")
        return ids
