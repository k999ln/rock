package dev.rock.automation;

import android.util.AtomicFile;
import java.io.File;
import org.junit.Test;
import static dev.rock.automation.RockstarServiceOrigin.canonicalOrigin;
import static org.junit.Assert.*;

/** Origin identity policy only; these checks never connect, persist or request a key. */
public final class RockstarServiceOriginTest {
    @Test public void canonicalizesHttpsCasePortAndRootPath() {
        for (String input : new String[] { "https://rockstar.example", "HTTPS://ROCKSTAR.EXAMPLE",
                "https://rockstar.example/", "https://rockstar.example:443/" }) {
            assertEquals("https://rockstar.example", canonicalOrigin(input));
            assertEquals("https://rockstar.example",
                new AndroidRockstarDeviceAuthorizationTransport(input).serviceOrigin());
            new AndroidRockstarDeviceHomeTransport(input, ignored -> {},
                url -> { throw new AssertionError("network not expected"); }, () -> false);
        }
    }

    @Test public void missingOriginRetainsRequiredError() {
        for (String input : new String[] { null, "" })
            assertEquals("ROCKSTAR_SERVICE_ORIGIN_REQUIRED",
                assertThrows(IllegalArgumentException.class, () -> canonicalOrigin(input)).getMessage());
    }

    @Test public void rejectsNonOriginAndInsecureUrlsWithoutHttpFixtureExceptions() {
        for (String input : new String[] { "http://localhost", "http://127.0.0.1", "ftp://rockstar.example",
                "rockstar.example", "//rockstar.example", "https:///", " https://rockstar.example",
                "https://user:password@rockstar.example", "https://rockstar.example?", "https://rockstar.example#",
                "https://rockstar.example/api", "https://rockstar.example//", "https://rockstar.example:8443",
                "https://rockstar.example:80", "https://rockstar.example/%2f" })
            assertEquals(input, "ROCKSTAR_SERVICE_ORIGIN_INVALID",
                assertThrows(IllegalArgumentException.class, () -> canonicalOrigin(input)).getMessage());
    }

    @Test public void uriSyntaxFailureKeepsItsCauseWhilePolicyRejectionDoesNot() {
        IllegalArgumentException syntax = assertThrows(IllegalArgumentException.class,
            () -> canonicalOrigin("https://rockstar.example/has space"));
        assertTrue(syntax.getCause() instanceof IllegalArgumentException);
        assertNull(assertThrows(IllegalArgumentException.class,
            () -> canonicalOrigin("http://rockstar.example")).getCause());
    }

    @Test public void exactOriginAndLengthChecksRemainSpecificToStorageAndAuthenticatedClients() {
        for (String input : new String[] { "HTTPS://ROCKSTAR.EXAMPLE", "https://rockstar.example/",
                "https://rockstar.example:443", "https://" + "a".repeat(250) + ".example" }) {
            assertNotNull(new AndroidRockstarDeviceAuthorizationTransport(input).serviceOrigin());
            assertEquals("DEVICE_SESSION_ORIGIN_INVALID", assertThrows(IllegalArgumentException.class,
                () -> new AndroidRockstarDeviceSessionStore(null, "dev.rock.automation", input,
                    () -> { throw new AssertionError("key not expected"); })).getMessage());
            assertEquals("A2A_BROKER_ORIGIN_INVALID", assertThrows(IllegalArgumentException.class,
                () -> new AndroidA2ABrokerDeviceTransport(input)).getMessage());
            assertEquals("A2A_WALLET_HANDOFF_CONFIGURATION_INVALID", assertThrows(IllegalArgumentException.class,
                () -> handoff(input)).getMessage());
        }
    }

    @Test public void canonicalHttpsFixtureHostsRemainAcceptedByAllClientsAndStorage() {
        for (String input : new String[] { "https://rockstar.example", "https://localhost",
                "https://127.0.0.1", "https://[::1]" }) {
            assertEquals(input, canonicalOrigin(input));
            assertEquals(input, new AndroidRockstarDeviceAuthorizationTransport(input).serviceOrigin());
            new AndroidRockstarDeviceHomeTransport(input, ignored -> {},
                url -> { throw new AssertionError("network not expected"); }, () -> false);
            new AndroidA2ABrokerDeviceTransport(input);
            handoff(input);
            new AndroidRockstarDeviceSessionStore(new AtomicFile(new File("unused-origin-fixture")),
                "dev.rock.automation", input, () -> { throw new AssertionError("key not expected"); });
        }
    }

    private static AndroidA2AWalletHandoffSource handoff(String origin) {
        return new AndroidA2AWalletHandoffSource(origin, "authority", "owner", "device", "key",
            bytes -> { throw new AssertionError("signature not expected"); });
    }
}
