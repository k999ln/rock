"""Authority-local purchaser adapter for the existing cloud service policy.

This is not an OAuth adapter or an upstream MCP credential. The gateway supplies
the fixed consumer and its SERVICE bearer credential; callers cannot supply an
owner/device/subject. Gateway route allowlisting must additionally bind each
principal to its configured upstream identity: Broker.guard has no route input.

The same ServiceAccessController/EntitlementStore instance used by fulfillment
and Wallet must be passed here. Its lock spans Broker's durable local admission;
Broker releases it before discovery, effect calls and read-only reconciliation.
Cancellation of renewal does not revoke paid time. Nonpayment still permits
recovery/disconnect, but current device purchase is required for those actions.
This does not extend cross-device recovery beyond Broker's existing namespace.
"""
from contextlib import contextmanager
from types import MappingProxyType

from service_access.controller import (ServiceAccessController,
                                       ServiceAccessDenied,
                                       ServiceAuthenticationError)

from .broker import AccessDenied, Principal
from .http import digest


_ACTIONS = MappingProxyType({
    'connect': 'runner.cloud.submit',
    'prepare': 'runner.cloud.submit',
    'submit': 'runner.cloud.submit',
    'start': 'runner.cloud.start',
    'recover': 'runner.cloud.recover',
    'disconnect': 'runner.cloud.recover',
})
_IDENTITY = ('authority_id', 'consumer_id', 'owner_ref', 'device_ref')


class ServiceAccessPrincipalAdapter:
    """Pinned local adapter; policy comes exclusively from ServiceAccess.

    authenticate takes exactly {authority_id, consumer_id, authorization}.
    Authentication alone is not an eligibility grant. Every public Broker
    operation and background claim enters guard again. No token is retained in
    a Principal, plan or receipt, and the service token never becomes the
    separately configured upstream route credential.

    Controller has no consumer enumeration API. Reading its fixed _bindings is
    deliberate and confined to constructing the reverse worker lookup. Every
    actual use revalidates the persisted binding through controller APIs.
    """

    def __init__(self, controller, *, authority_id):
        if not isinstance(controller, ServiceAccessController):
            raise ValueError('actual ServiceAccessController required')
        if not isinstance(authority_id, str) or authority_id != controller.authority_id:
            raise ValueError('service authority pin mismatch')
        self._controller = controller
        self.authority_id = authority_id
        bindings = {}
        for alias in controller._bindings:
            state = controller.snapshot(alias)
            identity = {name: state[name] for name in _IDENTITY}
            if identity['authority_id'] != authority_id or identity['consumer_id'] != alias:
                raise ValueError('service consumer binding mismatch')
            principal = Principal('mcp-' + digest(identity), identity['device_ref']).validate()
            if principal in bindings:
                raise ValueError('ambiguous service principal')
            bindings[principal] = MappingProxyType(identity)
        self._bindings = MappingProxyType(bindings)
        self._aliases = MappingProxyType({value['consumer_id']: principal
                                         for principal, value in bindings.items()})

    def _match(self, principal, state):
        expected = self._bindings.get(principal)
        if (expected is None or self._controller.authority_id != self.authority_id
                or any(state.get(name) != expected[name] for name in _IDENTITY)):
            raise AccessDenied('service principal binding mismatch')

    def authenticate(self, credentials):
        if (type(credentials) is not dict
                or set(credentials) != {'authority_id', 'consumer_id', 'authorization'}
                or type(credentials['authority_id']) is not str
                or credentials['authority_id'] != self.authority_id
                or type(credentials['consumer_id']) is not str
                or credentials['consumer_id'] not in self._aliases):
            raise AccessDenied('invalid service principal credentials')
        alias = credentials['consumer_id']
        try:
            self._controller.authenticate(alias, credentials['authorization'])
            principal = self._aliases[alias]
            self._match(principal, self._controller.snapshot(alias))
            return principal
        except (ServiceAuthenticationError, ServiceAccessDenied) as error:
            raise AccessDenied('service authentication denied') from error

    @contextmanager
    def guard(self, principal, action):
        if (type(principal) is not Principal or type(action) is not str
                or action not in _ACTIONS or principal not in self._bindings):
            raise AccessDenied('unknown service principal or broker action')
        alias = self._bindings[principal]['consumer_id']
        try:
            with self._controller.guard(alias, _ACTIONS[action]) as state:
                self._match(principal, state)
                yield dict(state)
        except (ServiceAuthenticationError, ServiceAccessDenied) as error:
            raise AccessDenied('current service admission denied') from error
