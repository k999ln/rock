package dev.rock.core;

import dev.rock.core.platform.ComponentManifest;
import dev.rock.core.platform.EncryptedBackup;
import dev.rock.core.platform.PlatformApi;
import dev.rock.core.platform.PlatformStore;
import dev.rock.core.platform.RecoveryPhrase;
import dev.rock.core.platform.UpdatePolicy;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

public final class PlatformStoreTest {
    private static final String SIGNER = "a".repeat(64);
    private static final String PAYLOAD = Engine.digest("exact payload");
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    private JdbcDatabase db;
    private PlatformStore store;

    @Before public void setup() throws Exception {
        db = new JdbcDatabase(temp.newFile("platform.db").getPath());
        store = new PlatformStore(db);
    }

    @After public void close() { db.close(); }

    private ComponentManifest tool(long version, int schemaMin, int schemaMax) {
        return manifest(ComponentManifest.Kind.TOOL, "org.rockstar.tool.clean", "org.rockstar.tool.clean", 12001,
            version, schemaMin, schemaMax, List.of("text.input", "text.output"));
    }

    private ComponentManifest provider() {
        return manifest(ComponentManifest.Kind.PROVIDER, "org.rockstar.provider.cash", "org.rockstar.provider.cash", 12002,
            1, 1, 1, List.of("provider.status", "wallet.receipt"));
    }

    private ComponentManifest manifest(ComponentManifest.Kind kind, String id, String packageName, int uid,
        long version, int schemaMin, int schemaMax, List<String> permissions) {
        return new ComponentManifest(kind, id, packageName, version, 1, 1, uid,
            ComponentManifest.expectedDomain(kind), SIGNER, permissions, schemaMin, schemaMax);
    }

    private void install(String key, ComponentManifest manifest) {
        store.register(key, manifest, 1);
        store.activate(manifest.componentId, manifest.versionCode, false, 2);
    }

    @Test public void platformApiRejectsNonOverlappingClients() {
        PlatformApi.requireCompatible(1, 1);
        assertThrows(IllegalArgumentException.class, () -> PlatformApi.requireCompatible(2, 3));
        assertThrows(IllegalArgumentException.class, () -> PlatformApi.requireCompatible(0, 1));
    }

    @Test public void registryUnifiesKindsButKeepsUidDomainAndPermissionsIsolated() {
        ComponentManifest tool = tool(1, 1, 1);
        assertEquals(tool.digest(), store.register("register:tool:1", tool, 1));
        assertEquals(tool.digest(), store.register("register:tool:1", tool, 1));
        store.activate(tool.componentId, 1, false, 2);
        assertEquals("ACTIVE", store.components().get(0).get("status"));
        ComponentManifest reusedUid = manifest(ComponentManifest.Kind.MCP, "org.rockstar.mcp.other", "org.rockstar.mcp.other", 12001,
            1, 1, 1, List.of("mcp.list"));
        assertThrows(SecurityException.class, () -> store.register("register:mcp:1", reusedUid, 3));
        assertThrows(SecurityException.class, () -> new ComponentManifest(ComponentManifest.Kind.TOOL,
            "org.rockstar.tool.bad", "org.rockstar.tool.bad", 1, 1, 1, 13000,
            "rock_provider_app", SIGNER, List.of("text.input"), 1, 1));
        assertThrows(SecurityException.class, () -> manifest(ComponentManifest.Kind.TOOL,
            "org.rockstar.tool.net", "org.rockstar.tool.net", 13001, 1, 1, 1, List.of("network.provider")));
    }

    @Test public void registrationKeyAndVersionCannotBeRebound() {
        store.register("register:stable", tool(1, 1, 1), 1);
        assertThrows(IllegalStateException.class, () -> store.register("register:stable", tool(2, 1, 1), 2));
        ComponentManifest replaced = new ComponentManifest(ComponentManifest.Kind.TOOL,
            "org.rockstar.tool.clean", "org.rockstar.tool.clean", 1, 1, 1, 12001,
            "rock_tool_app", "b".repeat(64), List.of("text.input", "text.output"), 1, 1);
        assertThrows(SecurityException.class, () -> store.register("register:replacement", replaced, 2));
    }

    @Test public void revocationIsPermanentForTheComponentIdentity() {
        ComponentManifest first = tool(1, 1, 1);
        install("register:first", first);
        store.revoke(first.componentId, 3);
        assertThrows(SecurityException.class, () -> store.register("register:after-revoke", tool(2, 1, 2), 4));
    }

    @Test public void exactApprovalCapsCostAndIsSingleUse() {
        install("register:tool", tool(1, 1, 1));
        String approval = store.proposeApproval("owner:alice", "approve:1", "org.rockstar.tool.clean",
            "clean.write", PAYLOAD, 500, 1_000, 10);
        assertThrows(SecurityException.class, () -> store.recordApproved("owner:alice", "ledger:unconfirmed", approval,
            "org.rockstar.tool.clean", "clean.write", PAYLOAD, 1, -1, "JPY", 19));
        assertThrows(SecurityException.class, () -> store.confirmApproval("owner:bob", approval, 19));
        store.confirmApproval("owner:alice", approval, 19);
        store.confirmApproval("owner:alice", approval, 19);
        assertThrows(SecurityException.class, () -> store.recordApproved("owner:alice", "ledger:too-much", approval,
            "org.rockstar.tool.clean", "clean.write", PAYLOAD, 501, -501, "JPY", 20));
        assertThrows(IllegalArgumentException.class, () -> store.recordApproved("owner:alice", "ledger:wrong-sign", approval,
            "org.rockstar.tool.clean", "clean.write", PAYLOAD, 500, 500, "JPY", 20));
        String receipt = store.recordApproved("owner:alice", "ledger:1", approval,
            "org.rockstar.tool.clean", "clean.write", PAYLOAD, 500, -500, "JPY", 21);
        assertEquals(receipt, store.recordApproved("owner:alice", "ledger:1", approval,
            "org.rockstar.tool.clean", "clean.write", PAYLOAD, 500, -500, "JPY", 22));
        assertEquals(-500, store.balance("owner:alice", "JPY"));
        assertThrows(SecurityException.class, () -> store.recordApproved("owner:alice", "ledger:2", approval,
            "org.rockstar.tool.clean", "clean.write", PAYLOAD, 1, -1, "JPY", 23));
    }

    @Test public void stopAndRevocationFenceOutstandingApproval() {
        install("register:tool", tool(1, 1, 1));
        String stopped = store.proposeApproval("owner:alice", "approve:stop", "org.rockstar.tool.clean",
            "clean.write", PAYLOAD, 10, 1_000, 10);
        store.confirmApproval("owner:alice", stopped, 11);
        assertEquals(2, store.stop("org.rockstar.tool.clean", 20));
        assertThrows(SecurityException.class, () -> store.recordApproved("owner:alice", "ledger:stopped", stopped,
            "org.rockstar.tool.clean", "clean.write", PAYLOAD, 1, -1, "JPY", 21));
        String revoked = store.proposeApproval("owner:alice", "approve:revoke", "org.rockstar.tool.clean",
            "clean.write", PAYLOAD, 10, 1_000, 22);
        store.confirmApproval("owner:alice", revoked, 22);
        store.revoke("org.rockstar.tool.clean", 23);
        assertThrows(IllegalStateException.class, () -> store.recordApproved("owner:alice", "ledger:revoked", revoked,
            "org.rockstar.tool.clean", "clean.write", PAYLOAD, 1, -1, "JPY", 24));
    }

    @Test public void providerReceiptIsAppendOnlyOwnerScopedAndDeduplicated() {
        install("register:provider", provider());
        String receipt = store.recordProviderReceipt("owner:alice", "income:1", "org.rockstar.provider.cash",
            888, "USD", "provider:tx:1", Engine.digest("provider signed receipt"), 10);
        assertEquals(receipt, store.recordProviderReceipt("owner:alice", "income:1", "org.rockstar.provider.cash",
            888, "USD", "provider:tx:1", Engine.digest("provider signed receipt"), 11));
        assertThrows(IllegalStateException.class, () -> store.recordProviderReceipt("owner:alice", "income:2",
            "org.rockstar.provider.cash", 888, "USD", "provider:tx:1", Engine.digest("provider signed receipt"), 12));
        assertEquals(888, store.balance("owner:alice", "USD"));
        assertEquals(0, store.balance("owner:bob", "USD"));
    }

    @Test public void reversalIsCompensatingIdempotentAndCannotChain() {
        install("register:provider", provider());
        String original = store.recordProviderReceipt("owner:alice", "income:1", "org.rockstar.provider.cash",
            888, "USD", "provider:tx:1", Engine.digest("provider signed receipt"), 10);
        String reversal = store.reverse("owner:alice", "reverse:1", original, 11);
        assertEquals(reversal, store.reverse("owner:alice", "reverse:1", original, 12));
        assertEquals(0, store.balance("owner:alice", "USD"));
        assertThrows(IllegalStateException.class, () -> store.reverse("owner:alice", "reverse:2", reversal, 13));
    }

    @Test public void updateAndRollbackRequireSignerApiIdentityAndDataCompatibility() {
        ComponentManifest v1 = tool(1, 1, 1);
        ComponentManifest v2 = tool(2, 1, 2);
        UpdatePolicy.requireUpdate(v1, v2, 1);
        UpdatePolicy.requireRollback(v2, v1, 1);
        assertThrows(IllegalStateException.class, () -> UpdatePolicy.requireRollback(v2, v1, 2));
        ComponentManifest foreignSigner = new ComponentManifest(ComponentManifest.Kind.TOOL,
            v2.componentId, v2.packageName, 3, 1, 1, v2.uid, v2.securityDomain,
            "b".repeat(64), v2.permissions, 1, 2);
        assertThrows(SecurityException.class, () -> UpdatePolicy.requireUpdate(v2, foreignSigner, 2));
        ComponentManifest expandedPermissions = manifest(ComponentManifest.Kind.TOOL,
            v2.componentId, v2.packageName, v2.uid, 3, 1, 2,
            List.of("text.input", "text.output", "artifact.write"));
        assertThrows(SecurityException.class, () -> UpdatePolicy.requireUpdate(v2, expandedPermissions, 2));
    }

    @Test public void activationInvalidatesApprovalAcrossUpdateAndSupportsCompatibleRollback() {
        ComponentManifest v1 = tool(1, 1, 1);
        ComponentManifest v2 = tool(2, 1, 1);
        install("register:v1", v1);
        String oldApproval = store.proposeApproval("owner:alice", "approve:v1", v1.componentId,
            "clean.write", PAYLOAD, 10, 1_000, 10);
        store.confirmApproval("owner:alice", oldApproval, 10);
        store.register("register:v2", v2, 11);
        store.activate(v2.componentId, 2, false, 12);
        assertThrows(SecurityException.class, () -> store.recordApproved("owner:alice", "ledger:old", oldApproval,
            v1.componentId, "clean.write", PAYLOAD, 1, -1, "JPY", 13));
        store.activate(v1.componentId, 1, true, 14);
        assertEquals("ACTIVE", store.components().stream().filter(row -> "1".equals(row.get("version_code"))).findFirst().orElseThrow().get("status"));
    }

    @Test public void platformSchemaMismatchFailsClosedWithoutReset() {
        db.execute("UPDATE platform_meta SET version=3");
        assertThrows(IllegalStateException.class, () -> new PlatformStore(db));
        assertEquals("3", db.query("SELECT version FROM platform_meta").get(0).get("version"));
    }

    @Test public void platformSchemaMigratesV1ApprovalRowsTransactionally() throws Exception {
        JdbcDatabase legacy = new JdbcDatabase(temp.newFile("platform-v1.db").getPath());
        try {
            legacy.execute("CREATE TABLE platform_meta(version INTEGER NOT NULL)");
            legacy.execute("INSERT INTO platform_meta VALUES(1)");
            legacy.execute("CREATE TABLE platform_approvals(id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_key TEXT NOT NULL,component_id TEXT NOT NULL,action TEXT NOT NULL,payload_digest TEXT NOT NULL,max_cost_minor INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL,component_generation INTEGER NOT NULL,consumed_at INTEGER,UNIQUE(owner,request_key))");
            legacy.execute("INSERT INTO platform_approvals VALUES(?,?,?,?,?,?,?,?,?,?,?)", UUID.randomUUID().toString(),
                "owner:alice", "legacy:approval", "org.rockstar.tool.clean", "clean.write", PAYLOAD,
                10, 1000, "ISSUED", 1, null);
            new PlatformStore(legacy);
            assertEquals("2", legacy.query("SELECT version FROM platform_meta").get(0).get("version"));
            assertTrue(legacy.query("PRAGMA table_info(platform_approvals)").stream()
                .anyMatch(row -> "confirmed_at".equals(row.get("name"))));
            assertEquals("STOPPED", legacy.query("SELECT state FROM platform_approvals").get(0).get("state"));
        } finally { legacy.close(); }
    }

    @Test public void encryptedBackupAuthenticatesFormatKeyAndCiphertext() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey key = generator.generateKey();
        byte[] body = "owner-scoped platform state".getBytes(StandardCharsets.UTF_8);
        byte[] envelope = EncryptedBackup.seal(body, key, new SecureRandom());
        assertArrayEquals(body, EncryptedBackup.open(envelope, key));
        envelope[envelope.length - 1] ^= 1;
        assertThrows(SecurityException.class, () -> EncryptedBackup.open(envelope, key));
        assertThrows(IllegalArgumentException.class, () -> EncryptedBackup.open(new byte[8], key));
    }

    @Test public void recoverableBackupWorksWithEitherDeviceOrOwnerSecret() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey originalDevice = generator.generateKey();
        SecretKey replacementDevice = generator.generateKey();
        byte[] recoverySecret = EncryptedBackup.generateRecoverySecret(new SecureRandom());
        byte[] body = "owner-scoped state after total device loss".getBytes(StandardCharsets.UTF_8);
        byte[] envelope = EncryptedBackup.sealRecoverable(body, originalDevice,
            recoverySecret, "owner:alice", 1_789_523_200_000L, new SecureRandom());

        assertArrayEquals(body,
            EncryptedBackup.openWithDeviceKey(envelope, originalDevice, "owner:alice"));
        assertArrayEquals(body,
            EncryptedBackup.openWithRecoverySecret(envelope, recoverySecret, "owner:alice"));
        assertThrows(SecurityException.class,
            () -> EncryptedBackup.openWithDeviceKey(envelope, replacementDevice, "owner:alice"));
    }

    @Test public void recoverableBackupRejectsWrongOwnerSecretAndTampering() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey device = generator.generateKey();
        byte[] recoverySecret = EncryptedBackup.generateRecoverySecret(new SecureRandom());
        byte[] wrongSecret = EncryptedBackup.generateRecoverySecret(new SecureRandom());
        byte[] envelope = EncryptedBackup.sealRecoverable(
            "sensitive state".getBytes(StandardCharsets.UTF_8), device, recoverySecret,
            "owner:alice", 1_789_523_200_000L, new SecureRandom());

        assertThrows(SecurityException.class,
            () -> EncryptedBackup.openWithRecoverySecret(envelope, wrongSecret, "owner:alice"));
        assertThrows(SecurityException.class,
            () -> EncryptedBackup.openWithRecoverySecret(envelope, recoverySecret, "owner:bob"));
        byte[] tampered = envelope.clone();
        tampered[tampered.length - 1] ^= 1;
        assertThrows(SecurityException.class,
            () -> EncryptedBackup.openWithRecoverySecret(tampered, recoverySecret, "owner:alice"));
        byte[] tamperedHeader = envelope.clone();
        int saltLastByte = 2 + EncryptedBackup.RECOVERABLE_FORMAT.length() +
            Integer.BYTES + Long.BYTES + 32 + 31;
        tamperedHeader[saltLastByte] ^= 1;
        assertThrows(SecurityException.class,
            () -> EncryptedBackup.openWithRecoverySecret(
                tamperedHeader, recoverySecret, "owner:alice"));
        byte[] trailingByte = Arrays.copyOf(envelope, envelope.length + 1);
        assertThrows(IllegalArgumentException.class,
            () -> EncryptedBackup.openWithRecoverySecret(
                trailingByte, recoverySecret, "owner:alice"));
    }

    @Test public void recoverableBackupUsesFreshEnvelopeKeysAndNonces() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey device = generator.generateKey();
        byte[] recoverySecret = EncryptedBackup.generateRecoverySecret(new SecureRandom());
        byte[] body = "same state".getBytes(StandardCharsets.UTF_8);
        byte[] first = EncryptedBackup.sealRecoverable(body, device, recoverySecret,
            "owner:alice", 1_789_523_200_000L, new SecureRandom());
        byte[] second = EncryptedBackup.sealRecoverable(body, device, recoverySecret,
            "owner:alice", 1_789_523_200_000L, new SecureRandom());
        assertFalse(Arrays.equals(first, second));
        assertArrayEquals(body,
            EncryptedBackup.openWithRecoverySecret(first, recoverySecret, "owner:alice"));
        assertArrayEquals(body,
            EncryptedBackup.openWithRecoverySecret(second, recoverySecret, "owner:alice"));
    }

    @Test public void recoveryPhraseRoundTripsWithAnAvocadoSpecificChecksum() {
        byte[] secret = new byte[EncryptedBackup.RECOVERY_SECRET_BYTES];
        for (int index = 0; index < secret.length; index++) secret[index] = (byte) index;
        String phrase = RecoveryPhrase.encode(secret);
        assertEquals(RecoveryPhrase.WORD_COUNT, phrase.split(" ").length);
        assertArrayEquals(secret, RecoveryPhrase.decode(phrase));
        assertEquals(phrase.split(" ")[7], RecoveryPhrase.wordAt(phrase, 7));
        String[] words = phrase.split(" ");
        words[23] = words[23].equals("balan") ? "balen" : "balan";
        assertThrows(SecurityException.class,
            () -> RecoveryPhrase.decode(String.join(" ", words)));
        assertThrows(IllegalArgumentException.class,
            () -> RecoveryPhrase.decode("abandon ".repeat(24).trim()));
    }

    @Test public void recoverableStateRestoresAtomicallyPausedAndWithoutOldAuthority() throws Exception {
        Engine engine = new Engine(db);
        Engine.SkySelection selected = engine.selectSkyTool(Engine.RECIPE);
        String workId = engine.submit("backup-work", "{\"article\":\"owner data\"}", false, true);
        Engine.Ticket first = engine.claim("source-boot", 1, true);
        assertTrue(engine.finish(first, "passed", "first output", "source-boot", 2));
        Engine.Ticket second = engine.claim("source-boot", 3, true);
        assertTrue(engine.finish(second, "passed", "final output", "source-boot", 4));
        assertEquals("review", engine.work(workId).get("state"));

        ComponentManifest tool = tool(1, 1, 1);
        install("register:backup-tool", tool);
        String approval = store.proposeApproval("owner:alice", "approve:backup",
            tool.componentId, "clean.write", PAYLOAD, 100, 10_000, 10);
        store.confirmApproval("owner:alice", approval, 11);
        byte[] plaintext = store.exportRecoverableState("owner:alice");

        JdbcDatabase restoredDb = new JdbcDatabase(temp.newFile("restored.db").getPath());
        try {
            Engine restoredEngine = new Engine(restoredDb);
            PlatformStore restoredStore = new PlatformStore(restoredDb);
            PlatformStore.RestoreSummary summary = restoredStore.restoreRecoverableState(
                plaintext, "owner:alice", 100);
            assertEquals(1, summary.works);
            assertEquals(0, summary.ledgerEntries);
            assertEquals(1, summary.stoppedApprovals);
            assertTrue(restoredEngine.paused());
            assertEquals("review", restoredEngine.work(workId).get("state"));
            assertEquals("final output", restoredEngine.result(workId));
            assertNotEquals(selected.token, restoredEngine.skySelection().token);
            assertEquals(selected.revision + 1, restoredEngine.skySelection().revision);
            assertEquals("STOPPED", restoredStore.approval("owner:alice", approval).get("state"));
            assertTrue(restoredStore.components().isEmpty());

            assertThrows(IllegalStateException.class,
                () -> restoredStore.restoreRecoverableState(plaintext, "owner:alice", 101));
            assertEquals(1, restoredEngine.list().size());
            assertEquals("final output", restoredEngine.result(workId));
        } finally {
            restoredDb.close();
        }
    }

    @Test public void backupIsOwnerScopedVersionedAndEncryptedBeforeStorage() throws Exception {
        install("register:provider", provider());
        store.recordProviderReceipt("owner:alice", "income:alice", "org.rockstar.provider.cash",
            100, "USD", "provider:alice:1", Engine.digest("alice receipt"), 10);
        store.recordProviderReceipt("owner:bob", "income:bob", "org.rockstar.provider.cash",
            200, "USD", "provider:bob:1", Engine.digest("bob receipt"), 11);
        byte[] alice = store.exportBackup("owner:alice");
        String raw = new String(alice, StandardCharsets.ISO_8859_1);
        assertTrue(raw.contains("owner:alice"));
        assertFalse(raw.contains("owner:bob"));
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey key = generator.generateKey();
        assertArrayEquals(alice, EncryptedBackup.open(EncryptedBackup.seal(alice, key, new SecureRandom()), key));
    }

    @Test public void auditEventsNeverContainPayloadOrReceiptBodies() {
        install("register:provider", provider());
        store.recordProviderReceipt("owner:alice", "income:1", "org.rockstar.provider.cash",
            100, "USD", "provider:tx:1", Engine.digest("SECRET_RECEIPT_BODY"), 10);
        String events = store.events().toString();
        assertFalse(events.contains("SECRET_RECEIPT_BODY"));
        assertFalse(events.contains(PAYLOAD));
    }
}
