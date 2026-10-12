"""Authenticated, encrypted application envelopes, independent of radio bearer.

Uses the maintained cryptography AESGCM implementation, not a new cipher.
Key provisioning/rotation and secure-element integration remain deployment work.
"""
import base64
import json
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

MAX_WIRE = 8192

class ProtocolError(ValueError):
    pass

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")

def _unique(pairs):
    out = {}
    for k, v in pairs:
        if k in out:
            raise ProtocolError("duplicate JSON field")
        out[k] = v
    return out

def parse(raw):
    if not isinstance(raw, bytes) or len(raw) > MAX_WIRE:
        raise ProtocolError("wire limit exceeded")
    try:
        return json.loads(raw, object_pairs_hook=_unique,
                          parse_constant=lambda _: (_ for _ in ()).throw(ProtocolError("non-finite JSON")))
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise ProtocolError("invalid JSON envelope") from exc

class Codec:
    def __init__(self, device, key):
        if not isinstance(device, str) or not 1 <= len(device) <= 128 or len(key) != 32:
            raise ValueError("device identifier and 256-bit key required")
        self.device = device
        self.aes = AESGCM(key)

    def seal(self, body, kind, challenge=""):
        if kind not in ("request", "response", "delivery", "receipt"):
            raise ProtocolError("unknown direction")
        header = {"v": 1, "device": self.device, "kind": kind, "challenge": challenge}
        nonce = secrets.token_bytes(12)
        ciphertext = self.aes.encrypt(nonce, canonical(body), canonical(header))
        packet = canonical(dict(header, nonce=base64.b64encode(nonce).decode(),
                                ciphertext=base64.b64encode(ciphertext).decode()))
        if len(packet) > MAX_WIRE:
            raise ProtocolError("encrypted packet exceeds transport limit")
        return packet

    def open(self, raw, kind, challenge=""):
        packet = parse(raw)
        fields = {"v", "device", "kind", "challenge", "nonce", "ciphertext"}
        if not isinstance(packet, dict) or set(packet) != fields:
            raise ProtocolError("unexpected envelope fields")
        if type(packet["v"]) is not int or packet["v"] != 1:
            raise ProtocolError("invalid protocol version")
        header = {k: packet[k] for k in ("v", "device", "kind", "challenge")}
        if header != {"v": 1, "device": self.device, "kind": kind, "challenge": challenge}:
            raise ProtocolError("recipient, direction or challenge mismatch")
        try:
            nonce = base64.b64decode(packet["nonce"], validate=True)
            encrypted = base64.b64decode(packet["ciphertext"], validate=True)
            if len(nonce) != 12:
                raise ValueError("nonce length")
            plaintext = self.aes.decrypt(nonce, encrypted, canonical(header))
        except (TypeError, ValueError, InvalidTag) as exc:
            raise ProtocolError("message authentication failed") from exc
        result = parse(plaintext)
        if not isinstance(result, dict):
            raise ProtocolError("body must be an object")
        return result
