package dev.rock.core.platform;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Queue;
import org.junit.Test;
import static org.junit.Assert.*;

public final class RockstarDeviceAuthorizationFlowTest {
    private static final String ORIGIN = "https://rockstar.example";
    private static final String USER_CODE = "ABCDEFGH";
    private static final String DEVICE_CODE = "rock_device_" + "A".repeat(43);
    private static final String TOKEN = "rock_session_" + "B".repeat(43);
    private static final long NOW = 1_800_000_000_000L;

    private static final class FakeHttp implements RockstarDeviceAuthorizationFlow.HttpTransport {
        final Queue<Map<String,Object>> responses = new ArrayDeque<>();
        final ArrayList<Map<String,Object>> requests = new ArrayList<>();
        String origin = ORIGIN;
        @Override public String serviceOrigin() { return origin; }
        @Override public Map<String,Object> post(String path, Map<String,Object> json) throws IOException {
            assertEquals(RockstarDeviceAuthorizationFlow.AUTHORIZATION_PATH, path);
            requests.add(new LinkedHashMap<>(json));
            if (responses.isEmpty()) throw new IOException("NO_FIXTURE_RESPONSE");
            return responses.remove();
        }
    }

    private static final class FakeVault implements RockstarDeviceAuthorizationFlow.SessionStore {
        String token;
        String ownerUserId;
        long expiresAt;
        int saves;
        @Override public void save(String accessToken, long expiration, String ownerId) {
            token = accessToken; expiresAt = expiration; ownerUserId = ownerId; saves++;
        }
    }

    @Test public void browserApprovalAndOneTimePollingStoresTheSessionOnce() throws Exception {
        FakeHttp http = new FakeHttp(); FakeVault vault = new FakeVault();
        http.responses.add(beginResponse(600, 5));
        RockstarDeviceAuthorizationFlow flow = new RockstarDeviceAuthorizationFlow(http, vault);
        RockstarDeviceAuthorizationFlow.DeviceAuthorization link = flow.begin("Rockstar Pixel", NOW);
        assertEquals(USER_CODE, link.userCode);
        assertEquals(ORIGIN + "/connect/device?user_code=" + USER_CODE, link.verificationUriComplete);
        assertEquals("begin", http.requests.get(0).get("action"));
        assertEquals("Rockstar Pixel", http.requests.get(0).get("deviceName"));

        http.responses.add(status("authorization_pending"));
        RockstarDeviceAuthorizationFlow.PollResult pending = flow.poll(link, NOW);
        assertEquals(RockstarDeviceAuthorizationFlow.PollState.AUTHORIZATION_PENDING, pending.state);
        assertEquals(NOW + 5_000, pending.nextPollAt);
        try { flow.poll(link, NOW + 4_999); fail("poll interval must be enforced locally"); }
        catch (IllegalStateException expected) { assertEquals("DEVICE_AUTH_POLL_TOO_EARLY", expected.getMessage()); }

        http.responses.add(authorized(TOKEN, NOW + 90L * 24 * 60 * 60_000L));
        RockstarDeviceAuthorizationFlow.PollResult accepted = flow.poll(link, NOW + 5_000);
        assertEquals(RockstarDeviceAuthorizationFlow.PollState.AUTHORIZED, accepted.state);
        assertEquals(TOKEN, vault.token);
        assertEquals("account:alice", vault.ownerUserId);
        assertEquals(1, vault.saves);
        try { flow.poll(link, NOW + 10_000); fail("completed authorization cannot be replayed"); }
        catch (IllegalStateException expected) { assertEquals("DEVICE_AUTHORIZATION_FINISHED", expected.getMessage()); }
        assertEquals(3, http.requests.size());
    }

    @Test public void denialExpiryAndSlowDownAreHandledWithoutSavingCredentials() throws Exception {
        FakeHttp http = new FakeHttp(); FakeVault vault = new FakeVault();
        http.responses.add(beginResponse(600, 5));
        RockstarDeviceAuthorizationFlow flow = new RockstarDeviceAuthorizationFlow(http, vault);
        RockstarDeviceAuthorizationFlow.DeviceAuthorization denied = flow.begin("Rockstar Tablet", NOW);
        http.responses.add(status("access_denied"));
        assertEquals(RockstarDeviceAuthorizationFlow.PollState.DENIED,
            flow.poll(denied, NOW).state);
        assertEquals(0, vault.saves);

        http.responses.add(beginResponse(600, 5));
        RockstarDeviceAuthorizationFlow.DeviceAuthorization slow = flow.begin("Rockstar Tablet", NOW + 1);
        http.responses.add(status("slow_down"));
        RockstarDeviceAuthorizationFlow.PollResult backoff = flow.poll(slow, NOW + 1);
        assertEquals(RockstarDeviceAuthorizationFlow.PollState.SLOW_DOWN, backoff.state);
        assertEquals(10, backoff.intervalSeconds);
        assertEquals(NOW + 10_001, backoff.nextPollAt);
        assertEquals(0, vault.saves);

        assertEquals(RockstarDeviceAuthorizationFlow.PollState.EXPIRED,
            flow.poll(slow, slow.expiresAt).state);
    }

    @Test public void invalidOriginCodesAndSessionTokensFailClosed() throws Exception {
        FakeHttp http = new FakeHttp(); FakeVault vault = new FakeVault();
        http.responses.add(beginResponse(600, 5));
        RockstarDeviceAuthorizationFlow flow = new RockstarDeviceAuthorizationFlow(http, vault);
        http.origin = "https://attacker.example";
        try { flow.begin("Rockstar Tablet", NOW); fail("foreign origin must be rejected"); }
        catch (IOException expected) { assertEquals("DEVICE_AUTH_VERIFICATION_URI_INVALID", expected.getMessage()); }

        http.origin = ORIGIN;
        http.responses.add(beginResponse(600, 5, "BAD-CODE"));
        try { flow.begin("Rockstar Tablet", NOW); fail("invalid user code must be rejected"); }
        catch (IOException expected) { assertEquals("DEVICE_AUTH_RESPONSE_INVALID", expected.getMessage()); }

        http.responses.add(beginResponse(600, 5));
        RockstarDeviceAuthorizationFlow.DeviceAuthorization link = flow.begin("Rockstar Tablet", NOW);
        http.responses.add(authorized("not-a-session-token", NOW + 60_000));
        try { flow.poll(link, NOW); fail("invalid bearer must never enter protected storage"); }
        catch (IOException expected) { assertEquals("DEVICE_AUTH_SESSION_INVALID", expected.getMessage()); }
        assertEquals(0, vault.saves);
    }

    private static Map<String,Object> beginResponse(long expiresIn, long interval) {
        return beginResponse(expiresIn, interval, USER_CODE);
    }

    private static Map<String,Object> beginResponse(long expiresIn, long interval, String userCode) {
        Map<String,Object> result = new LinkedHashMap<>();
        result.put("deviceCode", DEVICE_CODE); result.put("userCode", userCode);
        result.put("expiresIn", expiresIn); result.put("interval", interval);
        result.put("verificationUri", ORIGIN + "/connect/device");
        result.put("verificationUriComplete", ORIGIN + "/connect/device?user_code=" + userCode);
        return result;
    }

    private static Map<String,Object> status(String value) {
        Map<String,Object> result = new LinkedHashMap<>(); result.put("status", value); return result;
    }

    private static Map<String,Object> authorized(String token, long expiresAt) {
        Map<String,Object> result = status("authorized");
        result.put("accessToken", token); result.put("expiresAt", expiresAt);
        result.put("ownerUserId", "account:alice"); return result;
    }
}
