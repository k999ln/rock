package dev.rock.automation;

import android.os.Looper;
import android.os.SystemClock;
import dev.rock.core.platform.A2AWalletHandoffRequest;
import dev.rock.core.platform.A2AWalletSettlementSync;
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
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * No-cache, device-key-authenticated HTTPS transport for a settled cloud A2A
 * receipt. Enrollment identity is injected only after the Broker key has been
 * registered by the server; this class does not establish trust or enrollment.
 */
final class AndroidA2AWalletHandoffSource
        implements A2AWalletSettlementSync.AuthenticatedHandoffSource {
    private static final int CONNECT_TIMEOUT_MS = 8_000;
    private static final int READ_TIMEOUT_MS = 8_000;
    private static final long TOTAL_TIMEOUT_MS = 20_000L;
    private static final int MAX_REQUEST_BYTES = 4_096;
    private static final int MAX_RESPONSE_BYTES = 32_768;
    private static final String PATH_PREFIX = "/api/sky/a2a-delegations/";
    private static final String PATH_SUFFIX = "/wallet-settlement";
    private static final java.util.regex.Pattern ID = java.util.regex.Pattern.compile(
        "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    private static final java.util.regex.Pattern SAFE_ID = java.util.regex.Pattern.compile(
        "[A-Za-z0-9._:-]{1,128}");

    private final String origin;
    private final String authorityId;
    private final String ownerUserId;
    private final String deviceRef;
    private final String keyId;
    private final A2AWalletHandoffRequest.Signer signer;

    AndroidA2AWalletHandoffSource(String configuredOrigin, String authorityId,
            String ownerUserId, String deviceRef, String keyId,
            A2AWalletHandoffRequest.Signer signer) {
        this.origin = AndroidRockstarDeviceAuthorizationTransport.canonicalOrigin(configuredOrigin);
        this.authorityId = safeIdentity(authorityId);
        this.ownerUserId = safeIdentity(ownerUserId);
        this.deviceRef = safeIdentity(deviceRef);
        this.keyId = safeIdentity(keyId);
        if (configuredOrigin == null || configuredOrigin.length() > 255 ||
                !origin.equals(configuredOrigin) || signer == null)
            throw new IllegalArgumentException("A2A_WALLET_HANDOFF_CONFIGURATION_INVALID");
        this.signer = signer;
    }

    @Override public Map<String,Object> fetch(String owner, String delegationId) throws IOException {
        if (Looper.myLooper() == Looper.getMainLooper())
            throw new IOException("A2A_WALLET_HANDOFF_NETWORK_ON_MAIN_THREAD");
        if (!ownerUserId.equals(owner) || delegationId == null || !ID.matcher(delegationId).matches())
            throw new IOException("A2A_WALLET_HANDOFF_SCOPE_REJECTED");
        if (CookieHandler.getDefault() != null)
            throw new IOException("A2A_WALLET_HANDOFF_COOKIE_HANDLER_UNSUPPORTED");

        long requestedAt = System.currentTimeMillis();
        final byte[] requestBytes;
        try {
            Map<String,Object> signed = A2AWalletHandoffRequest.create(
                authorityId, ownerUserId, deviceRef, delegationId, UUID.randomUUID().toString(),
                requestedAt, keyId, requestedAt, signer);
            requestBytes = new JSONObject(signed).toString().getBytes(StandardCharsets.UTF_8);
        } catch (RuntimeException invalid) {
            throw new IOException("A2A_WALLET_HANDOFF_REQUEST_INVALID", invalid);
        }
        if (requestBytes.length == 0 || requestBytes.length > MAX_REQUEST_BYTES) {
            java.util.Arrays.fill(requestBytes, (byte) 0);
            throw new IOException("A2A_WALLET_HANDOFF_REQUEST_TOO_LARGE");
        }

        HttpURLConnection connection = null;
        byte[] responseBytes = null;
        try {
            String path = PATH_PREFIX + delegationId + PATH_SUFFIX;
            URL url = URI.create(origin + path).toURL();
            connection = (HttpsURLConnection) url.openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(requestBytes.length);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("Pragma", "no-cache");
            try (OutputStream output = connection.getOutputStream()) { output.write(requestBytes); }
            int status = connection.getResponseCode();
            if (status != 200) throw new IOException("A2A_WALLET_HANDOFF_HTTP_" + status);
            String contentType = connection.getContentType();
            if (contentType == null || !"application/json".equalsIgnoreCase(
                    contentType.split(";", 2)[0].trim()))
                throw new IOException("A2A_WALLET_HANDOFF_CONTENT_TYPE_INVALID");
            String contentEncoding = connection.getContentEncoding();
            if (contentEncoding != null && !"identity".equalsIgnoreCase(contentEncoding.trim()))
                throw new IOException("A2A_WALLET_HANDOFF_CONTENT_ENCODING_INVALID");
            try (InputStream input = connection.getInputStream()) {
                responseBytes = readBounded(input, MAX_RESPONSE_BYTES,
                    SystemClock.elapsedRealtime() + TOTAL_TIMEOUT_MS);
            }
            return parseObject(responseBytes);
        } catch (JSONException | IllegalArgumentException invalid) {
            throw new IOException("A2A_WALLET_HANDOFF_RESPONSE_INVALID", invalid);
        } finally {
            java.util.Arrays.fill(requestBytes, (byte) 0);
            if (responseBytes != null) java.util.Arrays.fill(responseBytes, (byte) 0);
            if (connection != null) connection.disconnect();
        }
    }

    private static String safeIdentity(String value) {
        if (value == null || !SAFE_ID.matcher(value).matches())
            throw new IllegalArgumentException("A2A_WALLET_HANDOFF_IDENTITY_INVALID");
        return value;
    }

    private static byte[] readBounded(InputStream input, int maximum, long deadlineElapsed)
            throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[1_024];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (SystemClock.elapsedRealtime() >= deadlineElapsed)
                throw new IOException("A2A_WALLET_HANDOFF_RESPONSE_TIMEOUT");
            if (output.size() > maximum - count)
                throw new IOException("A2A_WALLET_HANDOFF_RESPONSE_TOO_LARGE");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private static Map<String,Object> parseObject(byte[] bytes) throws IOException, JSONException {
        try {
            String text = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes)).toString();
            return object(new JSONObject(text));
        } catch (CharacterCodingException malformed) {
            throw new IOException("A2A_WALLET_HANDOFF_RESPONSE_UTF8_INVALID", malformed);
        }
    }

    private static Map<String,Object> object(JSONObject value) throws JSONException, IOException {
        Map<String,Object> result = new LinkedHashMap<>();
        Iterator<String> keys = value.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            result.put(key, convert(value.get(key)));
        }
        return result;
    }

    private static Object convert(Object value) throws JSONException, IOException {
        if (value == JSONObject.NULL) return null;
        if (value instanceof JSONObject) return object((JSONObject) value);
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            List<Object> result = new ArrayList<>(array.length());
            for (int index = 0; index < array.length(); index++) result.add(convert(array.get(index)));
            return result;
        }
        if (value instanceof String || value instanceof Number || value instanceof Boolean) return value;
        throw new IOException("A2A_WALLET_HANDOFF_RESPONSE_SHAPE_INVALID");
    }
}
