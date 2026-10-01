package dev.rock.operator.agent;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;

final class SignedOperatorCommand {
    private static final Set<String> FIELDS = Set.of(
            "id", "deviceId", "incidentId", "action", "reason", "status",
            "issuedAt", "notBefore", "expiresAt", "operatorCredentialId",
            "authenticatorData", "clientDataJSON", "operatorSignature",
            "signedPayloadSha256");

    final String id;
    final String deviceId;
    final String incidentId;
    final String action;
    final String reason;
    final String status;
    final long issuedAt;
    final long notBefore;
    final long expiresAt;
    final String operatorCredentialId;
    final String authenticatorData;
    final String clientDataJSON;
    final String operatorSignature;
    final String signedPayloadSha256;

    private SignedOperatorCommand(JSONObject object) throws JSONException {
        requireExactFields(object);
        id = uuid(object.getString("id"));
        deviceId = uuid(object.getString("deviceId"));
        incidentId = bounded(object.getString("incidentId"), 3, 80);
        action = object.getString("action");
        reason = bounded(object.getString("reason"), 5, 240);
        status = object.getString("status");
        issuedAt = exactLong(object, "issuedAt");
        notBefore = exactLong(object, "notBefore");
        expiresAt = exactLong(object, "expiresAt");
        operatorCredentialId = object.getString("operatorCredentialId");
        authenticatorData = object.getString("authenticatorData");
        clientDataJSON = object.getString("clientDataJSON");
        operatorSignature = object.getString("operatorSignature");
        signedPayloadSha256 = object.getString("signedPayloadSha256");
        if (!incidentId.matches("[A-Za-z0-9][A-Za-z0-9._:-]*")
                || !OperatorAgentConfig.ACTIONS.contains(action)
                || !(status.equals("queued") || status.equals("scheduled")))
            throw new JSONException("Invalid command scope");
    }

    static SignedOperatorCommand parse(JSONObject object) throws JSONException {
        return new SignedOperatorCommand(object);
    }

    byte[] canonicalBytes() {
        String value = "avocadoOS-operator-command/1\n"
                + field("id", id) + field("deviceId", deviceId)
                + field("incidentId", incidentId) + field("action", action)
                + field("reason", reason) + field("issuedAt", Long.toString(issuedAt))
                + field("notBefore", Long.toString(notBefore))
                + field("expiresAt", Long.toString(expiresAt));
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private static String field(String name, String value) {
        return name + ":" + value.getBytes(StandardCharsets.UTF_8).length + ":" + value + "\n";
    }

    private static String uuid(String value) throws JSONException {
        try {
            if (!UUID.fromString(value).toString().equals(value)) throw new IllegalArgumentException();
            return value;
        } catch (IllegalArgumentException exception) {
            throw new JSONException("Invalid UUID");
        }
    }

    private static String bounded(String value, int minimum, int maximum) throws JSONException {
        if (!value.equals(value.trim()) || value.length() < minimum || value.length() > maximum)
            throw new JSONException("Invalid bounded string");
        return value;
    }

    private static long exactLong(JSONObject object, String name) throws JSONException {
        Object value = object.get(name);
        if (!(value instanceof Long) && !(value instanceof Integer))
            throw new JSONException("Invalid integer");
        return ((Number) value).longValue();
    }

    private static void requireExactFields(JSONObject object) throws JSONException {
        Set<String> actual = new HashSet<>();
        object.keys().forEachRemaining(actual::add);
        if (!actual.equals(FIELDS)) throw new JSONException("Unexpected command fields");
    }
}
