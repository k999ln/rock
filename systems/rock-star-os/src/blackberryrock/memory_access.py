"""Broker-authenticated façade for the canonical memory store.

Callers provide credentials and a project reference, never an owner reference.
The owner is taken from the Broker-authenticated principal on every operation,
and project membership is re-evaluated for the requested action each time.
"""
from contextlib import contextmanager
from typing import Protocol

from .memory_store import CanonicalMemoryStore, MemoryUnavailable, _identifier


class MemoryAccessDenied(PermissionError):
    """Authentication or project authorization did not grant the operation."""


class ProjectAuthorizer(Protocol):
    def authorize(self, principal, project_ref: str, action: str) -> bool: ...


_ACTIONS = {"read", "write", "delete", "project.list", "projection.read", "projection.write"}


class BrokerMemoryService:
    """Expose memory through Broker identity and per-operation project checks.

    ``project_authorizer`` must check the current principal's project membership
    and requested action against the authoritative project/consent store. There
    is deliberately no permissive default. The Broker principal adapter's guard
    also remains active for the full storage operation, so revoked credentials
    or device authorization can fail closed before content is returned.
    """

    def __init__(self, *, broker, store: CanonicalMemoryStore,
                 project_authorizer: ProjectAuthorizer):
        if broker is None or not callable(getattr(broker, "authenticated_principal", None)):
            raise MemoryUnavailable("authenticated Broker is required")
        if store is None or not callable(getattr(store, "get", None)):
            raise MemoryUnavailable("canonical memory store is required")
        if project_authorizer is None or not callable(getattr(project_authorizer, "authorize", None)):
            raise MemoryUnavailable("project authorization is required")
        self.broker, self.store, self.project_authorizer = broker, store, project_authorizer

    @contextmanager
    def _authorized(self, auth, project_ref, action):
        project = _identifier(project_ref, "project reference")
        if action not in _ACTIONS:
            raise ValueError("invalid memory action")
        principal = self.broker.authenticated_principal(auth)
        # No content or owner ref crosses into the project authorizer.
        try:
            with self.broker.adapter.guard(principal, "memory." + action):
                if self.project_authorizer.authorize(principal, project, action) is not True:
                    raise MemoryAccessDenied("project access denied")
                yield principal.subject, project
        except MemoryAccessDenied:
            raise
        except PermissionError as denied:
            raise MemoryAccessDenied("memory access denied") from denied

    def put(self, *, auth, project_ref: str, memory_id: str, kind: str, content: str,
            provenance: dict, now: int, expires_at: int | None, expected_revision: int) -> dict:
        with self._authorized(auth, project_ref, "write") as (owner, project):
            return self.store.put(owner_ref=owner, project_ref=project, memory_id=memory_id,
                kind=kind, content=content, provenance=provenance, now=now,
                expires_at=expires_at, expected_revision=expected_revision)

    def get(self, *, auth, project_ref: str, memory_id: str, now: int) -> dict:
        with self._authorized(auth, project_ref, "read") as (owner, project):
            return self.store.get(owner_ref=owner, project_ref=project,
                                  memory_id=memory_id, now=now)

    def list_refs(self, *, auth, project_ref: str, now: int, limit: int = 100) -> list[dict]:
        with self._authorized(auth, project_ref, "project.list") as (owner, project):
            return self.store.list_refs(owner_ref=owner, project_ref=project,
                                        now=now, limit=limit)

    def delete(self, *, auth, project_ref: str, memory_id: str, now: int) -> bool:
        with self._authorized(auth, project_ref, "delete") as (owner, project):
            return self.store.delete(owner_ref=owner, project_ref=project,
                                     memory_id=memory_id, now=now)

    def rebuild_projection(self, *, auth, project_ref: str, memory_id: str,
                           model_profile_id: str, now: int, builder) -> None:
        with self._authorized(auth, project_ref, "projection.write") as (owner, project):
            self.store.rebuild_projection(owner_ref=owner, project_ref=project,
                memory_id=memory_id, model_profile_id=model_profile_id, now=now,
                builder=builder)

    def read_projection(self, *, auth, project_ref: str, memory_id: str,
                        model_profile_id: str, now: int) -> bytes:
        with self._authorized(auth, project_ref, "projection.read") as (owner, project):
            return self.store.read_projection(owner_ref=owner, project_ref=project,
                memory_id=memory_id, model_profile_id=model_profile_id, now=now)
