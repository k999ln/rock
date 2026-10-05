# RockstarOS canonical memory and model projections

Status: host-side encrypted persistence contract and a fail-closed Broker façade are implemented; platform cipher and Android/OS runtime integration remain pending. This is local storage design, not Cloud memory or evidence of a device build.

## Purpose and boundary

Canonical memory keeps a small set of user-confirmed preferences, procedures, and references available to local agents across work and restarts. The agent may suggest a candidate, but only an explicit owner-confirmation event may turn it into durable memory. Memory does not grant Tool authority, change a job state, or count as approval for an external action.

The current implementation is `systems/rock-star-os/src/blackberryrock/memory_store.py`. It is an injected-cipher SQLite component, not yet wired to Android `PlatformStore`, native `rockd`, Zema, or a production key service. Construction fails when no platform cipher is provided. Tests use an in-process `RecordingCipher`; that fixture is intentionally not a cryptographic implementation.

`systems/rock-star-os/src/blackberryrock/memory_access.py` adds `BrokerMemoryService`: callers pass Broker credentials and a project reference but cannot choose `ownerRef`; the authenticated Broker `subject` supplies that scope. Each operation holds the Broker principal adapter guard through storage access and rechecks the requested project action through a required `ProjectAuthorizer`. Missing authorization denies access. The host fixture tests prove this boundary with fake principals and grants only; they do not establish a production project-membership source or connect an HTTP route, Android Binder, or device caller.

## Canonical record and scope

Each record is keyed by `ownerRef + projectRef + memoryId` and contains:

- schema version and bounded `kind`;
- opaque ciphertext for canonical content;
- explicit provenance (`sourceKind=owner_confirmation`, optional source work/artifact IDs, and optional model profile ID);
- creation time, optional expiry, and monotonically increasing revision.

The SQLite index does not contain canonical content. Owner/project IDs, kind, provenance references, time bounds, revision, and ciphertext length metadata remain visible to the local OS process; source identifiers must therefore be opaque references, not content or credentials. `MemoryCipher` must use an OS-protected owner key and authenticated encryption. Associated data binds owner, project, memory ID, revision, purpose, and model profile. The application must not provide an in-memory, plaintext, or device-global-key fallback.

Reads and listings require both the authenticated owner context and exact project. Listings return references and provenance only, never content. Current API limits are 16 KiB canonical text, 64 KiB projection, 10,000 stored records, and bounded list/expiry pages. The SQLite parent directory is owner-private; database symlinks, hard links, unowned files, and permissive modes fail closed.

## State and operations

`put` accepts only explicitly owner-confirmed provenance. New records start at revision 1; changes require the expected current revision and increment it. A stale writer receives `MemoryConflict`. Updating canonical content invalidates every model-specific projection in the same transaction.

`get` checks expiry before decrypting. `list_refs` exposes only nonexpired references. `expire_due` processes a bounded batch, removes canonical ciphertext and every projection, then writes a content-free tombstone. `delete` performs the same scoped removal for one record. Tombstones prevent stale replay or restore from recreating a deleted memory ID; a new user-confirmed record needs a new ID.

Projection builders receive decrypted canonical content only after an exact owner/project read. Each cache is keyed by the exact versioned model profile and canonical revision, encrypted separately, and committed only if the canonical revision still matches after projection generation. Model switches rebuild from canonical memory; old-model tokens or embeddings are never treated as canonical or reused for another profile. No vector search, cross-project retrieval, or automatic memory extraction is implemented.

## Failure, recovery, and privacy

Unknown or absent cipher, schema mismatch, corrupt authentication tag, stale revision, expired record, and incomplete projection all fail closed. Cipher failures never include content in exception text. Ciphertext, canonical text, and projections must not be written to telemetry or standard logs.

SQLite uses a versioned initial schema and full synchronous transactions. There is no migration implementation yet; an unexpected schema stops startup for explicit migration or recovery. The OS integration must store only encrypted data in backups, re-resolve the owner key after restore, and leave the memory unavailable if the key is lost or revoked. A successful database deletion removes ciphertext and derived projection rows. Secure erasure from flash media is not claimed; device/key destruction is a separate platform guarantee.

Expiry is enforced at every read and projection read. A bounded maintenance caller must periodically invoke `expire_due`; scheduling, power-loss recovery of the host package, backup/restore behavior, and real OS-key deletion are not yet wired.

## Acceptance record

Run `PYTHONPATH=systems/rock-star-os/src:systems/rock-star-os/os python3 -m unittest systems.rock-star-os.tests.test_memory_store systems.rock-star-os.tests.test_memory_access -v` for the isolated store and Broker-scope contracts. Add `systems.rock-star-os.tests.test_mcp_broker_core` when verifying the existing loopback Broker integration suite; that suite requires permission to bind a local 127.0.0.1 test server.

The focused suites cover owner/project isolation, confirmed provenance, opaque at-rest ciphertext, optimistic revision conflicts, projection invalidation and model-version separation, stale projection races, expiry, deletion/tombstones, bounded inputs, missing cipher, symlink rejection, authenticated Broker owner derivation, per-call project grants, caller owner-override rejection, and principal revocation. Passing validates the store against a cipher test double and the authorization boundary against fixture principals/grants only. It does not prove cryptographic strength, Android Keystore integration, native OS integration, production project authorization, memory UI, or physical-device acceptance.

The next acceptance stage is to replace the host façade's injected project authorizer with the authoritative project-consent source, connect `MemoryCipher` to the selected OS-backed key service, and expose only the scoped operations through the trusted OS/Binder entrypoint. Then implement schema migration, encrypted backup/restore and scheduled expiry, and run end-to-end offline write/read/update/delete plus model-profile projection rebuild on the target OS. The exact key derivation, owner-key rotation, backup restore, and per-Tool read scopes must be fixed before device integration.
