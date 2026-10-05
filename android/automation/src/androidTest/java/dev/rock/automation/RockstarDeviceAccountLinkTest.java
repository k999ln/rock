package dev.rock.automation;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.IOException;
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
}
