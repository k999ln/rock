"""Pinned HTTPS origin, explicit CA, strict length, no redirects or proxy fallback."""
import http.client
from pathlib import Path
import re
import socket
import ssl
import time
import uuid
from urllib.parse import urlsplit

from .common import RegistryError, TransportError


class HTTPSOrigin:
    def __init__(self, origin, ca_file, timeout=5, attempts=2, *, authority_id=None):
        if authority_id is not None:
            try:
                if not isinstance(authority_id,str) or str(uuid.UUID(authority_id)) != authority_id:
                    raise ValueError
            except (ValueError,AttributeError) as error:
                raise RegistryError('canonical service authority UUID required') from error
        self.authority_id = authority_id
        try:
            parsed = urlsplit(origin)
            port = parsed.port or 443
        except (ValueError, TypeError) as error:
            raise RegistryError("invalid fixed registry origin") from error
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.path not in ("", "/") or parsed.query or parsed.fragment
                or not re.fullmatch(r"[a-zA-Z0-9.-]+", parsed.hostname)):
            raise RegistryError("registry origin must be a fixed HTTPS hostname/IPv4 and port")
        if not isinstance(timeout, (int, float)) or not 0 < timeout <= 30 or type(attempts) is not int or not 1 <= attempts <= 3:
            raise RegistryError("invalid registry timeout or retry limit")
        self.host, self.port = parsed.hostname.lower(), port
        self.origin = f"https://{self.host}:{self.port}"
        self.timeout, self.attempts = timeout, attempts
        if not Path(ca_file).is_file():
            raise RegistryError("explicit registry CA file required")
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self.context.minimum_version = ssl.TLSVersion.TLSv1_2
        self.context.load_verify_locations(cafile=str(ca_file))
        self.context.check_hostname = True
        self.context.verify_mode = ssl.CERT_REQUIRED

    def request(self, method, path, limit, body=None, headers=None):
        if method not in ("GET", "POST") or not path.startswith("/") or path.startswith("//"):
            raise RegistryError("invalid registry request")
        last = None
        for _ in range(self.attempts):
            try:
                return self._once(method, path, limit, body, headers)
            except TransportError as error:
                last = error
        raise last

    def _once(self, method, path, limit, body, headers):
        connection = http.client.HTTPSConnection(self.host, self.port, context=self.context, timeout=self.timeout)
        deadline = time.monotonic() + self.timeout
        try:
            # No environment proxy support and no HTTP redirect implementation.
            connection.connect()
            stream_socket = connection.sock
            stream_socket.settimeout(max(0.001, deadline - time.monotonic()))
            connection.request(method, path, body=body, headers={"Accept": "application/json", "Connection": "close", **(headers or {})})
            response = connection.getresponse()
            if self.authority_id is not None and response.headers.get_all('X-Rock-Service-Authority', []) != [self.authority_id]:
                raise RegistryError('registry service authority response binding rejected')
            if 300 <= response.status < 400:
                raise RegistryError("registry redirect rejected; fixed origin required")
            lengths = response.headers.get_all("Content-Length", [])
            if response.headers.get("Transfer-Encoding") or len(lengths) != 1 or not re.fullmatch(r"[0-9]+", lengths[0]):
                raise RegistryError("registry response requires one bounded Content-Length")
            length = int(lengths[0])
            if length > limit:
                raise RegistryError("registry response exceeds byte limit")
            if response.status != 200:
                raise RegistryError(f"registry HTTP {response.status}")
            chunks, received = [], 0
            while received < length:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TransportError("registry response deadline exceeded")
                stream_socket.settimeout(remaining)
                chunk = response.read1(min(16384, length - received))
                if not chunk:
                    raise TransportError("registry response disconnected before Content-Length")
                chunks.append(chunk)
                received += len(chunk)
            if time.monotonic() > deadline:
                raise TransportError("registry response deadline exceeded")
            return b"".join(chunks)
        except ssl.SSLCertVerificationError as error:
            raise RegistryError("registry TLS certificate or hostname rejected") from error
        except RegistryError:
            raise
        except (OSError, http.client.HTTPException, TimeoutError) as error:
            raise TransportError("registry connection failed or incomplete") from error
        finally:
            connection.close()
