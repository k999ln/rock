"""Explicit consent and status-first recovery; no automatic fallback to local."""
from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, require_compatible, verify_package
from .protocol import (MAX_INPUT, RunnerError, TransportError, digest, identifier,
                       sign_request, text_hash, verify_response, authority_identifier)


def consent_for(package, text, *, target, endpoint_id, key):
    """Show this exact object at the approval boundary; creation is not approval."""
    if not isinstance(text, str) or len(text.encode('utf-8')) > MAX_INPUT:
        raise RunnerError('UTF-8 input exceeds 64 KiB')
    return {'approved': True, 'package_sha256': digest(package), 'input_sha256': text_hash(text),
            'target': target, 'endpoint_id': endpoint_id, 'key': key}


class RunnerClient:
    def __init__(self, transport, *, endpoint_id, owner, token, attempts=2, publisher_trust=None, revoked=None, authority_id=None):
        self.transport = transport
        self.endpoint_id, self.owner = identifier(endpoint_id), identifier(owner)
        self.token = token
        self.authority_id = authority_identifier(authority_id)
        self.publisher_trust = {TEST_PUBLISHER: PUBLIC_TEST_KEY} if publisher_trust is None else dict(publisher_trust)
        self.revoked = revoked if revoked is not None else set()
        if type(attempts) is not int or not 1 <= attempts <= 3:
            raise RunnerError('attempts must be 1 to 3')
        self.attempts = attempts

    def _request(self, op, key, **fields):
        return {'v': 1, 'op': op, 'endpoint_id': self.endpoint_id, 'key': identifier(key), **fields}

    def _exchange(self, request):
        envelope = sign_request(self.owner, self.token, request, authority_id=self.authority_id)
        response = verify_response(self.token, request, self.transport.exchange(envelope), authority_id=self.authority_id)
        if not isinstance(response, dict) or not isinstance(response.get('ok'), bool):
            raise TransportError('invalid runner response')
        if not response['ok']:
            if response.get('code') == 'unavailable':
                raise TransportError(response.get('error', 'runner unavailable'))
            raise RunnerError(response.get('error', 'runner request rejected'))
        return response['result']

    def _read_retry(self, request):
        for attempt in range(self.attempts):
            try:
                return self._exchange(request)
            except TransportError:
                if attempt + 1 == self.attempts:
                    raise

    def status(self, key):
        return self._read_retry(self._request('status', key))

    def submit(self, package, text, key, *, consent):
        expected = consent_for(package, text, target=self.transport.target, endpoint_id=self.endpoint_id, key=key)
        if not isinstance(consent, dict) or consent != expected or type(consent.get('approved')) is not bool:
            raise RunnerError('caller must approve this exact remote submission')
        # Fail closed before transmitting local-only or unsigned remote-ineligible data.
        manifest, _ = verify_package(package, self.publisher_trust, self.revoked() if callable(self.revoked) else self.revoked)
        require_compatible(manifest)
        if manifest.get('schema_version') not in (3, 4) or self.transport.target not in manifest.get('execution_targets', []):
            raise RunnerError('signed package does not permit this remote target')
        request = self._request('submit', key, package=package, text=text, consent=consent)
        for attempt in range(self.attempts):
            try:
                return self._exchange(request)
            except TransportError:
                try:
                    status = self.status(key)
                    if status['found']:
                        receipt = status['receipt']
                        if receipt['request_sha256'] != digest(request):
                            raise RunnerError('recovered key belongs to a different submission')
                        return receipt
                except TransportError:
                    pass
                if attempt + 1 == self.attempts:
                    raise TransportError('submission outcome unknown; retain key and reconcile status')

    def cancel(self, key):
        request = self._request('cancel', key)
        for attempt in range(self.attempts):
            try:
                return self._exchange(request)
            except TransportError:
                try:
                    status = self.status(key)
                    if not status['found'] or status['cancel_requested'] or status['state'] in {'succeeded', 'failed', 'cancelled', 'indeterminate'}:
                        return status
                except TransportError:
                    pass
                if attempt + 1 == self.attempts:
                    raise TransportError('cancellation outcome unknown; retain key and reconcile status')
