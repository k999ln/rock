"""Internal GX00 values and lifetime contracts; no endpoint or permission grant.

Instances are supplied only by the protected coordinator and authenticated
router. Constructing a dataclass is not authentication. No runtime imports.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import ContextManager, Protocol, TYPE_CHECKING

if TYPE_CHECKING:
    from .adopt_legacy import LegacyAdoptionPlan


class RuntimeUnavailable(RuntimeError):
    """The owned runtime cannot accept another operation; retry the same key."""


class RuntimeCleanupRequired(RuntimeUnavailable):
    """An internal caller must retry cleanup of the retained owned runtime."""
    def __init__(self, runtime):
        super().__init__('runtime cleanup incomplete; ownership retained for explicit close retry')
        self.runtime = runtime


class RuntimeAdmissionRejected(PermissionError):
    """A principal was not admitted to this contract."""


@dataclass(frozen=True, slots=True)
class FreshContractSpec:
    ledger_ref: str
    canonical_state: Path
    owner_actor: str
    owner_ref: str
    primary_device_ref: str


@dataclass(frozen=True, slots=True)
class ContractDescriptor:
    ledger_ref: str
    ledger_uuid: str
    wallet_authority_id: str
    owner_actor: str
    owner_ref: str
    primary_device_ref: str
    canonical_state: Path
    writer_epoch: int


@dataclass(frozen=True, slots=True)
class ContractIdentity:
    descriptor: ContractDescriptor
    account_id: str | None


@dataclass(frozen=True, slots=True)
class AuthenticatedDevicePrincipal:
    ledger_ref: str
    owner_actor: str
    owner_ref: str
    device_ref: str
    credential_revision: int


class ManagedWriteHooks(Protocol):
    def held_by_current_thread(self) -> bool: ...
    def require_held(self) -> None: ...


class OpenPermit(Protocol):
    descriptor: ContractDescriptor
    hooks: ManagedWriteHooks
    def initialize(self) -> ContextManager[None]: ...
    def activate(self, observed: ContractIdentity) -> WriterPermit: ...
    def abort(self) -> None: ...


class WriterPermit(Protocol):
    descriptor: ContractDescriptor
    hooks: ManagedWriteHooks
    def admit_write(self, expected_epoch: int) -> ContextManager[None]: ...
    def bind_registered_account(self, account_id: str) -> None: ...
    def quiesce(self) -> None: ...
    def release(self) -> None: ...


class FenceCoordinator(Protocol):
    def bind_owner_registry(self, canonical_path: Path, registry_uuid: str) -> None: ...
    def prepare_fresh(self, spec: FreshContractSpec) -> OpenPermit: ...
    def open_active(self, ledger_ref: str) -> OpenPermit: ...
    def prepare_legacy(self, plan: LegacyAdoptionPlan) -> OpenPermit: ...


class PrincipalVerifier(Protocol):
    def registry_identity(self) -> tuple[Path, str]: ...
    def assert_current(self, principal: AuthenticatedDevicePrincipal,
                       descriptor: ContractDescriptor) -> None: ...
