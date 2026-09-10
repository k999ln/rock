"""Public development identities. These constants are NOT credentials.

HMAC authenticates message structure in tests, not real people: every fixture
key is public. Production authentication, KYC and payment providers are absent.
"""
import hashlib
import hmac
import json
import re

from blackberryrock.packages import canonical

MONTHLY_FEE_MINOR = 888
CURRENCY = "USD"
TERMS_VERSION = "simulator-monthly-usd-8.88-v1"
MAX_EVENT_BYTES = 8192
DOMAIN = b"RockEntitlementWebhook-v1\0"
PUBLIC_TOKENS = {
    "fulfillment": "PUBLIC-FIXTURE-ENTITLEMENT-FULFILLMENT-v1",
    "wallet": "PUBLIC-FIXTURE-ENTITLEMENT-WALLET-v1",
    "alice": "PUBLIC-FIXTURE-ENTITLEMENT-OWNER-ALICE-v1",
    "bob": "PUBLIC-FIXTURE-ENTITLEMENT-OWNER-BOB-v1",
}
PRINCIPALS = {
    "fulfillment": {"role": "fulfillment"},
    "wallet": {"role": "wallet"},
    "alice": {"role": "owner", "owner_ref": "fixture-owner-alice"},
    "bob": {"role": "owner", "owner_ref": "fixture-owner-bob"},
}


class EntitlementError(ValueError):
    pass


class AuthenticationError(EntitlementError):
    pass


class Conflict(EntitlementError):
    pass


class NotEligible(EntitlementError):
    pass


class Capacity(EntitlementError):
    pass


def identifier(value, *, fixture=False):
    if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.:@-]{0,159}", value):
        raise EntitlementError("invalid opaque identifier")
    if fixture and not value.startswith("fixture-"):
        raise EntitlementError("only synthetic fixture references are accepted; no personal data")
    return value


def fields(value, expected):
    if not isinstance(value, dict) or set(value) != set(expected):
        raise EntitlementError("missing or unknown field")


def integer(value, minimum=0, maximum=2**53-1):
    if type(value) is not int or not minimum <= value <= maximum:
        raise EntitlementError("invalid integer")
    return value


def authenticate(token, role=None):
    if not isinstance(token, str) or not 1 <= len(token) <= 256:
        raise AuthenticationError("unauthenticated fixture principal")
    match = None
    for actor, expected in PUBLIC_TOKENS.items():
        if hmac.compare_digest(token.encode(), expected.encode()):
            match = {"actor": actor, **PRINCIPALS[actor]}
    if not match or role is not None and match["role"] != role:
        raise AuthenticationError("unauthorized fixture principal")
    return match


def sign_fixture_event(issuer, event_id, stream, sequence, occurred_at, kind, payload):
    """Simulator SDK only: HMAC with already-public fixture text, no key creation."""
    if issuer not in ("fulfillment", "wallet"):
        raise AuthenticationError("issuer cannot send webhooks")
    event = {"schema_version": 1, "issuer": issuer, "event_id": event_id,
             "stream": stream, "sequence": sequence, "occurred_at": occurred_at,
             "kind": kind, "payload": payload}
    event["signature"] = hmac.new(PUBLIC_TOKENS[issuer].encode(), DOMAIN + canonical(event), hashlib.sha256).hexdigest()
    return event


def verify_event(event, now):
    try:
        encoded = canonical(event)
        if len(encoded) > MAX_EVENT_BYTES:
            raise Capacity("webhook body exceeds limit")
        fields(event, ("schema_version", "issuer", "event_id", "stream", "sequence", "occurred_at", "kind", "payload", "signature"))
        if type(event["schema_version"]) is not int or event["schema_version"] != 1:
            raise EntitlementError("unsupported event schema")
        issuer = event["issuer"]
        if issuer not in ("fulfillment", "wallet"):
            raise AuthenticationError("unauthorized webhook issuer")
        identifier(event["event_id"])
        identifier(event["stream"])
        integer(event["sequence"], 1)
        integer(event["occurred_at"], 0, now + 30)
        signature = event["signature"]
        if not isinstance(signature, str) or not re.fullmatch("[a-f0-9]{64}", signature):
            raise AuthenticationError("invalid webhook signature")
        unsigned = {k: v for k, v in event.items() if k != "signature"}
        expected = hmac.new(PUBLIC_TOKENS[issuer].encode(), DOMAIN + canonical(unsigned), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise AuthenticationError("invalid webhook signature")
        return json.loads(encoded), hashlib.sha256(encoded).hexdigest()
    except (TypeError, KeyError, RecursionError, UnicodeError) as error:
        raise EntitlementError("malformed webhook") from error
