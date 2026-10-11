package dev.rock.automation;

import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

/** Real AES-GCM session codec and files; the platform key and atomic-file faults are injected. */
public final class AndroidRockstarDeviceSessionStoreTest {
    private static final String ORIGIN = "https://rockstar.example";
    private static final String TOKEN = "rock_session_" + "A".repeat(43);
    private static final String NEXT = "rock_session_" + "B".repeat(43);
    private static final String OWNER = "account:fixture";
    private static final SecretKey KEY = new SecretKeySpec(new byte[32], "AES");
    @Rule public TemporaryFolder directory = new TemporaryFolder();

    @Test public void encryptedSessionSurvivesStoreRecreationThenRevocationAllowsFreshLink() throws Exception {
        File base = new File(directory.getRoot(), "session");
        AndroidRockstarDeviceSessionStore first = store(new DiskFile(base));
        first.save(TOKEN, expiry(), OWNER);
        assertFalse(new String(Files.readAllBytes(base.toPath()), StandardCharsets.ISO_8859_1).contains(TOKEN));
        AndroidRockstarDeviceSessionStore restarted = store(new DiskFile(base));
        assertEquals("Bearer " + TOKEN, restarted.authorizationHeader());
        assertEquals(OWNER, restarted.ownerUserId());
        rejectThroughHome(restarted, "Bearer " + TOKEN);
        assertEquals(0, first.activeExpiry());
        assertNull(store(new DiskFile(base)).authorizationHeader());
        restarted.save(NEXT, expiry(), OWNER);
        rejectThroughHome(first, "Bearer " + TOKEN);
        assertEquals("Bearer " + NEXT, restarted.authorizationHeader());
    }

    @Test public void silentCommitFailureCannotReportASavedSession() throws Exception {
        File base = new File(directory.getRoot(), "uncommitted");
        DiskFile file = new DiskFile(base);
        file.dropCommit = true;
        try { store(file).save(TOKEN, expiry(), OWNER); fail("failed rename must not become linked"); }
        catch (IOException expected) { }
        assertFalse(base.exists());
        assertNull(store(new DiskFile(base)).authorizationHeader());
    }

    @Test public void failedDeletionDoesNotPretendTheSessionWasCleared() throws Exception {
        DiskFile file = new DiskFile(new File(directory.getRoot(), "undeleted"));
        AndroidRockstarDeviceSessionStore store = store(file);
        store.save(TOKEN, expiry(), OWNER);
        file.dropDelete = true;
        try { store.clearIfAuthorizationMatches("Bearer " + TOKEN); fail(); }
        catch (IOException expected) { assertEquals("DEVICE_SESSION_DELETE_UNCONFIRMED", expected.getMessage()); }
        assertEquals("Bearer " + TOKEN, store.authorizationHeader());
    }

    @Test public void separateStoreInstancesCannotOverwriteAnExistingAccount() throws Exception {
        File base = new File(directory.getRoot(), "existing");
        AndroidRockstarDeviceSessionStore first = store(new DiskFile(base));
        AndroidRockstarDeviceSessionStore second = store(new DiskFile(base));
        first.save(TOKEN, expiry(), OWNER);
        try { second.save(NEXT, expiry(), "account:other"); fail(); }
        catch (IOException expected) { assertEquals("DEVICE_SESSION_ALREADY_LINKED", expected.getMessage()); }
        assertEquals("Bearer " + TOKEN, second.authorizationHeader());
        assertEquals(OWNER, second.ownerUserId());
    }

    @Test public void temporarilyUnavailableKeyDoesNotDestroyTheSavedAccount() throws Exception {
        File base = new File(directory.getRoot(), "locked");
        store(new DiskFile(base)).save(TOKEN, expiry(), OWNER);
        byte[] saved = Files.readAllBytes(base.toPath());
        AndroidRockstarDeviceSessionStore locked = unavailableKeyStore(base);
        try { locked.authorizationHeader(); fail("unavailable key must not authorize a request"); }
        catch (IOException expected) { assertEquals("DEVICE_SESSION_READ_FAILED", expected.getMessage()); }
        assertTrue("temporary key failure must preserve ciphertext", base.isFile());
        assertArrayEquals(saved, Files.readAllBytes(base.toPath()));
        AndroidRockstarDeviceSessionStore unlocked = store(new DiskFile(base));
        assertEquals("Bearer " + TOKEN, unlocked.authorizationHeader());
        assertEquals(OWNER, unlocked.ownerUserId());
        assertTrue(unlocked.activeExpiry() > System.currentTimeMillis());
    }

    @Test public void temporarilyUnreadableFileDoesNotTurnIntoAnUnlinkedAccount() throws Exception {
        DiskFile file = new DiskFile(new File(directory.getRoot(), "unreadable"));
        store(file).save(TOKEN, expiry(), OWNER);
        byte[] saved = Files.readAllBytes(file.base.toPath());
        for (IOException unavailable : new IOException[] {
                new IOException("fixture read unavailable"), new java.io.EOFException("fixture incomplete read") }) {
            file.readFailure = unavailable;
            try { store(file).ownerUserId(); fail(); }
            catch (IOException expected) { assertSame(unavailable, expected); }
            assertTrue("read failure must preserve ciphertext", file.base.isFile());
            assertArrayEquals(saved, Files.readAllBytes(file.base.toPath()));
        }
        file.readFailure = null;
        assertEquals(OWNER, store(file).ownerUserId());
    }

    @Test public void saveCannotReplaceAnAccountWhoseKeyIsTemporarilyUnavailable() throws Exception {
        File base = new File(directory.getRoot(), "locked-save");
        store(new DiskFile(base)).save(TOKEN, expiry(), OWNER);
        byte[] saved = Files.readAllBytes(base.toPath());
        try { unavailableKeyStore(base).save(NEXT, expiry(), "account:other"); fail(); }
        catch (IOException expected) { }
        assertTrue("failed account replacement must preserve the old account", base.isFile());
        assertArrayEquals(saved, Files.readAllBytes(base.toPath()));
        AndroidRockstarDeviceSessionStore unlocked = store(new DiskFile(base));
        try { unlocked.save(NEXT, expiry(), "account:other"); fail(); }
        catch (IOException expected) { assertEquals("DEVICE_SESSION_ALREADY_LINKED", expected.getMessage()); }
        assertEquals("Bearer " + TOKEN, unlocked.authorizationHeader());
        assertEquals(OWNER, unlocked.ownerUserId());
    }

    @Test public void failedRevocationReadMustNotClaimSuccessfulLocalDeletion() throws Exception {
        File base = new File(directory.getRoot(), "locked-revocation");
        store(new DiskFile(base)).save(TOKEN, expiry(), OWNER);
        byte[] saved = Files.readAllBytes(base.toPath());
        try { rejectThroughHome(unavailableKeyStore(base), "Bearer " + TOKEN); fail(); }
        catch (IOException expected) {
            assertFalse(expected instanceof AndroidRockstarDeviceHomeTransport.SessionRejectedException);
            assertEquals("DEVICE_SESSION_READ_FAILED", expected.getMessage());
        }
        assertTrue("failed comparison must not delete the stored session", base.isFile());
        assertArrayEquals(saved, Files.readAllBytes(base.toPath()));
        AndroidRockstarDeviceSessionStore unlocked = store(new DiskFile(base));
        rejectThroughHome(unlocked, "Bearer " + TOKEN);
        assertNull(unlocked.authorizationHeader());
    }

    @Test public void corruptOrWrongOriginCiphertextStillFailsClosedAndIsDiscarded() throws Exception {
        for (String corruption : new String[] { "tag", "truncated", "format", "origin" }) {
            File base = new File(directory.getRoot(), corruption);
            store(new DiskFile(base)).save(TOKEN, expiry(), OWNER);
            byte[] encrypted = Files.readAllBytes(base.toPath());
            if (corruption.equals("tag")) encrypted[encrypted.length - 1] ^= 1;
            if (corruption.equals("truncated")) encrypted = java.util.Arrays.copyOf(encrypted, 3);
            if (corruption.equals("format")) encrypted[2] ^= 1;
            Files.write(base.toPath(), encrypted);
            AndroidRockstarDeviceSessionStore reader = new AndroidRockstarDeviceSessionStore(
                new DiskFile(base), "dev.rock.automation", corruption.equals("origin") ? "https://other.example" : ORIGIN, () -> KEY);
            try { reader.authorizationHeader(); fail("accepted " + corruption); }
            catch (IOException expected) { }
            assertFalse("discard " + corruption, base.exists());
            assertNull(store(new DiskFile(base)).authorizationHeader());
        }
    }

    @Test public void permanentlyInvalidatedKeyStillRequiresFreshAccountLink() throws Exception {
        File base = new File(directory.getRoot(), "invalidated-key");
        store(new DiskFile(base)).save(TOKEN, expiry(), OWNER);
        AndroidRockstarDeviceSessionStore invalidated = new AndroidRockstarDeviceSessionStore(
            new DiskFile(base), "dev.rock.automation", ORIGIN,
            () -> { throw new android.security.keystore.KeyPermanentlyInvalidatedException(); });
        try { invalidated.authorizationHeader(); fail(); }
        catch (IOException expected) { }
        assertFalse(base.exists());
        assertNull(store(new DiskFile(base)).authorizationHeader());
    }

    @Test public void revocationComparisonAndDeletionAreAtomicAcrossStoreInstances() throws Exception {
        File base = new File(directory.getRoot(), "concurrent");
        AndroidRockstarDeviceSessionStore first = store(new DiskFile(base));
        first.save(TOKEN, expiry(), OWNER);
        java.util.concurrent.CountDownLatch reading = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch replacing = new java.util.concurrent.CountDownLatch(1);
        AndroidRockstarDeviceSessionStore rejecting = new AndroidRockstarDeviceSessionStore(
            new DiskFile(base), "dev.rock.automation", ORIGIN, () -> {
                reading.countDown();
                if (!release.await(5, java.util.concurrent.TimeUnit.SECONDS)) throw new IOException("fixture timeout");
                return KEY;
            });
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            java.util.concurrent.Future<?> revoke = pool.submit(() -> {
                rejecting.clearIfAuthorizationMatches("Bearer " + TOKEN); return null;
            });
            assertTrue(reading.await(5, java.util.concurrent.TimeUnit.SECONDS));
            java.util.concurrent.Future<?> replace = pool.submit(() -> {
                replacing.countDown(); first.clearLocal(); first.save(NEXT, expiry(), "account:other"); return null;
            });
            assertTrue(replacing.await(5, java.util.concurrent.TimeUnit.SECONDS));
            try {
                replace.get(100, java.util.concurrent.TimeUnit.MILLISECONDS);
                fail("new store must wait until the old-token comparison/delete completes");
            } catch (java.util.concurrent.TimeoutException expected) { }
            release.countDown();
            revoke.get(5, java.util.concurrent.TimeUnit.SECONDS);
            replace.get(5, java.util.concurrent.TimeUnit.SECONDS);
            assertEquals("Bearer " + NEXT, first.authorizationHeader());
            assertEquals("account:other", first.ownerUserId());
        } finally {
            release.countDown(); pool.shutdownNow();
            assertTrue(pool.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS));
        }
    }

    private static long expiry() { return System.currentTimeMillis() + 60_000; }
    private static void rejectThroughHome(AndroidRockstarDeviceSessionStore store, String authorization) throws Exception {
        AndroidRockstarDeviceHomeTransport transport = new AndroidRockstarDeviceHomeTransport(
            ORIGIN, store::clearIfAuthorizationMatches,
            url -> {
                try { return new AndroidRockstarDeviceHomeTransportTest.Reply(401); }
                catch (Exception failure) { throw new IOException(failure); }
            }, () -> false);
        try { transport.get(AndroidRockstarDeviceHomeTransport.PATH, authorization); fail(); }
        catch (AndroidRockstarDeviceHomeTransport.SessionRejectedException expected) { }
    }
    private static AndroidRockstarDeviceSessionStore store(DiskFile file) {
        return new AndroidRockstarDeviceSessionStore(file, "dev.rock.automation", ORIGIN, () -> KEY);
    }
    private static AndroidRockstarDeviceSessionStore unavailableKeyStore(File base) {
        return new AndroidRockstarDeviceSessionStore(new DiskFile(base), "dev.rock.automation", ORIGIN,
            () -> { throw new java.security.InvalidKeyException("fixture: device locked"); });
    }

    private static final class DiskFile extends AtomicFile {
        private final File base;
        private final File pending;
        boolean dropCommit, dropDelete;
        IOException readFailure;
        DiskFile(File base) { super(base); this.base = base; pending = new File(base + ".new"); }
        @Override public File getBaseFile() { return base; }
        @Override public FileOutputStream startWrite() throws IOException { return new FileOutputStream(pending); }
        @Override public void finishWrite(FileOutputStream output) {
            try {
                output.close();
                if (!dropCommit) Files.move(pending.toPath(), base.toPath(), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException failure) { throw new AssertionError(failure); }
        }
        @Override public void failWrite(FileOutputStream output) {
            try { output.close(); } catch (IOException ignored) { }
            pending.delete();
        }
        @Override public byte[] readFully() throws IOException {
            if (readFailure != null) throw readFailure;
            return Files.readAllBytes(base.toPath());
        }
        @Override public void delete() { if (!dropDelete) { base.delete(); pending.delete(); } }
    }
}
