package dev.rock.core.platform;

import java.io.IOException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Android-independent client protocol for linking one Rockstar account to one device.
 * The injected HTTP transport must use HTTPS to the configured service origin, reject
 * redirects, bound response sizes, and send no browser cookies. SessionStore must use
 * platform-protected storage; this class never persists the one-time codes.
 */
public final class RockstarDeviceAuthorizationFlow {
    public static final String AUTHORIZATION_PATH = "/api/rockstar/device-authorizations";
    private static final String USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final Pattern USER_CODE = Pattern.compile("[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}");
    private static final Pattern DEVICE_CODE = Pattern.compile("rock_device_[A-Za-z0-9_-]{43}");
    private static final Pattern SESSION_TOKEN = Pattern.compile("rock_session_[A-Za-z0-9_-]{43}");
    private static final long MAX_LINK_LIFETIME_MS = 15 * 60_000L;
    private static final long MAX_SESSION_LIFETIME_MS = 90L * 24 * 60 * 60_000L;

    public interface HttpTransport {
        /** Canonical service origin, for example https://rockstar.example. */
        String serviceOrigin();
        /** POST JSON and return a parsed JSON object; implementations must enforce HTTPS. */
        Map<String,Object> post(String path, Map<String,Object> json) throws IOException;
    }

    public interface SessionStore {
        /** Store the opaque token with its expiry in Android Keystore-backed protected storage. */
        void save(String accessToken, long expiresAt, String ownerUserId) throws IOException;
    }

    public enum PollState { AUTHORIZATION_PENDING, SLOW_DOWN, DENIED, EXPIRED, AUTHORIZED }

    public static final class DeviceAuthorization {
        public final String userCode;
        public final String verificationUri;
        public final String verificationUriComplete;
        public final long expiresAt;
        public int intervalSeconds;
        private final String deviceCode;
        private long nextPollAt;
        private boolean finished;

        private DeviceAuthorization(String userCode, String verificationUri,
                String verificationUriComplete, String deviceCode, long expiresAt,
                int intervalSeconds, long nextPollAt) {
            this.userCode = userCode;
            this.verificationUri = verificationUri;
            this.verificationUriComplete = verificationUriComplete;
            this.deviceCode = deviceCode;
            this.expiresAt = expiresAt;
            this.intervalSeconds = intervalSeconds;
            this.nextPollAt = nextPollAt;
        }
    }

    public static final class PollResult {
        public final PollState state;
        public final long nextPollAt;
        public final int intervalSeconds;

        private PollResult(PollState state, long nextPollAt, int intervalSeconds) {
            this.state = state;
            this.nextPollAt = nextPollAt;
            this.intervalSeconds = intervalSeconds;
        }
    }

    private final HttpTransport http;
    private final SessionStore sessions;

    public RockstarDeviceAuthorizationFlow(HttpTransport http, SessionStore sessions) {
        if (http == null || sessions == null) throw new IllegalArgumentException("INVALID_DEVICE_AUTH_CLIENT");
        this.http = http;
        this.sessions = sessions;
    }

    public DeviceAuthorization begin(String deviceName, long now) throws IOException {
        if (deviceName == null || deviceName.trim().isEmpty() || deviceName.trim().length() > 64 ||
            hasControl(deviceName)) throw new IllegalArgumentException("DEVICE_NAME_INVALID");
        Map<String,Object> input = new LinkedHashMap<>();
        input.put("action", "begin");
        input.put("deviceName", deviceName.trim());
        Map<String,Object> response = http.post(AUTHORIZATION_PATH, input);
        exactKeys(response, "deviceCode", "userCode", "expiresIn", "interval",
            "verificationUri", "verificationUriComplete");
        String deviceCode = string(response, "deviceCode");
        String userCode = string(response, "userCode");
        long lifetimeSeconds = integer(response, "expiresIn");
        long interval = integer(response, "interval");
        String verify = string(response, "verificationUri");
        String complete = string(response, "verificationUriComplete");
        if (!DEVICE_CODE.matcher(deviceCode).matches() || !USER_CODE.matcher(userCode).matches() ||
            lifetimeSeconds < 60 || lifetimeSeconds * 1000L > MAX_LINK_LIFETIME_MS ||
            interval < 1 || interval > 60 || now <= 0 || now > Long.MAX_VALUE - lifetimeSeconds * 1000L)
            throw new IOException("DEVICE_AUTH_RESPONSE_INVALID");
        URI expected = uri(http.serviceOrigin());
        URI verifyUri = uri(verify);
        URI completeUri = uri(complete);
        if (!sameOrigin(expected, verifyUri) || !"/connect/device".equals(verifyUri.getPath()) ||
            verifyUri.getQuery() != null || verifyUri.getFragment() != null ||
            !sameOrigin(expected, completeUri) || !"/connect/device".equals(completeUri.getPath()) ||
            !("user_code=" + userCode).equals(completeUri.getQuery()) || completeUri.getFragment() != null)
            throw new IOException("DEVICE_AUTH_VERIFICATION_URI_INVALID");
        long expiresAt = now + lifetimeSeconds * 1000L;
        return new DeviceAuthorization(userCode, verify, complete, deviceCode,
            expiresAt, (int) interval, now);
    }

    public PollResult poll(DeviceAuthorization authorization, long now) throws IOException {
        if (authorization == null || authorization.finished)
            throw new IllegalStateException("DEVICE_AUTHORIZATION_FINISHED");
        if (now <= 0) throw new IllegalArgumentException("INVALID_DEVICE_AUTH_TIME");
        if (now >= authorization.expiresAt) {
            authorization.finished = true;
            return finish(PollState.EXPIRED, authorization);
        }
        if (now < authorization.nextPollAt)
            throw new IllegalStateException("DEVICE_AUTH_POLL_TOO_EARLY");

        Map<String,Object> input = new LinkedHashMap<>();
        input.put("action", "poll");
        input.put("deviceCode", authorization.deviceCode);
        Map<String,Object> response = http.post(AUTHORIZATION_PATH, input);
        String status = string(response, "status");
        if ("authorization_pending".equals(status)) {
            exactKeys(response, "status");
            authorization.nextPollAt = now + authorization.intervalSeconds * 1000L;
            return result(PollState.AUTHORIZATION_PENDING, authorization);
        }
        if ("slow_down".equals(status)) {
            exactKeys(response, "status");
            authorization.intervalSeconds = Math.min(60, authorization.intervalSeconds + 5);
            authorization.nextPollAt = now + authorization.intervalSeconds * 1000L;
            return result(PollState.SLOW_DOWN, authorization);
        }
        if ("access_denied".equals(status)) {
            exactKeys(response, "status"); authorization.finished = true;
            return finish(PollState.DENIED, authorization);
        }
        if ("expired_token".equals(status)) {
            exactKeys(response, "status"); authorization.finished = true;
            return finish(PollState.EXPIRED, authorization);
        }
        if (!"authorized".equals(status)) throw new IOException("DEVICE_AUTH_POLL_RESPONSE_INVALID");
        exactKeys(response, "status", "accessToken", "expiresAt", "ownerUserId");
        String token = string(response, "accessToken");
        long expiresAt = integer(response, "expiresAt");
        String ownerUserId = string(response, "ownerUserId");
        if (!SESSION_TOKEN.matcher(token).matches() || expiresAt <= now ||
            expiresAt - now > MAX_SESSION_LIFETIME_MS || !validOwnerId(ownerUserId))
            throw new IOException("DEVICE_AUTH_SESSION_INVALID");
        sessions.save(token, expiresAt, ownerUserId);
        authorization.finished = true;
        return finish(PollState.AUTHORIZED, authorization);
    }

    private static PollResult finish(PollState state, DeviceAuthorization authorization) {
        return result(state, authorization);
    }

    private static PollResult result(PollState state, DeviceAuthorization authorization) {
        return new PollResult(state, authorization.nextPollAt, authorization.intervalSeconds);
    }

    private static URI uri(String value) throws IOException {
        try {
            URI uri = URI.create(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null ||
                uri.getUserInfo() != null || uri.getPort() != -1 && uri.getPort() != 443)
                throw new IOException("DEVICE_AUTH_URI_INVALID");
            return uri;
        } catch (IllegalArgumentException invalid) {
            throw new IOException("DEVICE_AUTH_URI_INVALID", invalid);
        }
    }

    private static boolean sameOrigin(URI left, URI right) {
        return left.getScheme().equalsIgnoreCase(right.getScheme()) &&
            left.getHost().equalsIgnoreCase(right.getHost()) &&
            effectivePort(left) == effectivePort(right);
    }

    private static int effectivePort(URI uri) {
        return uri.getPort() == -1 ? 443 : uri.getPort();
    }

    private static void exactKeys(Map<String,Object> value, String... expected) throws IOException {
        if (value == null || value.size() != expected.length)
            throw new IOException("DEVICE_AUTH_RESPONSE_INVALID");
        for (String key : expected) if (!value.containsKey(key))
            throw new IOException("DEVICE_AUTH_RESPONSE_INVALID");
    }

    private static String string(Map<String,Object> value, String key) throws IOException {
        Object item = value == null ? null : value.get(key);
        if (!(item instanceof String)) throw new IOException("DEVICE_AUTH_RESPONSE_INVALID");
        return (String) item;
    }

    private static long integer(Map<String,Object> value, String key) throws IOException {
        Object item = value == null ? null : value.get(key);
        if (!(item instanceof Number)) throw new IOException("DEVICE_AUTH_RESPONSE_INVALID");
        double number = ((Number) item).doubleValue();
        long integer = ((Number) item).longValue();
        if (!Double.isFinite(number) || number != integer) throw new IOException("DEVICE_AUTH_RESPONSE_INVALID");
        return integer;
    }

    private static boolean hasControl(String value) {
        for (int index = 0; index < value.length(); index++) {
            int code = value.charAt(index);
            if (code < 32 || code == 127) return true;
        }
        return false;
    }

    private static boolean validOwnerId(String value) {
        if (value == null || value.isEmpty() || value.length() > 256) return false;
        for (int index = 0; index < value.length(); index++) {
            int code = value.charAt(index);
            if (code < 32 || code == 127) return false;
        }
        return true;
    }
}
