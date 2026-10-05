"""Broker identity/project boundary tests; all identity and crypto fixtures are local doubles."""
from contextlib import contextmanager
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "os"))
from mcp_broker import AccessDenied, Principal
from blackberryrock.memory_access import BrokerMemoryService, MemoryAccessDenied
from blackberryrock.memory_store import CanonicalMemoryStore, MemoryNotFound


class FixtureCipher:
    def __init__(self): self.data = {}
    def seal(self, owner_ref, aad, plaintext):
        token = b"fixture:" + str(len(self.data)).encode() + b":" + b"x" * (len(plaintext) + 16)
        self.data[token] = (owner_ref, aad, plaintext)
        return token
    def open(self, owner_ref, aad, ciphertext):
        saved_owner, saved_aad, plaintext = self.data[ciphertext]
        if (saved_owner, saved_aad) != (owner_ref, aad): raise ValueError("fixture scope mismatch")
        return plaintext


class FixturePrincipals:
    def __init__(self):
        self.active = True
        self.users = {"alice-token": Principal("alice", "device-a"),
                      "bob-token": Principal("bob", "device-b")}
        self.guarded = []
    def authenticate(self, auth):
        if auth not in self.users: raise AccessDenied("unknown fixture identity")
        return self.users[auth]
    @contextmanager
    def guard(self, principal, action):
        if not self.active: raise AccessDenied("fixture identity revoked")
        self.guarded.append((principal.subject, principal.device_ref, action))
        yield


class FixtureBroker:
    def __init__(self): self.adapter = FixturePrincipals()
    def authenticated_principal(self, auth): return self.adapter.authenticate(auth).validate()


class FixtureProjects:
    def __init__(self): self.grants = {("alice", "project-a"): {"read", "write", "delete", "project.list"}}
    def authorize(self, principal, project_ref, action):
        return action in self.grants.get((principal.subject, project_ref), set())


class MemoryAccessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.broker = FixtureBroker()
        self.projects = FixtureProjects()
        self.store = CanonicalMemoryStore(Path(self.temp.name) / "memory", cipher=FixtureCipher())
        self.service = BrokerMemoryService(broker=self.broker, store=self.store,
                                           project_authorizer=self.projects)

    def put(self, auth="alice-token", project="project-a"):
        return self.service.put(auth=auth, project_ref=project, memory_id="pref-1",
            kind="preference", content="Japanese response", provenance={"sourceKind": "owner_confirmation"},
            now=100, expires_at=1000, expected_revision=0)

    def test_owner_is_derived_from_broker_and_project_grant_is_checked_each_time(self):
        self.put()
        self.assertEqual("Japanese response", self.service.get(auth="alice-token",
            project_ref="project-a", memory_id="pref-1", now=200)["content"])
        self.projects.grants[("bob", "project-a")] = {"read"}
        with self.assertRaises(MemoryNotFound):
            self.service.get(auth="bob-token", project_ref="project-a", memory_id="pref-1", now=200)
        self.projects.grants[("alice", "project-a")].remove("read")
        with self.assertRaises(MemoryAccessDenied):
            self.service.get(auth="alice-token", project_ref="project-a", memory_id="pref-1", now=200)
        self.assertTrue(any(action == "memory.read" for _, _, action in self.broker.adapter.guarded))

    def test_caller_cannot_override_owner_and_unknown_project_is_denied(self):
        with self.assertRaises(TypeError):
            self.service.get(auth="alice-token", owner_ref="bob", project_ref="project-a",
                             memory_id="pref-1", now=200)
        with self.assertRaises(MemoryAccessDenied): self.put(project="project-b")

    def test_broker_revocation_fails_closed_before_store_access(self):
        self.put()
        self.broker.adapter.active = False
        with self.assertRaises(MemoryAccessDenied):
            self.service.get(auth="alice-token", project_ref="project-a", memory_id="pref-1", now=200)

    def test_missing_broker_or_project_authorizer_fails_closed(self):
        for broker, authorizer in ((None, self.projects), (self.broker, None)):
            with self.subTest(broker=broker, authorizer=authorizer), self.assertRaises(Exception):
                BrokerMemoryService(broker=broker, store=self.store, project_authorizer=authorizer)


if __name__ == "__main__": unittest.main()
