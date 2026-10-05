package dev.rock.automation;

import android.os.Looper;
import android.os.SystemClock;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.CookieHandler;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** Exact-origin, owner-authenticated transport for device home, task status and explicit task actions. */
final class AndroidRockstarDeviceHomeTransport {
    static final String PATH = "/api/rockstar/device-home";
    private static final int MAX_RESPONSE_BYTES = 64_000;
    private final String origin;

    AndroidRockstarDeviceHomeTransport(String configuredOrigin) {
        origin = AndroidRockstarDeviceAuthorizationTransport.canonicalOrigin(configuredOrigin);
    }

    String get(String path, String authorization) throws IOException {
        if (Looper.myLooper() == Looper.getMainLooper()) throw new IOException("DEVICE_HOME_NETWORK_ON_MAIN_THREAD");
        if (!allowedPath(path)) throw new IOException("DEVICE_HOME_PATH_REJECTED");
        if (authorization == null || !authorization.matches("Bearer rock_session_[A-Za-z0-9_-]{43}"))
            throw new IOException("DEVICE_HOME_SESSION_REQUIRED");
        if (CookieHandler.getDefault() != null) throw new IOException("DEVICE_HOME_COOKIE_HANDLER_UNSUPPORTED");
        HttpURLConnection connection = null;
        byte[] responseBytes = null;
        try {
            URL url = URI.create(origin + path).toURL();
            connection = (HttpsURLConnection) url.openConnection();
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("Authorization", authorization);
            connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("Pragma", "no-cache");
            int status = connection.getResponseCode();
            if (status != 200) throw new IOException("DEVICE_HOME_HTTP_" + status);
            String contentType = connection.getContentType();
            if (contentType == null || !"application/json".equalsIgnoreCase(contentType.split(";", 2)[0].trim()))
                throw new IOException("DEVICE_HOME_CONTENT_TYPE_INVALID");
            String encoding = connection.getContentEncoding();
            if (encoding != null && !"identity".equalsIgnoreCase(encoding.trim()))
                throw new IOException("DEVICE_HOME_CONTENT_ENCODING_INVALID");
            try (InputStream input = connection.getInputStream()) {
                responseBytes = readBounded(input, MAX_RESPONSE_BYTES, SystemClock.elapsedRealtime() + 20_000L);
            }
            String response;
            try {
                response = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(responseBytes)).toString();
            } catch (CharacterCodingException malformed) {
                throw new IOException("DEVICE_HOME_UTF8_INVALID", malformed);
            }
            JSONObject root = new JSONObject(response);
            if (PATH.equals(path) && !"rockstar-device-home/1".equals(root.optString("schema")))
                throw new IOException("DEVICE_HOME_SCHEMA_INVALID");
            return response;
        } catch (org.json.JSONException | IllegalArgumentException invalid) {
            throw new IOException("DEVICE_HOME_RESPONSE_INVALID", invalid);
        } finally {
            if (responseBytes != null) java.util.Arrays.fill(responseBytes, (byte) 0);
            if (connection != null) connection.disconnect();
        }
    }

    String taskDetailPath(String kind, String id) throws IOException {
        if ("llm".equals(kind) && id != null && id.matches("[A-Za-z0-9._:-]{1,128}"))
            return "/api/llm/quotes/" + id;
        if ("agent-status".equals(kind) && validUuid(id))
            return "/api/sky/a2a-delegations/" + id;
        if ("agent-result".equals(kind) && validUuid(id))
            return "/api/sky/a2a-delegations/" + id + "/artifacts";
        throw new IOException("DEVICE_HOME_TASK_REFERENCE_REJECTED");
    }

    String a2aAgentsPath() { return "/api/sky/a2a-agents"; }

    JSONObject claimRockstarServiceEntitlement(String authorization, String packageJson) throws IOException {
        if (packageJson == null) throw new IOException("ENTITLEMENT_PACKAGE_INVALID");
        byte[] packageBytes = packageJson.getBytes(StandardCharsets.UTF_8);
        try {
            if (packageBytes.length == 0 || packageBytes.length > 16_384)
                throw new IOException("ENTITLEMENT_PACKAGE_SIZE_INVALID");
            JSONObject envelope = new JSONObject(packageJson);
            if (envelope.length() != 2 || !envelope.has("claim") || !envelope.has("claimCode"))
                throw new IOException("ENTITLEMENT_PACKAGE_SHAPE_INVALID");
            JSONObject claim = envelope.optJSONObject("claim");
            String claimCode = envelope.optString("claimCode", "");
            if (claim == null || !claimCode.matches("rsk_[A-Za-z0-9_-]{32,96}"))
                throw new IOException("ENTITLEMENT_PACKAGE_SHAPE_INVALID");
            JSONObject response = postJson("/api/rockstar/entitlements", authorization,
                new JSONObject().put("claim", claim).put("claimCode", claimCode));
            JSONObject entitlement = response.optJSONObject("entitlement");
            if (entitlement == null || !entitlement.has("claimId") || !entitlement.has("status"))
                throw new IOException("ENTITLEMENT_RESPONSE_INVALID");
            return response;
        } catch (org.json.JSONException invalid) {
            throw new IOException("ENTITLEMENT_PACKAGE_INVALID", invalid);
        } finally {
            java.util.Arrays.fill(packageBytes, (byte) 0);
        }
    }

    JSONObject createA2ADelegation(String authorization, JSONObject draft) throws IOException {
        return postJson("/api/sky/a2a-delegations", authorization, draft);
    }

    JSONObject registerA2ABrokerAuthorization(String authorization, String delegationId,
            String message, JSONObject proof) throws IOException {
        if (!validUuid(delegationId) || message == null || message.trim().isEmpty() ||
                message.getBytes(StandardCharsets.UTF_8).length > 8_000 || proof == null)
            throw new IOException("A2A_BROKER_PROOF_INPUT_INVALID");
        try {
            JSONObject body = new JSONObject().put("message", message).put("proof", proof);
            return postJson("/api/sky/a2a-delegations/" + delegationId + "/broker-authorization",
                authorization, body);
        } catch (org.json.JSONException invalid) {
            throw new IOException("A2A_BROKER_PROOF_INPUT_INVALID", invalid);
        }
    }

    JSONObject approveA2ADelegation(String authorization, String delegationId,
            String message, String authorizationSha256) throws IOException {
        if (!validUuid(delegationId) || message == null || message.trim().isEmpty() ||
                message.getBytes(StandardCharsets.UTF_8).length > 8_000 || authorizationSha256 == null ||
                !authorizationSha256.matches("[a-f0-9]{64}"))
            throw new IOException("A2A_DELEGATION_APPROVAL_INPUT_INVALID");
        try {
            JSONObject body = new JSONObject().put("action", "approve")
                .put("message", message).put("authorizationSha256", authorizationSha256);
            return patchJson("/api/sky/a2a-delegations/" + delegationId, authorization, body);
        } catch (org.json.JSONException invalid) {
            throw new IOException("A2A_DELEGATION_APPROVAL_INPUT_INVALID", invalid);
        }
    }

    JSONObject cancelA2ADelegation(String authorization, String delegationId) throws IOException {
        if (!validUuid(delegationId)) throw new IOException("A2A_DELEGATION_CANCEL_INPUT_INVALID");
        try {
            return patchJson("/api/sky/a2a-delegations/" + delegationId, authorization,
                new JSONObject().put("action", "cancel"));
        } catch (org.json.JSONException invalid) {
            throw new IOException("A2A_DELEGATION_CANCEL_INPUT_INVALID", invalid);
        }
    }

    String recoverA2ADelegationPath(String parentJobId, String idempotencyKey, String inputSha256)
            throws IOException {
        if (!validUuid(parentJobId) || idempotencyKey == null ||
                !idempotencyKey.matches("[A-Za-z0-9._:-]{1,128}") || inputSha256 == null ||
                !inputSha256.matches("(?i)[a-f0-9]{64}"))
            throw new IOException("A2A_DELEGATION_RECOVERY_INPUT_INVALID");
        return "/api/sky/a2a-delegations?parentJobId=" + parentJobId +
            "&idempotencyKey=" + idempotencyKey + "&inputSha256=" + inputSha256;
    }

    JSONObject requestA2APriceQuote(String authorization, String agentId, String quoteRequestId,
            String message, String currency, long maximumBudgetMinor, long expiresAt,
            boolean consentToSharePromptForQuote) throws IOException {
        if (agentId == null || !agentId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}") ||
                quoteRequestId == null || !quoteRequestId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}") ||
                message == null || message.trim().isEmpty() || message.getBytes(StandardCharsets.UTF_8).length > 8_000 ||
                currency == null || !currency.matches("[A-Z]{3}") || maximumBudgetMinor < 1 || maximumBudgetMinor > 100_000_000 ||
                expiresAt <= System.currentTimeMillis() || expiresAt > System.currentTimeMillis() + 24L * 60 * 60_000L ||
                !consentToSharePromptForQuote)
            throw new IOException("A2A_PRICE_QUOTE_INPUT_INVALID");
        try {
            JSONObject body = new JSONObject();
            body.put("agentId", agentId);
            body.put("quoteRequestId", quoteRequestId);
            body.put("message", message);
            body.put("currency", currency);
            body.put("maximumBudgetMinor", maximumBudgetMinor);
            body.put("expiresAt", expiresAt);
            body.put("consentToSharePromptForQuote", true);
            JSONObject response = postJson("/api/sky/a2a-price-quotes", authorization, body);
            if (!response.optBoolean("quoteOnly") || response.optBoolean("executionAuthorized"))
                throw new IOException("A2A_PRICE_QUOTE_EXECUTION_STATE_INVALID");
            return response;
        } catch (org.json.JSONException invalid) {
            throw new IOException("A2A_PRICE_QUOTE_INPUT_INVALID", invalid);
        }
    }

    String prepareCloudLlmQuote(String authorization, String requestId, String parentJobId,
            String prompt, long maximumBudgetMinor, String currency, boolean saveResult) throws IOException {
        if (requestId == null || !requestId.matches("[A-Za-z0-9._:-]{1,128}") ||
                parentJobId == null || !parentJobId.matches("[A-Za-z0-9._:-]{1,128}") ||
                prompt == null || prompt.trim().isEmpty() || prompt.length() > 24_000 ||
                maximumBudgetMinor < 1 || currency == null || !currency.matches("[A-Z]{3}"))
            throw new IOException("DEVICE_LLM_QUOTE_INPUT_INVALID");
        final byte[] requestBytes;
        try {
            JSONObject body = new JSONObject();
            body.put("requestId", requestId);
            body.put("parentJobId", parentJobId);
            body.put("parentBudgetLimitMinor", maximumBudgetMinor);
            body.put("maximumBudgetMinor", maximumBudgetMinor);
            body.put("prompt", prompt);
            body.put("maxOutputTokens", 1_200);
            body.put("currency", currency);
            body.put("saveResult", saveResult);
            requestBytes = body.toString().getBytes(StandardCharsets.UTF_8);
        } catch (org.json.JSONException invalid) {
            throw new IOException("DEVICE_LLM_QUOTE_INPUT_INVALID", invalid);
        }
        if (requestBytes.length > 28_000) throw new IOException("DEVICE_LLM_QUOTE_TOO_LARGE");
        if (Looper.myLooper() == Looper.getMainLooper()) throw new IOException("DEVICE_HOME_NETWORK_ON_MAIN_THREAD");
        if (CookieHandler.getDefault() != null) throw new IOException("DEVICE_HOME_COOKIE_HANDLER_UNSUPPORTED");
        if (authorization == null || !authorization.matches("Bearer rock_session_[A-Za-z0-9_-]{43}"))
            throw new IOException("DEVICE_HOME_SESSION_REQUIRED");
        HttpURLConnection connection = null;
        byte[] responseBytes = null;
        try {
            connection = (HttpsURLConnection) URI.create(origin + "/api/llm/quotes").toURL().openConnection();
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(20_000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(requestBytes.length);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Authorization", authorization);
            connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("Pragma", "no-cache");
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(requestBytes); }
            int status = connection.getResponseCode();
            if (status != 200 && status != 201) throw new IOException("DEVICE_LLM_QUOTE_HTTP_" + status);
            String contentType = connection.getContentType();
            if (contentType == null || !"application/json".equalsIgnoreCase(contentType.split(";", 2)[0].trim()))
                throw new IOException("DEVICE_LLM_QUOTE_CONTENT_TYPE_INVALID");
            String encoding = connection.getContentEncoding();
            if (encoding != null && !"identity".equalsIgnoreCase(encoding.trim()))
                throw new IOException("DEVICE_LLM_QUOTE_CONTENT_ENCODING_INVALID");
            try (InputStream input = connection.getInputStream()) {
                responseBytes = readBounded(input, 24_000, SystemClock.elapsedRealtime() + 25_000L);
            }
            String response = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(responseBytes)).toString();
            JSONObject root = new JSONObject(response);
            if (root.optJSONObject("execution") == null || !root.has("executionAvailable"))
                throw new IOException("DEVICE_LLM_QUOTE_RESPONSE_INVALID");
            return response;
        } catch (org.json.JSONException | CharacterCodingException | IllegalArgumentException invalid) {
            throw new IOException("DEVICE_LLM_QUOTE_RESPONSE_INVALID", invalid);
        } finally {
            java.util.Arrays.fill(requestBytes, (byte) 0);
            if (responseBytes != null) java.util.Arrays.fill(responseBytes, (byte) 0);
            if (connection != null) connection.disconnect();
        }
    }

    String executeCloudLlmQuote(String authorization, String prompt, String quoteId,
            String approvalDigest, String model, int outputTokenLimit) throws IOException {
        if (prompt == null || prompt.trim().isEmpty() || prompt.length() > 24_000 ||
                quoteId == null || !quoteId.matches("[A-Za-z0-9._:-]{1,128}") ||
                approvalDigest == null || !approvalDigest.matches("[a-fA-F0-9]{64}") ||
                model == null || !model.matches("[A-Za-z0-9._:-]{1,120}") ||
                outputTokenLimit < 1 || outputTokenLimit > 8_000)
            throw new IOException("DEVICE_LLM_EXECUTION_INPUT_INVALID");
        try {
            JSONObject approval = new JSONObject();
            approval.put("action", "approve");
            approval.put("approvalDigest", approvalDigest);
            approval.put("consent", true);
            JSONObject reserved = postJson("/api/llm/quotes/" + quoteId, authorization, approval);
            JSONObject record = reserved.optJSONObject("execution");
            if (record == null || !"reserved".equals(record.optString("state")) &&
                    !"sending".equals(record.optString("state")) &&
                    !"completed".equals(record.optString("state")) &&
                    !"unreconciled".equals(record.optString("state")))
                throw new IOException("DEVICE_LLM_BUDGET_RESERVATION_UNCONFIRMED");
            JSONObject request = new JSONObject();
            request.put("provider", "openai");
            request.put("prompt", prompt);
            request.put("model", model);
            request.put("maxOutputTokens", outputTokenLimit);
            request.put("quoteId", quoteId);
            request.put("approvalDigest", approvalDigest);
            request.put("consent", true);
            try {
                JSONObject queued = postJson("/api/llm/text", authorization, request);
                JSONObject queue = queued.optJSONObject("queue");
                if (queue == null || !"accepted".equals(queue.optString("status")) || !queue.optBoolean("durable"))
                    throw new IOException("DEVICE_LLM_DURABLE_ACCEPTANCE_UNCONFIRMED");
                return queued.toString();
            } catch (IOException uncertain) {
                // The server cancels only quoted/reserved records. A sent/unknown request stays held.
                try {
                    JSONObject cancel = new JSONObject();
                    cancel.put("action", "cancel");
                    cancel.put("approvalDigest", approvalDigest);
                    cancel.put("consent", true);
                    postJson("/api/llm/quotes/" + quoteId, authorization, cancel);
                } catch (Exception ignored) { /* Keep the original ambiguous execution outcome. */ }
                throw uncertain;
            }
        } catch (org.json.JSONException invalid) {
            throw new IOException("DEVICE_LLM_EXECUTION_INPUT_INVALID", invalid);
        }
    }

    private JSONObject postJson(String path, String authorization, JSONObject body) throws IOException {
        return requestJson("POST", path, authorization, body);
    }

    private JSONObject patchJson(String path, String authorization, JSONObject body) throws IOException {
        return requestJson("PATCH", path, authorization, body);
    }

    private JSONObject requestJson(String method, String path, String authorization, JSONObject body) throws IOException {
        boolean allowed = "POST".equals(method) ? allowedPostPath(path) :
            "PATCH".equals(method) && allowedPatchPath(path);
        if (!allowed) throw new IOException("DEVICE_HOME_ACTION_PATH_REJECTED");
        if (Looper.myLooper() == Looper.getMainLooper()) throw new IOException("DEVICE_HOME_NETWORK_ON_MAIN_THREAD");
        if (CookieHandler.getDefault() != null) throw new IOException("DEVICE_HOME_COOKIE_HANDLER_UNSUPPORTED");
        if (authorization == null || !authorization.matches("Bearer rock_session_[A-Za-z0-9_-]{43}"))
            throw new IOException("DEVICE_HOME_SESSION_REQUIRED");
        final byte[] requestBytes = body.toString().getBytes(StandardCharsets.UTF_8);
        if (requestBytes.length == 0 || requestBytes.length > 28_000)
            throw new IOException("DEVICE_LLM_POST_TOO_LARGE");
        HttpURLConnection connection = null;
        byte[] responseBytes = null;
        try {
            connection = (HttpsURLConnection) URI.create(origin + path).toURL().openConnection();
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(120_000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestMethod(method);
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(requestBytes.length);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Authorization", authorization);
            connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("Pragma", "no-cache");
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(requestBytes); }
            int status = connection.getResponseCode();
            if (status != 200 && status != 201 && status != 202)
                throw new IOException("DEVICE_HOME_ACTION_HTTP_" + status);
            String contentType = connection.getContentType();
            if (contentType == null || !"application/json".equalsIgnoreCase(contentType.split(";", 2)[0].trim()))
                throw new IOException("DEVICE_LLM_POST_CONTENT_TYPE_INVALID");
            String encoding = connection.getContentEncoding();
            if (encoding != null && !"identity".equalsIgnoreCase(encoding.trim()))
                throw new IOException("DEVICE_LLM_POST_CONTENT_ENCODING_INVALID");
            try (InputStream input = connection.getInputStream()) {
                responseBytes = readBounded(input, MAX_RESPONSE_BYTES, SystemClock.elapsedRealtime() + 125_000L);
            }
            String response = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(responseBytes)).toString();
            return new JSONObject(response);
        } catch (org.json.JSONException | CharacterCodingException | IllegalArgumentException invalid) {
            throw new IOException("DEVICE_LLM_POST_RESPONSE_INVALID", invalid);
        } finally {
            java.util.Arrays.fill(requestBytes, (byte) 0);
            if (responseBytes != null) java.util.Arrays.fill(responseBytes, (byte) 0);
            if (connection != null) connection.disconnect();
        }
    }

    private static boolean allowedPath(String path) {
        return PATH.equals(path) ||
            "/api/sky/a2a-agents".equals(path) ||
            (path != null && path.matches("/api/sky/a2a-delegations\\?parentJobId=[0-9a-fA-F-]{36}&idempotencyKey=[A-Za-z0-9._:-]{1,128}&inputSha256=[a-fA-F0-9]{64}")) ||
            (path != null && path.matches("/api/llm/quotes/[A-Za-z0-9._:-]{1,128}")) ||
            (path != null && path.matches("/api/sky/a2a-delegations/[0-9a-fA-F-]{36}(?:/artifacts)?"));
    }

    private static boolean allowedPostPath(String path) {
        return "/api/rockstar/entitlements".equals(path) ||
            "/api/llm/quotes".equals(path) ||
            "/api/sky/a2a-price-quotes".equals(path) ||
            "/api/sky/a2a-delegations".equals(path) ||
            (path != null && path.matches("/api/llm/quotes/[A-Za-z0-9._:-]{1,128}")) ||
            (path != null && path.matches("/api/sky/a2a-delegations/[0-9a-fA-F-]{36}/broker-authorization")) ||
            "/api/llm/text".equals(path);
    }

    private static boolean allowedPatchPath(String path) {
        return path != null && path.matches("/api/sky/a2a-delegations/[0-9a-fA-F-]{36}");
    }

    private static boolean validUuid(String value) {
        return value != null && value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}");
    }

    private static byte[] readBounded(InputStream input, int maximum, long deadline) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[1_024];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (SystemClock.elapsedRealtime() >= deadline) throw new IOException("DEVICE_HOME_RESPONSE_TIMEOUT");
            if (output.size() > maximum - count) throw new IOException("DEVICE_HOME_RESPONSE_TOO_LARGE");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }
}
