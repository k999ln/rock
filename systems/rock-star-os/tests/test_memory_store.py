"""Canonical-memory store contract tests; RecordingCipher is an in-process test double only."""
from contextlib import closing
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from blackberryrock.memory_store import (CanonicalMemoryStore, MemoryConflict,
    MemoryNotFound, MemoryUnavailable)


class RecordingCipher:
    def __init__(self):
        self.values = {}
        self.counter = 0

    def seal(self, owner_ref, aad, plaintext):
        self.counter += 1
        token = b"test-envelope-v1:" + self.counter.to_bytes(8, "big") + b"x" * (len(plaintext) + 16)
        self.values[token] = (owner_ref, aad, plaintext)
        return token

    def open(self, owner_ref, aad, ciphertext):
        stored_owner, stored_aad, plaintext = self.values[ciphertext]
        if (stored_owner, stored_aad) != (owner_ref, aad):
            raise ValueError("test scope mismatch")
        return plaintext


class CanonicalMemoryStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cipher = RecordingCipher()
        self.store = CanonicalMemoryStore(Path(self.temp.name) / "memory", cipher=self.cipher)

    def put(self, **kwargs):
        values = dict(owner_ref="owner:alice", project_ref="project:alpha", memory_id="memory-1",
            kind="preference", content="Use Japanese, short explanations.",
            provenance={"sourceKind": "owner_confirmation", "sourceWorkId": "work-42",
                        "modelProfileId": "profile.lifeline.qwen@2"},
            now=100, expires_at=1000, expected_revision=0)
        values.update(kwargs)
        return self.store.put(**values)

    def test_owner_confirmed_content_is_encrypted_at_rest_and_scope_isolated(self):
        self.put()
        with closing(sqlite3.connect(self.store.path)) as db, db:
            raw = db.execute("SELECT content_ciphertext,provenance FROM memory_records").fetchone()
        self.assertNotIn(b"Japanese", raw[0])
        self.assertNotIn("Japanese", raw[1])
        self.assertEqual("Use Japanese, short explanations.", self.store.get(
            owner_ref="owner:alice", project_ref="project:alpha", memory_id="memory-1", now=200)["content"])
        with self.assertRaises(MemoryNotFound):
            self.store.get(owner_ref="owner:bob", project_ref="project:alpha", memory_id="memory-1", now=200)
        with self.assertRaises(MemoryNotFound):
            self.store.get(owner_ref="owner:alice", project_ref="project:beta", memory_id="memory-1", now=200)

    def test_llm_or_tool_provenance_cannot_become_canonical_without_owner_confirmation(self):
        for provenance in ({"sourceKind": "model"}, {"sourceKind": "tool"}, {"sourceKind": "owner_confirmation", "rawPrompt": "secret"}):
            with self.subTest(provenance=provenance), self.assertRaises(ValueError):
                self.put(provenance=provenance)

    def test_revision_conflict_updates_and_invalidates_model_projections(self):
        self.put()
        profile = "profile.lifeline.qwen@2"
        self.store.rebuild_projection(owner_ref="owner:alice", project_ref="project:alpha",
            memory_id="memory-1", model_profile_id=profile, now=200,
            builder=lambda content: content.lower().encode())
        self.assertEqual(b"use japanese, short explanations.", self.store.read_projection(
            owner_ref="owner:alice", project_ref="project:alpha", memory_id="memory-1",
            model_profile_id=profile, now=200))
        updated = self.put(content="Use Japanese, concise steps.", expected_revision=1, now=300)
        self.assertEqual(2, updated["revision"])
        with self.assertRaises(MemoryNotFound):
            self.store.read_projection(owner_ref="owner:alice", project_ref="project:alpha",
                memory_id="memory-1", model_profile_id=profile, now=300)
        with self.assertRaises(MemoryConflict):
            self.put(content="stale writer", expected_revision=1, now=301)
        self.assertEqual("Use Japanese, concise steps.", self.store.get(
            owner_ref="owner:alice", project_ref="project:alpha", memory_id="memory-1", now=301)["content"])

    def test_projection_rebuild_race_does_not_commit_for_stale_canonical_revision(self):
        self.put()
        profile = "profile.lifeline.qwen@2"
        def update_while_building(_content):
            self.put(content="new canonical revision", expected_revision=1, now=210)
            return b"stale tokens"
        with self.assertRaises(MemoryConflict):
            self.store.rebuild_projection(owner_ref="owner:alice", project_ref="project:alpha",
                memory_id="memory-1", model_profile_id=profile, now=200, builder=update_while_building)
        with self.assertRaises(MemoryNotFound):
            self.store.read_projection(owner_ref="owner:alice", project_ref="project:alpha",
                memory_id="memory-1", model_profile_id=profile, now=220)

    def test_projection_is_model_versioned_and_rebuilt_from_canonical(self):
        self.put()
        outputs = {"profile.lifeline.qwen@2": b"tokens-v2", "profile.lifeline.qwen@3": b"tokens-v3"}
        for profile, output in outputs.items():
            self.store.rebuild_projection(owner_ref="owner:alice", project_ref="project:alpha",
                memory_id="memory-1", model_profile_id=profile, now=200,
                builder=lambda _content, value=output: value)
        for profile, output in outputs.items():
            self.assertEqual(output, self.store.read_projection(owner_ref="owner:alice",
                project_ref="project:alpha", memory_id="memory-1", model_profile_id=profile, now=200))
        refs = self.store.list_refs(owner_ref="owner:alice", project_ref="project:alpha", now=200)
        self.assertNotIn("content", refs[0])

    def test_delete_erases_canonical_and_every_projection_and_prevents_stale_resurrection(self):
        self.put()
        self.store.rebuild_projection(owner_ref="owner:alice", project_ref="project:alpha",
            memory_id="memory-1", model_profile_id="profile.lifeline.qwen@2", now=200,
            builder=lambda content: content.encode())
        self.assertTrue(self.store.delete(owner_ref="owner:alice", project_ref="project:alpha",
                                          memory_id="memory-1", now=300))
        with closing(sqlite3.connect(self.store.path)) as db, db:
            self.assertEqual(0, db.execute("SELECT COUNT(*) FROM memory_records").fetchone()[0])
            self.assertEqual(0, db.execute("SELECT COUNT(*) FROM memory_projections").fetchone()[0])
            self.assertEqual(1, db.execute("SELECT COUNT(*) FROM memory_tombstones").fetchone()[0])
        with self.assertRaises(MemoryNotFound):
            self.store.get(owner_ref="owner:alice", project_ref="project:alpha", memory_id="memory-1", now=301)
        with self.assertRaises(MemoryConflict):
            self.put(expected_revision=0, now=302)

    def test_expiry_hides_content_then_bounded_sweeper_deletes_all_projections(self):
        self.put(expires_at=250)
        self.store.rebuild_projection(owner_ref="owner:alice", project_ref="project:alpha",
            memory_id="memory-1", model_profile_id="profile.lifeline.qwen@2", now=200,
            builder=lambda content: content.encode())
        with self.assertRaises(MemoryNotFound):
            self.store.get(owner_ref="owner:alice", project_ref="project:alpha", memory_id="memory-1", now=250)
        self.assertEqual(1, self.store.expire_due(now=250, limit=10))
        with closing(sqlite3.connect(self.store.path)) as db, db:
            self.assertEqual(0, db.execute("SELECT COUNT(*) FROM memory_records").fetchone()[0])
            self.assertEqual(0, db.execute("SELECT COUNT(*) FROM memory_projections").fetchone()[0])
        self.assertEqual(0, self.store.expire_due(now=251, limit=10))

    def test_schema_cipher_missing_and_database_symlink_fail_closed(self):
        with self.assertRaises(MemoryUnavailable):
            CanonicalMemoryStore(Path(self.temp.name) / "no-cipher", cipher=None)
        victim = Path(self.temp.name) / "victim"
        victim.write_text("do not follow")
        link_dir = Path(self.temp.name) / "link"
        link_dir.mkdir(mode=0o700)
        (link_dir / "canonical-memory.sqlite3").symlink_to(victim)
        with self.assertRaises(MemoryUnavailable):
            CanonicalMemoryStore(link_dir, cipher=self.cipher)

    def test_expired_and_unbounded_inputs_are_rejected(self):
        with self.assertRaises(ValueError):
            self.put(expires_at=100)
        with self.assertRaises(ValueError):
            self.put(content="x" * 20000)
        with self.assertRaises(ValueError):
            self.store.list_refs(owner_ref="owner:alice", project_ref="project:alpha", now=1, limit=201)


if __name__ == "__main__":
    unittest.main()
