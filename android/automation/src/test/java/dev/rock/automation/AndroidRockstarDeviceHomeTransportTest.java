package dev.rock.automation;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URL;
import java.security.cert.Certificate;
import java.util.ArrayList;
import java.util.List;
import javax.net.ssl.HttpsURLConnection;
import org.junit.Test;
import static org.junit.Assert.*;

/** Real adapter, synthetic HTTPS replies; no provider, account, or Android runtime is contacted. */
public final class AndroidRockstarDeviceHomeTransportTest {
    private static final String ORIGIN = "https://rockstar.example";
    private static final String AUTH = "Bearer rock_session_" + "A".repeat(43);

    @Test public void rejectedHomeSessionIsInvalidatedBeforeReturningToCaller() throws Exception {
        List<String> rejected = new ArrayList<>();
        Reply reply = new Reply(401);
        AndroidRockstarDeviceHomeTransport transport = transport(reply, rejected);
        try {
            transport.get(AndroidRockstarDeviceHomeTransport.PATH, AUTH);
            fail("revoked session must not return a home");
        } catch (AndroidRockstarDeviceHomeTransport.SessionRejectedException expected) {
            assertEquals(List.of(AUTH), rejected);
        }
        assertTrue(reply.disconnected);
        assertEquals(AUTH, reply.getRequestProperty("Authorization"));
        assertFalse(reply.getInstanceFollowRedirects());
    }

    @Test public void rejectedPurchaseClaimInvalidatesSessionWithoutReplayingSubmission() throws Exception {
        List<String> rejected = new ArrayList<>();
        Reply reply = new Reply(401);
        String claim = "{\"claim\":{},\"claimCode\":\"rsk_" + "B".repeat(43) + "\"}";
        try {
            transport(reply, rejected).claimRockstarServiceEntitlement(AUTH, claim);
            fail("rejected account must not report registration");
        } catch (AndroidRockstarDeviceHomeTransport.SessionRejectedException expected) {
            assertEquals(List.of(AUTH), rejected);
        }
        assertEquals(1, reply.requests);
        assertEquals("POST", reply.getRequestMethod());
        assertTrue(reply.disconnected);
    }

    @Test public void forbiddenUnavailableAndRedirectResponsesDoNotEraseAccountLink() throws Exception {
        for (int status : new int[] { 302, 403, 429, 500, 503 }) {
            List<String> rejected = new ArrayList<>();
            Reply reply = new Reply(status);
            try { transport(reply, rejected).get(AndroidRockstarDeviceHomeTransport.PATH, AUTH); fail(); }
            catch (IOException expected) { assertFalse(expected instanceof AndroidRockstarDeviceHomeTransport.SessionRejectedException); }
            assertTrue("HTTP " + status, rejected.isEmpty());
            assertEquals(1, reply.requests);
            assertTrue(reply.disconnected);
        }
    }

    @Test public void networkFailureDoesNotEraseAccountLink() throws Exception {
        List<String> rejected = new ArrayList<>();
        AndroidRockstarDeviceHomeTransport transport = new AndroidRockstarDeviceHomeTransport(
            ORIGIN, rejected::add, url -> { throw new IOException("offline"); }, () -> false);
        try { transport.get(AndroidRockstarDeviceHomeTransport.PATH, AUTH); fail(); }
        catch (IOException expected) { assertEquals("offline", expected.getMessage()); }
        assertTrue(rejected.isEmpty());
    }

    @Test public void deletionFailureIsNotPresentedAsSuccessfulRevocation() throws Exception {
        Reply reply = new Reply(401);
        AndroidRockstarDeviceHomeTransport transport = new AndroidRockstarDeviceHomeTransport(
            ORIGIN, authorization -> { throw new IOException("DEVICE_SESSION_DELETE_UNCONFIRMED"); },
            url -> reply, () -> false);
        try { transport.get(AndroidRockstarDeviceHomeTransport.PATH, AUTH); fail(); }
        catch (IOException expected) { assertEquals("DEVICE_SESSION_DELETE_UNCONFIRMED", expected.getMessage()); }
        assertTrue(reply.disconnected);
    }

    private static AndroidRockstarDeviceHomeTransport transport(Reply reply, List<String> rejected) {
        return new AndroidRockstarDeviceHomeTransport(ORIGIN, rejected::add, url -> reply, () -> false);
    }

    static final class Reply extends HttpsURLConnection {
        private final int status;
        boolean disconnected;
        int requests;
        Reply(int status) throws Exception { super(new URL(ORIGIN)); this.status = status; }
        @Override public int getResponseCode() { requests++; return status; }
        @Override public OutputStream getOutputStream() { return new ByteArrayOutputStream(); }
        @Override public void disconnect() { disconnected = true; }
        @Override public boolean usingProxy() { return false; }
        @Override public void connect() { }
        @Override public String getCipherSuite() { return "fixture"; }
        @Override public Certificate[] getLocalCertificates() { return null; }
        @Override public Certificate[] getServerCertificates() { return null; }
    }
}
