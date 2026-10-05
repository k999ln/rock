package dev.rock.automation;

import android.os.SystemClock;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieHandler;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Authenticated, no-cache transport for the owner-scoped Broker device enrollment API. */
final class AndroidA2ABrokerDeviceTransport {
    private static final int CONNECT_TIMEOUT_MS = 8_000;
    private static final int READ_TIMEOUT_MS = 8_000;
    private static final long TOTAL_TIMEOUT_MS = 20_000L;
    private static final int MAX_REQUEST_BYTES = 256 * 1024;
    private static final int MAX_RESPONSE_BYTES = 32 * 1024;
    private static final String PATH = "/api/rockstar/broker-devices";
    private final String origin;

    AndroidA2ABrokerDeviceTransport(String configuredOrigin) {
        this.origin = AndroidRockstarDeviceAuthorizationTransport.canonicalOrigin(configuredOrigin);
        if (configuredOrigin == null || configuredOrigin.length() > 255 || !origin.equals(configuredOrigin))
            throw new IllegalArgumentException("A2A_BROKER_ORIGIN_INVALID");
    }

    JSONArray devices(String authorization) throws IOException {
        JSONObject response = request("GET", null, authorization);
        JSONArray devices = response.optJSONArray("devices");
        if (devices == null || response.length() != 1) throw new IOException("A2A_BROKER_DEVICE_LIST_INVALID");
        return devices;
    }

    JSONObject challenge(String authorization, String deviceRef) throws IOException {
        try { return request("POST", new JSONObject().put("action", "challenge")
            .put("deviceRef", deviceRef), authorization); }
        catch (JSONException invalid) { throw new IOException("A2A_BROKER_CHALLENGE_INVALID", invalid); }
    }

    JSONObject register(String authorization, String challengeId, String challengeNonce,
            JSONArray certificateChain) throws IOException {
        try { return request("POST", new JSONObject().put("action", "register")
            .put("challengeId", challengeId).put("challengeNonce", challengeNonce)
            .put("certificateChainDerBase64Url", certificateChain), authorization); }
        catch (JSONException invalid) { throw new IOException("A2A_BROKER_REGISTER_INVALID", invalid); }
    }

    JSONObject revoke(String authorization, String deviceRef, String keyId) throws IOException {
        try { return request("POST", new JSONObject().put("action", "revoke")
            .put("deviceRef", deviceRef).put("keyId", keyId), authorization); }
        catch (JSONException invalid) { throw new IOException("A2A_BROKER_REVOKE_INVALID", invalid); }
    }

    private JSONObject request(String method, JSONObject body, String authorization) throws IOException {
        if (authorization == null || !authorization.matches("Bearer rock_session_[A-Za-z0-9_-]{43}"))
            throw new IOException("A2A_BROKER_SESSION_REQUIRED");
        if (CookieHandler.getDefault() != null) throw new IOException("A2A_BROKER_COOKIE_HANDLER_UNSUPPORTED");
        byte[] requestBytes = null;
        byte[] responseBytes = null;
        HttpURLConnection connection = null;
        try {
            if (body != null) requestBytes = body.toString().getBytes(StandardCharsets.UTF_8);
            if (requestBytes != null && requestBytes.length > MAX_REQUEST_BYTES)
                throw new IOException("A2A_BROKER_REQUEST_TOO_LARGE");
            URL url = URI.create(origin + PATH).toURL();
            connection = (HttpsURLConnection) url.openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Authorization", authorization);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("Pragma", "no-cache");
            if (requestBytes != null) {
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(requestBytes.length);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream output = connection.getOutputStream()) { output.write(requestBytes); }
            }
            int status = connection.getResponseCode();
            boolean accepted = "GET".equals(method) ? status == 200
                : body != null && "challenge".equals(body.optString("action")) ? status == 201
                : body != null && "register".equals(body.optString("action")) ? status == 200 || status == 201
                : status == 200;
            if (!accepted) throw new IOException("A2A_BROKER_HTTP_" + status);
            String contentType = connection.getContentType();
            if (contentType == null || !"application/json".equalsIgnoreCase(contentType.split(";", 2)[0].trim()))
                throw new IOException("A2A_BROKER_CONTENT_TYPE_INVALID");
            String encoding = connection.getContentEncoding();
            if (encoding != null && !"identity".equalsIgnoreCase(encoding.trim()))
                throw new IOException("A2A_BROKER_CONTENT_ENCODING_INVALID");
            try (InputStream input = connection.getInputStream()) {
                responseBytes = readBounded(input, MAX_RESPONSE_BYTES,
                    SystemClock.elapsedRealtime() + TOTAL_TIMEOUT_MS);
            }
            String text = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(responseBytes)).toString();
            return new JSONObject(text);
        } catch (JSONException | CharacterCodingException | IllegalArgumentException invalid) {
            throw new IOException("A2A_BROKER_RESPONSE_INVALID", invalid);
        } finally {
            if (requestBytes != null) java.util.Arrays.fill(requestBytes, (byte) 0);
            if (responseBytes != null) java.util.Arrays.fill(responseBytes, (byte) 0);
            if (connection != null) connection.disconnect();
        }
    }

    private static byte[] readBounded(InputStream input, int maximum, long deadline) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[1_024];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (SystemClock.elapsedRealtime() >= deadline) throw new IOException("A2A_BROKER_RESPONSE_TIMEOUT");
            if (output.size() > maximum - count) throw new IOException("A2A_BROKER_RESPONSE_TOO_LARGE");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }
}
