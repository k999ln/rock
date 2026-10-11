package dev.rock.automation;

import android.os.Looper;
import dev.rock.core.platform.RockstarDeviceAuthorizationFlow;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieHandler;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

/** Bounded HTTPS-only device-link transport. It never uses WebView cookies or follows redirects. */
final class AndroidRockstarDeviceAuthorizationTransport
        implements RockstarDeviceAuthorizationFlow.HttpTransport {
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 10_000;
    private static final long TOTAL_TIMEOUT_MS = 20_000L;
    private static final int MAX_REQUEST_BYTES = 2_048;
    private static final int MAX_RESPONSE_BYTES = 8_192;
    private static final String AUTH_PATH = RockstarDeviceAuthorizationFlow.AUTHORIZATION_PATH;
    private final String origin;

    AndroidRockstarDeviceAuthorizationTransport(String configuredOrigin) {
        this.origin = canonicalOrigin(configuredOrigin);
    }

    @Override public String serviceOrigin() { return origin; }

    @Override public Map<String,Object> post(String path, Map<String,Object> json) throws IOException {
        if (Looper.myLooper() == Looper.getMainLooper()) throw new IOException("DEVICE_AUTH_NETWORK_ON_MAIN_THREAD");
        if (!AUTH_PATH.equals(path))
            throw new IOException("DEVICE_AUTH_PATH_REJECTED");
        if (CookieHandler.getDefault() != null) throw new IOException("DEVICE_AUTH_COOKIE_HANDLER_UNSUPPORTED");
        final byte[] requestBytes;
        try {
            requestBytes = new JSONObject(json).toString().getBytes(StandardCharsets.UTF_8);
        } catch (RuntimeException invalid) {
            throw new IOException("DEVICE_AUTH_REQUEST_INVALID", invalid);
        }
        if (requestBytes.length == 0 || requestBytes.length > MAX_REQUEST_BYTES)
            throw new IOException("DEVICE_AUTH_REQUEST_TOO_LARGE");

        HttpURLConnection connection = null;
        byte[] responseBytes = null;
        try {
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
            if (status != 200 && status != 201)
                throw new IOException("DEVICE_AUTH_HTTP_" + status);
            AndroidJsonResponse.requireJsonHeaders(connection, "DEVICE_AUTH");
            try (InputStream input = connection.getInputStream()) {
                responseBytes = readBounded(input, MAX_RESPONSE_BYTES,
                    android.os.SystemClock.elapsedRealtime() + TOTAL_TIMEOUT_MS);
            }
            return parseFlatObject(responseBytes);
        } catch (JSONException | IllegalArgumentException invalid) {
            throw new IOException("DEVICE_AUTH_RESPONSE_INVALID", invalid);
        } finally {
            if (requestBytes.length > 0) java.util.Arrays.fill(requestBytes, (byte) 0);
            if (responseBytes != null) java.util.Arrays.fill(responseBytes, (byte) 0);
            if (connection != null) connection.disconnect();
        }
    }

    static String canonicalOrigin(String value) {
        if (value == null || value.isEmpty()) throw new IllegalArgumentException("ROCKSTAR_SERVICE_ORIGIN_REQUIRED");
        final URI uri;
        try { uri = URI.create(value); }
        catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("ROCKSTAR_SERVICE_ORIGIN_INVALID", invalid); }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null ||
                uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null ||
                (uri.getPort() != -1 && uri.getPort() != 443) ||
                (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath())))
            throw new IllegalArgumentException("ROCKSTAR_SERVICE_ORIGIN_INVALID");
        int port = uri.getPort();
        return "https://" + uri.getHost().toLowerCase(java.util.Locale.ROOT) +
            (port == -1 || port == 443 ? "" : ":" + port);
    }

    private static byte[] readBounded(InputStream input, int maximum, long deadlineElapsed) throws IOException {
        return AndroidJsonResponse.readBounded(input, maximum, deadlineElapsed,
            android.os.SystemClock::elapsedRealtime, "DEVICE_AUTH");
    }

    private static Map<String,Object> parseFlatObject(byte[] bytes) throws IOException, JSONException {
        try {
            String text = AndroidJsonResponse.decodeUtf8(bytes);
            JSONObject object = new JSONObject(text);
            Map<String,Object> result = new LinkedHashMap<>();
            Iterator<String> keys = object.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                Object value = object.get(key);
                if (value == JSONObject.NULL) result.put(key, null);
                else if (value instanceof String || value instanceof Number || value instanceof Boolean)
                    result.put(key, value);
                else throw new IOException("DEVICE_AUTH_RESPONSE_SHAPE_INVALID");
            }
            return result;
        } catch (CharacterCodingException malformed) {
            throw new IOException("DEVICE_AUTH_RESPONSE_UTF8_INVALID", malformed);
        }
    }
}
