"""Sole Broker-facing admission facade: AP authentication + network quota + nft.

Authentication context comes from the Broker, never from request JSON. Keep the
underlying gate/controller private; direct root calls are outside this boundary.
"""
from controller import require, Rejected


class AccessSession:
    def __init__(self, gate, ap, network):
        self.gate, self.ap, self.network = gate, ap, network
        require(ap.directory.resolve() == (gate.controller.directory / 'ap').resolve()
                and network.directory.resolve() == (gate.controller.directory / 'network').resolve(), 'adapter_storage_mismatch')
        require(network.policy == gate.controller.snapshot(gate._now())['policy'], 'network_policy_mismatch')

    def _owner(self, owner, revision=None):
        s = self.gate.controller.snapshot(self.gate._now())
        require(owner == s['policy']['ownerId'], 'owner_mismatch')
        if revision is not None:
            require(revision == s['revision'], 'revision_conflict')
        return s

    def enroll(self, owner, revision, client, byte_cap):
        with self.gate.mutex:
            self._owner(owner, revision)
            result = self.gate.owner_command(owner, revision, dict(op='allow', clientId=client['clientId'], byteCap=byte_cap))
            try:
                key = self.ap.provision(client['clientId'], client)
            except BaseException:
                self.gate.owner_command(owner, result['revision'], dict(op='disable'))
                raise
            return dict(clientId=client['clientId'], enrollmentKey=key, revision=result['revision'])

    def enable(self, owner, revision):
        with self.gate.mutex:
            self._owner(owner, revision)
            try:
                self.gate._fence()
                self.network.account()
                self.ap.enable()
                return self.gate.owner_command(owner, revision, dict(op='enable'))
            except BaseException:
                self.ap.halt()
                raise

    def observe(self, owner, revision, observation):
        with self.gate.mutex:
            self._owner(owner, revision)
            # First close all old permits. Failed refresh cannot preserve old data.
            self.gate._fence()
            self.network.account()
            connected = []
            for client_id in self.ap.client_ids():
                try:
                    self.ap.authenticated(client_id)
                    connected.append(client_id)
                except Rejected:
                    pass
            value = dict(observation, connectedClientIds=connected, apIsolated=True,
                         meterReady=True, hardQuotaReady=True)
            return self.gate.observe(revision, value)

    def open(self, owner, revision, grant_id, client_id, max_bytes):
        with self.gate.mutex:
            self._owner(owner, revision)
            try:
                b = self.ap.authenticated(client_id)
            except BaseException:
                self.gate._fence()
                raise
            def authorize(grant):
                require(self.ap.authenticated(client_id) == b, 'ap_binding_changed')
                receipt = self.network.reserve(grant)
                require(self.ap.authenticated(client_id) == b, 'ap_binding_changed')
                return receipt
            return self.gate.open(revision, grant_id, b, max_bytes, authority=authorize)

    def close(self, owner, grant_id):
        with self.gate.mutex:
            self._owner(owner)
            local = self.gate.close(grant_id)
            remote = self.network.close(grant_id)
            return dict(local=local, network=remote, reservationRetained=True, invoiceVerified=False)

    def stop(self, owner, revision, client_id=None, dock_id=False):
        with self.gate.mutex:
            self._owner(owner, revision)
            # Local rule removal is not carrier close. Include unknown remote
            # attempts even when a prior local fence marked its record closed.
            result, failures = None, {}
            try:
                ids = self.network.pending_ids()
            except Exception as error:
                ids = []
                failures['providerJournal'] = type(error).__name__
            try:
                if dock_id is not False:
                    result = self.gate.attachment(revision, dock_id)
                else:
                    command = dict(op='disable') if client_id is None else dict(op='revoke', clientId=client_id)
                    result = self.gate.owner_command(owner, revision, command)
            except Exception as error:
                failures['local'] = type(error).__name__
            try:
                self.ap.halt()  # Independent of nft and control-socket availability.
                if client_id is not None:
                    self.ap.revoke(client_id)
            except Exception as error:
                failures['ap'] = type(error).__name__
            closed, unknown = [], []
            for grant_id in ids:
                try:
                    self.network.close(grant_id)
                    closed.append(grant_id)
                except Exception:
                    unknown.append(grant_id)
            return dict(revision=result['revision'] if result else None,
                        localStopConfirmed='local' not in failures, apStopConfirmed='ap' not in failures,
                        failures=failures, providerJournalKnown='providerJournal' not in failures,
                        providerClosed=closed, providerUnknown=unknown,
                        reservationRetained=True, physicalAccepted=False)
