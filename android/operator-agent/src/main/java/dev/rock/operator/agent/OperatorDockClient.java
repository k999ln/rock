package dev.rock.operator.agent;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

final class OperatorDockClient {
    private static final int MAX_RESPONSE_BYTES = 262_144;
    private final OperatorAgentConfig config;
    private final DeviceIdentity identity;

    OperatorDockClient(OperatorAgentConfig config, DeviceIdentity identity) {
        this.config = config;
        this.identity = identity;
    }

    JSONArray poll() throws Exception {
        JSONObject response = post("/api/device/v1/poll", new JSONObject().put("operation", "poll"));
        if (!"ok".equals(response.optString("status")))
            throw new IllegalStateException("Dock poll was not accepted");
        return response.getJSONArray("commands");
    }

    void acknowledge(String commandId) throws Exception {
        JSONObject response = post("/api/device/v1/ack",
                new JSONObject().put("operation", "ack").put("commandId", commandId));
        if (!"acknowledged".equals(response.optString("status"))
                || !commandId.equals(response.optString("commandId")))
            throw new IllegalStateException("Dock acknowledgement mismatch");
    }

    void result(String commandId, String status, String resultCode, JSONObject details) throws Exception {
        JSONObject response = post("/api/device/v1/result", new JSONObject()
                .put("operation", "result").put("commandId", commandId)
                .put("status", status).put("resultCode", resultCode).put("details", details));
        if (!status.equals(response.optString("status"))
                || !commandId.equals(response.optString("commandId")))
            throw new IllegalStateException("Dock result mismatch");
    }

    private JSONObject post(String path, JSONObject body) throws Exception {
        if (!config.isConfigured()) throw new IllegalStateException("Operator agent is dormant");
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        String deviceId = identity.deviceId();
        String timestamp = Long.toString(System.currentTimeMillis());
        String nonce = identity.newNonce();
        String bodyHash = OperatorCommandVerifier.encode(OperatorCommandVerifier.sha256(bytes));
        byte[] canonical = canonicalRequest(path, deviceId, timestamp, nonce, bodyHash);
        URL url = new URL(config.dockOrigin + path);
        HttpURLConnection raw = (HttpURLConnection) url.openConnection();
        if (!(raw instanceof HttpsURLConnection))
            throw new SecurityException("Operator Dock requires HTTPS");
        HttpsURLConnection connection = (HttpsURLConnection) raw;
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(bytes.length);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("X-Avocado-Device-Id", deviceId);
        connection.setRequestProperty("X-Avocado-Device-Timestamp", timestamp);
        connection.setRequestProperty("X-Avocado-Device-Nonce", nonce);
        connection.setRequestProperty("X-Avocado-Device-Signature",
                OperatorCommandVerifier.encode(identity.sign(canonical)));
        try {
            try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300)
                throw new IllegalStateException("Operator Dock rejected request: " + status);
            String type = connection.getHeaderField("Content-Type");
            if (type == null || !type.toLowerCase(java.util.Locale.ROOT).startsWith("application/json"))
                throw new IllegalStateException("Operator Dock response type rejected");
            try (InputStream input = connection.getInputStream()) {
                return new JSONObject(new String(readBounded(input), StandardCharsets.UTF_8));
            }
        } finally {
            connection.disconnect();
        }
    }

    private static byte[] canonicalRequest(String path, String deviceId, String timestamp,
                                           String nonce, String bodyHash) {
        String value = "avocadoOS-device-request/1\n" + field("method", "POST")
                + field("path", path) + field("deviceId", deviceId)
                + field("timestamp", timestamp) + field("nonce", nonce)
                + field("bodySha256", bodyHash);
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private static String field(String name, String value) {
        return name + ":" + value.getBytes(StandardCharsets.UTF_8).length + ":" + value + "\n";
    }

    private static byte[] readBounded(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            if (output.size() + read > MAX_RESPONSE_BYTES)
                throw new IllegalStateException("Operator Dock response too large");
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }
}
