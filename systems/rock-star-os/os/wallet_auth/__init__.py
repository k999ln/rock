"""Wallet WebAuthn verification; fixture signing is never imported implicitly."""
from .protocol import AuthError, AuthUnavailable, ORIGIN, RP_ID, verify_assertion, verify_registration

__all__ = ['AuthError', 'AuthUnavailable', 'ORIGIN', 'RP_ID', 'verify_assertion', 'verify_registration']
