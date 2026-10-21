package dev.rock.automation;

import android.content.Context;
import android.util.AtomicFile;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.IOException;
import java.io.FileOutputStream;
import java.nio.file.Files;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class RockstarDeviceAccountLinkTest {
    private static final String ORIGIN = "https://rockstar.example";
    private static final String TOKEN = "rock_session_" + "A".repeat(43);
    private static final String OWNER = "account:rockstar-user-1";

    @Test public void configuredOriginIsAnExactHttpsOrigin() {
        assertEquals(ORIGIN, new AndroidRockstarDeviceAuthorizationTransport(ORIGIN).serviceOrigin());
        for (String invalid : new String[] { "http://rockstar.example", "https://user@rockstar.example",
                "https://rockstar.example/path", "https://rockstar.example:444", "https://rockstar.example/?x=1" }) {
            try { new AndroidRockstarDeviceAuthorizationTransport(invalid); fail("accepted " + invalid); }
            catch (IllegalArgumentException expected) { }
        }
    }

    @Test public void sessionIsEncryptedOriginBoundAndAvailableAfterBrokerRecreation() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        AndroidRockstarDeviceSessionStore first = new AndroidRockstarDeviceSessionStore(context, ORIGIN);
        first.clearLocal();
        long expiry = System.currentTimeMillis() + 60_000;
        first.save(TOKEN, expiry, OWNER);
        assertEquals("Bearer " + TOKEN, first.authorizationHeader());
        assertEquals(OWNER, first.ownerUserId());

        File file = new File(new File(context.getNoBackupFilesDir(), "account"),
            "rockstar-device-session-v2.bin");
        byte[] ciphertext = Files.readAllBytes(file.toPath());
        assertFalse(new String(ciphertext, java.nio.charset.StandardCharsets.ISO_8859_1).contains(TOKEN));
        assertEquals("Bearer " + TOKEN,
            new AndroidRockstarDeviceSessionStore(context, ORIGIN).authorizationHeader());
        assertEquals(OWNER, new AndroidRockstarDeviceSessionStore(context, ORIGIN).ownerUserId());

        try {
            new AndroidRockstarDeviceSessionStore(context, "https://other.example").authorizationHeader();
            fail("session must not be usable under a different service origin");
        } catch (IOException expected) { }
        assertFalse("origin mismatch must delete the unusable ciphertext", file.exists());
    }

    @Test public void revocationSurvivesBrokerRecreationAndOldReplyCannotDeleteNewLink() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        AndroidRockstarDeviceSessionStore first = new AndroidRockstarDeviceSessionStore(context, ORIGIN);
        first.clearLocal();
        try {
            first.save(TOKEN, System.currentTimeMillis() + 60_000, OWNER);
            AndroidRockstarDeviceSessionStore restarted = new AndroidRockstarDeviceSessionStore(context, ORIGIN);
            assertEquals("Bearer " + TOKEN, restarted.authorizationHeader());
            restarted.clearIfAuthorizationMatches("Bearer " + TOKEN);
            assertNull(new AndroidRockstarDeviceSessionStore(context, ORIGIN).authorizationHeader());
            assertEquals(0, first.activeExpiry());

            String nextToken = "rock_session_" + "B".repeat(43);
            restarted.save(nextToken, System.currentTimeMillis() + 60_000, OWNER);
            first.clearIfAuthorizationMatches("Bearer " + TOKEN);
            assertEquals("Bearer " + nextToken, restarted.authorizationHeader());
            first.clearIfAuthorizationMatches("Bearer " + nextToken);
            assertNull(new AndroidRockstarDeviceSessionStore(context, ORIGIN).ownerUserId());
        } finally { first.clearLocal(); }
    }

    @Test public void failedAtomicRenameCannotReportSuccessfulSessionSave() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File base = new File(context.getNoBackupFilesDir(), "session-commit-fixture-" + java.util.UUID.randomUUID());
        File blocker = new File(base, "rename-blocker");
        AtomicFile failing = new AtomicFile(base) {
            @Override public void finishWrite(FileOutputStream stream) {
                // Android AtomicFile logs this real rename failure and returns normally.
                assertTrue(base.mkdir());
                try { assertTrue(blocker.createNewFile()); }
                catch (IOException failure) { throw new AssertionError(failure); }
                super.finishWrite(stream);
            }
        };
        try {
            AndroidRockstarDeviceSessionStore store = new AndroidRockstarDeviceSessionStore(context, ORIGIN, failing);
            try {
                store.save(TOKEN, System.currentTimeMillis() + 60_000, OWNER);
                fail("uncommitted session must not be reported as saved");
            } catch (IOException expected) { }
            assertTrue("fixture must exercise the failed destination rename", blocker.isFile());
        } finally {
            blocker.delete();
            failing.delete();
        }
    }
}
